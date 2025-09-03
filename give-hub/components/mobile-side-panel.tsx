"use client"

import { useEffect, useRef, useState } from "react"
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { showError } from '@/components/notification-manager'

interface MobileSidePanelProps {
  open: boolean
  onClose: () => void
  onAction?: (action:
    | { type: "open_payment" | "fill_payment"; campaignId: string; amount?: number; chain?: string; token?: string; confirm?: boolean }
    | { type: "open_search"; search: string; param?: string }
  ) => void
  theme?: 'light' | 'dark'
}

type ChatMsg = { id: string; role: "system" | "user" | "assistant"; text: string }

export default function MobileSidePanel({ open, onClose, onAction }: MobileSidePanelProps) {
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


  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/20 z-[60] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Side Panel */}
      <div 
        className={`fixed bottom-0 right-0 w-full h-[75vh] bg-white dark:bg-slate-900 border-t border-l border-gray-200 dark:border-slate-700 rounded-tl-2xl shadow-2xl z-[70] transform transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        data-testid="mobile-side-panel"
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-[14px]">
                ✦
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">GiveHub AI</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 active:bg-gray-300 dark:active:bg-slate-600 transition-colors"
              data-testid="mobile-panel-close"
              aria-label="Close AI"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="px-4 py-3 flex-1 overflow-y-auto space-y-3">
            {/* Keep minimal inline errors for accessibility, but use toast for errors */}
            {error && (
              <div className="flex justify-center">
                <div className="px-3 py-2 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs border border-red-200 dark:border-red-800">
                  {error}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`${
                  m.role === "user" 
                    ? "bg-blue-600 text-white" 
                    : m.role === "assistant" 
                      ? "bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-200 dark:border-slate-700" 
                      : "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800"
                } px-3 py-2 rounded-2xl max-w-[85%] shadow-sm`}> 
                  {m.role === "assistant" ? (
                    (() => {
                      const mdComponents: Components = {
                        table: ({ children, ...props }) => (
                          <div className="overflow-x-auto my-2">
                            <table {...props} className="min-w-full text-xs border-collapse border border-gray-300 dark:border-slate-600">
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children, ...props }) => (
                          <thead {...props} className="bg-gray-50 dark:bg-slate-800">{children}</thead>
                        ),
                        tbody: ({ children, ...props }) => (
                          <tbody {...props} className="bg-white dark:bg-slate-900">{children}</tbody>
                        ),
                        tr: ({ children, ...props }) => (
                          <tr {...props} className="">{children}</tr>
                        ),
                        th: ({ children, ...props }) => (
                          <th {...props} className="border border-gray-300 dark:border-slate-600 px-2 py-1 text-left font-semibold">
                            {children}
                          </th>
                        ),
                        td: ({ children, ...props }) => (
                          <td {...props} className="border border-gray-300 dark:border-slate-600 px-2 py-1">
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
                        <div className="prose prose-sm max-w-none dark:prose-invert">
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
                <div className="px-3 py-2 rounded-2xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-sm shadow-sm border border-gray-200 dark:border-slate-700">
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
          <form onSubmit={onSubmit} className="border-t border-gray-200 dark:border-slate-700 px-3 py-3 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2">
              {/* $ mode toggle */}
              <button
                type="button"
                onClick={() => setPayMode((v) => !v)}
                className={`h-10 w-10 rounded-lg border text-sm font-semibold transition-all ${
                  payMode 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg' 
                    : 'bg-white dark:bg-slate-800 border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700'
                }`}
                title="Payment mode"
                data-testid="mobile-pay-toggle"
                aria-pressed={payMode}
              >
                $
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask GiveHub AI…"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                data-testid="mobile-ai-input"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="mobile-ai-send"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
