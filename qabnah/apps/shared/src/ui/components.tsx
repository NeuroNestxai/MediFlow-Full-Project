import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons';
import { useI18n } from '../i18n/i18n';
import { isApiError } from '../api/client';
import { statusTone } from '../domain/orders';
import { parseOmrToBaisa, baisaToOmrString } from '../format/format';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ───────── Button ───────── */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline' | 'accent' | 'whatsapp';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean; loading?: boolean; icon?: IconName | string; iconOnly?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, loading, icon, iconOnly, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={cx('btn', variant !== 'secondary' && `btn--${variant}`, size !== 'md' && `btn--${size}`, block && 'btn--block', iconOnly && 'btn--icon', className)}
      disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
});

export function LinkButton({ href, variant = 'secondary', size = 'md', icon, children, external, className, ...rest }: {
  href: string; variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: IconName | string; children?: ReactNode; external?: boolean; className?: string; 'aria-label'?: string;
}) {
  return (
    <a href={href} className={cx('btn', variant !== 'secondary' && `btn--${variant}`, size !== 'md' && `btn--${size}`, className)}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </a>
  );
}

/* ───────── Form fields ───────── */
interface FieldProps { label?: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; className?: string; children: (id: string, describedBy: string | undefined, invalid: boolean) => ReactNode }
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const { t } = useI18n();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('field', className)}>
      {label ? <label className="field__label" htmlFor={id}>{label}{optional ? <span className="muted text-xs">({t('common.optional')})</span> : null}</label> : null}
      {children(id, describedBy, !!error)}
      {hint ? <span id={hintId} className="field__hint">{hint}</span> : null}
      {error ? <span id={errId} className="field__error" role="alert">{error}</span> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; prefix?: ReactNode; suffix?: ReactNode; fieldClassName?: string };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, optional, prefix, suffix, fieldClassName, className, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={fieldClassName}>
      {(id, describedBy, invalid) => {
        const input = <input ref={ref} id={rest.id ?? id} className={cx('input', className)} aria-invalid={invalid || undefined} aria-describedby={describedBy} {...rest} />;
        if (!prefix && !suffix) return input;
        return (
          <div className="input-group">
            {prefix ? <span className="input-group__addon">{prefix}</span> : null}
            {input}
            {suffix ? <span className="input-group__addon">{suffix}</span> : null}
          </div>
        );
      }}
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; options: { value: string; label: string; disabled?: boolean }[]; placeholder?: string; fieldClassName?: string };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, hint, error, optional, options, placeholder, fieldClassName, className, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={fieldClassName}>
      {(id, describedBy, invalid) => (
        <select ref={ref} id={rest.id ?? id} className={cx('select', className)} aria-invalid={invalid || undefined} aria-describedby={describedBy} {...rest}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; fieldClassName?: string };
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, optional, fieldClassName, className, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={fieldClassName}>
      {(id, describedBy, invalid) => <textarea ref={ref} id={rest.id ?? id} className={cx('textarea', className)} aria-invalid={invalid || undefined} aria-describedby={describedBy} {...rest} />}
    </Field>
  );
});

/** OMR amount input that reports integer baisa (or null while the text is empty/invalid). */
export function MoneyInput({ label, valueBaisa, onChangeBaisa, error, hint, optional, required, id, name, min }: {
  label?: ReactNode; valueBaisa: number | null; onChangeBaisa: (b: number | null) => void; error?: string | null; hint?: ReactNode; optional?: boolean; required?: boolean; id?: string; name?: string; min?: number;
}) {
  const { t, lang } = useI18n();
  const [text, setText] = useState(valueBaisa == null ? '' : baisaToOmrString(valueBaisa).replace(/,/g, ''));
  const lastEmitted = useRef<number | null>(valueBaisa);
  useEffect(() => {
    if (valueBaisa !== lastEmitted.current) {
      setText(valueBaisa == null ? '' : baisaToOmrString(valueBaisa).replace(/,/g, ''));
      lastEmitted.current = valueBaisa;
    }
  }, [valueBaisa]);
  const parsed = parseOmrToBaisa(text);
  const localError = text && parsed == null ? (lang === 'ar' ? 'أدخل مبلغاً صحيحاً (حتى ٣ منازل عشرية)' : 'Enter a valid amount (up to 3 decimals)') : null;
  return (
    <Input label={label} id={id} name={name} inputMode="decimal" dir="ltr" value={text} required={required} optional={optional}
      prefix={lang === 'ar' ? undefined : 'OMR'} suffix={lang === 'ar' ? 'ر.ع.' : undefined}
      placeholder="0.000" error={error ?? localError} hint={hint} min={min}
      onChange={(e) => {
        setText(e.target.value);
        const b = parseOmrToBaisa(e.target.value);
        lastEmitted.current = b;
        onChangeBaisa(b);
      }}
      aria-label={typeof label === 'string' ? label : t('common.amount')} />
  );
}

