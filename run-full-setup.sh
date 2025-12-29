#!/bin/bash
# run-full-setup.sh - One-click setup + deploy + test

echo "1. Updating toolkit..."
yarn add @zetachain/toolkit@16.3.0

echo "2. Installing deps..."
yarn install

echo "3. Compiling contracts..."
yarn compile

echo "4. Starting localnet + setting .env..."
yarn localnet:start

echo "5. Deploying Crowdfund..."
yarn deploy:crosschain:local

echo "6. Running tests..."
yarn test

echo "Done! Localnet is running. Deployed contract should be live."
