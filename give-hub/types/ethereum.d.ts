declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      isStatus?: boolean;
      host?: string;
      path?: string;
      sendAsync?: (
        request: { method: string; params?: unknown[] }, 
        callback: (error: Error | null, response: unknown) => void
      ) => void;
      send?: (
        request: { method: string; params?: unknown[] }, 
        callback: (error: Error | null, response: unknown) => void
      ) => void;
      request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
      chainId?: string;
      networkVersion?: string;
      selectedAddress?: string;
      _metamask?: {
        isUnlocked: () => Promise<boolean>;
      };
    };
  }
}

export interface WindowWithEthereum extends Window {
  ethereum: NonNullable<Window['ethereum']>;
}
