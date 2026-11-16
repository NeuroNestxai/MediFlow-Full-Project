import { QueryClient } from '@tanstack/react-query';
import { ApiClient, RealtimeClient, createTokenStore, isApiError } from '@qabnah/shared';

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4100/v1').replace(/\/+$/, '');

/** Merchant staff session (email/password). */
export const merchantTokens = createTokenStore('qabnah.merchant.session');
/** Consumer session for the public storefront (phone OTP) — kept separate from the staff session on the same origin. */
export const consumerTokens = createTokenStore('qabnah.consumer.session');

export const merchantApi = new ApiClient({ baseUrl: API_URL, tokens: merchantTokens, onAuthLost: () => queryClient.removeQueries({ queryKey: ['m'] }) });
export const consumerApi = new ApiClient({ baseUrl: API_URL, tokens: consumerTokens, onAuthLost: () => queryClient.removeQueries({ queryKey: ['c'] }) });
/** Anonymous calls (storefront browsing, pay page). */
export const publicApi = new ApiClient({ baseUrl: API_URL, tokens: createTokenStore('qabnah.public.none') });

export const merchantRealtime = new RealtimeClient({ api: merchantApi });
export const consumerRealtime = new RealtimeClient({ api: consumerApi });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(isApiError(err) && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});
