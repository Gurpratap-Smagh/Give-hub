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
        string originChain
    );
    
    event TokenSwapped(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

    /*//////////////////////////////////////////////////////////////
                              ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotCreator();
    error CampaignInactive();
    error InvalidToken();
    error InvalidCampaign();
    error ZeroAmount();
    error SwapFailed();

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
    address public constant ZETA_TOKEN = 0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf; // WZETA
    address public immutable ethZRC20;    // ZRC-20 for ETH
    address public immutable btcZRC20;    // ZRC-20 for BTC
    address public immutable usdcZRC20;   // ZRC-20 for USDC
    
    /*//////////////////////////////////////////////////////////////
                           CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _systemContract) {
        systemContract = SystemContract(_systemContract);
        
        // Initialize ZRC-20 addresses from system contract
        // These would be set based on your deployment
        ethZRC20 = systemContract.gasCoinZRC20ByChainId(1);  // Ethereum mainnet
        btcZRC20 = systemContract.gasCoinZRC20ByChainId(8332); // Bitcoin
        usdcZRC20 = address(0); // Set USDC ZRC-20 address
        
        // Map tokens to chain names
        tokenToChainName[ethZRC20] = "Ethereum";
        tokenToChainName[btcZRC20] = "Bitcoin";
        tokenToChainName[usdcZRC20] = "USDC";
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
            (uint256 campaignId, string memory note) = abi.decode(data, (uint256, string));
            _handleDonation(ctx, zrc20, amount, campaignId, note);
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
        string memory note
    ) internal {
        if (amount == 0) revert ZeroAmount();
        
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) revert InvalidCampaign();
        if (!campaign.active) revert CampaignInactive();

        // Derive donor address from context
        address donorAddress = _deriveDonorAddress(ctx);
        
        // Convert tokens if needed
        uint256 convertedAmount = amount;
        if (zrc20In != campaign.preferredZRC20) {
            convertedAmount = _swapTokens(zrc20In, campaign.preferredZRC20, amount);
        }
        
        // Record contribution
        uint256 contributionId = ++nextContributionId;
        contributions[contributionId] = Contribution({
            campaignId: campaignId,
            donor: donorAddress,
            originalToken: zrc20In,
            zrc20Received: campaign.preferredZRC20,
            originalAmount: amount,
            convertedAmount: convertedAmount,
            originChainId: uint64(ctx.chainID),
            timestamp: uint64(block.timestamp),
            originChainName: tokenToChainName[zrc20In]
        });
        
        // Forward immediately to creator (no escrow)
        IZRC20(campaign.preferredZRC20).transfer(campaign.creator, convertedAmount);
        
        emit ContributionReceived(
            campaignId,
            donorAddress,
            contributionId,
            zrc20In,
            amount,
            convertedAmount,
            tokenToChainName[zrc20In]
        );
    }

    /*//////////////////////////////////////////////////////////////
                         TOKEN SWAPPING
    //////////////////////////////////////////////////////////////*/

    function _swapTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        // TODO: Integrate with ZetaChain's DEX/Router
        // For now, return same amount (1:1 placeholder)
        // In production, use UniswapV2Router or ZetaChain's native swap
        
        // Example integration point:
        // IUniswapV2Router router = IUniswapV2Router(ROUTER_ADDRESS);
        // address[] memory path = new address[](2);
        // path[0] = tokenIn;
        // path[1] = tokenOut;
        // uint256[] memory amounts = router.swapExactTokensForTokens(
        //     amountIn,
        //     0, // accept any amount of tokens out
        //     path,
        //     address(this),
        //     block.timestamp
        // );
        // amountOut = amounts[amounts.length - 1];
        
        amountOut = amountIn; // Placeholder
        emit TokenSwapped(tokenIn, tokenOut, amountIn, amountOut);
    }

    /*//////////////////////////////////////////////////////////////
                         WITHDRAWALS
    //////////////////////////////////////////////////////////////*/

    function withdrawCampaignFunds(uint256 campaignId) external {
        Campaign storage campaign = campaigns[campaignId];
        
        if (campaign.creator != msg.sender) revert NotCreator();
        
        uint256 balance = campaignTokenBalances[campaignId][campaign.preferredZRC20];
        if (balance == 0) revert InsufficientBalance();
        
        campaignTokenBalances[campaignId][campaign.preferredZRC20] = 0;
        
        // Transfer funds to creator
        IZRC20(campaign.preferredZRC20).transfer(campaign.creator, balance);
        
        emit FundsWithdrawn(campaignId, campaign.creator, balance, campaign.preferredZRC20);
    }

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getCampaignBalance(uint256 campaignId) external view returns (uint256) {
        Campaign memory campaign = campaigns[campaignId];
        return campaignTokenBalances[campaignId][campaign.preferredZRC20];
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