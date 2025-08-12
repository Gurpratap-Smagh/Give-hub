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
        address walletAddress;
        address preferredZRC20;     // ZRC-20 token they want to receive
        uint256 totalReceived;       // Total received across all campaigns
        uint256[] campaignIds;       // All campaigns by this creator
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
        string  title;
        string  description;
        address preferredZRC20;      
        uint256 goal;                
        uint256 totalRaised;         // Total in preferred token terms
        uint256 totalContributions;  // Number of contributions
        uint64  createdAt;
        uint64  deadline;            // Campaign deadline
        bool    active;
        bool    fundsWithdrawn;      // Track if creator withdrew funds
    }

    /// @dev User/Donor tracking
    struct Donor {
        address walletAddress;
        uint256 totalDonated;        // Total donated across all campaigns
        uint256[] contributionIds;   // All contributions made
        mapping(uint256 => uint256) campaignDonations; // campaignId => total donated
    }

    /*//////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/

    event CampaignCreated(
        uint256 indexed campaignId, 
        address indexed creator, 
        string title,
        address preferredZRC20, 
        uint256 goal,
        uint64 deadline
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
    
    event FundsWithdrawn(
        uint256 indexed campaignId, 
        address indexed creator, 
        uint256 amount,
        address token
    );
    
    event TokenSwapped(
        address indexed fromToken,
        address indexed toToken,
        uint256 amountIn,
        uint256 amountOut
    );

    /*//////////////////////////////////////////////////////////////
                              ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotCreator();
    error CampaignInactive();
    error CampaignExpired();
    error InvalidToken();
    error InvalidCampaign();
    error ZeroAmount();
    error AlreadyWithdrawn();
    error InsufficientBalance();
    error SwapFailed();
    error DeadlineInPast();

    /*//////////////////////////////////////////////////////////////
                             STORAGE
    //////////////////////////////////////////////////////////////*/

    SystemContract public immutable systemContract;
    
    // Core mappings
    mapping(address => Creator) public creators;
    mapping(uint256 => Campaign) public campaigns;
    mapping(address => Donor) public donors;
    mapping(uint256 => Contribution) public contributions;
    
    // Campaign fund tracking
    mapping(uint256 => mapping(address => uint256)) public campaignTokenBalances; // campaignId => token => balance
    
    // Counters
    uint256 public nextCampaignId;
    uint256 public nextContributionId;
    
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
        string memory title,
        string memory description,
        address preferredZRC20,
        uint256 goal,
        uint64 deadline
    ) external returns (uint256 campaignId) {
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (preferredZRC20 == address(0)) revert InvalidToken();
        
        campaignId = ++nextCampaignId;
        
        // Initialize creator if first time
        if (!creators[msg.sender].exists) {
            creators[msg.sender] = Creator({
                walletAddress: msg.sender,
                preferredZRC20: preferredZRC20,
                totalReceived: 0,
                campaignIds: new uint256[](0),
                exists: true
            });
        }
        
        // Create campaign
        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            title: title,
            description: description,
            preferredZRC20: preferredZRC20,
            goal: goal,
            totalRaised: 0,
            totalContributions: 0,
            createdAt: uint64(block.timestamp),
            deadline: deadline,
            active: true,
            fundsWithdrawn: false
        });
        
        // Update creator
        creators[msg.sender].campaignIds.push(campaignId);
        creators[msg.sender].preferredZRC20 = preferredZRC20;
        
        emit CampaignCreated(campaignId, msg.sender, title, preferredZRC20, goal, deadline);
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
        if (block.timestamp > campaign.deadline) revert CampaignExpired();
        
        // Derive donor address from context
        address donorAddress = _deriveDonorAddress(ctx);
        
        // Initialize donor if first time
        if (donors[donorAddress].walletAddress == address(0)) {
            donors[donorAddress].walletAddress = donorAddress;
        }
        
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
        
        // Update campaign
        campaign.totalRaised += convertedAmount;
        campaign.totalContributions++;
        campaignTokenBalances[campaignId][campaign.preferredZRC20] += convertedAmount;
        
        // Update donor records
        donors[donorAddress].totalDonated += convertedAmount;
        donors[donorAddress].contributionIds.push(contributionId);
        donors[donorAddress].campaignDonations[campaignId] += convertedAmount;
        
        // Update creator total
        creators[campaign.creator].totalReceived += convertedAmount;
        
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
        if (campaign.fundsWithdrawn) revert AlreadyWithdrawn();
        
        uint256 balance = campaignTokenBalances[campaignId][campaign.preferredZRC20];
        if (balance == 0) revert InsufficientBalance();
        
        campaign.fundsWithdrawn = true;
        campaignTokenBalances[campaignId][campaign.preferredZRC20] = 0;
        
        // Transfer funds to creator
        IZRC20(campaign.preferredZRC20).transfer(campaign.creator, balance);
        
        emit FundsWithdrawn(campaignId, campaign.creator, balance, campaign.preferredZRC20);
    }

    /*//////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getCreatorCampaigns(address creator) external view returns (uint256[] memory) {
        return creators[creator].campaignIds;
    }

    function getDonorContributions(address donor) external view returns (uint256[] memory) {
        return donors[donor].contributionIds;
    }

    function getCampaignBalance(uint256 campaignId) external view returns (uint256) {
        Campaign memory campaign = campaigns[campaignId];
        return campaignTokenBalances[campaignId][campaign.preferredZRC20];
    }

    function getDonorCampaignContribution(address donor, uint256 campaignId) external view returns (uint256) {
        return donors[donor].campaignDonations[campaignId];
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
        if (block.timestamp > campaign.deadline) revert CampaignExpired();
        campaign.active = true;
    }
}