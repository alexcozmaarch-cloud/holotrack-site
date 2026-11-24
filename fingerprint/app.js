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
    const sw = (l == null ? 1.1 : 1.2 + Math.min(Math.abs(l), 2) * 1.3) * (mini ? 0.75 : 1);
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
  if (n === 21 && b && b.detail) return `${pct(b.detail.k4)} in 4 weeks · ${pct(b.detail.k8)} in 8 · ${pct(b.detail.k26)} in 26`;
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
  const row = ([t, v, cls]) => `<button class="pr" data-n="${t.n}"><span>${esc(t.name)}<i>P${t.n}</i></span><span class="pv ${cls}">${esc(v)}</span></button>`;
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
  $("sheet").classList.add("on"); $("scrim").classList.add("on"); $("sheet").scrollTop = 0;
  $("sdone").onclick = closeSheet; $("sheet").querySelectorAll("[data-go]").forEach(b => b.onclick = () => sheet(+b.dataset.go));
}
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
document.addEventListener("click", e => { if (e.target && e.target.id === "scrim") closeSheet(); });
(() => { let y0 = null; document.addEventListener("touchstart", e => { const s = $("sheet"); y0 = s && s.contains(e.target) && s.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  document.addEventListener("touchend", e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 80) closeSheet(); y0 = null; }, { passive: true }); })();
function closeSheet() { $("sheet").classList.remove("on"); $("scrim").classList.remove("on"); }
async function card(id) {
  FP.tab = "collection";
  $("view").innerHTML = `<div class="top"><button id="back">‹ Collection</button><span class="private">PRIVATE</span></div><h1>…</h1>`;
  $("back").onclick = () => { location.hash = "collection"; };
  let C, T;
  try { [C, T] = await Promise.all([loadCard(id), texts()]); } catch (e) { C = null; }
  if (!C) { $("view").innerHTML += `<p class="sub">This card has no figures in the model yet.</p>`; return; }
  FP.card = C; const h = C.h;
  $("view").innerHTML = `<div class="top"><button id="back">‹ Collection</button><span class="private">PRIVATE</span></div>
    <h1 class="cardt">${esc(h.name)}</h1><p class="sub">${esc(h.set_name || h.set_id)} · ${LOOK[h.look] || esc(h.look)} · ${esc(h.num)}</p>
    <div class="segc" role="tablist"><button role="tab" aria-selected="true">Today</button>${h.segment === "low" ? "" : `<button role="tab" aria-selected="false" disabled>Why</button>`}<button role="tab" aria-selected="false" disabled>History</button></div>
    ${headerBox(h)}
    <div class="box flowph"><p>The flow (every parameter on one arc) comes in the next build. Tap a row below to read a parameter.</p></div>
    ${plist(C, T)}`;
  $("back").onclick = () => { location.hash = "collection"; };
  document.querySelectorAll(".pr").forEach(b => b.onclick = () => sheet(+b.dataset.n));
  document.querySelectorAll(".more").forEach(b => b.onclick = () => { b.previousElementSibling.hidden = false; b.remove(); });
}
const TABS = {
  collection,
  movers: () => { $("view").innerHTML = head() + `<h1>Movers</h1><p class="sub">Rising and falling cards over 7, 30 and 90 days.</p><div class="box empty"><p>Coming in a later build.</p></div>`; },
  compare: () => { $("view").innerHTML = head() + `<h1>Compare</h1><p class="sub">Two cards side by side.</p><div class="box empty"><p>Coming in a later build.</p></div>`; },
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
