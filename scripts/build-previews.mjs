// Build the theme-aware README covers and the conceptual feature illustrations.
// Chrome capture is deliberately left to TaskWindow; this script never launches
// a browser or attaches a second debugger. The receipts file is what stops a
// stale PNG shipping next to an edited composition.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { conceptStyles, conceptLayout, renderConcept, renderChangeLog } from './feature-concepts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'screenshots/manifest.json'), 'utf8'));
const build = resolve(root, '.preview-build');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function local(path) {
  const result = resolve(root, path);
  if (!result.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error(`Path outside repository: ${path}`);
  return result;
}
function png(path) {
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Expected PNG: ${path}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes };
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const shots = new Map();
for (const shot of manifest.screenshots) {
  if (![manifest.cover.light, manifest.cover.dark].includes(shot.id)) throw new Error(`Screenshot is not a cover source: ${shot.id}`);
  if (shots.has(shot.id) || !shot.alt || !shot.route) throw new Error(`Invalid screenshot entry: ${shot.id}`);
  const actual = png(local(shot.src));
  if (actual.width !== shot.width || actual.height !== shot.height) throw new Error(`Dimensions changed: ${shot.id}`);
  shots.set(shot.id, { ...shot, uri: `data:image/png;base64,${actual.bytes.toString('base64')}` });
}
const icon = `data:image/svg+xml;base64,${readFileSync(local('icon.svg')).toString('base64')}`;

const style = `
*{box-sizing:border-box}html,body{margin:0;width:1600px;height:1000px;overflow:hidden}
body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#241f1f;-webkit-font-smoothing:antialiased}
.brand{position:absolute;right:80px;top:65px;display:flex;align-items:center;gap:12px;font-size:20px;font-weight:600}
.brand img{width:34px;height:34px;border-radius:9px}
.eyebrow{position:absolute;left:80px;top:76px;font-size:16px;letter-spacing:2px;font-weight:600}
h1{margin:0}
.footer{position:absolute;bottom:30px;left:80px;font-size:14px;color:#7a716e}
.frame img{display:block;width:100%;height:auto}
`;
const html = (title, body, background, classes = '') =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(title)}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>${style}</style><body class="${classes}" style="background:${background}">${body}</body></html>`;

// The cover borrows the concepts' panel language on purpose, so the README and
// the first carousel slide read as one system rather than two art directions.
const coverStyles = `
.cover{color:#241f1f}
.cover:before{content:"";position:absolute;left:520px;top:150px;width:1030px;height:850px;background:radial-gradient(ellipse,#f0dcdc,transparent 70%);filter:blur(10px)}
.cover .cover-brand{position:absolute;left:80px;top:67px;display:flex;align-items:center;gap:14px}
.cover .cover-brand img{width:46px;height:46px;border-radius:12px}
.cover .cover-brand h1{font-size:34px;letter-spacing:-1px;font-weight:650}
.cover .hero-copy{position:absolute;left:80px;top:286px;width:520px;z-index:2}
.cover .hero-copy h2{font-size:74px;line-height:1.04;letter-spacing:-3.4px;font-weight:650;margin:0;white-space:pre-line}
.cover .hero-copy p{font-size:24px;line-height:1.5;color:#6b625f;margin:28px 0 0;max-width:430px}
.cover .frame{position:absolute;left:640px;top:232px;width:880px;height:590px;border:0;border-radius:20px;overflow:hidden;transform:rotate(-3deg);box-shadow:0 2px 3px #36292908,0 20px 40px -16px #36292930,0 45px 70px -38px #36292950}
.cover .hero-meta{position:absolute;left:80px;bottom:74px;color:#8a6a6d;font-size:16px;letter-spacing:.2px}
.cover .changelog{left:966px;top:702px;width:520px;transform:rotate(2deg)}
.cover.dark{color:#efeeed}
.cover.dark:before{background:radial-gradient(ellipse,#3b2326,transparent 70%)}
.cover.dark .hero-copy p{color:#b0a8a6}
.cover.dark .hero-meta{color:#c69ba0}
.cover.dark .frame{box-shadow:0 0 0 1px #3a3331,0 30px 70px -30px #0009}
.cover.dark .mini{background:#1d1a19;color:#efeeed;box-shadow:0 0 0 1px #332d2c,0 20px 35px -18px #0009}
.cover.dark .mini .k{color:#a9a3a0}
.cover.dark .pill.grey{background:#2c2725;color:#c4bcb9}
.cover.dark .pill.amber{background:#2f2718;color:#e2bd7c}
`;

const outputs = [];
for (const theme of ['light', 'dark']) {
  const shot = shots.get(manifest.cover[theme]);
  if (!shot || shot.theme !== theme) throw new Error(`Cover requires a real ${theme} screenshot`);
  outputs.push({
    id: `cover-${theme}`,
    src: theme === 'light' ? 'readme-banner.png' : 'readme-banner-dark.png',
    width: 1600,
    height: 1000,
    title: manifest.cover.title,
    alt: `${manifest.cover.title} — ${manifest.cover.subtitle}`,
    theme,
    html: html(
      `${manifest.cover.title} cover`,
      `<style>${conceptStyles}${coverStyles}</style>` +
        `<div class="cover-brand"><img src="${icon}" alt=""><h1>${escape(manifest.cover.title)}</h1></div>` +
        `<div class="hero-copy"><h2>${escape(manifest.cover.headline)}</h2><p>${escape(manifest.cover.subtitle)}</p></div>` +
        `<div class="frame"><img src="${shot.uri}" alt="${escape(shot.alt)}"></div>` +
        renderChangeLog() +
        `<div class="hero-meta">Open source · Self-hostable</div>`,
      theme === 'dark' ? '#171312' : '#f4efee',
      `cover ${theme}`,
    ),
  });
}

for (const feature of manifest.features) {
  for (const source of feature.sources) {
    if (!existsSync(local(source))) throw new Error(`Missing feature source: ${source}`);
  }
  outputs.push({
    id: feature.id,
    src: `previews/${feature.id}.png`,
    width: 1600,
    height: 1000,
    title: feature.title,
    alt: feature.alt,
    theme: 'light',
    html: html(
      feature.title,
      `<style>${conceptStyles}${conceptLayout}</style>` +
        `<div class="brand"><img src="${icon}" alt="">OpenShifts</div>` +
        `<div class="eyebrow">${escape(feature.eyebrow)}</div>` +
        `<div class="copy"><h1>${escape(feature.title)}</h1><p>${escape(feature.subtitle)}</p></div>` +
        renderConcept(feature.id),
      feature.background,
      `concept ${feature.id}`,
    ),
  });
}

const [command = 'build', id, source] = process.argv.slice(2);
if (command === 'build') {
  mkdirSync(build, { recursive: true });
  for (const output of outputs) writeFileSync(resolve(build, `${output.id}.html`), output.html);
  const cards = outputs
    .map(o => `<a href="${o.id}.html"><iframe src="${o.id}.html" title="${escape(o.title)}" width="1600" height="1000" tabindex="-1"></iframe><span>${escape(o.id)}</span></a>`)
    .join('');
  writeFileSync(
    resolve(build, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Preview review</title><style>body{margin:24px;background:#ddd;font:16px system-ui;display:grid;grid-template-columns:repeat(2,640px);gap:24px}a{height:430px;position:relative;color:#111}iframe{border:0;transform:scale(.4);transform-origin:top left;pointer-events:none}span{position:absolute;top:407px;left:0}</style>${cards}</html>`,
  );
  console.log(`Built ${outputs.length} compositions in .preview-build. Serve it, capture each at 1600×1000 with TaskWindow, then: node scripts/build-previews.mjs import <id> <saved-png>`);
} else if (command === 'import') {
  const output = outputs.find(o => o.id === id);
  if (!output || !source) throw new Error('Usage: import <output id> <TaskWindow PNG path>');
  if (readFileSync(resolve(build, `${id}.html`), 'utf8') !== output.html) throw new Error('Composition changed. Rebuild and recapture before importing.');
  const actual = png(resolve(source));
  if (actual.width !== output.width || actual.height !== output.height) throw new Error(`Expected ${output.width}×${output.height}; got ${actual.width}×${actual.height}`);
  mkdirSync(dirname(local(output.src)), { recursive: true });
  copyFileSync(resolve(source), local(output.src));
  const receiptPath = local('previews/receipts.json');
  const receipts = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : {};
  receipts[id] = { composition: sha(output.html), png: sha(actual.bytes) };
  writeFileSync(receiptPath, JSON.stringify(receipts, null, 2) + '\n');
  console.log(`Saved ${output.src}`);
} else if (command === 'check' || command === 'export') {
  const receipts = JSON.parse(readFileSync(local('previews/receipts.json'), 'utf8'));
  for (const output of outputs) {
    const actual = png(local(output.src));
    if (
      actual.width !== output.width ||
      actual.height !== output.height ||
      receipts[output.id]?.composition !== sha(output.html) ||
      receipts[output.id]?.png !== sha(actual.bytes)
    ) {
      throw new Error(`Stale output: ${output.id}. Rebuild and capture again.`);
    }
  }
  const catalogue = new Map(outputs.filter(entry => manifest.features.some(feature => feature.id === entry.id)).map(entry => [entry.id, entry]));
  const images = manifest.carousel.map(entryId => {
    const entry = catalogue.get(entryId);
    if (!entry) throw new Error(`Unknown carousel image: ${entryId}`);
    return { src: entry.src, alt: entry.alt, caption: entry.title.replaceAll('\n', ' '), width: entry.width, height: entry.height };
  });
  if (command === 'export') {
    // The website's AppImage[] contract. These paths are repo-relative: prefix
    // them when copying assets, or resolve against a pinned commit URL.
    writeFileSync(local('previews/website-gallery.json'), JSON.stringify(images, null, 2) + '\n');
  } else if (readFileSync(local('previews/website-gallery.json'), 'utf8') !== JSON.stringify(images, null, 2) + '\n') {
    throw new Error('Stale website gallery. Run previews:export.');
  }
  console.log(`${shots.size} source screenshots and ${outputs.length} compositions verified; ${images.length} carousel images.`);
} else throw new Error('Expected build, import, check or export');
