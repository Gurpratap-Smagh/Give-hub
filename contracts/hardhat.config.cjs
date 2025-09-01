// Proxy to the TypeScript config to avoid duplicate configs
require("ts-node/register");
module.exports = require("./hardhat.config.ts").default;
