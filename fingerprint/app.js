/* Fingerprint app v0 — private (24 Nov 2026, decided in the Fingerprint chat). Read-only on HoloTrack's data through the fp_
   views; writes only its own user tables. Words and number rules: spec v1.0 §1 (no buy / sell / cheap / expensive words). */
const SUPABASE_URL = "https://uhkvzsjaavcbawuhvrkz.supabase.co";
const SUPABASE_KEY = "sb_publishable_ny_oW8k07iVbf2I-WiaORw_wbS83Jid";   // publishable: safe in a page; every fp_ view checks the allow-list
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: "fp-auth" } });
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const PREVIEW = /^(localhost|127\.)/.test(location.hostname) && /[?&]preview\b/.test(location.search);   // local screenshots: fixture data, no sign-in
const FP = { tab: "collection", rows: null, weekly: {} };
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- number rules (§1) ---------- */
const chf = v => v == null ? "–" : "CHF " + (v >= 100 ? Math.round(v).toLocaleString("en-US") : (+v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const xm = r => "×" + (r < 1 ? r.toFixed(2) : r < 100 ? r.toFixed(1) : Math.round(r).toLocaleString("en-US"));
function gap(l) {                                  // market vs fair: ×1.5 and over as ×, under as a signed %
  if (l == null) return null;
  const r = Math.exp(l), up = l > 0;
  const txt = (r >= 1.5 || r <= 1 / 1.5) ? xm(r) : (up ? "+" : "−") + Math.abs((r - 1) * 100).toFixed(1) + " %";
  return { txt, cls: up ? "up" : "dn" };
}
const LOOK = { "special illustration": "Special illustration", illustration: "Illustration", "alt art": "Alt art", "full art": "Full art", plain: "Plain", gallery: "Gallery" };

/* ---------- data ---------- */
async function q(build) { const { data, error } = await build; if (error) throw error; return data || []; }
async function loadCollection() {
  if (PREVIEW) return (await fetch("preview.json").then(r => r.json())).collection;
  return q(sb.from("fp_collection_rows").select("*").range(0, 1999));
}
async function loadWeekly(ids) {
  const need = ids.filter(id => !(id in FP.weekly));
  if (PREVIEW) { const W = (await fetch("preview.json").then(r => r.json())).weekly; need.forEach(id => FP.weekly[id] = W[id] || null); return; }
  for (let i = 0; i < need.length; i += 60) {
    const part = need.slice(i, i + 60);
    const rows = await q(sb.from("fp_card_weekly").select("card_id,weeks,market_chf,fair_chf,sales").in("card_id", part));
    part.forEach(id => FP.weekly[id] = null);
    rows.forEach(r => FP.weekly[r.card_id] = r);
    const miss = part.filter(id => !FP.weekly[id]);          // (lab round 2) no fair-price line → the market line alone, drawn grey
    if (miss.length) { const ml = await q(sb.rpc("fp_market_line", { ids: miss })).catch(() => []);
      ml.forEach(r => { if (r.weeks && r.weeks.length > 1) FP.weekly[r.card_id] = { card_id: r.card_id, weeks: r.weeks, market_chf: r.market_chf, fair_chf: null, sales: null, marketOnly: true }; }); }
  }
}

/* ---------- the fingerprint (spiral): one turn per month since March 2024 ---------- */
// life-cycle phase of the card's set on a day (pf_events P32: new print / in print / out of print) → shade step 1 / 2 / 3
function phaseAt(phases, ms) {
  let best = null;
  for (const p of phases || []) { const a = Date.parse(p.day + "T00:00:00Z"), b = p.day_end ? Date.parse(p.day_end + "T00:00:00Z") : Infinity;
    if (ms >= a && ms < b && (!best || a >= best.a)) best = { a, k: /new/i.test(p.label) ? 1 : /out/i.test(p.label) ? 3 : 2 }; }
  return best ? best.k : null;
}
/* ---------- the fingerprint, ported 1:1 from the lab's drawing/fx/v3/ringprint3.py ring_svg() (27 Nov) ----------
   One continuous spiral, one turn per month (each month starts at 12 o'clock), oldest at the centre; weeks from Monday 4 Mar 2024.
   Colour = above (orange) / below (grey) fair, shaded by the set's print phase; width = size of the gap; strands = sales that week;
   the line wiggles off its 9-week mean. History (size 400) adds day ticks, month and year labels, event dots, reprint bars,
   the dotted spiral before price history, and peak / low / now labels at rest. Minis (size 200) are the same line, simpler. */
const R3 = { START: Date.UTC(2024, 2, 4), WEEK: 7 * 864e5, SF: "-apple-system,'SF Pro Text',Inter,sans-serif", SFM: "ui-monospace,'SF Mono',Menlo,monospace" };
const ymd = ms => new Date(ms).toISOString().slice(0, 10);
function mon(ms) { const d = new Date(ms), y = d.getUTCFullYear(), m = d.getUTCMonth(), dim = (Date.UTC(y, m + 1, 1) - Date.UTC(y, m, 1)) / 864e5;
  return (y - 2024) * 12 + (m + 1) - 3 + (d.getUTCDate() - 1) / dim; }
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* the app's weekly line → ringprint's arrays: weeks start Monday (the refit's week), from 4 Mar 2024; a week without a fair price
   (before the first refit) is a break; low tier: fair = market, drawn grey, never a break */
function normW(w, low) {
  if (!w || !w.weeks || w.weeks.length < 2) return null;
  const out = { t: [], mk: [], fair: [], sales: [], miss: new Set(), nofair: !!low };
  w.weeks.forEach((d, i) => {
    const ms0 = Date.parse(d + "T00:00:00Z"), wd = new Date(ms0).getUTCDay(), ms = ms0 + (wd === 0 ? 1 : 1 - wd) * 864e5;   // → that week's Monday
    const m = +w.market_chf[i]; if (ms < R3.START || !(m > 0)) return;
    const f = w.fair_chf ? w.fair_chf[i] : null, s = w.sales ? w.sales[i] : null, k = out.t.length;
    out.t.push(ms); out.mk.push(m); out.sales.push(s == null ? -1 : +s);
    if (low) out.fair.push(m); else if (f > 0) out.fair.push(+f); else { out.fair.push(m); out.miss.add(k); }
  });
  return out.t.length >= 2 ? out : null;
}
function ringSvg(D, { size = 400, uid = "a", mini = false, phases = null, reprints = [], evs = [], rel = null, preEvs = [], name = "" } = {}) {
  const C = size / 2, RR = size * (mini ? .485 : .47), r0 = size * (mini ? .05 : .085);
  const { mk, fair, sales, miss, t } = D, N = mk.length;
  const U = mon(t[N - 1]) + .25, step = (RR - size * (mini ? .01 : .03) - r0) / U;
  const P = (th, r) => [C + r * Math.cos(th), C + r * Math.sin(th)], pos = (u, extra = 0) => P(-Math.PI / 2 + 2 * Math.PI * u, r0 + u * step + extra);
  const g = mk.map((a, i) => Math.log(a / fair[i]));
  const ss = sales.filter(v => v >= 0).sort((a, b) => a - b); if (!ss.length) ss.push(0); const t1 = ss[Math.floor(ss.length / 3)], t2 = ss[Math.floor(2 * ss.length / 3)];
  const sm = g.map((_, i) => { const a = g.slice(Math.max(0, i - 4), i + 5); return a.reduce((x, y) => x + y, 0) / a.length; });
  const PH_UP = { new: "var(--fp-1)", print: "var(--fp-2)", oop: "var(--fp-3)" }, PH_DN = { new: "var(--gr-1)", print: "var(--gr-2)", oop: "var(--gr-3)" };
  const phaseAt3 = ms => { for (const [a, b, ph] of phases || []) if (a <= ms && ms < b) return ph; return null; };
  const segStyle = i => { const gi = g[i], ph = phaseAt3(t[i]);
    const col = ph ? (gi > 0 ? PH_UP : PH_DN)[ph] : gi > 0 ? (gi > .25 ? "var(--fp-3)" : gi > .1 ? "var(--fp-2)" : "var(--fp-1)") : "var(--fp-dn)";
    return [col, 1 + 2.6 * Math.min(1, Math.abs(gi) / .35)]; };
  const s = [], glow = [], f1 = x => x.toFixed(1), f2 = x => x.toFixed(2);
  if (!mini) {
    for (let d = 0; d < 31; d++) { const th = -Math.PI / 2 + 2 * Math.PI * d / 31, a = P(th, RR + size * .008), b = P(th, RR + size * (d % 7 === 0 ? .026 : .017));
      s.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" style="stroke:var(--tick);stroke-width:.6px;stroke-opacity:.6"/>`); }
    const gp = 2.4 * Math.PI / 180;
    for (const [d0, d1] of [[0, 7], [7, 14], [14, 21], [21, 31]]) { const a = P(-Math.PI / 2 + 2 * Math.PI * d0 / 31 + gp / 2, RR), b = P(-Math.PI / 2 + 2 * Math.PI * d1 / 31 - gp / 2, RR);
      s.push(`<path d="M${f1(a[0])},${f1(a[1])} A${RR},${RR} 0 0 1 ${f1(b[0])},${f1(b[1])}" style="fill:none;stroke:var(--muted);stroke-width:.7px;stroke-opacity:.45"/>`); }
    for (const [dn, lab] of [[0, "1st"], [7, "8th"], [14, "15th"], [21, "22nd"]]) { const [x, y] = P(-Math.PI / 2 + 2 * Math.PI * dn / 31, RR + size * .045);
      s.push(`<text x="${f1(x)}" y="${f1(y)}" font-family="${R3.SFM}" font-size="${f1(size * .032)}" font-weight="600" text-anchor="middle" dominant-baseline="central" class="t-muted">${lab}</text>`); }
  }
  for (let i = 0; i < N - 1; i++) {
    if (miss.has(i) || miss.has(i + 1)) continue;
    const u0 = mon(t[i]), u1 = mon(t[i] + R3.WEEK), [col, wm] = segStyle(i), up = g[i] > 0, rec = i / (N - 1);
    const k = mini || sales[i] < 0 ? 1 : sales[i] < t1 ? 1 : sales[i] < t2 ? 2 : 3;
    const fade = mini ? 1 : .45 + .55 * rec, op = (up ? (mini ? .85 : .95) : (mini ? .6 : .8)) * fade, sw = size * (mini ? .005 : .0016) * wm;
    const wa = Math.max(-1, Math.min(1, (g[i] - sm[i]) / .06)) * step * .42, wb = Math.max(-1, Math.min(1, (g[i + 1] - sm[i + 1]) / .06)) * step * .42;
    for (let j = 0; j < k; j++) {
      const off = (j - (k - 1) / 2) * (size * (.0016 * wm + .0012)), pts = [];
      for (let q = 0; q <= 8; q++) { const f = q / 8; pts.push(pos(u0 + (u1 - u0) * f, off + wa + (wb - wa) * f)); }
      const el = `<path${i >= N - 5 ? ' class="nw"' : ""} d="M${pts.map(([x, y]) => f1(x) + "," + f1(y)).join(" L")}" style="fill:none;stroke:${col};stroke-width:${f2(sw)}px;stroke-linecap:round" opacity="${f2(op)}"/>`;
      (up ? glow : s).push(el);
    }
  }
  s.push(`<g filter="url(#${uid}fg)">${glow.join("")}</g>`);
  for (const rd of reprints) { const u = mon(rd), a = pos(u, -step * 1.1), b = pos(u, step * 1.1);
    s.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" style="stroke:var(--ink);stroke-width:${f1(size * .007)}px;stroke-linecap:round"/>`); }
  const pts = t.map(ms => pos(mon(ms)));                 // each week's place on the spiral (scrubber, drag)
  if (!mini) {
    for (const y of [2025, 2026]) { const dd = Date.UTC(y, 6, 1); if (Date.UTC(2024, 2, 1) < dd && dd <= t[N - 1]) { const [x, yy] = pos(mon(dd));
      s.push(`<text x="${f1(x - size * .016)}" y="${f1(yy)}" font-family="${R3.SFM}" font-size="${f1(size * .03)}" font-weight="600" text-anchor="end" dominant-baseline="central" class="t-muted halo">Jul</text>`);
      s.push(`<line x1="${f1(x - size * .011)}" y1="${f1(yy)}" x2="${f1(x - size * .002)}" y2="${f1(yy)}" style="stroke:var(--muted);stroke-width:.8px"/>`); } }
    for (const yr of [2025, 2026]) { const [x, y] = pos(mon(Date.UTC(yr, 0, 1))), w = size * .1;
      s.push(`<rect x="${f1(x - w / 2)}" y="${f1(y - size * .019)}" width="${f1(w)}" height="${f1(size * .038)}" rx="${f1(size * .019)}" style="fill:var(--card);stroke:var(--rule)"/>`);
      s.push(`<text x="${f1(x)}" y="${f1(y + size * .001)}" font-family="${R3.SFM}" font-size="${f1(size * .025)}" font-weight="600" text-anchor="middle" dominant-baseline="central" class="t-ink">${yr}</text>`); }
    evs.forEach((e, i) => { if (e.ms < R3.START || e.ms > t[N - 1] + R3.WEEK) return; const [x, y] = pos(mon(e.ms)); const d = new Date(e.ms);
      s.push(`<circle class="ev" data-e="${i}" cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * .0068)}" style="fill:var(--card);stroke:var(--fp-ev);stroke-width:1px"><title>${esc(e.label)}, ${String(d.getUTCDate()).padStart(2, "0")} ${MON3[d.getUTCMonth()]} ${d.getUTCFullYear()}</title></circle>`); });
    { const [x, y] = pos(mon(R3.START)); s.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * .006)}" style="fill:var(--ink)"/>`); }
    { const [x, y] = pos(mon(t[N - 1])); s.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * .016)}" style="fill:none;stroke:var(--ink);stroke-width:1.3px"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * .006)}" style="fill:var(--ink)"/>`); }
    // 1) dotted spiral before price history: from the card's release to the start, squeezed into the core
    if (rel != null && rel < R3.START) { const u_rel = mon(rel), rin = size * .018, ppos = u => P(-Math.PI / 2 + 2 * Math.PI * u, rin + (u - u_rel) / (0 - u_rel) * (r0 - rin));
      for (let u = u_rel; u < 0; u += 1 / 23.7) { const [x, y] = ppos(u); s.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${(size * .0022).toFixed(2)}" style="fill:var(--muted)" opacity=".55"/>`); }
      for (const ed of preEvs) if (rel <= ed && ed < R3.START) { const [x, y] = ppos(mon(ed)); s.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * .0055)}" style="fill:var(--card);stroke:var(--fp-ev);stroke-width:1px"><title>before price history</title></circle>`); } }
    // 2) peak, low and now labelled at rest (labels that would overlap are moved apart)
    if (!D.nofair) {
      const iN = N - 1, ok = [...Array(N).keys()].filter(i => !miss.has(i)), okk = ok.length ? ok : [...Array(N).keys()];
      const ip = okk.reduce((a, b) => g[b] > g[a] ? b : a), il = okk.reduce((a, b) => g[b] < g[a] ? b : a), placed = [];
      const pct0 = v => (v >= 0 ? "+" : "−") + Math.abs(Math.round(v)) + " %", pct1 = v => (Math.abs(v) < 10 ? (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) : (v >= 0 ? "+" : "−") + Math.abs(Math.round(v))) + " %";
      for (const [i, lab] of [[ip, "peak"], [il, "low"], [iN, "now"]]) {
        const d = new Date(t[i]), u = mon(t[i]), th = -Math.PI / 2 + 2 * Math.PI * u, [x, y] = pos(u), v = Math.exp(g[i]) * 100 - 100;
        const txt = lab !== "now" ? `${lab} ${MON3[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)} · ${pct0(v)}` : "now · " + pct1(v);
        const fs = size * .034, tw = txt.length * fs * .56 + size * .03, R2 = RR + size * .012, [ex, ey] = P(th, R2), right = Math.cos(th) >= 0;
        let bx = Math.min(Math.max(right ? ex + size * .01 : ex - tw - size * .01, -size * .06), size * 1.06 - tw), by = Math.min(Math.max(ey - fs * .75, -size * .06), size * 1.03);
        for (let n = 0; n < 6; n++) { if (!placed.some(([px, py, pw]) => bx < px + pw && px < bx + tw && by < py + fs * 1.5 + size * .008 && py < by + fs * 1.5 + size * .008)) break; by += ey < size / 2 ? fs * 1.75 : -fs * 1.75; }
        placed.push([bx, by, tw]);
        s.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * .011)}" style="fill:var(--card);stroke:var(--ink);stroke-width:1.4px"/>`);
        s.push(`<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(right ? bx : bx + tw)}" y2="${f1(by + fs * .75)}" style="stroke:var(--muted);stroke-width:.6px;stroke-opacity:.8"/>`);
        s.push(`<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(tw)}" height="${f1(fs * 1.5)}" rx="${f1(fs * .4)}" style="fill:var(--card);stroke:var(--rule)"/>`);
        s.push(`<text x="${f1(bx + tw / 2)}" y="${f1(by + fs * .78)}" font-family="${R3.SF}" font-size="${f1(fs)}" font-weight="600" text-anchor="middle" dominant-baseline="central" class="t-ink">${txt}</text>`);
      }
    }
  }
  const defs = `<defs><filter id="${uid}fg" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceGraphic" stdDeviation="${mini ? 3 : 2.4}" result="b0"/>` +
    `<feComponentTransfer in="b0" result="b"><feFuncA type="linear" slope="${mini ? .35 : .45}"/></feComponentTransfer><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  const pad = size * (mini ? .02 : .065), vb = Math.round(-pad), vs = Math.round(size + 2 * pad);
  return { pts, svg: `<svg class="${mini ? "fp mini" : "fp"}" viewBox="${vb} ${vb} ${vs} ${vs}" role="img" aria-label="Fingerprint of ${esc(name)}: one spiral turn per month since March 2024, ${D.nofair ? "grey throughout: low-tier cards have no fair price" : "orange where the price sat above the fair price"}">${defs}${s.join("")}</svg>` };
}

// no fair line → the grey market line (lab round 2)
const NONE_YET = `<svg viewBox="0 0 64 64" role="img" aria-label="No history yet"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--gr-2)" stroke-width="1.5" stroke-dasharray="2 4"/><text class="none" x="32" y="35" text-anchor="middle">none yet</text></svg>`;
let MINI_N = 0;
function miniFor(w, name, low) { const D = normW(w, low || !!(w && (!w.fair_chf || !w.fair_chf.some(v => v > 0)))); return D ? ringSvg(D, { size: 200, mini: true, uid: "m" + (MINI_N++), name }).svg : NONE_YET; }
function miniSvg(r) { return miniFor(FP.weekly[r.card_id], r.name, r.segment === "low"); }
// life-cycle phases for the ring: pf_events P32 rows → [from, to, new | print | oop]
const ringPhases = phases => (phases || []).map(p => [Date.parse(p.day + "T00:00:00Z"), p.day_end ? Date.parse(p.day_end + "T00:00:00Z") : Infinity, /new/i.test(p.label) ? "new" : /out/i.test(p.label) ? "oop" : "print"]);

