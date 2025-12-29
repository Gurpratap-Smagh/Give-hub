// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {CrossChainCrowdfund} from "../contracts/CrossChainCrowdfund.sol";
import {IZRC20} from "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import {IGatewayZEVM} from "@zetachain/protocol-contracts/contracts/zevm/interfaces/IGatewayZEVM.sol";
import {MessageContext, RevertContext} from "@zetachain/protocol-contracts/contracts/zevm/interfaces/IGatewayZEVM.sol";

contract CrowdfundTest is Test {
  CrossChainCrowdfund public crowdfund;
  address public gateway = address(0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e);
  address public uniswapRouter = address(0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0);
  address public zrc20Eth = address(0x2ca7d64A7EFE2D62A725E2B35Cf7230D6677FfEe); // localnet zETH
  address public wzeta = address(0x5FbDB2315678afecb367f032d93F642f64180aa3);
  address public owner = address(this);
  uint256 public gasLimit = 100000;

  function setUp() public {
    crowdfund = new CrossChainCrowdfund();
    crowdfund.initialize(owner, gateway, uniswapRouter, gasLimit);

    // Allow tokens
    crowdfund.setAllowedInToken(zrc20Eth, true);
    crowdfund.setAllowedOutToken(wzeta, true);
    crowdfund.setAllowedOutToken(zrc20Eth, true);
  }

  function testCreateCampaign() public {
    uint256 id = crowdfund.createCampaign(wzeta);
    (address creator, address preferred, bool active,,) = crowdfund.campaigns(id);
    assertEq(creator, owner);
    assertEq(preferred, wzeta);
    assertTrue(active);
  }

  function testOnCallLocalDonation() public {
    uint256 campaignId = crowdfund.createCampaign(wzeta);

    // Mock gateway call
    vm.prank(gateway);

    bytes memory message = abi.encode(campaignId, "Test Donor", "Test Note");
    MessageContext memory ctx = MessageContext({
      sender: abi.encode(address(0x123)),
      chainID: 11155111 // Sepolia
    });

    // Mock token transfer to contract (from sender to crowdfund)
    vm.mockCall(
      zrc20Eth,
      abi.encodeWithSelector(IZRC20.transferFrom.selector, address(0x123), address(crowdfund), 1 ether),
      abi.encode(true)
    );

    // Mock balanceOf for contract to have tokens
    vm.mockCall(
      zrc20Eth,
      abi.encodeWithSelector(IZRC20.balanceOf.selector, address(crowdfund)),
      abi.encode(1 ether)
    );

    // Mock Uniswap swap (return some amountOut)
    vm.mockCall(
      uniswapRouter,
      abi.encodeWithSelector(IUniswapV2Router02.swapExactTokensForTokens.selector),
      abi.encode([1 ether]) // fake amounts
    );

    // Mock withdraw (local payout)
    vm.mockCall(
      wzeta,
      abi.encodeWithSelector(IZRC20.transfer.selector, address(owner), 1 ether),
      abi.encode(true)
    );

    crowdfund.onCall(ctx, zrc20Eth, 1 ether, message);

    // Check contribution recorded (adjust destructuring to match struct)
    (
      uint256 id,
      address donor,
      address originalToken,
      address received,
      uint256 originalAmount,
      uint256 convertedAmount,
      uint256 originChainId,
      uint64 timestamp,
      string memory chainName
    ) = crowdfund.contributions(1);

    assertEq(id, campaignId);
    assertEq(donor, address(0x123));
    assertEq(originalToken, zrc20Eth);
    assertEq(received, wzeta);
    assertEq(originalAmount, 1 ether);
    assertEq(originChainId, 11155111);
  }

  function testOnRevertRefund() public {
    // Mock revert from gateway
    vm.prank(gateway);

    bytes memory revertMsg = abi.encode(abi.encode(address(0x123)), zrc20Eth);
    RevertContext memory ctx = RevertContext({
      asset: zrc20Eth,
      amount: 1 ether,
      revertMessage: revertMsg
    });

    // Mock swap + withdraw calls
    vm.mockCall(
      uniswapRouter,
      abi.encodeWithSelector(IUniswapV2Router02.swapExactTokensForTokens.selector),
      abi.encode([1 ether])
    );

    vm.mockCall(
      gateway,
      abi.encodeWithSelector(IGatewayZEVM.withdraw.selector),
      abi.encode(true)
    );

    crowdfund.onRevert(ctx);

    // No revert = success (refund flow triggered)
    // You can add vm.expectCall for withdraw if needed
  }
}
