import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/format'

interface ProgressPillProps {
  raised: number
  goal: number
  size?: 'sm' | 'md' | 'lg'
}

export function ProgressPill({ raised, goal, size = 'lg' }: ProgressPillProps) {
  const percentage = Math.min((raised / goal) * 100, 100)
  
  return (
    <div className={cn(
      "bg-[color:var(--panel-2)] rounded-xl p-6 border border-white/5",
      size === 'sm' && "p-4",
      size === 'md' && "p-5"
    )}>
      {/* Amount Display */}
      <div className={cn(
        "flex items-baseline justify-between mb-4",
        size === 'sm' && "mb-3"
      )}>
        <div>
          <div className={cn(
            "font-bold text-white tabular-nums",
            size === 'lg' && "text-3xl md:text-4xl",
            size === 'md' && "text-2xl",
            size === 'sm' && "text-lg"
          )}>
            {formatCurrency(raised)}
          </div>
          <div className={cn(
            "text-[color:var(--muted)]",
            size === 'lg' && "text-lg",
            size === 'md' && "text-base",
            size === 'sm' && "text-sm"
          )}>
            raised of {formatCurrency(goal)} goal
          </div>
        </div>
        
        {/* Percentage Badge */}
        <div className={cn(
          "bg-[color:var(--primary)] text-black font-bold rounded-full flex items-center justify-center",
          size === 'lg' && "w-16 h-16 text-lg",
          size === 'md' && "w-12 h-12 text-sm",
          size === 'sm' && "w-10 h-10 text-xs"
        )}>
          {Math.round(percentage)}%
        </div>
      </div>

      {/* Progress Bar */}
      <div className={cn(
        "w-full bg-white/10 rounded-full overflow-hidden",
        size === 'lg' && "h-3",
        size === 'md' && "h-2.5",
        size === 'sm' && "h-2"
      )}>
        <div
          className="h-full bg-gradient-to-r from-[color:var(--primary)] to-[color:var(--accent)] transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats Row */}
      {size === 'lg' && (
        <div className="flex justify-between items-center mt-4 text-sm text-[color:var(--muted)]">
          <span>
            {percentage >= 100 ? 'Goal reached!' : `${(100 - percentage).toFixed(0)}% to go`}
          </span>
          <span>
            {Math.round((raised / goal) * 100) >= 100 ? '🎉 Funded' : '💪 In progress'}
          </span>
        </div>
      )}
    </div>
  )
}
