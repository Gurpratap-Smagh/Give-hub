// app/ai/assistant/donation.ts

export function extractQuotedTitle(text: string): string | undefined {
  const m = text.match(/"([^"]+)"/);
  return m?.[1]?.trim();
}

export function extractAmount(text: string): number | undefined {
  const m = text.match(/(?:\$\s*|usd\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:usd|dollars|\$))?/i);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(/,/g, '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export type LastResult = { id: string; title: string };
export function getLastResults(ctx: unknown): LastResult[] {
  try {
    if (ctx && typeof ctx === 'object' && 'lastResults' in (ctx as Record<string, unknown>)) {
      const lr = (ctx as { lastResults?: unknown }).lastResults;
      if (Array.isArray(lr)) {
        return lr
          .map((x) => {
            if (typeof x === 'object' && x && 'id' in x && 'title' in x) {
              const item = x as { id: unknown; title: unknown };
              return { id: String(item.id), title: String(item.title) };
            }
            return null;
          })
          .filter((x): x is LastResult => !!x);
      }
    }
  } catch { /* ignore */ }
  return [];
}

export function resolveDonationIntent(userText: string, ctx: unknown): { campaignId?: string; amount?: number } | null {
  const titleHint = extractQuotedTitle(userText);
  if (!titleHint) return null;
  const lr = getLastResults(ctx);
  if (!lr.length) return null;
  const found = lr.find((r) => r.title.toLowerCase().includes(titleHint.toLowerCase()));
  if (!found) return null;
  return { campaignId: found.id, amount: extractAmount(userText) };
}

export function inferCampaignIdFromHistory(userText: string, history?: Array<{role: 'user' | 'assistant', content: string}>, ctx?: unknown): string | undefined {
  // Check for ordinal references like "first one", "second one", etc.
  const ordinalMatch = userText.match(/(?:the\s+)?(first|second|third|1st|2nd|3rd|\d+(?:st|nd|rd|th)?)\s+(?:one|campaign)/i);
  if (ordinalMatch) {
    const lr = getLastResults(ctx);
    if (lr.length > 0) {
      const ordinal = ordinalMatch[1].toLowerCase();
      let index = 0;
      if (ordinal.includes('first') || ordinal === '1st') index = 0;
      else if (ordinal.includes('second') || ordinal === '2nd') index = 1;
      else if (ordinal.includes('third') || ordinal === '3rd') index = 2;
      else {
        const num = parseInt(ordinal.replace(/[^\d]/g, ''));
        if (!isNaN(num)) index = num - 1;
      }
      if (index >= 0 && index < lr.length) {
        return lr[index].id;
      }
    }
  }

  // Check for references like "that campaign", "the education one"
  if (userText.match(/(?:that|the)\s+(?:campaign|one)/i)) {
    const lr = getLastResults(ctx);
    if (lr.length === 1) return lr[0].id; // If only one result, return it
  }

  // Look for category or title hints in recent history
  // If explicit history is not provided, attempt to read from ctx.messages [{ role, text/content }]
  let histArr = history;
  if ((!histArr || histArr.length === 0) && ctx && typeof ctx === 'object' && 'messages' in (ctx as Record<string, unknown>)) {
    try {
      const msgs = (ctx as { messages?: Array<{ role: 'user' | 'assistant'; text?: string; content?: string }> }).messages;
      if (Array.isArray(msgs) && msgs.length > 0) {
        histArr = msgs
          .map(m => ({ role: m.role, content: (m.text ?? m.content ?? '').toString() }))
          .filter(m => !!m.content);
      }
    } catch { /* ignore parse errors */ }
  }
  if (histArr && histArr.length > 0) {
    const recentAssistant = histArr.filter(msg => msg.role === 'assistant').slice(-2);
    for (const msg of recentAssistant) {
      if (msg.content.includes('campaigns') || msg.content.includes('found')) {
        const lr = getLastResults(ctx);
        if (lr.length > 0) return lr[0].id; // Return first result as fallback
      }
    }
  }

  return undefined;
}
