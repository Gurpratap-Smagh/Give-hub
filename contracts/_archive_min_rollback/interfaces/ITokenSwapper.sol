// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITokenSwapper
 * @notice Interface for token swapping functionality in the CrossChainCrowdfund system
 * @dev Handles conversion between different ZRC-20 tokens with slippage protection
 */
interface ITokenSwapper {
    /*//////////////////////////////////////////////////////////////
                               EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event TokenSwapped(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed recipient
    );
    
    event SlippageUpdated(
        address indexed token,
        uint256 oldSlippage,
        uint256 newSlippage
    );
    
    event PairAdded(
        address indexed tokenA,
        address indexed tokenB
    );
    
    /*//////////////////////////////////////////////////////////////
                               ERRORS
    //////////////////////////////////////////////////////////////*/
    
    error UnsupportedPair();
    error SlippageTooHigh();
    error InsufficientOutput();
    error SwapFailed();
    error InvalidToken();
    
    /*//////////////////////////////////////////////////////////////
                            SWAP FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Swap tokens with automatic slippage protection
     * @param tokenIn Address of input ZRC-20 token
     * @param tokenOut Address of output ZRC-20 token
     * @param amountIn Amount of input tokens
     * @return amountOut Amount of output tokens received
     */
    function swapTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external returns (uint256 amountOut);
    
    /**
     * @notice Swap tokens with custom slippage protection
     * @param tokenIn Address of input ZRC-20 token
     * @param tokenOut Address of output ZRC-20 token
     * @param amountIn Amount of input tokens
     * @param minAmountOut Minimum acceptable output amount
     * @return amountOut Amount of output tokens received
     */
    function swapTokensWithSlippage(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);
    
    /**
     * @notice Handle native ZETA wrapping/unwrapping
     * @param amount Amount to wrap/unwrap
     * @param operation "wrap" or "unwrap"
     * @return success Whether operation succeeded
     */
    function handleNativeZeta(
        uint256 amount,
        string calldata operation
    ) external returns (bool success);
    
    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Get quote for token swap
     * @param tokenIn Address of input token
     * @param tokenOut Address of output token
     * @param amountIn Amount of input tokens
     * @return amountOut Expected output amount
     */
    function getSwapQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut);
    
    /**
     * @notice Check if token pair is supported for swapping
     * @param tokenA First token address
     * @param tokenB Second token address
     * @return supported Whether pair is supported
     */
    function isPairSupported(
        address tokenA,
        address tokenB
    ) external view returns (bool supported);
    
    /**
     * @notice Get slippage tolerance for a token (in basis points)
     * @param token Token address
     * @return slippage Slippage in basis points (e.g., 300 = 3%)
     */
    function getTokenSlippage(address token) external view returns (uint256 slippage);
    
    /*//////////////////////////////////////////////////////////////
                           ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Add supported trading pair
     * @param tokenA First token address
     * @param tokenB Second token address
     */
    function addSupportedPair(address tokenA, address tokenB) external;
    
    /**
     * @notice Update slippage tolerance for token
     * @param token Token address
     * @param slippageBps Slippage in basis points
     */
    function updateTokenSlippage(address token, uint256 slippageBps) external;
}