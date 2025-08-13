"use client"

import { useEffect, useMemo, useRef, useState } from "react"

interface AIOverlayProps {
  open: boolean
  onClose: () => void
}

type ChatMsg = { id: string; role: "system" | "user" | "assistant"; text: string }

// Approx. double a card width on desktop; full width on mobile
const POPUP_WIDTH = "w-full sm:w-[520px] md:w-[560px] lg:w-[600px]"

export default function AIOverlay({ open, onClose }: AIOverlayProps) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([{
    id: "welcome",
    role: "system",
    text: "Welcome to GiveHub AI — ask me anything about your campaigns."
  }])
  const endRef = useRef<HTMLDivElement | null>(null)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", text: input.trim() }
    setMessages((m) => [...m, userMsg])
    setInput("")
    setLoading(true)
    // Simulate generation; always returns "hi"
    setTimeout(() => {
      const reply: ChatMsg = { id: crypto.randomUUID(), role: "assistant", text: "hi" }
      setMessages((m) => [...m, reply])
      setLoading(false)
    }, 900)
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
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
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
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`${m.role === "user" ? "bg-blue-600 text-white" : m.role === "assistant" ? "bg-gray-100 text-gray-900" : "bg-green-50 text-gray-800"} px-3 py-2 rounded-2xl max-w-[85%] shadow-sm`}> 
                    {m.text}
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
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask GiveHub AI…"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-green-600 text-white font-medium shadow hover:from-blue-700 hover:to-green-700 disabled:opacity-50"
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
