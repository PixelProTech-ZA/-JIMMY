/* Jimmy — the clockwork clerk. Everything on screen is drawn procedurally: no images, no sprites. */
(function () {
'use strict';
const TAU = Math.PI * 2;
const C = { brass: '#00d4aa', brassL: '#7cf5dc', brassD: '#00765f', brassDD: '#033a30', glass: '#07070a', amber: '#00d4aa', cyan: '#b8fff0', red: '#ff5a4a', green: '#82f28f', paper: '#f1eefa' };
let cv, cx, stage, bubble, W = 0, H = 0, u = 1, dpr = 1, gy = 0;
let now = 0, last = 0, hideAt = 0, voiceOn = false;
const P = {};
const S = {
  J: { x: 0, y: 0, s: 1, dir: 1, phase: 0, amt: 0, look: { x: 0, y: 0 }, face: 'idle', tape: 'READY', hold: null, pose: 'idle', head: 0, shake: 0, gear: 0, blink: 0, nextBlink: 2, hands: null, mover: null },
  tray: { shown: 0, hint: 0 },
  M: { state: 'idle', gear: 0, out: 0, bell: 0, label: '', puffs: [] },
  rate: 1, busy: false, mouse: { x: 0, y: 0 }, flyers: [], dust: [], gears: [], sheets: [], capsule: { x: -200, v: 0 }
};

const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const wait = ms => new Promise(r => setTimeout(r, Math.max(0, ms / S.rate)));

/* ---------- layout ---------- */
function layout() {
  const r = stage.getBoundingClientRect();
  W = Math.max(280, r.width);
  H = W < 700 ? Math.round(W * 1.02) : Math.max(340, Math.round(W * 0.54));
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.height = H + 'px';
  u = W < 700 ? W / 690 : Math.min(W / 940, H / 520);
  gy = H * 0.8;
  const mx = W * (W < 700 ? 0.5 : 0.53);
  P.mx = mx; P.my = gy - H * 0.01;
  P.tray = { x: W * 0.12, y: gy + H * 0.03, s: 0.92 };
  P.trayStand = { x: W * 0.12 + 112 * u, y: gy + H * 0.045, s: 0.95 };
  P.machineIn = { x: mx - 138 * u, y: gy + H * 0.005, s: 0.92 };
  P.slot = { x: mx + 168 * u, y: gy + H * 0.02, s: 0.95 };
  P.front = { x: W * 0.62, y: H * 0.965, s: 1.36 };
  P.home = { x: W * 0.86, y: gy + H * 0.045, s: 0.98 };
  const J = S.J;
  if (!S.init) { Object.assign(J, { x: P.home.x, y: P.home.y, s: P.home.s, dir: -1 }); S.init = true; }
  buildBackground();
}

function buildBackground() {
  const g = [];
  const chain = (x, y, r0, n, ang, sp) => {
    let px = x, py = y, pr = r0, dir = 1, a = ang;
    for (let i = 0; i < n; i++) {
      const r = i === 0 ? r0 : r0 * rnd(0.55, 1.15);
      if (i > 0) { px += Math.cos(a) * (pr + r - 4); py += Math.sin(a) * (pr + r - 4); a += rnd(-0.7, 0.7); }
      g.push({ x: px, y: py, r, t: Math.max(8, Math.round(r / 5.5)), sp: sp * dir * (r0 / r), d: 0.25 + 0.75 * (r / (r0 * 1.2)), a0: rnd(0, TAU) });
      pr = r; dir = -dir;
    }
  };
  chain(W * 0.06, H * 0.42, 74 * u, 5, 0.35, 0.05);
  chain(W * 0.9, H * 0.12, 62 * u, 5, 1.9, 0.045);
  chain(W * 0.45, H * 0.3, 40 * u, 4, 0.1, 0.07);
  S.gears = g;
  S.dust = Array.from({ length: 46 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.6, 2), vy: rnd(-6, -1.5), vx: rnd(-3, 3), a: rnd(0.15, 0.6) }));
  S.sheets = Array.from({ length: 6 }, () => ({ x: rnd(0, W), y: rnd(H * 0.1, H * 0.7), s: rnd(0.5, 1.1), r: rnd(0, TAU), vr: rnd(-0.25, 0.25), vy: rnd(-8, -3), vx: rnd(-4, 4) }));
}

