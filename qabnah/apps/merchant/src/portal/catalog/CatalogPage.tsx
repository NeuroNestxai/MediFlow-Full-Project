import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Loading, PageHeader, Select, Switch, Tabs, errorMessage, fromPrice,
  useDebounced, useI18n, useToast, type Category, type Items, type Product,
} from '@qabnah/shared';
import { merchantApi } from '../../api';
import { useSession } from '../session';

export const catKey = (mid: string | null) => ['m', 'categories', mid] as const;

export function useCategories() {
  const { merchantId } = useSession();
  return useQuery({ queryKey: catKey(merchantId), queryFn: () => merchantApi.get<Items<Category>>(`/merchants/${merchantId}/categories`) });
}

function ProductsTab() {
  const { t, pick, money, num } = useI18n();
  const { merchantId, can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const q = useDebounced(search, 300);
  const cats = useCategories();
  const products = useQuery({
    queryKey: ['m', 'products', merchantId, q, categoryId],
    queryFn: () => merchantApi.get<Items<Product>>(`/merchants/${merchantId}/products`, { query: { q: q || undefined, categoryId: categoryId || undefined } }),
  });
  const writable = can('merchant.catalog:write');
  const toggle = useMutation({
    mutationFn: (p: Product) => merchantApi.patch<Product>(`/merchants/${merchantId}/products/${p.id}`, { isAvailable: !p.isAvailable }),
    onSuccess: (p) => {
      qc.setQueriesData<Items<Product>>({ queryKey: ['m', 'products', merchantId] }, (old) => old ? { items: old.items.map((x) => (x.id === p.id ? p : x)) } : old);
      toast.push(p.isAvailable ? t('catalog.nowAvailable', { name: pick(p.nameEn, p.nameAr) }) : t('catalog.nowUnavailable', { name: pick(p.nameEn, p.nameAr) }));
    },
    onError: (e) => toast.push(errorMessage(e, t), 'danger'),
  });
  const del = useMutation({
    mutationFn: (p: Product) => merchantApi.delete(`/merchants/${merchantId}/products/${p.id}`),
    onSuccess: () => { setToDelete(null); void qc.invalidateQueries({ queryKey: ['m', 'products', merchantId] }); toast.push(t('catalog.deleted')); },
  });
  const catName = (id: string | null) => { const c = cats.data?.items.find((x) => x.id === id); return c ? pick(c.nameEn, c.nameAr) : t('catalog.uncategorized'); };

  return (
    <Card flush title={
      <div className="row grow">
        <Input aria-label={t('common.search')} placeholder={t('catalog.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} type="search" fieldClassName="grow" />
        <Select aria-label={t('catalog.category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder={t('catalog.allCategories')}
          options={(cats.data?.items ?? []).map((c) => ({ value: c.id, label: pick(c.nameEn, c.nameAr) }))} />
      </div>
    } actions={writable ? <Link className="btn btn--primary" to="/catalog/products/new"><span aria-hidden="true">＋</span> {t('catalog.newProduct')}</Link> : null}>
      {products.isLoading ? <Loading /> : products.isError ? <ErrorState error={products.error} onRetry={() => products.refetch()} /> : !products.data?.items.length ? (
        <EmptyState icon="box" title={q || categoryId ? t('catalog.noMatch') : t('catalog.noProducts')}
          action={writable && !q ? <Link className="btn btn--primary btn--sm" to="/catalog/products/new">{t('catalog.newProduct')}</Link> : undefined} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('catalog.product')}</th><th>{t('catalog.category')}</th><th className="num">{t('catalog.price')}</th><th>{t('catalog.stock')}</th><th>{t('catalog.options')}</th><th>{t('catalog.available')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
            <tbody>
              {products.data.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="row row-nowrap">
                      <div className="thumb">{p.imageUrl ? <img src={p.imageUrl} alt="" /> : null}</div>
                      <div className="stack" style={{ ['--gap' as string]: '0px', minWidth: 0 }}>
                        <span className="strong truncate">{pick(p.nameEn, p.nameAr)}</span>
                        <span className="text-xs muted truncate">{pick(p.nameAr, p.nameEn)}{p.sku ? ` · ${p.sku}` : ''}</span>
                      </div>
                    </div>
                  </td>
                  <td>{catName(p.categoryId)}</td>
                  <td className="num nowrap">
                    <span className="strong">{fromPrice(p) !== p.basePriceBaisa ? `${t('catalog.from')} ` : ''}{money(fromPrice(p))}</span>
                    {p.compareAtPriceBaisa ? <div className="text-xs muted"><s>{money(p.compareAtPriceBaisa)}</s></div> : null}
                  </td>
                  <td>{p.trackStock ? <Badge tone={p.stockQty === 0 ? 'danger' : p.stockQty < 5 ? 'warning' : 'neutral'}>{num(p.stockQty, 0)}</Badge> : <span className="muted text-sm">{t('catalog.notTracked')}</span>}</td>
                  <td className="text-sm">{p.optionGroups.length ? p.optionGroups.map((g) => pick(g.nameEn, g.nameAr)).join(', ') : <span className="muted">—</span>}</td>
                  <td><Switch checked={p.isAvailable} disabled={!writable || toggle.isPending} onChange={() => toggle.mutate(p)} label={<span className="sr-only">{t('catalog.available')}</span>} /></td>
                  <td>
                    {writable ? (
                      <div className="row row-nowrap">
                        <Link className="btn btn--sm" to={`/catalog/products/${p.id}`}>{t('common.edit')}</Link>
                        <Button size="sm" variant="ghost" iconOnly icon="trash" aria-label={`${t('common.delete')} ${pick(p.nameEn, p.nameAr)}`} onClick={() => setToDelete(p)} />
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!toDelete} tone="danger" title={t('catalog.deleteTitle')} message={toDelete ? t('catalog.deleteBody', { name: pick(toDelete.nameEn, toDelete.nameAr) }) : ''}
        confirmLabel={t('common.delete')} loading={del.isPending} error={del.isError ? errorMessage(del.error, t) : null}
        onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete)} />
    </Card>
  );
}

function CategoriesTab() {
  const { t, num } = useI18n();
  const { merchantId, can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useCategories();
  const writable = can('merchant.catalog:write');
  const [form, setForm] = useState<{ id?: string; nameEn: string; nameAr: string; sortOrder: string; isActive: boolean } | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invalidate = () => { void qc.invalidateQueries({ queryKey: catKey(merchantId) }); void qc.invalidateQueries({ queryKey: ['m', 'products', merchantId] }); };
  const save = useMutation({
    mutationFn: (f: NonNullable<typeof form>) => {
      const body = { nameEn: f.nameEn.trim(), nameAr: f.nameAr.trim(), sortOrder: Number(f.sortOrder) || 0, isActive: f.isActive };
      return f.id ? merchantApi.patch<Category>(`/merchants/${merchantId}/categories/${f.id}`, body) : merchantApi.post<Category>(`/merchants/${merchantId}/categories`, body);
    },
    onSuccess: () => { setForm(null); invalidate(); toast.push(t('common.saved')); },
    onError: (e) => setErrors({ _: errorMessage(e, t) }),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Category> }) => merchantApi.patch<Category>(`/merchants/${merchantId}/categories/${id}`, body),
    onSuccess: invalidate,
    onError: (e) => toast.push(errorMessage(e, t), 'danger'),
  });
  const del = useMutation({
    mutationFn: (c: Category) => merchantApi.delete(`/merchants/${merchantId}/categories/${c.id}`),
    onSuccess: () => { setToDelete(null); invalidate(); toast.push(t('catalog.categoryDeleted')); },
  });
  const items = [...(cats.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const move = async (i: number, dir: -1 | 1) => {
    const a = items[i], b = items[i + dir];
    if (!a || !b) return;
    // Re-number so equal sort orders become distinct, then swap the pair.
    const renum = items.map((c, idx) => ({ ...c, sortOrder: idx * 10 }));
    [renum[i].sortOrder, renum[i + dir].sortOrder] = [renum[i + dir].sortOrder, renum[i].sortOrder];
    await Promise.all(renum.filter((c, idx) => c.sortOrder !== items[idx].sortOrder).map((c) => patch.mutateAsync({ id: c.id, body: { sortOrder: c.sortOrder } })));
  };
  const submit = () => {
    if (!form) return;
    const errs: Record<string, string> = {};
    if (!form.nameEn.trim()) errs.nameEn = t('common.required');
    if (!form.nameAr.trim()) errs.nameAr = t('common.required');
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate(form);
  };

  return (
    <Card flush title={t('catalog.categories')} actions={writable ? <Button variant="primary" icon="plus" onClick={() => { setErrors({}); setForm({ nameEn: '', nameAr: '', sortOrder: String((items.at(-1)?.sortOrder ?? 0) + 10), isActive: true }); }}>{t('catalog.newCategory')}</Button> : null}>
      {form ? (
        <form className="pad stack" style={{ borderBlockEnd: '1px solid var(--q-border)', background: '#FCFAF5' }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="form-grid">
            <Input label={t('common.nameEn')} dir="ltr" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} error={errors.nameEn} autoFocus />
            <Input label={t('common.nameAr')} dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} error={errors.nameAr} />
            <Input label={t('common.sortOrder')} type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </div>
          <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t('catalog.showOnStorefront')} />
          {errors._ ? <Alert tone="danger">{errors._}</Alert> : null}
          <div className="row"><Button type="submit" variant="primary" loading={save.isPending}>{t('common.save')}</Button><Button onClick={() => setForm(null)}>{t('common.cancel')}</Button></div>
        </form>
      ) : null}
      {cats.isLoading ? <Loading /> : cats.isError ? <ErrorState error={cats.error} onRetry={() => cats.refetch()} /> : !items.length ? <EmptyState icon="list" title={t('catalog.noCategories')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('common.sortOrder')}</th><th>{t('common.nameEn')}</th><th>{t('common.nameAr')}</th><th>{t('common.status')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
            <tbody>
              {items.map((c, i) => (
                <tr key={c.id}>
                  <td>
                    <div className="row row-nowrap">
                      <span className="num muted" style={{ minWidth: 28 }}>{num(c.sortOrder, 0)}</span>
                      {writable ? <>
                        <Button size="sm" variant="ghost" iconOnly aria-label={t('catalog.moveUp')} disabled={i === 0 || patch.isPending} onClick={() => move(i, -1)}>↑</Button>
                        <Button size="sm" variant="ghost" iconOnly aria-label={t('catalog.moveDown')} disabled={i === items.length - 1 || patch.isPending} onClick={() => move(i, 1)}>↓</Button>
                      </> : null}
                    </div>
                  </td>
                  <td className="ltr">{c.nameEn}</td>
                  <td dir="rtl">{c.nameAr}</td>
                  <td><Switch checked={c.isActive} disabled={!writable} onChange={(v) => patch.mutate({ id: c.id, body: { isActive: v } })} label={c.isActive ? t('common.active') : t('common.inactive')} /></td>
                  <td>{writable ? <div className="row row-nowrap">
                    <Button size="sm" onClick={() => { setErrors({}); setForm({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, sortOrder: String(c.sortOrder), isActive: c.isActive }); }}>{t('common.edit')}</Button>
                    <Button size="sm" variant="ghost" iconOnly icon="trash" aria-label={`${t('common.delete')} ${c.nameEn}`} onClick={() => setToDelete(c)} />
                  </div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!toDelete} tone="danger" title={t('catalog.deleteCategoryTitle')} message={t('catalog.deleteCategoryBody')} confirmLabel={t('common.delete')}
        loading={del.isPending} error={del.isError ? errorMessage(del.error, t) : null} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete)} />
    </Card>
  );
}

export function CatalogPage() {
  const { t } = useI18n();
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'products' | 'categories') ?? 'products';
  return (
    <>
      <PageHeader title={t('nav.catalog')} description={t('catalog.hint')} />
      {!can('merchant.catalog:write') ? <Alert tone="info">{t('catalog.readOnly')}</Alert> : null}
      <Tabs label={t('nav.catalog')} value={tab} onChange={(v) => setParams({ tab: v })}
        tabs={[{ value: 'products', label: t('catalog.products') }, { value: 'categories', label: t('catalog.categories') }]} />
      {tab === 'products' ? <ProductsTab /> : <CategoriesTab />}
    </>
  );
}
