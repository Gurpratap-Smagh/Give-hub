import { cn } from '@/lib/utils/format'

interface ChainChipsProps {
  chains: string[]
  selectedChain: string
  onChainChange: (chain: string, event: React.MouseEvent) => void
  size?: 'sm' | 'md'
}

// Simple dynamic color resolver with known chain fallbacks
const knownColors: Record<string, string> = {
  ethereum: 'var(--eth)',
  solana: 'var(--sol)',
  bitcoin: 'var(--btc)',
  zeta: 'var(--primary)', // Zetachain-ready fallback
}

function colorForChain(chain: string): string {
  const key = (chain || '').toLowerCase().trim()
  return knownColors[key] || 'var(--ring)'
}

export function ChainChips({ chains, selectedChain, onChainChange, size = 'md' }: ChainChipsProps) {
  return (
    <div className={cn(
      "flex flex-wrap gap-2",
      size === 'sm' ? 'gap-1' : 'gap-2'
    )}>
      {chains.map((chain) => {
        const isSelected = selectedChain === chain
        const dotColor = colorForChain(chain)
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
              style={{ backgroundColor: dotColor }}
            />
            {chain}
          </button>
        )
      })}
    </div>
  )
}