/* ---------- drawing helpers ---------- */
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function vgrad(c, y0, y1, a, b) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function brassGrad(c, x0, y0, x1, y1) { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, C.brassL); g.addColorStop(0.35, C.brass); g.addColorStop(0.75, '#00a888'); g.addColorStop(1, C.brassD); return g; }
function gear(c, x, y, r, teeth, ang, fill, hole) {
  c.save(); c.translate(x, y); c.rotate(ang); c.beginPath();
  const ri = r * 0.8;
  for (let i = 0; i < teeth; i++) {
    const a = i / teeth * TAU, w = TAU / teeth;
    c.lineTo(Math.cos(a) * ri, Math.sin(a) * ri);
    c.lineTo(Math.cos(a + w * 0.18) * r, Math.sin(a + w * 0.18) * r);
    c.lineTo(Math.cos(a + w * 0.5) * r, Math.sin(a + w * 0.5) * r);
    c.lineTo(Math.cos(a + w * 0.68) * ri, Math.sin(a + w * 0.68) * ri);
  }
  c.closePath();
  if (hole) { c.moveTo(r * 0.3, 0); c.arc(0, 0, r * 0.3, 0, TAU, true); for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4; c.moveTo(Math.cos(a) * r * 0.62 + r * 0.16, Math.sin(a) * r * 0.62); c.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.16, 0, TAU, true); } }
  c.fillStyle = fill; c.fill('evenodd'); c.restore();
}
function doc(c, x, y, w, h, rot, tag, lines) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.fillStyle = 'rgba(0,0,0,.25)'; rr(c, -w / 2 + 2, -h / 2 + 3, w, h, 2); c.fill();
  c.fillStyle = C.paper; c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2 - w * 0.22, -h / 2); c.lineTo(w / 2, -h / 2 + w * 0.22); c.lineTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2); c.closePath(); c.fill();
  c.fillStyle = '#c9c4dc'; c.beginPath(); c.moveTo(w / 2 - w * 0.22, -h / 2); c.lineTo(w / 2 - w * 0.22, -h / 2 + w * 0.22); c.lineTo(w / 2, -h / 2 + w * 0.22); c.closePath(); c.fill();
  c.fillStyle = '#9a95b0';
  const n = lines || 5;
  for (let i = 0; i < n; i++) c.fillRect(-w / 2 + w * 0.14, -h / 2 + h * 0.38 + i * (h * 0.5 / n), w * (i % 3 === 2 ? 0.45 : 0.72), Math.max(1, h * 0.035));
  if (tag) { c.fillStyle = C.brassD; rr(c, -w / 2 + w * 0.1, -h / 2 + h * 0.1, w * 0.42, h * 0.17, 2); c.fill(); c.fillStyle = '#f1eefa'; c.font = '700 ' + Math.max(6, h * 0.12) + 'px ui-monospace,monospace'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(String(tag).slice(0, 4), -w / 2 + w * 0.14, -h / 2 + h * 0.185); }
  c.restore();
}
function tube(c, pts, w) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.strokeStyle = C.brassDD; c.lineWidth = w + 2.5; c.stroke();
  c.strokeStyle = C.brass; c.lineWidth = w; c.stroke();
  c.strokeStyle = 'rgba(210,255,245,.55)'; c.lineWidth = Math.max(1, w * 0.22); c.stroke();
}
function ik(sx, sy, tx, ty, l1, l2, side) {
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
  const mx = l1 + l2 - 0.5, mn = Math.abs(l1 - l2) + 1;
  if (d > mx) { dx *= mx / d; dy *= mx / d; d = mx; }
  if (d < mn) d = mn;
  const a = Math.atan2(dy, dx);
  const ang = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const e = a - side * ang;
  const ex = sx + Math.cos(e) * l1, ey = sy + Math.sin(e) * l1;
  return { ex, ey, hx: sx + dx, hy: sy + dy };
}

