/* Jimmy — the jobs. Everything runs on the device. No uploads, no model. */
(function () {
'use strict';

class JobError extends Error {
  constructor(kind, msg, data) { super(msg || kind); this.name = 'JobError'; this.kind = kind; this.data = data || {}; }
}

const ext = n => { const m = /\.([a-z0-9]+)$/i.exec(n || ''); return m ? m[1].toLowerCase() : ''; };
const base = n => (n || 'file').replace(/\.[^.]+$/, '');
const pad = (n, w) => String(n).padStart(w || 2, '0');
const ymd = d => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const clean = n => String(n || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'file';

const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'log', 'html', 'htm']);
const SHEET_EXT = new Set(['xlsx', 'xls', 'ods', 'csv', 'tsv']);
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'svg', 'tif', 'tiff']);

async function sniff(file) {
  const h = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) return 'pdf';
  if (h[0] === 0x50 && h[1] === 0x4b) return 'zip';
  if (h[0] === 0xff && h[1] === 0xd8) return 'jpg';
  if (h[0] === 0x89 && h[1] === 0x50) return 'png';
  return '';
}

function needFiles(files, min) {
  if (!files || !files.length) throw new JobError('notray');
  if (min && files.length < min) throw new JobError('toofew', 'need ' + min, { have: files.length });
}

function blobOf(data, type) { return new Blob([data], { type: type || 'application/octet-stream' }); }

/* ---------- PDF reading (pdf.js) ---------- */
async function openPdf(file) {
  if (!file.size) throw new JobError('empty', file.name, { name: file.name });
  if ((await sniff(file)) !== 'pdf') throw new JobError('corrupt', file.name, { name: file.name });
  const buf = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new JobError('locked', file.name, { name: file.name });
    throw new JobError('corrupt', file.name, { name: file.name });
  }
}

async function pdfRows(doc, p) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const items = [];
  for (const i of tc.items) {
    if (!i.str || !i.str.trim()) continue;
    const h = Math.abs(i.height) || Math.abs(i.transform[3]) || 10;
    items.push({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h });
  }
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of items) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(r.y - it.y) <= Math.max(2, it.h * 0.45)) r.items.push(it);
    else rows.push({ y: it.y, h: it.h, items: [it] });
  }
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const it of r.items) {
      const c = cells[cells.length - 1];
      const gap = c ? it.x - c.x2 : 0;
      if (c && gap < 1.1 * r.h) {
        c.t += (gap > 0.12 * r.h ? ' ' : '') + it.s;
        c.x2 = Math.max(c.x2, it.x + it.w);
      } else cells.push({ x: it.x, x2: it.x + it.w, t: it.s });
    }
    r.cells = cells;
  }
  return rows;
}

function rowsToText(rows) {
  let out = '', prev = null;
  for (const r of rows) {
    if (prev && prev.y - r.y > 1.7 * r.h) out += '\n';
    out += r.cells.map(c => c.t).join('\t') + '\n';
    prev = r;
  }
  return out;
}

/* ---------- table finding ---------- */
function buildGrid(run) {
  const iv = [];
  run.forEach(r => r.cells.forEach(c => iv.push([c.x, c.x2])));
  iv.sort((a, b) => a[0] - b[0]);
  const cols = [];
  for (const [a, b] of iv) {
    const l = cols[cols.length - 1];
    if (l && a <= l[1] + 1) l[1] = Math.max(l[1], b); else cols.push([a, b]);
  }
  const grid = run.map(r => {
    const row = new Array(cols.length).fill('');
    for (const c of r.cells) {
      const k = cols.findIndex(col => c.x2 >= col[0] - 1 && c.x <= col[1] + 1);
      if (k >= 0) row[k] = row[k] ? row[k] + ' ' + c.t : c.t;
    }
    return row;
  });
  const keep = cols.map((_, k) => grid.some(r => r[k] !== ''));
  const g2 = grid.map(r => r.filter((_, k) => keep[k]));
  const cells = g2.reduce((n, r) => n + r.length, 0);
  const filled = g2.reduce((n, r) => n + r.filter(Boolean).length, 0);
  if (!cells || filled / cells < 0.55 || (g2[0] || []).length < 2) return null;
  return g2;
}

