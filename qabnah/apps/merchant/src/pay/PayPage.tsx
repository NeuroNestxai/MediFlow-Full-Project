import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Card, EmptyState, ErrorState, Icon, Input, Loading, Price, Spinner, StatusBadge, Textarea, errorMessage, isApiError, normalizeOmanPhone, useDocumentTitle, useI18n,
  type Checkout, type LatLng, type PaymentStatus, type PublicPaymentLink,
} from '@qabnah/shared';
import { PinPicker } from '@qabnah/shared/map';
import { publicApi } from '../api';
import { StoreLogo, useBrandScope } from '../storefront/StorefrontLayout';

export function PayPage() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const { t, pick, money, dateTime, toggleLang, lang } = useI18n();
  const paymentId = params.get('paymentId');
  const link = useQuery({ queryKey: ['pay', code], queryFn: () => publicApi.get<PublicPaymentLink>(`/pay/${code}`, { auth: false }), enabled: !!code, retry: false });
  const payment = useQuery({
    queryKey: ['pay', 'payment', paymentId],
    queryFn: () => publicApi.get<PaymentStatus>(`/payments/${paymentId}`, { auth: false }),
    enabled: !!paymentId,
    refetchInterval: (q) => (!q.state.data || q.state.data.status === 'pending' ? 2000 : false),
  });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const checkout = useMutation({
    mutationFn: () => publicApi.post<Checkout>(`/pay/${code}/checkout`, {
      ...(name.trim() ? { customerName: name.trim() } : {}), ...(phone.trim() ? { customerPhone: phone.trim() } : {}),
      ...(link.data?.requestDelivery && loc ? { dropoff: { location: loc, address: address.trim(), contactName: name.trim() || undefined, contactPhone: phone.trim() || undefined } } : {}),
    }, { auth: false }),
    onSuccess: (c) => window.location.assign(c.checkoutUrl),
  });
  useBrandScope(link.data?.merchant.brandColor);
  useDocumentTitle(link.data ? `${link.data.title} · ${pick(link.data.merchant.nameEn, link.data.merchant.nameAr)}` : t('pay.title'));

  if (link.isLoading) return <Loading />;
  if (link.isError || !link.data) {
    return <div className="auth-page"><Card className="auth-card">{isApiError(link.error) && link.error.status === 404 ? <EmptyState icon="link" title={t('pay.notFound')}>{t('pay.notFoundHint')}</EmptyState> : <ErrorState error={link.error} onRetry={() => link.refetch()} />}</Card></div>;
  }
  const l = link.data;
  const m = l.merchant;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (l.requestDelivery) {
      if (!name.trim()) errs.name = t('common.required');
      if (!normalizeOmanPhone(phone)) errs.phone = t('delivery.phoneInvalid');
      if (!loc) errs.location = t('delivery.pinRequired');
      if (!address.trim()) errs.address = t('common.required');
    } else if (phone.trim() && !normalizeOmanPhone(phone)) errs.phone = t('delivery.phoneInvalid');
    setErrors(errs);
    if (!Object.keys(errs).length) checkout.mutate();
  };
  const outcome = payment.data?.status;
  return (
    <div className="pay-page">
      <div className="receipt">
        <div className="receipt__head">
          <div className="row between">
            <div className="receipt__merchant">
              <StoreLogo m={m} size={44} />
              <div className="stack" style={{ ['--gap' as string]: '0px' }}>
                <strong>{pick(m.nameEn, m.nameAr)}</strong>
                <span className="text-xs" style={{ opacity: 0.8 }}>{t('pay.request')}</span>
              </div>
            </div>
            <button type="button" className="btn btn--sm on-night-btn" onClick={toggleLang} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={t('lang.switchLabel')}>{t('lang.switch')}</button>
          </div>
        </div>
        <div className="receipt__amount">
          <span className="text-sm muted">{l.title}</span>
          <Price baisa={l.amountBaisa} testId="pay-amount" />
          {l.description ? <span className="text-sm muted">{l.description}</span> : null}
        </div>
        <div className="receipt__rows">
          <div className="row between"><span className="muted">{t('common.status')}</span><StatusBadge kind="raw" status={outcome === 'paid' ? 'paid' : l.status} /></div>
          <div className="row between"><span className="muted">{t('pay.reference')}</span><span className="mono ltr">{l.code}</span></div>
          {l.expiresAt && l.status === 'active' ? <div className="row between"><span className="muted">{t('pay.validUntil')}</span><span>{dateTime(l.expiresAt)}</span></div> : null}
          {l.requestDelivery ? <div className="row between"><span className="muted">{t('orders.delivery')}</span><span>{t('pay.withDelivery')}</span></div> : null}
        </div>
        <div className="receipt__cut" aria-hidden="true" />
        <div className="receipt__body">
          {paymentId ? (
            <div className="stack" aria-live="polite">
              {!outcome || outcome === 'pending' ? <div className="row" style={{ justifyContent: 'center' }}><Spinner /> <span>{t('pay.confirming')}</span></div> : null}
              {outcome === 'paid' ? <Alert tone="success" title={t('pay.successTitle')}>{l.requestDelivery ? t('pay.successDelivery') : t('pay.successBody')}</Alert> : null}
              {outcome && !['paid', 'pending'].includes(outcome) ? <Alert tone="danger" title={t('pay.failedTitle')}>{t('pay.failedBody')}</Alert> : null}
            </div>
          ) : null}
          {l.status === 'active' && outcome !== 'paid' ? (
            <form className="stack" onSubmit={submit} noValidate>
              <div className="form-grid">
                <Input label={t('pay.name')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" optional={!l.requestDelivery} />
                <Input label={t('pay.phone')} type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} autoComplete="tel" placeholder="+968 9XXXXXXX" optional={!l.requestDelivery} />
              </div>
              {l.requestDelivery ? (
                <div className="stack">
                  <span className="field__label">{t('pay.deliverTo')}</span>
                  <PinPicker value={loc} onChange={setLoc} height={240} />
                  {errors.location ? <span className="field__error">{errors.location}</span> : null}
                  <Textarea label={t('delivery.addressText')} rows={2} value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} />
                </div>
              ) : null}
              {checkout.isError ? <Alert tone="danger">{errorMessage(checkout.error, t)}</Alert> : null}
              <Button type="submit" variant="primary" size="lg" block loading={checkout.isPending}>{t('pay.payNow', { amount: money(l.amountBaisa) })}</Button>
              <p className="text-xs muted" style={{ textAlign: 'center' }}><Icon name="shield" width={13} height={13} /> {t('pay.secureNote')}</p>
            </form>
          ) : l.status !== 'active' && !paymentId ? <Alert tone={l.status === 'paid' ? 'success' : 'warning'}>{t(`pay.status.${l.status}`)}</Alert> : null}
        </div>
      </div>
      <div className="pay-foot"><span>{t('sf.poweredBy')}</span><img src="/brand/logo.svg" alt="Qabnah" height={22} /></div>
    </div>
  );
}
