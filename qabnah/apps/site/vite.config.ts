import { defineConfig, type Plugin } from 'vite';
import { copy } from './src/copy';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Pre-fills every `data-i18n` element with the Arabic copy so the page reads correctly before (or without) JavaScript. */
function prefillArabic(): Plugin {
  const ar = copy.ar as Record<string, string>, en = copy.en as Record<string, string>;
  const missing = Object.keys(ar).filter((k) => !(k in en)).concat(Object.keys(en).filter((k) => !(k in ar)));
  if (missing.length) throw new Error(`copy.ts: keys not present in both languages: ${missing.join(', ')}`);
  return {
    name: 'qabnah-prefill-arabic',
    transformIndexHtml(html) {
      return html.replace(/(<[a-z0-9]+\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)(<\/)/g, (_m, open: string, key: string, close: string) => {
        if (!(key in ar)) throw new Error(`index.html: unknown copy key "${key}"`);
        return open + esc(ar[key]!) + close;
      });
    },
  };
}

export default defineConfig({
  plugins: [prefillArabic()],
  server: { port: 5175, strictPort: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});
