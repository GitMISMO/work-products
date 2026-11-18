/* Builds catalog.json (what the website reads) from data/products.json. Run on every change. */
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const products = (d.products || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
for (const p of products) if (p.membersOnly) p.files = [];   /* members-only products are listed, never with public files */
const prev = fs.existsSync('catalog.json') ? JSON.parse(fs.readFileSync('catalog.json', 'utf8')) : null;
if (prev && JSON.stringify(prev.products) === JSON.stringify(products)) { console.log('No change'); process.exit(0); }
fs.writeFileSync('catalog.json', JSON.stringify({ updated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), source: 'MISMO Manufacturing System', count: products.length, products }, null, 2));
console.log('catalog.json:', products.length, 'products');
