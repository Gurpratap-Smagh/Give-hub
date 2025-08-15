// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "openzeppelin-contracts/security/ReentrancyGuard.sol";
import {Ownable} from "openzeppelin-contracts/access/Ownable.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

/**
 * @title BaseForwardFundraiser
 * @notice Minimal abstract base for a direct forward crowdfunding model.
 *         Funds are never escrowed; donations are forwarded immediately to the
 *         campaign creator. Only minimal aggregate state is stored on-chain; all
 *         detailed history should be indexed from events off-chain.
 */
abstract contract BaseForwardFundraiser is ReentrancyGuard, Ownable {

    // =============================================================
    //                          ERRORS
    // =============================================================
    error CampaignDoesNotExist();
    error CampaignInactive();
    error InvalidTimeWindow();
    error ZeroAmount();
    error ETHAmountMismatch();
    error ForwardFailed();

    // =============================================================
    //                          EVENTS
    // =============================================================
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address indexed preferredToken,
        uint96 start,
        uint96 end
    );

    event CampaignStatus(
        uint256 indexed campaignId,
        bool active
    );

    event Donation(
        uint256 indexed campaignId,
        address indexed donor,
        address indexed token,
        uint256 amount,
        string memo
    );

    // =============================================================
    //                          STORAGE
    // =============================================================
    struct Campaign {
        address creator;          // recipient of forwarded funds
        address preferredToken;   // address(0) for native token
        uint96 start;             // start timestamp
        uint96 end;               // end timestamp (0 for no end)
        bool active;              // toggled by creator/owner
        uint256 totalDonated;     // aggregate total donated (all tokens)
    }

    // campaignId => Campaign
    mapping(uint256 => Campaign) public campaigns;

    // campaignId => donor => token => amount
    mapping(uint256 => mapping(address => mapping(address => uint256))) public donatedByToken;

    uint256 public nextCampaignId;

    // =============================================================
    //                        CONSTRUCTOR
    // =============================================================
    // NOTE: Using OpenZeppelin v5 style Ownable
    // TODO: If you use OZ v4, REPLACE with:
    // constructor(address initialOwner) Ownable() { transferOwnership(initialOwner); }
    constructor(address initialOwner) Ownable(initialOwner) {}

    // =============================================================
    //                     CAMPAIGN MANAGEMENT
    // =============================================================
    function createCampaign(
        address preferredToken,
        uint96 start,
        uint96 end
    ) external returns (uint256 campaignId) {
        if (end != 0 && end <= start) revert InvalidTimeWindow();
        campaignId = ++nextCampaignId;
        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            preferredToken: preferredToken,
            start: start,
            end: end,
            active: true,
            totalDonated: 0
        });
        emit CampaignCreated(campaignId, msg.sender, preferredToken, start, end);
        emit CampaignStatus(campaignId, true);
    }

    function setActive(uint256 campaignId, bool active_) external {
        Campaign storage c = campaigns[campaignId];
        if (c.creator == address(0)) revert CampaignDoesNotExist();
        if (msg.sender != c.creator && msg.sender != owner()) revert OwnableUnauthorizedAccount(msg.sender);
        c.active = active_;
        emit CampaignStatus(campaignId, active_);
    }

    // =============================================================
    //                        DONATIONS
    // =============================================================
    /**
     * @notice Donate to a campaign. If token == address(0), send native token with msg.value.
     *         Otherwise, amount is pulled via transferFrom, then forwarded to the creator.
     */
    function donate(
        uint256 campaignId,
        address token,
        uint256 amount,
        string calldata memo
    ) external payable nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.creator == address(0)) revert CampaignDoesNotExist();
        if (!c.active) revert CampaignInactive();
        if (c.start != 0 && block.timestamp < c.start) revert CampaignInactive();
        if (c.end != 0 && block.timestamp > c.end) revert CampaignInactive();
        if (amount == 0) revert ZeroAmount();

        if (token == address(0)) {
            if (msg.value != amount) revert ETHAmountMismatch();
            (bool ok, ) = payable(c.creator).call{value: amount}("");
            if (!ok) revert ForwardFailed();
        } else {
            if (msg.value != 0) revert ETHAmountMismatch();
            // pull then forward
            IERC20(token).transferFrom(msg.sender, address(this), amount);
            bool ok = IERC20(token).transfer(c.creator, amount);
            if (!ok) revert ForwardFailed();
        }

        // update aggregates
        c.totalDonated += amount;
        donatedByToken[campaignId][msg.sender][token] += amount;

        emit Donation(campaignId, msg.sender, token, amount, memo);
    }

    // =============================================================
    //                          VIEWS
    // =============================================================
    function exists(uint256 campaignId) public view returns (bool) {
        return campaigns[campaignId].creator != address(0);
    }

    function donatedOf(
        uint256 campaignId,
        address donor,
        address token
    ) external view returns (uint256) {
        return donatedByToken[campaignId][donor][token];
    }
}
