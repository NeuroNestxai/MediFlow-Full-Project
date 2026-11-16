import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, Select, StatusBadge, useI18n, type Order, type OrderStatus, type Page } from '@qabnah/shared';
import { merchantApi } from '../../api';
import { useSession } from '../session';
import { OrderDrawer } from './OrderDetail';

const STATUSES: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'completed', 'rejected', 'cancelled'];
const LIMIT = 20;

export function OrderHistory() {
  const { t, money, dateTime, num } = useI18n();
  const { merchantId } = useSession();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [offset, setOffset] = useState(0);
  const q = useQuery({
    queryKey: ['m', 'orders', merchantId, 'history', status, type, offset],
    queryFn: () => merchantApi.get<Page<Order>>(`/merchants/${merchantId}/orders`, { query: { status: status || undefined, type: type || undefined, limit: LIMIT, offset } }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title={t('nav.history')} description={t('history.hint')} />
      <Card flush title={
        <div className="row" style={{ flex: 1 }}>
          <Select label={t('common.status')} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} placeholder={t('common.all')}
            options={STATUSES.map((s) => ({ value: s, label: t(`order.status.${s}`) }))} />
          <Select label={t('common.type')} value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }} placeholder={t('common.all')}
            options={(['marketplace', 'merchant_delivery'] as const).map((s) => ({ value: s, label: t(`order.type.${s}`) }))} />
        </div>
      }>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? (
          <EmptyState icon="history" title={t('history.empty')} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('orders.number')}</th><th>{t('common.date')}</th><th>{t('orders.customer')}</th><th>{t('common.type')}</th><th>{t('common.status')}</th><th>{t('orders.payment')}</th><th className="num">{t('common.total')}</th></tr></thead>
                <tbody>
                  {q.data.items.map((o) => (
                    <tr key={o.id} className="clickable" tabIndex={0} onClick={() => setParams({ order: o.id })} onKeyDown={(e) => { if (e.key === 'Enter') setParams({ order: o.id }); }}>
                      <td className="strong ltr">#{o.number}</td>
                      <td className="nowrap">{dateTime(o.placedAt ?? o.createdAt)}</td>
                      <td>{o.customerName ?? o.delivery?.dropoff.contactName ?? '—'}</td>
                      <td>{t(`order.type.${o.type}`)}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td>{t(`payment.method.${o.paymentMethod}`)}</td>
                      <td className="num strong">{money(o.totalBaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
            <span className="sr-only">{num(q.data.total, 0)}</span>
          </>
        )}
      </Card>
      <OrderDrawer orderId={params.get('order')} onClose={() => setParams({})} />
    </>
  );
}
