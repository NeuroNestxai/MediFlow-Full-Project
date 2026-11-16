import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { ErrorState, Loading, fetchMe, useTokens, type Me } from '@qabnah/shared';
import { adminTokens, api, realtime } from './api';

interface Session { me: Me; perms: string[]; can: (...p: string[]) => boolean; signOut: () => Promise<void> }
const Ctx = createContext<Session | null>(null);
export const meKey = ['a', 'me'] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const tokens = useTokens(adminTokens);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: meKey, queryFn: () => fetchMe(api), enabled: !!tokens, staleTime: 60_000 });
  useEffect(() => { if (tokens) realtime.start(); else realtime.stop(); }, [tokens]);
  const signOut = useCallback(async () => { realtime.stop(); await api.logout(); qc.removeQueries({ queryKey: ['a'] }); }, [qc]);
  const value = useMemo<Session | null>(() => (q.data ? { me: q.data, perms: q.data.permissions, can: (...p) => p.some((x) => q.data!.permissions.includes(x)), signOut } : null), [q.data, signOut]);
  if (tokens && q.isLoading) return <Loading />;
  if (tokens && q.isError) return <div className="auth-page"><div className="card auth-card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div></div>;
  return <Ctx.Provider value={tokens ? value : null}>{children}</Ctx.Provider>;
}

export const useOptionalSession = () => useContext(Ctx);
export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('No admin session');
  return s;
}

export function RequireStaff({ children }: { children: ReactNode }) {
  const s = useContext(Ctx);
  const loc = useLocation();
  if (!s) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

/** Render children only when the user has any of the permissions. */
export function Can({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const s = useContext(Ctx);
  const list = Array.isArray(perm) ? perm : [perm];
  return <>{s?.can(...list) ? children : null}</>;
}
