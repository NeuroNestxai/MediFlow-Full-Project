import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  BOARD_COLUMNS, Button, EmptyState, ErrorState, Loading, PageHeader, Segmented, playChime, prefs, useDocumentTitle, useI18n,
  useRealtimeChannel, useToast, type Order, type Page,
} from '@qabnah/shared';
import { merchantApi, merchantRealtime } from '../../api';
import { useSession } from '../session';
import { OrderCard } from './OrderCard';
import { OrderDrawer } from './OrderDetail';
import { useOrderActions } from './useOrderActions';
import { useProductImages } from '../useProductImages';

const SOUND_KEY = 'qabnah.merchant.sound';

export function OrdersBoard() {
  const { t, num } = useI18n();
  const { merchantId, perms, detail } = useSession();
  const images = useProductImages();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const openId = params.get('order');
  const [sound, setSound] = useState(() => prefs.get(SOUND_KEY, true));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [mobileCol, setMobileCol] = useState('placed');
  const known = useRef<Set<string> | null>(null);
  const { run, dialogs, busy } = useOrderActions();

  const q = useQuery({
    queryKey: ['m', 'orders', merchantId, 'board'],
    queryFn: () => merchantApi.get<Page<Order>>(`/merchants/${merchantId}/orders`, { query: { status: 'active', limit: 100 } }),
    refetchInterval: 15_000, // polling fallback when the socket is down
    enabled: !!merchantId,
  });

  const alertNew = (count: number, number?: string) => {
    if (sound) playChime();
    toast.push(number ? t('orders.newOrderToast', { number }) : t('orders.newOrdersToast', { n: count }), 'info');
  };

  // Detect new "placed" orders from polling too (covers missed socket events).
  useEffect(() => {
    const items = q.data?.items;
    if (!items) return;
    const placed = items.filter((o) => o.status === 'placed').map((o) => o.id);
    if (known.current) {
      const added = placed.filter((id) => !known.current!.has(id));
      if (added.length) {
        setFresh((s) => new Set([...s, ...added]));
        const first = items.find((o) => o.id === added[0]);
        alertNew(added.length, added.length === 1 ? first?.number : undefined);
      }
    }
    known.current = new Set([...(known.current ?? []), ...placed]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  useRealtimeChannel(merchantRealtime, merchantId ? `merchant:${merchantId}` : null, (e) => {
    if (e.event === 'order.created' || e.event.startsWith('order.') || e.event.startsWith('delivery.')) {
      void qc.invalidateQueries({ queryKey: ['m', 'orders', merchantId] });
      const oid = (e.data as { orderId?: string }).orderId;
      if (oid) void qc.invalidateQueries({ queryKey: ['m', 'order', merchantId, oid] });
    }
  });

  const newCount = q.data?.items.filter((o) => o.status === 'placed').length ?? 0;
  useDocumentTitle(newCount ? `(${newCount}) ${t('nav.board')} · ${t('app.name')}` : `${t('nav.board')} · ${t('app.name')}`);

  const columns = useMemo(() => BOARD_COLUMNS.map((c) => ({ ...c, orders: (q.data?.items ?? []).filter((o) => c.statuses.includes(o.status)) })), [q.data]);
  const open = (id: string) => {
    setFresh((s) => { const n = new Set(s); n.delete(id); return n; });
    setParams((p) => { p.set('order', id); return p; });
  };

  return (
    <>
      <PageHeader title={t('nav.board')} description={t('orders.boardHint')}
        actions={<>
          <Button size="sm" icon={sound ? 'sound' : 'mute'} aria-pressed={sound} onClick={() => { const v = !sound; setSound(v); prefs.set(SOUND_KEY, v); if (v) playChime(); }}>
            {sound ? t('orders.soundOn') : t('orders.soundOff')}
          </Button>
          <Button size="sm" icon="refresh" onClick={() => q.refetch()} loading={q.isFetching && !q.isLoading}>{t('common.refresh')}</Button>
        </>} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="board-mobile-switch">
            <Segmented label={t('nav.board')} value={mobileCol} onChange={setMobileCol}
              options={columns.map((c) => ({ value: c.key, label: <>{t(`order.status.${c.key}`)}{c.orders.length ? <> <span className="badge">{num(c.orders.length, 0)}</span></> : null}</> }))} />
          </div>
          <div className="board" role="list" aria-label={t('nav.board')}>
            {columns.map((c) => (
              <section key={c.key} className={`board__col ${c.key === mobileCol ? 'board__col--current' : ''}`} role="listitem" aria-labelledby={`col-${c.key}`} data-column={c.key}>
                <header className="board__col-head">
                  <h2 id={`col-${c.key}`}>{t(`order.status.${c.key}`)}</h2>
                  <span className={`badge ${c.key === 'placed' && c.orders.length ? 'badge--accent' : ''}`}>{num(c.orders.length, 0)}</span>
                </header>
                <div className="board__col-body">
                  {c.orders.length === 0 ? <div className="board__empty">{t('orders.columnEmpty')}</div> : c.orders.map((o) => (
                    <OrderCard key={o.id} order={o} perms={perms} busy={busy} highlight={fresh.has(o.id)} onOpen={() => open(o.id)} onAction={(a) => run(o, a)}
                      thumbUrl={images.get(o.items[0]?.productId ?? '')} category={detail?.category} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          {q.data && q.data.items.length === 0 ? <EmptyState icon="orders" title={t('orders.noActive')}>{t('orders.noActiveHint')}</EmptyState> : null}
        </>
      )}
      <OrderDrawer orderId={openId} onClose={() => setParams((p) => { p.delete('order'); return p; })} />
      {dialogs}
    </>
  );
}
