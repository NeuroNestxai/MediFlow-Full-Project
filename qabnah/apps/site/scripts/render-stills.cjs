#!/usr/bin/env node
/**
 * Photographs the live three.js scene into public/stills (used on phones, with reduced motion, and when WebGL is unavailable).
 * Run with the dev server up:  npm run dev -w @qabnah/site   then   node scripts/render-stills.cjs [baseUrl]
 */
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://localhost:5175';
const out = path.join(__dirname, '..', 'public', 'stills');
const SETS = [
  { name: 'phone', w: 780, h: 1560, shift: [0, 0.2] },
  { name: 'desk', w: 1920, h: 1080, shift: [0.2, 0] },
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const set of SETS) {
    const page = await browser.newPage({ viewport: { width: set.w, height: set.h }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
    await page.goto(`${base}/stills.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    for (let i = 0; i < 4; i++) {
      await page.evaluate(([n, sx, sy]) => { window.__scene.resize(); window.__scene.setShift(sx, sy); window.__scene.setProgress(n); window.__scene.render(); }, [i, ...set.shift]);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `${set.name}-${i}.jpg`), type: 'jpeg', quality: 84 });
      console.log(`${set.name}-${i}.jpg`);
    }
    await page.close();
  }
  await browser.close();
})();