/* ---------- background ---------- */
function drawBackground(t) {
  const c = cx;
  c.fillStyle = vgrad(c, 0, H, '#0d0d12', '#07070a'); c.fillRect(0, 0, W, H);
  const mpx = S.mouse.x, mpy = S.mouse.y;
  // wall panelling
  c.save();
  c.globalAlpha = 0.5; c.fillStyle = '#0a0a0f'; c.fillRect(0, gy - H * 0.2, W, H * 0.2 + 2);
  c.strokeStyle = 'rgba(0,212,170,.07)'; c.lineWidth = 1;
  for (let x = 0; x < W; x += 46 * u) { c.beginPath(); c.moveTo(x, gy - H * 0.2); c.lineTo(x, gy); c.stroke(); }
  c.beginPath(); c.moveTo(0, gy - H * 0.2); c.lineTo(W, gy - H * 0.2); c.strokeStyle = 'rgba(124,245,220,.18)'; c.stroke();
  c.restore();
  // parallax gears
  for (const g of S.gears) {
    const ox = mpx * 16 * g.d, oy = mpy * 10 * g.d;
    c.globalAlpha = 0.05 + 0.13 * g.d;
    gear(c, g.x + ox, g.y + oy, g.r, g.t, g.a0 + t * g.sp * (S.busy ? 3 : 1), brassGrad(c, g.x - g.r, g.y - g.r, g.x + g.r, g.y + g.r), true);
  }
  c.globalAlpha = 1;
  // pneumatic tube + capsule
  const ty = H * 0.07;
  c.strokeStyle = 'rgba(0,212,170,.28)'; c.lineWidth = 9 * u; c.beginPath(); c.moveTo(0, ty); c.lineTo(W, ty); c.stroke();
  c.strokeStyle = 'rgba(210,255,245,.12)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, ty - 2 * u); c.lineTo(W, ty - 2 * u); c.stroke();
  for (let x = W * 0.1; x < W; x += W * 0.2) { c.fillStyle = 'rgba(0,118,95,.55)'; c.fillRect(x - 3, ty - 9 * u, 6, 18 * u); }
  const cap = S.capsule;
  cap.v = lerp(cap.v, S.busy ? 900 : 140, 0.03);
  cap.x += cap.v * (1 / 60);
  if (cap.x > W + 140) cap.x = -140 - rnd(0, W * 0.8);
  c.fillStyle = 'rgba(127,245,228,.55)'; rr(c, cap.x - 18 * u, ty - 4.5 * u, 36 * u, 9 * u, 4 * u); c.fill();
  c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(cap.x - 12 * u, ty - 3 * u, 14 * u, 1.5);
  // wall clock (real time)
  const cxk = W * 0.09, cyk = H * 0.19, cr = 30 * u, d = new Date();
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(cxk + 2, cyk + 3, cr + 4, 0, TAU); c.fill();
  c.fillStyle = brassGrad(c, cxk - cr, cyk - cr, cxk + cr, cyk + cr); c.beginPath(); c.arc(cxk, cyk, cr + 4, 0, TAU); c.fill();
  c.fillStyle = '#0c0c12'; c.beginPath(); c.arc(cxk, cyk, cr, 0, TAU); c.fill();
  c.strokeStyle = C.brassL; c.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.beginPath(); c.moveTo(cxk + Math.sin(a) * cr * 0.82, cyk - Math.cos(a) * cr * 0.82); c.lineTo(cxk + Math.sin(a) * cr * 0.95, cyk - Math.cos(a) * cr * 0.95); c.stroke(); }
  const hr = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * TAU, mn = (d.getMinutes() + d.getSeconds() / 60) / 60 * TAU, sc = d.getSeconds() / 60 * TAU;
  c.lineCap = 'round'; c.strokeStyle = C.brassL; c.lineWidth = 2.4; c.beginPath(); c.moveTo(cxk, cyk); c.lineTo(cxk + Math.sin(hr) * cr * 0.5, cyk - Math.cos(hr) * cr * 0.5); c.stroke();
  c.lineWidth = 1.8; c.beginPath(); c.moveTo(cxk, cyk); c.lineTo(cxk + Math.sin(mn) * cr * 0.76, cyk - Math.cos(mn) * cr * 0.76); c.stroke();
  c.strokeStyle = C.red; c.lineWidth = 1; c.beginPath(); c.moveTo(cxk, cyk); c.lineTo(cxk + Math.sin(sc) * cr * 0.84, cyk - Math.cos(sc) * cr * 0.84); c.stroke();
  // lamp
  const lx = W * 0.74 + mpx * 6, sw = Math.sin(t * 0.9) * 0.03, ly = H * 0.2;
  c.save(); c.translate(lx, ty); c.rotate(sw);
  c.strokeStyle = '#14201f'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, ly - ty); c.stroke();
  const gl = c.createRadialGradient(0, ly - ty + 10 * u, 4, 0, ly - ty + 90 * u, 230 * u);
  gl.addColorStop(0, 'rgba(0,212,170,.30)'); gl.addColorStop(1, 'rgba(0,212,170,0)');
  c.fillStyle = gl; c.beginPath(); c.moveTo(-22 * u, ly - ty + 10 * u); c.lineTo(22 * u, ly - ty + 10 * u); c.lineTo(190 * u, ly - ty + 330 * u); c.lineTo(-190 * u, ly - ty + 330 * u); c.closePath(); c.fill();
  c.fillStyle = brassGrad(c, -24 * u, 0, 24 * u, 20 * u); c.beginPath(); c.moveTo(-8 * u, ly - ty - 10 * u); c.lineTo(8 * u, ly - ty - 10 * u); c.lineTo(26 * u, ly - ty + 12 * u); c.lineTo(-26 * u, ly - ty + 12 * u); c.closePath(); c.fill();
  c.fillStyle = '#b8fff0'; c.beginPath(); c.ellipse(0, ly - ty + 12 * u, 22 * u, 4 * u, 0, 0, TAU); c.fill();
  c.restore();
  // drifting sheets
  for (const s of S.sheets) {
    c.save(); c.globalAlpha = 0.1; c.translate(s.x + mpx * 8, s.y); c.rotate(s.r); c.fillStyle = C.paper; c.fillRect(-14 * u * s.s, -18 * u * s.s, 28 * u * s.s, 36 * u * s.s); c.restore();
  }
  // floor with perspective
  const vx = W * 0.5 + mpx * 20, vy = gy - H * 0.16;
  c.fillStyle = vgrad(c, gy, H, '#101418', '#07070a'); c.fillRect(0, gy, W, H - gy);
  c.strokeStyle = 'rgba(124,245,220,.09)'; c.lineWidth = 1;
  for (let i = -9; i <= 9; i++) { c.beginPath(); c.moveTo(vx + i * 8, gy); c.lineTo(vx + i * (W * 0.16), H); c.stroke(); }
  for (let i = 1; i < 7; i++) { const yy = gy + (H - gy) * (i / 7) ** 1.7; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); }
  c.strokeStyle = 'rgba(124,245,220,.22)'; c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke();
  // dust
  for (const p of S.dust) { c.fillStyle = 'rgba(180,255,240,' + p.a * 0.5 + ')'; c.beginPath(); c.arc(p.x + mpx * 10, p.y, p.r, 0, TAU); c.fill(); }
}

/* ---------- tray ---------- */
function drawTray(t) {
  const c = cx, p = P.tray, k = u * 1.05;
  c.save(); c.translate(p.x, p.y); c.scale(k, k);
  c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(0, 4, 64, 9, 0, 0, TAU); c.fill();
  // papers
  const n = Math.min(S.tray.shown, 9);
  for (let i = 0; i < n; i++) doc(c, Math.sin(i * 7.3) * 5, -18 - i * 5, 62, 44, Math.sin(i * 3.1) * 0.08, i === n - 1 ? 'IN' : '', 3);
  // tray body
  c.fillStyle = vgrad(c, -34, 0, '#1b2a2a', '#0e1616');
  c.beginPath(); c.moveTo(-70, -26); c.lineTo(70, -26); c.lineTo(58, 0); c.lineTo(-58, 0); c.closePath(); c.fill();
  c.strokeStyle = C.brassD; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = brassGrad(c, -14, -22, 14, -6); rr(c, -16, -21, 32, 14, 3); c.fill();
  c.fillStyle = C.brassDD; c.font = '800 11px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('IN', 0, -14);
  if (S.tray.shown === 0 || S.tray.hint) {
    const a = 0.45 + 0.35 * Math.sin(t * 3 + 1);
    c.fillStyle = 'rgba(124,245,220,' + a + ')'; c.font = '700 10px ui-monospace,monospace'; c.fillText(S.tray.hint ? 'DROP IT' : 'DROP FILES HERE', 0, -48);
    c.strokeStyle = 'rgba(124,245,220,' + a * 0.8 + ')'; c.setLineDash([4, 4]); c.strokeRect(-72, -62, 144, 66); c.setLineDash([]);
  }
  c.restore();
}

