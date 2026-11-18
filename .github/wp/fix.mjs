/* Fixes to data/products.json, run by hand from the Work Products workflow.
   SUMMARIES=1  rebuilds the summaries of the products that came from the website's first load (not ones the MMS
                published) from their full descriptions, with the Nov 18 sentence fix.
   PATCH='{"<id>":{"field":value}}'  changes fields of listed products (ids never change). */
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { summary } from './text.mjs';
const d = JSON.parse(fs.readFileSync('data/products.json', 'utf8')); const L = d.products || []; let n = 0;
if (process.env.SUMMARIES === '1' || process.env.SUMMARIES === 'true') {
  const js = await (await fetch(d.loadedFrom)).text(); const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(js, ctx);
  const D = ctx.window.MISMO_CATALOG.D || {};
  for (const p of L) { if (p.ticket || !D[p.id]) continue; const s = summary(D[p.id]); if (s && s !== p.summary) { p.summary = s; n++; } }
  console.log('Summaries rebuilt:', n);
}
const P = (process.env.PATCH || '').trim();
/* "_add": true adds a new product; "files": [{name, file, from?}] sets its files: "from" copies a file already here
   (e.g. files/<other-id>/<file>) into files/<id>/<file>; size and address are filled in. */
const PUB = 'https://resources.mismo.org/work-products/files/';
if (P) { const ch = JSON.parse(P); for (const [id, f] of Object.entries(ch)) {
  let p = L.find(x => x.id === id);
  if (!p && f._add) { p = { id, title: '', summary: '', category: null, version: null, status: null, published: null, license: null, membersOnly: false, libraryUrl: null, externalUrl: null, purchaseUrl: null, files: [], aliases: [] }; L.push(p); }
  if (!p) { console.log('No product', id); process.exitCode = 1; continue; }
  delete f.id; delete f._add;
  if (Array.isArray(f.files)) { f.files = f.files.map(x => { const dest = path.join('files', id, x.file);
    if (x.from && !fs.existsSync(dest)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(x.from, dest); }
    if (!fs.existsSync(dest)) throw new Error('No file ' + dest);
    return { name: x.name, file: x.file, url: PUB + encodeURIComponent(id) + '/' + encodeURIComponent(x.file), bytes: fs.statSync(dest).size }; }); }
  Object.assign(p, f); n++; console.log('Changed', id, Object.keys(f).join(', ')); } }
fs.writeFileSync('data/products.json', JSON.stringify(d, null, 2));
