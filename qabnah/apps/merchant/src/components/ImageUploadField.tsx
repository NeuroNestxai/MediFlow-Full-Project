import { useState } from 'react';
import { Button, FilePickerButton, Input, errorMessage, useI18n, type FilePurpose } from '@qabnah/shared';
import { merchantApi } from '../api';

const MAX = 10 * 1024 * 1024;

/** Image URL input with an upload button (POST /files) and a preview tile. */
export function ImageUploadField({ label, value, onChange, purpose, aspect = '16 / 9', hint, allowUrl = true }: {
  label: string; value: string; onChange: (url: string) => void; purpose: FilePurpose; aspect?: string; hint?: string; allowUrl?: boolean;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File) => {
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError(t('upload.typeError')); return; }
    if (file.size > MAX) { setError(t('upload.sizeError')); return; }
    setBusy(true);
    try {
      const r = await merchantApi.upload(file, purpose);
      onChange(r.url);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className={`upload-tile ${value ? 'upload-tile--filled' : ''}`} style={{ aspectRatio: aspect }}>
        {value ? <img src={value} alt="" onError={() => setError(t('upload.previewError'))} /> : <span className="text-sm">{t('upload.empty')}</span>}
        <div className="upload-tile__actions">
          <FilePickerButton accept="image/jpeg,image/png,image/webp" onFile={upload} loading={busy} label={value ? t('upload.replace') : t('common.upload')} />
          {value ? <Button size="sm" variant="danger-outline" icon="trash" onClick={() => onChange('')}>{t('upload.remove')}</Button> : null}
        </div>
      </div>
      {allowUrl ? <Input aria-label={`${label} URL`} dir="ltr" placeholder="https://…" value={value} onChange={(e) => onChange(e.target.value.trim())} /> : null}
      {hint ? <span className="field__hint">{hint}</span> : null}
      {error ? <span className="field__error" role="alert">{error}</span> : null}
    </div>
  );
}
