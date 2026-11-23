/**
 * Visual-regression capture harness (3A-650 part E).
 *
 * Serves the production build locally with the exact response headers
 * from frontend/vercel.json and captures the key unauthenticated
 * surfaces as PNGs plus a manifest. Compare two capture runs with
 * compare.mjs. See README.md for the baseline policy and limits.
 *
 * Usage:
 *   npm run build            (from frontend/, produces dist/)
 *   node tools/visual-regression/capture.mjs [output-dir]
 *
 * Requires playwright-core and a Chromium executable:
 *   npm install --no-save playwright-core
 *   CHROMIUM_PATH=/path/to/chromium node tools/visual-regression/capture.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));
const distRoot = join(frontendRoot, 'dist', 'ai-business-assistant', 'browser');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(frontendRoot, 'tools', 'visual-regression', 'runs', stamp);

if (!existsSync(join(distRoot, 'index.html'))) {
  console.error('Production build not found at ' + distRoot + ' — run `npm run build` first.');
  process.exit(2);
}

const vercel = JSON.parse(readFileSync(join(frontendRoot, 'vercel.json'), 'utf8'));
const globalHeaders = (vercel.headers ?? [])
  .filter((entry) => entry.source === '/(.*)')
  .flatMap((entry) => entry.headers ?? []);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let filePath = normalize(join(distRoot, url.pathname));
  if (!filePath.startsWith(distRoot) || !existsSync(filePath) || !filePath.includes('.')) {
    filePath = join(distRoot, 'index.html');
  }
  for (const header of globalHeaders) res.setHeader(header.key, header.value);
  res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
  res.end(readFileSync(filePath));
});

const { chromium } = await import('playwright-core');

const SURFACES = [
  { name: 'login-ar-mobile', viewport: { width: 390, height: 844 }, language: 'ar' },
  { name: 'login-en-mobile', viewport: { width: 390, height: 844 }, language: 'en' },
  { name: 'login-ar-desktop', viewport: { width: 1440, height: 900 }, language: 'ar' },
];

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const manifest = { capturedAt: new Date().toISOString(), base, surfaces: [] };
try {
  for (const surface of SURFACES) {
    const context = await browser.newContext({ viewport: surface.viewport });
    if (surface.language === 'en') {
      await context.addInitScript(() => localStorage.setItem('aba-language', 'en'));
    }
    const page = await context.newPage();
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(750);
    const file = surface.name + '.png';
    await page.screenshot({ path: join(outDir, file) });
    manifest.surfaces.push({ ...surface, file });
    await context.close();
    console.log('captured', file);
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('manifest written to', join(outDir, 'manifest.json'));
