import { cn } from '@/lib/format'

interface ChainChipsProps {
  chains: ('Ethereum' | 'Solana' | 'Bitcoin')[]
  selectedChain: 'Ethereum' | 'Solana' | 'Bitcoin'
  onChainChange: (chain: 'Ethereum' | 'Solana' | 'Bitcoin', event: React.MouseEvent) => void
  size?: 'sm' | 'md'
}

const chainConfig = {
  Ethereum: {
    color: 'var(--eth)',
    label: 'Ethereum'
  },
  Solana: {
    color: 'var(--sol)',
    label: 'Solana'
  },
  Bitcoin: {
    color: 'var(--btc)',
    label: 'Bitcoin'
  }
}

export function ChainChips({ chains, selectedChain, onChainChange, size = 'md' }: ChainChipsProps) {
  return (
    <div className={cn(
      "flex flex-wrap gap-2",
      size === 'sm' ? 'gap-1' : 'gap-2'
    )}>
      {chains.map((chain) => {
        const config = chainConfig[chain]
        const isSelected = selectedChain === chain
        
        return (
          <button
            key={chain}
            onClick={(event) => onChainChange(chain, event)}
            className={cn(
              "flex items-center gap-2 rounded-full font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
              size === 'sm' ? 'px-3 py-1 text-sm' : 'px-4 py-2 text-sm',
              isSelected
                ? 'bg-white/10 border border-white/20 text-white'
                : 'bg-white/5 border border-white/10 text-[color:var(--muted)] hover:bg-white/10 hover:border-white/20 hover:text-white'
            )}
          >
            <div
              className={cn(
                "rounded-full",
                size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'
              )}
              style={{ backgroundColor: config.color }}
            />
            {config.label}
          </button>
        )
      })}
    </div>
  )
}
