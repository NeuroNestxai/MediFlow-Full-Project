import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, errorMessage, fetchMe, normalizeOmanPhone, requestOtp, useI18n, useTokens, verifyOtp } from '@qabnah/shared';
import { consumerApi, consumerRealtime, consumerTokens } from '../api';

export const consumerMeKey = ['c', 'me'] as const;

export function useConsumer() {
  const tokens = useTokens(consumerTokens);
  const q = useQuery({ queryKey: consumerMeKey, queryFn: () => fetchMe(consumerApi), enabled: !!tokens, staleTime: 5 * 60_000 });
  return { signedIn: !!tokens && !!q.data, loading: !!tokens && q.isLoading, me: q.data ?? null };
}

/** Phone + SMS OTP sign-in for shoppers. Shows the dev code when the API echoes it (development only). */
export function OtpSignIn({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const normalized = normalizeOmanPhone(phone);
  const req = useMutation({
    mutationFn: () => requestOtp(consumerApi, normalized!),
    onSuccess: (r) => { setStep('code'); setDevCode(r.devCode ?? null); },
  });
  const verify = useMutation({
    mutationFn: () => verifyOtp(consumerApi, normalized!, code.trim(), name.trim() || undefined),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: consumerMeKey }); consumerRealtime.restart(); onDone?.(); },
  });
  const sendCode = (e: FormEvent) => { e.preventDefault(); if (normalized) req.mutate(); };
  const submitCode = (e: FormEvent) => { e.preventDefault(); if (/^\d{6}$/.test(code.trim())) verify.mutate(); };
  return step === 'phone' ? (
    <form className="stack" onSubmit={sendCode} noValidate>
      {!compact ? <p className="muted">{t('sf.signInHint')}</p> : null}
      <Input label={t('sf.phone')} type="tel" inputMode="tel" dir="ltr" autoComplete="tel" placeholder="9XXX XXXX" prefix="+968" value={phone}
        onChange={(e) => setPhone(e.target.value)} error={phone.length > 7 && !normalized ? t('delivery.phoneInvalid') : null} />
      {req.isError ? <Alert tone="danger">{errorMessage(req.error, t)}</Alert> : null}
      <Button type="submit" variant="primary" className="sf-primary" block loading={req.isPending} disabled={!normalized}>{t('sf.sendCode')}</Button>
    </form>
  ) : (
    <form className="stack" onSubmit={submitCode} noValidate>
      <p className="text-sm">{t('sf.codeSent', { phone: normalized ?? phone })} <button type="button" className="link-btn" onClick={() => { setStep('phone'); setCode(''); verify.reset(); }}>{t('sf.changePhone')}</button></p>
      {devCode ? <Alert tone="warning" title={t('sf.devCodeTitle')}><span data-testid="dev-code" className="mono ltr">{devCode}</span> — {t('sf.devCodeBody')}</Alert> : null}
      <Input label={t('sf.code')} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
      <Input label={t('sf.yourName')} value={name} onChange={(e) => setName(e.target.value)} hint={t('sf.nameHint')} autoComplete="name" optional />
      {verify.isError ? <Alert tone="danger">{errorMessage(verify.error, t)}</Alert> : null}
      <Button type="submit" variant="primary" className="sf-primary" block loading={verify.isPending} disabled={!/^\d{6}$/.test(code)}>{t('sf.verify')}</Button>
      <Button variant="ghost" size="sm" disabled={req.isPending} onClick={() => req.mutate()}>{t('sf.resend')}</Button>
    </form>
  );
}
