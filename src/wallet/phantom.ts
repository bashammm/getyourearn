/**
 * Phantom browser-wallet helpers.
 *
 * Connecting Phantom is a purely browser-side operation: it must never
 * require /api/health, /api/system/status, RPC, Squads, or any server call.
 * Only AFTER a wallet address is established may YABBAI use it for API work.
 *
 * Nothing here handles private keys, seed phrases, or secrets. The provider
 * object is injected by the Phantom extension; we only read the public key.
 */

/** Minimal Solana public-key shape exposed by wallet providers. */
export interface PhantomPublicKey {
  toBase58(): string;
  toString(): string;
}

/** Response returned by provider.connect(). */
export interface PhantomConnectResponse {
  publicKey?: PhantomPublicKey | string | null;
}

/** Subset of the Phantom injected provider API used by YABBAI. */
export interface PhantomProvider {
  isPhantom: boolean;
  publicKey?: PhantomPublicKey | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<PhantomConnectResponse>;
  disconnect?(): Promise<void>;
  signAndSendTransaction?(
    tx: unknown,
    opts?: Record<string, unknown>,
  ): Promise<{ signature: string }>;
  on?(event: WalletEvent, handler: (arg?: unknown) => void): void;
  off?(event: WalletEvent, handler: (arg?: unknown) => void): void;
  removeListener?(event: WalletEvent, handler: (arg?: unknown) => void): void;
}

export type WalletEvent = 'connect' | 'disconnect' | 'accountChanged';

/** Window subset needed for provider discovery (injectable for tests). */
export interface WindowLike {
  phantom?: { solana?: PhantomProvider };
  solana?: PhantomProvider;
}

/**
 * Robust Phantom provider detection.
 * Prefers window.phantom.solana, falls back to window.solana only when it
 * self-identifies as Phantom. Never throws when window/provider is absent.
 */
export function getPhantomProvider(source?: WindowLike): PhantomProvider | null {
  let w: WindowLike | undefined = source;
  if (!w) {
    if (typeof window === 'undefined') return null;
    w = window as unknown as WindowLike;
  }
  if (!w) return null;
  const injected = w.phantom?.solana;
  if (injected && injected.isPhantom === true) return injected;
  const fallback = w.solana;
  if (fallback && fallback.isPhantom === true) return fallback;
  return null;
}

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Plausibility check for a Solana address (base58, 32-44 chars). */
export function isPlausibleSolanaAddress(value: string): boolean {
  return BASE58_ADDRESS.test(value);
}

function keyToString(key: unknown): string | null {
  if (!key) return null;
  if (typeof key === 'string') return key;
  const candidate = key as Partial<PhantomPublicKey>;
  if (typeof candidate.toBase58 === 'function') {
    try {
      const address = candidate.toBase58();
      if (typeof address === 'string' && address) return address;
    } catch {
      return null;
    }
  }
  if (typeof candidate.toString === 'function') {
    try {
      const address = candidate.toString();
      if (typeof address === 'string' && isPlausibleSolanaAddress(address)) return address;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Resolve a wallet address from a connect() response, falling back to the
 * provider's current publicKey. Returns null when nothing usable is present.
 * The result should still pass isPlausibleSolanaAddress before being stored.
 */
export function resolveAddress(
  response: PhantomConnectResponse | null | undefined,
  provider: PhantomProvider | null,
): string | null {
  const fromResponse = keyToString(response?.publicKey);
  if (fromResponse) return fromResponse;
  return keyToString(provider?.publicKey);
}

/** Abbreviate an address for display, e.g. "8xY7…9abc". Pass-through for short values. */
export function shortenAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Convert any connection failure into a safe, user-visible message.
 * User rejection/cancellation is reported as such — never as a server failure.
 * Never includes sensitive data; messages are truncated.
 */
export function normalizeWalletError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const message = raw.trim();
  if (!message) return 'Wallet connection failed: unknown error.';
  const lower = message.toLowerCase();
  if (
    lower.includes('user rejected') ||
    lower.includes('rejected the request') ||
    lower.includes('user denied') ||
    lower.includes('denied the request') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('dismissed') ||
    lower.includes('rejected') ||
    lower.includes('4001')
  ) {
    return 'Phantom connection was rejected. No wallet was connected.';
  }
  if (lower.includes('locked')) {
    return 'Phantom is locked. Unlock the wallet and try again.';
  }
  if (
    lower.includes('not detected') ||
    lower.includes('not installed') ||
    lower.includes('no provider') ||
    lower.includes('missing provider')
  ) {
    return 'Phantom wallet not detected.';
  }
  return `Wallet connection failed: ${message.slice(0, 160)}`;
}

export const PHANTOM_DOWNLOAD_URL = 'https://phantom.com/download';
export const PHANTOM_MISSING_MESSAGE =
  'Phantom wallet not detected. Install Phantom from phantom.com/download, then reload this page.';
