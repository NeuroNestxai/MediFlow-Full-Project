import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorState, Icon, Photo, useDebounced, useDocumentTitle, useI18n, type MerchantCategory, type MerchantSummary } from '@qabnah/shared';
import { publicApi } from '../api';
import { StoreLogo } from './StorefrontLayout';

interface StoresResponse { items: MerchantSummary[]; total: number }

function StoreCard({ m }: { m: MerchantSummary }) {
  const { t, pick, num, money } = useI18n();
  return (
    <Link to={`/s/${m.slug}`} className="store-card" data-testid="store-card">
      <Photo src={m.coverUrl} ratio="16 / 9" category={m.category} tint={m.brandColor} className="store-card__cover" alt="">
        <span className={`pill store-card__status ${m.isOpen ? 'pill--open' : 'pill--closed'}`}><span className="pill__dot" />{m.isOpen ? t('store.open') : t('store.closed')}</span>
      </Photo>
      <div className="store-card__body">
        <StoreLogo m={m} size={48} />
        <span className="store-card__name">{pick(m.nameEn, m.nameAr)}</span>
        <span className="store-card__meta">
          <span>{t(`category.${m.category}`)}</span>
          <span>{t('sf.prep', { n: num(m.prepTimeMinutes, 0) })}</span>
          {m.minOrderBaisa ? <span>{t('sf.minOrderShort', { amount: money(m.minOrderBaisa) })}</span> : null}
          {m.ratingCount ? <span>{num(m.ratingAvg, 1)} ★</span> : null}
        </span>
      </div>
    </Link>
  );
}

/** Public directory of stores: search, category chips with photos, photo store cards. */
export function StoresDirectory() {
  const { t, toggleLang, lang } = useI18n();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<MerchantCategory | ''>('');
  const dq = useDebounced(q.trim(), 300);
  useDocumentTitle(`${t('dir.title')} · ${t('app.name')}`);
  // Unfiltered list drives the category chips (only categories that really have stores, with a real cover photo).
  const all = useQuery({ queryKey: ['stores', 'all'], queryFn: () => publicApi.get<StoresResponse>('/stores', { auth: false, query: { limit: 100 } }), staleTime: 60_000 });
  const filtered = useQuery({
    queryKey: ['stores', dq, category],
    queryFn: () => publicApi.get<StoresResponse>('/stores', { auth: false, query: { limit: 100, q: dq || undefined, category: category || undefined } }),
    placeholderData: keepPreviousData,
    enabled: !!dq || !!category,
  });
  const list = dq || category ? filtered : all;
  const chips = useMemo(() => {
    const seen = new Map<MerchantCategory, MerchantSummary>();
    for (const m of all.data?.items ?? []) if (!seen.has(m.category)) seen.set(m.category, m);
    return [...seen.entries()];
  }, [all.data]);
  return (
    <div className="dir">
      <header className="dir-hero on-night">
        <div className="dir-hero__inner">
          <div className="dir-hero__bar">
            <Link to="/stores" className="dir-hero__brand"><img src="/brand/mark.svg" alt="" /><span>{t('app.name')}</span></Link>
            <button type="button" className="btn btn--sm" onClick={toggleLang} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={t('lang.switchLabel')}>{t('lang.switch')}</button>
          </div>
          <div className="stack" style={{ ['--gap' as string]: '6px' }}>
            <h1>{t('dir.title')}</h1>
            <p>{t('dir.subtitle')}</p>
          </div>
          <div className="dir-search" role="search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dir.search')} aria-label={t('dir.search')} />
          </div>
        </div>
      </header>
      <main className="sf-container stack stack-lg" style={{ paddingBlock: 20 }}>
        {chips.length > 1 ? (
          <div className="cat-chips" role="group" aria-label={t('catalog.categories')}>
            <button type="button" className={`cat-chip cat-chip--all ${category === '' ? 'cat-chip--on' : ''}`} aria-pressed={category === ''} onClick={() => setCategory('')}>{t('common.all')}</button>
            {chips.map(([c, m]) => (
              <button key={c} type="button" className={`cat-chip ${category === c ? 'cat-chip--on' : ''}`} aria-pressed={category === c} onClick={() => setCategory(category === c ? '' : c)}>
                <Photo src={m.coverUrl} ratio="1 / 1" category={c} />
                {t(`category.${c}`)}
              </button>
            ))}
          </div>
        ) : null}
        {list.isLoading ? (
          <div className="store-grid" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 280, borderRadius: 16 }} />)}</div>
        ) : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.items.length ? (
          <div className="sf-empty"><span className="sf-empty__icon"><Icon name="search" /></span><strong>{t('dir.empty')}</strong>
            {dq || category ? <button type="button" className="btn btn--sm" onClick={() => { setQ(''); setCategory(''); }}>{t('dir.clear')}</button> : null}</div>
        ) : (
          <div className="store-grid">{list.data.items.map((m) => <StoreCard key={m.id} m={m} />)}</div>
        )}
      </main>
      <footer className="sf-footer"><img src="/brand/logo.svg" alt={t('app.name')} /></footer>
    </div>
  );
}