/* ---------- machine ---------- */
function drawMachine(t) {
  const c = cx, M = S.M, k = u * 1.02;
  const run = M.state === 'run', err = M.state === 'error', done = M.state === 'done';
  c.save(); c.translate(P.mx, P.my); c.scale(k, k);
  c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(0, 4, 138, 11, 0, 0, TAU); c.fill();
  // feet
  c.fillStyle = C.brassDD; [-82, 82].forEach(x => { rr(c, x - 16, -12, 32, 14, 4); c.fill(); });
  // body
  c.fillStyle = brassGrad(c, -100, -170, 100, -10); rr(c, -100, -172, 200, 164, 12); c.fill();
  c.strokeStyle = C.brassDD; c.lineWidth = 3; c.stroke();
  c.fillStyle = 'rgba(0,0,0,.12)'; rr(c, -92, -90, 184, 74, 8); c.fill();
  // rivets
  c.fillStyle = C.brassL; [[-90, -160], [90, -160], [-90, -20], [90, -20]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 3.4, 0, TAU); c.fill(); });
  // top plate + hopper
  c.fillStyle = C.brassD; rr(c, -108, -184, 216, 16, 5); c.fill();
  c.fillStyle = brassGrad(c, -60, -230, 60, -184); c.beginPath(); c.moveTo(-64, -184); c.lineTo(64, -184); c.lineTo(38, -232); c.lineTo(-38, -232); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#0a0704'; c.beginPath(); c.ellipse(0, -232, 38, 7, 0, 0, TAU); c.fill();
  if (run) { const g = c.createRadialGradient(0, -232, 2, 0, -232, 40); g.addColorStop(0, 'rgba(127,245,228,.55)'); g.addColorStop(1, 'rgba(127,245,228,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, -232, 40, 0, TAU); c.fill(); }
  // window
  c.fillStyle = C.glass; rr(c, -66, -150, 132, 76, 8); c.fill(); c.strokeStyle = C.brassL; c.lineWidth = 2; c.stroke();
  c.save(); rr(c, -66, -150, 132, 76, 8); c.clip();
  const sp = run ? 7 : (done ? 0.6 : 0.25);
  const tint = err ? '#7a2a22' : (run ? '#00d4aa' : '#008a70');
  gear(c, -34, -108, 28, 14, M.gear * sp * 0.5, tint, true);
  gear(c, 18, -96, 21, 11, -M.gear * sp * 0.66, tint, true);
  gear(c, 52, -124, 15, 9, M.gear * sp * 0.9, tint, true);
  gear(c, -4, -138, 11, 8, -M.gear * sp * 1.2, tint, true);
  if (run) { // pages flicking through the glass
    for (let i = 0; i < 4; i++) { const px = ((t * 380 + i * 70) % 190) - 95; c.save(); c.globalAlpha = 0.85; c.translate(px, -112 + Math.sin(t * 22 + i) * 6); c.rotate(Math.sin(t * 15 + i) * 0.25); c.fillStyle = C.paper; c.fillRect(-9, -12, 18, 24); c.fillStyle = '#9a95b0'; c.fillRect(-6, -7, 12, 2); c.fillRect(-6, -2, 9, 2); c.restore(); }
  }
  const sh = c.createLinearGradient(-66, -150, 40, -74); sh.addColorStop(0, 'rgba(255,255,255,.14)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); c.fillStyle = sh; c.fillRect(-66, -150, 132, 76);
  if (err) { c.fillStyle = 'rgba(255,60,40,' + (0.12 + 0.1 * Math.sin(t * 18)) + ')'; c.fillRect(-66, -150, 132, 76); }
  c.restore();
  // lamps
  const lamp = (x, col, on) => { c.fillStyle = on ? col : '#12201e'; c.beginPath(); c.arc(x, -50, 6, 0, TAU); c.fill(); if (on) { const g = c.createRadialGradient(x, -50, 1, x, -50, 18); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.5; c.fillStyle = g; c.beginPath(); c.arc(x, -50, 18, 0, TAU); c.fill(); c.globalAlpha = 1; } c.strokeStyle = C.brassDD; c.lineWidth = 1.5; c.beginPath(); c.arc(x, -50, 6, 0, TAU); c.stroke(); };
  lamp(-70, C.red, err); lamp(-50, C.amber, run || M.state === 'idle'); lamp(-30, C.green, done);
  // label plate
  c.fillStyle = '#07070a'; rr(c, 4, -64, 88, 28, 4); c.fill(); c.strokeStyle = C.brassL; c.lineWidth = 1; c.stroke();
  c.fillStyle = err ? C.red : (run ? C.cyan : C.amber); c.font = '700 11px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(err ? 'JAMMED' : (M.label || 'CLATTER-9'), 48, -50);
  // chute + output sheet
  c.fillStyle = C.brassD; c.beginPath(); c.moveTo(100, -66); c.lineTo(156, -48); c.lineTo(156, -38); c.lineTo(100, -50); c.closePath(); c.fill(); c.stroke();
  if (M.out > 0) doc(c, 100 + M.out * 56, -70 + M.out * 18, 42, 56, 0.35 - M.out * 0.2, 'OUT', 4);
  // bell
  c.fillStyle = M.bell > 0 ? '#f1eefa' : C.brassL; c.beginPath(); c.arc(80, -190, 9, Math.PI, 0); c.lineTo(89, -184); c.lineTo(71, -184); c.closePath(); c.fill();
  if (M.bell > 0) { c.strokeStyle = 'rgba(241,238,250,' + M.bell + ')'; c.lineWidth = 2; for (let i = 1; i <= 2; i++) { c.beginPath(); c.arc(80, -190, 9 + i * 7 * (1.2 - M.bell), Math.PI * 1.15, Math.PI * 1.85); c.stroke(); } }
  // puffs
  for (const p of M.puffs) { c.globalAlpha = Math.max(0, p.life) * (p.dark ? 0.55 : 0.4); c.fillStyle = p.dark ? '#2a3434' : '#dcd9ee'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
  c.globalAlpha = 1;
  c.restore();
}

/* ---------- Jimmy ---------- */
const POSES = {
  idle: t => [[-44, -62 + Math.sin(t * 2) * 1.5], [44, -62 + Math.sin(t * 2 + 1) * 1.5]],
  carry: () => [[-13, -86], [13, -86]],
  reach: () => [[-44, -66], [84, -92]],
  present: t => [[-26, -112 + Math.sin(t * 5) * 2], [26, -112 + Math.sin(t * 5) * 2]],
  type: t => [[-18, -88 + Math.sin(t * 28) * 5], [18, -88 + Math.cos(t * 28) * 5]],
  error: t => [[-44, -66], [10, -160 + Math.sin(t * 9) * 1.5]],
  wave: t => [[-44, -66], [58, -168 + Math.sin(t * 12) * 8]],
  shrug: () => [[-58, -108], [58, -108]]
};

function drawJimmy(t, dt) {
  const J = S.J, c = cx;
  const sc = u * J.s;
  const bob = -Math.abs(Math.sin(J.phase)) * 5 * J.amt + Math.sin(t * 2.2) * 1.2 * (1 - J.amt);
  // hands
  const tgt = (POSES[J.pose] || POSES.idle)(t);
  if (!J.hands) J.hands = tgt.map(p => ({ x: p[0], y: p[1] }));
  const kk = 1 - Math.exp(-dt * 20);
  J.hands.forEach((h, i) => { h.x = lerp(h.x, tgt[i][0], kk); h.y = lerp(h.y, tgt[i][1], kk); });
  const gw = J.face === 'busy' || S.M.state === 'run' ? 1 : 0;
  c.save(); c.translate(J.x, J.y); c.scale(sc * J.dir, sc);
  // shadow
  c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(0, 3, 38 - Math.abs(bob) * 1.2, 7, 0, 0, TAU); c.fill();
  // legs
  const legs = [-13, 13].map((hx, i) => {
    const p = J.phase + (i ? Math.PI : 0);
    const a1 = 0.55 * J.amt * Math.sin(p);
    const a2 = -(0.1 + 0.75 * Math.max(0, Math.cos(p))) * J.amt;
    const hy = -62 + bob;
    const kx = hx + Math.sin(a1) * 31, ky = hy + Math.cos(a1) * 31;
    const fx = kx + Math.sin(a1 + a2) * 31, fy = ky + Math.cos(a1 + a2) * 31;
    return { hx, hy, kx, ky, fx, fy: Math.min(fy, 1) };
  });
  legs.sort((a, b) => a.fy - b.fy);
  legs.forEach(l => {
    tube(c, [[l.hx, l.hy], [l.kx, l.ky], [l.fx, l.fy - 4]], 9);
    c.fillStyle = C.brassDD; rr(c, l.fx - 9, l.fy - 7, 24, 9, 4); c.fill(); c.fillStyle = C.brass; rr(c, l.fx - 9, l.fy - 7, 24, 5, 3); c.fill();
    c.fillStyle = C.brassL; c.beginPath(); c.arc(l.kx, l.ky, 4.2, 0, TAU); c.fill(); c.strokeStyle = C.brassDD; c.lineWidth = 1; c.stroke();
  });
  c.save(); c.translate(0, bob);
  // back arm (left in local space)
  const arm = (sx, h, side) => {
    const r = ik(sx, -122, h.x, h.y, 34, 32, side);
    tube(c, [[sx, -122], [r.ex, r.ey], [r.hx, r.hy]], 8);
    c.fillStyle = C.brassL; c.beginPath(); c.arc(r.ex, r.ey, 4, 0, TAU); c.fill(); c.strokeStyle = C.brassDD; c.lineWidth = 1; c.stroke();
    c.fillStyle = C.brassD; c.beginPath(); c.arc(r.hx, r.hy, 6.5, 0, TAU); c.fill(); c.fillStyle = C.brass; c.beginPath(); c.arc(r.hx, r.hy - 0.8, 5, 0, TAU); c.fill();
    return r;
  };
  const rl = arm(-33, J.hands[0], -1);
  // torso
  c.fillStyle = brassGrad(c, -32, -134, 32, -62); rr(c, -32, -134, 64, 74, 11); c.fill(); c.strokeStyle = C.brassDD; c.lineWidth = 2.5; c.stroke();
  c.fillStyle = 'rgba(0,0,0,.14)'; rr(c, -26, -76, 52, 12, 4); c.fill();
  c.fillStyle = C.brassL; [[-25, -127], [25, -127], [-25, -66], [25, -66]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 2.4, 0, TAU); c.fill(); });
  // chest window with gears
  const col = S.J.face === 'dead' ? C.red : S.J.face === 'happy' ? C.green : (gw ? C.cyan : C.amber);
  c.fillStyle = '#05080a'; c.beginPath(); c.arc(0, -103, 19, 0, TAU); c.fill(); c.strokeStyle = C.brassL; c.lineWidth = 2.2; c.stroke();
  const gsp = (gw ? 7 : 0.9) * (S.J.face === 'dead' ? 0 : 1);
  gear(c, 0, -103, 14, 12, J.gear * gsp * 0.4, col, true);
  gear(c, 9, -96, 7, 8, -J.gear * gsp * 0.8, brassGrad(c, 0, -110, 16, -90), false);
  const gl = c.createRadialGradient(0, -103, 2, 0, -103, 28); gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.22 + 0.1 * Math.sin(t * 4); c.fillStyle = gl; c.beginPath(); c.arc(0, -103, 28, 0, TAU); c.fill(); c.globalAlpha = 1;
  // neck + head
  c.fillStyle = C.brassDD; c.fillRect(-7, -140, 14, 8);
  c.save(); c.translate(0, -138); c.rotate(J.head + Math.sin(t * 40) * J.shake * 0.12);
  // antenna gear hat
  c.strokeStyle = C.brassDD; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -46); c.lineTo(0, -56); c.stroke();
  gear(c, 0, -63, 9, 10, J.gear * (gw ? 3 : 0.7), brassGrad(c, -9, -72, 9, -54), true);
  // ears
  [-31, 31].forEach(x => { c.fillStyle = C.brassD; c.beginPath(); c.arc(x, -22, 7, 0, TAU); c.fill(); c.fillStyle = C.brassL; c.beginPath(); c.arc(x, -22, 3, 0, TAU); c.fill(); });
  c.fillStyle = brassGrad(c, -29, -46, 29, 0); rr(c, -29, -46, 58, 48, 11); c.fill(); c.strokeStyle = C.brassDD; c.lineWidth = 2.5; c.stroke();
  // face glass
  c.fillStyle = '#05080a'; rr(c, -23, -41, 46, 38, 8); c.fill();
  c.strokeStyle = 'rgba(124,245,220,.5)'; c.lineWidth = 1; c.stroke();
  drawFace(c, t, col);
  c.restore();
  c.restore(); // bob
  // doc held
  if (J.hold) {
    const hl = J.hands[0], hr = J.hands[1];
    const pres = J.pose === 'present';
    const dx = pres ? (hl.x + hr.x) / 2 : (J.pose === 'reach' ? hr.x : (hl.x + hr.x) / 2), dy = (pres ? -118 : (J.pose === 'reach' ? hr.y : (hl.y + hr.y) / 2 - 4)) + bob;
    const z = pres ? 1.9 + Math.sin(t * 5) * 0.04 : 1;
    c.save(); c.translate(dx, dy - (pres ? 14 : 0)); c.scale(J.dir, 1);
    doc(c, 0, 0, 40 * z, 52 * z, pres ? Math.sin(t * 3) * 0.04 : -0.1, J.hold.tag, 5);
    c.restore();
  }
  // front arm (drawn over doc for grip)
  c.save(); c.translate(0, bob); arm(33, J.hands[1], 1); c.restore();
  c.restore();
}

