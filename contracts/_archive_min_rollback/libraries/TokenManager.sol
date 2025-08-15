// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IWZETA.sol";

/**
 * @title TokenManager
 * @notice Utility library for managing ZRC-20 tokens and native ZETA operations
 * @dev Handles safe transfers, balance checks, and ZETA wrapping/unwrapping
 */
library TokenManager {
    /*//////////////////////////////////////////////////////////////
                               EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event TokenTransferred(
        address indexed token,
        address indexed from,
        address indexed to,
        uint256 amount
    );
    
    event NativeZetaHandled(
        address indexed user,
        uint256 amount,
        string operation // "wrap" or "unwrap"
    );
    
    event TokenAdded(
        address indexed token,
        string chainName,
        uint256 chainId
    );
    
    /*//////////////////////////////////////////////////////////////
                               ERRORS
    //////////////////////////////////////////////////////////////*/
    
    error TransferFailed();
    error InsufficientBalance();
    error InvalidToken();
    error WrapFailed();
    error UnwrapFailed();
    error InvalidAmount();
    
    /*//////////////////////////////////////////////////////////////
                            TOKEN REGISTRY
    //////////////////////////////////////////////////////////////*/
    
    struct TokenInfo {
        address tokenAddress;
        string chainName;
        uint256 chainId;
        bool isActive;
        uint8 decimals;
    }
    
    /*//////////////////////////////////////////////////////////////
                           TRANSFER FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Safe transfer of ZRC-20 tokens
     * @param token ZRC-20 token address
     * @param from Sender address
     * @param to Recipient address
     * @param amount Amount to transfer
     * @return success Whether transfer succeeded
     */
    function safeTransfer(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal returns (bool success) {
        if (token == address(0)) revert InvalidToken();
        if (amount == 0) revert InvalidAmount();
        
        IZRC20 zrc20 = IZRC20(token);
        
        // Check balance before transfer
        uint256 balance = zrc20.balanceOf(from);
        if (balance < amount) revert InsufficientBalance();
        
        // Perform transfer
        if (from == address(this)) {
            success = zrc20.transfer(to, amount);
        } else {
            success = zrc20.transferFrom(from, to, amount);
        }
        
        if (!success) revert TransferFailed();
        
        emit TokenTransferred(token, from, to, amount);
    }
    
    /**
     * @notice Safe transfer from contract to recipient
     * @param token ZRC-20 token address
     * @param to Recipient address
     * @param amount Amount to transfer
     * @return success Whether transfer succeeded
     */
    function safeTransferFrom(
        address token,
        address to,
        uint256 amount
    ) internal returns (bool success) {
        return safeTransfer(token, address(this), to, amount);
    }
    
    /**
     * @notice Batch transfer tokens to multiple recipients
     * @param token ZRC-20 token address
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to transfer
     * @return success Whether all transfers succeeded
     */
    function batchTransfer(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) internal returns (bool success) {
        require(recipients.length == amounts.length, "Array length mismatch");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            if (!safeTransferFrom(token, recipients[i], amounts[i])) {
                return false;
            }
        }
        
        return true;
    }
    
    /*//////////////////////////////////////////////////////////////
                           NATIVE ZETA HANDLING
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Wrap native ZETA to WZETA
     * @param wzeta WZETA contract address
     * @param amount Amount of ZETA to wrap
     * @return success Whether wrapping succeeded
     */
    function wrapZeta(
        address wzeta,
        uint256 amount
    ) internal returns (bool success) {
        if (wzeta == address(0)) revert InvalidToken();
        if (amount == 0) revert InvalidAmount();
        if (address(this).balance < amount) revert InsufficientBalance();
        
        try IWZETA(wzeta).deposit{value: amount}() {
            success = true;
            emit NativeZetaHandled(address(this), amount, "wrap");
        } catch {
            revert WrapFailed();
        }
    }
    
    /**
     * @notice Unwrap WZETA to native ZETA
     * @param wzeta WZETA contract address
     * @param amount Amount of WZETA to unwrap
     * @return success Whether unwrapping succeeded
     */
    function unwrapZeta(
        address wzeta,
        uint256 amount
    ) internal returns (bool success) {
        if (wzeta == address(0)) revert InvalidToken();
        if (amount == 0) revert InvalidAmount();
        
        IWZETA wzToken = IWZETA(wzeta);
        if (wzToken.balanceOf(address(this)) < amount) revert InsufficientBalance();
        
        try wzToken.withdraw(amount) {
            success = true;
            emit NativeZetaHandled(address(this), amount, "unwrap");
        } catch {
            revert UnwrapFailed();
        }
    }
    
    /**
     * @notice Handle native ZETA operations (wrap/unwrap)
     * @param wzeta WZETA contract address
     * @param amount Amount to process
     * @param operation "wrap" or "unwrap"
     * @return success Whether operation succeeded
     */
    function handleNativeZeta(
        address wzeta,
        uint256 amount,
        string memory operation
    ) internal returns (bool success) {
        bytes32 opHash = keccak256(bytes(operation));
        
        if (opHash == keccak256("wrap")) {
            return wrapZeta(wzeta, amount);
        } else if (opHash == keccak256("unwrap")) {
            return unwrapZeta(wzeta, amount);
        } else {
            revert InvalidToken(); // Invalid operation
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                            BALANCE FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Get token balance for address
     * @param token ZRC-20 token address
     * @param account Account to check balance for
     * @return balance Token balance
     */
    function getBalance(
        address token,
        address account
    ) internal view returns (uint256 balance) {
        if (token == address(0)) return account.balance; // Native ZETA
        return IZRC20(token).balanceOf(account);
    }
    
    /**
     * @notice Get multiple token balances for an address
     * @param tokens Array of token addresses
     * @param account Account to check balances for
     * @return balances Array of token balances
     */
    function getBatchBalances(
        address[] calldata tokens,
        address account
    ) internal view returns (uint256[] memory balances) {
        balances = new uint256[](tokens.length);
        
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = getBalance(tokens[i], account);
        }
    }
    
    /**
     * @notice Check if account has sufficient balance
     * @param token Token address
     * @param account Account to check
     * @param requiredAmount Required amount
     * @return sufficient Whether balance is sufficient
     */
    function hasSufficientBalance(
        address token,
        address account,
        uint256 requiredAmount
    ) internal view returns (bool sufficient) {
        return getBalance(token, account) >= requiredAmount;
    }
    
    /*//////////////////////////////////////////////////////////////
                           TOKEN VALIDATION
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Validate token address and check if it's a valid ZRC-20
     * @param token Token address to validate
     * @return valid Whether token is valid ZRC-20
     */
    function isValidZRC20(address token) internal view returns (bool valid) {
        if (token == address(0)) return false;
        
        try IZRC20(token).totalSupply() returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * @notice Get token decimals
     * @param token Token address
     * @return decimals Number of decimals
     */
    function getTokenDecimals(address token) internal view returns (uint8 decimals) {
        if (token == address(0)) return 18; // Native ZETA has 18 decimals
        
        try IZRC20(token).decimals() returns (uint8 dec) {
            return dec;
        } catch {
            return 18; // Default to 18 if call fails
        }
    }
    
    /**
     * @notice Convert amount between different decimal precisions
     * @param amount Amount to convert
     * @param fromDecimals Source token decimals
     * @param toDecimals Target token decimals
     * @return convertedAmount Converted amount
     */
    function convertDecimals(
        uint256 amount,
        uint8 fromDecimals,
        uint8 toDecimals
    ) internal pure returns (uint256 convertedAmount) {
        if (fromDecimals == toDecimals) {
            return amount;
        } else if (fromDecimals > toDecimals) {
            return amount / (10 ** (fromDecimals - toDecimals));
        } else {
            return amount * (10 ** (toDecimals - fromDecimals));
        }
    }
    
    /*//////////////////////////////////////////////////////////////
                           UTILITY FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Calculate percentage of amount
     * @param amount Base amount
     * @param percentage Percentage in basis points (10000 = 100%)
     * @return result Calculated percentage amount
     */
    function calculatePercentage(
        uint256 amount,
        uint256 percentage
    ) internal pure returns (uint256 result) {
        return (amount * percentage) / 10000;
    }
    
    /**
     * @notice Apply slippage to amount
     * @param amount Original amount
     * @param slippageBps Slippage in basis points
     * @return minAmount Minimum amount after slippage
     */
    function applySlippage(
        uint256 amount,
        uint256 slippageBps
    ) internal pure returns (uint256 minAmount) {
        uint256 slippageAmount = calculatePercentage(amount, slippageBps);
        return amount - slippageAmount;
    }
    
    /**
     * @notice Check if amount is within slippage tolerance
     * @param expectedAmount Expected amount
     * @param actualAmount Actual amount received
     * @param slippageBps Maximum allowed slippage in basis points
     * @return withinTolerance Whether actual amount is within tolerance
     */
    function isWithinSlippageTolerance(
        uint256 expectedAmount,
        uint256 actualAmount,
        uint256 slippageBps
    ) internal pure returns (bool withinTolerance) {
        uint256 minAmount = applySlippage(expectedAmount, slippageBps);
        return actualAmount >= minAmount;
    }
}