export function Switch({ checked, onChange, label, disabled, id, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; id?: string; description?: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" id={id} checked={checked} disabled={disabled} aria-checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" aria-hidden="true" />
      <span className="stack" style={{ ['--gap' as string]: '0px' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {description ? <span className="text-sm muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* ───────── Surfaces ───────── */
export function Card({ title, actions, children, footer, flush, className, id }: { title?: ReactNode; actions?: ReactNode; children?: ReactNode; footer?: ReactNode; flush?: boolean; className?: string; id?: string }) {
  return (
    <section className={cx('card', className)} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {title || actions ? <header className="card__header">{typeof title === 'string' ? <h2>{title}</h2> : title}{actions ? <div className="row">{actions}</div> : null}</header> : null}
      <div className={cx('card__body', flush && 'card__body--flush')}>{children}</div>
      {footer ? <footer className="card__footer">{footer}</footer> : null}
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'success' | 'danger' | 'accent' }) {
  return (
    <div className="card kpi">
      <span className="kpi__label">{label}</span>
      <span className={cx('kpi__value', tone === 'success' && 'success-text', tone === 'danger' && 'danger-text')}>{value}</span>
      {hint ? <span className="kpi__hint">{hint}</span> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header__title">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent' | 'primary';
export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={cx('badge', tone !== 'neutral' && `badge--${tone}`)}>{dot ? <span className="badge__dot" aria-hidden="true" /> : null}{children}</span>;
}

/** Badge for an order/delivery/payment/link status using the shared translations. */
export function StatusBadge({ status, kind = 'order' }: { status: string; kind?: 'order' | 'delivery' | 'payment' | 'raw' }) {
  const { t } = useI18n();
  const label = kind === 'raw' ? status.replace(/_/g, ' ') : t(`${kind}.status.${status}`);
  return <Badge tone={statusTone(status)} dot>{label}</Badge>;
}

export function Alert({ tone = 'info', title, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const icon = tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert';
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon} />
      <div className="grow stack" style={{ ['--gap' as string]: '2px' }}>
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

/* ───────── Feedback ───────── */
export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role={label ? 'status' : undefined} aria-label={label} />;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return <div className="center-pad"><Spinner label={label ?? t('common.loading')} /></div>;
}

export function EmptyState({ icon = 'box', title, children, action }: { icon?: IconName | string; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon"><Icon name={icon} /></div>
      <div className="empty__title">{title}</div>
      {children ? <div className="text-sm">{children}</div> : null}
      {action}
    </div>
  );
}

/** Human message for any error (ApiError messages come from the server). */
export function errorMessage(e: unknown, t: (k: string) => string): string {
  if (isApiError(e)) {
    if (e.status === 403) return e.message && e.message !== 'You do not have permission to do this' ? e.message : t('common.forbidden');
    if (e.code === 'network_error' || e.code === 'rate_limited') return t(`error.${e.code}`);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return t('common.error');
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="empty" role="alert">
      <div className="empty__icon" style={{ background: 'var(--q-danger-light)', color: 'var(--q-danger)' }}><Icon name="alert" /></div>
      <div className="empty__title">{t('common.error')}</div>
      <div className="text-sm">{errorMessage(error, t)}</div>
      {onRetry ? <Button size="sm" onClick={onRetry} icon="refresh">{t('common.retry')}</Button> : null}
    </div>
  );
}

/** Renders loading / error / content for a TanStack query-like object. */
export function QueryState<T>({ query, children, empty, isEmpty }: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (data: T) => ReactNode; empty?: ReactNode; isEmpty?: (d: T) => boolean;
}) {
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return <Loading />;
  if (empty && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}

/* ───────── Overlays ───────── */
function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    const first = focusables().find((el) => !el.classList.contains('modal-close')) ?? focusables()[0];
    (first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const a = els[0], b = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return ref;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useOverlay(open, onClose);
  const titleId = useId();
  const { t } = useI18n();
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={cx('modal', wide && 'modal--wide')} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal__header">
          <h2 id={titleId}>{title}</h2>
          <Button variant="ghost" iconOnly icon="x" className="modal-close" aria-label={t('common.close')} onClick={onClose} />
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useOverlay(open, onClose);
  const titleId = useId();
  const { t } = useI18n();
  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="drawer__header">
          <div className="stack" style={{ ['--gap' as string]: '4px' }}>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <div className="text-sm muted">{subtitle}</div> : null}
          </div>
          <Button variant="ghost" iconOnly icon="x" className="modal-close" aria-label={t('common.close')} onClick={onClose} />
        </div>
        <div className="drawer__body">{children}</div>
        {footer ? <div className="drawer__footer">{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}

/** Confirmation dialog with an optional required reason text. */
export function ConfirmDialog({ open, title, message, confirmLabel, tone = 'primary', reasonLabel, reasonRequired, onConfirm, onClose, loading, error, children }: {
  open: boolean; title: ReactNode; message?: ReactNode; confirmLabel: string; tone?: 'primary' | 'danger'; reasonLabel?: string; reasonRequired?: boolean;
  onConfirm: (reason: string) => void; onClose: () => void; loading?: boolean; error?: string | null; children?: ReactNode;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const blocked = !!reasonRequired && reason.trim().length < 3;
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={blocked} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
      </>}>
      <div className="stack">
        {message ? <p>{message}</p> : null}
        {children}
        {reasonLabel ? <Textarea label={reasonLabel} value={reason} onChange={(e) => setReason(e.target.value)} required={reasonRequired} rows={3} hint={reasonRequired ? t('common.required') : undefined} /> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

/* ───────── Navigation bits ───────── */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { value: T; label: ReactNode; badge?: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, i) => (
        <button key={tab.value} ref={(el) => { refs.current[i] = el; }} role="tab" type="button" className="tab" aria-selected={tab.value === value} tabIndex={tab.value === value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={(e) => {
            const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
            let next = -1;
            if (e.key === 'ArrowRight') next = (i + dir + tabs.length) % tabs.length;
            if (e.key === 'ArrowLeft') next = (i - dir + tabs.length) % tabs.length;
            if (next >= 0) { e.preventDefault(); refs.current[next]?.focus(); onChange(tabs[next].value); }
          }}>
          {tab.label}{tab.badge ? <> {tab.badge}</> : null}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  const { t, num } = useI18n();
  if (total <= limit && offset === 0) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="text-sm muted">{t('common.showing', { from: num(total ? offset + 1 : 0, 0), to: num(Math.min(total, offset + limit), 0), total: num(total, 0) })}</span>
      <div className="row">
        <Button size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>{t('common.previous')}</Button>
        <span className="text-sm">{t('common.page', { page: num(page, 0), pages: num(pages, 0) })}</span>
        <Button size="sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>{t('common.next')}</Button>
      </div>
    </nav>
  );
}

export function LiveIndicator({ status }: { status: 'idle' | 'connecting' | 'open' | 'closed' }) {
  const { t } = useI18n();
  return <span className={cx('live-dot', status === 'open' && 'live-dot--open')} role="status">{status === 'open' ? t('common.live') : t('common.offline')}</span>;
}

/** Copy text to the clipboard with a short "Copied" confirmation. */
export function CopyButton({ text, label, size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <Button size={size} icon={done ? 'check' : 'copy'} onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      setDone(true); setTimeout(() => setDone(false), 1500);
    }}>{done ? t('common.copied') : label ?? t('common.copy')}</Button>
  );
}

/** File picker button (hidden input). */
export function FilePickerButton({ accept, onFile, label, loading, variant = 'secondary', size = 'sm', icon = 'image' }: {
  accept: string; onFile: (f: File) => void; label: string; loading?: boolean; variant?: Variant; size?: 'sm' | 'md'; icon?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <Button size={size} variant={variant} icon={icon} loading={loading} onClick={() => ref.current?.click()}>{label}</Button>
    </>
  );
}

/* ───────── Toasts ───────── */
interface ToastItem { id: number; tone: 'success' | 'danger' | 'info'; message: ReactNode }
const ToastCtx = createContext<{ push: (message: ReactNode, tone?: ToastItem['tone']) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((message: ReactNode, tone: ToastItem['tone'] = 'success') => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, tone, message }]);
    setTimeout(() => remove(id), tone === 'danger' ? 7000 : 4000);
  }, [remove]);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {items.map((x) => (
          <div key={x.id} className={cx('toast', x.tone !== 'info' && `toast--${x.tone}`)} role={x.tone === 'danger' ? 'alert' : 'status'}>
            <Icon name={x.tone === 'success' ? 'check' : x.tone === 'danger' ? 'alert' : 'info'} />
            <div className="grow">{x.message}</div>
            <button className="toast__close" onClick={() => remove(x.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}