function drawFace(c, t, col) {
  const J = S.J, f = J.face;
  const ex = J.look.x * 2.4, ey = J.look.y * 1.8;
  const eyes = [-12, 12];
  const blinking = J.blink > 0;
  eyes.forEach((x, i) => {
    c.save(); c.translate(x, -28);
    if (f === 'dead') {
      c.strokeStyle = C.red; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-5, -5); c.lineTo(5, 5); c.moveTo(5, -5); c.lineTo(-5, 5); c.stroke();
    } else if (f === 'happy' || blinking) {
      c.strokeStyle = f === 'happy' ? C.green : col; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath();
      if (f === 'happy') c.arc(0, 2, 5, Math.PI * 1.12, Math.PI * 1.88); else { c.moveTo(-5, 0); c.lineTo(5, 0); }
      c.stroke();
    } else {
      c.fillStyle = '#0a0f0f'; c.beginPath(); c.arc(0, 0, 8.4, 0, TAU); c.fill(); c.strokeStyle = C.brassL; c.lineWidth = 1.6; c.stroke();
      const busy = f === 'busy';
      const sx = busy ? Math.sin(t * 9 + i) * 3 : ex, sy = busy ? 0 : ey;
      const g = c.createRadialGradient(sx, sy, 0.5, sx, sy, 7); g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(sx, sy, 7, 0, TAU); c.fill();
    }
    c.restore();
  });
  // ticker-tape mouth (counter-flipped so the text always reads left to right)
  c.save(); c.scale(J.dir, 1); c.beginPath(); c.rect(-17, -13, 34, 9); c.clip();
  c.fillStyle = '#080c0c'; c.fillRect(-17, -13, 34, 9);
  c.fillStyle = f === 'dead' ? C.red : col; c.font = '700 7.5px ui-monospace,monospace'; c.textBaseline = 'middle'; c.textAlign = 'left';
  const txt = (J.tape || '') + '   ';
  const w = Math.max(1, c.measureText(txt).width);
  const scroll = (f === 'busy' || S.M.state === 'run') ? (t * 38) % w : 0;
  if (w > 34 || scroll) { for (let k = -1; k < 3; k++) c.fillText(txt, -17 + k * w - scroll, -8.2); }
  else { c.textAlign = 'center'; c.fillText(J.tape || '', 0, -8.2); }
  c.restore();
  c.strokeStyle = C.brassDD; c.lineWidth = 1; c.strokeRect(-17, -13, 34, 9);
}