/* ---------- breathing (§1 motion): one breath every 14 − 1.8·ln(1 + weekly sales) s, never faster than 7.5 s ---------- */
const breathers = [];
function period(sales4w) { return Math.max(7.5, 14 - 1.8 * Math.log(1 + (sales4w || 0) / 4)); }
function frame(ms) {
  for (const b of breathers) {
    if (!b.els.length || !b.els[0].isConnected) continue;
    const k = REDUCE.matches ? 1 : 1 + b.depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * (ms / 1000) / b.per)), c = b.c;
    for (const e of b.els) if (REDUCE.matches) e.removeAttribute("transform"); else e.setAttribute("transform", `translate(${c} ${c}) scale(${k.toFixed(4)}) translate(${-c} ${-c})`);
  }
requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- screens ---------- */
const head = () => `<div class="top"><span class="label">Fingerprint</span><span class="private">PRIVATE</span></div>`;
function rowValue(r) {
  if (r.held) return `<span class="cv">${chf(r.market_chf)}<i>Fair price under review</i></span>`;
  if (r.segment === "low") return `<span class="cv">${chf(r.market_chf)}${r.context_median_chf && r.context_n >= 5 ? `<i>similar ${chf(r.context_median_chf)}</i>` : ""}</span>`;
  const g = gap(r.l);
  if (g && r.fair_chf) return `<span class="cv">${chf(r.market_chf)}<em class="${g.cls}">${g.txt}</em><i>fair ${chf(r.fair_chf)}</i></span>`;
  return `<span class="cv">${chf(r.market_chf)}<i>${r.in_model ? "no fair price yet" : "outside the fair-price model"}</i></span>`;
}
async function collection() {
  $("view").innerHTML = head() + `<h1>Collection</h1><p class="sub">Loading…</p>`;
  let rows;
  try { rows = FP.rows = FP.rows || await loadCollection(); }
  catch (e) { $("view").innerHTML = head() + `<h1>Collection</h1><p class="sub">Couldn't load your cards. Try again in a moment.</p>`; return; }
  rows.sort((a, b) => FP.csort === "market" ? (b.market_chf || 0) - (a.market_chf || 0) : String(a.added_at || "").localeCompare(String(b.added_at || "")));
  const n = rows.reduce((s, r) => s + (r.qty || 1), 0), tot = rows.reduce((s, r) => s + (r.market_chf || 0) * (r.qty || 1), 0);
  if (!rows.length) {
    $("view").innerHTML = head() + `<h1>Collection</h1><p class="sub">0 cards</p><div class="box empty">
      <svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--gr-2)" stroke-width="1.5" stroke-dasharray="2 4"/></svg>
      <p>Your cards appear here with their fingerprints.</p></div>`; return;
  }
  await loadWeekly(rows.map(r => r.card_id)).catch(() => {});
  if (FP.tab !== "collection") return;
  FP.cgroup = FP.cgroup || "card";
  const grp = `<div class="segc" role="group"><button data-cg="card" aria-selected="${FP.cgroup === "card"}">By card</button><button data-cg="set" aria-selected="${FP.cgroup === "set"}">By set</button></div>`;
  if (FP.cgroup === "set") { await collectionBySet(rows, n, tot, grp); return; }
  $("view").innerHTML = head() + `<h1>Collection</h1><p class="sub">${n.toLocaleString("en-US")} cards · market ${chf(tot)}</p>${grp}
    <div class="list">${rows.map(r => `<button class="crow" data-id="${esc(r.card_id)}">
      <span class="mini">${miniSvg(r)}</span>
      <span class="cm"><b>${esc(r.name)}${r.qty > 1 ? ` <span style="color:var(--muted);font-weight:500">×${r.qty}</span>` : ""}</b>
        <span>${esc(r.set_name || r.set_id)} · ${esc(RARW[r.look] || LOOK[r.look] || r.look)} · ${esc(r.num)}${r.official_count && /^\d+$/.test(r.num) ? "/" + r.official_count : ""}</span>${rowValue(r)}</span>
      <svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>`).join("")}</div>
    <p class="foot">Small fingerprints breathe at each card's own trading pace, half as deep as on the card.</p>
    <p class="foot">${FP.csort === "market" ? `<button class="lnk" data-cs="added">Order: as added</button>` : `<button class="lnk" data-cs="market">Sort by market price</button>`} · TCGplayer market price · fair price from HoloTrack's model (weekly refit).</p>`;
  breathers.length = 0;
  document.querySelectorAll(".crow").forEach(b => {
    const r = rows.find(x => x.card_id === b.dataset.id), els = [...b.querySelectorAll("path.nw")];
    if (els.length) breathers.push({ els, per: period(r.sales_4w), depth: 0.007, c: 100 });     // half depth for the minis (prototype)
    b.onclick = () => { location.hash = "card/" + encodeURIComponent(b.dataset.id); };
  });
  cgroupBind();
}
function cgroupBind() { document.querySelectorAll("[data-cg]").forEach(b => b.onclick = () => { FP.cgroup = b.dataset.cg; collection(); });
  document.querySelectorAll("[data-cs]").forEach(b => b.onclick = () => { FP.csort = b.dataset.cs; collection(); }); }
