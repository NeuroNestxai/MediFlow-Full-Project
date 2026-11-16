import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { fetchMe, prefs, useTokens, Loading, ErrorState, type Me, type MeMerchant, type MerchantDetail } from '@qabnah/shared';
import { merchantApi, merchantRealtime, merchantTokens } from '../api';

const ACTIVE_KEY = 'qabnah.merchant.active';

interface Session {
  me: Me;
  merchants: MeMerchant[];
  merchant: MeMerchant | null;
  merchantId: string | null;
  detail: MerchantDetail | undefined;
  perms: string[];
  can: (perm: string) => boolean;
  setMerchantId: (id: string) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export const meKey = ['m', 'me'] as const;
export const merchantKey = (mid: string | null) => ['m', 'merchant', mid] as const;

export function useMe(enabled = true) {
  return useQuery({ queryKey: meKey, queryFn: () => fetchMe(merchantApi), enabled, staleTime: 60_000 });
}

export function MerchantSessionProvider({ children }: { children: ReactNode }) {
  const tokens = useTokens(merchantTokens);
  const qc = useQueryClient();
  const meQ = useMe(!!tokens);
  const [selected, setSelected] = useState<string | null>(() => prefs.get<string | null>(ACTIVE_KEY, null));
  const merchants = useMemo(() => meQ.data?.merchants ?? [], [meQ.data]);
  const merchant = merchants.find((m) => m.id === selected) ?? merchants[0] ?? null;
  const merchantId = merchant?.id ?? null;
  const detailQ = useQuery({
    queryKey: merchantKey(merchantId),
    queryFn: () => merchantApi.get<MerchantDetail>(`/merchants/${merchantId}`),
    enabled: !!merchantId && !!merchant?.permissions.includes('merchant.store:read'),
  });

  useEffect(() => {
    if (tokens) merchantRealtime.start();
    else merchantRealtime.stop();
  }, [tokens]);

  const setMerchantId = useCallback((id: string) => { prefs.set(ACTIVE_KEY, id); setSelected(id); }, []);
  const signOut = useCallback(async () => {
    merchantRealtime.stop();
    await merchantApi.logout();
    qc.removeQueries({ queryKey: ['m'] });
  }, [qc]);

  const value = useMemo<Session | null>(() => {
    if (!meQ.data) return null;
    const perms = merchant?.permissions ?? [];
    return { me: meQ.data, merchants, merchant, merchantId, detail: detailQ.data, perms, can: (p) => perms.includes(p), setMerchantId, signOut };
  }, [meQ.data, merchants, merchant, merchantId, detailQ.data, setMerchantId, signOut]);

  if (!tokens) return <Ctx.Provider value={null}>{children}</Ctx.Provider>;
  if (meQ.isLoading) return <Loading />;
  if (meQ.isError) return <div className="auth-page"><div className="card auth-card"><ErrorState error={meQ.error} onRetry={() => meQ.refetch()} /></div></div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Session for pages inside the portal (guaranteed by <RequireMerchant>). */
export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside an authenticated portal route');
  return v;
}

export function useOptionalSession(): Session | null {
  return useContext(Ctx);
}

export function RequireMerchant({ children }: { children: ReactNode }) {
  const s = useContext(Ctx);
  const loc = useLocation();
  if (!s) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!s.merchants.length) return <Navigate to="/no-store" replace />;
  return <>{children}</>;
}

/** Hide children unless the active merchant role grants `perm`. */
export function Can({ perm, children, fallback = null }: { perm: string; children: ReactNode; fallback?: ReactNode }) {
  const s = useContext(Ctx);
  return <>{s?.can(perm) ? children : fallback}</>;
}
