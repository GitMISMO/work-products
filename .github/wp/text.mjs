/* plain-text summary from the website's HTML description: the first one or two sentences */
export const ent = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&ndash;': '–', '&mdash;': '—', '&reg;': '®', '&trade;': '™', '&lt;': '<', '&gt;': '>' };
export const text = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, m => ent[m] || ' ').replace(/\s+/g, ' ').trim();
/* a sentence ends at . ! or ? followed by a space or the end, never inside 3.6.3, v3.5 or 3.x (Nov 18 fix) */
export const summary = h => { const t = text(h); const s = t.match(/(?:[^.!?]|[.!?](?=\S))+[.!?]+(?=\s|$)/g) || [t]; let out = s.slice(0, 2).join('').trim(); if (out.length > 420) out = (s[0] || t).trim().slice(0, 420); return out; };
