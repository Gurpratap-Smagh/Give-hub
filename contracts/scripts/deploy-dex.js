const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying DEX with account:", deployer.address);
    
    const WZETA = process.env.WZETA_ADDRESS;
    if (!WZETA) {
        throw new Error("WZETA_ADDRESS not set in environment");
    }
    console.log("Using WZETA:", WZETA);

    // Deploy test tokens to simulate ZRC-20 ETH/BTC locally (mintable ERC20s)
    console.log("Deploying test tokens...");
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    
    const ETHZ = await TestERC20.deploy("ETH-ZRC20", "ETHZ");
    await ETHZ.waitForDeployment();
    console.log("ETHZ deployed to:", await ETHZ.getAddress());
    
    const BTCZ = await TestERC20.deploy("BTC-ZRC20", "BTCZ");
    await BTCZ.waitForDeployment();
    console.log("BTCZ deployed to:", await BTCZ.getAddress());

    // Deploy minimal Uniswap v2 factory
    console.log("Deploying Uniswap V2 Factory...");
    const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    const factory = await UniswapV2Factory.deploy(deployer.address);
    await factory.waitForDeployment();
    console.log("Factory deployed to:", await factory.getAddress());

    // Deploy Uniswap v2 router
    console.log("Deploying Uniswap V2 Router...");
    const WETH9 = WZETA; // treat WZETA as WETH for router
    const UniswapV2Router02 = await ethers.getContractFactory("UniswapV2Router02");
    const router = await UniswapV2Router02.deploy(await factory.getAddress(), WETH9);
    await router.waitForDeployment();
    console.log("Router deployed to:", await router.getAddress());

    // Mint tokens to deployer for seeding liquidity
    console.log("Minting tokens for liquidity...");
    const mintAmount = ethers.parseEther("500000");
    await (await ETHZ.mint(deployer.address, mintAmount)).wait();
    await (await BTCZ.mint(deployer.address, mintAmount)).wait();
    console.log("Minted tokens to deployer");

    // Get WZETA contract and wrap some native ZETA
    console.log("Wrapping ZETA to WZETA...");
    const IWETH9 = await ethers.getContractAt("IWETH9", WZETA);
    const wrapAmount = ethers.parseEther("1000");
    await (await IWETH9.deposit({ value: wrapAmount })).wait();
    console.log("Wrapped", ethers.formatEther(wrapAmount), "ZETA to WZETA");

    // Approve router for all tokens
    console.log("Approving router for tokens...");
    const approveAmount = ethers.parseEther("1000000");
    await (await IWETH9.approve(await router.getAddress(), approveAmount)).wait();
    await (await ETHZ.approve(await router.getAddress(), approveAmount)).wait();
    await (await BTCZ.approve(await router.getAddress(), approveAmount)).wait();
    console.log("Router approved for all tokens");

    // Add liquidity for WZETA-ETHZ pair
    console.log("Adding WZETA-ETHZ liquidity...");
    const liquidityAmount = ethers.parseEther("500");
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;
    
    await (await router.addLiquidity(
        WZETA,
        await ETHZ.getAddress(),
        liquidityAmount,
        liquidityAmount,
        0n,
        0n,
        deployer.address,
        deadline
    )).wait();
    console.log("Added WZETA-ETHZ liquidity");

    // Add liquidity for WZETA-BTCZ pair
    console.log("Adding WZETA-BTCZ liquidity...");
    await (await router.addLiquidity(
        WZETA,
        await BTCZ.getAddress(),
        liquidityAmount,
        liquidityAmount,
        0n,
        0n,
        deployer.address,
        deadline
    )).wait();
    console.log("Added WZETA-BTCZ liquidity");

    // Test a small swap to verify everything works
    console.log("Testing swap functionality...");
    const swapAmount = ethers.parseEther("1");
    const path = [WZETA, await ETHZ.getAddress()];
    
    try {
        await (await router.swapExactTokensForTokens(
            swapAmount,
            0n,
            path,
            deployer.address,
            deadline
        )).wait();
        console.log("✅ Swap test successful!");
    } catch (error) {
        console.log("❌ Swap test failed:", error.message);
    }

    console.log("\n=== DEPLOYMENT SUMMARY ===");
    console.log("ROUTER:", await router.getAddress());
    console.log("FACTORY:", await factory.getAddress());
    console.log("ETHZ:", await ETHZ.getAddress());
    console.log("BTCZ:", await BTCZ.getAddress());
    console.log("WZETA:", WZETA);
    
    console.log("\n=== ENVIRONMENT VARIABLES ===");
    console.log(`NEXT_PUBLIC_UNISWAP_ROUTER=${await router.getAddress()}`);
    console.log(`NEXT_PUBLIC_ETHZ_ADDRESS=${await ETHZ.getAddress()}`);
    console.log(`NEXT_PUBLIC_BTCZ_ADDRESS=${await BTCZ.getAddress()}`);
    
    console.log("\n=== NEXT STEPS ===");
    console.log("1. Wire the CrossChainCrowdfund contract to the router:");
    console.log(`   await crossChainCrowdfund.setUniswapRouter("${await router.getAddress()}")`);
    console.log("2. Update your .env files with the addresses above");
    console.log("3. Test token swaps in your campaigns!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
