// lib/utils/blockchain-errors.ts
'use client';

export function extractRawErrorString(_error: unknown): string {
  return '';
}

export function parseBlockchainError(error: unknown) {
  return {
    category: 'unknown',
    message: '',
    originalError: error,
  };
}

export function handleBlockchainError(
  error: unknown,
  _options?: {
    setStatus?: (status: string) => void;
    onError?: (parsedError: any) => void;
    showToast?: boolean;
    toastMessage?: string;
    logError?: boolean;
  },
) {
  // Don’t block or toast — just return a trivial object
  return parseBlockchainError(error);
}
