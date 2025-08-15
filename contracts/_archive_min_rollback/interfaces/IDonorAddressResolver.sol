// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";

/**
 * @title IDonorAddressResolver
 * @notice Interface for resolving cross-chain donor addresses to canonical ZEVM addresses
 * @dev Handles address derivation from different blockchain formats (Bitcoin, Ethereum, Solana)
 */
interface IDonorAddressResolver {
    /*//////////////////////////////////////////////////////////////
                               EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event AddressResolved(
        uint256 indexed chainId,
        bytes indexed originalSender,
        address indexed resolvedAddress,
        string chainName
    );
    
    event ChainMappingAdded(
        uint256 indexed chainId,
        string chainName
    );
    
    event DerivationNonceUpdated(
        bytes32 indexed senderHash,
        uint256 oldNonce,
        uint256 newNonce
    );
    
    /*//////////////////////////////////////////////////////////////
                               ERRORS
    //////////////////////////////////////////////////////////////*/
    
    error UnsupportedChain();
    error InvalidSenderFormat();
    error AddressCollision();
    error InvalidChainId();
    
    /*//////////////////////////////////////////////////////////////
                         RESOLUTION FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Resolve donor address from cross-chain context
     * @param ctx Message context from ZetaChain universal contract
     * @return resolvedAddress Canonical ZEVM address for the donor
     */
    function resolveDonorAddress(
        MessageContext calldata ctx
    ) external view returns (address resolvedAddress);
    
    /**
     * @notice Get canonical address for a specific chain and sender
     * @param chainId Origin chain ID
     * @param sender Original sender bytes from origin chain
     * @return canonicalAddress Resolved ZEVM address
     */
    function getCanonicalAddress(
        uint256 chainId,
        bytes calldata sender
    ) external view returns (address canonicalAddress);
    
    /**
     * @notice Get origin information for a resolved ZEVM address
     * @param zevmAddress Resolved ZEVM address
     * @return chainId Origin chain ID
     * @return sender Original sender bytes
     * @return chainName Human-readable chain name
     */
    function getOriginInfo(
        address zevmAddress
    ) external view returns (
        uint256 chainId,
        bytes memory sender,
        string memory chainName
    );
    
    /*//////////////////////////////////////////////////////////////
                          VALIDATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Validate sender format for specific chain
     * @param chainId Chain ID to validate against
     * @param sender Sender bytes to validate
     * @return valid Whether format is valid for the chain
     */
    function validateSenderFormat(
        uint256 chainId,
        bytes calldata sender
    ) external view returns (bool valid);
    
    /**
     * @notice Check if address was derived from cross-chain transaction
     * @param addr Address to check
     * @return isCrossChain Whether address is from cross-chain derivation
     */
    function isCrossChainAddress(
        address addr
    ) external view returns (bool isCrossChain);
    
    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Get supported chain IDs
     * @return chainIds Array of supported chain IDs
     */
    function getSupportedChains() external view returns (uint256[] memory chainIds);
    
    /**
     * @notice Get chain name for chain ID
     * @param chainId Chain ID
     * @return chainName Human-readable chain name
     */
    function getChainName(uint256 chainId) external view returns (string memory chainName);
    
    /**
     * @notice Get derivation nonce for sender (used for collision resolution)
     * @param senderHash Hash of original sender
     * @return nonce Current derivation nonce
     */
    function getDerivationNonce(bytes32 senderHash) external view returns (uint256 nonce);
    
    /*//////////////////////////////////////////////////////////////
                           ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Add new supported chain mapping
     * @param chainId Chain ID to add
     * @param chainName Human-readable chain name
     */
    function addChainMapping(uint256 chainId, string calldata chainName) external;
    
    /**
     * @notice Update derivation nonce for collision resolution
     * @param senderHash Hash of original sender
     * @param newNonce New nonce value
     */
    function updateDerivationNonce(bytes32 senderHash, uint256 newNonce) external;
    
    /**
     * @notice Batch resolve multiple addresses
     * @param contexts Array of message contexts
     * @return addresses Array of resolved addresses
     */
    function batchResolveAddresses(
        MessageContext[] calldata contexts
    ) external view returns (address[] memory addresses);
}