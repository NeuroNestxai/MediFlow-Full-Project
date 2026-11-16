// Renders brand SVGs to PNG app icons using the pre-installed Playwright Chromium.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const svg = fs.readFileSync(path.join(__dirname, 'mark.svg'), 'utf8');
  const out = path.join(__dirname, 'png'); fs.mkdirSync(out, { recursive: true });
  for (const s of [1024, 512, 192, 180, 120, 48]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: path.join(out, `mark-${s}.png`), omitBackground: true });
  }
  const logo = fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8');
  await p.setViewportSize({ width: 1200, height: 360 });
  await p.setContent(`<html><body style="margin:0;background:#fff">${logo.replace('<svg ', '<svg width="1200" height="360" ')}</body></html>`);
  await p.screenshot({ path: path.join(out, 'logo-1200.png') });
  await b.close();
})();
