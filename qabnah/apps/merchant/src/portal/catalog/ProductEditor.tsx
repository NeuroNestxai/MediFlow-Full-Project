import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Button, Card, ErrorState, Input, Loading, MoneyInput, PageHeader, Segmented, Select, Switch, Textarea, defaultSelection, errorMessage,
  fromPrice, isApiError, useI18n, useToast, type OptionGroup, type Product, type ProductInput, type Selection,
} from '@qabnah/shared';
import { merchantApi } from '../../api';
import { ImageUploadField } from '../../components/ImageUploadField';
import { ProductConfigurator } from '../../components/ProductConfigurator';
import { useSession } from '../session';
import { useCategories } from './CatalogPage';

interface OptDraft { key: string; nameEn: string; nameAr: string; priceDeltaBaisa: number | null; isAvailable: boolean }
interface GroupDraft { key: string; kind: 'variant' | 'addon'; nameEn: string; nameAr: string; minSelect: number; maxSelect: number; options: OptDraft[] }
let seq = 0;
const key = () => `k${++seq}`;
const newOption = (): OptDraft => ({ key: key(), nameEn: '', nameAr: '', priceDeltaBaisa: 0, isAvailable: true });
const newGroup = (kind: 'variant' | 'addon'): GroupDraft => ({ key: key(), kind, nameEn: '', nameAr: '', minSelect: kind === 'variant' ? 1 : 0, maxSelect: kind === 'variant' ? 1 : 2, options: [newOption(), newOption()] });

