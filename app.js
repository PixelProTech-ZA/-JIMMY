/* Jimmy — app glue: tray, commands, voice, invoice form, ledger, handover downloads. */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const Jobs = window.JimmyJobs, Lines = window.JimmyLines, Scene = window.JimmyScene;
const store = {
  get(k, d) { try { const v = localStorage.getItem('jimmy.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('jimmy.' + k, JSON.stringify(v)); } catch (e) {} }
};
const state = { files: [], outs: [], streak: 0, jobs: 0, last: 0, office: store.get('office', false), fast: store.get('fast', false), voice: store.get('voice', false) };
const DEFAULTS = { name: 'PixelProTech Solutions (Pty) Ltd', address: 'Centurion, Gauteng', regNo: '2026/622131/07', vatNo: '', email: 'pixelprotechsolutions@proton.me', phone: '0651971461', bank: '', vatOn: false };
let settings = Object.assign({}, DEFAULTS, store.get('settings', {}));

const say = (cat, ctx) => Lines.pick(cat, ctx, state.office);
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const tagOf = f => (Jobs.ext(f.name) || 'file').slice(0, 4).toUpperCase();

/* ---------- toggles ---------- */
function syncToggles() {
  [['tOffice', 'office'], ['tFast', 'fast'], ['tVoice', 'voice']].forEach(([id, k]) => $(id).setAttribute('aria-pressed', String(!!state[k])));
  Scene.setVoice(state.voice && !state.office);
}
[['tOffice', 'office'], ['tFast', 'fast'], ['tVoice', 'voice']].forEach(([id, k]) => $(id).addEventListener('click', () => {
  state[k] = !state[k]; store.set(k, state[k]); syncToggles();
  if (k === 'office') Scene.say(state.office ? 'Office mode. Short and dry.' : 'Jokes back on. You asked for it.');
  if (k === 'fast') Scene.say(state.fast ? 'Sprint mode. Legs on fast-forward.' : 'Normal walking speed. Dignified.');
  if (k === 'voice') Scene.say(state.voice ? 'Voice on. Brace yourself.' : 'Voice off. Back to silent brass.');
}));

/* ---------- tray ---------- */
function renderTray() {
  const ul = $('trayList'); ul.textContent = '';
  if (!state.files.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nothing yet. Drop files on the tray or press "Add files".'; ul.appendChild(li); }
  state.files.forEach((f, i) => {
    const li = document.createElement('li');
    const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = tagOf(f);
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = f.name; nm.title = f.name;
    const sz = document.createElement('span'); sz.className = 'sz'; sz.textContent = fmtSize(f.size);
    li.append(tg, nm, sz);
    if (state.files.length > 1) {
      const up = document.createElement('button'); up.className = 'mv'; up.textContent = '↑'; up.title = 'Move up (merge order)'; up.setAttribute('aria-label', 'Move ' + f.name + ' up'); up.disabled = i === 0;
      up.onclick = () => { [state.files[i - 1], state.files[i]] = [state.files[i], state.files[i - 1]]; renderTray(); };
      const dn = document.createElement('button'); dn.className = 'mv'; dn.textContent = '↓'; dn.title = 'Move down'; dn.setAttribute('aria-label', 'Move ' + f.name + ' down'); dn.disabled = i === state.files.length - 1;
      dn.onclick = () => { [state.files[i + 1], state.files[i]] = [state.files[i], state.files[i + 1]]; renderTray(); };
      li.append(up, dn);
    }
    const rm = document.createElement('button'); rm.textContent = '✕'; rm.title = 'Remove'; rm.setAttribute('aria-label', 'Remove ' + f.name);
    rm.onclick = () => { state.files.splice(i, 1); Scene.setTrayCount(state.files.length); renderTray(); };
    li.append(rm);
    ul.appendChild(li);
  });
  $('trayCount').textContent = state.files.length ? state.files.length + ' file' + (state.files.length > 1 ? 's' : '') : 'empty';
  $('clearTray').hidden = !state.files.length;
}

function addFiles(list, fx, fy) {
  const arr = [...list].filter(f => f && f.name);
  if (!arr.length) return;
  arr.forEach((f, i) => { state.files.push(f); if (i < 8) setTimeout(() => Scene.flyIn(tagOf(f), fx, fy), i * 90); });
  if (arr.length > 8) Scene.setTrayCount(Scene.trayShown());
  renderTray();
  if (arr.length > 1) Scene.say(say('crowd', { k: arr.length }) || arr.length + ' files in.', 3200);
  else Scene.say(state.office ? 'Received.' : 'Got ' + (arr[0].name.length > 28 ? arr[0].name.slice(0, 26) + '…' : arr[0].name) + '. Now tell me what to do with it.', 3400);
}
$('clearTray').onclick = () => { state.files = []; Scene.setTrayCount(0); renderTray(); };
$('attach').onclick = () => $('picker').click();
$('picker').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });

// drag and drop anywhere on the stage (and the page)
const stage = $('stage');
let dragDepth = 0;
['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); if (ev === 'dragenter') dragDepth++; Scene.hint(true); } }));
window.addEventListener('dragleave', e => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) Scene.hint(false); });
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; Scene.hint(false);
  if (e.dataTransfer && e.dataTransfer.files.length) {
    const r = stage.getBoundingClientRect();
    addFiles(e.dataTransfer.files, Math.min(Math.max(e.clientX - r.left, 0), r.width), Math.min(Math.max(e.clientY - r.top, 0), r.height * 0.5));
  }
});
window.addEventListener('paste', e => { if (e.clipboardData && e.clipboardData.files.length && document.activeElement !== $('cmdText')) addFiles(e.clipboardData.files); });
$('scene').addEventListener('click', e => {
  const r = $('scene').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (Scene.trayHit(x, y)) $('picker').click();
  else if (Scene.jimmyHit(x, y) && !Scene.isBusy()) Scene.say(say('poke'));
});