/* ---------- frame ---------- */
function update(dt) {
  const J = S.J, M = S.M;
  now += dt;
  J.gear += dt * (S.busy ? 5 : 1.2);
  M.gear += dt * 4;
  // movement
  const mv = J.mover;
  if (mv) {
    const p = Math.min(1, (performance.now() - mv.t0) / mv.dur), e = ease(p);
    const nx = lerp(mv.sx, mv.tx, e), ny = lerp(mv.sy, mv.ty, e), ns = lerp(mv.ss, mv.ts, e);
    const moved = Math.hypot(nx - J.x, (ny - J.y) * 0.5) / (u * J.s || 1);
    J.phase += moved / 15;
    J.x = nx; J.y = ny; J.s = ns;
    J.amt = lerp(J.amt, 1, 1 - Math.exp(-dt * 25));
    if (p >= 1) { J.mover = null; mv.res(); }
  } else J.amt = lerp(J.amt, 0, 1 - Math.exp(-dt * 14));
  // eyes + blink
  const target = J.mover ? { x: Math.sign(J.mover.tx - J.mover.sx) * J.dir * 0 + 1, y: 0 } : { x: S.mouse.x * J.dir, y: S.mouse.y * 0.8 };
  J.look.x = lerp(J.look.x, J.mover ? 1 : target.x, 0.12); J.look.y = lerp(J.look.y, target.y, 0.12);
  J.nextBlink -= dt; if (J.nextBlink <= 0) { J.blink = 0.12; J.nextBlink = rnd(2, 5); }
  if (J.blink > 0) J.blink -= dt;
  J.head = lerp(J.head, J.face === 'dead' ? 0.28 : (J.face === 'happy' ? -0.06 : 0), 0.15);
  if (J.shake > 0) J.shake = Math.max(0, J.shake - dt * 0.9);
  // machine puffs
  if (M.state === 'run' && Math.random() < dt * 22) M.puffs.push({ x: rnd(-20, 20), y: -236, vx: rnd(-14, 14), vy: rnd(-70, -40), r: rnd(5, 10), life: 1, dark: false });
  if (M.state === 'error' && Math.random() < dt * 30) M.puffs.push({ x: rnd(-40, 40), y: -236, vx: rnd(-20, 20), vy: rnd(-80, -45), r: rnd(7, 14), life: 1, dark: true });
  M.puffs.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 9; p.life -= dt * 0.8; });
  M.puffs = M.puffs.filter(p => p.life > 0);
  if (M.bell > 0) M.bell = Math.max(0, M.bell - dt * 1.6);
  // ambient
  for (const p of S.dust) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y < -4) { p.y = H + 4; p.x = rnd(0, W); } if (p.x < -4) p.x = W + 4; if (p.x > W + 4) p.x = -4; }
  for (const s of S.sheets) { s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.vr * dt; if (s.y < -40) { s.y = H + 40; s.x = rnd(0, W); } }
  // flyers (files flying into the tray)
  for (const f of S.flyers) { f.p += dt / f.d; }
  S.flyers = S.flyers.filter(f => { if (f.p >= 1) { S.tray.shown = Math.min(99, S.tray.shown + 1); return false; } return true; });
  // bubble
  placeBubble();
}

