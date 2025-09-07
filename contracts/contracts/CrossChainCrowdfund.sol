// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * CrossChainCrowdfund — Universal Contract for cross-chain donations
 * Uses ZetaChain Gateway pattern for cross-chain interactions
 * Updated for new gateway addresses and proper ABI encoding
 */

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IGatewayZEVM.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import {SwapHelperLib} from "@zetachain/toolkit/contracts/SwapHelperLib.sol";
import { RevertContext, RevertOptions } from "@zetachain/protocol-contracts/contracts/Revert.sol";
import { CallOptions } from "@zetachain/protocol-contracts/contracts/zevm/interfaces/IGatewayZEVM.sol";
import { MessageContext } from "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";

/*//////////////////////////////////////////////////////////////
                    Minimal interfaces / utils
//////////////////////////////////////////////////////////////*/

interface IWZETA {
  function deposit() external payable;
  function withdraw(uint256 amount) external;
}

interface IUniswapV2Router02 {
  function swapExactTokensForTokens(
    uint amountIn,
    uint amountOutMin,
    address[] calldata path,
    address to,
    uint deadline
  ) external returns (uint[] memory amounts);
  function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
  function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts);
}

interface IERC20Minimal {
  function transfer(address to, uint256 value) external returns (bool);
  function transferFrom(address from, address to, uint256 value) external returns (bool);
  function approve(address spender, uint256 value) external returns (bool);
  function balanceOf(address) external view returns (uint256);
  function allowance(address owner, address spender) external view returns (uint256);
}

/* ---- SafeERC20-lite (no OZ) ---- */
library SafeERC20Lite {
  function safeTransfer(IERC20Minimal t, address to, uint256 v) internal {
    (bool ok, bytes memory d) = address(t).call(abi.encodeWithSelector(t.transfer.selector, to, v));
    require(ok && (d.length == 0 || abi.decode(d, (bool))), "SAFE_TRANSFER_FAIL");
  }
  function safeTransferFrom(IERC20Minimal t, address f, address to, uint256 v) internal {
    (bool ok, bytes memory d) = address(t).call(abi.encodeWithSelector(t.transferFrom.selector, f, to, v));
    require(ok && (d.length == 0 || abi.decode(d, (bool))), "SAFE_TRANSFER_FROM_FAIL");
  }
  function safeApprove(IERC20Minimal t, address s, uint256 v) internal {
    (bool ok, bytes memory d) = address(t).call(abi.encodeWithSelector(t.approve.selector, s, v));
    require(ok && (d.length == 0 || abi.decode(d, (bool))), "SAFE_APPROVE_FAIL");
  }
}

/* ---- Ownable-lite ---- */
abstract contract OwnableLite {
  address public owner;
  event OwnershipTransferred(address indexed prev, address indexed next);
  modifier onlyOwner() { require(msg.sender == owner, "ONLY_OWNER"); _; }
  constructor() { owner = msg.sender; emit OwnershipTransferred(address(0), msg.sender); }
  function transferOwnership(address n) external onlyOwner {
    require(n != address(0), "ZERO_OWNER");
    emit OwnershipTransferred(owner, n);
    owner = n;
  }
}

/* ---- ReentrancyGuard-lite ---- */
abstract contract ReentrancyGuardLite {
  uint256 private _gs = 1;
  modifier nonReentrant() { require(_gs == 1, "REENTRANCY"); _gs = 2; _; _gs = 1; }
}

/*//////////////////////////////////////////////////////////////
                          Contract
//////////////////////////////////////////////////////////////*/

