// lib/ai/relevance.ts
export function relevantContext(prompt: string, priorMsgs: { role:"user"|"assistant"; text:string }[], keepLastN=6) {
    const p = norm(prompt);
    const scored = priorMsgs.slice(-10).map(m => {
      const t = norm(m.text);
      const overlap = jaccard(p, t);
      // time-decay: newer messages get a small bump
      const recencyBoost = 0.02 * (priorMsgs.length - priorMsgs.indexOf(m));
      return { ...m, score: overlap + recencyBoost };
    });
    const kept = scored.filter(s => s.score >= 0.18).slice(-keepLastN).map(({role,text})=>({role,text}));
    return kept;
  }
  const norm = (s:string) => s.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>2);
  const jaccard = (a:string[], b:string[]) => {
    const A = new Set(a); const B = new Set(b);
    const inter = [...A].filter(x=>B.has(x)).length;
    const uni = new Set([...A, ...B]).size;
    return uni ? inter/uni : 0;
  };
  