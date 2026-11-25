/* Repair (Nov 20, 2026): checks every saved public file against data/products.json and, for any that is damaged
   (wrong size, or a zip that doesn't start with "PK" or is missing part of itself), copies it again from the
   original the first load used (the website's Standards_Downloads folder) and corrects its bytes. A copy is
   only saved when the original passes the same checks and is the full size the server reports. Same file names.
   Originals can also be put in incoming/ (same file name, whole or split as <file>.part001, .part002 …): those are
   used first and removed once saved. Big comment-period files arrive in incoming/comment/<WR>/ (below). Writes repair-report.json: what was checked, what was fixed, and anything that couldn't be. */
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
/* comment-period files the MMS Robot saved in parts (Nov 25, 2026, Erin's Reference Model artifacts, up to 95 MB each):
   incoming/comment/<WR>/<file>.part001, .part002 … and <file>.bytes with the full size, written last. Joined, checked
   against that size (and, for a zip, its directory), saved as comment/<WR>/<file>, and the parts removed once saved. */
const comments = [], CIN = path.join(IN, 'comment'), SAFE = /^[A-Za-z0-9_.-]+$/;
if (fs.existsSync(CIN)) for (const wr of fs.readdirSync(CIN)) {
  const dir = path.join(CIN, wr); if (!SAFE.test(wr) || !fs.statSync(dir).isDirectory()) continue;
  for (const b of fs.readdirSync(dir).filter(x => x.endsWith('.bytes'))) {
    const file = b.slice(0, -'.bytes'.length), want = Number(fs.readFileSync(path.join(dir, b), 'utf8').trim()), row = { wr, file, bytes: want };
    try {
      if (!SAFE.test(file) || file.includes('..')) throw new Error('not a file name the website takes');
      const parts = fs.readdirSync(dir).filter(x => x.startsWith(file + '.part')).sort(); if (!parts.length) throw new Error('no parts');
      const buf = Buffer.concat(parts.map(x => fs.readFileSync(path.join(dir, x))));
      if (buf.length !== want) { row.waiting = `${buf.length} of ${want} bytes so far`; comments.push(row); continue; }
      const bad = checkBuf(buf, file, want); if (bad) throw new Error('the joined file ' + bad);
      const dest = path.join('comment', wr, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
      const back = fs.readFileSync(dest); if (back.length !== want || checkBuf(back, file, want)) throw new Error('the saved copy did not match');
      for (const x of parts) fs.rmSync(path.join(dir, x), { force: true }); fs.rmSync(path.join(dir, b), { force: true }); row.saved = true; comments.push(row);
    } catch (e) { row.why = String(e.message || e); comments.push(row); }
  }
  if (!fs.readdirSync(dir).length) fs.rmSync(dir, { recursive: true, force: true });
}
if (fs.existsSync(CIN) && !fs.readdirSync(CIN).length) fs.rmSync(CIN, { recursive: true, force: true });
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
fs.writeFileSync('repair-report.json', JSON.stringify({ at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), source: SRC, checked, fixed, failed, comment: comments }, null, 2));
console.log(`Checked ${checked.files} files (${checked.zips} zips). Fixed ${fixed.length}. Could not fix ${failed.length}.`);
for (const x of fixed) console.log('Fixed', x.id + '/' + x.file, x.savedBytes, '->', x.bytes);
for (const x of failed) console.log('NOT fixed', x.id + '/' + x.file, x.problem, '|', x.why);
for (const x of comments) console.log('Comment file', x.wr + '/' + x.file, x.saved ? 'saved (' + x.bytes + ' bytes)' : x.waiting ? 'waiting: ' + x.waiting : 'NOT saved: ' + x.why);
