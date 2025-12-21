// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {CrossChainCrowdfund} from "../contracts/CrossChainCrowdfund.sol";

contract CrowdfundTest is Test {

  CrossChainCrowdfund crowdfund;

  function setUp() public {

    crowdfund = new CrossChainCrowdfund();

    crowdfund.initialize(address(this), address(0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e), address(0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0), 100000);

  }

  function testCreateCampaign() public {

    uint256 id = crowdfund.createCampaign(address(0x123));

    (address creator,,bool active,,) = crowdfund.campaigns(id);

    assertEq(creator, address(this));

    assertTrue(active);

  }

}
