import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, Card, Input, MfaChallengeForm, Select, errorMessage, isApiError, passwordLogin, useDebounced, useI18n,
  type AuthResult, type LatLng, type MerchantCategory,
} from '@qabnah/shared';
import { PinPicker } from '@qabnah/shared/map';
import { merchantApi, publicApi } from '../api';
import { firstAllowedPath } from './PortalLayout';
import { meKey, useOptionalSession } from './session';

function LangToggle() {
  const { t, toggleLang, lang } = useI18n();
  return <Button size="sm" variant="ghost" icon="globe" onClick={toggleLang} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={t('lang.switchLabel')}>{t('lang.switch')}</Button>;
}

export function LoginPage() {
  const { t } = useI18n();
  const session = useOptionalSession();
  const qc = useQueryClient();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => passwordLogin(merchantApi, email, password),
    onSuccess: async (r) => {
      if (r.kind === 'mfa') { setMfaToken(r.mfaToken); return; }
      await qc.invalidateQueries({ queryKey: meKey });
    },
  });
  if (session && !mfaToken) {
    if (!session.merchants.length) return <Navigate to="/no-store" replace />;
    return <Navigate to={loc.state?.from && loc.state.from !== '/login' ? loc.state.from : firstAllowedPath(session.perms)} replace />;
  }
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <AuthSplit photo="/sample/merchant-handover.jpg">
      {mfaToken ? (
        <MfaChallengeForm api={merchantApi} mfaToken={mfaToken} onCancel={() => { setMfaToken(null); setPassword(''); }}
          onDone={async () => { setMfaToken(null); await qc.invalidateQueries({ queryKey: meKey }); }} />
      ) : (
        <form className="stack stack-lg" onSubmit={submit} noValidate>
          <div className="stack stack-sm">
            <h1>{t('auth.title')}</h1>
            <p className="muted">{t('auth.subtitle')}</p>
          </div>
          <div className="stack">
            <Input label={t('common.email')} type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label={t('common.password')} type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {m.isError ? <Alert tone="danger">{errorMessage(m.error, t)}</Alert> : null}
          </div>
          <Button type="submit" variant="primary" size="lg" block loading={m.isPending} disabled={!email || !password}>{t('common.signIn')}</Button>
          <p className="text-sm muted">{t('auth.noAccount')} <Link to="/register">{t('auth.registerLink')}</Link></p>
        </form>
      )}
    </AuthSplit>
  );
}

/** Split screen: night brand panel with the logo and a photo, form on the other side. */
export function AuthSplit({ photo, children, wide }: { photo: string; children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="auth-split">
      <aside className="auth-split__brand">
        <div className="auth-split__photo" aria-hidden="true"><img src={photo} alt="" /></div>
        <div className="auth-split__mark"><img src="/brand/mark.svg" alt="" /><span>{t('app.name')}</span></div>
        <div className="auth-split__claim">
          <h1>{t('brand.tagline')}</h1>
          <p>{t('portal.subtitle')}</p>
        </div>
      </aside>
      <main className="auth-split__form">
        <div className="row end"><LangToggle /></div>
        <div className={`auth-split__form-inner ${wide ? 'auth-split__form-inner--wide' : ''}`}>{children}</div>
      </main>
    </div>
  );
}

const CATEGORIES: MerchantCategory[] = ['restaurant', 'cafe', 'grocery', 'pharmacy', 'retail', 'flowers', 'electronics', 'other'];
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

