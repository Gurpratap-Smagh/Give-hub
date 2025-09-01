"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { showError } from '@/components/notification-manager'

interface AIOverlayProps {
  open: boolean
  onClose: () => void
  onAction?: (action:
    | { type: "open_payment" | "fill_payment"; campaignId: string; amount?: number; chain?: string; token?: string; confirm?: boolean }
    | { type: "open_search"; search: string; param?: string }
  ) => void
  theme?: 'light' | 'dark'
}

type ChatMsg = { id: string; role: "system" | "user" | "assistant"; text: string }

// Default dimensions
const DEFAULT_WIDTH = 600
const DEFAULT_HEIGHT = 400
const MIN_WIDTH = 320
const MIN_HEIGHT = 200

export default function AIOverlay({ open, onClose, onAction, theme: themeProp }: AIOverlayProps) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payMode, setPayMode] = useState(false)
  const [lastResults, setLastResults] = useState<Array<{ id: string; title: string }>>([])
  const [lastPayment, setLastPayment] = useState<{ campaignId: string; amount?: number; chain?: string; token?: string } | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([{
    id: "welcome",
    role: "system",
    text: "Welcome to GiveHub AI — ask me anything about your campaigns."
  }])
  const endRef = useRef<HTMLDivElement | null>(null)
  
  // Panel position and size state
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0, edge: 'se' as 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' })
  const panelRef = useRef<HTMLDivElement>(null)

  // Initialize and clamp position/size to stay on-screen (run once on mount)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const marginLeft = 12
    const marginRight = 60
    const marginTop = 80 // leave room for navbar
    const marginBottom = 60

    // Clamp size to viewport minus margins
    const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - marginLeft - marginRight)
    const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - marginTop - marginBottom)
    const initWidth = Math.min(DEFAULT_WIDTH, maxWidth)
    const initHeight = Math.min(DEFAULT_HEIGHT, maxHeight)
    setSize(prev => {
      const clampedWidth = Math.min(prev.width, maxWidth)
      const clampedHeight = Math.min(prev.height, maxHeight)
      return (clampedWidth !== prev.width || clampedHeight !== prev.height)
        ? { width: clampedWidth, height: clampedHeight }
        : prev
    })

    // Prefer bottom-right within bounds
    const x = Math.max(marginLeft, Math.min(window.innerWidth - initWidth - marginRight, window.innerWidth - initWidth - marginRight))
    const y = Math.max(marginTop, Math.min(window.innerHeight - initHeight - marginBottom, window.innerHeight - initHeight - marginBottom))
    setPosition({ x, y })
  }, [])

  // When the panel size changes (via user resize), keep the current position but clamp within margins
  useEffect(() => {
    if (typeof window === 'undefined') return
    const marginLeft = 12
    const marginRight = 60
    const marginTop = 80
    const marginBottom = 60

    const maxX = window.innerWidth - size.width - marginRight
    const maxY = window.innerHeight - size.height - marginBottom
    setPosition((p) => ({
      x: Math.max(marginLeft, Math.min(p.x, maxX)),
      y: Math.max(marginTop, Math.min(p.y, maxY)),
    }))
  }, [size.width, size.height])

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }, [position.x, position.y])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const marginLeft = 12
      const marginRight = 60
      const marginTop = 80
      const marginBottom = 60
      const newX = Math.max(marginLeft, Math.min(window.innerWidth - size.width - marginRight, e.clientX - dragStart.x))
      const newY = Math.max(marginTop, Math.min(window.innerHeight - size.height - marginBottom, e.clientY - dragStart.y))
      setPosition({ x: newX, y: newY })
    }
    if (isResizing) {
      const dx = e.clientX - resizeStart.x
      const dy = e.clientY - resizeStart.y
      let newWidth = resizeStart.width
      let newHeight = resizeStart.height
      let newX = position.x
      let newY = position.y

      const marginLeft = 12
      const marginRight = 60
      const marginTop = 80
      const marginBottom = 60
      const maxW = window.innerWidth - marginLeft - marginRight
      const maxH = window.innerHeight - marginTop - marginBottom

      switch (resizeStart.edge) {
        case 'e':
          newWidth = resizeStart.width + dx
          break
        case 's':
          newHeight = resizeStart.height + dy
          break
        case 'se':
          newWidth = resizeStart.width + dx
          newHeight = resizeStart.height + dy
          break
        case 'w':
          newWidth = resizeStart.width - dx
          newX = resizeStart.posX + dx
          break
        case 'n':
          newHeight = resizeStart.height - dy
          newY = resizeStart.posY + dy
          break
        case 'ne':
          newWidth = resizeStart.width + dx
          newHeight = resizeStart.height - dy
          newY = resizeStart.posY + dy
          break
        case 'sw':
          newWidth = resizeStart.width - dx
          newHeight = resizeStart.height + dy
          newX = resizeStart.posX + dx
          break
        case 'nw':
          newWidth = resizeStart.width - dx
          newHeight = resizeStart.height - dy
          newX = resizeStart.posX + dx
          newY = resizeStart.posY + dy
          break
      }

      // Clamp size within viewport minus margins
      newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, maxW))
      newHeight = Math.max(MIN_HEIGHT, Math.min(newHeight, maxH))

      // Clamp position so panel stays on screen within margins
      newX = Math.max(marginLeft, Math.min(newX, window.innerWidth - newWidth - marginRight))
      newY = Math.max(marginTop, Math.min(newY, window.innerHeight - newHeight - marginBottom))

      setSize({ width: newWidth, height: newHeight })
      setPosition({ x: newX, y: newY })
    }
  }, [isDragging, isResizing, dragStart, resizeStart, size.width, size.height, position.x, position.y])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsResizing(false)
  }, [])

  // Resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget as HTMLElement
    const edge = (target.getAttribute('data-edge') as 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') || 'se'
    setIsResizing(true)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      posX: position.x,
      posY: position.y,
      edge
    })
  }, [size.width, size.height, position.x, position.y])

  // Mouse event listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp])

  // Clamp position and size on window resize so the panel never gets lost off-screen
  useEffect(() => {
    const onResize = () => {
      if (typeof window === 'undefined') return
      const marginLeft = 12
      const marginRight = 120
      const marginTop = 80
      const marginBottom = 120

      const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - marginLeft - marginRight)
      const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - marginTop - marginBottom)
      const newWidth = Math.min(size.width, maxWidth)
      const newHeight = Math.min(size.height, maxHeight)
      if (newWidth !== size.width || newHeight !== size.height) {
        setSize({ width: newWidth, height: newHeight })
      }

      const newX = Math.max(marginLeft, Math.min(position.x, window.innerWidth - newWidth - marginRight))
      const newY = Math.max(marginTop, Math.min(position.y, window.innerHeight - newHeight - marginBottom))
      if (newX !== position.x || newY !== position.y) {
        setPosition({ x: newX, y: newY })
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [position.x, position.y, size.width, size.height])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return
    setError(null)
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", text: input.trim() }
    setMessages((m) => [...m, userMsg])
    setInput("")
    setLoading(true)
    try {
      const endpoint = "/api/ai/assist"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMsg.text,
          mode: payMode ? "pay" : "default",
          context: {
            ...(lastResults.length ? { lastResults } : {}),
            ...(lastPayment ? { lastPayment } : {}),
            messages: messages
              .filter(m => m.role === "user" || m.role === "assistant")
              .map(({ role, text }) => ({ role, text }))
              .slice(-10),
            note: "Focus on the new prompt. If this context is unrelated to the prompt, ignore it. If context is relevant (like user selecting an option, saying 'the 2nd one', or repeating an earlier suggestion), then treat that as the user's chosen focus. Pass that focus clearly in your JSON so the executor knows what to expand on in its next response."
          },
        }),
      });
      if (!res.ok) {
        const errorMsg = `AI request failed (${res.status})`;
        showError("AI request failed", errorMsg);
        throw new Error(errorMsg);
      }
      const data = (await res.json()) as {
        text?: string;
        action?: (
          | { type: "open_payment" | "fill_payment"; campaignId: string; amount?: number; chain?: string; token?: string; confirm?: boolean }
          | { type: "open_search"; search: string; param?: string }
        );
        results?: Array<{ id: string; title: string }>
      }
      const text = (data.text ?? "").trim()
      const reply: ChatMsg = { id: crypto.randomUUID(), role: "assistant", text: text || "(No content returned)" }
      setMessages((m) => [...m, reply])
      
      // If no content was returned, show a toast notification
      if (!text) {
        showError("Empty response", "Assistant returned an empty response. Please try again.");
      }
      
      if (Array.isArray(data.results) && data.results.length) {
        setLastResults(data.results.map(r => ({ id: r.id, title: r.title })))
      }
      if (data.action) {
        if (data.action.type === 'open_payment' || data.action.type === 'fill_payment') {
          // Keep overlay open; parent can open payment modal
          setLastPayment({ campaignId: data.action.campaignId, amount: data.action.amount, chain: data.action.chain, token: (data.action as { token?: string }).token })
          if (onAction) onAction(data.action)
        } else if (data.action.type === 'open_search') {
          if (onAction) onAction(data.action)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get AI response"
      setError(msg)
      showError("Request failed", msg) // Add toast notification for errors
      const reply: ChatMsg = { id: crypto.randomUUID(), role: "assistant", text: "Sorry, I couldn't process that request. Please try again." }
      setMessages((m) => [...m, reply])
    } finally {
      setLoading(false)
    }
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  // Auto-scroll to bottom on new messages
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, loading])

  // Position popup based on state
  const containerClasses = useMemo(() => `fixed inset-0 z-[70] pointer-events-none ${
    open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
  } transition-all duration-200 ease-out`, [open])
  
  const panelStyle = useMemo(() => ({
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${size.width}px`,
    height: `${size.height}px`,
    cursor: isDragging ? 'grabbing' : 'default'
  }), [position.x, position.y, size.width, size.height, isDragging])

  // Resolve current theme from prop or document
  const resolvedTheme = useMemo<'light' | 'dark'>(() => {
    if (themeProp === 'light' || themeProp === 'dark') return themeProp
    if (typeof document !== 'undefined') {
      const d = document.documentElement?.dataset?.theme
      if (d === 'dark' || d === 'light') return d
    }
    // Fallback to system preference
    try {
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      return prefersDark ? 'dark' : 'light'
    } catch { return 'light' }
  }, [themeProp])

  return (
    <div className={containerClasses} data-testid="ai-overlay-container">
      {/* Draggable and resizable AI panel */}
      <div 
        ref={panelRef}
        className="pointer-events-auto absolute"
        style={panelStyle}
      >
        <div className="relative h-full rounded-2xl shadow-2xl border border-gray-200/70 bg-white dark:bg-[#0b0f1a] overflow-hidden flex flex-col">

          {/* Header */}
          <div 
            className="flex items-center justify-between px-4 py-3"
          >
            <div
              className="flex items-center gap-2 drag-handle select-none cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
            >
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-[14px] text-blue-600 border border-blue-600 shadow-sm hover:bg-blue-600/10 transition-colors"
                title="Drag"
                aria-label="Drag GiveHub AI"
              >
                ✦
              </span>
              <span className="font-semibold text-gray-900">GiveHub AI</span>
            </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                data-testid="ai-overlay-close"
                aria-label="Close AI"
              >
                <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages - with custom scrollbar */}
            <div className="px-4 pb-3 flex-1 overflow-y-auto space-y-3 ai-scrollbar">
              {/* Keep minimal inline errors for accessibility, but use toast for errors */}
              {error && (
                <div className="flex justify-center">
                  <div className="px-3 py-2 rounded-2xl bg-transparent text-red-700 text-xs border border-red-200">
                    {error}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`${m.role === "user" ? "bg-transparent border border-blue-600 text-blue-600" : m.role === "assistant" ? "bg-transparent border border-gray-300 text-gray-900" : "bg-transparent border border-green-600/50 text-gray-800"} px-3 py-2 rounded-2xl max-w-[85%] shadow-sm`}> 
                    {m.role === "assistant" ? (
                      (() => {
                        const mdComponents: Components = {
                          table: ({ children, ...props }) => (
                            <div className="overflow-x-auto my-2">
                              <table {...props} className="min-w-full text-xs border-collapse border border-gray-300">
                                {children}
                              </table>
                            </div>
                          ),
                          thead: ({ children, ...props }) => (
                            <thead {...props} className="bg-transparent">{children}</thead>
                          ),
                          tbody: ({ children, ...props }) => (
                            <tbody {...props} className="bg-transparent">{children}</tbody>
                          ),
                          tr: ({ children, ...props }) => (
                            <tr {...props} className="">{children}</tr>
                          ),
                          th: ({ children, ...props }) => (
                            <th {...props} className="border border-gray-300 px-2 py-1 text-left font-semibold">
                              {children}
                            </th>
                          ),
                          td: ({ children, ...props }) => (
                            <td {...props} className="border border-gray-300 px-2 py-1">
                              {children}
                            </td>
                          ),
                          p: ({ children, ...props }) => (
                            <p {...props} className="mb-2 last:mb-0">{children}</p>
                          ),
                          strong: ({ children, ...props }) => (
                            <strong {...props} className="font-semibold">{children}</strong>
                          )
                        };
                        return (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={mdComponents}
                        >
                          {m.text}
                        </ReactMarkdown>
                      </div>
                        );
                      })()
                    ) : (
                      m.text
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-2xl bg-transparent text-gray-700 text-sm shadow-sm border border-gray-300">
                    <span className="inline-flex gap-1 items-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" />
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0.2s]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input row */}
            <form onSubmit={onSubmit} className="border-t border-gray-200 px-3 py-3 bg-transparent">
              <div className="flex items-center gap-2">
                {/* $ mode toggle */}
                <button
                  type="button"
                  onClick={() => setPayMode((v) => !v)}
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold transition-all ${payMode ? 'bg-transparent border-blue-600 text-blue-600 shadow-[0_0_0_2px_rgba(59,130,246,0.5)]' : 'bg-transparent border-blue-400 text-blue-600 hover:bg-blue-50/30'}`}
                  title="Payment mode"
                  data-testid="ai-pay-toggle"
                  aria-pressed={payMode}
                >
                  $
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask GiveHub AI…"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent"
                  data-testid="ai-input"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-transparent text-blue-600 border border-blue-500 font-medium shadow-sm hover:bg-blue-50/30 focus:outline-none focus:ring-2 focus:ring-blue-400 active:bg-blue-100/40 disabled:opacity-50"
                  data-testid="ai-send"
                >
                  Send
                </button>
              </div>
            </form>

            {/* Resize handles: corners and edges */}
            <div 
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-gray-300 text-gray-400 hover:text-blue-500 hover:ring-2 hover:ring-blue-500 rounded-sm transition-colors"
              data-edge="se"
              onMouseDown={handleResizeStart}
              style={{
                background: 'linear-gradient(-45deg, transparent 30%, currentColor 30%, currentColor 50%, transparent 50%, transparent 80%, currentColor 80%)'
              }}
            />
            <div 
              className="absolute bottom-0 right-4 left-4 h-1 cursor-s-resize bg-transparent hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-500 transition-colors"
              data-edge="s"
              onMouseDown={handleResizeStart}
            />
            <div 
              className="absolute top-4 bottom-4 right-0 w-1 cursor-e-resize bg-transparent hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-500 transition-colors"
              data-edge="e"
              onMouseDown={handleResizeStart}
            />
            <div 
              className="absolute top-0 right-4 left-4 h-1 cursor-n-resize bg-transparent hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-500 transition-colors"
              data-edge="n"
              onMouseDown={handleResizeStart}
            />
            <div 
              className="absolute top-4 bottom-4 left-0 w-1 cursor-w-resize bg-transparent hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-500 transition-colors"
              data-edge="w"
              onMouseDown={handleResizeStart}
            />
            {/* Optional corner handles for completeness */}
            <div 
              className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize bg-transparent hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-500 rounded-sm transition-colors"
              data-edge="ne"
              onMouseDown={handleResizeStart}
            />
            <div 
              className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize bg-transparent hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-500 rounded-sm transition-colors"
              data-edge="sw"
              onMouseDown={handleResizeStart}
            />
            <div 
              className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize bg-transparent hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-500 rounded-sm transition-colors"
              data-edge="nw"
              onMouseDown={handleResizeStart}
            />
          </div>
        </div>
    </div>
  )
}
