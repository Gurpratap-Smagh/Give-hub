// Lightweight notification utility to replace window.alert
// Usage: import { notify } from '@/lib/utils/notify'; notify('Message', 'success')

export type NotifyVariant = 'info' | 'success' | 'error'

export function notify(message: string, variant: NotifyVariant = 'info') {
  if (typeof window === 'undefined') return

  const containerId = 'gh-toast-container'
  let container = document.getElementById(containerId)
  if (!container) {
    container = document.createElement('div')
    container.id = containerId
    // Fixed top-right stack; pointer-events-none so it doesn't block UI
    container.className = 'fixed top-6 right-6 z-[1000] flex flex-col gap-3 pointer-events-none'
    document.body.appendChild(container)
  }

  const toast = document.createElement('div')
  toast.className = [
    'min-w-[260px] max-w-sm pointer-events-auto',
    'rounded-xl shadow-lg border backdrop-blur bg-white/95',
    'px-4 py-3 flex items-start gap-3',
    'transition-all duration-300 ease-out transform',
    'opacity-0 translate-x-6',
  ].join(' ')

  // Accent bar
  const accent = document.createElement('div')
  accent.className = 'w-1 rounded-full mt-0.5 '
  if (variant === 'success') accent.className += 'bg-green-500'
  else if (variant === 'error') accent.className += 'bg-red-500'
  else accent.className += 'bg-blue-500'

  const content = document.createElement('div')
  content.className = 'flex-1 text-sm text-gray-800'
  content.textContent = message

  toast.appendChild(accent)
  toast.appendChild(content)
  container.appendChild(toast)

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-x-6')
    toast.classList.add('opacity-100', 'translate-x-0')
  })

  // Auto-dismiss after 3 seconds with fade + slide
  const timeout = window.setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-x-0')
    toast.classList.add('opacity-0', 'translate-x-6')
    // Remove after transition
    window.setTimeout(() => {
      toast.remove()
      // If container empty, remove it
      if (container && container.children.length === 0) container.remove()
    }, 320)
  }, 3000)

  // Allow manual dismiss on click
  toast.addEventListener('click', () => {
    window.clearTimeout(timeout)
    toast.classList.remove('opacity-100', 'translate-x-0')
    toast.classList.add('opacity-0', 'translate-x-6')
    window.setTimeout(() => {
      toast.remove()
      if (container && container.children.length === 0) container.remove()
    }, 220)
  })
}
