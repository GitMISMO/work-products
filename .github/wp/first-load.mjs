/* First load of the MISMO work products (Nov 18, 2026).
   Reads the website's current list (window.MISMO_CATALOG), copies every non-members-only file to files/<id>/<file>,
   and writes data/products.json (the list the MMS keeps from now on), catalog.json (what the website reads)
   and report.json (counts, files over 100 MB, missing files). Ids and titles are kept exactly as they are. */
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const SRC = process.env.SRC_BASE || 'https://higherlogicdownload.s3.amazonaws.com/MISMO/b0af7660-1193-44cf-ad90-4073559f7527/UploadedImages/Standards_Downloads/';
const CAT = process.env.CATALOG_URL || SRC + 'mm-catalog-c04028a0b1.js';
const PUB = 'https://resources.mismo.org/work-products/files/';
const MAX = 100 * 1024 * 1024;
const js = await (await fetch(CAT)).text();
const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(js, ctx);
const C = ctx.window.MISMO_CATALOG; if (!C || !C.P) throw new Error('No MISMO_CATALOG in ' + CAT);
import { summary } from './text.mjs';
const products = [], big = [], missing = [], noFiles = [];
for (const [id, p] of Object.entries(C.P)) {
  const files = [];
  if (!p.only) for (const f of (p.fs || [])) {
    const dest = path.join('files', id, f.f);
    let bytes = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    if (!bytes) {
      const r = await fetch(SRC + encodeURIComponent(f.f));
      if (!r.ok) { missing.push({ id, file: f.f, status: r.status }); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX) { big.push({ id, file: f.f, mb: +(buf.length / 1048576).toFixed(1) }); continue; }
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); bytes = buf.length;
    }
    files.push({ name: f.n, file: f.f, url: PUB + encodeURIComponent(id) + '/' + encodeURIComponent(f.f), bytes });
  }
  if (!p.only && !files.length) noFiles.push(id);
  const o = { id, title: p.t, summary: summary((C.D || {})[id]), category: null, version: null, status: null, published: null,
    license: p.l || null, membersOnly: !!p.only, libraryUrl: p.m ? 'https://www.mismo.org/viewdocument/' + p.m : null,
    externalUrl: (p.ext && p.ext.u) || null, purchaseUrl: (p.buy && p.buy.u) || null, files, aliases: p.a || [] };
  if (p.ext) { o.externalLabel = p.ext.label || ''; o.externalText = p.ext.text || ''; }
  if (p.buy && p.buy.p) o.price = p.buy.p;
  products.push(o);
}
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/products.json', JSON.stringify({ source: 'MISMO Manufacturing System', loadedFrom: CAT, products }, null, 2));
fs.writeFileSync('report.json', JSON.stringify({ at: new Date().toISOString(), products: products.length, membersOnly: products.filter(p => p.membersOnly).length,
  files: products.reduce((n, p) => n + p.files.length, 0), bytes: products.reduce((n, p) => n + p.files.reduce((m, f) => m + f.bytes, 0), 0), over100MB: big, missing, noFiles }, null, 2));
console.log('Products', products.length, '| files', products.reduce((n, p) => n + p.files.length, 0), '| over 100 MB', big.length, '| missing', missing.length, '| no files', noFiles.join(', '));