/* ---------- command parsing ---------- */
function parse(raw) {
  let t = String(raw || '').trim();
  const l = t.toLowerCase().replace(/^(hey |hi |ok |okay )?jimmy[,:!]?\s*/, '').replace(/^please\s+/, '');
  if (!l) return { job: null };
  const rangeM = /(\d+\s*(?:-|–|to)\s*\d+(?:\s*,\s*\d+(?:\s*(?:-|–|to)\s*\d+)?)*|\d+(?:\s*,\s*\d+(?:\s*(?:-|–|to)\s*\d+)?)+)/.exec(l);
  if (/\b(invoice|quot(e|ation)|bill)\b/.test(l)) return { job: 'invoice', text: t.replace(/^(hey |hi |ok |okay )?jimmy[,:!]?\s*/i, ''), kind: /quot/.test(l) ? 'quote' : 'invoice' };
  if (/\b(office mode|be serious|no jokes)\b/.test(l)) return { job: 'toggle', k: 'office', v: !/off|jokes on/.test(l) };
  if (/\b(skip (the )?(animation|walk)|sprint|faster)\b/.test(l)) return { job: 'toggle', k: 'fast', v: true };
  if (/\b(help|what can you do|commands)\b/.test(l)) return { job: 'help' };
  if (/\b(thanks|thank you|cheers)\b/.test(l)) return { job: 'thanks' };
  if (/^(hello|hi|hey|howzit|yo|sawubona|dumela)\b/.test(l)) return { job: 'hello' };
  if (/\b(split|burst|separate|cut|pages?\s+\d)/.test(l)) return { job: 'split', range: rangeM ? rangeM[1] : (/\b(each|every|all)\b/.test(l) ? 'each' : '') };
  if (/\b(merge|combine|join|stitch|together)\b/.test(l)) return { job: 'merge' };
  if (/\b(tables?|csv|spreadsheet|excel|xlsx|grid)\b/.test(l)) return { job: 'tables', format: /csv/.test(l) ? 'csv' : (/xls|excel/.test(l) ? 'xlsx' : '') };
  if (/\b(sort|file|organi[sz]e|tidy|rename|duplicates?|dupes?|clean ?up)\b/.test(l)) return { job: 'sort' };
  if (/\b(extract|text|read|pull|convert|copy|get)\b/.test(l)) return { job: 'extract' };
  return { job: null };
}

