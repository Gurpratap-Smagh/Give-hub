import { ReactNode } from 'react'
import { cn } from '@/lib/utils/format'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div 
      className={cn(
        "bg-[color:var(--panel)] rounded-base border border-white/5 shadow-custom",
        className
      )}
    >
      {children}
    </div>
  )
}
