import { QueryClient } from '@tanstack/react-query';
import { ApiClient, RealtimeClient, createTokenStore, isApiError } from '@qabnah/shared';

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/v1').replace(/\/+$/, '');
export const adminTokens = createTokenStore('qabnah.admin.session');
export const api = new ApiClient({ baseUrl: API_URL, tokens: adminTokens, onAuthLost: () => queryClient.removeQueries({ queryKey: ['a'] }) });
export const realtime = new RealtimeClient({ api });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: (n, e) => !(isApiError(e) && e.status >= 400 && e.status < 500) && n < 2 },
    mutations: { retry: false },
  },
});
