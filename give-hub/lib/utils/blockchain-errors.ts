// lib/utils/blockchain-errors.ts
'use client';

import { notify } from './notify';

export type BlockchainErrorCategory =
  | 'user_rejected'
  | 'network'
  | 'gas'
  | 'contract_error'
  | 'insufficient_funds'
  | 'wallet_connection'
  | 'token_approval'
  | 'transaction'
  | 'unknown';

export interface ParsedBlockchainError {
  category: BlockchainErrorCategory;
  message: string;
  originalError: unknown;
  details?: string;
  /** EIP-1193 / provider / library code if present */
  code?: number | string;
  /** Optional UX hint for the UI */
  suggestion?: string;
}

/* ---------------------------- helpers ---------------------------- */

function isPrintable(s?: string) {
  return !!s && /\S/.test(s);
}

function collectMessages(e: unknown): string[] {
  // walk .cause chain (ethers v6/viem) and harvest known fields
  const seen = new Set<unknown>();
  const msgs: string[] = [];

  let cur = e as Record<string, unknown>;
  let depth = 0;
  while (cur && !seen.has(cur) && depth < 6) {
    seen.add(cur);
    const parts = [
      cur?.shortMessage,
      cur?.details,
      cur?.reason,
      cur?.message,
      cur?.error?.reason,
      cur?.error?.message,
      cur?.data?.message,
    ]
      .filter(isPrintable)
      .map(String);

    if (Array.isArray(cur?.metaMessages)) {
      parts.push(cur.metaMessages.join(' | '));
    }
    parts.forEach((p) => isPrintable(p) && msgs.push(p));
    cur = cur?.cause as Record<string, unknown>;
    depth++;
  }

  // also check generic JSON-RPC envelope
  const errorObj = e as Record<string, any>;
  const rpcMsg =
    errorObj?.info?.error?.message ||
    errorObj?.error?.message ||
    errorObj?.data?.message ||
    errorObj?.data?.originalError?.message;
  if (isPrintable(rpcMsg)) msgs.push(String(rpcMsg));

  // final fallback
  if (msgs.length === 0 && typeof e === 'string' && isPrintable(e)) msgs.push(e);

  // de-dup while preserving order
  return Array.from(new Set(msgs.map((m) => m.trim()))).filter(isPrintable);
}

function extractCode(e: any): number | string | undefined {
  return (
    e?.code ??
    e?.error?.code ??
    e?.data?.code ??
    e?.cause?.code ??
    e?.info?.error?.code
  );
}

function extractRevertHex(e: any): string | undefined {
  return (
    e?.data?.data ??
    e?.data?.originalError?.data ??
    e?.error?.data ??
    e?.cause?.data ??
    undefined
  );
}

function tryDecodeErrorStringFromHex(data?: string): string | null {
  if (!data || typeof data !== 'string' || !data.startsWith('0x')) return null;
  // 0x08c379a0 = Error(string); 0x4e487b71 = Panic(uint256)
  if (data.startsWith('0x08c379a0')) {
    // quick-n-dirty ABI string extraction: scan printable bytes at the end
    try {
      const bytes = data.slice(10); // strip selector
      // convert hex to bytes, pick printable
      const out: number[] = [];
      for (let i = 0; i < bytes.length - 1; i += 2) {
        const b = parseInt(bytes.slice(i, i + 2), 16);
        if (b >= 0x20 && b <= 0x7e) out.push(b);
      }
      const s = new TextDecoder().decode(new Uint8Array(out)).trim();
      // best effort: look for a likely wordy slice
      const m = s.match(/([A-Za-z][A-Za-z0-9 _\-:.]{4,})/);
      return m?.[1] ?? null;
    } catch {
      return null;
    }
  }
  if (data.startsWith('0x4e487b71')) {
    // Panic(uint256) — map a few common ones
    // bytes4 + 32-byte selector + 32-byte code
    const codeHex = data.slice(8 + 64, 8 + 64 + 64);
    const code = parseInt(codeHex || '0', 16);
    const map: Record<number, string> = {
      0x01: 'Assertion failed',
      0x11: 'Arithmetic overflow/underflow',
      0x12: 'Division by zero',
      0x21: 'Invalid enum value',
      0x22: 'Storage byte array out of bounds',
      0x31: 'Empty array pop',
      0x32: 'Array out of bounds',
      0x41: 'Memory allocation overflow',
      0x51: 'Zero-initialized internal function',
    };
    return map[code] || `EVM panic (0x${code.toString(16)})`;
  }
  return null;
}

function extractContractRevertReason(errorString: string, hex?: string): string | null {
  // look for common “reason: '…' / reverted with reason '…'” shapes
  const nice = errorString.match(/revert(?:ed)?(?: with reason)?[:\s]*["']([^"']+)["']/i);
  if (nice) return nice[1];

  // project-specific / ZetaChain
  if (/campaign must use wzeta/i.test(errorString)) return 'Campaign must use WZETA as preferred token';
  if (/cannot donate zero amount|amountzero|zero amount/i.test(errorString)) return 'Donation amount cannot be zero';
  if (/invalid campaign|campaign not found|campaign does not exist/i.test(errorString)) return 'Campaign does not exist or is invalid';
  if (/\bpaused\b|not active/i.test(errorString)) return 'Campaign is currently paused';
  if (/router not set|routernotset/i.test(errorString)) return 'Token swap router not configured. Please use WZETA token for donations.';

  // hex fallback
  const decoded = tryDecodeErrorStringFromHex(hex);
  if (decoded) return decoded;

  return null;
}

