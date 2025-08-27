"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { User } from "@/lib/db";

export type Role = "user" | "assistant";
export type Message = { role: Role; content: string };
export type CampaignRow = { id: string; title: string; category: string; goal: number; raised: number };
type BasicUser = Pick<User, "id" | "username" | "email" | "role">;

// Action payloads returned by /api/ai/assist
type OpenPaymentAction = {
  type: "open_payment";
  campaignId?: string;
  amount?: number;
  chain?: string;
  confirm?: boolean;
};
type FillPaymentAction = {
  type: "fill_payment";
  campaignId?: string;
  amount?: number;
  chain?: string;
  confirm?: boolean;
};
type OpenSearchAction = {
  type: "open_search";
  search?: string;
  param?: string;
};
export type AssistantAction = OpenPaymentAction | FillPaymentAction | OpenSearchAction | null;

export function useAssistant() {
  const { user } = useAuth();

  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"default" | "pay">("default");
  const [results, setResults] = useState<CampaignRow[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [action, setAction] = useState<AssistantAction>(null);

  const userContext: BasicUser | null = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
    };
  }, [user]);

  async function ask(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setReply(null);
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const ctx = {
        lastResults: results.map(r => ({ id: r.id, title: r.title })),
        screen: {
          mode,
          donationForm: { campaignId: selectedCampaignId || undefined },
        },
        messages: history,
        user: userContext || undefined,
      };
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt, mode, context: ctx, history }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as { text?: string; results?: CampaignRow[]; action?: AssistantAction };
      setReply(data.text ?? "");
      if (Array.isArray(data.results)) setResults(data.results);
      setAction(data.action ?? null);
      setHistory(prev => [...prev, { role: "user", content: prompt }, { role: "assistant", content: data.text ?? "" }]);
      setPrompt("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get AI response";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return {
    // state
    prompt,
    setPrompt,
    reply,
    setReply,
    loading,
    error,
    mode,
    setMode,
    results,
    setResults,
    selectedCampaignId,
    setSelectedCampaignId,
    history,
    setHistory,
    userContext,
    action,
    setAction,
    // actions
    ask,
  } as const;
}
