// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * CrossChainCrowdfund — Debugged, no OpenZeppelin deps, WZETA-only payouts, NO withdraw
 * Flow:
 *   inbound (ZRC-20/native) -> (optional) swap -> WZETA -> transfer to creator (ZEVM)
 * Notes:
 * - Uses Zeta SystemContract gateway check (msg.sender must be SystemContract).
 * - Detailed Debug* events to trace onCall, decode, router checks, approvals, swap plan/result, transfers, records.
 * - Enforces WZETA-only payout at contract level.
 */

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import "@zetachain/protocol-contracts/contracts/zevm/SystemContract.sol";

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
  }

  /*------------------------------- EVENTS -------------------------------*/

  // Public business events
  event CampaignCreated(uint256 indexed campaignId, address indexed creator, address preferredZRC20);
  event CampaignPaused(uint256 indexed campaignId, address indexed creator);
  event CampaignResumed(uint256 indexed campaignId, address indexed creator);
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

  /*------------------------------ STORAGE ------------------------------*/

  SystemContract public immutable systemContract;

  // creators mapping removed (redundant with campaigns mapping)
  mapping(uint256 => Campaign) public campaigns;
  mapping(uint256 => Contribution) public contributions;

  uint256 public nextCampaignId;
  uint256 public nextContributionId;

  // Token labeling
  mapping(address => string) public tokenLabel; // e.g. "zETH.Sepolia", "USDC.Sepolia", "WZETA"
  
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
    address _systemContract,
    address _wzeta,
    address _ethZRC20,
    address _btcZRC20,
    address _usdcZRC20
  ) {
    if (
      _systemContract == address(0) ||
      _wzeta == address(0) ||
      _ethZRC20 == address(0) ||
      _btcZRC20 == address(0)
    ) revert InvalidToken();

    systemContract = SystemContract(_systemContract);
    WZETA  = _wzeta;

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

  event debugger(address sender);
  function onCall(
    MessageContext calldata ctx,
    address zrc20,
    uint256 amount,
    bytes calldata message
  ) external override {
    require(msg.sender == address(router), "ONLY_ROUTER");
    emit debugger(msg.sender);
    if (debug) emit DebugOnCallEntered(ctx.sender, ctx.chainID, zrc20, amount);

    (string memory action, bytes memory data) = abi.decode(message, (string, bytes));
    if (keccak256(bytes(action)) != keccak256("donate")) revert UnknownAction();

    (uint256 campaignId, string memory donorName, string memory note) =
      abi.decode(data, (uint256, string, string));

    if (debug) emit DebugDecodedDonate(campaignId, donorName, note);

    _handleDonation(ctx, zrc20, amount, campaignId, donorName, note);
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
      active: true
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

  function pauseCampaign(uint256 campaignId) external {
    Campaign storage c = campaigns[campaignId];
    if (c.creator != msg.sender) revert NotCreator();
    c.active = false;
    emit CampaignPaused(campaignId, msg.sender);
  }

  function resumeCampaign(uint256 campaignId) external {
    Campaign storage c = campaigns[campaignId];
    if (c.creator != msg.sender) revert NotCreator();
    c.active = true;
    emit CampaignResumed(campaignId, msg.sender);
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
    if (!allowedInTokens[zrc20In]) revert InvalidToken();

    Campaign storage campaign = campaigns[campaignId];
    if (campaign.creator == address(0)) revert InvalidCampaign();
    if (!campaign.active) revert CampaignInactive();

    address donorAddress = _deriveDonorAddress(ctx);

    if (debug) emit DebugDonationBegin(campaignId, campaign.creator, zrc20In, amount);

    // Route to campaign's chosen payout token
    address tokenOut = campaign.preferredZRC20;
    uint256 amountOut = _swapExactViaPath(zrc20In, tokenOut, amount);

    if (debug) emit DebugTransferOut(tokenOut, campaign.creator, amountOut);
    IERC20Minimal(tokenOut).safeTransfer(campaign.creator, amountOut);

    string memory chainName = bytes(tokenLabel[zrc20In]).length == 0
      ? "ZetaChain"
      : tokenLabel[zrc20In];

    uint256 id = ++nextContributionId;
    contributions[id] = Contribution({
      campaignId: campaignId,
      donor: donorAddress,
      originalToken: zrc20In,
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
      zrc20In,
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

    IWZETA(WZETA).deposit{ value: msg.value }(); // wrap ZETA -> WZETA

    address tokenOut = c.preferredZRC20;
    uint256 converted = _swapExactViaPath(WZETA, tokenOut, msg.value);

    IERC20Minimal(tokenOut).safeTransfer(c.creator, converted);

    uint256 id = ++nextContributionId;
    contributions[id] = Contribution({
      campaignId: campaignId,
      donor: msg.sender,
      originalToken: address(0),
      zrc20Received: tokenOut,
      originalAmount: msg.value,
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
    uint256 converted = _swapExactViaPath(token, tokenOut, amount);

    if (debug) emit DebugTransferOut(tokenOut, c.creator, converted);
    IERC20Minimal(tokenOut).safeTransfer(c.creator, converted);

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

  /*------------------------------ SWAPPING ------------------------------*/

  function _swapExactViaPath(
    address tokenIn,
    address tokenOut,
    uint256 amountIn
  ) internal returns (uint256 amountOut) {
    if (tokenIn == tokenOut) return amountIn;
    if (address(router) == address(0)) {
      if (debug) emit DebugRouterMissing();
      revert RouterNotSet();
    }

    // Get quoted amount out
    address[] memory path;
    if (tokenIn != WZETA && tokenOut != WZETA) {
      path = new address[](3);
      path[0] = tokenIn;
      path[1] = WZETA;
      path[2] = tokenOut;
    } else {
      path = new address[](2);
      path[0] = tokenIn;
      path[1] = tokenOut;
    }
    
    uint[] memory amounts = router.getAmountsOut(amountIn, path);
    uint256 minOut = (amounts[amounts.length - 1] * (10_000 - slippageBps)) / 10_000;

    if (debug) emit DebugApproveReset(tokenIn, 0);
    IERC20Minimal(tokenIn).safeApprove(address(router), 0);
    if (debug) emit DebugApprove(tokenIn, amountIn);
    IERC20Minimal(tokenIn).safeApprove(address(router), amountIn);

    if (debug) emit DebugSwapPlanned(tokenIn, tokenOut, amountIn, path.length);

    try router.swapExactTokensForTokens(
      amountIn,
      minOut, // Use calculated slippage protection
      path,
      address(this),
      block.timestamp + 600
    ) returns (uint[] memory amounts) {
      amountOut = amounts[amounts.length - 1];
      if (debug) emit DebugSwapSucceeded(amountOut);
      
      // Clean up approval after swap
      IERC20Minimal(tokenIn).safeApprove(address(router), 0);
    } catch Error(string memory reason) {
      if (debug) emit DebugSwapFailed(reason);
      revert(reason);
    } catch (bytes memory lowLevelData) {
      if (debug) emit DebugSwapFailedBytes(lowLevelData);
      revert("SWAP_FAILED");
    }
  }

  /*------------------------------ HELPERS -------------------------------*/

  function _deriveDonorAddress(MessageContext calldata ctx) internal pure returns (address) {
    // ctx.sender is bytes (origin address payload). Derive a stable pseudo-address for logs/accounting.
    return address(uint160(uint256(keccak256(abi.encodePacked(ctx.sender, ctx.chainID)))));
  }

  /// Reject plain native transfers — must call donateNative()
  receive() external payable {
    revert("USE_DONATE_NATIVE");
  }
}