/* ---------------------------- patterns --------------------------- */

const ERROR_PATTERNS: Array<{
  test: (s: string, code?: number | string) => boolean;
  category: BlockchainErrorCategory;
  message: string;
  suggestion?: string;
}> = [
  // EIP-1193 "user rejected"
  {
    test: (_s, code) => code === 4001,
    category: 'user_rejected',
    message: 'Transaction was rejected in your wallet',
  },
  // User rejection (string forms)
  {
    test: (s) => /user (rejected|denied)|rejected the request|cancelled|canceled|dismissed/i.test(s),
    category: 'user_rejected',
    message: 'Transaction was rejected in your wallet',
  },
  // Wallet not present/unlocked
  {
    test: (s) => /wallet not found|no ethereum provider|no provider|no injected|connector not found|not connected/i.test(s),
    category: 'wallet_connection',
    message: 'Please install or unlock your wallet',
    suggestion: 'Open MetaMask (or your wallet), unlock it, and try again.',
  },
  // Chain not configured / wrong network
  {
    test: (s, code) =>
      code === 4902 ||
      /unsupported chain|wrong network|chain.?id|chain not configured|network changed/i.test(s),
    category: 'network',
    message: 'Wrong or unsupported network',
    suggestion: 'Switch to Zeta Athens (chainId 7001) in your wallet.',
  },
  // Pure network transport
  {
    test: (s) => /network error|disconnected|unreachable|no response|timeout|Failed to fetch/i.test(s),
    category: 'network',
    message: 'Network connection issue. Please check your internet connection',
  },
  // Insufficient funds
  {
    test: (s) =>
      /insufficient funds|insufficient balance|funds for gas \* price \+ value/i.test(s),
    category: 'insufficient_funds',
    message: 'Insufficient funds in your wallet',
  },
  // Token approval / allowance
  {
    test: (s) => /allowance|approve|erc20: insufficient allowance/i.test(s),
    category: 'token_approval',
    message: 'Token approval failed. Please try again',
  },
  // Gas calc / fee policy
  {
    test: (s) =>
      /gas required exceeds|insufficient gas|out of gas|gas limit|UNPREDICTABLE_GAS_LIMIT|cannot estimate gas|max fee per gas less than block base fee|intrinsic gas too low/i.test(
        s,
      ),
    category: 'gas',
    message: 'Transaction failed due to gas calculation. Try increasing gas limit',
  },
  // Transaction nonce/replacement underpriced/pending
  {
    test: (s) => /nonce|replacement|underpriced|already known|replacement fee too low|pending/i.test(s),
    category: 'transaction',
    message: 'Transaction issue. It may be pending or rejected',
  },
];

/* ------------------------------ core ----------------------------- */

export function extractRawErrorString(err: unknown): string {
  if (typeof err === 'string') return err.trim();
  if (!err) return 'Unknown error';
  const messages = collectMessages(err);
  const joined = messages.join(' | ');
  return String(joined)
    .replace(/^execution reverted:?/gi, '')
    .replace(/\(unknown=\w+\)/g, '')
    .trim();
}

export function parseBlockchainError(error: unknown): ParsedBlockchainError {
  const code = extractCode(error as any);
  const errorString = extractRawErrorString(error);
  const revertHex = extractRevertHex(error as any);

  // Specific contract revert (custom + hex decode)
  const revertReason = extractContractRevertReason(errorString, revertHex);
  if (revertReason) {
    return {
      category: 'contract_error',
      message: revertReason,
      originalError: error,
      details: errorString,
      code,
    };
  }

  // Known patterns (by code/message)
  for (const p of ERROR_PATTERNS) {
    if (p.test(errorString, code)) {
      return {
        category: p.category,
        message: p.message,
        originalError: error,
        details: errorString,
        code,
        suggestion: p.suggestion,
      };
    }
  }

  // Fallback
  return {
    category: 'unknown',
    message: 'Transaction failed. Please try again later',
    originalError: error,
    details: errorString,
    code,
  };
}

export function handleBlockchainError(
  error: unknown,
  options?: {
    setStatus?: (status: string) => void;
    onError?: (parsedError: ParsedBlockchainError) => void;
    showToast?: boolean;
    toastMessage?: string;
    logError?: boolean;
  },
): ParsedBlockchainError {
  const parsed = parseBlockchainError(error);

  // Don’t toast for user-rejected; also allow caller to suppress toasts.
  const shouldToast =
    options?.showToast !== false && parsed.category !== 'user_rejected';

  if (shouldToast) {
    const message = options?.toastMessage || parsed.message;
    notify(message, 'error');
  }

  if (options?.setStatus) options.setStatus(`Error: ${parsed.message}`);

  if (options?.onError) options.onError(parsed);

  if (options?.logError !== false && process.env.NODE_ENV !== 'production') {
    // keep prod console clean; dev only.
    console.error('[Blockchain Error]', parsed.message, {
      category: parsed.category,
      message: parsed.message,
      code: parsed.code,
      suggestion: parsed.suggestion,
      details: parsed.details,
      // Don't log the original error directly as it can be circular
      originalErrorMessage: typeof parsed.originalError === 'object' ? 
        (parsed.originalError as any)?.message || JSON.stringify(parsed.originalError) : 
        String(parsed.originalError)
    });
  }

  return parsed;
}