export function RegisterPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const nav = useNavigate();
  const session = useOptionalSession();
  const [f, setF] = useState({ fullName: '', email: '', password: '', phone: '', nameEn: '', nameAr: '', slug: '', category: 'restaurant' as MerchantCategory, addressText: '', crNumber: '', contactPhone: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => { if (!slugTouched) setF((x) => ({ ...x, slug: slugify(x.nameEn) })); }, [f.nameEn, slugTouched]);

  // Slug availability (GET /merchants/slug-availability also counts stores pending review; the 409 on submit stays authoritative).
  const debSlug = useDebounced(f.slug, 400);
  const slugValid = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(debSlug);
  const slugQ = useQuery({
    queryKey: ['slug', debSlug],
    queryFn: async () => {
      const r = await publicApi.get<{ available: boolean }>(`/merchants/slug-availability?slug=${encodeURIComponent(debSlug)}`, { auth: false });
      return r.available ? ('free' as const) : ('taken' as const);
    },
    enabled: slugValid,
    staleTime: 60_000,
    retry: false,
  });

  const m = useMutation({
    mutationFn: () => merchantApi.post<AuthResult>('/merchants/register', {
      email: f.email.trim(), password: f.password, fullName: f.fullName.trim(), ...(f.phone ? { phone: f.phone } : {}),
      merchant: {
        nameEn: f.nameEn.trim(), nameAr: f.nameAr.trim(), slug: f.slug, category: f.category, location,
        ...(f.addressText ? { addressText: f.addressText } : {}), ...(f.crNumber ? { crNumber: f.crNumber } : {}), ...(f.contactPhone ? { contactPhone: f.contactPhone } : {}),
      },
    }, { auth: false }),
    onSuccess: async (r) => {
      merchantApi.tokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken, expiresIn: r.expiresIn });
      await qc.invalidateQueries({ queryKey: meKey });
      nav('/store', { replace: true });
    },
    onError: (e) => {
      if (!isApiError(e)) return;
      const fe = e.fieldErrors;
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(fe)) mapped[k.replace(/^merchant\./, '')] = v;
      if (e.code === 'slug_taken') mapped.slug = t('register.slugTaken');
      if (e.code === 'email_taken') mapped.email = e.message;
      if (e.code === 'phone_taken') mapped.phone = e.message;
      setErrors(mapped);
    },
  });

  if (session && session.merchants.length) return <Navigate to="/store" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.fullName.trim().length < 2) errs.fullName = t('common.required');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) errs.email = t('register.emailInvalid');
    if (f.password.length < 10) errs.password = t('register.passwordShort');
    if (f.nameEn.trim().length < 2) errs.nameEn = t('common.required');
    if (f.nameAr.trim().length < 2) errs.nameAr = t('common.required');
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(f.slug)) errs.slug = t('register.slugInvalid');
    if (!location) errs.location = t('register.locationRequired');
    setErrors(errs);
    if (!Object.keys(errs).length) m.mutate();
  };

  const slugHint = !f.slug ? t('register.slugHint') : !slugValid ? t('register.slugInvalid') : slugQ.data === 'taken' ? undefined : slugQ.data === 'free' ? t('register.slugFree') : t('register.slugChecking');
  return (
    <AuthSplit photo="/sample/merchant-handover.jpg" wide>
        <div><Link to="/login" className="btn btn--ghost btn--sm">{t('common.back')}</Link></div>
        <form onSubmit={submit} noValidate className="stack stack-lg">
          <Card title={t('register.title')}>
            <div className="stack">
              <p className="muted">{t('register.subtitle')}</p>
              <div className="form-grid">
                <Input label={t('register.fullName')} value={f.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" required />
                <Input label={t('common.email')} type="email" dir="ltr" value={f.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
                <Input label={t('common.password')} type="password" dir="ltr" value={f.password} onChange={set('password')} error={errors.password} hint={t('register.passwordHint')} autoComplete="new-password" required />
                <Input label={t('common.phone')} type="tel" dir="ltr" value={f.phone} onChange={set('phone')} error={errors.phone} placeholder="+968 9XXXXXXX" optional />
              </div>
            </div>
          </Card>
          <Card title={t('register.storeSection')}>
            <div className="stack">
              <div className="form-grid">
                <Input label={t('common.nameEn')} dir="ltr" value={f.nameEn} onChange={set('nameEn')} error={errors.nameEn} required />
                <Input label={t('common.nameAr')} dir="rtl" value={f.nameAr} onChange={set('nameAr')} error={errors.nameAr} required />
                <Input label={t('register.slug')} dir="ltr" prefix="/s/" value={f.slug}
                  onChange={(e) => { setSlugTouched(true); setF((x) => ({ ...x, slug: e.target.value.toLowerCase() })); }}
                  error={errors.slug ?? (slugQ.data === 'taken' ? t('register.slugTaken') : undefined)} hint={slugHint} required />
                <Select label={t('register.category')} value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value as MerchantCategory }))}
                  options={CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))} />
                <Input label={t('register.crNumber')} dir="ltr" value={f.crNumber} onChange={set('crNumber')} optional />
                <Input label={t('register.contactPhone')} type="tel" dir="ltr" value={f.contactPhone} onChange={set('contactPhone')} error={errors.contactPhone} optional />
                <Input label={t('register.address')} value={f.addressText} onChange={set('addressText')} fieldClassName="span-all" optional />
              </div>
              <div className="field">
                <span className="field__label">{t('register.location')}</span>
                <PinPicker value={location} onChange={setLocation} color="#0E7C66" label={t('register.location')} />
                {errors.location ? <span className="field__error" role="alert">{errors.location}</span> : null}
              </div>
            </div>
          </Card>
          {m.isError && !Object.keys(errors).length ? <Alert tone="danger">{errorMessage(m.error, t)}</Alert> : null}
          {m.isError && Object.keys(errors).length ? <Alert tone="danger">{t('register.fixErrors')}</Alert> : null}
          <Button type="submit" variant="primary" size="lg" loading={m.isPending}>{t('register.submit')}</Button>
          <p className="text-sm muted">{t('register.reviewNote')}</p>
        </form>
    </AuthSplit>
  );
}

export function NoStorePage() {
  const { t } = useI18n();
  const s = useOptionalSession();
  const nav = useNavigate();
  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="stack">
          <h1>{t('noStore.title')}</h1>
          <p className="muted">{t('noStore.body')}</p>
          <div className="row">
            <Link className="btn btn--primary" to="/register">{t('auth.registerLink')}</Link>
            {s ? <Button onClick={async () => { await s.signOut(); nav('/login'); }}>{t('common.signOut')}</Button> : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
