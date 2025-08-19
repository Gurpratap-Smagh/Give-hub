// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title CrossChainCrowdfund (Enhanced Universal App on ZetaChain)
 * @notice Receives cross-chain deposits from Ethereum, Bitcoin, Solana via ZetaChain,
 *         records contributions, and routes funds to each creator's preferred token.
 */

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IWZETA.sol";
import "@zetachain/protocol-contracts/contracts/zevm/SystemContract.sol";

// Interfaces for token swapping
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

contract CrossChainCrowdfund is UniversalContract {
    /*//////////////////////////////////////////////////////////////
                               TYPES
    //////////////////////////////////////////////////////////////*/

    /// @dev Creator struct for better organization
    struct Creator {
        address preferredZRC20;     // ZRC-20 token they want to receive
        bool exists;
    }

    /// @dev Enhanced contribution record
    struct Contribution {
        uint256 campaignId;
        address donor;              
        address originalToken;       // Original token sent (before conversion)
        address zrc20Received;       // ZRC-20 token received on Zeta
        uint256 originalAmount;      // Amount in original token
        uint256 convertedAmount;     // Amount after conversion to preferred token
        uint64  originChainId;       
        uint64  timestamp;
        string  originChainName;     // "Ethereum", "Bitcoin", "Solana"
    }

    /// @dev Campaign with better tracking
    struct Campaign {
        address creator;
        address preferredZRC20;      
        bool    active;
    }

    /*//////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/

    event CampaignCreated(
        uint256 indexed campaignId, 
        address indexed creator, 
        address preferredZRC20
    );
    
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
    
    event TokenSwapped(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event SwapFailed(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, string reason);
    event PaidInWZETA(address indexed creator, uint256 amountWZETA, address requestedToken);
    

    /*//////////////////////////////////////////////////////////////
                              ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotCreator();
    error CampaignInactive();
    error InvalidToken();
    error InvalidCampaign();
    error ZeroAmount();
    

    /*//////////////////////////////////////////////////////////////
                             STORAGE
    //////////////////////////////////////////////////////////////*/

    SystemContract public immutable systemContract;
    
    // Core mappings
    mapping(address => Creator) public creators;
    mapping(uint256 => Campaign) public campaigns;
    
    // Counters
    uint256 public nextCampaignId;
    uint256 public nextContributionId;

    // Optional: store contributions by ID for lightweight history
    mapping(uint256 => Contribution) public contributions;
    
    // Token mappings for chain identification
    mapping(address => string) public tokenToChainName;
    
    // Supported tokens (can be expanded)
    address public immutable ZETA_TOKEN; // WZETA configured at deploy-time
    address public immutable ethZRC20;    // ZRC-20 for ETH
    address public immutable btcZRC20;    // ZRC-20 for BTC
    address public immutable usdcZRC20;   // ZRC-20 for USDC
    
    // Uniswap router for token swaps
    address public UNISWAP_ROUTER;
    
    /*//////////////////////////////////////////////////////////////
                           CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _systemContract, address _wzeta) {
        if (_systemContract == address(0) || _wzeta == address(0)) revert InvalidToken();
        systemContract = SystemContract(_systemContract);
        ZETA_TOKEN = _wzeta;
        
        // Initialize ZRC-20 addresses from system contract
        // These would be set based on your deployment
        ethZRC20 = systemContract.gasCoinZRC20ByChainId(1);  // Ethereum mainnet
        btcZRC20 = systemContract.gasCoinZRC20ByChainId(8332); // Bitcoin
        usdcZRC20 = address(0); // Set USDC ZRC-20 address
        
        // Map tokens to chain names
        tokenToChainName[ethZRC20] = "Ethereum";
        tokenToChainName[btcZRC20] = "Bitcoin";
        tokenToChainName[usdcZRC20] = "USDC";
        tokenToChainName[ZETA_TOKEN] = "ZetaChain";
    }

    /*//////////////////////////////////////////////////////////////
                          ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Set the Uniswap router address for token swaps
    /// @param router The router contract address
    function setUniswapRouter(address router) external {
        // In production, add onlyOwner modifier
        UNISWAP_ROUTER = router;
    }

    /*//////////////////////////////////////////////////////////////
                          UNIVERSAL ENTRYPOINT
    //////////////////////////////////////////////////////////////*/

    function onCall(
        MessageContext calldata ctx,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override {
        // Decode the action type from message
        (string memory action, bytes memory data) = abi.decode(message, (string, bytes));
        
        if (keccak256(bytes(action)) == keccak256("donate")) {
            (uint256 campaignId, string memory donorName, string memory note) = abi.decode(data, (uint256, string, string));
            _handleDonation(ctx, zrc20, amount, campaignId, donorName, note);
        }
        // Add more actions as needed
    }

    /*//////////////////////////////////////////////////////////////
                         CAMPAIGN MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    function createCampaign(
        address preferredZRC20
    ) external returns (uint256 campaignId) {
        if (preferredZRC20 == address(0)) revert InvalidToken();

        campaignId = ++nextCampaignId;

        // Initialize or update creator record minimally
        if (!creators[msg.sender].exists) {
            creators[msg.sender] = Creator({
                preferredZRC20: preferredZRC20,
                exists: true
            });
        } else {
            // Optional: update preferred token for creator
            creators[msg.sender].preferredZRC20 = preferredZRC20;
        }

        // Create minimal campaign
        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            preferredZRC20: preferredZRC20,
            active: true
        });

        emit CampaignCreated(campaignId, msg.sender, preferredZRC20);
    }

    /*//////////////////////////////////////////////////////////////
                         DONATION HANDLING
    //////////////////////////////////////////////////////////////*/

    function _handleDonation(
        MessageContext calldata ctx,
        address zrc20In,
        uint256 amount,
        uint256 campaignId,
        string memory donorName,
        string memory note
    ) internal {
        if (amount == 0) revert ZeroAmount();
        
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) revert InvalidCampaign();
        if (!campaign.active) revert CampaignInactive();

        // Derive donor address from context
        address donorAddress = _deriveDonorAddress(ctx);
        
        // NO-ESCROW: swap if needed, then forward to creator immediately
        address tokenOut = campaign.preferredZRC20;
        uint256 amountOut = amount;
        bool swapped = false;
        
        if (zrc20In != tokenOut) {
            (amountOut, swapped) = _swapTokens(zrc20In, tokenOut, amount);
            if (swapped) {
                IZRC20(tokenOut).transfer(campaign.creator, amountOut);
            } else {
                // graceful fallback: pay creator in original token (WZETA), but tell the UI
                IZRC20(zrc20In).transfer(campaign.creator, amount);
                emit PaidInWZETA(campaign.creator, amount, tokenOut);
                tokenOut = zrc20In; // update for contribution record
                amountOut = amount;
            }
        } else {
            IZRC20(tokenOut).transfer(campaign.creator, amountOut);
        }
        
        // Record contribution
        uint256 contributionId = ++nextContributionId;
        contributions[contributionId] = Contribution({
            campaignId: campaignId,
            donor: donorAddress,
            originalToken: zrc20In,
            zrc20Received: tokenOut,
            originalAmount: amount,
            convertedAmount: amountOut,
            originChainId: uint64(ctx.chainID),
            timestamp: uint64(block.timestamp),
            originChainName: tokenToChainName[zrc20In]
        });
        
        emit ContributionReceived(
            campaignId,
            donorAddress,
            contributionId,
            zrc20In,
            amount,
            amountOut,
            tokenToChainName[zrc20In],
            donorName,
            note
        );
    }

    /// @notice Accept native ZETA, wrap to WZETA, and forward immediately to the campaign creator (no-escrow)
    function donateNative(uint256 campaignId, string memory donorName, string memory note) external payable {
        if (msg.value == 0) revert ZeroAmount();
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) revert InvalidCampaign();
        if (!campaign.active) revert CampaignInactive();

        // Wrap native ZETA to WZETA
        IWETH9(ZETA_TOKEN).deposit{value: msg.value}();

        // NO-ESCROW: swap WZETA to creator's preferred token if needed, then forward
        address tokenOut = campaign.preferredZRC20;
        uint256 amountOut = msg.value;
        bool swapped = false;
        
        if (tokenOut != ZETA_TOKEN) {
            (amountOut, swapped) = _swapTokens(ZETA_TOKEN, tokenOut, msg.value);
            if (swapped) {
                IZRC20(tokenOut).transfer(campaign.creator, amountOut);
            } else {
                // graceful fallback: pay creator in WZETA, but tell the UI
                IZRC20(ZETA_TOKEN).transfer(campaign.creator, msg.value);
                emit PaidInWZETA(campaign.creator, msg.value, tokenOut);
                tokenOut = ZETA_TOKEN; // update for contribution record
                amountOut = msg.value;
            }
        } else {
            IZRC20(tokenOut).transfer(campaign.creator, amountOut);
        }

        // Record contribution with local context
        uint256 contributionId = ++nextContributionId;
        contributions[contributionId] = Contribution({
            campaignId: campaignId,
            donor: msg.sender,
            originalToken: ZETA_TOKEN,
            zrc20Received: tokenOut,
            originalAmount: msg.value,
            convertedAmount: amountOut,
            originChainId: uint64(block.chainid),
            timestamp: uint64(block.timestamp),
            originChainName: tokenToChainName[ZETA_TOKEN]
        });

        emit ContributionReceived(
            campaignId,
            msg.sender,
            contributionId,
            ZETA_TOKEN,
            msg.value,
            msg.value,
            tokenToChainName[ZETA_TOKEN],
            donorName,
            note
        );
    }

    /*//////////////////////////////////////////////////////////////
                         TOKEN SWAPPING
    //////////////////////////////////////////////////////////////*/

    function _swapTokens(address tokenIn, address tokenOut, uint256 amountIn)
        internal
        returns (uint256 amountOut, bool swapped)
    {
        if (tokenIn == tokenOut) {
            return (amountIn, false); // no swap needed
        }

        // require WZETA -> tokenOut path for local demo
        if (UNISWAP_ROUTER == address(0)) {
            emit SwapFailed(tokenIn, tokenOut, amountIn, "ROUTER_NOT_SET");
            return (amountIn, false); // fallback to WZETA path at call site
        }

        // approve router
        IERC20(tokenIn).approve(UNISWAP_ROUTER, amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;   // WZETA
        path[1] = tokenOut;  // e.g., ETH-ZRC20 on local

        try IUniswapV2Router(UNISWAP_ROUTER).swapExactTokensForTokens(
            amountIn,
            0, // NOTE: 0 for local; set slippage in prod
            path,
            address(this),
            block.timestamp + 600
        ) returns (uint[] memory amounts) {
            amountOut = amounts[amounts.length - 1];
            swapped = true;
            emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
            return (amountOut, true);
        } catch Error(string memory reason) {
            emit SwapFailed(tokenIn, tokenOut, amountIn, reason);
            return (amountIn, false); // caller will pay in WZETA
        } catch {
            emit SwapFailed(tokenIn, tokenOut, amountIn, "SWAP_CALL_FAILED");
            return (amountIn, false);
        }
    }

    /*//////////////////////////////////////////////////////////////
                          HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _deriveDonorAddress(MessageContext calldata ctx) internal pure returns (address) {
        // Convert the sender from the origin chain to an address
        // This is simplified - in production, you'd want proper address derivation
        return address(uint160(uint256(keccak256(abi.encodePacked(ctx.sender, ctx.chainID)))));
    }

    function pauseCampaign(uint256 campaignId) external {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator != msg.sender) revert NotCreator();
        campaign.active = false;
    }

    function resumeCampaign(uint256 campaignId) external {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator != msg.sender) revert NotCreator();
        campaign.active = true;
    }
}
