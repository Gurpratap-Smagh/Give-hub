// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * CrossChainCrowdfund — Universal Contract for cross-chain donations
 * Uses ZetaChain Gateway pattern for cross-chain interactions
 * Updated for new gateway addresses and proper ABI encoding
 */

import {IZRC20} from "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import {SwapHelperLib} from "@zetachain/toolkit/contracts/SwapHelperLib.sol";
import {BytesHelperLib} from "@zetachain/toolkit/contracts/BytesHelperLib.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import {RevertOptions, RevertContext} from "@zetachain/protocol-contracts/contracts/Revert.sol";
import {IGatewayZEVM} from "@zetachain/protocol-contracts/contracts/zevm/interfaces/IGatewayZEVM.sol";

/*//////////////////////////////////////////////////////////////
                    Interfaces
//////////////////////////////////////////////////////////////*/

interface IERC20 {
  function transfer(address to, uint256 value) external returns (bool);
  function transferFrom(address from, address to, uint256 value) external returns (bool);
  function approve(address spender, uint256 value) external returns (bool);
  function balanceOf(address) external view returns (uint256);
  function allowance(address owner, address spender) external view returns (uint256);
}

/* ---- SafeERC20-lite (no OZ) ---- */
library SafeERC20 {
  function safeTransfer(IERC20 t, address to, uint256 v) internal {
    (bool ok, bytes memory d) = address(t).call(abi.encodeWithSelector(t.transfer.selector, to, v));
    require(ok && (d.length == 0 || abi.decode(d, (bool))), "SAFE_TRANSFER_FAIL");
  }
  function safeTransferFrom(IERC20 t, address f, address to, uint256 v) internal {
    (bool ok, bytes memory d) = address(t).call(abi.encodeWithSelector(t.transferFrom.selector, f, to, v));
    require(ok && (d.length == 0 || abi.decode(d, (bool))), "SAFE_TRANSFER_FROM_FAIL");
  }
  function safeApprove(IERC20 t, address s, uint256 v) internal {
    (bool ok, bytes memory d) = address(t).call(abi.encodeWithSelector(t.approve.selector, s, v));
    require(ok && (d.length == 0 || abi.decode(d, (bool))), "SAFE_APPROVE_FAIL");
  }
}

/*//////////////////////////////////////////////////////////////
                          Contract
//////////////////////////////////////////////////////////////*/

