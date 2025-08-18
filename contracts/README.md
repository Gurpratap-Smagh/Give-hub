# GiveHub Smart Contracts

Cross-chain crowdfunding platform built on ZetaChain Universal Apps framework.

## Overview

GiveHub enables creators to raise funds from any blockchain through ZetaChain's cross-chain infrastructure. Supporters can donate using Bitcoin, Ethereum, BSC, Polygon, and other supported chains, with funds automatically converted to the creator's preferred token.

## Features

- **Universal Cross-Chain Support**: Accept donations from any ZetaChain-connected blockchain
- **Automatic Token Conversion**: Donations are converted to creator's preferred ZRC20 token
- **Creator Verification**: Built-in verification system for trusted creators
- **Campaign Management**: Full lifecycle management with deadlines and categories
- **Platform Fees**: Configurable platform fees with transparent fee structure
- **Event-Driven**: All actions emit events for easy frontend integration

## Smart Contract Architecture

### GiveHubCrowdfund.sol
Main contract implementing ZetaChain's UniversalContract interface:

- **Creator Management**: Registration, verification, and profile management
- **Campaign Lifecycle**: Creation, updates, and fund withdrawal
- **Cross-Chain Donations**: Handle donations from any supported blockchain
- **Token Conversion**: Automatic conversion to preferred tokens via ZetaSwap
- **Fee Management**: Platform fee collection and distribution

## Deployment

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your private key and RPC URLs
```

### Deploy to ZetaChain Testnet

```bash
npm run deploy:testnet
```

### Deploy to ZetaChain Mainnet

```bash
npm run deploy:mainnet
```

### Verify Contract

```bash
npm run verify:testnet
# or
npm run verify:mainnet
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Deployment
PRIVATE_KEY=your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key
BSCSCAN_API_KEY=your_bscscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key

# RPC URLs (optional, defaults provided)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
MUMBAI_RPC_URL=https://rpc-mumbai.maticvigil.com/
```

## Testing

Run the test suite:

```bash
npm test
```

Run with coverage:

```bash
npm run coverage
```

## Contract Addresses

### ZetaChain Testnet (Athens-3)
- **GiveHubCrowdfund**: `TBD` (deploy first)
- **System Contract**: `0x239e96c8f17C85c30100AC26F635Ea15f23E9c67`
- **WZETA**: `0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf`

### ZetaChain Mainnet
- **GiveHubCrowdfund**: `TBD` (deploy first)
- **System Contract**: `0x91d18e54DAf4F677cB28167158d6dd21F6aB3921`
- **WZETA**: `0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf`

## Supported ZRC20 Tokens

### Testnet
- **ETH**: `0x65a45c57636f9BcCeD4fe193A602008578BcA90b`
- **BTC**: `0x13A0c5930C028511Dc02665E7285134B6d11A5f4`
- **BNB**: `0x48f80608B672DC30DC7e3dbBd0343c5F02C738Eb`
- **MATIC**: `0x3832d2F059E55934220881F831bE501D180671A7`
- **USDC**: `0x0cbe0dF132a6c6B4a2974Fa1b7Fb953CF0Cc798a`
- **USDT**: `0x7c8dDa80bbBE1254a7aACf3219EBe1481c6E01d7`

### Mainnet
- **ETH**: `0xd97B1de3619ed2c6BEb3860147E30cA8A7dC9891`
- **BTC**: `0x13A0c5930C028511Dc02665E7285134B6d11A5f4`
- **BNB**: `0x48f80608B672DC30DC7e3dbBd0343c5F02C738Eb`
- **MATIC**: `0x3832d2F059E55934220881F831bE501D180671A7`
- **USDC**: `0x0cbe0dF132a6c6B4a2974Fa1b7Fb953CF0Cc798a`
- **USDT**: `0x7c8dDa80bbBE1254a7aACf3219EBe1481c6E01d7`

## Usage Examples

### Register as Creator

```javascript
await crowdfund.registerCreator("MyUsername", WZETA_ADDRESS);
```

### Create Campaign

```javascript
await crowdfund.createCampaign(
  "Save the Forests",
  "Help us plant 1000 trees",
  "environment",
  ethers.parseEther("100"), // 100 WZETA goal
  Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
  "QmIPFSHash123"
);
```

### Make Donation

```javascript
// Native ZETA donation
await crowdfund.donate(
  campaignId,
  ethers.ZeroAddress,
  ethers.parseEther("10"),
  "Anonymous",
  "Great cause!",
  { value: ethers.parseEther("10") }
);

// ZRC20 token donation
await zrc20Token.approve(crowdfundAddress, amount);
await crowdfund.donate(
  campaignId,
  zrc20Address,
  amount,
  "Donor Name",
  "Keep up the good work!"
);
```

### Withdraw Funds

```javascript
await crowdfund.withdrawFunds(campaignId);
```

## Events

The contract emits the following events for frontend integration:

- `CampaignCreated(campaignId, creator, title, category, preferredZRC20, goal, deadline)`
- `DonationReceived(donationId, campaignId, donor, originalToken, originalAmount, convertedAmount, originChain, donorName)`
- `FundsWithdrawn(campaignId, creator, amount, token)`
- `CreatorRegistered(creator, username, preferredZRC20)`
- `CampaignUpdated(campaignId, title, description, active)`

## Security Considerations

- All external calls use OpenZeppelin's ReentrancyGuard
- Platform fees are capped at 10% maximum
- Only verified system contracts can trigger cross-chain functions
- Creator verification system prevents spam campaigns
- Emergency withdrawal function for admin recovery

## Gas Optimization

- Uses OpenZeppelin's Counters for efficient ID management
- Batch operations where possible
- Efficient storage patterns for mappings
- Events optimized for frontend queries

## Cross-Chain Integration

### From Ethereum
```javascript
// Use ZetaChain's connector contract
await zetaConnector.send(
  zetaChainId,
  crowdfundAddress,
  abi.encode(["uint256", "string", "string"], [campaignId, "Donor", "Message"]),
  { value: donationAmount }
);
```

### From Bitcoin
```javascript
// Use ZetaChain's Bitcoin integration
// Implementation depends on ZetaChain's Bitcoin connector
```

## Development

### Local Testing

1. Start local Hardhat network:
```bash
npx hardhat node
```

2. Deploy to local network:
```bash
npx hardhat run scripts/deploy.js --network localhost
```

3. Run tests:
```bash
npm test
```

### Integration with Frontend

The contract is designed to work seamlessly with the GiveHub frontend. Key integration points:

1. **Event Listening**: Frontend listens to contract events for real-time updates
2. **Campaign Data**: All campaign and donation data is stored on-chain
3. **Cross-Chain Support**: Frontend handles multi-chain wallet connections
4. **Token Selection**: Users can choose from supported ZRC20 tokens

## License

MIT License - see LICENSE file for details.

## Support

For technical support or questions:
- GitHub Issues: [Create an issue](https://github.com/givehub/contracts/issues)
- Documentation: [ZetaChain Docs](https://docs.zetachain.com)
- Discord: [ZetaChain Community](https://discord.gg/zetachain)