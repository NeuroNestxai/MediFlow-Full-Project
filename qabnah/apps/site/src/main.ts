import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import './styles.css';
import { copy, type CopyKey, type Lang } from './copy';
import type { SceneHandle } from './scene';

const API = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/v1').replace(/\/$/, '');
const MERCHANT = (import.meta.env.VITE_MERCHANT_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL ?? '';
const LINKS: Record<string, string> = { stores: `${MERCHANT}/stores`, register: `${MERCHANT}/register`, login: `${MERCHANT}/login` };

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* ───────── language ───────── */
function initialLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ar' || q === 'en') return q;
  try { const s = localStorage.getItem('qabnah.lang'); if (s === 'ar' || s === 'en') return s; } catch { /* storage unavailable */ }
  return 'ar';
}
let lang: Lang = initialLang();
const t = (k: CopyKey, vars?: Record<string, string>) => copy[lang][k].replace(/\{(\w+)\}/g, (_, n: string) => vars?.[n] ?? '');
const num = (n: number) => new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-arab' : 'en').format(n);

function applyLang() {
  const html = document.documentElement;
  html.lang = lang; html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n as CopyKey);
  $<HTMLMetaElement>('meta[name="description"]').content = t('meta.description');
  for (const el of $$('[data-num]')) el.textContent = num(Number(el.dataset.num));
  for (const a of $$<HTMLAnchorElement>('[data-link]')) a.href = `${LINKS[a.dataset.link!]}${lang === 'en' ? '?lang=en' : ''}`;
  $('#year').textContent = new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-arab' : 'en', { useGrouping: false }).format(new Date().getFullYear());
  renderStores(); renderZones();
  stage.onLang();
}
$('#lang').addEventListener('click', () => {
  lang = lang === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('qabnah.lang', lang); } catch { /* ignore */ }
  applyLang();
});

/* ───────── live data: stores and zones ───────── */
interface Store { slug: string; nameAr: string; nameEn: string; taglineAr: string | null; taglineEn: string | null; category: string; coverUrl: string | null; logoUrl: string | null; brandColor: string | null; isOpen: boolean; prepTimeMinutes: number | null }
interface Zone { nameAr: string; nameEn: string; isActive: boolean }
let stores: Store[] | null = null;
let zones: Zone[] | null = null;
const safeColor = (c: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#0E7C66');
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

function renderStores() {
  const section = $('#stores'), list = $('#store-list');
  if (!stores) return;
  if (!stores.length) { section.hidden = true; return; }
  section.hidden = false;
  list.innerHTML = stores.slice(0, 8).map((s) => {
    const name = lang === 'ar' ? s.nameAr : s.nameEn;
    const tagline = (lang === 'ar' ? s.taglineAr : s.taglineEn) ?? '';
    const catKey = `cat.${s.category}` as CopyKey;
    const cat = catKey in copy[lang] ? t(catKey) : '';
    const cover = safeUrl(s.coverUrl), logo = safeUrl(s.logoUrl);
    const meta = [cat, s.prepTimeMinutes ? t('stores.prep', { n: num(s.prepTimeMinutes) }) : ''].filter(Boolean).map(esc).join('<i></i>');
    return `<a class="store" href="${esc(`${MERCHANT}/s/${encodeURIComponent(s.slug)}${lang === 'en' ? '?lang=en' : ''}`)}">
      <div class="store-cover">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <span class="pill${s.isOpen ? '' : ' is-closed'}">${esc(t(s.isOpen ? 'stores.open' : 'stores.closed'))}</span></div>
      <div class="store-body">
        <span class="store-logo" style="background:${safeColor(s.brandColor)}">${logo ? `<img src="${esc(logo)}" alt="">` : esc([...name][0] ?? '')}</span>
        <h3>${esc(name)}</h3><p>${esc(tagline)}</p>
        ${meta ? `<div class="store-meta">${meta}</div>` : ''}
      </div></a>`;
  }).join('');
}
function renderZones() {
  const section = $('#coverage');
  if (!zones) return;
  const active = zones.filter((z) => z.isActive);
  section.hidden = active.length === 0;
  $('#zone-list').innerHTML = active.map((z) => `<li>${esc(lang === 'ar' ? z.nameAr : z.nameEn)}</li>`).join('');
}
async function loadData() {
  const get = async <T,>(path: string): Promise<T[] | null> => {
    try { const r = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } }); if (!r.ok) return null; return ((await r.json()) as { items: T[] }).items; } catch { return null; }
  };
  const list = $('#store-list');
  $('#stores').hidden = false;
  list.innerHTML = '<div class="skeleton"></div>'.repeat(4);
  [stores, zones] = await Promise.all([get<Store>('/stores'), get<Zone>('/zones')]);
  if (!stores) { stores = []; }
  renderStores(); renderZones();
}

