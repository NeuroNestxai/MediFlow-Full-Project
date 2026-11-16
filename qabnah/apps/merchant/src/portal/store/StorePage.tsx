import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, LinkButton, Loading, MoneyInput, PageHeader, Segmented, Select, Switch, Tabs,
  Textarea, errorMessage, isApiError, useI18n, useToast,
  type Banner, type BannerInput, type Items, type LatLng, type MerchantCategory, type MerchantDetail, type MerchantUpdate, type OpeningWindow,
} from '@qabnah/shared';
import { PinPicker } from '@qabnah/shared/map';
import { merchantApi } from '../../api';
import { ImageUploadField } from '../../components/ImageUploadField';
import { merchantKey, useSession } from '../session';

export function useMerchantPatch() {
  const { merchantId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (body: MerchantUpdate) => merchantApi.patch<MerchantDetail>(`/merchants/${merchantId}`, body),
    onSuccess: (d) => { qc.setQueryData(merchantKey(merchantId), d); setErrors({}); toast.push(t('common.saved')); },
    onError: (e) => { if (isApiError(e)) setErrors(e.fieldErrors); },
  });
  return { ...m, errors };
}

function SaveBar({ pending, error, disabled }: { pending: boolean; error: unknown; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="stack">
      {error ? <Alert tone="danger">{errorMessage(error, t)}</Alert> : null}
      <div className="row end"><Button type="submit" variant="primary" loading={pending} disabled={disabled}>{t('common.save')}</Button></div>
    </div>
  );
}

const CATEGORIES: MerchantCategory[] = ['restaurant', 'cafe', 'grocery', 'pharmacy', 'retail', 'flowers', 'electronics', 'other'];

function ProfileTab({ m, readOnly }: { m: MerchantDetail; readOnly: boolean }) {
  const { t } = useI18n();
  const patch = useMerchantPatch();
  const [f, setF] = useState({ nameEn: m.nameEn, nameAr: m.nameAr, category: m.category, legalName: m.legalName ?? '', crNumber: m.crNumber ?? '', vatNumber: m.vatNumber ?? '',
    contactPhone: m.contactPhone ?? '', contactEmail: m.contactEmail ?? '', addressText: m.addressText ?? '' });
  const [loc, setLoc] = useState<LatLng | null>(m.location);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: MerchantUpdate = { nameEn: f.nameEn.trim(), nameAr: f.nameAr.trim(), category: f.category, addressText: f.addressText };
    for (const k of ['legalName', 'crNumber', 'vatNumber', 'contactPhone', 'contactEmail'] as const) if (f[k].trim()) body[k] = f[k].trim();
    if (loc && (loc.lat !== m.location.lat || loc.lng !== m.location.lng)) body.location = loc;
    patch.mutate(body);
  };
  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={readOnly} className="stack stack-lg" style={{ border: 0, padding: 0, margin: 0 }}>
        <Card title={t('store.profile')}>
          <div className="form-grid">
            <Input label={t('common.nameEn')} dir="ltr" value={f.nameEn} onChange={set('nameEn')} error={patch.errors.nameEn} />
            <Input label={t('common.nameAr')} dir="rtl" value={f.nameAr} onChange={set('nameAr')} error={patch.errors.nameAr} />
            <Select label={t('register.category')} value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value as MerchantCategory }))} options={CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))} />
            <Input label={t('store.legalName')} value={f.legalName} onChange={set('legalName')} error={patch.errors.legalName} optional />
            <Input label={t('register.crNumber')} dir="ltr" value={f.crNumber} onChange={set('crNumber')} error={patch.errors.crNumber} optional />
            <Input label={t('store.vatNumber')} dir="ltr" value={f.vatNumber} onChange={set('vatNumber')} error={patch.errors.vatNumber} optional />
            <Input label={t('register.contactPhone')} type="tel" dir="ltr" value={f.contactPhone} onChange={set('contactPhone')} error={patch.errors.contactPhone} optional />
            <Input label={t('store.contactEmail')} type="email" dir="ltr" value={f.contactEmail} onChange={set('contactEmail')} error={patch.errors.contactEmail} optional />
          </div>
        </Card>
        <Card title={t('register.location')}>
          <div className="stack">
            <Textarea label={t('register.address')} rows={2} value={f.addressText} onChange={set('addressText')} error={patch.errors.addressText} />
            <PinPicker value={loc} onChange={setLoc} color="#0E7C66" />
            <p className="text-xs muted">{t('store.locationHint')}</p>
          </div>
        </Card>
        {!readOnly ? <SaveBar pending={patch.isPending} error={patch.error} /> : null}
      </fieldset>
    </form>
  );
}

