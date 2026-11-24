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
function card(id) {
  const r = (FP.rows || []).find(x => x.card_id === id);
  $("view").innerHTML = `<div class="top"><button onclick="history.back()">‹ Collection</button><span class="private">PRIVATE</span></div>
    <h1>${esc(r ? r.name : id)}</h1><p class="sub">${r ? `${esc(r.set_name || r.set_id)} · ${LOOK[r.look] || esc(r.look)} · ${esc(r.num)}` : ""}</p>
    <div class="box empty"><p>The card view (Today · Why · History) comes in the next build.</p></div>`;
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
