// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IGatewayZEVM.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";
import { RevertContext, RevertOptions } from "@zetachain/protocol-contracts/contracts/Revert.sol";

/* ---- ReentrancyGuard-lite ---- */
abstract contract ReentrancyGuardLite {
    uint256 private _gs = 1;
    modifier nonReentrant() { require(_gs == 1, "REENTRANCY"); _gs = 2; _; _gs = 1; }
}

contract GiveHubUniversal is UniversalContract, ReentrancyGuardLite {
    IGatewayZEVM public immutable gateway;
    
    struct Campaign {
        uint256 id;
        address creator;
        address payoutToken; // ZRC20 token address for payouts
        uint256 payoutChainId; // Chain ID where creator wants to receive funds
        address payoutAddress; // Creator's address on the payout chain
        uint256 raised;
        uint256 goal;
        bool active;
    }
    
    struct Contribution {
        uint256 campaignId;
        address donor;
        uint256 amount;
        address token;
        string originChain;
        uint256 timestamp;
    }
    
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => Contribution[]) public campaignContributions;
    uint256 public nextCampaignId = 1;
    
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        uint256 goal,
        address payoutToken,
        uint256 payoutChainId,
        address payoutAddress
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
    
    event PayoutInitiated(
        uint256 indexed campaignId,
        address indexed creator,
        uint256 amount,
        uint256 destinationChainId,
        address destinationAddress
    );
    
    constructor(address _gateway) {
        gateway = IGatewayZEVM(_gateway);
    }
    
    /**
     * @dev Creates a new campaign with cross-chain payout configuration
     */
    function createCampaign(
        uint256 _goal,
        address _payoutToken,
        uint256 _payoutChainId,
        address _payoutAddress
    ) external returns (uint256) {
        uint256 campaignId = nextCampaignId++;
        
        campaigns[campaignId] = Campaign({
            id: campaignId,
            creator: msg.sender,
            payoutToken: _payoutToken,
            payoutChainId: _payoutChainId,
            payoutAddress: _payoutAddress,
            raised: 0,
            goal: _goal,
            active: true
        });
        
        emit CampaignCreated(
            campaignId,
            msg.sender,
            _goal,
            _payoutToken,
            _payoutChainId,
            _payoutAddress
        );
        
        return campaignId;
    }
    
    /**
     * @dev Called when receiving cross-chain donations via Gateway
     */
    function onCall(
        MessageContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override nonReentrant {
        require(msg.sender == address(gateway), "Only gateway can call");
        
        // Decode the message to get campaign details
        (uint256 campaignId, string memory donorName, string memory note) = 
            abi.decode(message, (uint256, string, string));
        
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.active, "Campaign not active");
        
        // Update campaign raised amount
        campaign.raised += amount;
        
        // Derive a pseudo-address for donor from cross-chain context
        address donorAddr = _deriveDonorAddress(context);

        // Store contribution
        campaignContributions[campaignId].push(Contribution({
            campaignId: campaignId,
            donor: donorAddr,
            amount: amount,
            token: zrc20,
            originChain: getChainName(context.chainID),
            timestamp: block.timestamp
        }));
        
        emit ContributionReceived(
            campaignId,
            donorAddr,
            campaignContributions[campaignId].length - 1,
            zrc20,
            amount,
            amount,
            getChainName(context.chainID),
            donorName,
            note
        );
    }
    
    /**
     * @dev Initiates payout to creator's chosen chain
     */
    function withdrawToCreator(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.creator, "Only creator can withdraw");
        require(campaign.raised > 0, "No funds to withdraw");
        
        uint256 amount = campaign.raised;
        campaign.raised = 0;
        
        // Get the ZRC20 token for payout
        IZRC20 payoutToken = IZRC20(campaign.payoutToken);
        
        // Calculate gas fee and require gas token equals payout token (no swap logic here)
        uint256 gasLimit = 200000;
        (address gasZRC20, uint256 gasFee) = payoutToken.withdrawGasFeeWithGasLimit(gasLimit);
        require(gasZRC20 == campaign.payoutToken, "GAS_TOKEN_MISMATCH");
        require(amount > gasFee, "Amount too small to cover gas");

        uint256 withdrawAmount = amount - gasFee;

        // Approve gateway to spend tokens (both withdraw amount and gas fee)
        payoutToken.approve(address(gateway), 0);
        payoutToken.approve(address(gateway), withdrawAmount + gasFee);
        
        // Initiate cross-chain withdrawal
        gateway.withdraw(
            abi.encodePacked(campaign.payoutAddress),
            withdrawAmount,
            campaign.payoutToken,
            RevertOptions({
                revertAddress: address(this),
                callOnRevert: true,
                abortAddress: address(0),
                revertMessage: abi.encode(campaignId),
                onRevertGasLimit: gasLimit
            })
        );
        
        emit PayoutInitiated(
            campaignId,
            campaign.creator,
            withdrawAmount,
            campaign.payoutChainId,
            campaign.payoutAddress
        );
    }
    
    /**
     * @dev Direct donation in ZRC20 tokens (already on ZetaChain)
     */
    function donateDirectly(
        uint256 campaignId,
        address zrc20Token,
        uint256 amount,
        string memory donorName,
        string memory note
    ) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.active, "Campaign not active");
        
        // Transfer tokens from donor
        IZRC20(zrc20Token).transferFrom(msg.sender, address(this), amount);
        
        // Update campaign
        campaign.raised += amount;
        
        // Store contribution
        campaignContributions[campaignId].push(Contribution({
            campaignId: campaignId,
            donor: msg.sender,
            amount: amount,
            token: zrc20Token,
            originChain: "ZetaChain",
            timestamp: block.timestamp
        }));
        
        emit ContributionReceived(
            campaignId,
            msg.sender,
            campaignContributions[campaignId].length - 1,
            zrc20Token,
            amount,
            amount,
            "ZetaChain",
            donorName,
            note
        );
    }
    
    /**
     * @dev Updates campaign payout configuration
     */
    function updatePayoutConfig(
        uint256 campaignId,
        address newPayoutToken,
        uint256 newPayoutChainId,
        address newPayoutAddress
    ) external {
        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.creator, "Only creator can update");
        
        campaign.payoutToken = newPayoutToken;
        campaign.payoutChainId = newPayoutChainId;
        campaign.payoutAddress = newPayoutAddress;
    }
    
    /**
     * @dev Closes a campaign
     */
    function closeCampaign(uint256 campaignId) external {
        Campaign storage campaign = campaigns[campaignId];
        require(msg.sender == campaign.creator, "Only creator can close");
        campaign.active = false;
    }
    
    /**
     * @dev Helper to get chain name from chain ID
     */
    function getChainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 1) return "Ethereum";
        if (chainId == 56) return "BSC";
        if (chainId == 137) return "Polygon";
        if (chainId == 11155111) return "Sepolia";
        if (chainId == 7001) return "ZetaChain";
        if (chainId == 901) return "Solana";
        if (chainId == 18332) return "Bitcoin";
        return "Unknown";
    }

    // Derive a stable pseudo-address for logs/accounting from cross-chain context
    function _deriveDonorAddress(MessageContext calldata ctx) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(ctx.sender, ctx.chainID)))));
    }
    
    /**
     * @dev Get campaign details
     */
    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }
    
    /**
     * @dev Get contributions for a campaign
     */
    function getContributions(uint256 campaignId) external view returns (Contribution[] memory) {
        return campaignContributions[campaignId];
    }

    /**
     * @dev Fallback handler for cross-chain payout reverts. Sends the returned funds to the campaign creator.
     */
    function onRevert(RevertContext calldata revertContext) external {
        require(msg.sender == address(gateway), "Only gateway can call");
        // We encoded only campaignId in revert message
        (uint256 campaignId) = abi.decode(revertContext.revertMessage, (uint256));
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator != address(0)) {
            // Transfer returned asset back to campaign creator on ZEVM
            IZRC20(revertContext.asset).transfer(campaign.creator, revertContext.amount);
        }
    }
}
