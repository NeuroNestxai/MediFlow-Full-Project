import { Link, useParams } from 'react-router-dom';
import { Card, ErrorState, Loading, PageHeader, useI18n } from '@qabnah/shared';
import { OrderActionsBar, OrderDetailBody, OrderMap, useMerchantOrder } from './OrderDetail';

export function OrderPage() {
  const { id } = useParams();
  const { t, dateTime } = useI18n();
  const q = useMerchantOrder(id ?? null);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;
  return (
    <>
      <PageHeader title={<span className="ltr">#{o.number}</span>} description={dateTime(o.createdAt)}
        actions={<><Link className="btn btn--ghost" to="/orders">{t('nav.board')}</Link><OrderActionsBar order={o} /></>} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title={t('common.details')}><div className="stack stack-lg"><OrderDetailBody order={o} /></div></Card>
        {o.delivery ? <Card title={t('orders.liveTracking')}><OrderMap order={o} height={420} /></Card> : null}
      </div>
    </>
  );
}
