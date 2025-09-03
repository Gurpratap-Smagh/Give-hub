'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface Chain {
  id: string;
  name: string;
  icon: string;
  chainId: number;
  nativeToken: string;
  zrc20Address?: string;
  isTestnet?: boolean;
}

export const SUPPORTED_CHAINS: Chain[] = [
  {
    id: 'sepolia',
    name: 'Ethereum Sepolia',
    icon: '⟠',
    chainId: 11155111,
    nativeToken: 'ETH',
    zrc20Address: '0x0000000000000000000000000000000000000000', // TODO: Add actual address
    isTestnet: true
  },
  {
    id: 'solana',
    name: 'Solana',
    icon: '◎',
    chainId: 901,
    nativeToken: 'SOL',
    isTestnet: false
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    icon: '₿',
    chainId: 18332,
    nativeToken: 'BTC',
    zrc20Address: '0x65a45c57636f9BcCeD4fe193A602008578BcA90b',
    isTestnet: true
  },
  {
    id: 'zetachain',
    name: 'ZetaChain',
    icon: 'Ζ',
    chainId: 7001,
    nativeToken: 'ZETA',
    zrc20Address: '0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf',
    isTestnet: true
  }
];

interface ChainSelectorProps {
  selectedChain: string;
  onChainSelect: (chain: Chain) => void;
  label?: string;
  disabled?: boolean;
  showTestnetBadge?: boolean;
}

export function ChainSelector({
  selectedChain,
  onChainSelect,
  label = 'Select Chain',
  disabled = false,
  showTestnetBadge = true
}: ChainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const selected = SUPPORTED_CHAINS.find(c => c.id === selectedChain);

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-3">
          {selected ? (
            <>
              <span className="text-xl">{selected.icon}</span>
              <div className="text-left">
                <div className="font-medium text-gray-900 dark:text-white">
                  {selected.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {selected.nativeToken}
                  {showTestnetBadge && selected.isTestnet && (
                    <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded text-xs">
                      Testnet
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">Select a chain</span>
          )}
        </div>
        
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-50 mt-2 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
            {SUPPORTED_CHAINS.map(chain => (
              <button
                key={chain.id}
                type="button"
                onClick={() => {
                  onChainSelect(chain);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  chain.id === selectedChain ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                }`}
              >
                <span className="text-xl">{chain.icon}</span>
                <div className="flex-1 text-left">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {chain.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {chain.nativeToken}
                    {showTestnetBadge && chain.isTestnet && (
                      <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded text-xs">
                        Testnet
                      </span>
                    )}
                  </div>
                </div>
                {chain.id === selectedChain && (
                  <svg className="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