/* ───────── stage: scroll chapters over the 3D scene (or its pre-rendered stills) ───────── */
const stage = (() => {
  const root = $('#stage'), pin = $('.stage-pin'), canvas = $<HTMLCanvasElement>('#scene'), stillsBox = $('#stills');
  const chapters = $$('.chapter'), rail = $$('#rail li'), hint = $('#hint'), header = $('#header');
  let scene: SceneHandle | null = null;
  let stills: HTMLImageElement[] = [];
  let p = 0, ticking = false;

  const portrait = () => innerWidth / innerHeight < 0.8;
  const stillUrl = (i: number) => (portrait() ? `/stills/phone-${i}.jpg` : `/stills/desk-${i}.jpg`);
  function webgl() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  // Phones and constrained devices get pre-rendered frames of the very same scene: sharper and far lighter than live 3D there.
  const live = !matchMedia('(max-width: 820px)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches
    && (navigator.hardwareConcurrency ?? 8) >= 4 && !conn?.saveData && !new URLSearchParams(location.search).has('stills') && webgl();

  function buildStills(count: number) {
    stillsBox.innerHTML = '';
    stills = [];
    for (let i = 0; i < count; i++) {
      const img = new Image();
      img.alt = ''; img.decoding = 'async';
      if (i > 0) img.loading = 'lazy';
      img.src = stillUrl(i);
      stillsBox.append(img); stills.push(img);
    }
  }
  function applyShift() {
    if (!scene) return;
    if (innerWidth / innerHeight < 1) scene.setShift(0, 0.2); else scene.setShift(0.2, 0); // copy sits on the right in both languages
  }

  function update() {
    ticking = false;
    const r = root.getBoundingClientRect();
    const total = r.height - innerHeight;
    p = clamp(-r.top / total) * 3;
    scene?.setProgress(p);
    chapters.forEach((el, i) => {
      const d = p - i, w = clamp(1 - Math.abs(d) * 2.6);
      el.style.opacity = String(w);
      const shift = `${(-d * 70).toFixed(1)}px`;
      el.style.transform = matchMedia('(max-width: 820px)').matches ? `translateY(${shift})` : `translateY(calc(-50% + ${shift}))`;
      el.classList.toggle('is-on', w > 0.02);
      el.style.pointerEvents = w > 0.6 ? 'auto' : 'none';
    });
    const active = Math.round(p);
    rail.forEach((li, i) => li.classList.toggle('is-on', i === active));
    stills.forEach((img, i) => { img.style.opacity = i === 0 ? '1' : String(clamp(p - (i - 1))); });
    hint.style.opacity = String(clamp(1 - p * 4));
    header.classList.toggle('is-solid', scrollY > 12);
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

  async function init() {
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { scene?.resize(); applyShift(); onScroll(); });
    if (!live) { buildStills(4); update(); return; }
    buildStills(1); // poster until the scene is ready
    update();
    try {
      const [{ createScene }] = await Promise.all([import('./scene'), document.fonts.load('700 58px "IBM Plex Sans Arabic"')]);
      scene = createScene(canvas, { screenUrl: '/img/phone-storefront.jpg', pixelRatio: Math.min(devicePixelRatio, 1.75), onReady: () => pin.classList.add('gl-ready') });
      applyShift(); scene.setProgress(p); scene.render(); scene.start();
      new IntersectionObserver(([e]) => (e.isIntersecting ? scene!.start() : scene!.stop())).observe(root);
      document.addEventListener('visibilitychange', () => (document.hidden ? scene!.stop() : scene!.start()));
    } catch (err) {
      console.warn('3D scene unavailable, showing stills', err);
      buildStills(4); update();
    }
  }
  return { init, onLang() { /* the stage layout is identical in both languages */ } };
})();

/* ───────── reveal on scroll ───────── */
function initReveal() {
  const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  for (const el of $$('.reveal')) io.observe(el);
}

if (CONTACT && /^[^@\s]+@[^@\s]+$/.test(CONTACT)) {
  $('#contact').hidden = false;
  const a = $<HTMLAnchorElement>('#contact-mail'); a.href = `mailto:${CONTACT}`; a.textContent = CONTACT;
}
applyLang();
initReveal();
void stage.init();
void loadData();
