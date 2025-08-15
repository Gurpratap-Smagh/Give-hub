// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseForwardFundraiser} from "./BaseForwardFundraiser.sol";

/**
 * @title DirectForwardFundraiser
 * @notice Deployable implementation of the minimal forward fundraiser.
 *         Includes stubbed ZetaChain hook functions for future cross-chain wiring.
 */
contract DirectForwardFundraiser is BaseForwardFundraiser {
    /// @notice Zeta system contract address authorized to call cross-chain hooks
    address public immutable zetaSystem;

    constructor(address initialOwner, address zetaSystem_)
        BaseForwardFundraiser(initialOwner)
    {
        require(zetaSystem_ != address(0), "zetaSystem=0");
        zetaSystem = zetaSystem_;
    }

    // =============================================================
    //                  ZETACHAIN HOOKS (STUBS)
    // =============================================================
    // Wire these to ZetaChain's messaging interfaces in integration phase.

    // TODO: Replace with structured event once payload schema is finalized
    event CrossChainMessageReceived(bytes payload, address sender, uint256 value);
    event CrossChainMessageReverted(bytes payload);
    event CrossChainRevert(bytes payload);

    // Accept native tokens from system contracts if needed.
    receive() external payable {}

    /**
     * @dev ZetaChain message receive stub. Attach proper interface later.
     */
    function onMessageReceive(bytes calldata payload) external payable {
        // Restrict to Zeta system contract
        require(msg.sender == zetaSystem, "unauthorized");

        emit CrossChainMessageReceived(payload, msg.sender, msg.value);
        // TODO: DECODE PAYLOAD AND FORWARD DONATION (align with latest Zeta payload schema)
        // (uint256 campaignId, address token, uint256 amount, string memory memo) = abi.decode(payload, (uint256, address, uint256, string));
        // donate(campaignId, token, amount, memo); // attach msg.value only if token == address(0)
    }

    /**
     * @dev ZetaChain message revert stub.
     */
    function onMessageRevert(bytes calldata payload) external {
        // Restrict to Zeta system contract
        require(msg.sender == zetaSystem, "unauthorized");
        emit CrossChainMessageReverted(payload);
    }

    /**
     * @dev Optional revert hook name used by some adapters.
     */
    function onRevert(bytes calldata payload) external {
        // Restrict to Zeta system contract
        require(msg.sender == zetaSystem, "unauthorized");
        emit CrossChainRevert(payload);
    }
}
