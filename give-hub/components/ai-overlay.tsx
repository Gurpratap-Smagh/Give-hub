"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface AIOverlayProps {
  open: boolean
  onClose: () => void
  onAction?: (action: { type: "open_payment"; campaignId: string; amount?: number; chain?: string }) => void
}

type ChatMsg = { id: string; role: "system" | "user" | "assistant"; text: string }

// Approx. double a card width on desktop; full width on mobile
const POPUP_WIDTH = "w-full sm:w-[520px] md:w-[560px] lg:w-[600px]"

export default function AIOverlay({ open, onClose, onAction }: AIOverlayProps) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payMode, setPayMode] = useState(false)
  const [lastResults, setLastResults] = useState<Array<{ id: string; title: string }>>([])
  const [messages, setMessages] = useState<ChatMsg[]>([{
    id: "welcome",
    role: "system",
    text: "Welcome to GiveHub AI — ask me anything about your campaigns."
  }])
  const endRef = useRef<HTMLDivElement | null>(null)

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
          mode: payMode ? 'pay' : 'default',
          context: {
            ...(lastResults.length ? { lastResults } : {}),
            messages: messages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(({ role, text }) => ({ role, text }))
              .slice(-10)
          },
        })
      })
      if (!res.ok) throw new Error(`AI request failed (${res.status})`)
      const data = (await res.json()) as {
        text?: string;
        action?: { type: "open_payment"; campaignId: string; amount?: number; chain?: string };
        results?: Array<{ id: string; title: string }>
      }
      const text = (data.text ?? "").trim()
      const reply: ChatMsg = { id: crypto.randomUUID(), role: "assistant", text: text || "(No content returned)" }
      setMessages((m) => [...m, reply])
      if (Array.isArray(data.results) && data.results.length) {
        setLastResults(data.results.map(r => ({ id: r.id, title: r.title })))
      }
      if (data.action && data.action.type === 'open_payment') {
        // Close overlay and bubble up for payment
        onClose()
        if (onAction) onAction(data.action)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get AI response"
      setError(msg)
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

  // Position popup above the bottom-right launcher (25px from edges, launcher ~56px tall)
  // We place the box ~96px above bottom to clear the launcher + gap, aligned to right.
  const containerClasses = useMemo(() => `fixed bottom-[96px] right-[25px] z-[70] pointer-events-none transition-all duration-200 ease-out ${
    open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
  }`, [open])

  return (
    <div className={containerClasses}>
      {/* Right-aligned floating container above launcher */}
      <div className={`pointer-events-auto ${POPUP_WIDTH}`}>
          <div className="relative rounded-2xl shadow-2xl border border-gray-200/70 bg-white/95 backdrop-blur-xl overflow-hidden">
            {/* Accent top border */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-violet-500 to-green-500" />

            {/* Tail (speech-bubble pointer) */}
            <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white/95 border border-gray-200/70 rotate-45 shadow-md" />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-blue-600 ring-2 ring-blue-500 shadow-sm">
                  ✦
                </span>
                <span className="font-semibold text-gray-900">GiveHub AI</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                aria-label="Close AI"
              >
                <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="px-4 pb-3 max-h-72 overflow-y-auto space-y-3">
              {error && (
                <div className="flex justify-center">
                  <div className="px-3 py-2 rounded-2xl bg-red-50 text-red-700 text-xs border border-red-200">
                    {error}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`${m.role === "user" ? "bg-blue-600 text-white" : m.role === "assistant" ? "bg-gray-100 text-gray-900" : "bg-green-50 text-gray-800"} px-3 py-2 rounded-2xl max-w-[85%] shadow-sm`}> 
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
                            <thead {...props} className="bg-gray-50">{children}</thead>
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
                  <div className="px-3 py-2 rounded-2xl bg-gray-100 text-gray-700 text-sm shadow-sm">
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
            <form onSubmit={onSubmit} className="border-t border-gray-200 px-3 py-3 bg-white/80 backdrop-blur-md">
              <div className="flex items-center gap-2">
                {/* $ mode toggle */}
                <button
                  type="button"
                  onClick={() => setPayMode((v) => !v)}
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold transition-all ${payMode ? 'bg-blue-600 border-blue-600 text-white shadow-[0_0_0_2px_rgba(59,130,246,0.5)]' : 'bg-white border-blue-400 text-blue-600 hover:bg-blue-50'}`}
                  title="Payment mode"
                  aria-pressed={payMode}
                >
                  $
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask GiveHub AI…"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-white text-blue-600 border border-blue-500 font-medium shadow-sm hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 active:bg-blue-100 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
    </div>
  )
}