interface Draft {
  categoryId: string; nameEn: string; nameAr: string; descriptionEn: string; descriptionAr: string; imageUrl: string; sku: string;
  basePriceBaisa: number | null; compareAtPriceBaisa: number | null; isAvailable: boolean; trackStock: boolean; stockQty: string; sortOrder: string; groups: GroupDraft[];
}
const emptyDraft = (): Draft => ({ categoryId: '', nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', imageUrl: '', sku: '', basePriceBaisa: null, compareAtPriceBaisa: null, isAvailable: true, trackStock: false, stockQty: '0', sortOrder: '0', groups: [] });
const fromProduct = (p: Product): Draft => ({
  categoryId: p.categoryId ?? '', nameEn: p.nameEn, nameAr: p.nameAr, descriptionEn: p.descriptionEn ?? '', descriptionAr: p.descriptionAr ?? '', imageUrl: p.imageUrl ?? '', sku: p.sku ?? '',
  basePriceBaisa: p.basePriceBaisa, compareAtPriceBaisa: p.compareAtPriceBaisa, isAvailable: p.isAvailable, trackStock: p.trackStock, stockQty: String(p.stockQty), sortOrder: String(p.sortOrder),
  groups: p.optionGroups.map((g) => ({ key: key(), kind: g.kind, nameEn: g.nameEn, nameAr: g.nameAr, minSelect: g.minSelect, maxSelect: g.maxSelect,
    options: g.options.map((o) => ({ key: key(), nameEn: o.nameEn, nameAr: o.nameAr, priceDeltaBaisa: o.priceDeltaBaisa, isAvailable: o.isAvailable })) })),
});

function toInput(d: Draft): ProductInput {
  return {
    categoryId: d.categoryId || null, nameEn: d.nameEn.trim(), nameAr: d.nameAr.trim(),
    ...(d.descriptionEn.trim() ? { descriptionEn: d.descriptionEn.trim() } : {}), ...(d.descriptionAr.trim() ? { descriptionAr: d.descriptionAr.trim() } : {}),
    ...(d.imageUrl ? { imageUrl: d.imageUrl } : {}), ...(d.sku.trim() ? { sku: d.sku.trim() } : {}),
    basePriceBaisa: d.basePriceBaisa ?? 0, compareAtPriceBaisa: d.compareAtPriceBaisa || null, isAvailable: d.isAvailable, trackStock: d.trackStock,
    stockQty: Math.max(0, Number(d.stockQty) || 0), sortOrder: Number(d.sortOrder) || 0,
    optionGroups: d.groups.map((g) => ({
      kind: g.kind, nameEn: g.nameEn.trim(), nameAr: g.nameAr.trim(), minSelect: g.kind === 'variant' ? 1 : g.minSelect, maxSelect: g.kind === 'variant' ? 1 : g.maxSelect,
      options: g.options.map((o) => ({ nameEn: o.nameEn.trim(), nameAr: o.nameAr.trim(), priceDeltaBaisa: o.priceDeltaBaisa ?? 0, isAvailable: o.isAvailable })),
    })),
  };
}

function validate(d: Draft, t: (k: string, v?: Record<string, string | number>) => string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.nameEn.trim()) e.nameEn = t('common.required');
  if (!d.nameAr.trim()) e.nameAr = t('common.required');
  if (d.basePriceBaisa == null || d.basePriceBaisa < 0) e.basePriceBaisa = t('product.priceRequired');
  if (d.compareAtPriceBaisa != null && d.basePriceBaisa != null && d.compareAtPriceBaisa > 0 && d.compareAtPriceBaisa <= d.basePriceBaisa) e.compareAtPriceBaisa = t('product.compareAtHint');
  if (d.imageUrl && !/^https?:\/\//.test(d.imageUrl)) e.imageUrl = t('product.urlInvalid');
  d.groups.forEach((g, gi) => {
    if (!g.nameEn.trim() || !g.nameAr.trim()) e[`g${gi}.name`] = t('product.groupNameRequired');
    if (!g.options.length) e[`g${gi}.options`] = t('product.optionRequired');
    g.options.forEach((o, oi) => { if (!o.nameEn.trim() || !o.nameAr.trim()) e[`g${gi}.o${oi}`] = t('product.optionNameRequired'); if (o.priceDeltaBaisa == null) e[`g${gi}.o${oi}`] = t('product.deltaInvalid'); });
    if (g.kind === 'addon' && (g.maxSelect < 1 || g.minSelect > g.maxSelect || g.minSelect > g.options.length)) e[`g${gi}.minmax`] = t('product.minMaxInvalid');
  });
  return e;
}

function GroupEditor({ g, gi, errors, onChange, onRemove, onMove, count }: { g: GroupDraft; gi: number; errors: Record<string, string>; onChange: (g: GroupDraft) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; count: number }) {
  const { t } = useI18n();
  const setOpt = (oi: number, patch: Partial<OptDraft>) => onChange({ ...g, options: g.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });
  return (
    <fieldset className="group-editor">
      <legend className="sr-only">{t('product.optionGroup')} {gi + 1}</legend>
      <div className="row between">
        <Segmented label={t('product.groupKind')} value={g.kind} onChange={(kind) => onChange({ ...g, kind, minSelect: kind === 'variant' ? 1 : 0, maxSelect: kind === 'variant' ? 1 : Math.max(1, g.options.length) })}
          options={[{ value: 'variant', label: t('product.variant') }, { value: 'addon', label: t('product.addon') }]} />
        <div className="row row-nowrap">
          <Button size="sm" variant="ghost" iconOnly aria-label={t('catalog.moveUp')} disabled={gi === 0} onClick={() => onMove(-1)}>↑</Button>
          <Button size="sm" variant="ghost" iconOnly aria-label={t('catalog.moveDown')} disabled={gi === count - 1} onClick={() => onMove(1)}>↓</Button>
          <Button size="sm" variant="danger-outline" icon="trash" onClick={onRemove}>{t('product.removeGroup')}</Button>
        </div>
      </div>
      <p className="text-sm muted">{g.kind === 'variant' ? t('product.variantHint') : t('product.addonHint')}</p>
      <div className="form-grid">
        <Input label={t('product.groupNameEn')} dir="ltr" placeholder="Size" value={g.nameEn} onChange={(e) => onChange({ ...g, nameEn: e.target.value })} />
        <Input label={t('product.groupNameAr')} dir="rtl" placeholder="الحجم" value={g.nameAr} onChange={(e) => onChange({ ...g, nameAr: e.target.value })} />
        {g.kind === 'addon' ? <>
          <Input label={t('product.minSelect')} type="number" min={0} value={g.minSelect} onChange={(e) => onChange({ ...g, minSelect: Math.max(0, Number(e.target.value) || 0) })} />
          <Input label={t('product.maxSelect')} type="number" min={1} value={g.maxSelect} onChange={(e) => onChange({ ...g, maxSelect: Math.max(1, Number(e.target.value) || 1) })} />
        </> : null}
      </div>
      {errors[`g${gi}.name`] ? <span className="field__error">{errors[`g${gi}.name`]}</span> : null}
      {errors[`g${gi}.minmax`] ? <span className="field__error">{errors[`g${gi}.minmax`]}</span> : null}
      <div className="stack stack-sm">
        <span className="field__label">{t('product.options')}</span>
        {g.options.map((o, oi) => (
          <div key={o.key} className="option-editor-row">
            <Input aria-label={`${t('product.optionNameEn')} ${oi + 1}`} dir="ltr" placeholder={t('product.optionNameEn')} value={o.nameEn} onChange={(e) => setOpt(oi, { nameEn: e.target.value })} />
            <Input aria-label={`${t('product.optionNameAr')} ${oi + 1}`} dir="rtl" placeholder={t('product.optionNameAr')} value={o.nameAr} onChange={(e) => setOpt(oi, { nameAr: e.target.value })} />
            <MoneyInput label={<span className="sr-only">{t('product.priceDelta')} {oi + 1}</span>} valueBaisa={o.priceDeltaBaisa} onChangeBaisa={(b) => setOpt(oi, { priceDeltaBaisa: b })} />
            <Switch checked={o.isAvailable} onChange={(v) => setOpt(oi, { isAvailable: v })} label={<span className="text-sm">{t('catalog.available')}</span>} />
            <Button size="sm" variant="ghost" iconOnly icon="x" aria-label={`${t('product.removeOption')} ${oi + 1}`} disabled={g.options.length <= 1} onClick={() => onChange({ ...g, options: g.options.filter((_, i) => i !== oi) })} />
            {errors[`g${gi}.o${oi}`] ? <span className="field__error span-all">{errors[`g${gi}.o${oi}`]}</span> : null}
          </div>
        ))}
        <div><Button size="sm" icon="plus" onClick={() => onChange({ ...g, options: [...g.options, newOption()] })}>{t('product.addOption')}</Button></div>
        <p className="text-xs muted">{t('product.deltaHint')}</p>
      </div>
    </fieldset>
  );
}

export function ProductEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { t, pick, money } = useI18n();
  const { merchantId, can } = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useCategories();
  const q = useQuery({ queryKey: ['m', 'product', merchantId, id], queryFn: () => merchantApi.get<Product>(`/merchants/${merchantId}/products/${id}`), enabled: !isNew });
  const [d, setD] = useState<Draft | null>(isNew ? emptyDraft() : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  useEffect(() => { if (q.data) setD(fromProduct(q.data)); }, [q.data]);

  // Preview product for the live price calculation.
  const preview = useMemo(() => {
    if (!d) return null;
    const groups: OptionGroup[] = d.groups.map((g) => ({ id: g.key, kind: g.kind, nameEn: g.nameEn || t('product.untitledGroup'), nameAr: g.nameAr || t('product.untitledGroup'),
      minSelect: g.kind === 'variant' ? 1 : g.minSelect, maxSelect: g.kind === 'variant' ? 1 : g.maxSelect,
      options: g.options.map((o) => ({ id: o.key, nameEn: o.nameEn || '…', nameAr: o.nameAr || '…', priceDeltaBaisa: o.priceDeltaBaisa ?? 0, isAvailable: o.isAvailable })) }));
    return { basePriceBaisa: d.basePriceBaisa ?? 0, compareAtPriceBaisa: d.compareAtPriceBaisa, optionGroups: groups };
  }, [d, t]);
  const structure = d ? d.groups.map((g) => `${g.key}:${g.kind}:${g.options.map((o) => `${o.key}${o.isAvailable}`).join(',')}`).join('|') : '';
  const [sel, setSel] = useState<Selection>({});
  const [qty, setQty] = useState(1);
  useEffect(() => { if (preview) setSel(defaultSelection(preview)); }, [structure]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (input: ProductInput) => (isNew ? merchantApi.post<Product>(`/merchants/${merchantId}/products`, input) : merchantApi.put<Product>(`/merchants/${merchantId}/products/${id}`, input)),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['m', 'products', merchantId] });
      qc.setQueryData(['m', 'product', merchantId, p.id], p);
      toast.push(t('product.saved', { name: pick(p.nameEn, p.nameAr) }));
      nav('/catalog');
    },
    onError: (e) => {
      if (isApiError(e)) {
        const fe = e.fieldErrors;
        setErrors((x) => ({ ...x, ...Object.fromEntries(Object.entries(fe).filter(([k]) => !k.includes('.'))) }));
        setServerErrors(Object.entries(fe).map(([k, v]) => `${k}: ${v}`));
      }
    },
  });

  if (!isNew && q.isLoading) return <Loading />;
  if (!isNew && q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!d || !preview) return <Loading />;
  if (!can('merchant.catalog:write')) return <Alert tone="warning">{t('common.noPermission')}</Alert>;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(d, t);
    setErrors(errs);
    setServerErrors([]);
    if (Object.keys(errs).length) { toast.push(t('register.fixErrors'), 'danger'); return; }
    save.mutate(toInput(d));
  };
  const moveGroup = (gi: number, dir: -1 | 1) => {
    const gs = [...d.groups];
    [gs[gi], gs[gi + dir]] = [gs[gi + dir], gs[gi]];
    set('groups', gs);
  };

  return (
    <form onSubmit={submit} noValidate className="stack stack-lg">
      <PageHeader title={isNew ? t('catalog.newProduct') : t('product.editTitle', { name: pick(d.nameEn, d.nameAr) })}
        actions={<><Link className="btn" to="/catalog">{t('common.cancel')}</Link><Button type="submit" variant="primary" loading={save.isPending}>{t('common.save')}</Button></>} />
      {save.isError ? <Alert tone="danger" title={errorMessage(save.error, t)}>{serverErrors.length ? <ul>{serverErrors.map((s) => <li key={s} className="ltr">{s}</li>)}</ul> : null}</Alert> : null}
      <div className="editor-layout">
        <div className="stack stack-lg">
          <Card title={t('product.basics')}>
            <div className="form-grid">
              <Input label={t('common.nameEn')} dir="ltr" value={d.nameEn} onChange={(e) => set('nameEn', e.target.value)} error={errors.nameEn} required />
              <Input label={t('common.nameAr')} dir="rtl" value={d.nameAr} onChange={(e) => set('nameAr', e.target.value)} error={errors.nameAr} required />
              <Select label={t('catalog.category')} value={d.categoryId} onChange={(e) => set('categoryId', e.target.value)} placeholder={t('catalog.uncategorized')}
                options={(cats.data?.items ?? []).map((c) => ({ value: c.id, label: pick(c.nameEn, c.nameAr) }))} />
              <Input label={t('product.sku')} dir="ltr" value={d.sku} onChange={(e) => set('sku', e.target.value)} optional />
              <Textarea label={t('product.descriptionEn')} dir="ltr" rows={3} value={d.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} optional />
              <Textarea label={t('product.descriptionAr')} dir="rtl" rows={3} value={d.descriptionAr} onChange={(e) => set('descriptionAr', e.target.value)} optional />
            </div>
          </Card>
          <Card title={t('product.pricing')}>
            <div className="form-grid">
              <MoneyInput label={t('product.basePrice')} valueBaisa={d.basePriceBaisa} onChangeBaisa={(b) => set('basePriceBaisa', b)} error={errors.basePriceBaisa} required />
              <MoneyInput label={t('product.compareAt')} valueBaisa={d.compareAtPriceBaisa} onChangeBaisa={(b) => set('compareAtPriceBaisa', b)} error={errors.compareAtPriceBaisa} hint={t('product.compareAtHint')} optional />
              <Input label={t('common.sortOrder')} type="number" value={d.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
            </div>
          </Card>
          <Card title={t('product.inventory')}>
            <div className="stack">
              <Switch checked={d.isAvailable} onChange={(v) => set('isAvailable', v)} label={t('catalog.available')} description={t('product.availableHint')} />
              <Switch checked={d.trackStock} onChange={(v) => set('trackStock', v)} label={t('product.trackStock')} description={t('product.trackStockHint')} />
              {d.trackStock ? <Input label={t('product.stockQty')} type="number" min={0} value={d.stockQty} onChange={(e) => set('stockQty', e.target.value)} fieldClassName="w-full" /> : null}
            </div>
          </Card>
          <Card title={t('product.optionGroups')} actions={<>
            <Button size="sm" icon="plus" onClick={() => set('groups', [...d.groups, newGroup('variant')])}>{t('product.addVariant')}</Button>
            <Button size="sm" icon="plus" onClick={() => set('groups', [...d.groups, newGroup('addon')])}>{t('product.addAddon')}</Button>
          </>}>
            {d.groups.length ? (
              <div className="stack stack-lg">
                {d.groups.map((g, gi) => (
                  <GroupEditor key={g.key} g={g} gi={gi} count={d.groups.length} errors={errors}
                    onChange={(ng) => set('groups', d.groups.map((x, i) => (i === gi ? ng : x)))}
                    onRemove={() => set('groups', d.groups.filter((_, i) => i !== gi))} onMove={(dir) => moveGroup(gi, dir)} />
                ))}
              </div>
            ) : <p className="muted">{t('product.noGroups')}</p>}
          </Card>
        </div>
        <div className="stack stack-lg editor-aside">
          <Card title={t('product.image')}>
            <ImageUploadField label={t('product.image')} value={d.imageUrl} onChange={(u) => set('imageUrl', u)} purpose="product_image" aspect="4 / 3" />
            {errors.imageUrl ? <span className="field__error">{errors.imageUrl}</span> : null}
          </Card>
          <Card title={t('product.preview')}>
            <div className="stack">
              <div className="row between">
                <span className="strong">{pick(d.nameEn, d.nameAr) || t('product.untitled')}</span>
                <span className="stack" style={{ ['--gap' as string]: '0px', alignItems: 'flex-end' }}>
                  <span>{fromPrice(preview) !== preview.basePriceBaisa ? `${t('catalog.from')} ` : ''}{money(fromPrice(preview))}</span>
                  {d.compareAtPriceBaisa ? <s className="text-xs muted">{money(d.compareAtPriceBaisa)}</s> : null}
                </span>
              </div>
              <ProductConfigurator product={preview} selection={sel} onSelection={setSel} quantity={qty} onQuantity={setQty} />
              <p className="text-xs muted">{t('product.previewHint')}</p>
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}
