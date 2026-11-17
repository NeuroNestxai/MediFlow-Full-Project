import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiClient, RealtimeClient, createTokenStore, isApiError, mfaGateCode, type MfaGateCode } from '@qabnah/shared';

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/v1').replace(/\/+$/, '');
export const adminTokens = createTokenStore('qabnah.admin.session');
export const api = new ApiClient({ baseUrl: API_URL, tokens: adminTokens, onAuthLost: () => queryClient.removeQueries({ queryKey: ['a'] }) });
export const realtime = new RealtimeClient({ api });

/** Admin endpoints answer 403 mfa_enrollment_required / mfa_required when REQUIRE_ADMIN_MFA is on; the app reacts globally. */
type MfaListener = (code: MfaGateCode) => void;
const mfaListeners = new Set<MfaListener>();
export const onMfaGate = (fn: MfaListener) => { mfaListeners.add(fn); return () => { mfaListeners.delete(fn); }; };
const emitMfa = (e: unknown) => { const c = mfaGateCode(e); if (c) mfaListeners.forEach((l) => l(c)); };

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: emitMfa }),
  mutationCache: new MutationCache({ onError: emitMfa }),
  defaultOptions: {
    queries: { staleTime: 15_000, retry: (n, e) => !(isApiError(e) && e.status >= 400 && e.status < 500) && n < 2 },
    mutations: { retry: false },
  },
});