function draw(ts) {
  const t = ts / 1000;
  const dt = Math.min(0.05, last ? t - last : 0.016); last = t;
  update(dt);
  const c = cx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(t);
  drawTray(t);
  drawMachine(t);
  // depth order: whoever is lower on screen is drawn later
  drawJimmy(t, dt);
  for (const f of S.flyers) {
    const e = ease(f.p), x = lerp(f.x0, P.tray.x, e), y = lerp(f.y0, P.tray.y - 46 * u, e) - Math.sin(e * Math.PI) * 60 * u;
    doc(c, x, y, 30 * u, 40 * u, e * 0.5, f.tag, 3);
  }
  if (S.tray.hint) { c.strokeStyle = 'rgba(124,245,220,.55)'; c.lineWidth = 3; c.setLineDash([10, 8]); c.strokeRect(6, 6, W - 12, H - 12); c.setLineDash([]); }
}
function loop(ts) { draw(ts); requestAnimationFrame(loop); }

/* ---------- speech bubble ---------- */
function say(text, ms) {
  if (!text) { bubble.hidden = true; return; }
  bubble.textContent = text; bubble.hidden = false;
  bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  hideAt = performance.now() + (ms || Math.max(2600, text.length * 62));
  const lv = document.getElementById('said'); if (lv) lv.textContent = text;
  if (voiceOn && 'speechSynthesis' in window) { try { speechSynthesis.cancel(); const u2 = new SpeechSynthesisUtterance(text); u2.pitch = 0.55; u2.rate = 1.12; speechSynthesis.speak(u2); } catch (e) {} }
}
function placeBubble() {
  if (bubble.hidden) return;
  if (performance.now() > hideAt) { bubble.hidden = true; return; }
  const J = S.J, bw = bubble.offsetWidth, bh = bubble.offsetHeight;
  const hx = J.x, hy = J.y - 215 * u * J.s;
  const x = Math.min(W - bw / 2 - 8, Math.max(bw / 2 + 8, hx));
  const y = Math.max(bh + 8, hy);
  bubble.style.transform = 'translate(' + Math.round(x - bw / 2) + 'px,' + Math.round(y - bh) + 'px)';
  bubble.style.setProperty('--tail', Math.round(Math.min(bw - 24, Math.max(18, hx - (x - bw / 2)))) + 'px');
}

