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
  }
}

/* ---------- the fingerprint (spiral): one turn per month since March 2024 ---------- */
const T0 = Date.parse("2024-03-01T00:00:00Z"), MONTH = 30.44 * 864e5;
function spiral(w, { size = 200, r0 = 14, r1 = 94, mini = false } = {}) {
  const c = size / 2, n = w.weeks.length;
  if (!n) return "";
  const t = w.weeks.map(d => Date.parse(d + "T00:00:00Z"));
  const tEnd = t[n - 1], span = Math.max(1, tEnd - Math.min(t[0], T0));
  const P = (ms, off = 0) => { const a = 2 * Math.PI * (ms - T0) / MONTH - Math.PI / 2, f = Math.max(0, (ms - Math.min(t[0], T0)) / span), r = r0 + (r1 - r0) * f + off;
    return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const lastTurn = tEnd - MONTH;
  let old = "", nw = "";
  for (let i = 1; i < n; i++) {
    const m = w.market_chf[i], f = w.fair_chf ? w.fair_chf[i] : null, l = (m && f) ? Math.log(m / f) : null;
    const col = l == null ? "var(--gr-1)" : l > 0 ? "var(--fp-3)" : "var(--gr-2)";
    const sw = (l == null ? 1.1 : 1.2 + Math.min(Math.abs(l), 2) * 1.3) * (mini ? 0.75 : 0.45);
    const s = w.sales ? w.sales[i] : null, strands = s == null || s <= 1 ? 1 : s <= 5 ? 2 : 3;
    const offs = strands === 1 ? [0] : strands === 2 ? [-1.4, 1.4] : [-2, 0, 2];
    let seg = "";
    for (const o of offs) {
      const pts = [];
      for (let k = 0; k <= 8; k++) { const [x, y] = P(t[i - 1] + (t[i] - t[i - 1]) * k / 8, o * (mini ? 0.5 : 1)); pts.push(x.toFixed(1) + "," + y.toFixed(1)); }
      seg += `<path d="M${pts.join(" L")}" style="fill:none;stroke:${col};stroke-width:${(sw / strands * (strands > 1 ? 1.4 : 1)).toFixed(2)}px;stroke-linecap:round" opacity="${l == null ? .9 : .88}"/>`;
    }
    if (t[i] > lastTurn) nw += seg; else old += seg;
  }
  return `${old}<g class="nw" style="transform-origin:${c}px ${c}px">${nw}</g>`;
}
function miniSvg(r) {
  const w = FP.weekly[r.card_id];
  if (!w || !w.weeks || w.weeks.length < 2)
    return `<svg viewBox="0 0 64 64" role="img" aria-label="No history yet"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--gr-2)" stroke-width="1.5" stroke-dasharray="2 4"/><text class="none" x="32" y="35" text-anchor="middle">none yet</text></svg>`;
  return `<svg viewBox="-4 -4 208 208" role="img" aria-label="Fingerprint of ${esc(r.name)}: one spiral turn per month since March 2024, orange where the price sat above the fair price">${spiral(w, { mini: true })}</svg>`;
}

/* ---------- breathing (§1 motion): one breath every 14 − 1.8·ln(1 + weekly sales) s, never faster than 7.5 s ---------- */
const breathers = [];
function period(sales4w) { return Math.max(7.5, 14 - 1.8 * Math.log(1 + (sales4w || 0) / 4)); }
function frame(ms) {
  if (!REDUCE.matches) for (const b of breathers) {
    if (!b.el.isConnected) continue;
    const s = 1 + b.depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * (ms / 1000) / b.per));
    b.el.style.transform = `scale(${s.toFixed(4)})`;
  } else for (const b of breathers) b.el.style.transform = "";
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
  rows.sort((a, b) => (b.market_chf || 0) - (a.market_chf || 0));
  const n = rows.reduce((s, r) => s + (r.qty || 1), 0), tot = rows.reduce((s, r) => s + (r.market_chf || 0) * (r.qty || 1), 0);
  if (!rows.length) {
    $("view").innerHTML = head() + `<h1>Collection</h1><p class="sub">0 cards</p><div class="box empty">
      <svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--gr-2)" stroke-width="1.5" stroke-dasharray="2 4"/></svg>
      <p>Your cards appear here with their fingerprints.</p></div>`; return;
  }
  await loadWeekly(rows.map(r => r.card_id)).catch(() => {});
  if (FP.tab !== "collection") return;
  $("view").innerHTML = head() + `<h1>Collection</h1><p class="sub">${n.toLocaleString("en-US")} cards · market ${chf(tot)}</p>
    <div class="list">${rows.map(r => `<button class="crow" data-id="${esc(r.card_id)}">
      <span class="mini">${miniSvg(r)}</span>
      <span class="cm"><b>${esc(r.name)}${r.qty > 1 ? ` <span style="color:var(--muted);font-weight:500">×${r.qty}</span>` : ""}</b>
        <span>${esc(r.set_name || r.set_id)} · ${LOOK[r.look] || esc(r.look)} · ${esc(r.num)}</span>${rowValue(r)}</span>
      <svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>`).join("")}</div>
    <p class="foot">TCGplayer market price · fair price from HoloTrack's model (weekly refit). Each fingerprint: one turn per month since March 2024, orange where the market sat above the fair price.</p>`;
  breathers.length = 0;
  document.querySelectorAll(".crow").forEach(b => {
    const r = rows.find(x => x.card_id === b.dataset.id), g = b.querySelector("g.nw");
    if (g) breathers.push({ el: g, per: period(r.sales_4w), depth: 0.03 });     // half depth for the minis
    b.onclick = () => { location.hash = "card/" + encodeURIComponent(b.dataset.id); };
  });
}
/* ---------- card → Today (spec §3.1, §4) ---------- */
const COUNTED = s => /^counted/.test(s || "");
async function loadCard(id) {
  if (PREVIEW) { const P = await fetch("preview.json").then(r => r.json()); return P.cards[id] || null; }
  const [h, parts, beside] = await Promise.all([
    q(sb.from("fp_card_header").select("*").eq("card_id", id)).then(r => r[0] || null),
    q(sb.from("fp_card_parts").select("n,name,family,contribution,raw,no_effect").eq("card_id", id)),
    q(sb.from("fp_card_beside").select("n,name,value,raw,flag,detail").eq("card_id", id))]);
  return h && { h, parts, beside };
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
  if (n === 23 && b && b.value != null) return `${pct(Math.log(1 + b.value))} against its own last 12 months`;
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
      ${ok ? `<p class="ctx">median of ${h.context_n} ${esc(h.context_label || "similar cards")}, this card left out</p>` : ""}
      <div class="facts">${h.sales_4w != null ? `<span><b>${h.sales_4w}</b> sales in 4 weeks</span>` : ""}</div></div>`;
  }
  const g = gap(h.l);
  return `<div class="box"><div class="hd"><div class="mk"><small>Market</small><b>${chf(h.market_chf)}</b></div>
    <div class="fr"><small>Fair price</small>${h.held ? `<b style="font-size:15px;color:var(--muted)">Fair price under review</b>` : `<b>${chf(h.fair_chf)}</b>${g ? `<em class="${g.cls}">${g.txt}</em>` : ""}`}</div></div>
    ${h.held ? "" : bar(h)}
    <div class="facts">${h.sales_4w != null ? `<span><b>${h.sales_4w}</b> sales in 4 weeks</span>` : ""}${h.character && h.character_cards ? `<span><b>${h.character_cards}</b> ${esc(h.character)} cards</span>` : ""}</div>
    <p class="src">TCGplayer market price, ${esc(h.day)} · fair price: HoloTrack's model, weekly refit</p></div>`;
}
function plist(C, T) {
  const h = C.h, parts = Object.fromEntries(C.parts.map(p => [p.n, p])), bes = Object.fromEntries(C.beside.map(b => [b.n, b]));
  const counted = [], beside = [], events = [], notyet = [];
  for (const t of T) {
    if (t.status === "baseline") counted.push([t, "sets the comparison", "m"]);
    else if (COUNTED(t.status)) {
      if (h.segment === "low") notyet.push([t, "not counted for low-tier cards", "m"]);
      else if (parts[t.n]) { const p = parts[t.n], r = Math.exp(p.contribution); counted.push([t, p.no_effect ? "×1 · adds nothing" : xm(r), p.no_effect ? "m" : r > 1 ? "up" : "m"]); }
      else notyet.push([t, `not counted for ${h.segment} cards`, "m"]);
    }
    else if (t.status === "behaviour") { const v = besideText(t.n, bes[t.n], h); beside.push([t, v || "not in the app yet", v ? "" : "m"]); }
    else if (t.status === "event") events.push([t, "dots on the fingerprint", "m"]);
    else notyet.push([t, t.status === "copy" ? "your copy" : t.status === "empty" ? "empty" : "observed", "m"]);
  }
  const row = ([t, v, cls]) => `<button class="pr" data-n="${t.n}"><span>${esc(t.name)}<i>P${t.n}</i></span><span class="pv ${cls}">${String(v).split(" · ").map(x => `<span class="nw">${esc(x)}</span>`).join(" · ")}</span></button>`;
  const grp = (title, rows, fold) => rows.length ? `<div class="pg"><div class="pgh">${title} · ${rows.length}</div>${fold ? `<div class="fold" hidden>${rows.map(row).join("")}</div><button class="more">Show all ${rows.length}</button>` : rows.map(row).join("")}</div>` : "";
  FP.order = [...counted, ...beside, ...events, ...notyet].map(([t]) => t.n);
  return `<div class="box plist">${grp("Counted in the fair price", counted)}${grp("Beside the price", beside)}${grp("Events", events)}${grp("Not yet counted", notyet, true)}</div>`;
}
const CHIP = { counted: "Counted in the fair price", behaviour: "Beside the price, never in it", event: "Dots on the fingerprint", observed: "Observed, not yet counted", empty: "Empty", copy: "Your copy only", baseline: "Sets the comparison" };
function sheet(n) {
  const C = FP.card, T = FP.texts, t = T.find(x => x.n === n); if (!t) return;
  const h = C.h, p = C.parts.find(x => x.n === n), st = COUNTED(t.status) ? "counted" : t.status;
  let on;
  if (st === "counted" && p && h.segment !== "low") on = p.no_effect ? `<p>Counted, but ${esc(h.name)} equals the typical card here, so it adds nothing (×1).</p>`
    : `<b class="big ${p.contribution > 0 ? "up" : ""}">${xm(Math.exp(p.contribution))}</b><p>${esc(p.raw || t.name)} · measured against the ${esc(h.typical_label || "typical card")}${h.typical_base_chf ? ` (${chf(h.typical_base_chf)})` : ""}</p>`;
  else if (st === "counted") on = `<p>Not counted for ${esc(h.segment)} cards.</p>`;
  else if (st === "baseline") on = `<p>Sets the comparison: ${esc(h.name)} is measured against the ${esc(h.typical_label || "typical card")}${h.typical_base_chf ? ` (${chf(h.typical_base_chf)})` : ""}, and every counted parameter starts from there.</p>`;
  else if (st === "behaviour") { const v = besideText(n, C.beside.find(b => b.n === n), h); on = `<p>${v ? esc(v) : "Not in the app yet."}</p>`; }
  else if (st === "event") on = `<p>Shown as dots on the fingerprint (History).</p>`;
  else if (st === "empty") on = `<p>Empty because ${esc(t.empty_reason || "no data source exists yet")}.</p>`;
  else if (st === "copy") on = `<p>Only for a copy you own: add condition or grade to your copy to see it.</p>`;
  else on = `<p>Collected for every card; not yet part of the fair price.</p>`;
  const i = FP.order.indexOf(n), prev = FP.order[i - 1], next = FP.order[i + 1];
  $("sheet").innerHTML = `<div class="grab"></div><div class="shd"><span class="label">P${n} · ${esc((t.family || "").toUpperCase())}</span><button id="sdone">Done</button></div>
    <h2 id="s-name">${esc(t.name)}</h2><span class="chip ${st === "counted" ? "ink" : ""}">${CHIP[st] || esc(st)}</span>
    <div class="on"><div class="label">On this card</div>${on}</div>
    ${t.what ? `<h3>What it is</h3><p>${esc(t.what)}</p>` : ""}${t.how ? `<h3>How it's measured</h3><p>${esc(t.how)}</p>` : ""}
    ${t.low_note ? `<h3>Low</h3><p>${esc(t.low_note)}</p>` : ""}${t.high_note ? `<h3>High</h3><p>${esc(t.high_note)}</p>` : ""}
    <div class="snav">${prev != null ? `<button data-go="${prev}">‹ Previous</button>` : "<span></span>"}${next != null ? `<button data-go="${next}">Next ›</button>` : ""}</div>`;
  $("sheet").classList.add("on"); $("scrim").classList.add("on"); $("sheet").scrollTop = 0; flowHighlight(n);
  $("sdone").onclick = closeSheet; $("sheet").querySelectorAll("[data-go]").forEach(b => b.onclick = () => sheet(+b.dataset.go));
}
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
document.addEventListener("click", e => { if (e.target && e.target.id === "scrim") closeSheet(); });
(() => { let y0 = null; document.addEventListener("touchstart", e => { const s = $("sheet"); y0 = s && s.contains(e.target) && s.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  document.addEventListener("touchend", e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 80) closeSheet(); y0 = null; }, { passive: true }); })();
function closeSheet() { $("sheet").classList.remove("on"); $("scrim").classList.remove("on"); flowHighlight(null); }
/* ---------- card → Today: the flow (spec §3.1) — parameters on the upper arc, the sieve on the diameter, the result below ---------- */
const FAM = ["context", "identity", "state", "lyrical", "copy"];          // left → right; Identity and State drawn large
const FAMW = { identity: .5, state: .22, context: .1, lyrical: .09, copy: .09 };
const FAMN = { identity: "Identity", state: "State", context: "Context", lyrical: "Lyrical", copy: "Copy" };
const STR = [];                                                              // counted strings that sway (middles only)
// one multiplier everywhere (lab 24 Nov): fair ÷ typical base from fp_card_header, rounded once by xm()
const prodOf = (h, sum) => h.fair_chf && h.typical_base_chf ? h.fair_chf / h.typical_base_chf : Math.exp(sum || 0);
function flowSvg(C, T) {
  const h = C.h, low = h.segment === "low", cx = 190, sy = 228, R = 172, Rr = 150;
  const parts = Object.fromEntries(C.parts.map(p => [p.n, p]));
  const byF = Object.fromEntries(FAM.map(f => [f, T.filter(t => (t.family || "").toLowerCase() === f).sort((a, b) => a.n - b.n)]));
  const gap = 0.035, span = Math.PI - gap * (FAM.length + 1);
  let a = Math.PI + gap, out = "", hits = "", fam = "", ids = [];
  const P = (ang, r) => [cx + r * Math.cos(ang), sy + r * Math.sin(ang)];
  const strings = [];
  const counted = C.parts.filter(p => !low && !p.no_effect).sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));
  const totStr = counted.reduce((s, p) => s + Math.max(1, Math.round(Math.abs(p.contribution) / 0.02)), 0);
  let k = 0;                                                                 // running string index → its x on the sieve
  for (const f of FAM) {
    const list = byF[f]; if (!list.length) continue;
    const fs = span * FAMW[f], a0 = a;
    const nS = t => { const p = parts[t.n]; return p && !low && !p.no_effect ? Math.max(1, Math.round(Math.abs(p.contribution) / 0.02)) : 0; };
    const wts = list.map(t => 1 + nS(t) * 0.35), wsum = wts.reduce((x, y) => x + y, 0);   // counted parameters get room for their strings
    const st = []; let acc = 0; for (const x of wts) { st.push(a0 + fs * acc / wsum); acc += x; }
    const sw = i => fs * wts[i] / wsum;
    const [x0, y0] = P(a0, R + 1), [x1, y1] = P(a0 + fs, R + 1);
    fam += `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${R + 1},${R + 1} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}" style="fill:none;stroke:var(--ink);stroke-width:${f === "identity" || f === "state" ? 3 : 2}px"/>`;
    const [lx0, ly0] = P(a0, R + 12), [lx1, ly1] = P(a0 + fs, R + 12);
    fam += `<path id="fl-${f}" d="M${lx0.toFixed(1)},${ly0.toFixed(1)} A${R + 12},${R + 12} 0 0 1 ${lx1.toFixed(1)},${ly1.toFixed(1)}" fill="none"/>
      <text class="fam ${f === "identity" || f === "state" ? "" : "sm"}"><textPath href="#fl-${f}" startOffset="50%" text-anchor="middle">${FAMN[f].toUpperCase()}</textPath></text>`;
    list.forEach((t, i) => {
      const am = st[i] + sw(i) / 2, p = parts[t.n], isC = p && !low && !p.no_effect;
      const [hx0, hy0] = P(st[i], R + 22), [hx1, hy1] = P(st[i] + sw(i), R + 22);
      hits += `<path class="hit" data-n="${t.n}" d="M${cx},${sy} L${hx0.toFixed(1)},${hy0.toFixed(1)} A${R + 22},${R + 22} 0 0 1 ${hx1.toFixed(1)},${hy1.toFixed(1)} Z"><title>${esc(t.name)}</title></path>`;
      if (!isC) {                                                            // grey hairline to the sieve
        const [px, py] = P(am, R), hx = cx + (px - cx) * .82;
        out += `<path data-p="${t.n}" class="hair" d="M${px.toFixed(1)},${py.toFixed(1)} C${px.toFixed(1)},${(py + (sy - py) * .6).toFixed(1)} ${hx.toFixed(1)},${(sy - 14).toFixed(1)} ${hx.toFixed(1)},${sy}"/>`;
        return;
      }
      const n = Math.max(1, Math.round(Math.abs(p.contribution) / 0.02)), up = p.contribution > 0;
      for (let j = 0; j < n; j++) {
        const aj = st[i] + sw(i) * (0.08 + 0.84 * (n === 1 ? .5 : j / (n - 1)));
        const [px, py] = P(aj, R), kk = counted.indexOf(p);
        strings.push({ n: t.n, px, py, up, j, kk });
      }
    });
    a += fs + gap;
  }
  // strings: order on the sieve follows the arc; landing on the lower result arc
  strings.sort((s1, s2) => s1.px - s2.px);
  const w = 250, sx0 = cx - w / 2;
  strings.forEach((s, i) => {
    const hx = sx0 + w * (strings.length === 1 ? .5 : i / (strings.length - 1));
    const la = Math.PI * (0.18 + 0.64 * (strings.length === 1 ? .5 : i / (strings.length - 1)));
    const lx = cx - Rr * Math.cos(la) * .72, ly = sy + 40 + Rr * Math.sin(la) * .95;
    s.hx = hx; s.lx = lx; s.ly = ly;
    const col = s.up ? "var(--fp-3)" : "var(--fp-2)", op = s.up ? .95 : .6;
    out += `<path data-p="${s.n}" class="str" style="stroke:${col}" opacity="${op}" d="${strD(s, 0)}"/>`;
    if (!low) out += `<path data-p="${s.n}" class="str2" style="stroke:${col}" opacity="${op * .8}" d="M${hx.toFixed(1)},${sy} C${hx.toFixed(1)},${sy + 50} ${lx.toFixed(1)},${(ly - 50).toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)}"/>`;
  });
  STR.length = 0; strings.forEach(s => STR.push(s));
  const sieve = `<line x1="${cx - R}" y1="${sy}" x2="${cx + R}" y2="${sy}" class="sieve"/>` +
    Array.from({ length: 35 }, (_, i) => { const x = cx - R + i * (2 * R / 34); return `<line x1="${x.toFixed(1)}" y1="${sy - 3}" x2="${x.toFixed(1)}" y2="${sy + 3}" class="tick"/>`; }).join("");
  const sum = C.parts.reduce((s, p) => s + (p.contribution || 0), 0);
  const [r0x, r0y] = [cx - Rr * .78, sy + 40 + Rr * .55], [r1x, r1y] = [cx + Rr * .78, sy + 40 + Rr * .55];
  const res = low ? "NO FAIR PRICE · LOW TIER" : `RESULT ${xm(prodOf(h, sum))} → FAIR ${h.fair_chf ? Math.round(h.fair_chf).toLocaleString("en-US") : "—"}`;
  const resArc = `<path id="fl-res" d="M${r0x.toFixed(1)},${r0y.toFixed(1)} A${Rr},${Rr * .9} 0 0 0 ${r1x.toFixed(1)},${r1y.toFixed(1)}" class="${low ? "resl" : "resa"}"/>
    <path id="fl-rest" d="M${(r0x - 6).toFixed(1)},${(r0y + 14).toFixed(1)} A${Rr + 10},${(Rr + 10) * .9} 0 0 0 ${(r1x + 6).toFixed(1)},${(r1y + 14).toFixed(1)}" fill="none"/>
    <text class="res ${low ? "" : "on"}"><textPath href="#fl-rest" startOffset="50%" text-anchor="middle">${res}</textPath></text>`;
  const aria = low ? `Flow of ${h.name}: every parameter stops at the sieve; low-tier cards have no fair price.`
    : `Flow of ${h.name}, read top to bottom: ${T.length} parameters on the upper arc, a sieve on the diameter, the result on the lower arc. ${counted.length} counted parameters pass, together ${xm(prodOf(h, sum))}.`;
  return `<svg class="flow" viewBox="-14 -4 408 ${low ? 300 : 470}" role="img" aria-label="${esc(aria)}"><g class="fams">${fam}</g><g class="ss">${out}</g>${sieve}${low ? "" : resArc}${low ? `<text class="res" x="${cx}" y="${sy + 34}" text-anchor="middle">${res}</text>` : ""}<g class="hits">${hits}</g></svg>`;
}
function strD(s, d) {
  const my = s.py + (228 - s.py) * .55;
  return `M${s.px.toFixed(1)},${s.py.toFixed(1)} C${(s.px + d).toFixed(1)},${my.toFixed(1)} ${(s.hx + d).toFixed(1)},${(228 - 16).toFixed(1)} ${s.hx.toFixed(1)},228`;
}
function swayFrame(ms) {                                                     // string ends fixed, middles sway ±3 pt at the card's pace
  if (!REDUCE.matches && FP.card && document.querySelector("svg.flow")) {
    const per = period(FP.card.h.sales_4w), els = document.querySelectorAll("svg.flow path.str");
    els.forEach((el, i) => { const s = STR[i]; if (!s) return; const d = 3 * Math.sin(2 * Math.PI * (ms / 1000) / per + i * .07); el.setAttribute("d", strD(s, d)); });
  }
  requestAnimationFrame(swayFrame);
}
requestAnimationFrame(swayFrame);
function flowHighlight(n) {
  const svg = document.querySelector("svg.flow"); if (!svg) return;
  svg.classList.toggle("dim", n != null);
  svg.querySelectorAll("[data-p]").forEach(e => e.classList.toggle("hl", +e.dataset.p === n));
  svg.querySelectorAll(".hit").forEach(e => e.classList.toggle("hl", +e.dataset.n === n));
}
/* ---------- card → Why (spec §3.2): one sentence and a step chart on one log scale ---------- */
const NAMEL = { 1: "character", 3: "scarcity", 7: "kind", 9: "artist", 10: "card look", 79: "set premium" };
function whyPane(C) {
  const h = C.h;
  if (h.held) return `<div class="box"><p class="why">Fair price under review — the steps come back once the guard clears.</p></div>`;
  const steps = C.parts.filter(p => !p.no_effect).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const base = h.typical_base_chf, fair = h.fair_chf, m = h.market_chf;
  if (!base || !fair) return `<div class="box"><p class="why">No fair price for this card yet.</p></div>`;
  const prod = prodOf(h), names = steps.map(p => NAMEL[p.n] || p.name.toLowerCase());
  const list = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names.at(-1) : names[0] || "Nothing";
  let s2;
  if (m > h.band50_hi) s2 = `The market pays ${xm(m / fair)} more: priced by something the model doesn't count yet.`;
  else if (m < h.band50_lo) s2 = `The market pays less (${xm(m / fair)} of it): priced by something the model doesn't count yet.`;
  else s2 = `The market, ${chf(m)}, sits inside the middle half of similar cards.`;
  const s1 = `Start from the ${esc(h.typical_label || "typical card")} at ${chf(base)}. ${list.charAt(0).toUpperCase() + list.slice(1)} take${names.length === 1 ? "s" : ""} it ${xm(prod)} to a fair price of ${chf(fair)}.`;
  // step chart
  const W = 340, RH = 44, L = 8, Rt = W - 70, rows = [];
  let run = base;
  rows.push({ label: h.typical_label ? "Typical card" : "Typical", from: base, to: base, dot: true, txt: chf(base) });
  for (const p of steps) { const to = run * Math.exp(p.contribution); rows.push({ label: p.name, from: run, to, up: p.contribution > 0, txt: xm(Math.exp(p.contribution)), run: chf(to) }); run = to; }
  rows.push({ label: "Fair price", from: fair, to: fair, fair: true, txt: chf(fair) });
  rows.push({ label: "Market", from: fair, to: m, mkt: true, up: m > fair, txt: chf(m) });
  const vals = rows.flatMap(r => [r.from, r.to]).concat([h.band50_lo, h.band50_hi]).filter(v => v > 0);
  const lo = Math.log(Math.min(...vals)) - .15, hi = Math.log(Math.max(...vals)) + .15, X = v => L + (Rt - L) * (Math.log(v) - lo) / (hi - lo);
  const H = rows.length * RH + 8;
  const svg = rows.map((r, i) => {
    const y = 8 + i * RH, by = y + 24;
    let g = `<text class="wl" x="${L}" y="${y + 12}">${esc(r.label)}</text><text class="wv ${r.up && !r.mkt ? "up" : ""}" x="${W}" y="${y + 12}" text-anchor="end">${esc(r.txt)}</text>`;
    if (r.run) g += `<text class="wr" x="${W}" y="${by + 4}" text-anchor="end">${esc(r.run)}</text>`;
    if (r.dot) g += `<circle cx="${X(r.from)}" cy="${by}" r="4" class="wdot"/>`;
    else if (r.fair) g += `<rect x="${X(h.band50_lo)}" y="${by - 5}" width="${X(h.band50_hi) - X(h.band50_lo)}" height="10" rx="5" class="wband"/><line x1="${X(fair)}" x2="${X(fair)}" y1="${by - 8}" y2="${by + 8}" class="wtick"/>`;
    else { const a = Math.min(X(r.from), X(r.to)), b = Math.max(X(r.from), X(r.to));
      g += `<rect x="${a}" y="${by - 4}" width="${Math.max(2, b - a)}" height="8" rx="4" class="${r.mkt ? (r.up ? "wmkt up" : "wmkt") : r.up ? "wup" : "wdn"}"/>`; }
    return g;
  }).join("");
  return `<div class="box"><p class="why">${s1}</p><p class="why m">${s2}</p>
    <svg class="wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Steps from the typical card to the fair price and the market, one log scale">${svg}</svg>
    <p class="note">One scale for every row (each step is a multiple). Grey band on the fair-price row: half of similar cards (${chf(h.band50_lo)}–${chf(h.band50_hi)}).</p></div>`;
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
    if (PREVIEW) C.events = ((await fetch("preview.json").then(r => r.json())).events || []);
    else {
      const ors = [`scope.eq.all`, `and(scope.eq.set,scope_id.eq.${C.h.set_id})`, `and(scope.eq.card,scope_id.eq.${id})`];
      if (C.h.character) ors.push(`and(scope.eq.character,scope_id.eq."${C.h.character.replace(/"/g, "")}")`);
      C.events = await q(sb.from("fp_events").select("id,day,n,label,scope,scope_id,phase").neq("n", "P32").or(ors.join(","))).catch(() => []);
    }
  }
}
function histPane(C) {
  const h = C.h, w = FP.weekly[h.card_id];
  if (!w || !w.weeks || w.weeks.length < 2) return `<div class="box"><div class="empty" style="padding:20px 8px"><b>No history yet</b><p>HoloTrack has not exported ${esc(h.name)}'s weekly line. Today's figures are real; the spiral appears once the weekly file arrives.</p></div></div>`;
  const low = h.segment === "low";
  const ww = low ? { ...w, fair_chf: w.weeks.map(() => null) } : w;
  const t = w.weeks.map(d => Date.parse(d + "T00:00:00Z")), t0 = Math.min(t[0], T0), span = Math.max(1, t.at(-1) - t0);
  const pos = ms => { const a = 2 * Math.PI * (ms - T0) / MONTH - Math.PI / 2, f = Math.max(0, (ms - t0) / span), r = 14 + 80 * f; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]; };
  const evs = (C.events || []).filter(e => { const ms = Date.parse(e.day + "T00:00:00Z"); return ms >= t[0] && ms <= t.at(-1); });
  const dots = evs.map((e, i) => { const [x, y] = pos(Date.parse(e.day + "T00:00:00Z")); return `<circle class="ev" data-e="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2"><title>${esc(e.label)}</title></circle>`; }).join("");
  C._hist = { w, t, pos, evs, low };
  return `<div class="box ringbox"><div class="ro"><span class="d" id="ro-d"></span><span class="g" id="ro-g"></span><span class="m" id="ro-m"></span><span class="s" id="ro-s"></span></div>
    <svg class="fp big" id="fpbig" viewBox="-4 -4 208 208" role="img" aria-label="Fingerprint of ${esc(h.name)}: one spiral turn per month since March 2024${low ? ", grey throughout: low-tier cards have no fair price" : ", orange where the market sat above the fair price"}">${spiral(ww)}<g class="evs">${dots}</g><circle id="mkr" r="4.5" class="mkr"/></svg>
    <input type="range" id="scrub" min="0" max="${w.weeks.length - 1}" value="${w.weeks.length - 1}" aria-label="Week">
    <p class="hint">Drag along the spiral or the slider · tap a dot for its event · one turn per month · ${low ? "grey throughout: low-tier cards have no fair price" : "orange = above fair price"}</p>
    <p class="evl" id="evl" hidden></p></div>`;
}
function histWeek(i) {
  const H = FP.card && FP.card._hist; if (!H) return;
  const { w, t, pos, low } = H, m = w.market_chf[i], f = low ? null : (w.fair_chf || [])[i], s = (w.sales || [])[i];
  const [x, y] = pos(t[i]); const mk = $("mkr"); if (mk) { mk.setAttribute("cx", x.toFixed(1)); mk.setAttribute("cy", y.toFixed(1)); }
  $("scrub").value = i;
  $("ro-d").textContent = "Week of " + new Date(t[i]).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  $("ro-m").textContent = chf(m);
  const g = f ? gap(Math.log(m / f)) : null;
  $("ro-g").innerHTML = g ? `<span class="${g.cls}">${g.txt}</span> fair` : "";
  $("ro-s").textContent = low ? `low tier · no fair price${s != null ? ` · ${s} sales that week` : ""}`
    : (f ? `fair ${chf(f)}` : "no fair price yet (before the first refit)") + " · " + (s != null ? `${s} sale${s === 1 ? "" : "s"} that week` : "sales not counted yet");
}
function histWire() {
  const H = FP.card && FP.card._hist, svg = $("fpbig"); if (!H || !svg) return;
  histWeek(H.w.weeks.length - 1);
  $("scrub").oninput = e => histWeek(+e.target.value);
  const near = ev => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q2 = p.matrixTransform(svg.getScreenCTM().inverse());
    let bi = 0, bd = 1e9; H.t.forEach((ms, i) => { const [x, y] = H.pos(ms), d = (x - q2.x) ** 2 + (y - q2.y) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
  let drag = false;
  svg.addEventListener("pointerdown", ev => { if (ev.target.classList.contains("ev")) return; drag = true; svg.setPointerCapture(ev.pointerId); histWeek(near(ev)); });
  svg.addEventListener("pointermove", ev => { if (drag) histWeek(near(ev)); });
  svg.addEventListener("pointerup", () => { drag = false; });
  svg.querySelectorAll(".ev").forEach(d => d.onclick = () => { const e = H.evs[+d.dataset.e], el = $("evl");
    el.hidden = false; el.innerHTML = `<b>${new Date(e.day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</b> · ${esc(eventLabel(e))}`;
    const ms = Date.parse(e.day + "T00:00:00Z"); let i = H.t.findIndex(x => x >= ms); if (i < 0) i = H.t.length - 1; histWeek(i); });
}
async function card(id) {
  FP.tab = "collection";
  $("view").innerHTML = `<div class="top"><button id="back">‹ Back</button><span class="private">PRIVATE</span></div><h1>…</h1>`;
  $("back").onclick = () => { history.length > 1 ? history.back() : (location.hash = "collection"); };
  let C, T;
  try { [C, T] = await Promise.all([loadCard(id), texts()]); } catch (e) { C = null; }
  if (!C) { $("view").innerHTML += `<p class="sub">This card has no figures in the model yet.</p>`; return; }
  FP.card = C; const h = C.h;
  $("view").innerHTML = `<div class="top"><button id="back">‹ Back</button><span class="private">PRIVATE</span></div>
    <h1 class="cardt">${esc(h.name)}</h1><p class="sub">${esc(h.set_name || h.set_id)} · ${LOOK[h.look] || esc(h.look)} · ${esc(h.num)}</p>
    <div class="segc" role="tablist"><button role="tab" data-p="today" aria-selected="true">Today</button>${h.segment === "low" ? "" : `<button role="tab" data-p="why" aria-selected="false">Why</button>`}<button role="tab" data-p="hist" aria-selected="false">History</button></div>
    ${headerBox(h)}
    <div id="p-today"><div class="box flowbox">${flowSvg(C, T)}<p class="hint">Tap a string or a name, or pick from the list below</p></div>
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
  document.querySelectorAll(".pr, .hit").forEach(b => b.onclick = () => sheet(+b.dataset.n));
  document.querySelectorAll(".more").forEach(b => b.onclick = () => { b.previousElementSibling.hidden = false; b.remove(); });
}
/* ---------- Compare (spec §5) ---------- */
function cropW(w, weeks) { if (!w || !w.weeks) return w; const k = Math.max(0, w.weeks.length - weeks); return { weeks: w.weeks.slice(k), market_chf: w.market_chf.slice(k), fair_chf: (w.fair_chf || []).slice(k), sales: (w.sales || []).slice(k) }; }
function miniOf(id, name, weeks) {
  const w = FP.weekly[id];
  if (!w || !w.weeks || w.weeks.length < 2) return `<svg viewBox="0 0 64 64" role="img" aria-label="No history yet"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--gr-2)" stroke-width="1.5" stroke-dasharray="2 4"/><text class="none" x="32" y="35" text-anchor="middle">none yet</text></svg>`;
  return `<svg viewBox="-4 -4 208 208" role="img" aria-label="Fingerprint of ${esc(name)}">${spiral(weeks ? cropW(w, weeks) : w, { mini: true })}</svg>`;
}
async function compare() {
  $("view").innerHTML = head() + `<h1>Compare</h1><p class="sub">Loading…</p>`;
  let rows; try { rows = FP.rows = FP.rows || await loadCollection(); } catch (e) { rows = []; }
  if (FP.tab !== "compare") return;
  const opts = [...rows].sort((a, b) => (a.name || "").localeCompare(b.name || "") || (b.market_chf || 0) - (a.market_chf || 0));
  if (opts.length < 2) { $("view").innerHTML = head() + `<h1>Compare</h1><p class="sub">Add two cards to your collection to compare them.</p>`; return; }
  const byMkt = [...rows].sort((a, b) => (b.market_chf || 0) - (a.market_chf || 0));
  FP.cmp = FP.cmp || [byMkt[0].card_id, byMkt[1].card_id];
  const sel = i => `<select id="cmp${i}" aria-label="Card ${i + 1}">${opts.map(r => `<option value="${esc(r.card_id)}" ${FP.cmp[i] === r.card_id ? "selected" : ""}>${esc(r.name)} · ${esc(r.set_name || r.set_id)} · ${esc(r.num)}</option>`).join("")}</select>`;
  $("view").innerHTML = head() + `<h1>Compare</h1><p class="sub">Two cards side by side.</p>
    <div class="box cmpsel">${sel(0)}${sel(1)}</div><div id="cmpt"><div class="box"><p class="why m">Loading…</p></div></div>`;
  [0, 1].forEach(i => $("cmp" + i).onchange = e => { FP.cmp[i] = e.target.value; cmpTable(); });
  cmpTable();
}
async function cmpTable() {
  const ids = FP.cmp; let A, B, T;
  try { [A, B, T] = await Promise.all([loadCard(ids[0]), loadCard(ids[1]), texts()]); await loadWeekly(ids); } catch (e) { }
  if (FP.tab !== "compare") return;
  const cs = [A, B];
  const cell = (C, f) => !C ? "—" : f(C);
  const lowRow = (C, f) => C.h.segment === "low" ? "—" : f(C);
  const head2 = cs.map((C, i) => `<div class="cmph"><span class="mini">${miniOf(ids[i], C ? C.h.name : ids[i])}</span><b>${esc(C ? C.h.name : ids[i])}</b><span>${C ? `${esc(C.h.set_name || C.h.set_id)} · ${LOOK[C.h.look] || esc(C.h.look)} · ${esc(C.h.num)}` : "not in the model"}</span></div>`).join("");
  const rows = [
    ["Market", C => chf(C.h.market_chf)],
    ["Fair price", C => C.h.segment === "low" ? (C.h.context_median_chf && C.h.context_n >= 5 ? `similar ${chf(C.h.context_median_chf)}` : "—") : C.h.held ? "under review" : chf(C.h.fair_chf)],
    ["Market vs fair", C => lowRow(C, C => { const g = gap(C.h.l); return g ? `<span class="${g.cls === "up" ? "upc" : "dnc"}">${g.txt}</span>` : "—"; })],
    ["Middle half", C => lowRow(C, C => C.h.band50_lo ? `${Math.round(C.h.band50_lo).toLocaleString("en-US")}–${Math.round(C.h.band50_hi).toLocaleString("en-US")}` : "—")],
    ["Typical card", C => lowRow(C, C => C.h.typical_base_chf ? chf(C.h.typical_base_chf) : "—")],
  ];
  const pn = [...new Set(cs.flatMap(C => C && C.h.segment !== "low" ? C.parts.map(p => p.n) : []))].sort((a, b) => a - b);
  for (const n of pn) {
    const t = (T || []).find(x => x.n === n);
    rows.push([t ? t.name : "P" + n, C => lowRow(C, C => { const p = C.parts.find(x => x.n === n); if (!p) return "not counted"; if (p.no_effect) return "×1"; const r = Math.exp(p.contribution); return `<span class="${r > 1 ? "upc" : ""}">${xm(r)}</span>`; })]);
  }
  rows.push(["Sales", C => C.h.sales_4w != null ? `${C.h.sales_4w} in 4 weeks` : "—"]);
  rows.push(["Breathes every", C => `${period(C.h.sales_4w).toFixed(1)} s`]);
  $("cmpt").innerHTML = `<div class="box cmpgrid">${head2}</div><div class="box ctable">${rows.map(([l, f]) => `<div class="cr"><span>${esc(l)}</span><span>${cell(cs[0], f)}</span><span>${cell(cs[1], f)}</span></div>`).join("")}</div>`;
}

/* ---------- Movers (Build brief 23 Nov) ---------- */
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
    if (PREVIEW) rows = ((await fetch("preview.json").then(r => r.json())).movers || []).filter(r => r[W.chg] != null && (r[W.sold] || 0) >= W.floor && (M.dir === "up" ? r[W.chg] > 0 : r[W.chg] < 0)).sort((a, b) => M.dir === "up" ? b[W.chg] - a[W.chg] : a[W.chg] - b[W.chg]);
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
  await loadWeekly(rows.map(r => r.card_id)).catch(() => {});
  if (FP.tab !== "movers") return;
  $("mvList").innerHTML = rows.length ? `<div class="list">${rows.map(r => { const c = +r[W.chg]; return `<button class="crow" data-id="${esc(r.card_id)}">
      <span class="mini">${miniOf(r.card_id, r.name, W.weeks)}</span>
      <span class="cm"><b>${esc(r.name)}</b><span>${esc(r.set_name || r.set_id)} · ${LOOK[r.look] || esc(r.look)} · ${esc(r.num)}</span>
      <span class="cv">${chf(+r.market_chf)}<em class="mv">${c > 0 ? "▲ +" : "▼ −"}${Math.abs(c * 100).toFixed(1)} %</em><i>${r[W.sold]} sold in ${M.win} days</i></span></span>
      <svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>`; }).join("")}</div>
      <p class="foot">Top ${rows.length}. Sales floor: ${W.floor}+ copies sold in the window. Each fingerprint shows the last ${W.weeks} weeks.</p>`
    : `<div class="box empty"><p>No card moved this way with enough sales in this window.</p></div>`;
  document.querySelectorAll("#mvList .crow").forEach(b => b.onclick = () => { location.hash = "card/" + encodeURIComponent(b.dataset.id); });
}
const TABS = {
  collection,
  movers,
  compare,
};
function route() {
  const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (h.startsWith("card/")) { FP.tab = "collection"; card(h.slice(5)); }
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
