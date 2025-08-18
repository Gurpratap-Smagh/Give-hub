// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IWZETA.sol";
import "@zetachain/protocol-contracts/contracts/zevm/SystemContract.sol";
import "@zetachain/toolkit/contracts/OnlySystem.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title GiveHubCrowdfund - Universal Cross-Chain Fundraising Platform
 * @notice Receives donations from any blockchain via ZetaChain, converts to preferred tokens,
 *         and enables creators to withdraw funds. Supports ERC20, native tokens, and Bitcoin.
 * @dev Built on ZetaChain's Universal App framework for seamless cross-chain operations
 */
contract GiveHubCrowdfund is zContract, OnlySystem, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    /*//////////////////////////////////////////////////////////////
                                TYPES
    //////////////////////////////////////////////////////////////*/

    struct Creator {
        address walletAddress;
        address preferredZRC20;     // ZRC-20 token they want to receive (WZETA, ZRC20-ETH, etc.)
        uint256 totalReceived;      // Total received across all campaigns
        uint256[] campaignIds;      // All campaigns by this creator
        string username;            // Off-chain username for display
        bool verified;              // Verification status
        bool exists;
    }

    struct Campaign {
        uint256 id;
        address creator;
        string title;
        string description;
        string category;            // "education", "environment", "technology", etc.
        address preferredZRC20;     // Token creator wants to receive
        uint256 goal;               // Goal in preferred token terms
        uint256 totalRaised;        // Total raised in preferred token terms
        uint256 totalContributions; // Number of donations
        uint64 createdAt;
        uint64 deadline;            // Campaign deadline (0 = no deadline)
        bool active;
        bool fundsWithdrawn;        // Track if creator withdrew funds
        string imageHash;           // IPFS hash for campaign image
    }

    struct Donation {
        uint256 id;
        uint256 campaignId;
        address donor;
        address originalToken;       // Original token sent (ZRC20 address or address(0) for native)
        address convertedToken;      // Token after conversion to campaign's preferred token
        uint256 originalAmount;      // Amount in original token
        uint256 convertedAmount;     // Amount after conversion
        uint64 originChainId;       // Chain ID where donation originated
        uint64 timestamp;
        string originChainName;     // "Ethereum", "Bitcoin", "Solana", "ZetaChain"
        string donorName;           // Optional display name
        string message;             // Optional donation message
    }

    struct DonorProfile {
        address walletAddress;
        uint256 totalDonated;       // Total donated across all campaigns (in WZETA equivalent)
        uint256[] donationIds;      // All donations made
        string username;            // Display name
        mapping(uint256 => uint256) campaignDonations; // campaignId => total donated
    }

    /*//////////////////////////////////////////////////////////////
                               STORAGE
    //////////////////////////////////////////////////////////////*/

    // Counters for IDs
    Counters.Counter private _campaignIdCounter;
    Counters.Counter private _donationIdCounter;

    // Core mappings
    mapping(uint256 => Campaign) public campaigns;
    mapping(address => Creator) public creators;
    mapping(uint256 => Donation) public donations;
    mapping(address => DonorProfile) public donors;

    // Additional mappings for efficient queries
    mapping(address => uint256[]) public creatorCampaigns;
    mapping(uint256 => uint256[]) public campaignDonations;
    mapping(string => uint256[]) public categoryCampaigns;

    // System contracts
    SystemContract public systemContract;
    address public wzeta;

    // Platform settings
    uint256 public platformFeePercent = 250; // 2.5% (basis points)
    address public feeRecipient;
    bool public paused = false;

    /*//////////////////////////////////////////////////////////////
                               EVENTS
    //////////////////////////////////////////////////////////////*/

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        string title,
        string category,
        address preferredZRC20,
        uint256 goal,
        uint64 deadline
    );

    event DonationReceived(
        uint256 indexed donationId,
        uint256 indexed campaignId,
        address indexed donor,
        address originalToken,
        uint256 originalAmount,
        uint256 convertedAmount,
        string originChain,
        string donorName
    );

    event FundsWithdrawn(
        uint256 indexed campaignId,
        address indexed creator,
        uint256 amount,
        address token
    );

    event CreatorRegistered(
        address indexed creator,
        string username,
        address preferredZRC20
    );

    event CampaignUpdated(
        uint256 indexed campaignId,
        string title,
        string description,
        bool active
    );

    event TokenSwapped(
        address indexed fromToken,
        address indexed toToken,
        uint256 amountIn,
        uint256 amountOut
    );

    /*//////////////////////////////////////////////////////////////
                               MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier notPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier onlyCreator(uint256 campaignId) {
        require(campaigns[campaignId].creator == msg.sender, "Not campaign creator");
        _;
    }

    modifier campaignExists(uint256 campaignId) {
        require(campaigns[campaignId].id != 0, "Campaign does not exist");
        _;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address _systemContract,
        address _wzeta,
        address _feeRecipient
    ) {
        systemContract = SystemContract(_systemContract);
        wzeta = _wzeta;
        feeRecipient = _feeRecipient;
        
        // Start counters at 1 to avoid 0 IDs
        _campaignIdCounter.increment();
        _donationIdCounter.increment();
    }

    /*//////////////////////////////////////////////////////////////
                           CREATOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Register as a creator with preferred token
     * @param username Display name for the creator
     * @param preferredZRC20 ZRC20 token address creator wants to receive
     */
    function registerCreator(
        string memory username,
        address preferredZRC20
    ) external {
        require(bytes(username).length > 0, "Username required");
        require(preferredZRC20 != address(0), "Invalid token address");
        
        creators[msg.sender] = Creator({
            walletAddress: msg.sender,
            preferredZRC20: preferredZRC20,
            totalReceived: 0,
            campaignIds: new uint256[](0),
            username: username,
            verified: false,
            exists: true
        });

        emit CreatorRegistered(msg.sender, username, preferredZRC20);
    }

    /**
     * @notice Create a new fundraising campaign
     * @param title Campaign title
     * @param description Campaign description
     * @param category Campaign category
     * @param goal Fundraising goal in preferred token
     * @param deadline Campaign deadline (0 for no deadline)
     * @param imageHash IPFS hash for campaign image
     */
    function createCampaign(
        string memory title,
        string memory description,
        string memory category,
        uint256 goal,
        uint64 deadline,
        string memory imageHash
    ) external notPaused returns (uint256) {
        require(creators[msg.sender].exists, "Must register as creator first");
        require(bytes(title).length > 0, "Title required");
        require(goal > 0, "Goal must be positive");
        require(deadline == 0 || deadline > block.timestamp, "Invalid deadline");

        uint256 campaignId = _campaignIdCounter.current();
        _campaignIdCounter.increment();

        campaigns[campaignId] = Campaign({
            id: campaignId,
            creator: msg.sender,
            title: title,
            description: description,
            category: category,
            preferredZRC20: creators[msg.sender].preferredZRC20,
            goal: goal,
            totalRaised: 0,
            totalContributions: 0,
            createdAt: uint64(block.timestamp),
            deadline: deadline,
            active: true,
            fundsWithdrawn: false,
            imageHash: imageHash
        });

        // Update creator's campaign list
        creators[msg.sender].campaignIds.push(campaignId);
        creatorCampaigns[msg.sender].push(campaignId);
        
        // Add to category mapping
        if (bytes(category).length > 0) {
            categoryCampaigns[category].push(campaignId);
        }

        emit CampaignCreated(
            campaignId,
            msg.sender,
            title,
            category,
            creators[msg.sender].preferredZRC20,
            goal,
            deadline
        );

        return campaignId;
    }

    /**
     * @notice Update campaign details (creator only)
     */
    function updateCampaign(
        uint256 campaignId,
        string memory title,
        string memory description,
        bool active
    ) external onlyCreator(campaignId) campaignExists(campaignId) {
        Campaign storage campaign = campaigns[campaignId];
        
        if (bytes(title).length > 0) {
            campaign.title = title;
        }
        if (bytes(description).length > 0) {
            campaign.description = description;
        }
        campaign.active = active;

        emit CampaignUpdated(campaignId, title, description, active);
    }

    /*//////////////////////////////////////////////////////////////
                           DONATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Internal donation processing
     */
    function _processDonation(
        uint256 campaignId,
        address donor,
        address token,
        uint256 amount,
        string memory donorName,
        string memory message,
        uint64 originChainId,
        string memory originChainName
    ) internal campaignExists(campaignId) returns (uint256) {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.active, "Campaign not active");
        require(
            campaign.deadline == 0 || block.timestamp <= campaign.deadline,
            "Campaign deadline passed"
        );

        // Convert to campaign's preferred token if different
        uint256 convertedAmount = amount;
        address convertedToken = token;
        
        if (token != campaign.preferredZRC20) {
            convertedAmount = _swapToPreferredToken(
                token,
                campaign.preferredZRC20,
                amount
            );
            convertedToken = campaign.preferredZRC20;
        }

        // Take platform fee
        uint256 fee = (convertedAmount * platformFeePercent) / 10000;
        uint256 netAmount = convertedAmount - fee;

        // Create donation record
        uint256 donationId = _donationIdCounter.current();
        _donationIdCounter.increment();

        donations[donationId] = Donation({
            id: donationId,
            campaignId: campaignId,
            donor: donor,
            originalToken: token,
            convertedToken: convertedToken,
            originalAmount: amount,
            convertedAmount: netAmount,
            originChainId: originChainId,
            timestamp: uint64(block.timestamp),
            originChainName: originChainName,
            donorName: donorName,
            message: message
        });

        // Update campaign totals
        campaign.totalRaised += netAmount;
        campaign.totalContributions++;
        campaignDonations[campaignId].push(donationId);

        // Update creator totals
        creators[campaign.creator].totalReceived += netAmount;

        // Update donor profile
        if (donors[donor].walletAddress == address(0)) {
            donors[donor].walletAddress = donor;
        }
        donors[donor].totalDonated += netAmount;
        donors[donor].donationIds.push(donationId);
        donors[donor].campaignDonations[campaignId] += netAmount;

        // Transfer fee to platform
        if (fee > 0) {
            IZRC20(convertedToken).transfer(feeRecipient, fee);
        }

        emit DonationReceived(
            donationId,
            campaignId,
            donor,
            token,
            amount,
            netAmount,
            originChainName,
            donorName
        );

        return donationId;
    }

    /**
     * @notice Direct donation (for same-chain donations)
     */
    function donate(
        uint256 campaignId,
        address token,
        uint256 amount,
        string memory donorName,
        string memory message
    ) external payable nonReentrant notPaused {
        require(amount > 0, "Amount must be positive");

        if (token == address(0)) {
            // Native ZETA donation
            require(msg.value == amount, "Incorrect ZETA amount");
            // Wrap ZETA to WZETA
            IWETH9(wzeta).deposit{value: amount}();
            token = wzeta;
        } else {
            // ERC20/ZRC20 donation
            require(msg.value == 0, "No ZETA needed for token donation");
            IZRC20(token).transferFrom(msg.sender, address(this), amount);
        }

        _processDonation(
            campaignId,
            msg.sender,
            token,
            amount,
            donorName,
            message,
            uint64(block.chainid),
            "ZetaChain"
        );
    }

    /*//////////////////////////////////////////////////////////////
                        CROSS-CHAIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Handle cross-chain calls from other blockchains
     * @dev Called by ZetaChain system when receiving cross-chain transactions
     */
    function onCrossChainCall(
        zContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override onlySystem(systemContract) {
        // Decode the donation parameters from message
        (
            uint256 campaignId,
            string memory donorName,
            string memory donationMessage
        ) = abi.decode(message, (uint256, string, string));

        // Get origin chain info
        string memory originChain = _getChainName(context.chainID);

        _processDonation(
            campaignId,
            context.sender,
            zrc20,
            amount,
            donorName,
            donationMessage,
            uint64(context.chainID),
            originChain
        );
    }

    /**
     * @notice Handle cross-chain call reverts
     */
    function onCrossChainRevert(
        zContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external onlySystem(systemContract) {
        // For now, just emit event - could implement refund logic
        // In production, might want to store failed donations for manual processing
    }

    /*//////////////////////////////////////////////////////////////
                          WITHDRAWAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Withdraw raised funds (creator only)
     */
    function withdrawFunds(
        uint256 campaignId
    ) external onlyCreator(campaignId) campaignExists(campaignId) nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(!campaign.fundsWithdrawn, "Funds already withdrawn");
        require(campaign.totalRaised > 0, "No funds to withdraw");

        uint256 amount = campaign.totalRaised;
        address token = campaign.preferredZRC20;
        
        campaign.fundsWithdrawn = true;

        // Transfer funds to creator
        IZRC20(token).transfer(msg.sender, amount);

        emit FundsWithdrawn(campaignId, msg.sender, amount, token);
    }

    /*//////////////////////////////////////////////////////////////
                            HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Swap tokens using ZetaChain's built-in DEX
     * @dev This is a simplified version - in production, integrate with ZetaSwap or similar
     */
    function _swapToPreferredToken(
        address fromToken,
        address toToken,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        if (fromToken == toToken) {
            return amountIn;
        }

        // For now, use a simple 1:1 conversion rate
        // In production, integrate with actual DEX
        amountOut = amountIn;
        
        emit TokenSwapped(fromToken, toToken, amountIn, amountOut);
    }

    /**
     * @notice Get chain name from chain ID
     */
    function _getChainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 1) return "Ethereum";
        if (chainId == 56) return "BSC";
        if (chainId == 137) return "Polygon";
        if (chainId == 8332) return "Bitcoin";
        if (chainId == 7000) return "ZetaChain";
        return "Unknown";
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get campaign details
     */
    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    /**
     * @notice Get all campaigns by creator
     */
    function getCreatorCampaigns(address creator) external view returns (uint256[] memory) {
        return creatorCampaigns[creator];
    }

    /**
     * @notice Get all donations for a campaign
     */
    function getCampaignDonations(uint256 campaignId) external view returns (uint256[] memory) {
        return campaignDonations[campaignId];
    }

    /**
     * @notice Get campaigns by category
     */
    function getCampaignsByCategory(string memory category) external view returns (uint256[] memory) {
        return categoryCampaigns[category];
    }

    /**
     * @notice Get donation details
     */
    function getDonation(uint256 donationId) external view returns (Donation memory) {
        return donations[donationId];
    }

    /**
     * @notice Get total number of campaigns
     */
    function getTotalCampaigns() external view returns (uint256) {
        return _campaignIdCounter.current() - 1;
    }

    /**
     * @notice Get total number of donations
     */
    function getTotalDonations() external view returns (uint256) {
        return _donationIdCounter.current() - 1;
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Update platform fee (owner only)
     */
    function setPlatformFee(uint256 newFeePercent) external onlyOwner {
        require(newFeePercent <= 1000, "Fee too high"); // Max 10%
        platformFeePercent = newFeePercent;
    }

    /**
     * @notice Update fee recipient (owner only)
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid recipient");
        feeRecipient = newRecipient;
    }

    /**
     * @notice Pause/unpause contract (owner only)
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    /**
     * @notice Verify creator (owner only)
     */
    function verifyCreator(address creator, bool verified) external onlyOwner {
        require(creators[creator].exists, "Creator does not exist");
        creators[creator].verified = verified;
    }

    /**
     * @notice Emergency withdrawal (owner only)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IZRC20(token).transfer(owner(), amount);
    }
}