function parseInvoice(text) {
  const t = String(text || '');
  const amt = /(?:\bR|ZAR)\s*(\d[\d\s,]*(?:\.\d+)?)/i.exec(t) || /(\d[\d,]*(?:\.\d+)?)\s*(?:rand|zar)?\s*(?:$|\b(?:for|incl|ex)\b)/i.exec(t);
  let client = '', desc = '';
  const m = /\b(?:for|to)\s+(.+)/i.exec(t.replace(/^.*?\b(?:invoice|quote|quotation|bill)\b\s*/i, ''));
  if (m) {
    let s = m[1];
    if (amt) { const i = s.search(/(?:\bR|ZAR)\s*\d|\d[\d,]*(?:\.\d+)?\s*(?:rand|zar)?(?:\s|$)/i); if (i > 0) { desc = s.slice(i).replace(/^(?:(?:\bR|ZAR)\s*)?\d[\d\s,]*(?:\.\d+)?\s*(?:rand|zar)?\s*(?:for\s+|-\s*|:\s*)?/i, '').trim(); s = s.slice(0, i); } }
    client = s.replace(/[,:\-–]+$/, '').trim();
  }
  const amount = amt ? parseFloat(amt[1].replace(/[\s,]/g, '')) : NaN;
  return { client, amount: isFinite(amount) ? amount : null, desc };
}

/* ---------- numbering + ledger ---------- */
const pad4 = n => String(n).padStart(4, '0');
function peekNumber(kind) { const y = new Date().getFullYear(); const c = store.get('counter.' + kind + '.' + y, 0) + 1; return (kind === 'quote' ? 'QUO-' : 'INV-') + y + '-' + pad4(c); }
function commitNumber(kind) { const y = new Date().getFullYear(); store.set('counter.' + kind + '.' + y, store.get('counter.' + kind + '.' + y, 0) + 1); }
function ledger() { return store.get('ledger', []); }
function ledgerCsv() {
  const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
  return '﻿' + [['number', 'type', 'date', 'client', 'vat_charged', 'total_zar']].concat(ledger().map(r => [r.number, r.kind, r.date, r.client, r.vat ? 'yes' : 'no', r.total.toFixed(2)])).map(r => r.map(q).join(',')).join('\n');
}

/* ---------- running jobs ---------- */
function failKey(err) {
  const k = err && err.kind;
  return ['scan', 'ocr', 'corrupt', 'locked', 'empty', 'toofew', 'badtype', 'notray', 'unknown', 'notables', 'badrange', 'onepage', 'noclient', 'noitems'].includes(k) ? 'fail_' + k : 'fail_generic';
}
function failLine(err) {
  const d = (err && err.data) || {};
  return say(failKey(err), { ext: d.ext ? '.' + d.ext : 'file', name: d.name || 'That file', range: d.range, n: d.n });
}

function triggerDownload(res) {
  const url = URL.createObjectURL(res.blob);
  const a = document.createElement('a'); a.href = url; a.download = res.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}
const jobNames = { extract: 'extraction', tables: 'table pull', merge: 'merge', split: 'split', sort: 'sort', invoice: 'invoice' };

