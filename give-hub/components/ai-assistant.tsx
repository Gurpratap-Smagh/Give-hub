"use client";

import { useState } from "react";

export default function AIAssistant() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function askAI(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setReply(null);
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as { text?: string };
      setReply(data.text ?? "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get AI response";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[min(92vw,28rem)]">
      <div className="bg-white shadow-xl rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b">
          <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-9 8l4-4H17a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v9l0 0"/></svg>
          <span className="text-sm font-medium text-gray-700">Ask Give-Hub Assistant</span>
        </div>
        <form onSubmit={askAI} className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask about creating a campaign, writing copy, or Give-Hub features..."
              className="flex-1 min-h-[72px] resize-y rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600"
              title="Send"
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/></svg>
              )}
            </button>
          </div>

          {error && (
            <div className="text-xs text-red-600">{error}</div>
          )}

          {reply !== null && (
            <div className="mt-2 bg-gray-50 rounded-md border border-gray-200 p-3 text-sm whitespace-pre-wrap text-gray-800">
              {reply || "(No content returned)"}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