async function collectionBySet(rows, n, tot, grp) {           // (26 Nov, Set screen) Collection → group by set → set row
  let L = []; try { L = await loadSets(); } catch (e) { }
  if (FP.tab !== "collection") return;
  const info = Object.fromEntries(L.map(s => [s.set_id, s])), by = {};
  rows.forEach(r => { (by[r.set_id] = by[r.set_id] || { set_id: r.set_id, name: r.set_name || r.set_id, n: 0, mkt: 0 }); by[r.set_id].n += (r.qty || 1); by[r.set_id].mkt += (r.market_chf || 0) * (r.qty || 1); });
  const G = Object.values(by).sort((a, b) => b.mkt - a.mkt);
  $("view").innerHTML = head() + `<h1>Collection</h1><p class="sub">${n.toLocaleString("en-US")} cards in ${G.length} sets · market ${chf(tot)}</p>${grp}
    <div class="list">${G.map(g => `<button class="srow" data-set="${esc(g.set_id)}"><span class="cm"><b>${esc(g.name)}</b><span>${g.n} card${g.n === 1 ? "" : "s"} · market ${chf(g.mkt)}</span>
      <span class="srm">${phaseChip(info[g.set_id])}</span></span><svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>`).join("")}</div>`;
  document.querySelectorAll(".srow").forEach(b => b.onclick = () => { location.hash = "set/" + encodeURIComponent(b.dataset.set); });
  cgroupBind();
}
/* ---------- card → Today (spec §3.1, §4) ---------- */
const COUNTED = s => /^counted/.test(s || "");
async function loadCard(id) {
  if (PREVIEW) { const P = await fetch("preview.json").then(r => r.json()); return P.cards[id] || null; }
  const [h, parts, beside, nick] = await Promise.all([
    q(sb.from("fp_card_header").select("*").eq("card_id", id)).then(r => r[0] || null)
      .then(h => h || q(sb.from("fp_card_header_low").select("*").eq("card_id", id)).then(r => r[0] || null).catch(() => null)),   // (27 Nov) low tier outside today's fit
    q(sb.from("fp_card_parts").select("n,name,family,contribution,raw,no_effect").eq("card_id", id)),
    q(sb.from("fp_card_beside").select("n,name,value,raw,flag,detail").eq("card_id", id)),
    q(sb.from("fp_nicknames").select("nickname,source_name,source_url").eq("card_id", id)).catch(() => [])]);   // (26 Nov) curated nicknames
  return h && { h, parts, beside, nick: (nick || [])[0] || null };
}
async function texts() {
  if (FP.texts) return FP.texts;
  const T = PREVIEW ? (await fetch("preview.json").then(r => r.json())).texts : await q(sb.from("fp_param_text").select("*").order("n"));
  return FP.texts = T;
}
const pct = (k, d = 0) => { const v = (Math.exp(k) - 1) * 100; return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d) + " %"; };
function besideText(n, b, h) {
  if (n === 21 && b && b.detail) return `${pct(b.detail.k4)} in 4 weeks · ${pct(b.detail.k8)} in 8 · ${pct(b.detail.k26)} in 26`;   // rows keep each part on one line (.pv span)
  if (n === 22 && b && b.value != null) return `${Math.round(b.value * 100)} % below its 52-week high`;
  if (n === 23 && b && b.value != null) return `${pct(Math.log(1 + b.value))} against its 12-month average`;
  if (n === 24 && h.l != null && h.segment !== "low") { const g = gap(h.l); return `${g.txt} ${h.l > 0 ? "above" : "below"} fair`; }
  if (n === 25 && h.market_chf) return chf(h.market_chf);
  if (n === 26 && h.sales_4w != null) { const w = h.sales_4w / 4; return w < 0.75 ? `${h.sales_4w} sales in 4 weeks` : `about ${Math.round(w)} sale${Math.round(w) === 1 ? "" : "s"} a week`; }
  return b && b.raw ? b.raw : null;
}
function bar(h) {
  if (!h.band80_lo || !h.band80_hi || !h.fair_chf) return "";
  const lo = Math.log(h.band80_lo) - 0.12, hi = Math.log(h.band80_hi) + 0.12, X = v => Math.max(0, Math.min(100, (Math.log(v) - lo) / (hi - lo) * 100));
  const m = h.market_chf, above = m > h.fair_chf, out = m > h.band80_hi || m < h.band80_lo;
  return `<div class="bar" aria-hidden="true"><div class="b80" style="left:${X(h.band80_lo)}%;right:${100 - X(h.band80_hi)}%"></div>
    <div class="b50" style="left:${X(h.band50_lo)}%;right:${100 - X(h.band50_hi)}%"></div><div class="fair" style="left:${X(h.fair_chf)}%"></div>
    ${m ? `<div class="mkt ${above ? "above" : ""} ${out ? (m > h.band80_hi ? "out r" : "out l") : ""}" style="left:${X(m)}%"></div>` : ""}</div>
    <div class="bl"><span>80 %: ${Math.round(h.band80_lo).toLocaleString("en-US")}–${Math.round(h.band80_hi).toLocaleString("en-US")}</span><span>middle half: ${Math.round(h.band50_lo).toLocaleString("en-US")}–${Math.round(h.band50_hi).toLocaleString("en-US")}</span></div>`;
}
function headerBox(h) {
  if (h.segment === "low") {
    const ok = h.context_median_chf && h.context_n >= 5;
    return `<div class="box"><div class="hd"><div class="mk"><small>Market</small><b>${chf(h.market_chf)}</b></div>
      ${ok ? `<div class="fr"><small>Similar cards in this set</small><b>${chf(h.context_median_chf)}</b></div>` : ""}</div>
      <p class="ctx">${ok ? `median of ${h.context_n} ${esc(h.context_label || "similar cards")}, this card left out. ` : ""}Context, not a fair price: low-tier cards have none yet.</p>
      <div class="facts">${h.sales_4w != null ? `<span><b>${h.sales_4w}</b> sales in 4 weeks</span>` : ""}${h.character ? `<a class="setl" href="#char/${encodeURIComponent(h.character)}">${h.character_cards ? `<b>${h.character_cards}</b> ` : ""}${esc(h.character)} cards</a>` : ""}</div></div>`;
  }
  const g = gap(h.l);
  return `<div class="box"><div class="hd"><div class="mk"><small>Market</small><b>${chf(h.market_chf)}</b></div>
    <div class="fr"><small>Fair price</small>${h.held ? `<b style="font-size:15px;color:var(--muted)">Fair price under review</b>` : `<b>${chf(h.fair_chf)}</b>${g ? `<em class="${g.cls}">${g.txt}</em>` : ""}`}</div></div>
    ${h.held ? "" : bar(h)}
    <div class="facts">${h.sales_4w != null ? `<span><b>${h.sales_4w}</b> sales in 4 weeks</span>` : ""}${h.character && h.character_cards ? `<a class="setl" href="#char/${encodeURIComponent(h.character)}"><b>${h.character_cards}</b> ${esc(h.character)} cards</a>` : h.character ? `<a class="setl" href="#char/${encodeURIComponent(h.character)}">${esc(h.character)} cards</a>` : ""}</div>
    <p class="src">TCGplayer market price, ${esc(h.day)} · fair price: HoloTrack's model, weekly refit</p></div>`;
}
function plist(C, T) {                                  // (27 Nov) groups follow the flow's statuses, as the prototype's list
  const h = C.h, parts = Object.fromEntries(C.parts.map(p => [p.n, p])), bes = Object.fromEntries(C.beside.map(b => [b.n, b]));
  const FS = Object.fromEntries(flowParams(C, T).map(p => [p.n, p.st]));
  const counted = [], beside = [], events = [], notyet = [];
  for (const t of T) {
    const st = FS[t.n], p = parts[t.n];
    if (h.segment !== "low" && p && (COUNTED(t.status) || st === "counted")) { const r = Math.exp(p.contribution); counted.push([t, p.no_effect ? "×1 · adds nothing" : xm(r), p.no_effect ? "m" : r > 1 ? "up" : "m", p.no_effect ? -1 : Math.abs(p.contribution)]); }
    else if (st === "beh") beside.push([t, besideText(t.n, bes[t.n], h), ""]);
    else if (st === "event") events.push([t, "dots on the fingerprint", "m"]);
    else if (t.status === "baseline") continue;            // lab ruling 2: sets the comparison group — shown on Why's first line, not as a row
    else if (COUNTED(t.status)) notyet.push([t, h.segment === "low" ? "not counted for low-tier cards" : `not counted for ${h.segment} cards`, "m"]);
    else if (t.status === "behaviour") notyet.push([t, "not in the app yet", "m"]);
    else notyet.push([t, t.status === "copy" ? "your copy" : t.status === "empty" || st === "none" ? "empty" : "observed", "m"]);
  }
  counted.sort((x, y) => y[3] - x[3]);
  const row = ([t, v, cls]) => `<button class="pr" data-n="${t.n}"><span>${esc(t.name)}<i>P${t.n}</i></span><span class="pv ${cls}">${String(v).split(" · ").map(x => x.length > 24 ? esc(x) : `<span class="nw">${esc(x)}</span>`).join(" · ")}</span></button>`;
  const grp = (title, rows, fold) => rows.length ? `<div class="pg"><div class="pgh">${title} · ${rows.length}</div>${fold ? `<div class="fold" hidden>${rows.map(row).join("")}</div><button class="more">Show all ${rows.length}</button>` : rows.map(row).join("")}</div>` : "";
  FP.order = [...counted, ...beside, ...events, ...notyet].map(([t]) => t.n);
  return `<div class="box plist">${grp("Counted in the fair price", counted)}${grp("Beside the price", beside)}${grp("Events", events)}${grp("Not yet counted", notyet, true)}</div>`;
}
const CHIP = { counted: "Counted in the fair price", behaviour: "Beside the price, never in it", event: "Dots on the fingerprint", observed: "Observed, not yet counted", empty: "Empty", copy: "Your copy only", baseline: "Sets the comparison" };
function sheet(n) {
  const C = FP.card, T = FP.texts, t = T.find(x => x.n === n); if (!t) return;
  const h = C.h, p = C.parts.find(x => x.n === n), st = COUNTED(t.status) ? "counted" : t.status;
  let on;
  if (st === "counted" && p && h.segment !== "low") on = p.no_effect ? `Counted, but ${esc(h.name)} equals the typical card here, so it adds nothing (×1).`
    : `<b class="${p.contribution > 0 ? "up" : ""}">${xm(Math.exp(p.contribution))}</b>${esc(stepLabel(C, p) || t.name)} · measured against the ${esc(h.typical_label || "typical card")}${h.typical_base_chf ? ` (${chf0(h.typical_base_chf)})` : ""}.`;
  else if (st === "counted") on = h.segment === "low" ? `Low-tier cards have no fair price yet, so nothing is measured against a typical card. The header shows similar cards in the same set as context.` : `Not counted for ${esc(h.segment)} cards.`;
  else if (st === "baseline") on = h.segment === "low" ? `Low-tier cards have no fair price yet, so nothing is measured against a typical card. The header shows similar cards in the same set as context.`
    : `Sets the comparison: ${esc(h.name)} is measured against the ${esc(h.typical_label || "typical card")}${h.typical_base_chf ? ` (${chf0(h.typical_base_chf)})` : ""}, and every counted parameter starts from there.`;
  else if (st === "behaviour") { const v = besideText(n, C.beside.find(b => b.n === n), h); on = v ? `<b>${esc(v)}</b>` : "Shown beside the price once its data reaches the app."; }
  else if (st === "event") on = "Shows as dots on the fingerprint. The events test (about 3 Dec) decides which kinds of event count.";
  else if (st === "empty") on = `Empty because ${esc(t.empty_reason || "no data yet")}.`;
  else if (st === "copy") on = "Only for a copy you own: add condition or grade to your copy to see it.";
  else on = "Collected for every card; not yet part of the fair price.";
  if (C.setSheet) on = C.setSheet;                       // (26 Nov, Set screen) P79 read for the whole set
  const i = FP.order.indexOf(n), prev = FP.order[i - 1], next = FP.order[i + 1];
  $("sheet").innerHTML = `<div class="grab"></div><div class="sh-top"><span>P${n} · ${esc((t.family || "").toUpperCase())}</span><button id="sdone">Done</button></div>
    <h3 id="s-name">${esc(t.name)}</h3><span class="chip ${st === "counted" ? "counted" : ""}">${CHIP[st] || esc(st)}</span>
    <div class="oncard">${on}</div>
    <dl>${t.what ? `<dt>What it is</dt><dd>${esc(t.what)}</dd>` : ""}${t.how ? `<dt>How it's measured</dt><dd>${esc(t.how)}</dd>` : ""}${t.low_note ? `<dt>Low</dt><dd>${esc(t.low_note)}</dd>` : ""}${t.high_note ? `<dt>High</dt><dd>${esc(t.high_note)}</dd>` : ""}</dl>
    ${C.nick ? `<p class="sfoot">“${esc(C.nick.nickname)}” — the name collectors use for this printing. Source: <a href="${esc(C.nick.source_url)}" target="_blank" rel="noopener">${esc(C.nick.source_name)}</a></p>` : ""}
    <div class="pn">${prev != null ? `<button data-go="${prev}">‹ Previous</button>` : "<span></span>"}${next != null ? `<button data-go="${next}">Next ›</button>` : ""}</div>`;
  $("sheet").classList.add("on"); $("scrim").classList.add("on"); $("sheet").scrollTop = 0; flowHighlight(n);
  $("sdone").onclick = closeSheet; $("sheet").querySelectorAll("[data-go]").forEach(b => b.onclick = () => sheet(+b.dataset.go));
}
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
document.addEventListener("click", e => { if (e.target && e.target.id === "scrim") closeSheet(); });
(() => { let y0 = null; document.addEventListener("touchstart", e => { const s = $("sheet"); y0 = s && s.contains(e.target) && s.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  document.addEventListener("touchend", e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 80) closeSheet(); y0 = null; }, { passive: true }); })();
function closeSheet() { $("sheet").classList.remove("on"); $("scrim").classList.remove("on"); flowHighlight(null); }
// one multiplier everywhere (lab 24 Nov): fair ÷ typical base from fp_card_header
const prodOf = (h, sum) => h.fair_chf && h.typical_base_chf ? h.fair_chf / h.typical_base_chf : Math.exp(sum || 0);
/* ---------- card → Today: the flow, ported 1:1 from the lab's fingerprint/reference/drawing/fx/v3/flow3.py (27 Nov) ----------
   Read top → bottom: the parameters on the upper arc in family groups (black arcs with counts), counted parameters as strings
   (one per 0.02 of log price), the sieve on the diameter (counted bar on its left, dashed "stops here"), the result on the black
   lower arc, behaviour and events as hairlines on the dotted "beside · events" arc. Same geometry, constants and labels as
   flow3.py with FP_REFINE=1 (the look Alex approved 18 Nov). Inputs are the app's own data: fp_param_text (families and status),
   fp_card_parts (counted contributions), fp_card_beside (readings), the weekly line and the card's events. */
const FL = { W: 380, H: 470, cx: 190, cy: 232, R: 170, LS: 1.22, STEP: 0.02, MONO: "ui-monospace,'SF Mono',Menlo,monospace",
  SF: "-apple-system,'SF Pro Text',Inter,sans-serif" };
const FAMF = { Identity: "I", State: "S", Context: "X", Lyrical: "L", Copy: "C" };
const FN = { I: "Identity", S: "State", X: "Context", L: "Lyrical", C: "Copy" };
const SHORT = { 1: "Character", 2: "Rarity tier", 3: "Scarcity", 4: "Set era", 9: "Artist", 10: "Card look", 20: "Set age", 32: "Out of print", 21: "Momentum",
  22: "Drawdown", 23: "Vs own avg", 25: "Price level", 26: "Liquidity", 33: "Talk", 37: "Anime, games", 38: "Competitive", 41: "Platform rules", 58: "Restocks",
  66: "Media phase", 69: "Game events", 71: "Print policy", 72: "Grading costs", 73: "Counterfeits", 74: "Celebrity", 65: "Time since release", 35: "Segment regime", 34: "Market tide" };
/* Python helpers, so numbers print as flow3.py prints them */
const pyRound = x => { const f = Math.floor(x), d = x - f; return d > .5 ? f + 1 : d < .5 ? f : (f % 2 === 0 ? f : f + 1); };
const f1 = x => x.toFixed(1);                                                     // Python {:.1f}
const pr = x => Number.isInteger(x) ? x + ".0" : String(x);                          // Python repr of a float
/* Python's random (MT19937, seeded as random.seed(int)) — the hairlines' opacity uses random.seed(4) in radial_ios.py */
function pyRandom(seed) {
  const mt = new Uint32Array(624); let mti = 625;
  const init = s => { mt[0] = s >>> 0; for (mti = 1; mti < 624; mti++) { const p = mt[mti - 1] ^ (mt[mti - 1] >>> 30); mt[mti] = (((((p & 0xffff0000) >>> 16) * 1812433253) << 16) + (p & 0x0000ffff) * 1812433253 + mti) >>> 0; } };
  init(19650218); let i = 1, j = 0; const key = [seed >>> 0], kl = 1;
  for (let k = Math.max(624, kl); k; k--) { const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
    mt[i] = ((mt[i] ^ (((((p & 0xffff0000) >>> 16) * 1664525) << 16) + ((p & 0x0000ffff) * 1664525))) + key[j] + j) >>> 0; i++; j++;
    if (i >= 624) { mt[0] = mt[623]; i = 1; } if (j >= kl) j = 0; }
  for (let k = 623; k; k--) { const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
    mt[i] = ((mt[i] ^ (((((p & 0xffff0000) >>> 16) * 1566083941) << 16) + (p & 0x0000ffff) * 1566083941)) - i) >>> 0; i++;
    if (i >= 624) { mt[0] = mt[623]; i = 1; } }
  mt[0] = 0x80000000; mti = 624;
  const g = () => { if (mti >= 624) { for (let k = 0; k < 624; k++) { const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); } mti = 0; }
    let y = mt[mti++]; y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18; return y >>> 0; };
  return () => ((g() >>> 5) * 67108864 + (g() >>> 6)) / 9007199254740992;
}
/* the card's parameters with the statuses flow3.py draws: counted · beh · event · obs · none · copy */
function flowParams(C, T) {
  const h = C.h, low = h.segment === "low", parts = Object.fromEntries(C.parts.map(p => [p.n, p])), bes = Object.fromEntries(C.beside.map(b => [b.n, b]));
  const evc = {}; (C.events || []).forEach(e => { const n = +String(e.n || "").replace(/^P/, ""), ms = Date.parse(e.day + "T00:00:00Z");   // (lab round 2) only events with a mark on the spiral
    if (n && ms >= R3.START && ms <= Date.now()) evc[n] = (evc[n] || 0) + 1; });
  const w = FP.weekly[h.card_id], mk = w && w.market_chf ? w.market_chf.map(Number) : null, sales = w && w.sales ? w.sales.map(v => v == null ? -1 : +v) : null;
  const behV = n => {                                     // threecards.py build(): the last value of each behaviour series
    if (!mk || mk.length < 5) return .5; const t = mk.length - 1;
    const smax = sales ? Math.max(...sales) : 0, st = sales ? sales[t] : -1;
    let v;
    if (n === 21) v = Math.abs(Math.log(mk[t] / mk[Math.max(0, t - 4)])) * 6;
    else if (n === 22) v = (1 - mk[t] / Math.max(...mk.slice(0, t + 1))) * 2.2;
    else if (n === 23) { const a = mk.slice(Math.max(0, t - 26), t + 1); v = Math.abs(Math.log(mk[t] / (a.reduce((x, y) => x + y, 0) / a.length))) * 3; }
    else if (n === 25) v = mk[t] / Math.max(...mk);
    else if (n === 26) v = smax > 0 ? st / smax : .5;
    else v = .25 + .6 * (smax > 0 ? st / smax : .5);
    return Math.min(1, v);
  };
  return T.filter(t => FAMF[t.family]).map(t => {
    const f = FAMF[t.family], p = parts[t.n], s = (t.status || "").toLowerCase();
    let st;
    if (f === "C") st = "copy";
    else if (p && !low && !p.no_effect && Math.abs(p.contribution) > 1e-9) st = "counted";
    else if (s.startsWith("counted") || s === "baseline" || s === "observed") st = "obs";   // tested, not counted here
    else if (s === "behaviour") st = besideText(t.n, bes[t.n], h) ? "beh" : "obs";          // no reading yet → collecting
    else if (s === "event") st = evc[t.n] ? "event" : "none";
    else if (s === "copy") st = "copy";
    else st = "none";
    return { n: t.n, f, name: t.name, st, coef: st === "counted" ? p.contribution : 0, v: st === "beh" ? behV(t.n) : 0, ev: evc[t.n] || 1 };
  });
}
function flowSvg(C, T) {
  const { W, cx, cy, R, LS, STEP, MONO } = FL, HY = cy, h = C.h, low = h.segment === "low", ID = "fl";
  const P = flowParams(C, T), rad = d => d * Math.PI / 180;
  const status = p => p.st, amount = p => ({ counted: Math.abs(p.coef), beh: .02 + .05 * Math.min(1, p.v || 0), event: .012 * p.ev, obs: .006, copy: .006 })[p.st] ?? .0018;
  const NEG = p => p.st === "counted" && p.coef < 0, COL = p => NEG(p) ? "var(--muted)" : `var(--c${p.f})`, SGN = p => p.st === "counted" ? p.coef : amount(p);
  const nm = p => SHORT[p.n] || p.name, NSTR = p => Math.max(1, pyRound(amount(p) / STEP));
  const XM = v => { const m = Math.exp(v); return m < 1 ? m.toFixed(2) : m.toFixed(1); };
  // family shares of the top arc: share of Σ|contribution| with a 4 % floor (fixture.py 'rule', decided 18 Nov); low tier: fixed
  const FIXED = { I: .52, S: .3, X: .08, L: .05, C: .05 };
  const FAMW = (() => { const cnt = P.filter(p => p.st === "counted"), tot = cnt.reduce((s, p) => s + Math.abs(p.coef), 0); if (low || !tot) return FIXED;
    const raw = Object.fromEntries("ISXLC".split("").map(f => [f, cnt.filter(p => p.f === f).reduce((s, p) => s + Math.abs(p.coef), 0) / tot]));
    const lo = Object.keys(raw).filter(f => raw[f] < .04), rest = 1 - .04 * lo.length, big = Object.keys(raw).filter(f => !lo.includes(f)).reduce((s, f) => s + raw[f], 0);
    return Object.fromEntries(Object.keys(raw).map(f => [f, lo.includes(f) ? .04 : raw[f] / big * rest])); })();
  // hairline opacity, as radial_ios.py: random.seed(4) over the parameters in family order I S X L C
  const rnd = pyRandom(4), CONF = {};
  for (const f of ["I", "S", "X", "L", "C"]) for (const p of P.filter(q => q.f === f))
    CONF[p.n] = p.st === "counted" ? .95 : p.st === "beh" ? .35 + .5 * rnd() : p.st === "event" ? .3 + .3 * rnd() : 1;
  const pt = (a, r = R) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const rc = (qx, qy, k = .38) => [qx + (cx - qx) * k, qy + (cy - qy) * k];
  const Tx = (x, y, t, size, cls, anchor = "start", rot = null, weight = 400, font = "sf") =>
    `<text x="${f1(x)}" y="${f1(y)}" font-family="${font === "mono" ? MONO : FL.SF}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" class="${cls}"${rot != null ? ` transform="rotate(${f1(rot)} ${f1(x)} ${f1(y)})"` : ""}>${esc(t)}</text>`;
  const radial_label = (x, y, deg, text, size, cls, weight) => { const a = ((deg % 360) + 360) % 360;
    return 90 < a && a < 270 ? Tx(x, y, text, size, cls, "end", a - 180, weight) : Tx(x, y, text, size, cls, "start", a, weight); };
  const fit = (r, a, text, size, cls, weight = 400) => { const L = text.length * size * .62, ex = cx + (r + 8 + L) * Math.cos(a);
    if (!(-12 <= ex && ex <= W + 12)) return ""; const [x, y] = pt(a, r + 8); return radial_label(x, y, ((a * 180 / Math.PI) % 360 + 360) % 360, text, size, cls, weight); };
  const s = [], LBL = [];
  const ORD = ["X", "I", "S", "L", "C"], order = ORD.flatMap(f => P.filter(p => p.f === f));
  const cnt = order.filter(p => p.st === "counted"), BEH = order.filter(p => p.st === "beh").sort((a, b) => amount(b) - amount(a)), EVT = order.filter(p => p.st === "event");
  const LAB = new Set([...cnt.map(p => p.n), ...BEH.slice(0, 2).map(p => p.n)]);
  // ---------- top arc: the parameters (192° → 348°)
  const a0 = rad(192), a1 = rad(348), fg = rad(3), usable = (a1 - a0) - fg * 4;
  let SG = 2.7, SW = 1.3; const NTOT = cnt.reduce((t, p) => t + NSTR(p), 0);
  if (NTOT) { SG = Math.min(SG, (.62 * usable * R - 6 * cnt.length) / NTOT); SW = Math.min(SW, SG * .6); }
  const seg = {}, famr = {}; let a = a0;
  for (const f of ORD) {
    const grp = order.filter(p => p.f === f), span = usable * FAMW[f], fa = a;
    const need = {}; grp.filter(p => p.st === "counted").forEach(p => need[p.n] = (NSTR(p) * SG + 6) / R);
    const rest = grp.filter(p => p.st !== "counted"), left = Math.max(span - Object.values(need).reduce((x, y) => x + y, 0), rest.length * rad(.4));
    const wsum = rest.reduce((t, p) => t + Math.sqrt(amount(p)), 0) || 1;
    for (const p of grp) { const da = need[p.n] || left * Math.sqrt(amount(p)) / wsum; seg[p.n] = [a, a + da]; a += da; }
    famr[f] = [fa, a]; a += fg;
  }
  const mid = n => (seg[n][0] + seg[n][1]) / 2;
  // ---------- the sieve: counted bar at the left end
  const HO = ["counted", "beh", "event", "obs", "none", "copy"];
  const hubw = p => ({ counted: NSTR(p) * SG * .8, beh: 3.2, event: 2.6, obs: 1.1, none: .8, copy: 1.1 })[p.st];
  const hw = Object.fromEntries(HO.map(u => [u, order.filter(p => p.st === u).reduce((t, p) => t + hubw(p), 0)])), hg = 8;
  const sc = (2 * R - 10 - hg * 5) / Object.values(hw).reduce((x, y) => x + y, 0);
  const hx = {}, hubpos = {}; let x = cx - R + 5;
  for (const u of HO) { const x0 = x;
    for (const p of order.filter(q => q.st === u).sort((p1, p2) => mid(p1.n) - mid(p2.n))) { const w = hubw(p) * sc; hx[p.n] = [x, x + w]; x += w; }
    hubpos[u] = [x0, x]; x += hg; }
  // strings and hairlines from the top arc down to the sieve
  for (const p of order) {
    const n = p.n, [x0, x1] = hx[n];
    if (p.st === "counted") { const N = NSTR(p), am = mid(n);
      for (let j = 0; j < N; j++) { const o = j - (N - 1) / 2, t = am + o * SG / R, [qx, qy] = pt(t, R - 2), hxj = x0 + (j + .5) * (x1 - x0) / N, c1 = rc(qx, qy);
        s.push(`<path data-p="${n}" data-t="${t.toFixed(5)}" data-hx="${f1(hxj)}" d="M${f1(qx)},${f1(qy)} C${f1(c1[0])},${f1(c1[1])} ${f1(hxj)},${f1(HY - Math.max(16, (HY - qy) * .55))} ${f1(hxj)},${HY - 4}" style="fill:none;stroke:${COL(p)};stroke-width:${pr(SW)}px" opacity="1"/>`); } }
    else { const [qx, qy] = pt(mid(n), R - 2), hxm = (x0 + x1) / 2, c1 = rc(qx, qy);
      const op = ({ beh: .55, event: .45, obs: .3, none: .18, copy: .3 })[p.st] * (p.st === "beh" || p.st === "event" ? CONF[n] : 1);
      s.push(`<path data-p="${n}" d="M${f1(qx)},${f1(qy)} C${f1(c1[0])},${f1(c1[1])} ${f1(hxm)},${f1(HY - Math.max(16, (HY - qy) * .55))} ${f1(hxm)},${HY - 3}" style="fill:none;stroke:var(--muted);stroke-width:.6px" opacity="${op.toFixed(2)}"/>`); }
  }
  for (const f of ORD) {
    const [fa, fb] = famr[f], r = R + 3, [xa, ya] = pt(fa, r), [xb, yb] = pt(fb, r), cntf = P.filter(p => p.f === f).length;
    s.push(`<path d="M${f1(xa)},${f1(ya)} A${r},${r} 0 0 1 ${f1(xb)},${f1(yb)}" style="fill:none;stroke:var(--ink);stroke-width:3px"><title>${FN[f]} · ${cntf} parameters · weight ${pyRound(FAMW[f] * 100)} %</title></path>`);
    const rr = R - 10, [ia, ja] = pt(fa, rr), [ib, jb] = pt(fb, rr);
    s.push(`<path id="${ID}f${f}" d="M${f1(ia)},${f1(ja)} A${rr},${rr} 0 0 1 ${f1(ib)},${f1(jb)}" fill="none"/>`);
    const full = `${FN[f].toUpperCase()} ${cntf}`;
    if (fb - fa > rad(16 * LS)) LBL.push(`<text font-family="${MONO}" font-size="${(8.6 * LS).toFixed(1)}" font-weight="600" letter-spacing=".6" class="t-ink halo"><textPath href="#${ID}f${f}" startOffset="50%" text-anchor="middle">${full}</textPath></text>`);
    else { const am = (fa + fb) / 2, [lx, ly] = pt(am, R - 12), dg = ((am * 180 / Math.PI) % 360 + 360) % 360, [rot, anc] = 90 < dg && dg < 270 ? [dg - 180, "start"] : [dg, "end"];
      LBL.push(`<text x="${f1(lx)}" y="${f1(ly)}" font-family="${MONO}" font-size="${(8.6 * LS).toFixed(1)}" font-weight="600" letter-spacing=".6" text-anchor="${anc}" dominant-baseline="central" transform="rotate(${f1(rot)} ${f1(lx)} ${f1(ly)})" class="t-ink halo">${full}</text>`); }
  }
  for (const p of order) { const n = p.n, am = mid(n);
    if (LAB.has(n)) s.push(fit(R + 2, am, nm(p), 10.5 * LS, p.st === "counted" ? "t-ink b" : "t-muted", p.st === "counted" ? 600 : 400));
    else { const [x0, y0] = pt(am, R + 7), [x1, y1] = pt(am, R + 11);
      s.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" style="stroke:var(--muted);stroke-width:.7px;stroke-opacity:.6"/>`); } }
  // ---------- bottom arc: the RESULT (left → right = angle decreasing)
  const TOT = cnt.reduce((t, p) => t + amount(p), 0), t_bh = [rad(172), rad(154)], t_ev = [rad(150), rad(132)], t_ct = [rad(126), rad(48)];
  const k = TOT ? (t_ct[0] - t_ct[1]) / TOT : 0; a = t_ct[0]; const res = [];
  for (const p of [...cnt].sort((p1, p2) => hx[p1.n][0] - hx[p2.n][0])) {
    const n = p.n, [x0, x1] = hx[n], ta = a, tb = a - amount(p) * k; a = tb; res.push([n, tb, ta]);
    const [lx, ly] = pt(ta), [rx, ry] = pt(tb), cl = rc(lx, ly), cr = rc(rx, ry);
    const d = `M${f1(x0)},${HY + 4} C${f1(x0)},${f1(HY + Math.max(16, (ly - HY) * .5))} ${f1(cl[0])},${f1(cl[1])} ${f1(lx)},${f1(ly)} ` +
      `A${R},${R} 0 0 0 ${f1(rx)},${f1(ry)} C${f1(cr[0])},${f1(cr[1])} ${f1(x1)},${f1(HY + Math.max(16, (ry - HY) * .5))} ${f1(x1)},${HY + 4} Z`;
    s.push(`<g data-p="${n}" opacity="1.00" filter="url(#${ID}sh)"><path d="${d}" style="fill:url(#${ID}g${NEG(p) ? "N" : p.f})"/></g>`);
    const N = NSTR(p);
    for (let j = 0; j < N; j++) { const hxj = x0 + (j + .5) * (x1 - x0) / N, t = ta - (j + .5) * (ta - tb) / N, [qx, qy] = pt(t, R - 1), c = rc(qx, qy);
      s.push(`<path data-p="${n}" d="M${f1(hxj)},${HY + 4} C${f1(hxj)},${f1(HY + Math.max(16, (qy - HY) * .5))} ${f1(c[0])},${f1(c[1])} ${f1(qx)},${f1(qy)}" style="fill:none;stroke:url(#${ID}gw);stroke-width:.7px" opacity="1.00"/>`); }
    s.push(`<path data-p="${n}" d="${d}" style="fill:none;stroke:var(--card);stroke-width:1.2px;stroke-opacity:.9" opacity="1.00"/>`);
    const am = (ta + tb) / 2;
    s.push(fit(R + 1, am, `×${XM(SGN(p))} ${nm(p)}`, 10.5 * LS, "t-ink b", 600) || fit(R + 1, am, `×${XM(SGN(p))}`, 10.5 * LS, "t-ink b", 600));
  }
  { const [xa, ya] = pt(t_ct[0], R + 3), [xb, yb] = pt(t_ct[1], R + 3);
    s.push(`<path d="M${f1(xa)},${f1(ya)} A${R + 3},${R + 3} 0 0 0 ${f1(xb)},${f1(yb)}" style="fill:none;stroke:var(--ink);stroke-width:5px"/>`);
    const rr = R - 14, [ia, ja] = pt(t_ct[0], rr), [ib, jb] = pt(t_ct[1], rr);
    s.push(`<path id="${ID}res" d="M${f1(ia)},${f1(ja)} A${rr},${rr} 0 0 0 ${f1(ib)},${f1(jb)}" fill="none"/>`); }
  const sum = cnt.reduce((t, p) => t + p.coef, 0), MULT = prodOf(h, sum);
  const multTxt = MULT < 10 ? MULT.toFixed(2) : MULT < 100 ? MULT.toFixed(1) : MULT.toFixed(0);
  const resTxt = low ? "NO FAIR PRICE · LOW TIER" : h.held || !h.fair_chf ? "FAIR PRICE UNDER REVIEW" : `RESULT ×${multTxt} → FAIR ${Math.round(h.fair_chf).toLocaleString("en-US")}`;
  LBL.push(`<text font-family="${MONO}" font-size="${(9.2 * LS).toFixed(1)}" font-weight="700" letter-spacing=".6" class="t-ink halo"><textPath href="#${ID}res" startOffset="50%" text-anchor="middle">${resTxt}</textPath></text>`);
  const beh = [], evt = [];
  for (const [grp0, [ta, tb], name, outL] of [[BEH, t_bh, "BESIDE", beh], [EVT, t_ev, "EVENTS", evt]]) {
    const grp = [...grp0].sort((p1, p2) => hx[p1.n][0] - hx[p2.n][0]), w = (ta - tb) / Math.max(1, grp.length);
    grp.forEach((p, i) => { outL.push([p.n, ta - (i + 1) * w, ta - i * w]);
      const t = ta - (i + .5) * (ta - tb) / grp.length, [qx, qy] = pt(t, R - 1), hxm = (hx[p.n][0] + hx[p.n][1]) / 2, c = rc(qx, qy);
      s.push(`<path data-p="${p.n}" d="M${f1(hxm)},${HY + 3} C${f1(hxm)},${f1(HY + Math.max(16, (qy - HY) * .5))} ${f1(c[0])},${f1(c[1])} ${f1(qx)},${f1(qy)}" style="fill:none;stroke:var(--muted);stroke-width:.7px" opacity="0.60"/>`); });
    const [xa, ya] = pt(ta, R + 3), [xb, yb] = pt(tb, R + 3);
    s.push(`<path d="M${f1(xa)},${f1(ya)} A${R + 3},${R + 3} 0 0 0 ${f1(xb)},${f1(yb)}" style="fill:none;stroke:var(--muted);stroke-width:1.6px;stroke-dasharray:3 3"/>`);
    const rr = R - 16, [ia, ja] = pt(ta, rr), [ib, jb] = pt(tb, rr), pid = ID + "t" + name.slice(0, 3);
    s.push(`<path id="${pid}" d="M${f1(ia)},${f1(ja)} A${rr},${rr} 0 0 0 ${f1(ib)},${f1(jb)}" fill="none"/>`);
    LBL.push(`<text font-family="${MONO}" font-size="${(8 * LS).toFixed(1)}" font-weight="600" letter-spacing=".5" class="t-muted halo"><textPath href="#${pid}" startOffset="50%" text-anchor="middle">${name}</textPath></text>`);
  }
  // the sieve
  for (const u of HO) { const [x0, x1] = hubpos[u], hh = u === "counted" ? 8 : 4;
    s.push(`<rect x="${f1(x0)}" y="${pr(HY - hh / 2)}" width="${f1(Math.max(2, x1 - x0))}" height="${hh}" rx="${pr(hh / 2)}" style="fill:var(--hub-${u})"/>`); }
  const stop = [hubpos.obs[0], hubpos.copy[1]];
  LBL.push(Tx((stop[0] + stop[1]) / 2, HY + 15, "STOPS HERE", 7.6 * LS, "t-muted halo", "middle", null, 600, "mono"));
  LBL.push(Tx((stop[0] + stop[1]) / 2, HY + 26, "collecting · no data · copy", 7.6 * LS, "t-muted halo", "middle", null, 400, "sf"));
  const bot = cy + R, grad = f => `<linearGradient id="${ID}g${f}" gradientUnits="userSpaceOnUse" x1="0" y1="${HY}" x2="0" y2="${bot}">` +
    `<stop offset="0" style="stop-color:var(--c${f});stop-opacity:.18"/><stop offset=".35" style="stop-color:var(--c${f});stop-opacity:.62"/>` +
    `<stop offset=".8" style="stop-color:var(--c${f});stop-opacity:.95"/><stop offset="1" style="stop-color:var(--c${f});stop-opacity:1"/></linearGradient>`;
  const DEFS = "<defs>" + ["I", "S", "X", "L", "C"].map(grad).join("") +     // flow3.py defines I and S only; X/L/C added so P79 (Context) has a fill once counted
    `<linearGradient id="${ID}gN" gradientUnits="userSpaceOnUse" x1="0" y1="${HY}" x2="0" y2="${bot}"><stop offset="0" style="stop-color:var(--muted);stop-opacity:.15"/><stop offset="1" style="stop-color:var(--muted);stop-opacity:.7"/></linearGradient>` +
    `<linearGradient id="${ID}gw" gradientUnits="userSpaceOnUse" x1="0" y1="${HY}" x2="0" y2="${bot}"><stop offset="0" style="stop-color:var(--c-str);stop-opacity:0"/><stop offset=".15" style="stop-color:var(--c-str);stop-opacity:.75"/><stop offset=".75" style="stop-color:var(--c-str);stop-opacity:.15"/><stop offset="1" style="stop-color:var(--c-str);stop-opacity:0"/></linearGradient>` +
    `<filter id="${ID}sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" style="flood-color:var(--c-shadow)" flood-opacity="1"/></filter></defs>`;
  const NW = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][cnt.length] || String(cnt.length);
  const aria = `Flow of ${h.name}, read top to bottom: ${P.length} parameters on the upper arc, a sieve on the diameter, the result on the lower arc. ${NW} counted parameters pass: ${cnt.map(p => `${p.name} ${p.coef >= 0 ? "+" : "−"}${Math.abs(p.coef).toFixed(2)}`).join(", ")}${cnt.length ? `, together ${sum >= 0 ? "+" : "−"}${Math.abs(sum).toFixed(2)}` : ""}.`;
  C._fl = { cx, cy, R, HY, seg, res, beh, evt, order: Object.keys(seg).map(Number).sort((p1, p2) => seg[p1][0] - seg[p2][0]) };
  return `<svg class="flow" viewBox="-14 -4 ${W + 28} ${cy + R + 104}" role="img" aria-label="${esc(aria)}">${DEFS}${s.join("")}${LBL.join("")}<g id="flhl" pointer-events="none"></g></svg>`;
}
/* tap → parameter (prototype hit()): above the diameter by angle on the top arc, below by the result / beside / events arcs */
function flowHit(svg, e) {
  const g = FP.card && FP.card._fl; if (!g) return null;
  const p0 = svg.createSVGPoint(); p0.x = e.clientX; p0.y = e.clientY; const p = p0.matrixTransform(svg.getScreenCTM().inverse());
  let a = Math.atan2(p.y - g.cy, p.x - g.cx); if (a < 0) a += 2 * Math.PI;
  const near = list => { let best = null, bd = 1e9; for (const [n, lo, hi] of list) { if (a >= lo && a <= hi) return n; const d = Math.min(Math.abs(a - lo), Math.abs(a - hi)); if (d < bd) { bd = d; best = n; } } return bd < .06 ? best : null; };
  if (p.y < g.HY) return near(g.order.map(n => [n, g.seg[n][0], g.seg[n][1]]));
  return near([...g.res, ...g.beh, ...g.evt]);
}
function flowArc(g, lo, hi, r) { const P = a => [g.cx + r * Math.cos(a), g.cy + r * Math.sin(a)], [x0, y0] = P(lo), [x1, y1] = P(hi); return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`; }
function flowHighlight(n) {                                  // prototype highlight(): other strings fade to .12, ink arcs mark the parameter
  const svg = document.querySelector("svg.flow"), g = FP.card && FP.card._fl, hl = document.getElementById("flhl"); if (!svg || !g || !hl) return;
  hl.innerHTML = "";
  svg.querySelectorAll("path[data-t]").forEach(el => el.setAttribute("opacity", n == null || +el.dataset.p === n ? 1 : .12));
  if (n == null || !g.seg[n]) return;
  const [lo, hi] = g.seg[n], w = Math.max(hi - lo, .035), m = (lo + hi) / 2;
  const add = d => { const e = document.createElementNS("http://www.w3.org/2000/svg", "path"); e.setAttribute("d", d); e.setAttribute("style", "fill:none;stroke:var(--ink);stroke-width:7px"); hl.appendChild(e); };
  add(flowArc(g, m - w / 2, m + w / 2, g.R + 7)); const b = [...g.res, ...g.beh, ...g.evt].find(x => x[0] === n); if (b) add(flowArc(g, b[1], b[2], g.R + 7));
}
/* breathing (prototype frame()): each counted string sways ±3 at the card's trading pace; ends stay put */
let FLS = [];
function flowWire(svg) {
  FLS = [...svg.querySelectorAll("path[data-t]")].map((el, i) => ({ el, t: +el.dataset.t, hx: +el.dataset.hx, ph: (i * 2.399) % 6.283, jit: .85 + ((i * 7919) % 100) / 330 }));
  svg.addEventListener("click", e => { const n = flowHit(svg, e); if (n) sheet(n); });
}
function swayFrame(ms) {
  const g = FP.card && FP.card._fl;
  if (!REDUCE.matches && g && FLS.length && FLS[0].el.isConnected) {
    const T = ms / 1000, w = 2 * Math.PI / period(FP.card.h.sales_4w);
    for (const p of FLS) { const d = Math.sin(T * w * p.jit + p.ph), r = g.R - 2, qx = g.cx + r * Math.cos(p.t), qy = g.cy + r * Math.sin(p.t);
      const dx = d * 3, c1x = qx + (g.cx - qx) * .38 + dx, c1y = qy + (g.cy - qy) * .38, c2x = p.hx + dx * .8, c2y = g.HY - Math.max(16, (g.HY - qy) * .55);
      p.el.setAttribute("d", `M${qx.toFixed(1)},${qy.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p.hx},${g.HY - 4}`); }
  }
  requestAnimationFrame(swayFrame);
}
requestAnimationFrame(swayFrame);
/* ---------- card → Why (spec §3.2): one sentence and a step chart on one log scale ---------- */
const NAMEL = { 1: "character", 3: "scarcity", 7: "kind", 9: "artist", 10: "card look", 79: "set premium" };
const RARW = { "special illustration": "Special illustration rare", illustration: "Illustration rare", "alt art": "Alt art", "full art": "Full art", plain: "Plain", gallery: "Gallery" };
const chf0 = v => "CHF " + Math.round(v).toLocaleString("en-US");
function stepLabel(C, p) {                               // the fixture's labels: "Umbreon", "alt art", "USD 31,008 to pull"
  const h = C.h;
  if (p.n === 1) return h.character || "";
  if (p.n === 10) return (LOOK[h.look] || h.look || "").toLowerCase();
  if (p.n === 3 && p.raw) { const m = String(p.raw).match(/([\d.]+)\s*USD/); if (!m) return p.raw;
    return h.usd_chf ? `CHF ${Math.round(+m[1] * h.usd_chf).toLocaleString("en-US")} to pull` : `USD ${Math.round(+m[1]).toLocaleString("en-US")} to pull`; }   // (27 Nov) CHF as the prototype
  return p.raw || "";
}
function whyPane(C) {                                    // (27 Nov) the prototype's why(): one line per step with the running price
  const h = C.h, T = FP.texts || [];
  if (h.held) return `<div class="box why"><p class="lead">Fair price under review — the steps come back once the guard clears.</p></div>`;
  const base = h.typical_base_chf, fair = h.fair_chf, m = h.market_chf;
  if (!base || !fair) return `<div class="box why"><p class="lead">No fair price for this card yet.</p></div>`;
  const steps = C.parts.filter(p => !p.no_effect).map(p => ({ n: p.n, m: Math.exp(p.contribution), label: stepLabel(C, p), name: (T.find(t => t.n === p.n) || {}).name || p.name }))
    .sort((a, b) => Math.abs(Math.log(b.m)) - Math.abs(Math.log(a.m)));
  const vals = [base]; steps.forEach(st => vals.push(vals.at(-1) * st.m));
  const W = 340, pad = 4, RH = 46, lo = Math.min(...vals, h.band50_lo, m) / 1.4, hi = Math.max(...vals, h.band50_hi, m) * 1.4;
  const X = v => pad + (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * (W - 2 * pad);
  const txt = (x, y, t, anc, st) => `<text x="${x}" y="${y}" text-anchor="${anc}" style="font:${st || "400 13px var(--sf)"};fill:var(--ink)">${t}</text>`;
  const BL = h.typical_label || "typical card", rows = []; let y = 0;
  rows.push(txt(pad, y + 16, esc(BL.replace(/^./, c => c.toUpperCase())), "start", "400 13px var(--sf);fill:var(--muted)") + txt(W, y + 16, chf0(base), "end", "600 13px var(--sf)") + `<circle cx="${X(base)}" cy="${y + 30}" r="5" style="fill:var(--ink)"/>`); y += RH;
  steps.forEach((st, i) => { const a = vals[i], b = vals[i + 1], x0 = Math.min(X(a), X(b)), x1 = Math.max(X(a), X(b));
    rows.push(`<line x1="${X(a)}" x2="${X(a)}" y1="${y - 12}" y2="${y + 30}" style="stroke:var(--rule);stroke-dasharray:2 3"/>` +
      txt(pad, y + 16, `<tspan style="font-weight:700;fill:${st.m > 1 ? "var(--fp-up)" : "var(--muted)"}">${xm(st.m)}</tspan> ${esc(st.name)}${st.label ? " · " + esc(st.label) : ""}`, "start") + txt(W, y + 16, chf0(b), "end", "600 13px var(--sf)") +
      `<rect x="${x0}" y="${y + 25}" width="${Math.max(2, x1 - x0)}" height="10" rx="3" style="fill:${st.m > 1 ? "var(--fp-3)" : "var(--gr-2)"}"/>`); y += RH; });
  const f = vals.at(-1);
  rows.push(`<line x1="${pad}" x2="${W}" y1="${y - 4}" y2="${y - 4}" style="stroke:var(--rule)"/>` + txt(pad, y + 16, "Fair price", "start", "700 15px var(--sf)") + txt(W, y + 16, chf0(fair), "end", "700 15px var(--sf)") +
    `<rect x="${X(h.band50_lo)}" y="${y + 26}" width="${X(h.band50_hi) - X(h.band50_lo)}" height="8" rx="4" style="fill:var(--gr-1)"/><line x1="${X(f)}" x2="${X(f)}" y1="${y + 22}" y2="${y + 38}" style="stroke:var(--ink);stroke-width:2"/>`); y += RH;
  const up = m > fair, g = gap(h.l) || { txt: xm(m / fair) };
  rows.push(txt(pad, y + 16, `Market · <tspan style="font-weight:700;fill:${up ? "var(--fp-up)" : "var(--muted)"}">${g.txt}</tspan> ${up ? "above" : "below"} fair`, "start") + txt(W, y + 16, chf0(m), "end", "600 13px var(--sf)") +
    `<rect x="${Math.min(X(f), X(m))}" y="${y + 25}" width="${Math.abs(X(m) - X(f))}" height="10" rx="3" style="fill:${up ? "var(--fp-1)" : "var(--gr-1)"}"/><circle cx="${X(m)}" cy="${y + 30}" r="5" style="fill:${up ? "var(--fp-3)" : "var(--muted)"}"/>`); y += RH;
  const names = steps.filter(st => Math.abs(Math.log(st.m)) > 1e-6).map(st => st.n === 3 ? "scarcity" : st.n === 9 ? (st.label ? st.label + " (artist)" : "the artist") : st.n === 10 ? st.label : st.n === 1 ? st.label || "the character" : NAMEL[st.n] || st.name.toLowerCase());
  let L = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names.at(-1) : names[0] || "Nothing"; L = L.charAt(0).toUpperCase() + L.slice(1);
  const inside = m >= h.band50_lo && m <= h.band50_hi;
  const cmpw = `Compared with: ${esc(h.segment === "chase" ? "chase cards" : h.segment === "mid" ? "mid-tier cards" : (h.segment || "") + " cards")}${h.era ? " · " + esc(h.era) : ""}`;   // Rarity tier + Set and era (lab ruling 2)
  return `<div class="box why"><p class="cmpw">${cmpw}</p><p class="lead">Start from the ${esc(BL)} at ${chf0(base)}. ${esc(L)} take${names.length === 1 ? "s" : ""} it ${xm(fair / base)} to a fair price of ${chf0(fair)}. ` +
    (inside ? `The market, ${chf0(m)}, sits inside the middle half of similar cards.` : `The market pays ${g.txt} ${up ? "more" : "less"}: priced by something the model doesn't count yet.`) + `</p>` +
    `<svg class="wchart" viewBox="0 -4 ${W + 2} ${y + 4}" role="img" aria-label="Fair price built step by step from the typical card, then the market">${rows.join("")}</svg>` +
    `<p class="note">One scale for every row (each step is a multiple). Grey band on the fair-price row: half of similar cards (CHF ${Math.round(h.band50_lo).toLocaleString("en-US")}–${Math.round(h.band50_hi).toLocaleString("en-US")}).</p></div>`;
}