function addOut(res, url, note) {
  state.outs.unshift({ res, url, note });
  state.outs = state.outs.slice(0, 12);
  renderOuts();
}
function renderOuts() {
  const ul = $('outList'); ul.textContent = '';
  if (!state.outs.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nothing handed over yet.'; ul.appendChild(li); }
  state.outs.forEach(o => {
    const li = document.createElement('li');
    const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = o.res.ext;
    const box = document.createElement('span'); box.className = 'nm';
    box.textContent = o.res.name; box.title = o.res.name;
    const n = document.createElement('span'); n.className = 'out-note'; n.textContent = o.res.summary + ' · ' + fmtSize(o.res.size);
    box.appendChild(n);
    const a = document.createElement('a'); a.className = 'dl'; a.textContent = 'Save'; a.href = o.url; a.download = o.res.name;
    li.append(tg, box, a); ul.appendChild(li);
  });
  $('outCount').textContent = state.outs.length ? state.outs.length + '' : '';
}

async function runJob(job, opts, files) {
  if (Scene.isBusy()) { Scene.say(say('busy'), 2400); return { ok: false, busy: true }; }
  files = files || state.files.slice();
  const needsTray = job !== 'invoice';
  if (needsTray && !files.length) { Scene.say(failLine({ kind: 'notray' }), 3200); return { ok: false, early: 'notray' }; }
  const t0 = performance.now();
  const ext0 = job === 'invoice' ? 'INV' : (Jobs.ext(files[0].name) || 'DOC').slice(0, 4).toUpperCase();
  const work = (async () => { const r = await Jobs.run(job, files, opts); r.secs = ((performance.now() - t0) / 1000); return r; })();
  work.catch(() => {});
  state.jobs++;
  const k = ++state.last;
  const label = job.toUpperCase();
  const out = await Scene.perform({
    label, ext: ext0, fast: state.fast, work,
    sayFetch: () => say('fetch', { ext: '.' + (Jobs.ext((files[0] || {}).name) || 'file') }),
    sayProcess: () => say('process'),
    sayDone: r => {
      state.streak++;
      if (state.office) return 'Done. ' + r.summary + '.';
      let extra = '';
      if (state.streak === 10) extra = say('streak10', { k: state.streak });
      else if (state.streak === 5) extra = say('streak5', { k: state.streak });
      else if (state.streak === 3) extra = say('streak3', { k: state.streak });
      else if (r.pages >= 100) extra = say('big', { n: r.pages });
      else if (files.length >= 20) extra = say('crowd', { k: files.length });
      else if (r.pages === 1 && job === 'extract') extra = say('one');
      const head = extra || say('deliver', { job: jobNames[job], s: Math.max(0.1, r.secs).toFixed(1) });
      return head + ' (' + r.summary + ')';
    },
    sayFail: e => { state.streak = 0; if (!(e instanceof Jobs.JobError)) console.error(e); return failLine(e); },
    handover: r => { const url = triggerDownload(r); addOut(r, url); if (job === 'invoice' && r.meta) { commitNumber(r.meta.kind); const l = ledger(); l.push({ number: r.meta.number, kind: r.meta.kind, date: r.meta.date, client: r.meta.client, vat: !!r.meta.vat, total: r.meta.total }); store.set('ledger', l.slice(-500)); } }
  });
  return out;
}

/* ---------- invoice form ---------- */
const dlg = $('dlgInvoice');
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addItemRow(desc, qty, price) {
  const row = document.createElement('div'); row.className = 'item';
  row.innerHTML = '<input class="d" type="text" placeholder="Description" aria-label="Description"><input class="q" type="number" min="0" step="any" value="1" aria-label="Quantity"><input class="p" type="number" min="0" step="0.01" placeholder="0.00" aria-label="Unit price"><button type="button" aria-label="Remove line">✕</button>';
  row.querySelector('.d').value = desc || ''; row.querySelector('.q').value = qty == null ? 1 : qty; if (price != null) row.querySelector('.p').value = price;
  row.querySelector('button').onclick = () => { if ($('iItems').children.length > 1) { row.remove(); calc(); } };
  row.addEventListener('input', calc);
  $('iItems').appendChild(row);
}
function readItems() { return [...$('iItems').children].map(r => ({ desc: r.querySelector('.d').value, qty: parseFloat(r.querySelector('.q').value) || 0, price: parseFloat(r.querySelector('.p').value) || 0 })); }
function calc() {
  const sub = readItems().reduce((n, i) => n + i.qty * i.price, 0), vat = $('iVat').checked ? Math.round(sub * 15) / 100 : 0;
  $('iTotal').textContent = ($('iVat').checked ? 'Subtotal ' + Jobs.money(sub) + ' · VAT ' + Jobs.money(vat) + ' · ' : '') + 'Total ' + Jobs.money(sub + vat);
}
function openInvoice(pre) {
  pre = pre || {};
  const kind = pre.kind || 'invoice';
  $('iKind').value = kind; $('iNo').value = peekNumber(kind);
  $('iClient').value = pre.client || ''; $('iAddr').value = ''; $('iDate').value = todayStr(); $('iDue').value = 30; $('iRef').value = ''; $('iNotes').value = ''; $('iVat').checked = !!settings.vatOn;
  $('iItems').textContent = ''; addItemRow(pre.desc || '', 1, pre.amount == null ? null : pre.amount);
  calc();
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  setTimeout(() => (pre.client ? $('iItems').querySelector('.d') : $('iClient')).focus(), 30);
}
$('iAdd').onclick = () => { addItemRow('', 1, null); $('iItems').lastChild.querySelector('.d').focus(); };
$('iVat').addEventListener('change', calc);
$('iKind').addEventListener('change', () => { $('iNo').value = peekNumber($('iKind').value); });
function collectInvoice() {
  const d = new Date($('iDate').value + 'T12:00:00'); const due = new Date(d.getTime() + (parseInt($('iDue').value, 10) || 0) * 86400000);
  const f = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  return { kind: $('iKind').value, number: $('iNo').value, client: $('iClient').value.trim(), clientAddress: $('iAddr').value, date: f(d), due: f(due), ref: $('iRef').value.trim(), vat: $('iVat').checked, notes: $('iNotes').value, items: readItems(), company: { name: settings.name, address: settings.address, regNo: settings.regNo, vatNo: settings.vatNo, email: settings.email, phone: settings.phone, bank: settings.bank } };
}
$('fInvoice').addEventListener('submit', e => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  if (!$('iClient').value.trim()) return;
  const data = collectInvoice();
  setTimeout(() => runJob('invoice', { data }, []), 120);
});