function findTables(rows) {
  const out = []; let run = [];
  const flush = () => { if (run.length >= 3) { const g = buildGrid(run); if (g) out.push(g); } run = []; };
  for (const r of rows) { if (r.cells.length >= 2) run.push(r); else flush(); }
  flush();
  return out;
}

const NUM = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;
function typed(grid) { return grid.map(r => r.map(v => (typeof v === 'string' && NUM.test(v.trim())) ? Number(v.trim()) : v)); }

/* ---------- readers per file type ---------- */
async function readTextOf(file, o) {
  const e = ext(file.name);
  if (!file.size) throw new JobError('empty', file.name, { name: file.name });
  const kind = await sniff(file);
  if (e === 'pdf' || kind === 'pdf') {
    const doc = await openPdf(file);
    let text = '', chars = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const t = rowsToText(await pdfRows(doc, p));
      chars += t.replace(/\s/g, '').length;
      text += (doc.numPages > 1 ? '[page ' + p + ']\n' : '') + t + '\n';
    }
    if (chars < 10) throw new JobError('scan', file.name, { name: file.name, pages: doc.numPages });
    return { text: text.trim() + '\n', pages: doc.numPages };
  }
  if (e === 'docx') {
    if (kind !== 'zip') throw new JobError('corrupt', file.name, { name: file.name });
    try {
      const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      if (!r.value.trim()) throw new JobError('empty', file.name, { name: file.name });
      return { text: r.value.trim() + '\n' };
    } catch (err) { if (err instanceof JobError) throw err; throw new JobError('corrupt', file.name, { name: file.name }); }
  }
  if (e === 'xlsx' || e === 'xls' || e === 'ods') {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      let text = '';
      wb.SheetNames.forEach(n => { text += '[sheet ' + n + ']\n' + XLSX.utils.sheet_to_csv(wb.Sheets[n]) + '\n'; });
      return { text };
    } catch (err) { throw new JobError('corrupt', file.name, { name: file.name }); }
  }
  if (e === 'html' || e === 'htm') {
    const d = new DOMParser().parseFromString(await file.text(), 'text/html');
    d.querySelectorAll('script,style').forEach(n => n.remove());
    return { text: (d.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim() + '\n' };
  }
  if (TEXT_EXT.has(e)) return { text: await file.text() };
  if (IMG_EXT.has(e)) throw new JobError('ocr', file.name, { name: file.name });
  throw new JobError('badtype', file.name, { name: file.name, ext: e || '?' });
}

/* ---------- JOB: extract ---------- */
async function extract(files, o) {
  needFiles(files);
  const outputs = []; const used = new Set(); let pages = 0;
  for (const f of files) {
    const r = await readTextOf(f, o);
    pages += r.pages || 0;
    let n = clean(base(f.name)) + '.txt', k = 2;
    while (used.has(n)) n = clean(base(f.name)) + '-' + (k++) + '.txt';
    used.add(n);
    outputs.push({ name: n, blob: blobOf(r.text, 'text/plain;charset=utf-8') });
  }
  const words = outputs.length;
  return { outputs, pages, summary: words + ' text file' + (words > 1 ? 's' : '') + (pages ? ', ' + pages + ' page' + (pages > 1 ? 's' : '') : ''), stats: { files: files.length, pages } };
}

