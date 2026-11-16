import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, EmptyState, Input, Loading, Textarea, errorMessage, newIdempotencyKey, normalizeOmanPhone, useI18n,
  type Address, type AddressInput, type Checkout, type Items, type LatLng, type MarketplaceOrderInput, type Order, type PriceBreakdown,
} from '@qabnah/shared';
import { Marker, PICKUP_COLOR, PinPicker, Tooltip, pinIcon } from '@qabnah/shared/map';
import { consumerApi } from '../api';
import { cart, cartSubtotal, useCart } from './cart';
import { OtpSignIn, useConsumer } from './ConsumerAuth';
import { useStorefront } from './StorefrontLayout';

function AddressForm({ onSaved, onCancel, defaultName, center }: { onSaved: (a: Address) => void; onCancel?: () => void; defaultName: string; center: LatLng }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [f, setF] = useState({ label: 'home', area: '', street: '', building: '', floor: '', apartment: '', landmark: '', contactName: defaultName, contactPhone: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const storeIcon = useMemo(() => pinIcon(PICKUP_COLOR), []);
  const m = useMutation({
    mutationFn: () => {
      const body: AddressInput = { location: loc!, label: f.label || 'home' };
      for (const k of ['area', 'street', 'building', 'floor', 'apartment', 'landmark', 'contactName', 'contactPhone'] as const) if (f[k].trim()) body[k] = f[k].trim();
      return consumerApi.post<Address>('/me/addresses', body);
    },
    onSuccess: (a) => { void qc.invalidateQueries({ queryKey: ['c', 'addresses'] }); onSaved(a); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!loc) errs.location = t('delivery.pinRequired');
    if (!f.area.trim() && !f.street.trim() && !f.landmark.trim()) errs.area = t('sf.addressDetailRequired');
    if (f.contactPhone.trim() && !normalizeOmanPhone(f.contactPhone)) errs.contactPhone = t('delivery.phoneInvalid');
    setErr(errs);
    if (!Object.keys(errs).length) m.mutate();
  };
  return (
    <form className="stack" onSubmit={submit} noValidate data-testid="address-form">
      <PinPicker value={loc} onChange={setLoc} height={280} center={center} label={t('sf.dropoffPin')}
        extra={<Marker position={[center.lat, center.lng]} icon={storeIcon}><Tooltip>{t('sf.store')}</Tooltip></Marker>} />
      {err.location ? <span className="field__error" role="alert">{err.location}</span> : null}
      <div className="form-grid">
        <Input label={t('sf.area')} value={f.area} onChange={set('area')} error={err.area} placeholder={t('sf.areaPlaceholder')} />
        <Input label={t('sf.street')} value={f.street} onChange={set('street')} optional />
        <Input label={t('sf.building')} value={f.building} onChange={set('building')} optional />
        <Input label={t('sf.floor')} value={f.floor} onChange={set('floor')} optional />
        <Input label={t('sf.apartment')} value={f.apartment} onChange={set('apartment')} optional />
        <Input label={t('sf.addressLabel')} value={f.label} onChange={set('label')} placeholder={t('sf.labelPlaceholder')} optional />
        <Textarea label={t('sf.landmark')} rows={2} value={f.landmark} onChange={set('landmark')} fieldClassName="span-all" placeholder={t('sf.landmarkPlaceholder')} optional />
        <Input label={t('sf.recipientName')} value={f.contactName} onChange={set('contactName')} optional />
        <Input label={t('sf.recipientPhone')} type="tel" dir="ltr" value={f.contactPhone} onChange={set('contactPhone')} error={err.contactPhone} hint={t('sf.recipientPhoneHint')} optional />
      </div>
      {m.isError ? <Alert tone="danger">{errorMessage(m.error, t)}</Alert> : null}
      <div className="row">
        <Button type="submit" variant="primary" className="sf-primary" loading={m.isPending}>{t('sf.saveAddress')}</Button>
        {onCancel ? <Button onClick={onCancel}>{t('common.cancel')}</Button> : null}
      </div>
    </form>
  );
}

const addressLine = (a: Address) => [a.building && `${a.building}`, a.street, a.area, a.landmark].filter(Boolean).join('، ');

export function CheckoutPage() {
  const { sf } = useStorefront();
  const { t, pick, money, num } = useI18n();
  const nav = useNavigate();
  const c = useCart();
  const { signedIn, loading, me } = useConsumer();
  const m = sf.merchant;
  const mine = c && c.merchantId === m.id ? c : null;
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [payment, setPayment] = useState<'cod' | 'online'>(m.acceptsCod ? 'cod' : 'online');
  const [notes, setNotes] = useState('');
  const [idemKey] = useState(newIdempotencyKey);
  const addresses = useQuery({ queryKey: ['c', 'addresses'], queryFn: () => consumerApi.get<Items<Address>>('/me/addresses'), enabled: signedIn });
  useEffect(() => {
    if (!addresses.data) return;
    if (!addresses.data.items.length) setAdding(true);
    else if (!addressId || !addresses.data.items.some((a) => a.id === addressId)) setAddressId((addresses.data.items.find((a) => a.isDefault) ?? addresses.data.items[0]).id);
  }, [addresses.data, addressId]);

  const input: MarketplaceOrderInput | null = mine && addressId ? {
    merchantId: m.id, addressId, paymentMethod: payment, source: 'storefront', ...(notes.trim() ? { notes: notes.trim() } : {}),
    items: mine.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, optionIds: l.optionIds, ...(l.notes ? { notes: l.notes } : {}) })),
  } : null;
  const quoteInput = input ? { ...input, notes: undefined } : null;
  const quote = useQuery({
    queryKey: ['c', 'quote', quoteInput],
    queryFn: () => consumerApi.post<PriceBreakdown>('/orders/quote', quoteInput),
    enabled: signedIn && !!quoteInput,
    retry: false,
  });

  const place = useMutation({
    mutationFn: async () => {
      const order = await consumerApi.post<Order>('/orders', input, { idempotencyKey: idemKey });
      cart.clear();
      if (order.status === 'pending_payment' && payment === 'online') {
        const returnUrl = `${window.location.origin}/s/${m.slug}/orders/${order.id}`;
        const co = await consumerApi.post<Checkout>(`/orders/${order.id}/checkout`, { returnUrl });
        return { order, checkoutUrl: co.checkoutUrl };
      }
      return { order, checkoutUrl: null };
    },
    onSuccess: ({ order, checkoutUrl }) => {
      if (checkoutUrl) window.location.assign(checkoutUrl);
      else nav(`/s/${m.slug}/orders/${order.id}`, { replace: true });
    },
  });

  if (!mine) {
    return <main className="sf-container"><Card><EmptyState icon="cart" title={t('sf.cartEmpty')} action={<Link className="btn btn--primary sf-primary" to={`/s/${m.slug}`}>{t('sf.backToMenu')}</Link>} /></Card></main>;
  }
  const selected = addresses.data?.items.find((a) => a.id === addressId);
  return (
    <main className="sf-container checkout">
      <div className="row between"><h1>{t('sf.checkout')}</h1><Link to={`/s/${m.slug}`} className="btn btn--ghost btn--sm">{t('sf.backToMenu')}</Link></div>
      <div className="checkout__grid">
        <div className="stack stack-lg">
          <Card title={<h2><span className="step-num">1</span> {t('sf.stepSignIn')}</h2>}>
            {loading ? <Loading /> : signedIn ? (
              <div className="row between"><span>{t('sf.signedInAs')} <strong className="ltr">{me?.user.phone}</strong>{me?.user.fullName ? ` · ${me.user.fullName}` : ''}</span><Badge tone="success">✓</Badge></div>
            ) : <OtpSignIn />}
          </Card>
          <Card title={<h2><span className="step-num">2</span> {t('sf.stepAddress')}</h2>}>
            {!signedIn ? <p className="muted">{t('sf.signInFirst')}</p> : addresses.isLoading ? <Loading /> : (
              <div className="stack">
                {addresses.data?.items.length && !adding ? (
                  <>
                    <div className="stack stack-sm" role="radiogroup" aria-label={t('sf.stepAddress')}>
                      {addresses.data.items.map((a) => (
                        <label key={a.id} className={`option-row ${a.id === addressId ? 'option-row--on' : ''}`}>
                          <input type="radio" name="address" checked={a.id === addressId} onChange={() => setAddressId(a.id)} />
                          <span className="grow stack" style={{ ['--gap' as string]: '0px' }}>
                            <span className="strong">{a.label ?? t('sf.address')}</span>
                            <span className="text-sm muted">{addressLine(a) || `${a.location.lat.toFixed(4)}, ${a.location.lng.toFixed(4)}`}</span>
                          </span>
                          {!a.zoneId ? <Badge tone="danger">{t('sf.outsideArea')}</Badge> : null}
                        </label>
                      ))}
                    </div>
                    <div><Button size="sm" icon="plus" onClick={() => setAdding(true)}>{t('sf.newAddress')}</Button></div>
                  </>
                ) : (
                  <AddressForm defaultName={me?.user.fullName ?? ''} center={m.location} onCancel={addresses.data?.items.length ? () => setAdding(false) : undefined}
                    onSaved={(a) => { setAddressId(a.id); setAdding(false); }} />
                )}
                {selected && !selected.zoneId ? <Alert tone="warning">{t('sf.outsideAreaBody')}</Alert> : null}
              </div>
            )}
          </Card>
          <Card title={<h2><span className="step-num">3</span> {t('sf.stepPayment')}</h2>}>
            <div className="stack">
              <div className="stack stack-sm" role="radiogroup" aria-label={t('sf.stepPayment')}>
                {m.acceptsCod ? (
                  <label className={`option-row ${payment === 'cod' ? 'option-row--on' : ''}`}>
                    <input type="radio" name="pay" checked={payment === 'cod'} onChange={() => setPayment('cod')} />
                    <span className="grow"><span className="strong">{t('payment.method.cod')}</span><br /><span className="text-sm muted">{t('sf.codHint')}</span></span>
                  </label>
                ) : null}
                {m.acceptsOnline ? (
                  <label className={`option-row ${payment === 'online' ? 'option-row--on' : ''}`}>
                    <input type="radio" name="pay" checked={payment === 'online'} onChange={() => setPayment('online')} />
                    <span className="grow"><span className="strong">{t('sf.payOnline')}</span><br /><span className="text-sm muted">{t('sf.onlineHint')}</span></span>
                  </label>
                ) : null}
              </div>
              <Textarea label={t('sf.orderNotes')} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('sf.orderNotesPlaceholder')} optional />
            </div>
          </Card>
        </div>
        <aside className="stack stack-lg checkout__summary">
          <Card title={t('sf.summary')}>
            <div className="stack">
              <ul className="item-list">
                {mine.lines.map((l) => (
                  <li key={l.key}>
                    <div className="row between row-nowrap"><span><span className="strong">{num(l.quantity, 0)}×</span> {pick(l.nameEn, l.nameAr)}</span><span className="num">{money(l.unitPriceBaisa * l.quantity)}</span></div>
                    {l.optionLabels.length ? <div className="text-xs muted">{l.optionLabels.map((o) => pick(o.nameEn, o.nameAr)).join(' · ')}</div> : null}
                  </li>
                ))}
              </ul>
              <hr className="divider" />
              {!signedIn || !addressId ? (
                <div className="row between"><span className="muted">{t('orders.subtotal')}</span><span className="num">{money(cartSubtotal(mine))}</span></div>
              ) : quote.isLoading || quote.isFetching ? <Loading /> : quote.isError ? <Alert tone="danger" title={t('sf.quoteFailed')}>{errorMessage(quote.error, t)}</Alert> : quote.data ? (
                <div className="stack stack-sm text-sm" data-testid="quote-breakdown">
                  <div className="row between"><span className="muted">{t('orders.subtotal')}</span><span className="num">{money(quote.data.subtotalBaisa)}</span></div>
                  <div className="row between"><span className="muted">{t('orders.deliveryFee')}</span><span className="num">{money(quote.data.deliveryFeeBaisa)}</span></div>
                  {quote.data.serviceFeeBaisa ? <div className="row between"><span className="muted">{t('orders.serviceFee')}</span><span className="num">{money(quote.data.serviceFeeBaisa)}</span></div> : null}
                  {quote.data.discountBaisa ? <div className="row between"><span className="muted">{t('orders.discount')}</span><span className="num">{money(-quote.data.discountBaisa)}</span></div> : null}
                  <div className="row between"><span className="muted">{quote.data.vatIncluded ? t('sf.vatIncluded') : t('orders.vat')}</span><span className="num">{money(quote.data.vatBaisa)}</span></div>
                  <div className="row between text-lg strong"><span>{t('common.total')}</span><span className="num" data-testid="quote-total">{money(quote.data.totalBaisa)}</span></div>
                  <span className="text-xs muted">{t('sf.eta', { n: num(Math.round((quote.data.estimatedDurationS + m.prepTimeMinutes * 60) / 60), 0) })}</span>
                </div>
              ) : null}
              {place.isError ? <Alert tone="danger">{errorMessage(place.error, t)}</Alert> : null}
              <Button variant="primary" className="sf-primary" size="lg" block loading={place.isPending} disabled={!signedIn || !input || !quote.data || quote.isFetching} onClick={() => place.mutate()} data-testid="place-order">
                {payment === 'online' ? t('sf.payAndPlace') : t('sf.placeOrder')}
              </Button>
              {payment === 'online' ? <p className="text-xs muted">{t('sf.redirectNote')}</p> : null}
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}
