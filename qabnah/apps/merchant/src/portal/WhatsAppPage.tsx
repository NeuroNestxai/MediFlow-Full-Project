import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Loading, PageHeader, StatusBadge, Switch, Tabs, errorMessage, normalizeOmanPhone, useI18n, useToast,
  type WhatsAppEvent, type WhatsAppLog,
} from '@qabnah/shared';
import { merchantApi } from '../api';
import { useSession } from './session';
import { useMerchantPatch } from './store/StorePage';

const EVENTS: WhatsAppEvent[] = ['order.placed', 'order.accepted', 'delivery.picked_up', 'delivery.delivered'];

export function WhatsAppPage() {
  const { t, dateTime } = useI18n();
  const { detail, merchantId, can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const patch = useMerchantPatch();
  const manage = can('merchant.store:manage');
  const [enabled, setEnabled] = useState(detail?.whatsappEnabled ?? false);
  const [phone, setPhone] = useState(detail?.whatsappPhone ?? '');
  const [events, setEvents] = useState<WhatsAppEvent[]>(detail?.whatsappNotifyEvents ?? []);
  const [testPhone, setTestPhone] = useState('');
  const [tab, setTab] = useState<'outbound' | 'inbound'>('outbound');
  const log = useQuery({ queryKey: ['m', 'wa', merchantId], queryFn: () => merchantApi.get<WhatsAppLog>(`/merchants/${merchantId}/whatsapp/messages`, { query: { limit: 50 } }), refetchInterval: 30_000 });
  const test = useMutation({
    mutationFn: () => merchantApi.post<{ status?: string; provider?: string }>(`/merchants/${merchantId}/whatsapp/test`, { phone: testPhone }),
    onSuccess: () => { toast.push(t('wa.testSent')); void qc.invalidateQueries({ queryKey: ['m', 'wa', merchantId] }); },
  });
  if (!detail) return <Loading />;
  const phoneErr = phone && !normalizeOmanPhone(phone) ? t('delivery.phoneInvalid') : patch.errors.whatsappPhone;
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (phoneErr) return;
    patch.mutate({ whatsappEnabled: enabled, whatsappNotifyEvents: events, ...(phone ? { whatsappPhone: phone } : {}) });
  };
  const consoleOnly = log.data?.outbound.some((m) => m.provider === 'console');
  return (
    <>
      <PageHeader title={t('nav.whatsapp')} description={t('wa.hint')} />
      <Alert tone="info" title={t('wa.providerTitle')}>{t('wa.providerBody')}{consoleOnly ? <div className="text-sm strong">{t('wa.consoleDetected')}</div> : null}</Alert>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form onSubmit={save} noValidate>
          <Card title={t('wa.settings')} footer={manage ? <Button type="submit" variant="primary" loading={patch.isPending}>{t('common.save')}</Button> : undefined}>
            <fieldset disabled={!manage} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <Switch checked={enabled} onChange={setEnabled} label={t('wa.enable')} description={t('wa.enableHint')} />
              <Input label={t('wa.businessPhone')} type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} error={phoneErr} hint={t('wa.businessPhoneHint')} />
              <div className="field">
                <span className="field__label">{t('wa.events')}</span>
                {EVENTS.map((ev) => (
                  <Checkbox key={ev} checked={events.includes(ev)} onChange={(v) => setEvents(v ? [...events, ev] : events.filter((x) => x !== ev))} label={t(`wa.event.${ev}`)} />
                ))}
              </div>
              {patch.isError ? <Alert tone="danger">{errorMessage(patch.error, t)}</Alert> : null}
              {detail.plan && detail.plan.features?.whatsapp === false ? <Alert tone="warning">{t('wa.planNote')}</Alert> : null}
            </fieldset>
          </Card>
        </form>
        <Card title={t('wa.test')}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (normalizeOmanPhone(testPhone)) test.mutate(); }} noValidate>
            <p className="text-sm muted">{t('wa.testHint')}</p>
            <Input label={t('common.phone')} type="tel" dir="ltr" placeholder="+968 9XXXXXXX" value={testPhone} onChange={(e) => setTestPhone(e.target.value)}
              error={testPhone && !normalizeOmanPhone(testPhone) ? t('delivery.phoneInvalid') : null} disabled={!manage} />
            {test.isError ? <Alert tone="danger">{errorMessage(test.error, t)}</Alert> : null}
            {test.isSuccess ? <Alert tone="success">{t('wa.testResult', { status: test.data?.status ?? 'sent', provider: test.data?.provider ?? '—' })}</Alert> : null}
            <div><Button type="submit" icon="whatsapp" variant="whatsapp" loading={test.isPending} disabled={!manage || !normalizeOmanPhone(testPhone)}>{t('wa.sendTest')}</Button></div>
          </form>
        </Card>
      </div>
      <Card flush title={t('wa.log')} actions={<Button size="sm" icon="refresh" onClick={() => log.refetch()}>{t('common.refresh')}</Button>}>
        <div className="pad" style={{ paddingBlockEnd: 0 }}>
          <Tabs label={t('wa.log')} value={tab} onChange={setTab} tabs={[
            { value: 'outbound', label: t('wa.outbound'), badge: log.data ? <Badge>{log.data.outbound.length}</Badge> : null },
            { value: 'inbound', label: t('wa.inbound'), badge: log.data ? <Badge>{log.data.inbound.length}</Badge> : null },
          ]} />
        </div>
        {log.isLoading ? <Loading /> : log.isError ? <ErrorState error={log.error} onRetry={() => log.refetch()} /> : tab === 'outbound' ? (
          !log.data?.outbound.length ? <EmptyState icon="chat" title={t('wa.noMessages')} /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('common.date')}</th><th>{t('wa.to')}</th><th>{t('wa.template')}</th><th>{t('common.status')}</th><th>{t('wa.provider')}</th></tr></thead>
              <tbody>{log.data.outbound.map((m) => (
                <tr key={m.id}><td className="nowrap">{dateTime(m.createdAt)}</td><td className="ltr">{m.to}</td><td className="mono">{m.template}</td>
                  <td><StatusBadge kind="raw" status={m.status} />{m.error ? <div className="text-xs danger-text">{m.error}</div> : null}</td><td><Badge tone={m.provider === 'console' ? 'warning' : 'success'}>{m.provider}</Badge></td></tr>
              ))}</tbody>
            </table></div>
          )
        ) : !log.data?.inbound.length ? <EmptyState icon="chat" title={t('wa.noInbound')} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{t('common.date')}</th><th>{t('wa.from')}</th><th>{t('wa.message')}</th></tr></thead>
            <tbody>{log.data.inbound.map((m) => <tr key={m.id}><td className="nowrap">{dateTime(m.createdAt)}</td><td className="ltr">{m.from}</td><td>{m.body}</td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