contract CrossChainCrowdfund is UniversalContract, OwnableLite, ReentrancyGuardLite {
  using SafeERC20Lite for IERC20Minimal;

  /*------------------------------- TYPES -------------------------------*/

  // Creator struct removed (redundant with Campaign info)

  struct Contribution {
    uint256 campaignId;
    address donor;
    address originalToken;   // inbound zrc20 or address(0) for native in donateNative()
    address zrc20Received;   // final token delivered to creator (WZETA)
    uint256 originalAmount;
    uint256 convertedAmount;
    uint256 originChainId;
    uint64  timestamp;
    string  originChainName;
  }

  struct Campaign {
    address creator;         // ZEVM address
    address preferredZRC20;  // any whitelisted token
    bool    active;
    // Optional cross-chain payout configuration
    address payoutAddress;   // Creator's address on destination chain (EVM). If zero, pay locally on ZEVM
    uint256 payoutGasLimit;  // Gas limit to use for withdrawAndCall/call. If zero, a sane default is used
  }

  /*------------------------------- EVENTS -------------------------------*/

  // Public business events
  event CampaignCreated(uint256 indexed campaignId, address indexed creator, address preferredZRC20);
  event ContributionReceived(
    uint256 indexed campaignId,
    address indexed donor,
    uint256 indexed contributionId,
    address originalToken,
    uint256 originalAmount,
    uint256 convertedAmount,
    string originChain,
    string donorName,
    string note
  );

  // DEBUG events (for tracing)
  event DebugToggle(bool enabled);
  event DebugOnCallEntered(bytes originSender, uint256 originChainId, address zrc20In, uint256 amount);
  event DebugDecodedDonate(uint256 campaignId, string donorName, string note);
  event DebugDonationBegin(uint256 campaignId, address creator, address tokenIn, uint256 amountIn);
  event DebugRouterSet(address router);
  event DebugRouterMissing();
  event DebugApproveReset(address token, uint256 amount);
  event DebugApprove(address token, uint256 amount);
  event DebugSwapPlanned(address tokenIn, address tokenOut, uint256 amountIn, uint256 pathLen);
  event DebugSwapSucceeded(uint256 amountOut);
  event DebugSwapFailed(string reason);
  event DebugSwapFailedBytes(bytes lowLevelData);
  event DebugTransferOut(address token, address to, uint256 amount);
  event DebugContributionRecorded(uint256 id);
  event DebugGasFee(address token, address gasToken, uint256 gasFee, uint256 gasLimit, uint256 haveBalance);
  event DebugGatewayWithdraw(address receiverToken, uint256 amount, bool withCall);
  event DebugOnRevert(address asset, uint256 amount, bytes revertMessage);

  /*------------------------------- ERRORS -------------------------------*/

  error NotCreator();
  error CampaignInactive();
  error InvalidToken();
  error InvalidCampaign();
  error AmountZero();
  error RouterNotSet();
  error OnlySystem();
  error UnknownAction();
  error PayoutTokenNotAllowed();
  error InsufficientForGas();

  /*------------------------------ STORAGE ------------------------------*/

  address public immutable gateway;

  mapping(uint256 => Campaign) public campaigns;
  mapping(uint256 => Contribution) public contributions;

  uint256 public nextCampaignId;
  uint256 public nextContributionId;

  // Token labeling
  mapping(address => string) public tokenLabel;
  
  address public immutable WZETA;
  address public immutable ethZRC20;
  address public immutable btcZRC20;
  address public immutable usdcZRC20;

  IUniswapV2Router02 public router;

  bool public debug = true;

  // Token allowlists
  mapping(address => bool) public allowedInTokens;
  mapping(address => bool) public allowedOutTokens;
  
  event AllowedInTokenSet(address token, bool allowed);
  event AllowedOutTokenSet(address token, bool allowed);

  function setAllowedInToken(address t, bool allowed) external onlyOwner {
    require(t != address(0), "ZERO_TOKEN");
    allowedInTokens[t] = allowed;
    emit AllowedInTokenSet(t, allowed);
  }

  function setAllowedOutToken(address t, bool allowed) external onlyOwner {
    require(t != address(0), "ZERO_TOKEN");
    allowedOutTokens[t] = allowed;
    emit AllowedOutTokenSet(t, allowed);
  }

  // Slippage configuration
  uint256 public slippageBps = 300; // 3.00% default
  event SlippageUpdated(uint256 bps);
  
  function setSlippageBps(uint256 bps) external onlyOwner {
    require(bps <= 2000, "SLIPPAGE_TOO_HIGH"); // cap at 20%
    slippageBps = bps;
    emit SlippageUpdated(bps);
  }

  /*---------------------------- CONSTRUCTOR ----------------------------*/
  constructor(
    address _gateway,
    address _wzeta,
    address _ethZRC20,
    address _btcZRC20,
    address _usdcZRC20
  ) {
    if (
      _gateway == address(0) ||
      _wzeta == address(0) ||
      _ethZRC20 == address(0) ||
      _btcZRC20 == address(0)
    ) revert InvalidToken();

    // Use the correct ZetaChain testnet gateway address
    gateway = _gateway; // Should be 0x6c533f7fe93fae114d0954697069df33c9b74fd7 for ZetaChain testnet
    WZETA = _wzeta;
    ethZRC20 = _ethZRC20;
    btcZRC20 = _btcZRC20;
    usdcZRC20 = _usdcZRC20;

    tokenLabel[_ethZRC20] = "zETH.Sepolia";
    tokenLabel[_btcZRC20] = "zBTC.Sepolia";
    if (_usdcZRC20 != address(0)) tokenLabel[_usdcZRC20] = "USDC.Sepolia";
    tokenLabel[_wzeta] = "WZETA";

    // Initialize token allowlists
    allowedInTokens[_wzeta] = true;
    allowedInTokens[_ethZRC20] = true;
    allowedInTokens[_btcZRC20] = true;
    if (_usdcZRC20 != address(0)) allowedInTokens[_usdcZRC20] = true;
    allowedOutTokens[_wzeta] = true;
    allowedOutTokens[_ethZRC20] = true;
    allowedOutTokens[_btcZRC20] = true;
    if (_usdcZRC20 != address(0)) allowedOutTokens[_usdcZRC20] = true;
  }

  function setTokenLabel(address token, string calldata label) external onlyOwner {
    tokenLabel[token] = label;
  }

  /*----------------------------- ADMIN SET -----------------------------*/

  function setUniswapRouter(address _router) external onlyOwner {
    if (_router == address(0)) revert InvalidToken();
    router = IUniswapV2Router02(_router);
    if (debug) emit DebugRouterSet(_router);
  }

  function setDebug(bool enabled) external onlyOwner {
    debug = enabled;
    emit DebugToggle(enabled);
  }

  /*--------------------------- UNIVERSAL ENTRY --------------------------*/
  
  modifier onlyGateway() {
    require(msg.sender == gateway, "OnlyGateway");
    _;
  }

  /**
   * @notice Universal Contract onCall function - receives cross-chain calls
   * @param context Message context from the gateway
   * @param zrc20 The ZRC-20 token address received
   * @param amount The amount of tokens received
   * @param message The ABI-encoded message data from depositAndCall
   */
  function onCall(
    MessageContext calldata context,
    address zrc20,
    uint256 amount,
    bytes calldata message
) external override {
    emit eh("onCall");

    // Payload: (campaignId, donorName, note, recipient)
    (string memory action, bytes memory data) = abi.decode(message, (string, bytes));
    uint256 campaignId;
    string memory donorName;
    string memory note;
    if (keccak256(bytes(action)) == keccak256("donate_native")) {
        // Step 2: decode the inner payload
        (campaignId, donorName, note) = abi.decode(data, (uint256, string, string));
        if (debug) emit DebugDecodedDonate(campaignId, donorName, note);

        // … now process donation …
    } else {
        revert("Unknown action");
    }

    

    Campaign storage campaign = campaigns[campaignId];
    if (campaign.creator == address(0)) revert InvalidCampaign();
    if (!campaign.active) revert CampaignInactive();

    address donorAddress = _deriveDonorAddress(context);

    if (debug) emit DebugDonationBegin(campaignId, campaign.creator, zrc20, amount);

    emit eh("before swap exact path");

    // Unified swap+payout
    uint256 finalAmount = _swapExactViaPath(zrc20, campaign.preferredZRC20, amount, campaignId);

    // Record contribution
    string memory chainName = _getChainName(context.chainID);
    uint256 id = ++nextContributionId;
    contributions[id] = Contribution({
        campaignId: campaignId,
        donor: donorAddress,
        originalToken: zrc20,
        zrc20Received: campaign.preferredZRC20,
        originalAmount: amount,
        convertedAmount: finalAmount,
        originChainId: context.chainID,
        timestamp: uint64(block.timestamp),
        originChainName: chainName
    });

    if (debug) emit DebugContributionRecorded(id);

    emit ContributionReceived(
        campaignId,
        donorAddress,
        id,
        zrc20,
        amount,
        finalAmount,
        chainName,
        donorName,
        note
    );
}

  /*------------------------- CAMPAIGN MANAGEMENT ------------------------*/

  // Allow any whitelisted payout token on creation
  function createCampaign(address preferredZRC20) external returns (uint256 campaignId) {
    if (preferredZRC20 == address(0)) revert InvalidToken();
    require(allowedOutTokens[preferredZRC20], "PAYOUT_TOKEN_NOT_ALLOWED");

    campaignId = ++nextCampaignId;

    // Creator tracking moved to campaigns mapping

    campaigns[campaignId] = Campaign({
      creator: msg.sender,
      preferredZRC20: preferredZRC20,
      active: true,
      payoutAddress: address(0),
      payoutGasLimit: 0
    });

    emit CampaignCreated(campaignId, msg.sender, preferredZRC20);
  }

  // Allow campaign creator to update payout token
  function updateCampaignPayoutToken(uint256 campaignId, address newToken) external {
    Campaign storage campaign = campaigns[campaignId];
    require(campaign.creator == msg.sender, "NOT_CREATOR");
    require(campaign.active, "CAMPAIGN_INACTIVE");
    require(allowedOutTokens[newToken], "PAYOUT_TOKEN_NOT_ALLOWED");

    campaign.preferredZRC20 = newToken;
    // No need to update separate creators mapping anymore

    emit CampaignCreated(campaignId, msg.sender, newToken); // Reuse event for simplicity
  }

  /// Configure destination for cross-chain payouts. If not set, payouts remain on ZEVM to creator address.
  function updateCampaignDestination(
    uint256 campaignId,
    address payoutAddress,
    uint256 payoutGasLimit
  ) external {
    Campaign storage campaign = campaigns[campaignId];
    require(campaign.creator == msg.sender, "NOT_CREATOR");
    require(campaign.active, "CAMPAIGN_INACTIVE");

    campaign.payoutAddress = payoutAddress; // zero clears cross-chain payout
    campaign.payoutGasLimit = payoutGasLimit; // zero means use default
  }

  /*--------------------------- DONATION HANDLING ------------------------*/

  function _handleDonation(
    MessageContext calldata ctx,
    address zrc20In,
    uint256 amount,
    uint256 campaignId,
    string memory donorName,
    string memory note
  ) internal {
    if (amount == 0) revert AmountZero();

    Campaign storage campaign = campaigns[campaignId];
    if (campaign.creator == address(0)) revert InvalidCampaign();
    if (!campaign.active) revert CampaignInactive();

    address donorAddress = _deriveDonorAddress(ctx);

    if (debug) emit DebugDonationBegin(campaignId, campaign.creator, zrc20In, amount);

    // Handle native coin deposits vs ZRC-20 token deposits
    uint256 amountOut;
    address tokenOut;
    address actualTokenIn;

    if (zrc20In == address(0)) {
        // This branch is no longer used, but keep for safety
        revert InvalidToken();
    } else {
        // Enforce inbound token allowlist
        require(allowedInTokens[zrc20In], "TOKEN_IN_NOT_ALLOWED");
        actualTokenIn = zrc20In;
        tokenOut = campaign.preferredZRC20;
        // Enforce outbound token allowlist (in case owner changed policy after campaign creation)
        require(allowedOutTokens[tokenOut], "PAYOUT_TOKEN_NOT_ALLOWED");
        _swapExactViaPath(actualTokenIn, tokenOut, amount, campaignId);
    }

    // Payout to creator: if cross-chain destination configured, withdraw via Gateway; otherwise transfer locally on ZEVM

    string memory chainName = _getChainName(ctx.chainID);

    uint256 id = ++nextContributionId;
    contributions[id] = Contribution({
      campaignId: campaignId,
      donor: donorAddress,
      originalToken: actualTokenIn,
      zrc20Received: tokenOut,
      originalAmount: amount,
      convertedAmount: amountOut,
      originChainId: ctx.chainID,
      timestamp: uint64(block.timestamp),
      originChainName: chainName
    });

    if (debug) emit DebugContributionRecorded(id);

    emit ContributionReceived(
      campaignId,
      donorAddress,
      id,
      actualTokenIn,
      amount,
      amountOut,
      chainName,
      donorName,
      note
    );
  }

  /// Accept native ZETA, wrap to WZETA, and forward immediately (no escrow)
  function donateNative(
    uint256 campaignId,
    string calldata donorName,
    string calldata note
  ) external payable nonReentrant {
    require(msg.value > 0, "NO_VALUE");

    Campaign storage c = campaigns[campaignId];
    if (c.creator == address(0)) revert InvalidCampaign();
    if (!c.active) revert CampaignInactive();

    // Use low-level call to WZETA deposit function
    (bool success, ) = WZETA.call{value: msg.value}(abi.encodeWithSignature("deposit()"));
    require(success, "WZETA_DEPOSIT_FAILED");

    // Enforce allowlists
    address tokenOut = c.preferredZRC20;
    require(allowedOutTokens[tokenOut], "PAYOUT_TOKEN_NOT_ALLOWED");
    uint256 converted = _swapExactViaPath(WZETA, tokenOut, msg.value, campaignId);
// payout or swap
    uint256 id = ++nextContributionId;
    contributions[id] = Contribution({
      campaignId: campaignId,
      donor: msg.sender,
      originalToken: address(0),
      zrc20Received: tokenOut,
      originalAmount: (msg.value),
      convertedAmount: converted,
      originChainId: block.chainid,
      timestamp: uint64(block.timestamp),
      originChainName: "ZetaChain"
    });

    if (debug) emit DebugContributionRecorded(id);

    emit ContributionReceived(
      campaignId,
      msg.sender,
      id,
      address(0),
      msg.value,
      converted,
      "ZetaChain",
      donorName,
      note
    );
  }

  /// Accept local ZRC-20 and forward (swap->WZETA->creator)
  function donateZRC20(
    address token,
    uint256 amount,
    uint256 campaignId,
    string calldata donorName,
    string calldata note
  ) external nonReentrant {
    require(amount > 0, "NO_AMOUNT");
    if (!allowedInTokens[token]) revert InvalidToken();

    Campaign storage c = campaigns[campaignId];
    if (c.creator == address(0)) revert InvalidCampaign();
    if (!c.active) revert CampaignInactive();

    IERC20Minimal(token).safeTransferFrom(msg.sender, address(this), amount);

    address tokenOut = c.preferredZRC20;
    require(allowedOutTokens[tokenOut], "PAYOUT_TOKEN_NOT_ALLOWED");
    uint256 converted = _swapExactViaPath(token, tokenOut, amount, campaignId);


    string memory chainName = bytes(tokenLabel[token]).length == 0
      ? "ZetaChain"
      : tokenLabel[token];

    uint256 id = ++nextContributionId;
    contributions[id] = Contribution({
      campaignId: campaignId,
      donor: msg.sender,
      originalToken: token,
      zrc20Received: tokenOut,
      originalAmount: amount,
      convertedAmount: converted,
      originChainId: block.chainid,
      timestamp: uint64(block.timestamp),
      originChainName: chainName
    });

    if (debug) emit DebugContributionRecorded(id);

    emit ContributionReceived(
      campaignId,
      msg.sender,
      id,
      token,
      amount,
      converted,
      chainName,
      donorName,
      note
    );
  }

  /*--------------------------- RESCUE FUNCTIONS --------------------------*/
  
  event Rescue(address indexed token, address indexed to, uint256 amount);
  
  function rescueToken(address token, address to, uint256 amount) external onlyOwner {
    IERC20Minimal(token).safeTransfer(to, amount);
    emit Rescue(token, to, amount);
  }

  function rescueNative(address to, uint256 amount) external onlyOwner {
    payable(to).transfer(amount);
    emit Rescue(address(0), to, amount);
  }
  event DebugInsufficientForGas(address tokenOut);
  /*------------------------------ SWAPPING ------------------------------*/
  function _getMinOut(
      address tokenIn,
      address tokenOut,
      uint256 amountIn
  ) internal view returns (uint256) {
      address[] memory path;

      if (tokenIn == WZETA || tokenOut == WZETA) {
          // Route through ZETA (unwrap WZETA internally for pricing)
          path = new address[](3);
          path[0] = tokenIn;
          path[1] = WZETA;
          path[2] = tokenOut;
      } else {
          // Direct pair
          path = new address[](2);
          path[0] = tokenIn;
          path[1] = tokenOut;
      }

      uint[] memory quotes = router.getAmountsOut(amountIn, path);
      uint256 expectedOut = quotes[quotes.length - 1];

      // Apply slippage tolerance
      return (expectedOut * (10_000 - slippageBps)) / 10_000;
  }


  event eh(string msg);
  
  function _swapExactViaPath(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 campaignId
  ) internal returns (uint256 amountOut) {
    emit eh("swapExactViaPath");

    if (tokenIn == tokenOut) return amountIn;
    if (address(router) == address(0)) {
      if (debug) emit DebugRouterMissing();
      revert RouterNotSet();
    }

    // Get quoted amount out
    

    if (debug) emit DebugApproveReset(tokenIn, 0);
    IERC20Minimal(tokenIn).safeApprove(address(router), 0);
    if (debug) emit DebugApprove(tokenIn, amountIn);
    IERC20Minimal(tokenIn).safeApprove(address(router), amountIn);

    uint256 minOut = _getMinOut(tokenIn, tokenOut, amountIn);
    if (debug) emit DebugSwapPlanned(tokenIn, tokenOut, amountIn, minOut);

  /*------------------------------ PAYOUT -------------------------------*/
    IZRC20 tokus = IZRC20(tokenOut);
    
    // Query the withdrawal gas fee from the token itself
    (address gasZRC20, uint256 gasFee) = tokus.withdrawGasFee();
    
    // Check if we have enough gas tokens
    uint256 gasBal = IERC20Minimal(gasZRC20).balanceOf(address(this));
    if (gasBal < gasFee) {
        // Calculate the amount of tokenOut needed to swap for the required gas
        uint256 need = gasFee - gasBal;
        uint256 cushion = (need * 105) / 100; // 5% buffer for slippage
        emit eh("before gas check");
        // Ensure we have enough of the converted token to swap for gas
        require(amountOut > cushion, "INSUFFICIENT_FOR_GAS_SWAP");
        
        // Approve the router to swap tokenOut for gasZRC20
        IERC20Minimal(tokenOut).safeApprove(address(router), 0);
        IERC20Minimal(tokenOut).safeApprove(address(router), cushion);

        // Swap a portion of the `tokenOut` to acquire the necessary gas
        uint256 minGas = _getMinOut(tokenOut, gasZRC20, cushion);
        
        emit eh("before swap");
        SwapHelperLib.swapExactTokensForTokens(
            address(router),
            tokenOut,
            cushion,
            gasZRC20,
            minGas
        );
        emit eh("after swap");
        // Reduce the payout amount by what was swapped for gas
        amountOut -= cushion; 
    }
    
    // Final check for sufficient gas before withdrawal
    require(IERC20Minimal(gasZRC20).balanceOf(address(this)) >= gasFee, "INSUFFICIENT_GAS_ZRC20");

    // Approve the Gateway to spend the gas fee
    // This is the key missing approval step in your previous logic
    IERC20Minimal(gasZRC20).safeApprove(address(gateway), gasFee);

    /*-------------------------- PERFORM WITHDRAWAL --------------------------*/
    // The previous approve was likely for the router, not the gateway.
    tokus.approve(address(gateway), amountOut);
    
    // Withdraw the remaining amount to the campaign's payout address
    // The gateway will take the gasFee from the approved gasZRC20
    emit eh("withraw!");
    tokus.withdraw(bytes(abi.encodePacked(campaigns[campaignId].payoutAddress)), amountOut);

    return amountOut;
  }

  /*------------------------------ VIEW FUNCTIONS -------------------------------*/

  struct CampaignInfo {
    uint256 campaignId;
    address creator;
    address preferredZRC20;
    bool active;
  }

  /**
   * @notice Get all synced campaigns - optimized view function for faster matching
   * @dev Returns campaign data in batches to avoid gas limits
   * @param startId Starting campaign ID (use 1 for first batch)
   * @param limit Maximum number of campaigns to return (max 100)
   * @return infos Array of campaign info
   * @return nextStart Next starting ID for pagination (0 if no more)
   */
  function getAllSyncedCampaigns(uint256 startId, uint256 limit) 
    external 
    view 
    returns (CampaignInfo[] memory infos, uint256 nextStart) 
  {
    require(limit > 0 && limit <= 100, "INVALID_LIMIT");
    require(startId > 0, "INVALID_START_ID");
    
    uint256 totalCampaigns = nextCampaignId;
    uint256 remainingCampaigns = totalCampaigns >= startId ? totalCampaigns - startId + 1 : 0;
    uint256 batchSize = remainingCampaigns > limit ? limit : remainingCampaigns;
    
    infos = new CampaignInfo[](batchSize);
    uint256 count = 0;
    
    for (uint256 i = startId; i <= totalCampaigns && count < limit; i++) {
      Campaign storage c = campaigns[i];
      if (c.creator != address(0)) {
        infos[count] = CampaignInfo({
          campaignId: i,
          creator: c.creator,
          preferredZRC20: c.preferredZRC20,
          active: c.active
        });
        count++;
      }
    }
    
    // Resize array if needed
    if (count < batchSize) {
      CampaignInfo[] memory resized = new CampaignInfo[](count);
      for (uint256 i = 0; i < count; i++) {
        resized[i] = infos[i];
      }
      infos = resized;
    }
    
    // Calculate next start for pagination
    nextStart = (startId + limit <= totalCampaigns) ? startId + limit : 0;
  }

  /**
   * @notice Get specific campaign information
   * @param campaignId The campaign ID to query
   * @return info Campaign information struct
   */
  function getCampaignInfo(uint256 campaignId) external view returns (CampaignInfo memory info) {
    Campaign storage campaign = campaigns[campaignId];
    require(campaign.creator != address(0), "CAMPAIGN_NOT_FOUND");
    
    info = CampaignInfo({
      campaignId: campaignId,
      creator: campaign.creator,
      preferredZRC20: campaign.preferredZRC20,
      active: campaign.active
    });
  }

  /**
   * @notice Check if a campaign exists and is active
   * @param campaignId The campaign ID to check
   * @return exists Whether the campaign exists
   * @return active Whether the campaign is active
   */
  function campaignStatus(uint256 campaignId) external view returns (bool exists, bool active) {
    Campaign storage campaign = campaigns[campaignId];
    exists = campaign.creator != address(0);
    active = exists && campaign.active;
  }

  /*------------------------------ HELPERS -------------------------------*/

  function _deriveDonorAddress(MessageContext calldata ctx) internal pure returns (address) {
    // ctx.sender is bytes (origin address payload). Derive a stable pseudo-address for logs/accounting.
    return address(uint160(uint256(keccak256(abi.encodePacked(ctx.sender, ctx.chainID)))));
  }

  function _getChainName(uint256 chainId) internal pure returns (string memory) {
    if (chainId == 11155111) return "Ethereum Sepolia";
    if (chainId == 80001) return "Polygon Mumbai";
    if (chainId == 97) return "BSC Testnet";
    if (chainId == 7001) return "ZetaChain Athens";
    return "Unknown Chain";
  }

  /*------------------------------ REVERT HANDLER -------------------------------*/
  function onRevert(RevertContext calldata revertContext) external onlyGateway {
    if (debug) emit DebugOnRevert(revertContext.asset, revertContext.amount, revertContext.revertMessage);
    // Attempt fallback payout to campaign creator using encoded revert message
    (uint256 campaignId) = abi.decode(
      revertContext.revertMessage,
      (uint256)
    );
    Campaign storage c = campaigns[campaignId];
    if (c.creator != address(0)) {
      IERC20Minimal(revertContext.asset).safeTransfer(c.creator, revertContext.amount);
      if (debug) emit DebugTransferOut(revertContext.asset, c.creator, revertContext.amount);
    }
  }

  /// Reject plain native transfers — must call donateNative()
  receive() external payable {
    revert("USE_DONATE_NATIVE");
  }
}
