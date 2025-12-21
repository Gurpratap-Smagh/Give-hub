# yarn-commands.txt - Full sequence to setup, deploy, test

# 1. Install/update deps (fix versions)
yarn add @zetachain/toolkit@16.3.0
yarn install

# 2. Compile contracts
yarn compile

# 3. Start localnet + set .env
yarn localnet:start

# 4. Deploy Crowdfund
yarn deploy:crosschain:local

# 5. Test
yarn test

# 6. Stop localnet
yarn zetachain localnet stop --no-analytics
