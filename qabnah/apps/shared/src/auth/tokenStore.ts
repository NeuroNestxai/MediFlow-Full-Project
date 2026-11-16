export interface StoredTokens { accessToken: string; refreshToken: string; expiresIn?: number }

export interface TokenStore {
  get(): StoredTokens | null;
  set(t: StoredTokens): void;
  clear(): void;
  /** Subscribe to changes (including from other tabs). Returns an unsubscribe function. */
  subscribe(fn: (t: StoredTokens | null) => void): () => void;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Tokens persisted in localStorage under `key`, with an in-memory fallback when storage is unavailable. */
export function createTokenStore(key: string): TokenStore {
  let memory: StoredTokens | null = null;
  const listeners = new Set<(t: StoredTokens | null) => void>();
  const read = (): StoredTokens | null => {
    const s = safeStorage();
    if (!s) return memory;
    try {
      const raw = s.getItem(key);
      if (!raw) return null;
      const v = JSON.parse(raw) as StoredTokens;
      return v && typeof v.accessToken === 'string' && typeof v.refreshToken === 'string' ? v : null;
    } catch {
      return memory;
    }
  };
  const emit = () => { const t = read(); listeners.forEach((l) => l(t)); };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => { if (e.key === key) emit(); });
  }
  return {
    get: read,
    set(t) {
      memory = t;
      try { safeStorage()?.setItem(key, JSON.stringify(t)); } catch { /* memory only */ }
      emit();
    },
    clear() {
      memory = null;
      try { safeStorage()?.removeItem(key); } catch { /* ignore */ }
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

/** Small JSON helper for persisted UI preferences (language, selected store, cart…). */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = safeStorage()?.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try { safeStorage()?.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(key: string) {
    try { safeStorage()?.removeItem(key); } catch { /* ignore */ }
  },
};