/* ---------- card → History (spec §3.3): the fingerprint with a scrubber and event dots ---------- */
const MEDIA = new Set(["P37", "P66", "P69"]);
function eventLabel(e) {
  if (e.scope === "character" && MEDIA.has(e.n)) return `Featured in ${e.label}: cards of this Pokémon moved +3 % against similar cards in the 13 weeks after past events like this (10 events, 2024–26)`;
  if (e.n === "P38") return `${e.label}. After Worlds, cards of the Pokémon in the top-8 decks fell −5 % against similar cards over 13 weeks (3 events, 2 of 3 the same way)`;
  if (e.n === "P36") return `${e.label}: not tested yet`;
  return `${e.label}: no measurable move on prices`;
}
async function loadHist(C) {
  const id = C.h.card_id;
  await loadWeekly([id]).catch(() => {});
  if (!C.events) {
    if (PREVIEW) { const P = await fetch("preview.json").then(r => r.json()); C.events = P.events || []; C.phases = (P.phases || {})[C.h.set_id] || []; }
    else {
      const ors = [`scope.eq.all`, `and(scope.eq.set,scope_id.eq.${C.h.set_id})`, `and(scope.eq.card,scope_id.eq.${id})`];
      if (C.h.character) ors.push(`and(scope.eq.character,scope_id.eq."${C.h.character.replace(/"/g, "")}")`);
      [C.events, C.phases] = await Promise.all([
        q(sb.from("fp_events").select("id,day,n,label,scope,scope_id,phase").neq("n", "P32").or(ors.join(","))).catch(() => []),
        q(sb.from("fp_events").select("day,day_end,label").eq("n", "P32").eq("scope", "set").eq("scope_id", C.h.set_id)).catch(() => [])]);
    }
  }
}
function histPane(C) {                                   // (27 Nov) the prototype's History: ringprint3.py ring_svg at size 400
  const h = C.h, low = h.segment === "low", D = normW(FP.weekly[h.card_id], low);
  if (!D) return `<div class="box"><div class="empty" style="padding:20px 8px"><b>No history yet</b><p>HoloTrack has not exported ${esc(h.name)}'s weekly line. Today's figures are real; the spiral appears once the weekly file arrives.</p></div></div>`;
  const E = (C.events || []).map(e => ({ ...e, ms: Date.parse(e.day + "T00:00:00Z") }));
  const isRe = e => e.n === "P58";                         // reprint waves of the set: bars across the line, as the prototype's Charizard
  const evs = E.filter(e => !isRe(e) && e.ms >= R3.START), ph = ringPhases(C.phases), rel = (ph.find(p => p[2] === "new") || [])[0] ?? (h.release_date ? Date.parse(h.release_date + "T00:00:00Z") : null);   // (lab round 2) set release date
  const R = ringSvg(D, { size: 400, uid: "r" + h.card_id.replace(/\W/g, ""), phases: ph, evs, reprints: E.filter(isRe).map(e => e.ms),
    rel: rel ?? null, preEvs: E.filter(e => !isRe(e) && e.ms < R3.START).map(e => e.ms), name: h.name });
  C._hist = { D, pts: R.pts, evs, low };
  const mkr = `<g id="mkr" pointer-events="none"><circle r="9" style="fill:none;stroke:var(--card);stroke-width:5px"/><circle r="9" style="fill:none;stroke:var(--ink);stroke-width:2px"/><circle r="2.6" style="fill:var(--ink)"/></g>`;
  return `<div class="box ringbox"><div class="ro"><span class="d" id="ro-d"></span><span class="g" id="ro-g"></span><span class="m" id="ro-m"></span><span class="s" id="ro-s"></span></div>
    ${R.svg.replace('<svg class="fp"', '<svg class="fp big" id="fpbig"').replace(/<\/svg>$/, mkr + "</svg>")}
    <input type="range" id="scrub" min="0" max="${D.t.length - 1}" value="${D.t.length - 1}" aria-label="Week">
    <p class="hint">Drag along the spiral or the slider · tap a dot for its event · one turn per month · ${low ? "grey throughout: low-tier cards have no fair price" : "orange = above fair price"}</p>
    <p class="evl" id="evl" hidden></p></div>`;
}
function histWeek(i) {
  const H = FP.card && FP.card._hist; if (!H) return;
  const { D, pts, low } = H, m = D.mk[i], f = low || D.miss.has(i) ? null : D.fair[i], s = D.sales[i] >= 0 ? D.sales[i] : null;
  const mk = $("mkr"); if (mk) mk.setAttribute("transform", `translate(${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)})`);
  $("scrub").value = i;
  $("ro-d").textContent = "Week of " + new Date(D.t[i]).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  $("ro-m").textContent = chf(m);
  const g = f ? gap(Math.log(m / f)) : null;              // the app's number rule (lab round 2, 27 Nov): ×1.5 and over as ×, under as a signed %
  $("ro-g").innerHTML = g ? `<span style="color:${g.cls === "up" ? "var(--fp-up)" : "var(--muted)"}">${g.txt} fair</span>` : "";
  $("ro-s").textContent = low ? `low tier · no fair price${s != null ? ` · ${s} sales that week` : ""}`
    : (f ? `fair ${chf(f)}` : "no fair price yet (before the first refit)") + " · " + (s != null ? `${s} sale${s === 1 ? "" : "s"} that week` : "sales not counted yet");
}
function histWire() {
  const H = FP.card && FP.card._hist, svg = $("fpbig"); if (!H || !svg) return;
  histWeek(H.pts.length - 1);
  $("scrub").oninput = e => histWeek(+e.target.value);
  const sp = ev => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const near = ev => { const q2 = sp(ev); let bi = 0, bd = 1e9; H.pts.forEach(([x, y], i) => { const d = (x - q2.x) ** 2 + (y - q2.y) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
  const showEv = i => { const e = H.evs[i], el = $("evl");
    el.hidden = false; el.innerHTML = `<b>${new Date(e.ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</b> · ${esc(eventLabel(e))}`;
    let k = H.D.t.findIndex(x => x >= e.ms); if (k < 0) k = H.D.t.length - 1; histWeek(k); };
  const evHit = ev => { const q2 = sp(ev); let b = null, bd = 110; svg.querySelectorAll("circle.ev").forEach(c => { const d = (+c.getAttribute("cx") - q2.x) ** 2 + (+c.getAttribute("cy") - q2.y) ** 2; if (d < bd) { bd = d; b = +c.dataset.e; } }); return b; };
  let drag = false;
  svg.addEventListener("pointerdown", ev => { const v = evHit(ev); if (v != null) { showEv(v); return; } $("evl").hidden = true; drag = true; svg.setPointerCapture(ev.pointerId); histWeek(near(ev)); });
  svg.addEventListener("pointermove", ev => { if (drag) histWeek(near(ev)); });
  svg.addEventListener("pointerup", () => { drag = false; }); svg.addEventListener("pointercancel", () => { drag = false; });
  const els = [...svg.querySelectorAll("path.nw")];
  if (els.length) breathers.push({ els, per: period(FP.card.h.sales_4w), depth: 0.014, c: 200 });
}
async function card(id) {
  FP.tab = "collection";
  $("view").innerHTML = `<div class="top"><button id="back" class="bk"><svg viewBox="0 0 11 19" aria-hidden="true"><path d="M9.5 1.5 2 9.5l7.5 8"/></svg>Back</button><span class="private">PRIVATE</span></div><h1>…</h1>`;
  $("back").onclick = () => { history.length > 1 ? history.back() : (location.hash = "collection"); };
  let C, T;
  try { [C, T] = await Promise.all([loadCard(id), texts()]); } catch (e) { C = null; }
  if (!C) { $("view").innerHTML += `<p class="sub">This card has no figures in the model yet.</p>`; return; }
  await loadHist(C).catch(() => {});                       // (27 Nov) the flow needs the weekly line and the card's events (as flow3.py)
  if (C.h.sales_4w == null) { const w = FP.weekly[C.h.card_id], sl = w && w.sales ? w.sales.filter(v => v != null).slice(-4) : [];   // (lab round 2) Weezing: sales from the weekly line
    if (sl.length) C.h.sales_4w = sl.reduce((a, b) => a + b, 0); }
  FP.card = C; const h = C.h;
  $("view").innerHTML = `<div class="top"><button id="back" class="bk"><svg viewBox="0 0 11 19" aria-hidden="true"><path d="M9.5 1.5 2 9.5l7.5 8"/></svg>Back</button><span class="private">PRIVATE</span></div>
    <h1 class="cardt">${esc(h.name)}</h1><p class="sub csub"><a class="setl" href="#set/${encodeURIComponent(h.set_id)}">${esc(h.set_name || h.set_id)}</a> · ${esc(RARW[h.look] || LOOK[h.look] || h.look)} · ${esc(h.num)}${h.official_count && /^\d+$/.test(h.num) ? "/" + h.official_count : ""}</p>${C.nick ? `<p class="nick">Known to collectors as <b>${esc(C.nick.nickname)}</b></p>` : ""}
    <div class="segc" role="tablist"><button role="tab" data-p="today" aria-selected="true">Today</button>${h.segment === "low" ? "" : `<button role="tab" data-p="why" aria-selected="false">Why</button>`}<button role="tab" data-p="hist" aria-selected="false">History</button></div>
    <div id="p-today">${headerBox(h)}<div class="box flowbox">${flowSvg(C, T)}<p class="hint">Tap a string or a name, or pick from the list below</p></div>
    ${plist(C, T)}</div><div id="p-why" hidden>${h.segment === "low" ? "" : whyPane(C)}</div><div id="p-hist" hidden></div>`;
  document.querySelectorAll(".segc [data-p]").forEach(b => b.onclick = async () => {
    const t = b.dataset.p;
    document.querySelectorAll(".segc [data-p]").forEach(x => x.setAttribute("aria-selected", x === b));
    ["today", "why", "hist"].forEach(x => { const el = $("p-" + x); if (el) el.hidden = x !== t; });
    if (t === "hist" && !$("p-hist").dataset.done) { $("p-hist").innerHTML = `<div class="box"><p class="why m">Loading…</p></div>`; await loadHist(C);
      $("p-hist").innerHTML = histPane(C); $("p-hist").dataset.done = 1; histWire(); }
  });
  if (FP.openTab) { const b = document.querySelector(`.segc [data-p="${FP.openTab}"]`); FP.openTab = null; if (b) b.click(); }
  $("back").onclick = () => { history.length > 1 ? history.back() : (location.hash = "collection"); };
  document.querySelectorAll(".pr").forEach(b => b.onclick = () => sheet(+b.dataset.n));
  { const fsvg = document.querySelector("svg.flow"); if (fsvg) flowWire(fsvg); }
  document.querySelectorAll(".more").forEach(b => b.onclick = () => { b.previousElementSibling.hidden = false; b.remove(); });
}
/* ---------- Compare (spec §5) ---------- */
function cropW(w, weeks) { if (!w || !w.weeks) return w; const k = Math.max(0, w.weeks.length - weeks); return { weeks: w.weeks.slice(k), market_chf: w.market_chf.slice(k), fair_chf: (w.fair_chf || []).slice(k), sales: (w.sales || []).slice(k) }; }
function miniOf(id, name, weeks) {
  const w = FP.weekly[id], r = (FP.rows || []).find(x => x.card_id === id);
  return miniFor(weeks && w ? cropW(w, weeks) : w, name, r ? r.segment === "low" : false);
}
async function compare() {
  $("view").innerHTML = head() + `<h1>Compare</h1><p class="sub">Loading…</p>`;
  let rows; try { rows = FP.rows = FP.rows || await loadCollection(); } catch (e) { rows = []; }
  if (FP.tab !== "compare") return;
  const opts = [...rows].sort((a, b) => (a.name || "").localeCompare(b.name || "") || (b.market_chf || 0) - (a.market_chf || 0));
  if (opts.length < 2) { $("view").innerHTML = head() + `<h1>Compare</h1><p class="sub">Add two cards to your collection to compare them.</p>`; return; }
  const byMkt = [...rows].sort((a, b) => (b.market_chf || 0) - (a.market_chf || 0));
  FP.cmp = FP.cmp || [byMkt[0].card_id, byMkt[1].card_id];
  const sel = i => `<select id="cmp${i}" aria-label="Card ${i + 1}">${opts.map(r => `<option value="${esc(r.card_id)}" ${FP.cmp[i] === r.card_id ? "selected" : ""}>${esc(r.name)}${opts.filter(o => o.name === r.name).length > 1 ? ` · ${esc(r.set_name || r.set_id)} · ${esc(r.num)}` : ""}</option>`).join("")}</select>`;
  $("view").innerHTML = head() + `<h1>Compare</h1><p class="sub">Two cards, same scale</p>
    <div class="cmp-pick">${sel(0)}${sel(1)}</div><div id="cmpt"><div class="box"><p class="why m">Loading…</p></div></div>`;
  [0, 1].forEach(i => $("cmp" + i).onchange = e => { FP.cmp[i] = e.target.value; cmpTable(); });
  cmpTable();
}
async function cmpTable() {
  const ids = FP.cmp; let A, B, T;
  try { [A, B, T] = await Promise.all([loadCard(ids[0]), loadCard(ids[1]), texts()]); await loadWeekly(ids); } catch (e) { }
  if (FP.tab !== "compare") return;
  const cs = [A, B], low = C => C.h.segment === "low", m = '<td class="m">—</td>';
  const mini = (i, C) => `<div>${miniOf(ids[i], C ? C.h.name : ids[i])}</div>`;
  const fp = C => low(C) ? `<td class="m">${C.h.context_median_chf ? "similar " + chf(C.h.context_median_chf) : "—"}</td>` : C.h.held ? `<td class="m">under review</td>` : `<td>${chf0(C.h.fair_chf)}</td>`;
  const gv = C => { if (low(C) || C.h.held) return m; const g = gap(C.h.l); return g ? `<td class="${g.cls === "up" ? "up" : "m"}">${g.txt}</td>` : m; };
  const mh = C => low(C) || !C.h.band50_lo ? m : `<td class="m">${Math.round(C.h.band50_lo).toLocaleString("en-US")}–${Math.round(C.h.band50_hi).toLocaleString("en-US")}</td>`;
  const tc = C => low(C) || !C.h.typical_base_chf ? m : `<td class="m">${chf0(C.h.typical_base_chf)}</td>`;
  const ns = [...new Set(cs.flatMap(C => C && !low(C) ? C.parts.map(p => p.n) : []))].sort((a, b) => a - b);
  const cv = (C, n) => { if (low(C)) return '<td class="m">no fair price</td>'; const p = C.parts.find(x => x.n === n); if (!p) return '<td class="m">not counted</td>'; if (p.no_effect) return '<td class="m">×1</td>'; const r = Math.exp(p.contribution); return `<td class="${r > 1 ? "up" : "m"}">${xm(r)}</td>`; };
  const mk = C => `<td>${low(C) ? chf(C.h.market_chf) : chf0(C.h.market_chf)}</td>`, sales = C => `<td class="m">${C.h.sales_4w != null ? `${C.h.sales_4w} sales in 4 weeks` : "—"}</td>`;
  if (!A || !B) { $("cmpt").innerHTML = `<div class="box"><p class="why m">One of these cards has no figures in the app yet.</p></div>`; return; }
  $("cmpt").innerHTML = `<div class="box"><div class="cm2">${mini(0, A)}${mini(1, B)}</div><table class="ct">
    <tr class="h"><th></th><td>${esc(A.h.name)}</td><td>${esc(B.h.name)}</td></tr>
    <tr><th>Market</th>${mk(A)}${mk(B)}</tr><tr><th>Fair price</th>${fp(A)}${fp(B)}</tr><tr><th>Market vs fair</th>${gv(A)}${gv(B)}</tr>
    <tr><th>Middle half</th>${mh(A)}${mh(B)}</tr><tr><th>Typical card</th>${tc(A)}${tc(B)}</tr>
    <tr class="sep"><th colspan="3">Counted</th></tr>${ns.map(n => `<tr><th>${esc(((T || []).find(x => x.n === n) || {}).name || "P" + n)}</th>${cv(A, n)}${cv(B, n)}</tr>`).join("")}
    <tr class="sep"><th colspan="3">Trading</th></tr><tr><th>Sales</th>${sales(A)}${sales(B)}</tr><tr><th>Breathes every</th><td class="m">${period(A.h.sales_4w).toFixed(0)} s</td><td class="m">${period(B.h.sales_4w).toFixed(0)} s</td></tr></table></div>`;
}

/* ---------- Movers (Build brief 23 Nov) ---------- */
function fairLine(h) {                                   // lab check 24 Nov: "x % above fair" in fp-up only when above; below in grey
  if (!h || h.segment === "low" || !h.shown) return "";
  if (h.held) return `<span class="fl">Fair price under review</span>`;
  if (h.l == null) return "";
  const r = Math.exp(h.l);
  if (h.l > 0) return `<span class="fl up">${r >= 1.5 ? xm(r) + " above fair" : Math.round((r - 1) * 100) + " % above fair"}</span>`;
  return `<span class="fl">below fair</span>`;
}
const MW = { 7: { chg: "chg7", sold: "sold7", floor: 2, weeks: 4 }, 30: { chg: "chg30", sold: "sold30", floor: 4, weeks: 8 }, 90: { chg: "chg90", sold: "sold90", floor: 4, weeks: 13 } };
const BANDS = [["5-", "5+"], ["all", "All"], ["0-15", "< 15"], ["15-75", "15–75"], ["75-150", "75–150"], ["150-300", "150–300"], ["300-", "300+"]];
const SERIE = { me: "Mega Evolution", sv: "Scarlet & Violet", swsh: "Sword & Shield", sm: "Sun & Moon", xy: "XY", bw: "Black & White", hgss: "HeartGold SoulSilver", dp: "Diamond & Pearl", pl: "Platinum", ex: "EX", ecard: "e-Card", neo: "Neo", base: "Base", gym: "Gym", col: "Call of Legends", lc: "Legendary Collection", pop: "POP", tk: "Trainer kits", misc: "Other" };
async function movers() {
  FP.mv = FP.mv || { dir: "up", win: 30, serie: "", set: "", band: "5-", rar: "", fresh: false };
  const M = FP.mv;
  if (!FP.facets) { try { FP.facets = PREVIEW ? (await fetch("preview.json").then(r => r.json())).facets || [] : await q(sb.from("fp_movers_facets").select("*").range(0, 1999)); } catch (e) { FP.facets = []; } }
  const F = FP.facets, series = [...new Set(F.map(f => f.serie).filter(Boolean))];
  const sets = F.filter(f => !M.serie || f.serie === M.serie).sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
  const rars = [...new Set(F.filter(f => (!M.serie || f.serie === M.serie) && (!M.set || f.set_id === M.set)).flatMap(f => f.rarities || []))].sort();
  const seg = (k, opts) => `<div class="segc" role="group">${opts.map(([v, l]) => `<button data-${k}="${v}" aria-selected="${String(M[k]) === String(v)}">${l}</button>`).join("")}</div>`;
  $("view").innerHTML = head() + `<h1>Movers</h1><p class="sub">TCGplayer market price over the window · cards with too few sales left out</p>
    ${seg("dir", [["up", "Rising"], ["down", "Falling"]])}${seg("win", [[7, "7 days"], [30, "30 days"], [90, "90 days"]])}
    <div class="box filt">
      <label>Era<select id="mvSerie"><option value="">All eras</option>${series.map(s => `<option value="${esc(s)}" ${M.serie === s ? "selected" : ""}>${esc(SERIE[s] || s)}</option>`).join("")}</select></label>
      <label>Set<select id="mvSet"><option value="">All sets</option>${sets.map(f => `<option value="${esc(f.set_id)}" ${M.set === f.set_id ? "selected" : ""}>${esc(f.set_name || f.set_id)}</option>`).join("")}</select></label>
      <label>Price (CHF)<select id="mvBand">${BANDS.map(([v, l]) => `<option value="${v}" ${M.band === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Rarity<select id="mvRar"><option value="">All rarities</option>${rars.map(r => `<option ${M.rar === r ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></label>
      <label class="sw"><input type="checkbox" id="mvFresh" ${M.fresh ? "checked" : ""}> Include new releases (under 90 days)</label>
    </div><div id="mvList"><div class="box"><p class="why m">Loading…</p></div></div>`;
  document.querySelectorAll("[data-dir]").forEach(b => b.onclick = () => { M.dir = b.dataset.dir; movers(); });
  document.querySelectorAll("[data-win]").forEach(b => b.onclick = () => { M.win = +b.dataset.win; movers(); });
  $("mvSerie").onchange = e => { M.serie = e.target.value; M.set = ""; movers(); };
  $("mvSet").onchange = e => { M.set = e.target.value; movers(); };
  $("mvBand").onchange = e => { M.band = e.target.value; movers(); };
  $("mvRar").onchange = e => { M.rar = e.target.value; movers(); };
  $("mvFresh").onchange = e => { M.fresh = e.target.checked; movers(); };
  const W = MW[M.win];
  let rows;
  try {
    if (PREVIEW) rows = ((await fetch("preview.json").then(r => r.json())).movers || []).filter(r => r[W.chg] != null && (M.band === "all" || (r.market_chf >= +M.band.split("-")[0] && (!M.band.split("-")[1] || r.market_chf < +M.band.split("-")[1]))) && (!M.serie || r.serie === M.serie) && (!M.set || r.set_id === M.set) && (!M.rar || r.rarity === M.rar) && (M.fresh || !r.release_date || r.release_date <= new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)) && (r[W.sold] || 0) >= W.floor && (M.dir === "up" ? r[W.chg] > 0 : r[W.chg] < 0)).sort((a, b) => M.dir === "up" ? b[W.chg] - a[W.chg] : a[W.chg] - b[W.chg]);
    else {
      let qy = sb.from("fp_movers_v").select("*").not(W.chg, "is", null).gte(W.sold, W.floor);
      qy = M.dir === "up" ? qy.gt(W.chg, 0).order(W.chg, { ascending: false }) : qy.lt(W.chg, 0).order(W.chg, { ascending: true });
      if (M.serie) qy = qy.eq("serie", M.serie);
      if (M.set) qy = qy.eq("set_id", M.set);
      if (M.rar) qy = qy.eq("rarity", M.rar);
      if (M.band !== "all") { const [lo, hi] = M.band.split("-"); qy = qy.gte("market_chf", +lo); if (hi) qy = qy.lt("market_chf", +hi); }
      if (!M.fresh) qy = qy.lte("release_date", new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10));
      rows = await q(qy.limit(50));
    }
  } catch (e) { $("mvList").innerHTML = `<div class="box"><p class="why m">Couldn't load the movers. Try again in a moment.</p></div>`; return; }
  if (FP.tab !== "movers") return;
  let fair = {}, sum = null;
  try {
    if (PREVIEW) { const P = await fetch("preview.json").then(r => r.json()); fair = P.moverFair || {}; sum = P.moverSum || null; }
    else {
      const [lo, hi] = M.band === "all" ? [null, null] : M.band.split("-").map(x => x === "" ? null : +x);
      const [hs, sm] = await Promise.all([
        q(sb.from("fp_card_header").select("card_id,l,held,segment,shown").in("card_id", rows.map(r => r.card_id))),
        q(sb.rpc("fp_movers_summary", { win: M.win, serie_: M.serie || null, set_: M.set || null, rar: M.rar || null, lo, hi, fresh: M.fresh }))]);
      hs.forEach(h => fair[h.card_id] = h); sum = sm[0] || null;
    }
  } catch (e) { }
  await loadWeekly(rows.map(r => r.card_id)).catch(() => {});
  if (FP.tab !== "movers") return;
  const top = sum && sum.n_all ? `<p class="mvtop">${(M.dir === "up" ? sum.n_up10 : sum.n_down10).toLocaleString("en-US")} cards ${M.dir === "up" ? "rose" : "fell"} 10\u00a0%+ in ${M.win} days · median ${sum.median >= 0 ? "+" : "−"}${Math.abs(sum.median * 100).toFixed(1)}\u00a0%</p>` : "";
  $("mvList").innerHTML = top + (rows.length ? `<div class="list">${rows.map(r => { const c = +r[W.chg]; return `<button class="crow" data-id="${esc(r.card_id)}">
      <span class="mini">${miniOf(r.card_id, r.name, W.weeks)}</span>
      <span class="cm"><b>${esc(r.name)}</b><span>${esc(r.set_name || r.set_id)} · ${LOOK[r.look] || esc(r.look)} · ${esc(r.num)}</span>
      <span class="cv">${chf(+r.market_chf)}<em class="mv">${c > 0 ? "▲ +" : "▼ −"}${Math.abs(c * 100).toFixed(1)} %</em><i>${r[W.sold]} sold in ${M.win} days</i></span>${fairLine(fair[r.card_id])}</span>
      <svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>`; }).join("")}</div>
      <p class="foot">Top ${rows.length}. Sales floor: ${W.floor}+ copies sold in the window. Each fingerprint shows the last ${W.weeks} weeks.</p>`
    : `<div class="box empty"><p>No card moved this way with enough sales in this window.</p></div>`);
  document.querySelectorAll("#mvList .crow").forEach(b => b.onclick = () => { location.hash = "card/" + encodeURIComponent(b.dataset.id); });
}
/* ---------- Sets (M8, 26 Nov — lab Decided, Alex 09:20 "ok lets start with the set screen") ----------
   Ways in: the set name on a card's Today header · Collection → By set · the Sets tab (search + list by release date).
   1 header (life-cycle chip P32, reprint waves P58, Set premium P79, set-demand ranks) · 2 the set's line vs the typical set
   (Experiment 1) · 3 cards · 4 sealed. Facts and the model's numbers only: no buy / sell words, no card images, orange only
   for counted parameters / above fair / above the typical set. */
const TYPICAL = { weeks: [1, 2, 4, 8, 13, 20, 26, 39, 52, 65, 78], v: [1, 1.00, 1.00, 1.02, 0.98, 0.86, 0.72, 0.69, 0.59, 0.62, 0.62] };   // Experiment 1, median chase card, 7 main sets 2024–26
const TYPICAL_MID = { weeks: [1, 2, 4, 8, 13, 20, 26, 39, 52, 65, 78], v: [1, 1.00, 0.89, 0.79, 0.83, 0.79, 0.79, 0.81, 0.82, 0.82, 0.89] };   // Experiment 1, median mid card (lab 26 Nov: a second, lighter grey line)
function curveAt(C, w) { const W = C.weeks, V = C.v; if (w <= W[0]) return V[0]; if (w >= W[W.length - 1]) return null;
  for (let i = 1; i < W.length; i++) if (w <= W[i]) return V[i - 1] + (V[i] - V[i - 1]) * (w - W[i - 1]) / (W[i] - W[i - 1]); return null; }
const SINCE0 = Date.parse("2024-02-01T00:00:00Z");           // (26 Nov, lab) older sets: "Since Feb 2024", week 1 = the week of 1 Feb 2024
const isSince = S => S.line && S.line.mode === "since";
function refAt(S, wk) { if (!isSince(S)) return typicalAt(wk); const i = S.line.weeks.indexOf(wk); return i >= 0 && S.line.era_chase ? S.line.era_chase[i] : null; }
const sinceLabel = wk => new Date(SINCE0 + (wk - 1) * 6048e5).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
function typicalAt(w) { const W = TYPICAL.weeks, V = TYPICAL.v; if (w <= W[0]) return V[0]; if (w >= W[W.length - 1]) return null;
  for (let i = 1; i < W.length; i++) if (w <= W[i]) return V[i - 1] + (V[i] - V[i - 1]) * (w - W[i - 1]) / (W[i] - W[i - 1]); return null; }
const SP_ON = "2026-11-30";                                  // Set premium (P79) counts from the switch-on refit
const fmtDay = d => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
function phaseChip(h) { if (!h || !h.phase) return ""; return `<span class="chip">${esc(h.phase)} · since ${fmtDay(h.phase_since)}</span>`; }
// (26 Nov, lab) what the fair price uses (the cards' P79 contribution), for the typical card in this set; chase and mid
// shown both when they differ by more than 0.02 log points
const spSplit = h => h.set_premium_chase != null && h.set_premium_mid != null && Math.abs(Math.log(+h.set_premium_chase) - Math.log(+h.set_premium_mid)) > 0.02;
function spText(h) { if (h.set_premium == null) return `<span class="spx">Set premium switches on ${fmtDay(SP_ON)}</span>`;
  const r = +h.set_premium;
  if (spSplit(h)) return `<span class="spx ${r > 1 ? "up" : ""}">Set premium · chase <b>${xm(+h.set_premium_chase)}</b> · mid <b>${xm(+h.set_premium_mid)}</b></span>`;
  return `<span class="spx ${r > 1 ? "up" : ""}"><b>${xm(r)}</b> · Set premium for the typical card in this set</span>`; }
async function loadSets() {
  if (FP.sets) return FP.sets;
  return FP.sets = PREVIEW ? (await fetch("preview.json").then(r => r.json())).sets || []
    : await q(sb.from("fp_set_header").select("set_id,name,serie,release_date,n_cards,phase,phase_since,set_premium").order("release_date", { ascending: false }).range(0, 999));
}
async function loadSet(id) {
  if (PREVIEW) { const P = await fetch("preview.json").then(r => r.json()); return (P.setScreens || {})[id] || null; }
  const [h, line, ev, cards, sealed] = await Promise.all([
    q(sb.from("fp_set_header").select("*").eq("set_id", id)).then(r => r[0] || null),
    q(sb.from("fp_set_line").select("*").eq("set_id", id)).then(r => r[0] || null),
    q(sb.from("fp_set_events").select("*").eq("set_id", id).order("day")),
    q(sb.from("fp_set_cards").select("*").eq("set_id", id).range(0, 999)),
    q(sb.from("fp_set_sealed").select("*").eq("set_id", id))]);
  return h && { h, line, ev, cards, sealed };
}
async function sets() {
  $("view").innerHTML = head() + `<h1>Sets</h1><p class="sub">Loading…</p>`;
  let L; try { L = await loadSets(); } catch (e) { L = []; }
  if (FP.tab !== "sets") return;
  const draw = f => { const rows = L.filter(s => !f || (s.name + " " + s.set_id).toLowerCase().includes(f.toLowerCase()));
    $("stList").innerHTML = rows.length ? `<div class="list">${rows.map(s => `<button class="srow" data-set="${esc(s.set_id)}"><span class="cm"><b>${esc(s.name)}</b>
      <span>${fmtDay(s.release_date)} · ${s.n_cards} card${s.n_cards === 1 ? "" : "s"} in the app</span><span class="srm">${phaseChip(s)}${s.set_premium != null ? ` <span class="spx ${s.set_premium > 1 ? "up" : ""}">${xm(+s.set_premium)}</span>` : ""}</span></span>
      <svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>`).join("")}</div>` : `<div class="box empty"><p>No set matches.</p></div>`;
    document.querySelectorAll("#stList .srow").forEach(b => b.onclick = () => { location.hash = "set/" + encodeURIComponent(b.dataset.set); }); };
  $("view").innerHTML = head() + `<h1>Sets</h1><p class="sub">${L.length} sets with cards in the app · newest first</p>
    <input id="stq" class="search" type="search" placeholder="Search sets" aria-label="Search sets"><div id="stList"></div>
    <p class="foot">Phase from HoloTrack's set events (new print / in print / out of print). Set premium switches on with the ${fmtDay(SP_ON)} refit.</p>`;
  $("stq").oninput = e => draw(e.target.value); draw("");
}
function setLineSvg(S) {                                    // 2 · the set's line over the typical set (Experiment 1)
  const L = S.line; if (!L || !L.weeks || L.weeks.length < 2) return null;
  const W = L.weeks, lastW = W[W.length - 1], maxW = Math.max(26, Math.min(lastW, 160)), w = 340, h = 190, pl = 30, pr = 8, pt = 10, pb = 24;
  const since = isSince(S), REF = since ? (L.era_chase || []) : TYPICAL.v;
  const vals = [...L.chase, ...L.mid, ...REF, ...(since ? [] : TYPICAL_MID.v)].filter(v => v != null), lo = Math.max(0, Math.min(0.4, ...vals) - .05), hi = Math.max(1.3, ...vals) + .05;
  const X = wk => pl + (w - pl - pr) * (wk - 1) / (maxW - 1), Y = v => pt + (h - pt - pb) * (1 - (v - lo) / (hi - lo));
  const path = arr => { let d = "", on = false; W.forEach((wk, i) => { const v = arr[i]; if (v == null || wk > maxW) { on = false; return; } d += (on ? "L" : "M") + X(wk).toFixed(1) + "," + Y(v).toFixed(1); on = true; }); return d; };
  let typ = "", typm = "";
  if (since) typ = path(L.era_chase || []);
  else for (let wk = 1; wk <= Math.min(maxW, 78); wk++) { const v = typicalAt(wk), m = curveAt(TYPICAL_MID, wk);
    if (v != null) typ += (typ ? "L" : "M") + X(wk).toFixed(1) + "," + Y(v).toFixed(1); if (m != null) typm += (typm ? "L" : "M") + X(wk).toFixed(1) + "," + Y(m).toFixed(1); }
  let fill = "";                                              // orange only where the set's chase line sits above the typical set
  for (let i = 1; i < W.length; i++) { const a = W[i - 1], b = W[i], ca = L.chase[i - 1], cb = L.chase[i], ta = refAt(S, a), tb = refAt(S, b);
    if (ca == null || cb == null || ta == null || tb == null || b > maxW) continue;
    if (ca > ta || cb > tb) fill += `<path class="sabove" d="M${X(a)},${Y(Math.max(ca, ta))}L${X(b)},${Y(Math.max(cb, tb))}L${X(b)},${Y(tb)}L${X(a)},${Y(ta)}Z"/>`; }
  const t0 = since ? SINCE0 : Date.parse(S.h.release_date);
  const ev = (S.ev || []).filter(e => e.day && S.h.release_date).map(e => ({ ...e, wk: Math.floor((Date.parse(e.day) - t0) / 6048e5) + 1 })).filter(e => e.wk >= 1 && e.wk <= maxW && e.phase !== "during");
  const tstep = hi > 7 ? 2 : hi > 3.6 ? 1 : .5, ticks = []; for (let v = tstep; v < hi; v += tstep) if (v > lo) ticks.push(+v.toFixed(1));
  const xt = (since ? [1, 53, 105, 157] : [1, 13, 26, 39, 52, 78, 104, 130, 156]).filter(v => v <= maxW);
  return `<svg class="sline" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(S.h.name)}: median chase card and median mid card by week since release, against the typical set">
    ${ticks.map(v => `<line class="sgrid" x1="${pl}" x2="${w - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="sax" x="${pl - 4}" y="${Y(v) + 3}" text-anchor="end">${v.toFixed(1)}</text>`).join("")}
    ${xt.map(v => `<text class="sax" x="${X(v)}" y="${h - 8}" text-anchor="${since && v === 1 ? "start" : "middle"}">${since ? sinceLabel(v) : v === 1 ? "wk 1" : v}</text>`).join("")}
    ${fill}<path class="styp" d="${typ}"/>${typm ? `<path class="stypm" d="${typm}"/>` : ""}<path class="smid" d="${path(L.mid)}"/><path class="schase" d="${path(L.chase)}"/>
    ${ev.map(e => `<circle class="sev" cx="${X(e.wk)}" cy="${h - pb}" r="3.5"><title>${esc(e.label)} · ${fmtDay(e.day)}${e.tested ? " · " + esc(e.tested) : ""}</title></circle>`).join("")}
    <line id="scur" class="scur" x1="0" x2="0" y1="${pt}" y2="${h - pb}" style="display:none"/><rect id="shit" x="${pl}" y="0" width="${w - pl - pr}" height="${h}" fill="transparent"/></svg>`;
}
function setReadout(S, wk) {
  const L = S.line, i = L.weeks.indexOf(wk), c = i >= 0 ? L.chase[i] : null, m = i >= 0 ? L.mid[i] : null, t = refAt(S, wk);
  if (isSince(S)) return `<b>Since Feb 2024 · week ${wk}</b>${c != null ? ` · median chase card <b class="${t != null && c > t ? "upc" : ""}">${c.toFixed(2)}</b>` : ""}${m != null ? ` · median mid card ${m.toFixed(2)}` : ""}${t != null ? ` · ${S.refName || "its era"} ${t.toFixed(2)}` : ""}`;
  return `<b>Week ${wk}</b>${c != null ? ` · median chase card <b class="${t != null && c > t ? "upc" : ""}">${c.toFixed(2)}</b>` : ""}${m != null ? ` · median mid card ${m.toFixed(2)}` : ""}${t != null ? ` · typical set ${t.toFixed(2)}` : ""}`;
}
async function setScreen(id) {
  $("view").innerHTML = `<div class="top"><button id="back" class="bk"><svg viewBox="0 0 11 19" aria-hidden="true"><path d="M9.5 1.5 2 9.5l7.5 8"/></svg>Back</button><span class="private">PRIVATE</span></div><p class="sub">Loading…</p>`;
  $("back").onclick = () => { history.length > 1 ? history.back() : (location.hash = "sets"); };
  let S; try { S = await loadSet(id); } catch (e) { S = null; }
  if (!S) { $("view").innerHTML += `<p class="sub">This set has no cards in the model yet.</p>`; return; }
  const h = S.h, rel = h.release_date;
  const rank = h.rank_in_cohort ? `Set demand: ${ordinal(h.rank_in_cohort)} of ${h.of_cohort} sets of ${esc(h.cohort || "its years")}${h.rank_all ? ` · ${ordinal(h.rank_all)} of ${h.of_all} of all years` : ""}` : "";
  const waves = (h.reprints || []).map(r => `<li>Reprint wave · ${fmtDay(r.day)}${r.confidence === "low" ? " · low confidence" : ""}</li>`).join("");
  const line = setLineSvg(S);
  const since = isSince(S), ERA = { "pre-2017": "before 2017", "2017–22": "2017–22", "2023+": "2023 on" }[S.line && S.line.era] || "its era";
  const lineBox = line ? (since ? `<div class="box"><div class="label">Since Feb 2024</div>${line}
      <p class="sread" id="sread">${setReadout(S, S.line.weeks[S.line.weeks.length - 1])}</p>
      <div class="skey"><span><i class="kc"></i>median chase card (${S.line.n_chase})</span><span><i class="km"></i>median mid card (${S.line.n_mid})</span><span><i class="kt"></i>median chase card, sets from ${esc(ERA)}</span></div>
      <p class="hint">Released ${fmtDay(rel)}, before our weekly history: shown since Feb 2024 against sets of its era. Each card is indexed to its own first 5 weeks of Feb 2024 (= 1.00). Orange where the set's chase cards sit above its era.</p></div>`
    : `<div class="box"><div class="label">The set's line · by week since release</div>${line}
      <p class="sread" id="sread">${setReadout(S, S.line.weeks[S.line.weeks.length - 1])}</p>
      <div class="skey"><span><i class="kc"></i>median chase card (${S.line.n_chase})</span><span><i class="km"></i>median mid card (${S.line.n_mid})</span><span><i class="kt"></i>typical of 7 main sets, 2024–26</span><span><i class="ktm"></i>typical mid card</span></div>
      <p class="hint">Each card is indexed to its own weeks 1–5 (= 1.00). Orange where the set's chase cards sit above the typical set.</p></div>`)
    : `<div class="box"><div class="label">The set's line</div><p class="why m">Released ${fmtDay(rel)}, before our weekly history begins (Feb 2024): there are no launch weeks to compare with the typical set.</p></div>`;
  FP.setSort = FP.setSort || "price";
  $("view").innerHTML = `<div class="top"><button id="back" class="bk"><svg viewBox="0 0 11 19" aria-hidden="true"><path d="M9.5 1.5 2 9.5l7.5 8"/></svg>Back</button><span class="private">PRIVATE</span></div>
    <h1 class="cardt">${esc(h.name)}</h1><p class="sub">${esc(SERIE[h.serie] || h.serie || "")} · released ${fmtDay(rel)} · ${h.n_cards} card${h.n_cards === 1 ? "" : "s"} in the app</p>
    <div class="box"><div class="shd2">${phaseChip(h)}<button class="spb" id="spb">${spText(h)}</button></div>
      ${waves ? `<ul class="waves">${waves}</ul>` : ""}${h.phase_confidence === "low" ? `<p class="hint">Phase dates are low confidence (estimated from the release date).</p>` : ""}
      ${rank ? `<p class="srank">${rank}</p>` : ""}</div>
    ${lineBox}
    <h2 class="sh2">Cards</h2><div class="segc" role="group">${[["price", "Price"], ["above", "Above fair"], ["move", "90 days"]].map(([v, l]) => `<button data-ss="${v}" aria-selected="${FP.setSort === v}">${l}</button>`).join("")}</div>
    <div id="sCards"></div>
    <h2 class="sh2">Sealed</h2><div id="sSealed"></div>
    <p class="foot">TCGplayer market price · fair price from HoloTrack's model (weekly refit). The set's line: TCGplayer archive + HoloTrack nightly, weekly, one source end to end.</p>`;
  $("back").onclick = () => { history.length > 1 ? history.back() : (location.hash = "sets"); };
  $("spb").onclick = async () => { await texts(); FP.order = [79];
    FP.card = { h: { name: h.name, segment: "chase" }, parts: [], beside: [], setSheet: h.set_premium == null
      ? `<p>Counts from the ${fmtDay(SP_ON)} refit. Until then it is measured but doesn't move any fair price.</p>`
      : spSplit(h) ? `<b class="big ${h.set_premium > 1 ? "up" : ""}">chase ${xm(+h.set_premium_chase)} · mid ${xm(+h.set_premium_mid)}</b><p>What Set premium adds to the fair price of the typical chase card and the typical mid card of ${esc(h.name)}, at the latest refit.</p>`
      : `<b class="big ${h.set_premium > 1 ? "up" : ""}">${xm(+h.set_premium)}</b><p>What Set premium adds to the fair price of the typical card in ${esc(h.name)}, at the latest refit.</p>` };
    sheet(79); };
  document.querySelectorAll("[data-ss]").forEach(b => b.onclick = () => { FP.setSort = b.dataset.ss; document.querySelectorAll("[data-ss]").forEach(x => x.setAttribute("aria-selected", x === b)); setCards(S); });
  const svg = document.querySelector("svg.sline");
  if (svg) { const move = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 340, L = S.line.weeks, maxW = Math.max(26, Math.min(L[L.length - 1], 160));
      let wk = Math.round(1 + (x - 30) / (340 - 38) * (maxW - 1)); wk = Math.max(L[0], Math.min(L[L.length - 1], wk));
      const c = $("scur"); c.style.display = ""; const xx = 30 + (340 - 38) * (wk - 1) / (maxW - 1); c.setAttribute("x1", xx); c.setAttribute("x2", xx); $("sread").innerHTML = setReadout(S, wk); };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move); }
  await loadWeekly(S.cards.map(r => r.card_id)).catch(() => {});
  setCards(S); setSealed(S);
}

/* ---- M9 Character screen (26 Nov, lab Decided; Alex 14:5x "Character screen in the app") ----
   1 header (dex · generation · species category P53; Character demand P1 for the typical card of this character; species
   prior from 7 Dec) · 2 the character's line since Feb 2024 vs all characters · 3 cards by look · 4 artists (plain counts).
   Same rules: no buy / sell words, no card images, orange only for counted parameters / above fair / above the band. */
const SP_PRIOR_ON = "2026-12-07";
const CATN = { regular: "Pokémon", "starter line": "Starter line", legendary: "Legendary", mythical: "Mythical", paradox: "Paradox", baby: "Baby", "ultra beast": "Ultra Beast", "pseudo-legendary": "Pseudo-legendary", eeveelution: "Eeveelution", mascot: "Mascot", trainer: "Trainer" };
const LOOKG = ["special illustration", "illustration", "alt art", "full art", "gold / rainbow", "regular"];
const catChip = h => `<span class="chip">${esc(CATN[h.category] || h.category || "")}</span>`;
const demTxt = h => h.demand == null ? `<span class="spx">Character demand · not counted yet</span>` : `<span class="spx ${+h.demand > 1 ? "up" : ""}"><b>${xm(+h.demand)}</b> · Character demand · for the typical card of this character</span>`;
async function loadChars() {
  if (FP.chars) return FP.chars;
  return FP.chars = PREVIEW ? (await fetch("preview.json").then(r => r.json())).chars || []
    : await q(sb.from("fp_char_header").select("*").order("demand", { ascending: false, nullsFirst: false }).range(0, 1999));
}
async function loadChar(name) {
  if (PREVIEW) { const P = await fetch("preview.json").then(r => r.json()); return (P.charScreens || {})[name] || null; }
  const [h, line, ev, cards] = await Promise.all([
    q(sb.from("fp_char_header").select("*").eq("character", name)).then(r => r[0] || null),
    q(sb.from("fp_char_line").select("*").eq("character", name)).then(r => r[0] || null),
    q(sb.from("fp_char_events").select("*").eq("character", name).order("day")),
    q(sb.from("fp_char_cards").select("*").eq("character", name).range(0, 999))]);
  return h && { h, line, ev, cards };
}
async function chars() {
  $("view").innerHTML = head() + `<h1>Characters</h1><p class="sub">Loading…</p>`;
  let L; try { L = await loadChars(); } catch (e) { L = []; }
  if (FP.tab !== "chars") return;
  const draw = f => { const rows = L.filter(c => !f || c.character.toLowerCase().includes(f.toLowerCase())).slice(0, 200);
    $("chList").innerHTML = rows.length ? `<div class="list">${rows.map(c => `<button class="srow" data-ch="${esc(c.character)}"><span class="cm"><b>${esc(c.character)}</b>
      <span>${c.dex ? "#" + c.dex + " · " : ""}${c.n_cards} card${c.n_cards === 1 ? "" : "s"} in the app</span><span class="srm">${catChip(c)}${c.demand != null ? ` <span class="spx ${+c.demand > 1 ? "up" : ""}">${xm(+c.demand)}</span>` : ""}</span></span>
      <svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>`).join("")}</div>` : `<div class="box empty"><p>No character matches.</p></div>`;
    document.querySelectorAll("#chList .srow").forEach(b => b.onclick = () => { location.hash = "char/" + encodeURIComponent(b.dataset.ch); }); };
  $("view").innerHTML = head() + `<h1>Characters</h1><p class="sub">${L.length} characters with cards in the app · by Character demand</p>
    <input id="chq" class="search" type="search" placeholder="Search characters" aria-label="Search characters"><div id="chList"></div>
    <p class="foot">Character demand (P1) is what the fair price counts for the character, for its typical card. The species prior switches on with the ${fmtDay(SP_PRIOR_ON)} refit.</p>`;
  $("chq").oninput = e => draw(e.target.value); draw("");
}
async function charScreen(name) {
  $("view").innerHTML = `<div class="top"><button id="back" class="bk"><svg viewBox="0 0 11 19" aria-hidden="true"><path d="M9.5 1.5 2 9.5l7.5 8"/></svg>Back</button><span class="private">PRIVATE</span></div><p class="sub">Loading…</p>`;
  $("back").onclick = () => { history.length > 1 ? history.back() : (location.hash = "chars"); };
  let S; try { S = await loadChar(name); } catch (e) { S = null; }
  if (!S) { $("view").innerHTML += `<p class="sub">This character has no cards in the model yet.</p>`; return; }
  const h = S.h, thin = h.n_cards < 5;
  // the line reuses the Set screen's "since Feb 2024" drawing, with all characters as the band
  const L = S.line ? { ...S.line, mode: "since", era_chase: S.line.band } : null;
  const SS = { h: { name: h.character, release_date: "2024-02-01" }, line: L, ev: S.ev || [], refName: "all characters" };
  const line = L ? setLineSvg(SS) : null;
  const lineBox = line ? `<div class="box"><div class="label">Since Feb 2024</div>${line}
      <p class="sread" id="sread">${setReadout(SS, L.weeks[L.weeks.length - 1])}</p>
      <div class="skey"><span><i class="kc"></i>median chase card (${L.n_chase || 0})</span><span><i class="km"></i>median mid card (${L.n_mid || 0})</span><span><i class="kt"></i>median chase card, all characters</span></div>
      <p class="hint">Each card is indexed to its own first 5 weeks from Feb 2024 (= 1.00). Orange where this character's chase cards sit above all characters. Dots are events; tap one for what past events like it did.</p></div>`
    : `<div class="box"><div class="label">Since Feb 2024</div><p class="why m">No weekly line yet for this character's chase or mid-tier cards.</p></div>`;
  const evl = (S.ev || []).slice().reverse().slice(0, 6).map(e => `<li>${esc(e.label)} · ${fmtDay(e.day)}<br><span class="m">${esc(e.tested)}</span></li>`).join("");
  FP.charSort = FP.charSort || "price";
  $("view").innerHTML = `<div class="top"><button id="back" class="bk"><svg viewBox="0 0 11 19" aria-hidden="true"><path d="M9.5 1.5 2 9.5l7.5 8"/></svg>Back</button><span class="private">PRIVATE</span></div>
    <h1 class="cardt">${esc(h.character)}</h1><p class="sub">${h.role === "trainer" ? "Trainer" : `${h.dex ? "#" + h.dex : ""}${h.generation ? " · Gen " + h.generation : ""}`} · ${h.n_cards} card${h.n_cards === 1 ? "" : "s"} in the app</p>
    <div class="box"><div class="shd2">${catChip(h)}<button class="spb" id="cdb">${demTxt(h)}</button></div>
      <p class="hint">${new Date() < new Date(SP_PRIOR_ON) ? `Species prior switches on ${fmtDay(SP_PRIOR_ON)}.` : "Species prior: see the sheet."}${thin ? " Few cards yet: leans on the species prior." : ""}</p></div>
    ${lineBox}
    ${evl ? `<div class="box"><div class="label">Events</div><ul class="waves">${evl}</ul></div>` : ""}
    <h2 class="sh2">Cards</h2><div class="segc" role="group">${[["price", "Price"], ["above", "Above fair"], ["move", "90 days"]].map(([v, l]) => `<button data-cs="${v}" aria-selected="${FP.charSort === v}">${l}</button>`).join("")}</div>
    <div id="cCards"></div>
    <h2 class="sh2">Artists</h2><div id="cArt"></div>
    <p class="foot">TCGplayer market price · fair price from HoloTrack's model (weekly refit). Events: tested wording only. Artists: plain counts of this character's chase cards.</p>`;
  $("back").onclick = () => { history.length > 1 ? history.back() : (location.hash = "chars"); };
  $("cdb").onclick = async () => { await texts(); FP.order = [1];
    FP.card = { h: { name: h.character, segment: "chase" }, parts: [], beside: [], setSheet: h.demand == null
      ? `<p>Not counted yet for this character.</p>`
      : `<b class="big ${+h.demand > 1 ? "up" : ""}">${xm(+h.demand)}</b><p>What Character demand adds to the fair price of the typical card of ${esc(h.character)}, at the latest refit (median of ${h.n_demand} cards).${thin ? " Few cards yet: this leans on the species prior from " + fmtDay(SP_PRIOR_ON) + "." : ""}</p>` };
    sheet(1); };
  document.querySelectorAll("[data-cs]").forEach(b => b.onclick = () => { FP.charSort = b.dataset.cs; document.querySelectorAll("[data-cs]").forEach(x => x.setAttribute("aria-selected", x === b)); charCards(S); });
  const svg = document.querySelector("svg.sline");
  if (svg && L) { const move = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 340, W = L.weeks, maxW = Math.max(26, Math.min(W[W.length - 1], 160));
      let wk = Math.round(1 + (x - 30) / (340 - 38) * (maxW - 1)); wk = Math.max(W[0], Math.min(W[W.length - 1], wk));
      const c = $("scur"); c.style.display = ""; const xx = 30 + (340 - 38) * (wk - 1) / (maxW - 1); c.setAttribute("x1", xx); c.setAttribute("x2", xx); $("sread").innerHTML = setReadout(SS, wk); };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move); }
  const art = {}; S.cards.filter(c => c.segment === "chase" && c.artist).forEach(c => { art[c.artist] = (art[c.artist] || 0) + 1; });
  const A = Object.entries(art).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $("cArt").innerHTML = A.length ? `<div class="box"><ul class="waves">${A.map(([a, n]) => `<li>${esc(a)} · ${n} card${n === 1 ? "" : "s"}</li>`).join("")}</ul></div>` : `<div class="box empty"><p>No chase cards of this character in the app.</p></div>`;
  await loadWeekly(S.cards.map(r => r.card_id)).catch(() => {});
  charCards(S);
}
function charCards(S) {
  const by = { price: (a, b) => (b.market_chf || 0) - (a.market_chf || 0), above: (a, b) => (b.l ?? -9) - (a.l ?? -9), move: (a, b) => (b.chg90 ?? -9) - (a.chg90 ?? -9) }[FP.charSort];
  const row = c => `<button class="crow" data-id="${esc(c.card_id)}"><span class="mini">${miniOf(c.card_id, c.name)}</span>
    <span class="cm"><b>${esc(c.name)}</b>${c.nickname ? `<span class="nick">Known to collectors as ${esc(c.nickname)}</span>` : ""}<span>${esc(c.set_name || c.set_id)} · ${esc(c.num)}</span>
    <span class="cv">${chf(c.market_chf)}${c.chg90 != null ? `<i>${c.chg90 >= 0 ? "+" : "−"}${Math.abs(c.chg90 * 100).toFixed(1)} % in 90 days</i>` : ""}</span>${fairLine(c)}</span>
    <svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>`;
  const main = S.cards.filter(c => c.segment !== "low"), low = S.cards.filter(c => c.segment === "low").sort(by);
  const groups = LOOKG.map(g => [g, main.filter(c => c.look_group === g).sort(by)]).filter(([, L]) => L.length);
  $("cCards").innerHTML = (groups.length ? groups.map(([g, L]) => `<div class="label lg">${esc(g.charAt(0).toUpperCase() + g.slice(1))} · ${L.length}</div><div class="list">${L.map(row).join("")}</div>`).join("") : `<div class="box empty"><p>No chase or mid-tier cards of this character in the app.</p></div>`)
    + (low.length ? `<details class="lowd"><summary>${low.length} low-tier card${low.length === 1 ? "" : "s"}</summary><div class="list">${low.map(row).join("")}</div></details>` : "");
  document.querySelectorAll("#cCards .crow").forEach(b => b.onclick = () => { location.hash = "card/" + encodeURIComponent(b.dataset.id); });
}
const KINDN = { booster_box: "Booster box", etb: "Elite Trainer Box", booster_bundle: "Booster bundle", booster: "Booster pack", tin: "Tin", blister: "Blister", collection: "Collection", theme_deck: "Theme deck", other: "Other" };
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
function setCards(S) {
  const by = { price: (a, b) => (b.market_chf || 0) - (a.market_chf || 0), above: (a, b) => (b.l ?? -9) - (a.l ?? -9), move: (a, b) => (b.chg90 ?? -9) - (a.chg90 ?? -9) }[FP.setSort];
  const main = S.cards.filter(c => c.segment !== "low").sort(by), low = S.cards.filter(c => c.segment === "low").sort(by);
  const row = c => `<button class="crow" data-id="${esc(c.card_id)}"><span class="mini">${miniOf(c.card_id, c.name)}</span>
    <span class="cm"><b>${esc(c.name)}</b><span>${LOOK[c.look] || esc(c.look)} · ${esc(c.num)}</span>
    <span class="cv">${chf(c.market_chf)}${c.chg90 != null ? `<i>${c.chg90 >= 0 ? "+" : "−"}${Math.abs(c.chg90 * 100).toFixed(1)} % in 90 days</i>` : ""}</span>${fairLine(c)}</span>
    <svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>`;
  $("sCards").innerHTML = (main.length ? `<div class="list">${main.map(row).join("")}</div>` : `<div class="box empty"><p>No chase or mid-tier cards of this set in the app.</p></div>`)
    + (low.length ? `<details class="lowd"><summary>${low.length} low-tier card${low.length === 1 ? "" : "s"}</summary><div class="list">${low.map(row).join("")}</div></details>` : "");
  document.querySelectorAll("#sCards .crow").forEach(b => b.onclick = () => { location.hash = "card/" + encodeURIComponent(b.dataset.id); });
}
// sealed_launch stores (a) % vs its start, (b) % vs the typical product of its kind, (c) % vs its set's singles; the kind's and the
// cards' own lines since the start follow from them: (1 + a) / (1 + b) − 1 and (1 + a) / (1 + c) − 1
const sealedLines = s => { const a = s.vs_launch || [], rel = r => a.map((v, i) => v == null || r[i] == null ? null : ((1 + v / 100) / (1 + r[i] / 100) - 1) * 100);
  return { p: a, k: rel(s.vs_kind || []), c: rel(s.vs_cards || []) }; };