function StorefrontPreview({ m, brandColor, accentColor, logoUrl, coverUrl, tagline }: { m: MerchantDetail; brandColor: string; accentColor: string; logoUrl: string; coverUrl: string; tagline: string }) {
  const { pick, t } = useI18n();
  return (
    <div className="sf-preview" style={{ ['--brand' as string]: brandColor, ['--brand-accent' as string]: accentColor }} aria-label={t('store.preview')}>
      <div className="sf-preview__cover" style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined} />
      <div className="sf-preview__body">
        <div className="sf-preview__logo">{logoUrl ? <img src={logoUrl} alt="" /> : <span>{pick(m.nameEn, m.nameAr).slice(0, 1)}</span>}</div>
        <div className="stack" style={{ ['--gap' as string]: '2px' }}>
          <strong>{pick(m.nameEn, m.nameAr)}</strong>
          <span className="text-sm muted">{tagline || t('store.taglinePlaceholder')}</span>
        </div>
        <div className="row" style={{ marginBlockStart: 10 }}>
          <span className="sf-chip sf-chip--on">{t('storefront.all')}</span><span className="sf-chip">{t('catalog.categories')}</span>
          <span className="grow" />
          <span className="sf-btn">{t('storefront.addToCart')}</span>
        </div>
      </div>
    </div>
  );
}

function BrandingTab({ m, readOnly }: { m: MerchantDetail; readOnly: boolean }) {
  const { t, lang } = useI18n();
  const patch = useMerchantPatch();
  const [f, setF] = useState({ logoUrl: m.logoUrl ?? '', coverUrl: m.coverUrl ?? '', brandColor: m.brandColor ?? '#0E7C66', accentColor: m.accentColor ?? '#F4A300', taglineEn: m.taglineEn ?? '', taglineAr: m.taglineAr ?? '' });
  const hex = /^#[0-9A-Fa-f]{6}$/;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: MerchantUpdate = { taglineEn: f.taglineEn, taglineAr: f.taglineAr };
    if (hex.test(f.brandColor)) body.brandColor = f.brandColor;
    if (hex.test(f.accentColor)) body.accentColor = f.accentColor;
    if (f.logoUrl) body.logoUrl = f.logoUrl;
    if (f.coverUrl) body.coverUrl = f.coverUrl;
    patch.mutate(body);
  };
  const colorField = (k: 'brandColor' | 'accentColor', label: string) => (
    <div className="field">
      <label className="field__label" htmlFor={`c-${k}`}>{label}</label>
      <div className="row row-nowrap">
        <input id={`c-${k}`} type="color" className="color-input" value={hex.test(f[k]) ? f[k] : '#000000'} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value.toUpperCase() }))} />
        <Input aria-label={`${label} hex`} dir="ltr" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} error={!hex.test(f[k]) ? t('store.hexInvalid') : patch.errors[k]} fieldClassName="grow" />
      </div>
    </div>
  );
  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={readOnly} className="grid grid-2" style={{ border: 0, padding: 0, margin: 0, alignItems: 'start' }}>
        <div className="stack stack-lg">
          <Card title={t('store.images')}>
            <div className="stack">
              <ImageUploadField label={t('store.logo')} value={f.logoUrl} onChange={(u) => setF((x) => ({ ...x, logoUrl: u }))} purpose="branding" aspect="1 / 1" hint={t('store.logoHint')} />
              <ImageUploadField label={t('store.cover')} value={f.coverUrl} onChange={(u) => setF((x) => ({ ...x, coverUrl: u }))} purpose="branding" aspect="3 / 1" hint={t('store.coverHint')} />
              <p className="text-xs muted">{t('store.clearNote')}</p>
            </div>
          </Card>
          <Card title={t('store.colorsAndText')}>
            <div className="form-grid">
              {colorField('brandColor', t('store.brandColor'))}
              {colorField('accentColor', t('store.accentColor'))}
              <Input label={t('store.taglineEn')} dir="ltr" maxLength={140} value={f.taglineEn} onChange={(e) => setF((x) => ({ ...x, taglineEn: e.target.value }))} error={patch.errors.taglineEn} />
              <Input label={t('store.taglineAr')} dir="rtl" maxLength={140} value={f.taglineAr} onChange={(e) => setF((x) => ({ ...x, taglineAr: e.target.value }))} error={patch.errors.taglineAr} />
            </div>
          </Card>
          {!readOnly ? <SaveBar pending={patch.isPending} error={patch.error} disabled={!hex.test(f.brandColor) || !hex.test(f.accentColor)} /> : null}
        </div>
        <Card title={t('store.preview')}>
          <StorefrontPreview m={m} brandColor={hex.test(f.brandColor) ? f.brandColor : m.brandColor} accentColor={hex.test(f.accentColor) ? f.accentColor : m.accentColor}
            logoUrl={f.logoUrl} coverUrl={f.coverUrl} tagline={lang === 'ar' ? f.taglineAr || f.taglineEn : f.taglineEn || f.taglineAr} />
        </Card>
      </fieldset>
    </form>
  );
}