/* ---------- settings ---------- */
function openSettings() {
  $('sName').value = settings.name; $('sAddr').value = settings.address; $('sReg').value = settings.regNo; $('sVat').value = settings.vatNo; $('sMail').value = settings.email; $('sTel').value = settings.phone; $('sBank').value = settings.bank; $('sVatOn').checked = !!settings.vatOn;
  const l = ledger(); $('sLedger').textContent = l.length ? l.length + ' document' + (l.length > 1 ? 's' : '') + ' in the ledger on this device, totalling ' + Jobs.money(l.reduce((n, r) => n + r.total, 0)) + '.' : 'No invoices in the ledger yet.';
  if (dlg.showModal) $('dlgSettings').showModal(); else $('dlgSettings').setAttribute('open', '');
}
$('bSettings').onclick = openSettings;
$('fSettings').addEventListener('submit', e => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  settings = { name: $('sName').value.trim(), address: $('sAddr').value.trim(), regNo: $('sReg').value.trim(), vatNo: $('sVat').value.trim(), email: $('sMail').value.trim(), phone: $('sTel').value.trim(), bank: $('sBank').value, vatOn: $('sVatOn').checked };
  store.set('settings', settings);
  Scene.say(state.office ? 'Letterhead saved.' : 'Letterhead saved. Looking sharp.', 2600);
});
$('sCsv').onclick = () => { const b = new Blob([ledgerCsv()], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'jimmy_ledger_' + Jobs.ymd() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); };