function sealedSvg(s) {                                     // three lines since launch, in %: the product, its kind, the set's cards — no phase labels
  const n = (s.months || []).length; if (n < 2) return "";
  const S = sealedLines(s), w = 320, h = 120, p = 6, all = [...S.p, ...S.k, ...S.c].filter(v => v != null);
  const lo = Math.min(-10, ...all), hi = Math.max(10, ...all), X = i => p + (w - 2 * p) * i / (n - 1), Y = v => p + (h - 2 * p) * (1 - (v - lo) / (hi - lo));
  const pth = a => { let d = "", on = false; a.forEach((v, i) => { if (v == null) { on = false; return; } d += (on ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1); on = true; }); return d; };
  return `<svg class="sseal" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(s.name)} since ${s.launch ? "launch" : "Feb 2024"}, against its kind and the set's cards"><line class="sgrid" x1="${p}" x2="${w - p}" y1="${Y(0)}" y2="${Y(0)}"/>
    <path class="sk" d="${pth(S.k)}"/><path class="sc" d="${pth(S.c)}"/><path class="sp" d="${pth(S.p)}"/></svg>`;
}
function setSealed(S) {
  const KO = { booster_box: 0, etb: 1, booster_bundle: 2 }, ko = k => KO[k] ?? 9;
  const L = (S.sealed || []).filter(s => (s.months || []).length >= 2).sort((a, b) => ko(a.kind) - ko(b.kind) || (a.kind || "").localeCompare(b.kind || "") || a.name.localeCompare(b.name));
  if (!L.length) { $("sSealed").innerHTML = `<div class="box"><p class="why m">No sealed products tracked for this set.</p></div>`; return; }
  const main = L.filter(s => ko(s.kind) < 9), rest = L.filter(s => ko(s.kind) === 9), first = main.length ? main : rest.slice(0, 3), more = main.length ? rest : rest.slice(3);
  const one = s => { const i = Math.min(6, s.months.length - 1), SL = sealedLines(s), d = SL.p[i] != null && SL.k[i] != null ? SL.p[i] - SL.k[i] : null;
    const fact = d != null ? `${i} month${i === 1 ? "" : "s"} ${s.launch ? "after launch" : "into our history"}: ${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(0)} pts vs its kind` : "";
    return `<div class="box sbx"><b>${esc(s.name)}</b><span class="sub2">${esc(KINDN[s.kind] || s.kind || "")}${s.launch ? "" : " · line since Feb 2024"}</span>${sealedSvg(s)}
      <div class="skey"><span><i class="kp"></i>this product</span><span><i class="kk"></i>its kind</span><span><i class="ks"></i>the set's cards</span></div>${fact ? `<p class="sfact">${fact}</p>` : ""}</div>`; };
  $("sSealed").innerHTML = first.map(one).join("") + (more.length ? `<details class="lowd"><summary>${more.length} more sealed product${more.length === 1 ? "" : "s"} (tins, blisters, collections …)</summary>${more.map(one).join("")}</details>` : "");
}
const TABS = {
  collection,
  movers,
  compare,
  sets,
  chars,
};
function route() {
  const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (h.startsWith("card/")) { FP.tab = "collection"; card(h.slice(5)); }
  else if (h.startsWith("set/")) { FP.tab = "sets"; setScreen(h.slice(4)); }
  else if (h.startsWith("char/")) { FP.tab = "chars"; charScreen(h.slice(5)); }
  else { FP.tab = TABS[h] ? h : "collection"; TABS[FP.tab](); }
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-current", b.dataset.tab === FP.tab ? "page" : "false"));
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { location.hash = b.dataset.tab; });
window.addEventListener("hashchange", route);

async function start() {
  if (PREVIEW) { $("gate").hidden = true; $("app").hidden = false; route(); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $("gate").hidden = false; $("app").hidden = true; return; }
  const { data: ok, error } = await sb.rpc("fp_allowed");
  if (error || !ok) {
    $("gate").hidden = false; $("app").hidden = true;
    $("msg").textContent = "This preview is private. Your account isn't on the list."; await sb.auth.signOut(); return;
  }
  $("gate").hidden = true; $("app").hidden = false; route();
}
$("f").onsubmit = async e => {
  e.preventDefault(); $("msg").textContent = "Signing in…";
  const { error } = await sb.auth.signInWithPassword({ email: $("em").value.trim(), password: $("pw").value });
  if (error) { $("msg").textContent = "That didn't work. Check the e-mail and password."; return; }
  $("msg").textContent = ""; start();
};
start();
if ("serviceWorker" in navigator && !PREVIEW) navigator.serviceWorker.register("sw.js").catch(() => {});
