// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./IBaseRegistry.sol";

interface ICoreRegistry is IBaseRegistry {
    function gatewayZEVM() external returns (address);
}