/* ---------- command entry ---------- */
function opts() { return { range: $('range').value, format: $('fmt').value }; }
async function command(text) {
  const p = parse(text);
  if (!p.job) { Scene.say(failLine({ kind: 'unknown' }), 4200); return; }
  if (p.job === 'toggle') { state[p.k] = p.v; store.set(p.k, p.v); syncToggles(); Scene.say(p.k === 'office' ? (p.v ? 'Office mode. Short and dry.' : 'Jokes back on.') : 'Sprint mode on.'); return; }
  if (['help', 'thanks', 'hello'].includes(p.job)) { Scene.say(say(p.job), 5200); return; }
  if (p.job === 'invoice') {
    const inv = parseInvoice(p.text);
    if (inv.client && inv.amount != null) {
      if (Scene.isBusy()) { Scene.say(say('busy'), 2400); return; }
      const no = peekNumber(p.kind), d = new Date(), f = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
      const due = new Date(d.getTime() + 30 * 86400000);
      return runJob('invoice', { data: { kind: p.kind, number: no, client: inv.client, clientAddress: '', date: f(d), due: f(due), ref: '', vat: !!settings.vatOn, notes: '', items: [{ desc: inv.desc || 'Services rendered', qty: 1, price: inv.amount }], company: { name: settings.name, address: settings.address, regNo: settings.regNo, vatNo: settings.vatNo, email: settings.email, phone: settings.phone, bank: settings.bank } } }, []);
    }
    Scene.say(state.office ? 'Opening the form.' : 'I need a name and an amount. I\'ll open the form.', 2600);
    return openInvoice({ kind: p.kind, client: inv.client, amount: inv.amount, desc: inv.desc });
  }
  const o = opts();
  if (p.job === 'split' && p.range) { o.range = p.range === 'each' ? '' : p.range; if (p.range !== 'each') $('range').value = p.range; }
  if (p.job === 'tables' && p.format) { o.format = p.format; $('fmt').value = p.format; }
  return runJob(p.job, o);
}
$('cmd').addEventListener('submit', e => { e.preventDefault(); const t = $('cmdText').value; if (!t.trim()) { Scene.say(say('help'), 6500); return; } $('cmdText').value = ''; command(t); });
$('chips').addEventListener('click', e => {
  const b = e.target.closest('button[data-job]'); if (!b) return;
  const job = b.dataset.job;
  if (job === 'invoice') return openInvoice({});
  runJob(job, opts());
});

/* ---------- voice (browser speech recognition, when available) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const mic = $('mic'); mic.hidden = false;
  let rec = null, on = false;
  mic.addEventListener('click', () => {
    if (on && rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'en-ZA'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onstart = () => { on = true; mic.textContent = 'Listening…'; };
    rec.onend = () => { on = false; mic.textContent = 'Speak'; };
    rec.onerror = () => { on = false; mic.textContent = 'Speak'; Scene.say('Couldn\'t hear that. Type it, or try again.', 2600); };
    rec.onresult = ev => { const t = ev.results[0][0].transcript; $('cmdText').value = t; command(t); $('cmdText').value = ''; };
    try { rec.start(); } catch (e) {}
  });
}

/* ---------- boot ---------- */
function greeting() {
  if (state.office) return say('greet');
  const d = new Date(), h = d.getHours(), wd = d.getDay();
  const time = String(h).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (h < 5) return say('late', { time });
  if (wd === 5 && h >= 16) return say('friday');
  if (wd === 1 && h < 11) return say('monday');
  if (wd === 0 || wd === 6) return say('weekend');
  return say('greet');
}
Scene.init($('scene'), $('stage'), $('bubble'));
syncToggles(); renderTray(); renderOuts();
setTimeout(() => Scene.say(greeting(), 5200), 500);
setInterval(() => { if (!Scene.isBusy() && !state.office && !document.hidden && document.getElementById('bubble').hidden && Math.random() < 0.35) Scene.say(say('idle'), 4600); }, 24000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

// test hook (harmless): lets automated checks drive Jimmy without the UI
window.JimmyApp = { command, runJob, addFiles, state, parse, parseInvoice, jokes: Lines.count() };
})();
