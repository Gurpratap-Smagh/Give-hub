#!/usr/bin/env bash

# Step 1: Create campaign with preferred token = BNB ZRC20
cast send $CONTRACT "createCampaign(address)" $ZRC20_BNB --private-key $PRIVATE_KEY --rpc-url $RPC

# Step 2: Set payout to creator's address on BNB chain (cross-chain payout)
cast send $CONTRACT "updateCampaignDestination(uint256,address,uint256)" $CAMPAIGN_ID $CREATOR_ADDR 500000 --private-key $PRIVATE_KEY --rpc-url $RPC

# Step 3: Check initial balances
echo "Initial balances:"
echo "Creator native BNB balance on BNB chain: $(cast balance $CREATOR_ADDR --rpc-url $BNB_RPC)"
echo "Contract ZRC20_ETH balance on ZetaChain: $(cast call $ZRC20_ETH "balanceOf(address)(uint256)" $CONTRACT --rpc-url $RPC)"
echo "Donor native ETH balance on ETH chain (approx, for refund check): $(cast balance $CREATOR_ADDR --rpc-url $ETH_RPC)"

# Step 4: Simulate donation from ETH chain (ETH -> BNB payout)
npx zetachain evm deposit-and-call --rpc $RPC --chain-id $ETH_CHAIN_ID --gateway $ETH_GATEWAY --amount 100 --types uint256 string string --receiver $CONTRACT --private-key $PRIVATE_KEY --values $CAMPAIGN_ID 'CyberGeek' 'To the moon!' --no-analytics --yes

sleep 5  # Wait for localnet processing

# Step 5: Check final balances & logs
echo "Final balances:"
echo "Creator native BNB balance on BNB chain (should increase by ~converted amount): $(cast balance $CREATOR_ADDR --rpc-url $BNB_RPC)"
echo "Contract ZRC20_ETH balance on ZetaChain (should be low/zero): $(cast call $ZRC20_ETH "balanceOf(address)(uint256)" $CONTRACT --rpc-url $RPC)"

# Check ContributionReceived event logs
cast logs --address $CONTRACT --rpc-url $RPC $EVENT_TOPIC

# Check contribution struct
cast call $CONTRACT "contributions(uint256)" 1 --rpc-url $RPC

# Step 6: Test revert (insufficient gas)
echo "Testing revert with low gas limit..."
cast send $CONTRACT "updateCampaignDestination(uint256,address,uint256)" $CAMPAIGN_ID $CREATOR_ADDR 1000 --private-key $PRIVATE_KEY --rpc-url $RPC

# Send another donation (should revert and refund)
npx zetachain evm deposit-and-call --rpc $RPC --chain-id $ETH_CHAIN_ID --gateway $ETH_GATEWAY --amount 100 --types uint256 string string --receiver $CONTRACT --private-key $PRIVATE_KEY --values $CAMPAIGN_ID 'CyberGeek' 'Revert test!' --no-analytics --yes

sleep 5

echo "After revert attempt:"
echo "Creator native BNB balance (should not increase): $(cast balance $CREATOR_ADDR --rpc-url $BNB_RPC)"
# Check if refunded (donor balance should be similar to initial, minus gas)
echo "Donor native ETH balance after (should be refunded, approx): $(cast balance $CREATOR_ADDR --rpc-url $ETH_RPC)"
cast logs --address $CONTRACT --rpc-url $RPC $EVENT_TOPIC  # Look for no new event or revert logs
