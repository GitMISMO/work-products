/* Repair (Nov 20, 2026): checks every saved public file against data/products.json and, for any that is damaged
   (wrong size, or a zip that doesn't start with "PK" or is missing part of itself), copies it again from the
   original the first load used (the website's Standards_Downloads folder) and corrects its bytes. A copy is
   only saved when the original passes the same checks and is the full size the server reports. Same file names.
   Originals can also be put in incoming/ (same file name, whole or split as <file>.part001, .part002 …): those are
   used first and removed once saved. Writes repair-report.json: what was checked, what was fixed, and anything that couldn't be. */
import fs from 'node:fs'; import path from 'node:path'; import { checkBuf } from './filecheck.mjs';
const d = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const SRC = process.env.SRC_BASE || String(d.loadedFrom || '').replace(/[^/]*$/, '');
const IN = 'incoming', used = new Set();
function incoming(name) {   /* an original put in incoming/, whole or in numbered parts */
  if (!fs.existsSync(IN)) return null;
  const whole = path.join(IN, name); if (fs.existsSync(whole)) { used.add(whole); return fs.readFileSync(whole); }
  const parts = fs.readdirSync(IN).filter(x => x.startsWith(name + '.part')).sort(); if (!parts.length) return null;
  parts.forEach(x => used.add(path.join(IN, x))); return Buffer.concat(parts.map(x => fs.readFileSync(path.join(IN, x))));
}
const fixed = [], failed = [], checked = { files: 0, zips: 0 };
for (const p of d.products || []) {
  if (p.membersOnly) continue;
  for (const f of p.files || []) {
    const dest = path.join('files', p.id, f.file); checked.files++; if (/\.zip$/i.test(f.file)) checked.zips++;
    const saved = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
    const problem = saved ? checkBuf(saved, f.file, f.bytes) || checkBuf(saved, f.file) : 'is not saved';
    if (!problem) continue;
    const row = { id: p.id, file: f.file, problem, savedBytes: saved ? saved.length : 0 };
    try {
      let buf = incoming(f.file);
      if (buf) row.from = 'incoming'; else {
        const r = await fetch(SRC + encodeURIComponent(f.file));
        if (!r.ok) throw new Error('the original could not be read (' + r.status + ')');
        buf = Buffer.from(await r.arrayBuffer()); const len = Number(r.headers.get('content-length') || buf.length);
        if (buf.length !== len) throw new Error(`the original arrived incomplete (${buf.length} of ${len} bytes)`);
      }
      const op = checkBuf(buf, f.file); if (op) throw new Error('the original ' + op);
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
      const back = fs.readFileSync(dest); if (back.length !== buf.length || checkBuf(back, f.file, buf.length)) throw new Error('the saved copy did not match the original');
      f.bytes = buf.length; fixed.push({ ...row, bytes: buf.length });
    } catch (e) { failed.push({ ...row, why: String(e.message || e) }); }
  }
}
for (const x of fixed) if (x.from === 'incoming') for (const u of [...used]) if (path.basename(u).startsWith(x.file)) fs.rmSync(u, { force: true });
if (fs.existsSync(IN) && !fs.readdirSync(IN).filter(x => x !== '.keep').length) fs.rmSync(IN, { recursive: true, force: true });
if (fixed.length) fs.writeFileSync('data/products.json', JSON.stringify(d, null, 2));
fs.writeFileSync('repair-report.json', JSON.stringify({ at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), source: SRC, checked, fixed, failed }, null, 2));
console.log(`Checked ${checked.files} files (${checked.zips} zips). Fixed ${fixed.length}. Could not fix ${failed.length}.`);
for (const x of fixed) console.log('Fixed', x.id + '/' + x.file, x.savedBytes, '->', x.bytes);
for (const x of failed) console.log('NOT fixed', x.id + '/' + x.file, x.problem, '|', x.why);
