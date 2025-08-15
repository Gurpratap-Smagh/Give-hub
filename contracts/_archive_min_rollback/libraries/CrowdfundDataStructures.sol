// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CrowdfundDataStructures
 * @notice Gas-optimized data structures for the CrossChainCrowdfund system
 * @dev Packed structs to minimize storage slots and reduce gas costs
 */
library CrowdfundDataStructures {
    /*//////////////////////////////////////////////////////////////
                            PACKED STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Packed campaign data structure (optimized for storage)
     * @dev Fits in 4 storage slots for gas efficiency
     */
    struct PackedCampaign {
        address creator;              // 20 bytes - slot 1
        address preferredZRC20;       // 20 bytes - slot 2
        uint128 goal;                 // 16 bytes - slot 3 (first half)
        uint128 totalRaised;          // 16 bytes - slot 3 (second half)
        uint64 createdAt;             // 8 bytes - slot 4 (first quarter)
        uint64 deadline;              // 8 bytes - slot 4 (second quarter)
        uint32 totalContributions;    // 4 bytes - slot 4 (third quarter)
        bool active;                  // 1 byte - slot 4 (packed)
        bool fundsWithdrawn;          // 1 byte - slot 4 (packed)
        bool goalReached;             // 1 byte - slot 4 (packed)
    }
    
    /**
     * @notice Packed contribution record (optimized for storage)
     * @dev Fits in 3 storage slots for gas efficiency
     */
    struct PackedContribution {
        uint256 campaignId;           // 32 bytes - slot 1
        address donor;                // 20 bytes - slot 2
        address originalToken;        // 20 bytes - slot 3
        uint128 originalAmount;       // 16 bytes - slot 4 (first half)
        uint128 convertedAmount;      // 16 bytes - slot 4 (second half)
        uint64 timestamp;             // 8 bytes - slot 5 (first quarter)
        uint64 originChainId;         // 8 bytes - slot 5 (second quarter)
    }
    
    /**
     * @notice Packed creator profile (optimized for storage)
     * @dev Fits in 2 storage slots for gas efficiency
     */
    struct PackedCreator {
        address walletAddress;        // 20 bytes - slot 1
        address preferredZRC20;       // 20 bytes - slot 2
        uint128 totalReceived;        // 16 bytes - slot 3 (first half)
        uint32 totalCampaigns;        // 4 bytes - slot 3 (remaining)
        bool exists;                  // 1 byte - slot 3 (packed)
    }
    
    /**
     * @notice Packed donor profile (optimized for storage)
     * @dev Fits in 2 storage slots for gas efficiency
     */
    struct PackedDonor {
        address walletAddress;        // 20 bytes - slot 1
        uint128 totalDonated;         // 16 bytes - slot 2 (first half)
        uint32 totalContributions;    // 4 bytes - slot 2 (remaining)
        bool exists;                  // 1 byte - slot 2 (packed)
    }
    
    /*//////////////////////////////////////////////////////////////
                           HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Convert packed campaign to readable format
     * @param packed Packed campaign struct
     * @return Campaign data in readable format
     */
    function unpackCampaign(PackedCampaign memory packed) 
        internal 
        pure 
        returns (
            address creator,
            address preferredZRC20,
            uint256 goal,
            uint256 totalRaised,
            uint256 createdAt,
            uint256 deadline,
            uint256 totalContributions,
            bool active,
            bool fundsWithdrawn,
            bool goalReached
        ) 
    {
        return (
            packed.creator,
            packed.preferredZRC20,
            uint256(packed.goal),
            uint256(packed.totalRaised),
            uint256(packed.createdAt),
            uint256(packed.deadline),
            uint256(packed.totalContributions),
            packed.active,
            packed.fundsWithdrawn,
            packed.goalReached
        );
    }
    
    /**
     * @notice Pack campaign data for storage
     * @param creator Campaign creator address
     * @param preferredZRC20 Preferred token address
     * @param goal Campaign goal amount
     * @param totalRaised Total amount raised
     * @param createdAt Creation timestamp
     * @param deadline Campaign deadline
     * @param totalContributions Number of contributions
     * @param active Whether campaign is active
     * @param fundsWithdrawn Whether funds were withdrawn
     * @param goalReached Whether goal was reached
     * @return packed Packed campaign struct
     */
    function packCampaign(
        address creator,
        address preferredZRC20,
        uint256 goal,
        uint256 totalRaised,
        uint256 createdAt,
        uint256 deadline,
        uint256 totalContributions,
        bool active,
        bool fundsWithdrawn,
        bool goalReached
    ) internal pure returns (PackedCampaign memory packed) {
        require(goal <= type(uint128).max, "Goal too large");
        require(totalRaised <= type(uint128).max, "Total raised too large");
        require(createdAt <= type(uint64).max, "CreatedAt too large");
        require(deadline <= type(uint64).max, "Deadline too large");
        require(totalContributions <= type(uint32).max, "Too many contributions");
        
        packed = PackedCampaign({
            creator: creator,
            preferredZRC20: preferredZRC20,
            goal: uint128(goal),
            totalRaised: uint128(totalRaised),
            createdAt: uint64(createdAt),
            deadline: uint64(deadline),
            totalContributions: uint32(totalContributions),
            active: active,
            fundsWithdrawn: fundsWithdrawn,
            goalReached: goalReached
        });
    }
    
    /**
     * @notice Calculate campaign progress percentage
     * @param totalRaised Amount raised so far
     * @param goal Campaign goal
     * @return percentage Progress as percentage (0-10000 for 0-100.00%)
     */
    function calculateProgress(uint256 totalRaised, uint256 goal) 
        internal 
        pure 
        returns (uint256 percentage) 
    {
        if (goal == 0) return 0;
        return (totalRaised * 10000) / goal;
    }
    
    /**
     * @notice Check if campaign deadline has passed
     * @param deadline Campaign deadline timestamp
     * @return expired Whether campaign has expired
     */
    function isExpired(uint256 deadline) internal view returns (bool expired) {
        return block.timestamp > deadline;
    }
    
    /**
     * @notice Check if campaign goal is reached
     * @param totalRaised Amount raised so far
     * @param goal Campaign goal
     * @return reached Whether goal is reached
     */
    function isGoalReached(uint256 totalRaised, uint256 goal) 
        internal 
        pure 
        returns (bool reached) 
    {
        return totalRaised >= goal;
    }
    
    /*//////////////////////////////////////////////////////////////
                           BATCH OPERATIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Batch calculate progress for multiple campaigns
     * @param totalRaisedArray Array of amounts raised
     * @param goalArray Array of campaign goals
     * @return percentages Array of progress percentages
     */
    function batchCalculateProgress(
        uint256[] memory totalRaisedArray,
        uint256[] memory goalArray
    ) internal pure returns (uint256[] memory percentages) {
        require(totalRaisedArray.length == goalArray.length, "Array length mismatch");
        
        percentages = new uint256[](totalRaisedArray.length);
        for (uint256 i = 0; i < totalRaisedArray.length; i++) {
            percentages[i] = calculateProgress(totalRaisedArray[i], goalArray[i]);
        }
    }
    
    /**
     * @notice Batch check campaign expiration
     * @param deadlines Array of campaign deadlines
     * @return expired Array of expiration statuses
     */
    function batchCheckExpired(uint256[] memory deadlines) 
        internal 
        view 
        returns (bool[] memory expired) 
    {
        expired = new bool[](deadlines.length);
        for (uint256 i = 0; i < deadlines.length; i++) {
            expired[i] = isExpired(deadlines[i]);
        }
    }
}