/* ---------- JOB: tables ---------- */
async function tables(files, o) {
  needFiles(files);
  const fmt = (o && o.format) || 'xlsx';
  const found = []; // {label, grid}
  for (const f of files) {
    const e = ext(f.name);
    if (!f.size) throw new JobError('empty', f.name, { name: f.name });
    const kind = await sniff(f);
    const tag = clean(base(f.name)).slice(0, 14);
    if (e === 'pdf' || kind === 'pdf') {
      const doc = await openPdf(f);
      let chars = 0;
      for (let p = 1; p <= doc.numPages; p++) {
        const rows = await pdfRows(doc, p);
        chars += rows.reduce((n, r) => n + r.cells.length, 0);
        findTables(rows).forEach((g, i) => found.push({ label: tag + '_p' + p + '_t' + (i + 1), grid: g }));
      }
      if (chars === 0) throw new JobError('scan', f.name, { name: f.name });
    } else if (e === 'docx') {
      try {
        const r = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
        const d = new DOMParser().parseFromString(r.value, 'text/html');
        d.querySelectorAll('table').forEach((t, i) => {
          const g = [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.textContent.trim()));
          if (g.length) found.push({ label: tag + '_t' + (i + 1), grid: g });
        });
      } catch (err) { throw new JobError('corrupt', f.name, { name: f.name }); }
    } else if (SHEET_EXT.has(e) || e === 'ods') {
      try {
        const wb = e === 'csv' || e === 'tsv' ? XLSX.read(await f.text(), { type: 'string' }) : XLSX.read(await f.arrayBuffer(), { type: 'array' });
        wb.SheetNames.forEach((n, i) => {
          const g = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
          if (g.length) found.push({ label: tag + '_' + n, grid: g });
        });
      } catch (err) { throw new JobError('corrupt', f.name, { name: f.name }); }
    } else if (IMG_EXT.has(e)) throw new JobError('ocr', f.name, { name: f.name });
    else throw new JobError('badtype', f.name, { name: f.name, ext: e || '?' });
  }
  if (!found.length) throw new JobError('notables', '', { files: files.length });
  const stamp = ymd();
  const first = clean(base(files[0].name));
  const stem = files.length === 1 ? first + '_tables' : 'jimmy_tables_' + stamp;
  const names = new Set(); const uniq = l => { let n = l.slice(0, 31), k = 2; while (names.has(n.toLowerCase())) { n = l.slice(0, 28) + '_' + (k++); } names.add(n.toLowerCase()); return n; };
  let outputs;
  if (fmt === 'csv') {
    outputs = found.map(t => {
      const ws = XLSX.utils.aoa_to_sheet(t.grid);
      return { name: clean(t.label) + '.csv', blob: blobOf('﻿' + XLSX.utils.sheet_to_csv(ws), 'text/csv;charset=utf-8') };
    });
  } else {
    const wb = XLSX.utils.book_new();
    found.forEach(t => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(typed(t.grid)), uniq(t.label)));
    const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    outputs = [{ name: stem + '.xlsx', blob: blobOf(arr, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') }];
  }
  const rowsN = found.reduce((n, t) => n + t.grid.length, 0);
  return { outputs, summary: found.length + ' table' + (found.length > 1 ? 's' : '') + ', ' + rowsN + ' rows', stats: { tables: found.length, rows: rowsN } };
}

/* ---------- JOB: merge ---------- */
const A4 = [595.28, 841.89];
async function merge(files, o) {
  needFiles(files, 2);
  const { PDFDocument } = PDFLib;
  const out = await PDFDocument.create();
  let pages = 0;
  for (const f of files) {
    const e = ext(f.name);
    if (!f.size) throw new JobError('empty', f.name, { name: f.name });
    const kind = await sniff(f);
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (e === 'pdf' || kind === 'pdf') {
      if (kind !== 'pdf') throw new JobError('corrupt', f.name, { name: f.name });
      let src;
      try { src = await PDFDocument.load(bytes); }
      catch (err) { throw new JobError(/ncrypt/.test(String(err && err.name) + String(err && err.message)) ? 'locked' : 'corrupt', f.name, { name: f.name }); }
      const idx = src.getPageIndices();
      (await out.copyPages(src, idx)).forEach(p => out.addPage(p));
      pages += idx.length;
    } else if (kind === 'jpg' || kind === 'png') {
      const img = kind === 'jpg' ? await out.embedJpg(bytes) : await out.embedPng(bytes);
      const m = 28, s = Math.min((A4[0] - 2 * m) / img.width, (A4[1] - 2 * m) / img.height, 1);
      const w = img.width * s, h = img.height * s;
      const pg = out.addPage(A4);
      pg.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
      pages++;
    } else throw new JobError('badtype', f.name, { name: f.name, ext: e || '?' });
  }
  const data = await out.save();
  const name = 'merged_' + ymd() + '.pdf';
  return { outputs: [{ name, blob: blobOf(data, 'application/pdf') }], pages, summary: files.length + ' files into ' + pages + ' pages', stats: { files: files.length, pages } };
}

/* ---------- JOB: split ---------- */
function parseRange(str, n) {
  const set = [];
  for (const part of String(str).split(',')) {
    const m = /^\s*(\d+)\s*(?:[-–]|to)\s*(\d+)\s*$/i.exec(part) || /^\s*(\d+)\s*$/.exec(part);
    if (!m) throw new JobError('badrange', str, { range: str, n });
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b < a || b > n) throw new JobError('badrange', str, { range: str.trim(), n });
    for (let i = a; i <= b; i++) set.push(i - 1);
  }
  return set;
}
async function split(files, o) {
  needFiles(files);
  const { PDFDocument } = PDFLib;
  const outputs = []; let pagesOut = 0;
  for (const f of files) {
    const e = ext(f.name);
    if (!f.size) throw new JobError('empty', f.name, { name: f.name });
    const kind = await sniff(f);
    if (kind !== 'pdf') throw new JobError(e === 'pdf' ? 'corrupt' : 'badtype', f.name, { name: f.name, ext: e || '?' });
    let src;
    try { src = await PDFDocument.load(new Uint8Array(await f.arrayBuffer())); }
    catch (err) { throw new JobError(/ncrypt/.test(String(err && err.name) + String(err && err.message)) ? 'locked' : 'corrupt', f.name, { name: f.name }); }
    const n = src.getPageCount();
    const rng = o && o.range && o.range.trim();
    const stem = clean(base(f.name));
    if (rng && !/^(each|every|all)$/i.test(rng)) {
      const idx = parseRange(rng, n);
      const d = await PDFDocument.create();
      (await d.copyPages(src, idx)).forEach(p => d.addPage(p));
      outputs.push({ name: stem + '_pages_' + rng.replace(/\s+/g, '').replace(/,/g, '_') + '.pdf', blob: blobOf(await d.save(), 'application/pdf') });
      pagesOut += idx.length;
    } else {
      if (n < 2) throw new JobError('onepage', f.name, { name: f.name });
      for (let i = 0; i < n; i++) {
        const d = await PDFDocument.create();
        const [p] = await d.copyPages(src, [i]); d.addPage(p);
        outputs.push({ name: stem + '_p' + pad(i + 1, String(n).length < 2 ? 2 : String(n).length) + '.pdf', blob: blobOf(await d.save(), 'application/pdf') });
      }
      pagesOut += n;
    }
  }
  return { outputs, pages: pagesOut, summary: outputs.length + ' PDF' + (outputs.length > 1 ? 's' : '') + ', ' + pagesOut + ' page' + (pagesOut > 1 ? 's' : ''), stats: { files: outputs.length, pages: pagesOut } };
}

