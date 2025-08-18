contract CrowdfundingCampaign is UniversalContract {
    GatewayZEVM public immutable gateway;
    
    struct Campaign {
        address creator;
        string name;
        string description;
        uint256 goalAmount;
        uint256 deadline;
        bool active;
        mapping(address => mapping(address => uint256)) donatedByToken;
    }
    
    mapping(uint256 => Campaign) public campaigns;
    uint256 public campaignCounter;
    
    event CampaignCreated(uint256 indexed campaignId, address creator, string name);
    event DonationReceived(uint256 indexed campaignId, address donor, address token, uint256 amount);
    
    function onCall(
        MessageContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override onlyGateway {
        // Decode donation parameters from message
        (uint256 campaignId, string memory donorName) = abi.decode(message, (uint256, string));
        
        // Record donation
        campaigns[campaignId].donatedByToken[context.sender][zrc20] += amount;
        
        // Emit event for tracking
        emit DonationReceived(campaignId, context.sender, zrc20, amount);
    }
}