/* ---------- choreography ---------- */
function walkTo(t) {
  return new Promise(res => {
    const J = S.J;
    const dist = Math.hypot(t.x - J.x, (t.y - J.y) * 1.4) / u;
    if (Math.abs(t.x - J.x) > 6) J.dir = Math.sign(t.x - J.x);
    const dur = Math.min(1200, Math.max(150, dist / (950 * S.rate) * 1000));
    J.mover = { sx: J.x, sy: J.y, ss: J.s, tx: t.x, ty: t.y, ts: t.s, t0: performance.now(), dur, res };
  });
}

async function perform(spec) {
  const J = S.J, M = S.M;
  S.busy = true; S.rate = spec.fast ? 4 : 1;
  const doc0 = { tag: spec.ext || 'DOC' };
  J.face = 'busy'; J.tape = 'ON IT'; J.pose = 'idle';
  say(spec.sayFetch());
  await walkTo(P.trayStand);
  J.pose = 'reach'; await wait(110);
  J.hold = doc0; S.tray.shown = Math.max(0, S.tray.shown - 1); J.pose = 'carry'; await wait(50);
  await walkTo(P.machineIn);
  J.dir = 1; J.pose = 'reach'; await wait(100);
  J.hold = null; M.state = 'run'; M.label = spec.label; J.tape = spec.label; J.pose = 'type';
  say(spec.sayProcess());
  let result, error;
  const work = spec.work.then(r => { result = r; }, e => { error = e; });
  await Promise.all([work, wait(420)]);
  if (error) {
    M.state = 'error'; J.face = 'dead'; J.tape = 'ERR'; J.pose = 'error'; J.shake = 1;
    const msg = spec.sayFail(error);
    say(msg, Math.max(3200, msg.length * 70));
    await wait(Math.max(1500, msg.length * 42));
    J.face = 'idle'; J.tape = 'READY'; J.pose = 'shrug'; await wait(300);
    await walkTo(P.home); J.dir = -1; J.pose = 'idle'; M.state = 'idle'; M.label = '';
    S.busy = false; S.rate = 1;
    return { ok: false, error };
  }
  M.state = 'done'; M.bell = 1; J.face = 'happy'; J.tape = 'DONE'; J.pose = 'idle';
  for (let i = 1; i <= 6; i++) { M.out = i / 6; await wait(30); }
  await walkTo(P.slot); J.dir = -1; J.pose = 'reach'; await wait(100);
  M.out = 0; J.hold = doc0; J.pose = 'carry'; await wait(60);
  await walkTo(P.front); J.dir = 1; J.pose = 'present';
  spec.handover(result);
  const msg = spec.sayDone(result);
  say(msg, Math.max(3600, msg.length * 70));
  await wait(Math.min(1700, Math.max(1100, msg.length * 28)));
  J.hold = null; J.pose = 'wave'; await wait(380);
  await walkTo(P.home); J.dir = -1; J.pose = 'idle'; J.face = 'idle'; J.tape = 'READY'; M.state = 'idle'; M.label = '';
  S.busy = false; S.rate = 1;
  return { ok: true, result };
}

/* ---------- public API ---------- */
function flyIn(tag, fromX, fromY) {
  S.flyers.push({ x0: fromX == null ? W * 0.5 : fromX, y0: fromY == null ? -20 : fromY, p: 0, d: 0.45, tag: tag || 'DOC' });
}
function setTrayCount(n) { S.tray.shown = n; S.flyers = []; }
function trayHit(px, py) { const p = P.tray; return Math.abs(px - p.x) < 80 * u && py > p.y - 90 * u && py < p.y + 14 * u; }
function jimmyHit(px, py) { const J = S.J; return Math.abs(px - J.x) < 40 * u * J.s && py > J.y - 215 * u * J.s && py < J.y + 8; }
function init(canvas, stageEl, bubbleEl) {
  cv = canvas; stage = stageEl; bubble = bubbleEl; cx = cv.getContext('2d');
  layout();
  window.addEventListener('resize', () => { layout(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (Math.abs(stage.getBoundingClientRect().width - W) > 1) layout(); }).observe(stage);
  stage.addEventListener('pointermove', e => { const r = stage.getBoundingClientRect(); S.mouse.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)); S.mouse.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2)); });
  window.addEventListener('deviceorientation', e => { if (e.gamma != null) { S.mouse.x = Math.max(-1, Math.min(1, e.gamma / 30)); S.mouse.y = Math.max(-1, Math.min(1, (e.beta - 40) / 40)); } });
  requestAnimationFrame(loop);
  // keep timelines moving even if the tab is hidden (rAF pauses there)
  setInterval(() => { if (document.hidden) update(0.1); }, 100);
}

window.JimmyScene = {
  init, say, perform, flyIn, setTrayCount, trayHit, jimmyHit,
  hint: v => { S.tray.hint = v ? 1 : 0; },
  isBusy: () => S.busy,
  setVoice: v => { voiceOn = !!v; if (!v && 'speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} } },
  trayShown: () => S.tray.shown,
  state: S
};
})();
