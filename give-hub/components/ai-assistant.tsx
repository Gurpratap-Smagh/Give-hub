"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAssistant } from "@/app/ai/assistant/useAssistant";
import PaymentModal from "@/components/payment-modal";
import type { Campaign } from "@/lib/db";
import { formatCurrency } from "@/lib/utils/format";
import { notify } from "@/lib/utils/notify"; // Import the notify utility

export default function AIAssistant() {
  const {
    prompt,
    setPrompt,
    reply,
    setReply,
    loading,
    error,
    mode,
    setMode,
    results,
    selectedCampaignId,
    setSelectedCampaignId,
    action,
    setAction,
    ask,
  } = useAssistant();

  const router = useRouter();

  // Payment modal state
  const [showPayment, setShowPayment] = useState(false);
  const [paymentCampaign, setPaymentCampaign] = useState<Campaign | null>(null);
  const [initialAmount, setInitialAmount] = useState<number | undefined>(undefined);
  const [initialChain, setInitialChain] = useState<string | undefined>(undefined);
  const [autoSubmit, setAutoSubmit] = useState(false);

  // Handle AI action payloads from backend
  useEffect(() => {
    if (!action) return;
    (async () => {
      try {
        if (action.type === "open_search") {
          const search = action.search ? encodeURIComponent(action.search) : "";
          const param = action.param || "all";
          const url = `/?search=${search}&param=${encodeURIComponent(param)}`;
          router.push(url);
          setAction(null);
          return;
        }

        if (action.type === "open_payment" || action.type === "fill_payment") {
          const id = action.campaignId || selectedCampaignId;
          if (!id) {
            setReply("Which campaign would you like to support? Say the title or id, or tap a result.");
            setAction(null);
            return;
          }
          // Fetch campaign data
          const res = await fetch(`/api/campaigns/${id}`);
          if (!res.ok) {
            const errorMsg = `Failed to fetch campaign: ${res.status}`;
            notify(errorMsg, 'error');
            throw new Error(errorMsg);
          }
          const data = await res.json();
          if (!data?.success || !data?.campaign) {
            const errorMsg = "Campaign not found";
            notify(errorMsg, 'error');
            throw new Error(errorMsg);
          }
          setPaymentCampaign(data.campaign as Campaign);
          setInitialAmount(typeof action.amount === "number" ? action.amount : undefined);
          setInitialChain(typeof action.chain === "string" ? action.chain : undefined);
          setAutoSubmit(!!action.confirm);
          setShowPayment(true);
          // Proactive status text for the user
          if (action.type === "open_payment") {
            setReply("Opening payment… Waiting for your confirmation in MetaMask…");
          } else {
            setReply("I've prefilled the donation form for you.");
          }
          // Clear action to avoid re-processing
          setAction(null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to handle action";
        setReply(`Sorry—${msg}.`);
        setAction(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[min(92vw,28rem)]">
      <div className="bg-white shadow-xl rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 border-b">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-9 8l4-4H17a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v9l0 0"/></svg>
            <span className="text-sm font-medium text-gray-700">Ask Give-Hub Assistant</span>
          </div>
          <button
            type="button"
            onClick={() => setMode(m => (m === "default" ? "pay" : "default"))}
            className={`text-xs px-2 py-1 rounded-md border ${mode === "pay" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-300"}`}
            title="Toggle pay mode"
          >
            {mode === "pay" ? "$ Pay" : "Chat"}
          </button>
        </div>
        <form onSubmit={ask} className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask to find campaigns or donate..."
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

          {selectedCampaignId && (
            <div className="text-[11px] text-gray-600">
              Selected campaign: <span className="font-mono">{selectedCampaignId}</span>
              <button type="button" className="ml-2 text-blue-600 hover:underline" onClick={() => setSelectedCampaignId(null)}>clear</button>
            </div>
          )}

          {/* Show critical errors inline, but use toast for most errors */}
          {error && (
            <div className="text-xs text-red-600">{error}</div>
          )}

          {reply !== null && (
            <div className="mt-2 bg-gray-50 rounded-md border border-gray-200 p-3 text-sm whitespace-pre-wrap text-gray-800">
              {reply || 
                (() => {
                  // If we got no content, show a message and notify user with toast
                  setTimeout(() => notify("No response from assistant. Please try again.", "error"), 100);
                  return "(No content returned)";
                })()
              }
            </div>
          )}

          {results.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">Results</div>
              <ul className="space-y-2 max-h-64 overflow-auto pr-1">
                {results.map((r) => (
                  <li key={r.id} className="border rounded-md p-2 text-sm hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-gray-900">{r.title}</div>
                        <div className="text-[11px] text-gray-500">{r.category} • raised {formatCurrency(r.raised, 'USD', true)} / {formatCurrency(r.goal, 'USD', true)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100" onClick={() => setSelectedCampaignId(r.id)}>Select</button>
                        <button type="button" className="text-xs px-2 py-1 rounded border border-emerald-600 text-emerald-700 hover:bg-emerald-50" onClick={() => { setMode("pay"); setPrompt(`donate to "${r.title}"`); }}>Donate</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </div>

      {/* Payment Modal for AI-driven donations */}
      {paymentCampaign && (
        <PaymentModal
          campaign={paymentCampaign}
          isOpen={showPayment}
          onClose={() => { setShowPayment(false); setPaymentCampaign(null); }}
          onPaymentSuccess={(amt, chain) => {
            setReply(`✅ Transaction confirmed! Thank you for donating ${amt}${chain ? ` via ${chain}` : ""}.`);
            notify(`Thank you for donating ${amt}${chain ? ` via ${chain}` : ""}!`, "success");
            setShowPayment(false);
            setPaymentCampaign(null);
          }}
          onPaymentError={(err) => {
            const msg = err instanceof Error ? err.message : String(err);
            setReply(`Payment failed: ${msg}`);
            notify(`Payment failed: ${msg}`, "error");
          }}
          onCancel={() => {
            setReply("Payment canceled.");
            notify("Payment canceled", "info");
          }}
          initialAmount={initialAmount}
          initialChain={initialChain}
          autoSubmit={autoSubmit}
          onStatusUpdate={(s) => { if (s) setReply(s); }}
        />
      )}
    </div>
  );
}