/* ---------- JOB: sort (+ duplicate hunt) ---------- */
const CATS = [
  ['PDFs', ['pdf']],
  ['Documents', ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages']],
  ['Spreadsheets', ['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers']],
  ['Presentations', ['ppt', 'pptx', 'odp', 'key']],
  ['Images', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'svg', 'tif', 'tiff']],
  ['Audio', ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg']],
  ['Video', ['mp4', 'mov', 'mkv', 'avi', 'webm']],
  ['Archives', ['zip', 'rar', '7z', 'tar', 'gz']]
];
const catOf = e => { for (const [n, l] of CATS) if (l.includes(e)) return n; return 'Other'; };
async function sha(buf) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sort(files, o) {
  needFiles(files);
  const zip = new JSZip();
  const seen = new Map(); const taken = new Set(); const rows = [['new_path', 'original_name', 'size_bytes', 'modified', 'sha256_short', 'duplicate_of']];
  let dups = 0; const catCount = {};
  const uniquePath = p => { let q = p, k = 2; while (taken.has(q.toLowerCase())) { const i = p.lastIndexOf('.'); q = i > p.lastIndexOf('/') ? p.slice(0, i) + '-' + k + p.slice(i) : p + '-' + k; k++; } taken.add(q.toLowerCase()); return q; };
  for (const f of files) {
    const buf = await f.arrayBuffer();
    const hash = await sha(buf);
    const e = ext(f.name);
    const d = new Date(f.lastModified || Date.now());
    const nice = ymd(d) + '_' + clean(f.name);
    let folder = catOf(e), dupOf = '';
    if (seen.has(hash)) { folder = '_Duplicates'; dupOf = seen.get(hash); dups++; }
    else { seen.set(hash, null); }
    const path = uniquePath(folder + '/' + nice);
    if (!dupOf) seen.set(hash, path);
    zip.file(path, buf, { date: d });
    catCount[folder] = (catCount[folder] || 0) + 1;
    rows.push([path, f.name, f.size, d.toISOString(), hash.slice(0, 12), dupOf]);
  }
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\n');
  zip.file('_index.csv', '﻿' + csv);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
  const folders = Object.keys(catCount).length;
  return { outputs: [{ name: 'sorted_' + ymd() + '.zip', blob }], summary: files.length + ' files into ' + folders + ' folder' + (folders > 1 ? 's' : '') + (dups ? ', ' + dups + ' duplicate' + (dups > 1 ? 's' : '') + ' flagged' : ''), stats: { files: files.length, folders, dups }, packed: true };
}

/* ---------- JOB: invoice / quote ---------- */
const wa = s => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
const money = n => 'R' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function wrap(font, text, size, maxW) {
  const out = [];
  for (const para of wa(text).split(/\r?\n/)) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (line && font.widthOfTextAtSize(t, size) > maxW) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}
async function invoice(files, o) {
  const d = o && o.data;
  if (!d) throw new JobError('noinvoice');
  const items = (d.items || []).filter(i => i && (String(i.desc || '').trim() || Number(i.price)));
  if (!items.length) throw new JobError('noitems');
  if (!String(d.client || '').trim()) throw new JobError('noclient');
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const F = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12), grey = rgb(0.42, 0.42, 0.45), line = rgb(0.82, 0.82, 0.85), accent = rgb(0.1, 0.2, 0.38), band = rgb(0.94, 0.95, 0.97);
  const M = 48, W = A4[0], R = W - M;
  let page = doc.addPage(A4), y = A4[1] - M;
  const txt = (t, x, yy, size, font, color, align) => {
    t = wa(t); const w = (font || F).widthOfTextAtSize(t, size);
    page.drawText(t, { x: align === 'r' ? x - w : x, y: yy, size, font: font || F, color: color || ink });
  };
  const co = d.company || {};
  txt(co.name || 'Your Company', M, y - 14, 17, B, accent);
  let ly = y - 30;
  [co.address, co.regNo ? 'Reg: ' + co.regNo : '', co.vatNo ? 'VAT: ' + co.vatNo : '', [co.email, co.phone].filter(Boolean).join('  |  ')].filter(Boolean).forEach(l => {
    wrap(F, l, 9, 260).forEach(w => { txt(w, M, ly, 9, F, grey); ly -= 12; });
  });
  const title = d.kind === 'quote' ? 'QUOTATION' : (d.vat ? 'TAX INVOICE' : 'INVOICE');
  txt(title, R, y - 16, 22, B, ink, 'r');
  txt('No. ' + d.number, R, y - 36, 11, B, ink, 'r');
  txt('Date: ' + d.date, R, y - 51, 10, F, grey, 'r');
  txt((d.kind === 'quote' ? 'Valid until: ' : 'Due: ') + d.due, R, y - 64, 10, F, grey, 'r');
  if (d.ref) txt('Ref: ' + d.ref, R, y - 77, 10, F, grey, 'r');
  y = Math.min(ly, y - 90) - 14;
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1.2, color: accent });
  y -= 22;
  txt(d.kind === 'quote' ? 'QUOTED TO' : 'BILL TO', M, y, 8.5, B, grey);
  y -= 14;
  txt(d.client, M, y, 12, B);
  y -= 14;
  wrap(F, d.clientAddress || '', 10, 300).filter(Boolean).forEach(l => { txt(l, M, y, 10, F, grey); y -= 13; });
  y -= 14;
  const cQ = R - 200, cP = R - 110, cA = R;
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: R - M, height: 22, color: band });
    txt('DESCRIPTION', M + 8, y, 8.5, B, grey); txt('QTY', cQ, y, 8.5, B, grey, 'r'); txt('UNIT PRICE', cP, y, 8.5, B, grey, 'r'); txt('AMOUNT', cA - 8, y, 8.5, B, grey, 'r');
    y -= 24;
  };
  header();
  let sub = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 1, price = Number(it.price) || 0, amt = qty * price; sub += amt;
    const lines = wrap(F, it.desc || '-', 10, cQ - M - 50);
    const need = lines.length * 13 + 10;
    if (y - need < 150) { page = doc.addPage(A4); y = A4[1] - M; header(); }
    lines.forEach((l, i) => txt(l, M + 8, y - i * 13, 10));
    txt(String(qty), cQ, y, 10, F, ink, 'r'); txt(money(price), cP, y, 10, F, ink, 'r'); txt(money(amt), cA - 8, y, 10, F, ink, 'r');
    y -= need - 2;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 0.5, color: line });
  }
  if (y < 190) { page = doc.addPage(A4); y = A4[1] - M; }
  y -= 8;
  const vat = d.vat ? Math.round(sub * 15) / 100 : 0, total = sub + vat;
  const tx = R - 8, lx = R - 150;
  if (d.vat) { txt('Subtotal', lx, y, 10, F, grey); txt(money(sub), tx, y, 10, F, ink, 'r'); y -= 15; txt('VAT 15%', lx, y, 10, F, grey); txt(money(vat), tx, y, 10, F, ink, 'r'); y -= 8; }
  page.drawRectangle({ x: lx - 10, y: y - 14, width: R - lx + 10, height: 26, color: accent });
  txt('TOTAL', lx, y - 5, 11, B, rgb(1, 1, 1)); txt(money(total), tx, y - 5, 12, B, rgb(1, 1, 1), 'r');
  y -= 46;
  if (co.bank && co.bank.trim() && d.kind !== 'quote') {
    if (y < 120) { page = doc.addPage(A4); y = A4[1] - M; }
    txt('PAYMENT DETAILS', M, y, 8.5, B, grey); y -= 14;
    wrap(F, co.bank, 10, 320).forEach(l => { txt(l, M, y, 10); y -= 13; }); y -= 8;
  }
  if (d.notes && d.notes.trim()) {
    if (y < 90) { page = doc.addPage(A4); y = A4[1] - M; }
    txt('NOTES', M, y, 8.5, B, grey); y -= 14;
    wrap(F, d.notes, 10, R - M).forEach(l => { txt(l, M, y, 10, F, grey); y -= 13; });
  }
  const data = await doc.save();
  return { outputs: [{ name: clean(d.number) + '_' + clean(d.client).slice(0, 24).replace(/\s+/g, '-') + '.pdf', blob: blobOf(data, 'application/pdf') }], summary: (d.kind === 'quote' ? 'Quote ' : 'Invoice ') + d.number + ' for ' + money(total), stats: { total, sub, vat }, meta: { number: d.number, client: d.client, total, vat, date: d.date, kind: d.kind || 'invoice' } };
}

/* ---------- run + packaging ---------- */
const JOBS = { extract, tables, merge, split, sort, invoice };
async function run(job, files, opts) {
  if (!JOBS[job]) throw new JobError('unknown', job);
  const r = await JOBS[job](files, opts || {});
  let blob, name;
  if (r.outputs.length === 1) { blob = r.outputs[0].blob; name = r.outputs[0].name; }
  else {
    const z = new JSZip();
    const used = new Set();
    r.outputs.forEach(o => { let n = o.name, k = 2; while (used.has(n)) n = k++ + '_' + o.name; used.add(n); z.file(n, o.blob); });
    blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
    name = 'jimmy_' + job + '_' + ymd() + '.zip';
  }
  return Object.assign(r, { blob, name, job, size: blob.size, ext: (ext(name) || 'file').toUpperCase() });
}

window.JimmyJobs = { run, JobError, ext, base, ymd, money, parseRange };
})();
