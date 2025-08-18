// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract MockSystemContract {
    mapping(address => bool) public isZRC20;
    
    constructor() {
        // Mock some ZRC20 tokens as valid
    }
    
    function setZRC20(address token, bool valid) external {
        isZRC20[token] = valid;
    }
}
