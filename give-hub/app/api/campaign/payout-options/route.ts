// app/api/campaign/payout-options/route.ts
// Returns available blockchains and their tokens for payout selection
// Hardcoded popular testnet options as of December 2025
import { NextResponse } from 'next/server';

interface PayoutOption {
  value: string;
  label: string;
  zrc20Address: string | null;
  chainId: number | null;
  symbol: string;
}

interface Chain {
  id: number;
  name: string;
}

export async function GET() {
  try {
    // Hardcoded popular testnet options (current ZetaChain registry as of Dec 2025)
    // These match real ZRC20 addresses on ZetaChain Athens testnet
    const options: PayoutOption[] = [
      {
        value: "native_zeta",
        label: "Native ZETA (on ZetaChain)",
        zrc20Address: null,
        chainId: null,
        symbol: "ZETA"
      },
      {
        value: "0x05BA149A7bd6dC1F937fA9046A9e05C05f3b18b0",
        label: "Ethereum Sepolia (zETH)",
        zrc20Address: "0x05BA149A7bd6dC1F937fA9046A9e05C05f3b18b0",
        chainId: 11155111,
        symbol: "zETH"
      },
      {
        value: "0xd97B1de3619ed2c6BEb3860147E30cA8A7dC9891",
        label: "BNB Chain Testnet (zBNB)",
        zrc20Address: "0xd97B1de3619ed2c6BEb3860147E30cA8A7dC9891",
        chainId: 97,
        symbol: "zBNB"
      },
      {
        value: "0xcC683A782f4B30c138787CB5576a86AF66fdc31d",
        label: "USDC from Sepolia (zUSDC)",
        zrc20Address: "0xcC683A782f4B30c138787CB5576a86AF66fdc31d",
        chainId: 11155111,
        symbol: "zUSDC"
      },
      {
        value: "0x65a45c57636f9BcCeD4fe193A602008578BcA90b",
        label: "Bitcoin Testnet (sBTC)",
        zrc20Address: "0x65a45c57636f9BcCeD4fe193A602008578BcA90b",
        chainId: 1833,
        symbol: "sBTC"
      },
      {
        value: "0xEe9CC614D03e7Dbe994b514079f4914a605B4719",
        label: "Avalanche Fuji (zAVAX)",
        zrc20Address: "0xEe9CC614D03e7Dbe994b514079f4914a605B4719",
        chainId: 43113,
        symbol: "zAVAX"
      },
      {
        value: "0xD8E65B53eFc37cD43540D1B2372587e758f32D35",
        label: "Polygon Mumbai (zPOL)",
        zrc20Address: "0xD8E65B53eFc37cD43540D1B2372587e758f32D35",
        chainId: 80001,
        symbol: "zPOL"
      }
    ];

    // Extract unique chains for the selector
    const chainsMap = new Map<number | null, string>();
    chainsMap.set(null, "ZetaChain");
    options.forEach(opt => {
      if (opt.chainId) {
        const chainNames: Record<number, string> = {
          11155111: "Ethereum Sepolia",
          97: "BNB Chain Testnet",
          1833: "Bitcoin Testnet",
          43113: "Avalanche Fuji",
          80001: "Polygon Mumbai"
        };
        chainsMap.set(opt.chainId, chainNames[opt.chainId] || `Chain ${opt.chainId}`);
      }
    });

    const chains: Chain[] = Array.from(chainsMap.entries())
      .map(([id, name]) => ({
        id: id ?? 0,
        name
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      chains,
      options,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[payout-options] Error:', error);
    // Return hardcoded fallback on error
    return NextResponse.json(
      {
        chains: [
          { id: 0, name: "ZetaChain" },
          { id: 11155111, name: "Ethereum Sepolia" },
          { id: 97, name: "BNB Chain Testnet" },
        ],
        options: [
          {
            value: "native_zeta",
            label: "Native ZETA (on ZetaChain)",
            zrc20: null,
            chainId: null,
            symbol: "ZETA"
          },
          {
            value: "0x05BA149A7bd6dC1F937fA9046A9e05C05f3b18b0",
            label: "Ethereum Sepolia (zETH)",
            zrc20: "0x05BA149A7bd6dC1F937fA9046A9e05C05f3b18b0",
            chainId: 11155111,
            symbol: "zETH"
          },
          {
            value: "0xd97B1de3619ed2c6BEb3860147E30cA8A7dC9891",
            label: "BNB Chain Testnet (zBNB)",
            zrc20: "0xd97B1de3619ed2c6BEb3860147E30cA8A7dC9891",
            chainId: 97,
            symbol: "zBNB"
          },
        ],
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
