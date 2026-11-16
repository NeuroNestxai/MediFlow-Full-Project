import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, Card, Input, MoneyInput, PageHeader, Segmented, Textarea, errorMessage, isApiError, newIdempotencyKey, normalizeOmanPhone, useDebounced, useI18n,
  type DeliveryQuote, type LatLng, type Order,
} from '@qabnah/shared';
import { Marker, PICKUP_COLOR, PinPicker, Tooltip, pinIcon } from '@qabnah/shared/map';
import { merchantApi } from '../api';
import { useSession } from './session';

type Size = 'small' | 'medium' | 'large';

export function BookDelivery() {
  const { t, money, num } = useI18n();
  const { merchantId, detail } = useSession();
  const nav = useNavigate();
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const [f, setF] = useState({ address: '', contactName: '', contactPhone: '', notes: '', packageDescription: '' });
  const [size, setSize] = useState<Size>('small');
  const [cod, setCod] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [idemKey] = useState(newIdempotencyKey);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pickup = detail?.location ?? null;
  const pickupIcon = useMemo(() => pinIcon(PICKUP_COLOR), []);

  const debDrop = useDebounced(dropoff, 300);
  const quote = useQuery({
    queryKey: ['m', 'quote', pickup, debDrop],
    queryFn: () => merchantApi.post<DeliveryQuote>('/quotes/delivery', { type: 'merchant_delivery', pickup, dropoff: debDrop }),
    enabled: !!pickup && !!debDrop,
    retry: false,
  });

  const m = useMutation({
    mutationFn: () => merchantApi.post<Order>(`/merchants/${merchantId}/deliveries`, {
      dropoff: { location: dropoff, address: f.address.trim(), contactName: f.contactName.trim(), contactPhone: f.contactPhone.trim(), ...(f.notes ? { notes: f.notes } : {}) },
      ...(cod ? { codAmountBaisa: cod } : {}),
      packageSize: size,
      ...(f.packageDescription ? { packageDescription: f.packageDescription } : {}),
    }, { idempotencyKey: idemKey }),
    onSuccess: (o) => nav(`/orders/${o.id}`),
    onError: (e) => { if (isApiError(e)) setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k.replace(/^dropoff\./, ''), v]))); },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!dropoff) errs.location = t('delivery.pinRequired');
    if (!f.address.trim()) errs.address = t('common.required');
    if (!f.contactName.trim()) errs.contactName = t('common.required');
    if (!normalizeOmanPhone(f.contactPhone)) errs.contactPhone = t('delivery.phoneInvalid');
    if (cod != null && cod < 0) errs.cod = t('delivery.codInvalid');
    setErrors(errs);
    if (!Object.keys(errs).length) m.mutate();
  };

  const quoteErr = quote.isError ? errorMessage(quote.error, t) : null;
  return (
    <>
      <PageHeader title={t('nav.bookDelivery')} description={t('delivery.hint')} />
      {detail && detail.status !== 'active' ? <Alert tone="warning">{t('delivery.needsApproval')}</Alert> : null}
      <form onSubmit={submit} noValidate className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title={t('delivery.where')}>
          <div className="stack">
            <PinPicker value={dropoff} onChange={setDropoff} height={340} center={pickup ?? undefined} label={t('delivery.dropoffPin')}
              extra={pickup ? <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}><Tooltip permanent direction="top">{t('delivery.yourStore')}</Tooltip></Marker> : null} />
            {errors.location ? <span className="field__error" role="alert">{errors.location}</span> : null}
            <Textarea label={t('delivery.addressText')} rows={2} value={f.address} onChange={set('address')} error={errors.address} placeholder={t('delivery.addressPlaceholder')} required />
          </div>
        </Card>
        <div className="stack stack-lg">
          <Card title={t('delivery.customer')}>
            <div className="form-grid">
              <Input label={t('delivery.customerName')} value={f.contactName} onChange={set('contactName')} error={errors.contactName} autoComplete="off" required />
              <Input label={t('delivery.customerPhone')} type="tel" dir="ltr" placeholder="+968 9XXXXXXX" value={f.contactPhone} onChange={set('contactPhone')} error={errors.contactPhone} required />
              <Textarea label={t('delivery.notesForCaptain')} rows={2} value={f.notes} onChange={set('notes')} fieldClassName="span-all" optional />
            </div>
          </Card>
          <Card title={t('delivery.package')}>
            <div className="stack">
              <div className="field">
                <span className="field__label">{t('delivery.size')}</span>
                <Segmented label={t('delivery.size')} value={size} onChange={setSize}
                  options={(['small', 'medium', 'large'] as const).map((s) => ({ value: s, label: t(`delivery.size.${s}`) }))} />
              </div>
              <Input label={t('delivery.description')} value={f.packageDescription} onChange={set('packageDescription')} placeholder={t('delivery.descriptionPlaceholder')} optional />
              <MoneyInput label={t('delivery.codAmount')} valueBaisa={cod} onChangeBaisa={setCod} error={errors.cod ?? errors.codAmountBaisa} hint={t('delivery.codHint')} optional />
            </div>
          </Card>
          <Card title={t('delivery.quote')}>
            <div className="stack">
              {!dropoff ? <p className="muted">{t('delivery.quoteHint')}</p> : quote.isFetching ? <p className="muted">{t('delivery.quoting')}</p> : quoteErr ? <Alert tone="danger">{quoteErr}</Alert> : quote.data ? (
                <div className="stack stack-sm">
                  <div className="row between"><span className="muted">{t('delivery.fee')}</span><span className="kpi__value" data-testid="quote-fee">{money(quote.data.feeBaisa)}</span></div>
                  <div className="row between text-sm"><span className="muted">{t('delivery.distance')}</span><span>{num(quote.data.distanceM / 1000, 1)} {t('units.km')}</span></div>
                  <div className="row between text-sm"><span className="muted">{t('delivery.eta')}</span><span>{t('common.minutes', { n: num(Math.round(quote.data.estimatedDurationS / 60), 0) })}</span></div>
                  {cod ? <div className="row between text-sm"><span className="muted">{t('delivery.captainCollects')}</span><span className="strong">{money(cod)}</span></div> : null}
                  <p className="text-xs muted">{t('delivery.feeCharged')}</p>
                </div>
              ) : null}
              {m.isError ? <Alert tone="danger">{errorMessage(m.error, t)}</Alert> : null}
              <Button type="submit" variant="primary" size="lg" block loading={m.isPending} disabled={!!quoteErr || detail?.status !== 'active'}>{t('delivery.submit')}</Button>
            </div>
          </Card>
        </div>
      </form>
    </>
  );
}