function BannersTab({ readOnly }: { readOnly: boolean }) {
  const { t, pick, num } = useI18n();
  const { merchantId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['m', 'banners', merchantId], queryFn: () => merchantApi.get<Items<Banner>>(`/merchants/${merchantId}/banners`) });
  const [form, setForm] = useState<(BannerInput & { id?: string }) | null>(null);
  const [toDelete, setToDelete] = useState<Banner | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['m', 'banners', merchantId] });
  const save = useMutation({
    mutationFn: ({ id, ...b }: BannerInput & { id?: string }) => {
      const body: BannerInput = { imageUrl: b.imageUrl, sortOrder: b.sortOrder ?? 0, isActive: b.isActive ?? true, ...(b.titleEn ? { titleEn: b.titleEn } : {}), ...(b.titleAr ? { titleAr: b.titleAr } : {}), ...(b.linkUrl ? { linkUrl: b.linkUrl } : {}) };
      return id ? merchantApi.patch<Banner>(`/merchants/${merchantId}/banners/${id}`, body) : merchantApi.post<Banner>(`/merchants/${merchantId}/banners`, body);
    },
    onSuccess: () => { setForm(null); void invalidate(); toast.push(t('common.saved')); },
  });
  const toggle = useMutation({
    mutationFn: (b: Banner) => merchantApi.patch<Banner>(`/merchants/${merchantId}/banners/${b.id}`, { isActive: !b.isActive }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.push(errorMessage(e, t), 'danger'),
  });
  const del = useMutation({ mutationFn: (b: Banner) => merchantApi.delete(`/merchants/${merchantId}/banners/${b.id}`), onSuccess: () => { setToDelete(null); void invalidate(); } });
  const fe = isApiError(save.error) ? save.error.fieldErrors : {};
  return (
    <Card flush title={t('store.banners')} actions={!readOnly ? <Button variant="primary" icon="plus" onClick={() => { save.reset(); setForm({ imageUrl: '', titleEn: '', titleAr: '', sortOrder: (q.data?.items.length ?? 0) * 10, isActive: true }); }}>{t('store.addBanner')}</Button> : null}>
      {form ? (
        <form className="pad stack" style={{ borderBlockEnd: '1px solid var(--q-border)', background: '#FCFAF5' }} onSubmit={(e) => { e.preventDefault(); if (form.imageUrl) save.mutate(form); }}>
          <ImageUploadField label={t('store.bannerImage')} value={form.imageUrl} onChange={(u) => setForm({ ...form, imageUrl: u })} purpose="branding" aspect="3 / 1" hint={t('store.bannerHint')} />
          {fe.imageUrl ? <span className="field__error">{fe.imageUrl}</span> : null}
          <div className="form-grid">
            <Input label={t('store.titleEn')} dir="ltr" value={form.titleEn ?? ''} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} optional />
            <Input label={t('store.titleAr')} dir="rtl" value={form.titleAr ?? ''} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} optional />
            <Input label={t('store.linkUrl')} dir="ltr" value={form.linkUrl ?? ''} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} error={fe.linkUrl} optional />
            <Input label={t('common.sortOrder')} type="number" value={form.sortOrder ?? 0} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })} />
          </div>
          <Switch checked={form.isActive ?? true} onChange={(v) => setForm({ ...form, isActive: v })} label={t('common.active')} />
          {save.isError ? <Alert tone="danger">{errorMessage(save.error, t)}</Alert> : null}
          <div className="row"><Button type="submit" variant="primary" loading={save.isPending} disabled={!form.imageUrl}>{t('common.save')}</Button><Button onClick={() => setForm(null)}>{t('common.cancel')}</Button></div>
        </form>
      ) : null}
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState icon="image" title={t('store.noBanners')} /> : (
        <ul className="banner-list">
          {q.data.items.map((b) => (
            <li key={b.id} className="banner-list__item">
              <img src={b.imageUrl} alt="" className="banner-list__img" />
              <div className="stack stack-sm grow">
                <strong>{pick(b.titleEn, b.titleAr) || t('store.untitledBanner')}</strong>
                <span className="text-xs muted">{t('common.sortOrder')}: {num(b.sortOrder, 0)}{b.linkUrl ? ` · ${b.linkUrl}` : ''}</span>
                <Switch checked={b.isActive} disabled={readOnly} onChange={() => toggle.mutate(b)} label={b.isActive ? t('common.active') : t('common.inactive')} />
              </div>
              {!readOnly ? <div className="row row-nowrap">
                <Button size="sm" onClick={() => { save.reset(); setForm({ id: b.id, imageUrl: b.imageUrl, titleEn: b.titleEn ?? '', titleAr: b.titleAr ?? '', linkUrl: b.linkUrl ?? '', sortOrder: b.sortOrder, isActive: b.isActive }); }}>{t('common.edit')}</Button>
                <Button size="sm" variant="ghost" iconOnly icon="trash" aria-label={t('common.delete')} onClick={() => setToDelete(b)} />
              </div> : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={!!toDelete} tone="danger" title={t('store.deleteBanner')} confirmLabel={t('common.delete')} loading={del.isPending} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete)} />
    </Card>
  );
}

const DAYS = [6, 0, 1, 2, 3, 4, 5]; // Saturday-first week as commonly used in Oman

function HoursTab({ m, readOnly }: { m: MerchantDetail; readOnly: boolean }) {
  const { t } = useI18n();
  const patch = useMerchantPatch();
  const [mode, setMode] = useState<'always' | 'weekly'>(m.openingHours?.length ? 'weekly' : 'always');
  const [hours, setHours] = useState<OpeningWindow[]>(m.openingHours?.length ? m.openingHours : DAYS.map((d) => ({ weekday: d, open: '09:00', close: '23:00' })));
  const [prep, setPrep] = useState(String(m.prepTimeMinutes));
  const [minOrder, setMinOrder] = useState<number | null>(m.minOrderBaisa);
  const [cod, setCod] = useState(m.acceptsCod);
  const [online, setOnline] = useState(m.acceptsOnline);
  const [vat, setVat] = useState(m.pricesIncludeVat);
  const [isOpen, setIsOpen] = useState(m.storeToggleOpen);
  useEffect(() => { setIsOpen(m.storeToggleOpen); }, [m.storeToggleOpen]);
  const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const hoursValid = mode === 'always' || hours.every((h) => validTime(h.open) && validTime(h.close) && h.open !== h.close);
  const prepNum = Number(prep);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    patch.mutate({ openingHours: mode === 'always' ? [] : hours, prepTimeMinutes: prepNum, minOrderBaisa: minOrder ?? 0, acceptsCod: cod, acceptsOnline: online, pricesIncludeVat: vat, isOpen });
  };
  const dayWindows = (d: number) => hours.map((h, i) => ({ h, i })).filter((x) => x.h.weekday === d);
  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={readOnly} className="grid grid-2" style={{ border: 0, padding: 0, margin: 0, alignItems: 'start' }}>
        <Card title={t('store.openingHours')}>
          <div className="stack">
            <Segmented label={t('store.openingHours')} value={mode} onChange={setMode} options={[{ value: 'always', label: t('store.hoursAlways') }, { value: 'weekly', label: t('store.hoursWeekly') }]} />
            <p className="text-sm muted">{mode === 'always' ? t('store.hoursAlwaysHint') : t('store.hoursWeeklyHint')}</p>
            {mode === 'weekly' ? (
              <div className="hours">
                {DAYS.map((d) => {
                  const ws = dayWindows(d);
                  return (
                    <div key={d} className="hours__day">
                      <div className="row between">
                        <strong>{t(`weekday.${d}`)}</strong>
                        {ws.length ? <Badge tone="success">{t('store.open')}</Badge> : <Badge>{t('store.closed')}</Badge>}
                      </div>
                      {ws.map(({ h, i }) => (
                        <div key={i} className="row row-nowrap">
                          <Input type="time" aria-label={`${t(`weekday.${d}`)} ${t('store.opens')}`} value={h.open} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} />
                          <span aria-hidden="true">–</span>
                          <Input type="time" aria-label={`${t(`weekday.${d}`)} ${t('store.closes')}`} value={h.close} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} />
                          <Button size="sm" variant="ghost" iconOnly icon="x" aria-label={t('store.removeWindow')} onClick={() => setHours(hours.filter((_, j) => j !== i))} />
                        </div>
                      ))}
                      <div className="row">
                        <Button size="sm" icon="plus" onClick={() => setHours([...hours, { weekday: d, open: '09:00', close: '23:00' }])}>{ws.length ? t('store.addWindow') : t('store.openThisDay')}</Button>
                        {ws.length ? <Button size="sm" variant="ghost" onClick={() => setHours(hours.filter((h) => h.weekday !== d))}>{t('store.closeThisDay')}</Button> : null}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs muted">{t('store.midnightHint')}</p>
              </div>
            ) : null}
            {!hoursValid ? <span className="field__error">{t('store.hoursInvalid')}</span> : null}
          </div>
        </Card>
        <div className="stack stack-lg">
          <Card title={t('store.operations')}>
            <div className="stack">
              <Switch checked={isOpen} onChange={setIsOpen} label={t('store.acceptingOrders')} description={t('store.acceptingOrdersHint')} />
              <div className="form-grid">
                <Input label={t('store.prepTime')} type="number" min={0} max={240} value={prep} onChange={(e) => setPrep(e.target.value)} suffix={t('orders.minutesShort')} error={patch.errors.prepTimeMinutes} />
                <MoneyInput label={t('store.minOrder')} valueBaisa={minOrder} onChangeBaisa={setMinOrder} error={patch.errors.minOrderBaisa} />
              </div>
            </div>
          </Card>
          <Card title={t('store.payments')}>
            <div className="stack">
              <Switch checked={cod} onChange={(v) => { if (v || online) setCod(v); }} label={t('payment.method.cod')} description={t('store.codHint')} />
              <Switch checked={online} onChange={(v) => { if (v || cod) setOnline(v); }} label={t('store.onlinePayment')} description={t('store.onlineHint')} />
              <Switch checked={vat} onChange={setVat} label={t('store.pricesIncludeVat')} description={t('store.vatHint')} />
            </div>
          </Card>
          {!readOnly ? <SaveBar pending={patch.isPending} error={patch.error} disabled={!hoursValid || !(prepNum >= 0 && prepNum <= 240)} /> : null}
        </div>
      </fieldset>
    </form>
  );
}

export function StorePage() {
  const { t, pick } = useI18n();
  const { detail, can, merchantId } = useSession();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'profile';
  if (!detail) return qc.getQueryState(merchantKey(merchantId))?.status === 'error' ? <ErrorState error={qc.getQueryState(merchantKey(merchantId))?.error} /> : <Loading />;
  const readOnly = !can('merchant.store:manage');
  const url = detail.storefrontUrl;
  const share = `https://wa.me/?text=${encodeURIComponent(`${pick(detail.nameEn, detail.nameAr)} — ${t('store.shareText')}\n${url}`)}`;
  const tabs: { value: string; label: ReactNode }[] = [
    { value: 'profile', label: t('store.profile') }, { value: 'branding', label: t('store.branding') },
    { value: 'banners', label: t('store.banners') }, { value: 'hours', label: t('store.hoursAndOps') },
  ];
  return (
    <>
      <PageHeader title={t('nav.storefront')} description={<span className="ltr">{url}</span>}
        actions={<>
          <LinkButton href={`/s/${detail.slug}`} external icon="external">{t('store.viewStorefront')}</LinkButton>
          <LinkButton href={share} external variant="whatsapp" icon="whatsapp">{t('store.shareWhatsApp')}</LinkButton>
        </>} />
      {readOnly ? <Alert tone="info">{t('store.readOnly')}</Alert> : null}
      <Tabs label={t('nav.storefront')} value={tab} onChange={(v) => setParams({ tab: v })} tabs={tabs} />
      {tab === 'profile' ? <ProfileTab key={detail.id} m={detail} readOnly={readOnly} /> : null}
      {tab === 'branding' ? <BrandingTab key={detail.id} m={detail} readOnly={readOnly} /> : null}
      {tab === 'banners' ? <BannersTab readOnly={readOnly} /> : null}
      {tab === 'hours' ? <HoursTab key={detail.id} m={detail} readOnly={readOnly} /> : null}
    </>
  );
}
