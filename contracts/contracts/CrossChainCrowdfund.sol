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
    address public immutable ZETA_TOKEN; // WZETA configured at deploy-time
    address public immutable ethZRC20;    // ZRC-20 for ETH
    address public immutable btcZRC20;    // ZRC-20 for BTC
    address public immutable usdcZRC20;   // ZRC-20 for USDC
    
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
        
        // NO-ESCROW: swap if needed, then forward to creator immediately
        address tokenOut = campaign.preferredZRC20;
        uint256 amountOut = amount;
        if (zrc20In != tokenOut) {
            amountOut = _swapTokens(zrc20In, tokenOut, amount);
        }
        IZRC20(tokenOut).transfer(campaign.creator, amountOut);
        
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
            tokenToChainName[zrc20In]
        );
    }

    /// @notice Accept native ZETA, wrap to WZETA, and forward immediately to the campaign creator (no-escrow)
    function donateNative(uint256 campaignId, string memory note) external payable {
        if (msg.value == 0) revert ZeroAmount();
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator == address(0)) revert InvalidCampaign();
        if (!campaign.active) revert CampaignInactive();

        // Wrap native ZETA to WZETA
        IWETH9(ZETA_TOKEN).deposit{value: msg.value}();

        // NO-ESCROW: swap WZETA to creator's preferred token if needed, then forward
        address tokenOut = campaign.preferredZRC20;
        uint256 amountOut = msg.value;
        if (tokenOut != ZETA_TOKEN) {
            amountOut = _swapTokens(ZETA_TOKEN, tokenOut, msg.value);
        }
        IZRC20(tokenOut).transfer(campaign.creator, amountOut);

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
            tokenToChainName[ZETA_TOKEN]
        );
        // 'note' currently unused but kept for analytics parity
        note; // silence unused var warning
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
