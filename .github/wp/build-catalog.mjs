/* Builds catalog.json (what the website reads) from data/products.json. Run on every change. */
import fs from 'node:fs'; import path from 'node:path'; import { checkBuf } from './filecheck.mjs';
const d = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const products = (d.products || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
for (const p of products) if (p.membersOnly) p.files = [];   /* members-only products are listed, never with public files */
/* checks on every rebuild (Nov 18): a product with public files must have a license; the MMS System Health reads checks.json */
const noLicense = products.filter(p => (p.files || []).length && !p.license).map(p => p.id);
/* every saved file must be the size listed, and every zip whole (Nov 20: 18 zips were found missing their first 5 MB) */
const badFiles = [];
for (const p of products) for (const f of p.files || []) { const fp = path.join('files', p.id, f.file);
  const pr = fs.existsSync(fp) ? checkBuf(fs.readFileSync(fp), f.file, f.bytes) : 'is not saved'; if (pr) badFiles.push({ id: p.id, file: f.file, problem: pr }); }
const checks = { at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), products: products.length, filesWithoutLicense: noLicense, badFiles };
const pc = fs.existsSync('checks.json') ? JSON.parse(fs.readFileSync('checks.json', 'utf8')) : null;
if (!pc || JSON.stringify(pc.filesWithoutLicense) !== JSON.stringify(noLicense) || pc.products !== products.length || JSON.stringify(pc.badFiles || []) !== JSON.stringify(badFiles)) fs.writeFileSync('checks.json', JSON.stringify(checks, null, 2));
if (badFiles.length) console.log('Damaged files:', badFiles.map(b => b.id + '/' + b.file + ' ' + b.problem).join('; '));
if (noLicense.length) console.log('Products with files but no license:', noLicense.join(', '));
const prev = fs.existsSync('catalog.json') ? JSON.parse(fs.readFileSync('catalog.json', 'utf8')) : null;
if (prev && JSON.stringify(prev.products) === JSON.stringify(products)) { console.log('No change'); process.exit(0); }
fs.writeFileSync('catalog.json', JSON.stringify({ updated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), source: 'MISMO Manufacturing System', count: products.length, products }, null, 2));
console.log('catalog.json:', products.length, 'products');