contract CrossChainCrowdfund is UniversalContract, Initializable, UUPSUpgradeable, OwnableUpgradeable {
  using SafeERC20 for IERC20;

  /*------------------------------- TYPES -------------------------------*/

  // Creator struct removed (redundant with Campaign info)

  struct Contribution {
    uint256 campaignId;
    address donor;
    address originalToken;   // inbound zrc20 token address
    address zrc20Received;   // final token delivered to creator
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
  error InvalidAddress();
  error TransferFailed();
  error ApprovalFailed();
  error InsufficientAmount(string reason);

  /*------------------------------ STORAGE ------------------------------*/

  address public gateway;
  address public uniswapRouter;
  uint256 public gasLimit;

  mapping(uint256 => Campaign) public campaigns;
  mapping(uint256 => Contribution) public contributions;

  uint256 public nextCampaignId;
  uint256 public nextContributionId;

  // Token allowlists
  mapping(address => bool) public allowedInTokens;
  mapping(address => bool) public allowedOutTokens;

  event AllowedInTokenSet(address token, bool allowed);
  event AllowedOutTokenSet(address token, bool allowed);

  /*---------------------------- CONSTRUCTOR & INIT ----------------------------*/
  
  constructor() {
    _disableInitializers();
  }

  function initialize(address initialOwner, address _gateway, address _uniswapRouter, uint256 _gasLimit) external initializer {
    __Ownable_init(initialOwner);
    __UUPSUpgradeable_init();

    if (_gateway == address(0) || _uniswapRouter == address(0)) revert InvalidAddress();

    gateway = _gateway;
    uniswapRouter = _uniswapRouter;
    gasLimit = _gasLimit;
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  /*--------------------------- UNIVERSAL ENTRY --------------------------*/
  
  modifier onlyGateway() {
    require(msg.sender == gateway, "OnlyGateway");
    _;
  }

  /*------------------------------- HELPER STRUCTS ----------------------------*/

  struct Params {
    address target;
    bytes to;
    bool withdraw;
  }

  /*------------------------------- SWAP & WITHDRAW ----------------------------*/

  function handleGasAndSwap(
    address inputToken,
    uint256 amount,
    address targetToken,
    bool withdraw
  ) internal returns (uint256 out, address gasZRC20, uint256 gasFee) {
    uint256 swapAmount = amount;
    gasFee = 0;
    gasZRC20 = address(0);

    if (withdraw) {
      (gasZRC20, gasFee) = IZRC20(targetToken).withdrawGasFee();
      uint256 minInput = quoteMinInput(inputToken, targetToken);
      if (amount < minInput) revert InsufficientAmount("Not enough for gas");

      if (gasZRC20 != inputToken) {
        SwapHelperLib.swapTokensForExactTokens(
          uniswapRouter,
          inputToken,
          gasFee,
          gasZRC20,
          amount
        );
        swapAmount = amount - gasFee;
      } else {
        swapAmount = amount - gasFee;
      }
    }

    out = SwapHelperLib.swapExactTokensForTokens(
      uniswapRouter,
      inputToken,
      swapAmount,
      targetToken,
      0
    );
  }

  function quoteMinInput(
    address inputToken,
    address targetToken
  ) public view returns (uint256) {
    (address gasZRC20, uint256 gasFee) = IZRC20(targetToken).withdrawGasFee();

    if (inputToken == gasZRC20) {
      return gasFee;
    }

    address zeta = IUniswapV2Router02(uniswapRouter).WETH();

    address[] memory path;
    if (inputToken == zeta || gasZRC20 == zeta) {
      path = new address[](2);
      path[0] = inputToken;
      path[1] = gasZRC20;
    } else {
      path = new address[](3);
      path[0] = inputToken;
      path[1] = zeta;
      path[2] = gasZRC20;
    }

    uint256[] memory amountsIn = IUniswapV2Router02(uniswapRouter).getAmountsIn(gasFee, path);

    return amountsIn[0];
  }

  function withdraw(
    Params memory params,
    bytes memory revertMessage,
    uint256 gasFee,
    address gasZRC20,
    uint256 amountOut,
    address originalInputToken
  ) internal {
    if (!params.withdraw) {
      // Local payout on ZetaChain
      IERC20(params.target).safeTransfer(address(uint160(bytes20(params.to))), amountOut);
      return;
    }

    // Cross-chain withdraw
    if (gasZRC20 == params.target) {
      IERC20(gasZRC20).safeApprove(gateway, amountOut + gasFee);
    } else {
      IERC20(gasZRC20).safeApprove(gateway, gasFee);
      IERC20(params.target).safeApprove(gateway, amountOut);
    }

    IGatewayZEVM(gateway).withdraw(
      params.to,
      amountOut,
      params.target,
      RevertOptions({
        revertAddress: address(this),
        callOnRevert: true,
        abortAddress: address(0),
        revertMessage: revertMessage,
        onRevertGasLimit: gasLimit
      })
    );
  }

  function onCall(
    MessageContext calldata context,
    address zrc20,
    uint256 amount,
    bytes calldata message
  ) external override onlyGateway {
    (uint256 campaignId, string memory donorName, string memory note) = abi.decode(
      message,
      (uint256, string, string)
    );

    address donorAddress = BytesHelperLib.bytesToAddress(context.sender, 0);

    Campaign storage campaign = campaigns[campaignId];
    require(campaign.creator != address(0), "InvalidCampaign");
    require(campaign.active, "CampaignInactive");
    require(allowedInTokens[zrc20], "InvalidToken");

    (uint256 amountOut, address gasZRC20, uint256 gasFee) = handleGasAndSwap(
      zrc20,
      amount,
      campaign.preferredZRC20,
      campaign.payoutAddress != address(0)
    );

    withdraw(
      Params({
        target: campaign.preferredZRC20,
        to: abi.encodePacked(
          campaign.payoutAddress == address(0) ? campaign.creator : campaign.payoutAddress
        ),
        withdraw: campaign.payoutAddress != address(0)
      }),
      abi.encode(context.sender, zrc20),
      gasFee,
      gasZRC20,
      amountOut,
      zrc20
    );

    // Record contribution
    string memory chainName = _getChainName(context.origin);
    uint256 id = ++nextContributionId;
    contributions[id] = Contribution({
      campaignId: campaignId,
      donor: donorAddress,
      originalToken: zrc20,
      zrc20Received: campaign.preferredZRC20,
      originalAmount: amount,
      convertedAmount: amountOut,
      originChainId: context.origin,
      timestamp: uint64(block.timestamp),
      originChainName: chainName
    });

    emit ContributionReceived(
      campaignId,
      donorAddress,
      id,
      zrc20,
      amount,
      amountOut,
      chainName,
      donorName,
      note
    );
  }

  function onRevert(RevertContext calldata context) external override onlyGateway {
    (bytes memory originalSender, address originalToken) = abi.decode(
      context.revertMessage,
      (bytes, address)
    );

    (uint256 out, , ) = handleGasAndSwap(
      context.asset,
      context.amount,
      originalToken,
      true
    );

    IGatewayZEVM(gateway).withdraw(
      originalSender,
      out,
      originalToken,
      RevertOptions({
        revertAddress: address(bytes20(originalSender)),
        callOnRevert: false,
        abortAddress: address(0),
        revertMessage: "",
        onRevertGasLimit: gasLimit
      })
    );
  }

  /*------------------------- CAMPAIGN MANAGEMENT ------------------------*/

  function createCampaign(address preferredZRC20) external returns (uint256 campaignId) {
    require(preferredZRC20 != address(0), "InvalidToken");
    require(allowedOutTokens[preferredZRC20], "PayoutTokenNotAllowed");

    campaignId = ++nextCampaignId;
    campaigns[campaignId] = Campaign({
      creator: msg.sender,
      preferredZRC20: preferredZRC20,
      active: true,
      payoutAddress: address(0),
      payoutGasLimit: 0
    });

    emit CampaignCreated(campaignId, msg.sender, preferredZRC20);
  }

  function updateCampaignPayoutToken(uint256 campaignId, address newToken) external {
    Campaign storage campaign = campaigns[campaignId];
    require(campaign.creator == msg.sender, "NotCreator");
    require(campaign.active, "CampaignInactive");
    require(allowedOutTokens[newToken], "PayoutTokenNotAllowed");

    campaign.preferredZRC20 = newToken;
    emit CampaignCreated(campaignId, msg.sender, newToken); // Reuse event for simplicity
  }

  function updateCampaignDestination(
    uint256 campaignId,
    address payoutAddress,
    uint256 payoutGasLimit
  ) external {
    Campaign storage campaign = campaigns[campaignId];
    require(campaign.creator == msg.sender, "NotCreator");
    require(campaign.active, "CampaignInactive");

    campaign.payoutAddress = payoutAddress;
    campaign.payoutGasLimit = payoutGasLimit;
  }

  function deactivateCampaign(uint256 campaignId) external {
    Campaign storage c = campaigns[campaignId];
    require(msg.sender == c.creator, "NotCreator");
    c.active = false;
  }

  function activateCampaign(uint256 campaignId) external {
    Campaign storage c = campaigns[campaignId];
    require(msg.sender == c.creator, "NotCreator");
    c.active = true;
  }

  /*--------------------------- RESCUE FUNCTIONS --------------------------*/
  
  event Rescue(address indexed token, address indexed to, uint256 amount);
  
  function rescueToken(address token, address to, uint256 amount) external onlyOwner {
    IERC20(token).safeTransfer(to, amount);
    emit Rescue(token, to, amount);
  }

  function rescueNative(address to, uint256 amount) external onlyOwner {
    payable(to).transfer(amount);
    emit Rescue(address(0), to, amount);
  }

  /*------------------------------ VIEW FUNCTIONS -------------------------------*/

  struct CampaignInfo {
    uint256 campaignId;
    address creator;
    address preferredZRC20;
    bool active;
  }

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
    
    if (count < batchSize) {
      CampaignInfo[] memory resized = new CampaignInfo[](count);
      for (uint256 i = 0; i < count; i++) {
        resized[i] = infos[i];
      }
      infos = resized;
    }
    
    nextStart = (startId + limit <= totalCampaigns) ? startId + limit : 0;
  }

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

  function campaignStatus(uint256 campaignId) external view returns (bool exists, bool active) {
    Campaign storage campaign = campaigns[campaignId];
    exists = campaign.creator != address(0);
    active = exists && campaign.active;
  }

  /*------------------------------ HELPERS -------------------------------*/

  function _deriveDonorAddress(MessageContext calldata ctx) internal pure returns (address) {
    return BytesHelperLib.bytesToAddress(ctx.sender, 0);
  }

  function _getChainName(uint256 chainId) internal pure returns (string memory) {
    if (chainId == 11155111) return "Ethereum Sepolia";
    if (chainId == 80001) return "Polygon Mumbai";
    if (chainId == 97) return "BSC Testnet";
    if (chainId == 7001) return "ZetaChain Athens";
    return "Unknown Chain";
  }

  /// Reject plain native transfers
  receive() external payable {
    revert("USE_GATEWAY_DEPOSIT");
  }
}
