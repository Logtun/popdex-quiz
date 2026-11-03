// host login expires 30 s after the host/editor page is left (Alogi, 2026-10-31)
(function () {
  const K = "pq_host_token", S = "pq_host_seen", TTL = 30000;
  try {
    const seen = +localStorage.getItem(S) || 0;
    const onHost = /\/(host|editor)(\.html)?$/.test(location.pathname);
    const liveGame = () => /\/host(\.html)?$/.test(location.pathname) && !!localStorage.getItem("pq_host_game"); // never lock the host out mid-game
    if (localStorage.getItem(K) && Date.now() - seen > TTL && !liveGame()) localStorage.removeItem(K);
    const mark = () => { if (onHost && localStorage.getItem(K)) localStorage.setItem(S, String(Date.now())); };
    mark(); setInterval(mark, 5000);
    window.addEventListener("pagehide", mark);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { const s = +localStorage.getItem(S) || 0; if (localStorage.getItem(K) && Date.now() - s > TTL && !liveGame()) { localStorage.removeItem(K); location.reload(); } else mark(); } });
  } catch (e) {}
})();
// shared helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let clockOffset = 0; // server now - local now
function serverNow() { return Date.now() + clockOffset; }
async function api(path, opts = {}) {
  const headers = { "content-type": "application/json" };
  const t = localStorage.getItem("pq_host_token"); if (t) headers.authorization = "Bearer " + t;
  const t0 = Date.now();
  let r;
  try { r = await fetch("/api/" + path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store", signal: opts.signal }); }
  catch (e) { return { ok: false, error: "Connection lost, retrying…", net: true, aborted: !!(e && e.name === "AbortError") }; }
  let j; try { j = await r.json(); } catch { j = { ok: false, error: "Unexpected server reply (" + r.status + ")." }; }
  if (j && j.now) { const rtt = Date.now() - t0; const off = j.now - (t0 + rtt / 2); clockOffset = clockOffset ? clockOffset * 0.7 + off * 0.3 : off; }
  j.status = r.status; return j;
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toast(msg, ms = 2600) { const d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), ms); }
const SHAPES = [
  '<svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2z" fill="currentColor"/></svg>',
  '<svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12z" fill="currentColor"/></svg>',
  '<svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>',
  '<svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor"/></svg>',
];
const SHAPE_NAMES = ["triangle", "diamond", "circle", "square"];
// answer: number, or [i, j] for "select two"; picked: number or array of picks
const asList = (v) => v == null ? [] : Array.isArray(v) ? v.map(Number) : [Number(v)];
function answerButtons(q, { onPick, picked = null, answer = null, disabled = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "answers" + (q.type === "tf" ? " tf" : "") + (q.type === "multi" ? " multi" : "");
  const right = asList(answer), mine = asList(picked);
  q.options.forEach((o, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ans c" + i; b.innerHTML = SHAPES[i] + "<span>" + esc(o) + "</span>";
    b.setAttribute("aria-label", SHAPE_NAMES[i] + ": " + o);
    if (answer != null) { if (right.includes(i)) { b.classList.add("right"); b.insertAdjacentHTML("beforeend", '<span class="tick" aria-hidden="true">✓</span>'); } else b.classList.add("dim"); }
    else if (picked != null && !mine.includes(i)) b.classList.add("dim");
    if (mine.includes(i)) b.classList.add("picked");
    if (disabled || answer != null || picked != null) b.disabled = true;
    else if (onPick) b.addEventListener("click", () => onPick(i));
    wrap.appendChild(b);
  });
  return wrap;
}
// "Select two answers": tap to toggle up to 2 options, then Submit. sel = shared array (survives re-renders).
function multiPicker(q, { sel, onSubmit, submitLabel = "Submit" }) {
  const box = document.createElement("div");
  box.className = "multi-pick";
  box.innerHTML = `<p class="multi-hint" aria-live="polite"><span class="badge2">Select 2 answers</span> <span class="muted" data-n></span></p>`;
  const ans = answerButtons(q, { onPick: (i) => {
    const k = sel.indexOf(i);
    if (k >= 0) sel.splice(k, 1); else if (sel.length < 2) sel.push(i); else { toast("You can pick 2. Tap one to unselect it."); return; }
    paint();
  } });
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "btn primary big multi-submit"; btn.textContent = submitLabel;
  btn.addEventListener("click", () => { if (sel.length === 2) { btn.disabled = true; onSubmit([...sel]); } });
  function paint() {
    $$(".ans", ans).forEach((b, i) => { const on = sel.includes(i); b.classList.toggle("sel", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    btn.disabled = sel.length !== 2;
    $("[data-n]", box).textContent = sel.length === 2 ? "Ready, tap Submit" : `${sel.length} of 2 picked`;
  }
  box.appendChild(ans); box.appendChild(btn); paint();
  return box;
}
function typeLabel(q) { return q.type === "tf" ? "True or false" : q.type === "multi" ? "Select 2" : q.type === "text" ? "Type the answer" : "Quiz"; }
// "Type the answer": text box + Submit (Enter submits). draft = shared {v} so typing survives re-renders.
function textPicker({ draft, onSubmit, submitLabel = "Submit" }) {
  const f = document.createElement("form");
  f.className = "typein"; f.setAttribute("autocomplete", "off"); f.noValidate = true;
  f.innerHTML = `<p class="multi-hint"><span class="badge2">Type the answer</span> <span class="muted">Capitals and spaces don't matter</span></p>
    <label for="typein" class="hide">Your answer</label>
    <input id="typein" type="text" maxlength="60" placeholder="Type your answer" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send">
    <button class="btn primary big multi-submit" type="submit" disabled>Submit</button>`;
  const inp = $("input", f), btn = $("button", f);
  btn.textContent = submitLabel;
  inp.value = draft.v || "";
  const paint = () => { btn.disabled = !inp.value.trim(); };
  inp.addEventListener("input", () => { draft.v = inp.value; paint(); });
  f.addEventListener("submit", (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v || btn.disabled) return; btn.disabled = true; inp.disabled = true; onSubmit(v.slice(0, 60)); });
  paint();
  setTimeout(() => { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 30);
  return f;
}
// same matching as the server (used by solo only; live games are scored on the server)
function pqNormAns(s) {
  let t = String(s == null ? "" : s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  t = t.replace(/&/g, " and ").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^(the|a|an) (?=\S)/, "");
  return t.replace(/\s/g, "");
}
function pqLev1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
  return d + (la - i) + (lb - j) <= 1;
}
function pqTextCorrect(typed, accept) {
  const t = pqNormAns(typed); if (!t) return false;
  return (Array.isArray(accept) ? accept : []).some((a) => { const k = pqNormAns(a); return k && (t === k || (k.length >= 6 && !/^\d+$/.test(k) && pqLev1(t, k))); });
}
function makeQR(text, el) {
  const qr = qrcode(0, "M"); qr.addData(text); qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  const svg = el.querySelector("svg"); if (svg) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "QR code to join: " + text); }
}
function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// ---------- X identity (players join with their X handle) ----------
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
function normHandle(s) {
  s = String(s == null ? "" : s).replace(/[\u200B-\u200D\u2060\uFEFF\u00A0]/g, "").trim();
  s = s.replace(/^https?:\/\//i, "").replace(/^(www\.|mobile\.)?(x|twitter)\.com\//i, "").replace(/^@+/, "");
  return s.split(/[\/?#\s]/)[0];
}
function initialsOf(name) { const t = String(name || "").replace(/^@/, "").trim(); const a = Array.from(t); return (a[0] || "?").toUpperCase(); }
function pqIniSVG(ch) { return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#2F299E"/><text x="20" y="27" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="18" font-weight="900" fill="#fff">${esc(ch)}</text></svg>`); }
function avHTML(p, cls = "av") {
  const ini = `<span class="${cls} ini" aria-hidden="true">${esc(initialsOf(p.name || p.handle))}</span>`;
  if (!p.av) return ini;
  // the initial letter shows as a placeholder behind the photo until it loads (2026-11-02); a failed photo falls back to the letter
  return `<img class="${cls}" src="${esc(p.av)}" alt="" loading="lazy" decoding="async" style="background:#2F299E url(&quot;${pqIniSVG(initialsOf(p.name || p.handle))}&quot;) center/100% no-repeat" onerror="this.outerHTML=this.dataset.f" data-f="${esc(ini)}">`;
}
// display name, with @handle small under/after it (skipped when the name already is the handle)
function showsHandle(p) { return p.handle && String(p.name || "").replace(/^@/, "").toLowerCase() !== p.handle.toLowerCase(); }
function whoHTML(p, { av = true, cls = "" } = {}) {
  return `<span class="who ${cls}">${av ? avHTML(p) : ""}<span class="who-t"><span class="who-n">${esc(p.name)}</span>${showsHandle(p) ? `<span class="who-h">@${esc(p.handle)}</span>` : ""}</span></span>`;
}
// Live X handle lookup bound to an input; calls onState({state, profile}) — state: idle|invalid|loading|found|notfound|unavailable
// 2026-11-02 (speed + never block): 350 ms debounce; a stale request is cancelled (AbortController) so typing fast never shows an
// old result; found / not-found answers are remembered on the phone (found ones across visits); one quiet retry on a network error
// or an unreachable X; ensure(ms) waits at most ms for a pending lookup and then lets the player go ahead as @handle.
// opts.verb: "join" | "play" (the calm "couldn't reach X" line)
const PQ_XMEM = new Map(); // handle_lc -> {t, r}
function pqXRemembered(k) {
  const m = PQ_XMEM.get(k); if (m && Date.now() - m.t < (m.r.found ? 864e5 : 6e5)) return m.r;
  try { const s = JSON.parse(localStorage.getItem("pq_xprof") || "null"); if (s && s.k === k && Date.now() - s.t < 864e5) return s.r; } catch (e) {}
  return null;
}
function pqXRemember(k, r) {
  PQ_XMEM.set(k, { t: Date.now(), r });
  if (r.found) try { localStorage.setItem("pq_xprof", JSON.stringify({ k, t: Date.now(), r })); } catch (e) {}
}
function xPicker(input, box, onState, opts = {}) {
  const verb = opts.verb || "play";
  let timer = 0, slowT = 0, seq = 0, last = "", cur = { state: "idle" }, ctl = null, slow = false, waiters = [];
  const set = (s) => { cur = s; if (s.state !== "loading") { slow = false; clearTimeout(slowT); const w = waiters; waiters = []; w.forEach((f) => f()); } paint(); try { onState && onState(s); } catch (e) {} };
  function paint() {
    const s = cur, p = s.profile || {};
    box.dataset.state = s.state;
    box.onclick = (e) => { if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-xretry")) { e.preventDefault(); last = ""; const h = normHandle(input.value); if (HANDLE_RE.test(h)) { PQ_XMEM.delete(h.toLowerCase()); clearTimeout(timer); lookup(h, { fresh: true }); } } };
    if (s.state === "idle") box.innerHTML = `<span class="muted">We'll show your X name and photo here.</span>`;
    else if (s.state === "invalid") box.innerHTML = `<span class="xp-err">X handles are letters, numbers and _ only, up to 15.</span>`;
    else if (s.state === "loading") box.innerHTML = slow
      ? `<span class="xp-spin" aria-hidden="true"></span><span class="muted">Still looking up @${esc(s.handle)}… X is slow right now. You can ${verb} anyway, your photo fills in when X answers.</span>`
      : `<span class="xp-spin" aria-hidden="true"></span><span class="muted">Looking up @${esc(s.handle)} on X…</span>`;
    else if (s.state === "found") box.innerHTML = `${avHTML(p, "av xp-av")}<span class="who-t"><span class="who-n">${esc(p.name)}</span><span class="who-h">@${esc(p.handle)}</span></span><span class="xp-ok" aria-label="Found">✓</span>`;
    else if (s.state === "notfound") box.innerHTML = `<span class="xp-err">No X account with the handle @${esc(s.handle)}. Check the spelling, or <a href="#" data-xretry>try again</a>.</span>`;
    else if (s.state === "unavailable") box.innerHTML = `<span class="muted">Couldn't reach X right now. You can still ${verb} as <b>@${esc(s.handle)}</b>.</span>`;
  }
  async function lookup(h, o = {}) {
    const my = ++seq, k = h.toLowerCase(); last = k; slow = false;
    if (!(cur.state === "loading" && String(cur.handle || "").toLowerCase() === k)) set({ state: "loading", handle: h }); else paint();
    clearTimeout(slowT); slowT = setTimeout(() => { if (my === seq && cur.state === "loading") { slow = true; paint(); } }, 3500);
    let r = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (ctl) try { ctl.abort(); } catch (e) {}
      const a = (ctl = typeof AbortController === "function" ? new AbortController() : null);
      const to = a ? setTimeout(() => { try { a.abort(); } catch (e) {} }, 9000) : 0; // never wait on X longer than this
      r = await api("xuser?h=" + encodeURIComponent(h) + (o.fresh ? "&fresh=1" : ""), { signal: a ? a.signal : undefined });
      clearTimeout(to);
      if (my !== seq) return cur; // a newer handle was typed: drop this answer
      if ((r.ok && (r.found || r.found === false)) || r.invalid) break;
      if (attempt === 0) { // network error, timeout or X unreachable: retry once, quietly
        await new Promise((ok) => setTimeout(ok, 700));
        if (my !== seq) return cur;
        o = { ...o, fresh: true };
      }
    }
    if (r.ok && r.found) { const prof = { name: r.name, handle: r.handle, av: r.av }; pqXRemember(k, { found: true, profile: prof }); set({ state: "found", handle: r.handle, profile: prof }); }
    else if (r.ok && r.found === false) { pqXRemember(k, { found: false }); set({ state: "notfound", handle: h }); }
    else if (r.invalid) set({ state: "invalid", handle: h });
    else set({ state: "unavailable", handle: h, profile: { name: "@" + h, handle: h, av: "" } });
    return cur;
  }
  let seenVal = input.value;
  function onInput(now) {
    clearTimeout(timer); seenVal = input.value;
    const h = normHandle(input.value);
    if (!h) { seq++; last = ""; if (ctl) try { ctl.abort(); } catch (e) {} set({ state: "idle" }); return; }
    if (!HANDLE_RE.test(h)) { seq++; last = ""; if (ctl) try { ctl.abort(); } catch (e) {} set({ state: "invalid", handle: h }); return; }
    const k = h.toLowerCase();
    if (k === last && String(cur.handle || "").toLowerCase() === k && cur.state !== "idle" && cur.state !== "invalid") return; // same handle: lookup done or under way
    const known = pqXRemembered(k);
    if (known) { seq++; last = k; if (ctl) try { ctl.abort(); } catch (e) {} if (known.found) set({ state: "found", handle: known.profile.handle, profile: known.profile }); else set({ state: "notfound", handle: h }); return; }
    seq++; last = ""; slow = false; if (ctl) try { ctl.abort(); } catch (e) {} // typing on: cancel the old request right away
    set({ state: "loading", handle: h });
    timer = setTimeout(() => lookup(h), now ? 0 : 350);
  }
  input.addEventListener("input", () => onInput(false));
  input.addEventListener("change", () => onInput(true));
  input.addEventListener("paste", () => setTimeout(() => onInput(true), 0));
  // some phone keyboards (predictive text) don't fire input events reliably: also watch keyup/composition/blur and poll the value
  input.addEventListener("keyup", () => onInput(false));
  input.addEventListener("compositionend", () => onInput(false));
  input.addEventListener("blur", () => onInput(true));
  const poll = setInterval(() => { if (!input.isConnected) { clearInterval(poll); return; } if (input.value !== seenVal) { seenVal = input.value; onInput(false); } }, 600);
  paint();
  if (input.value) onInput(true);
  return {
    get: () => cur,
    // make sure a lookup for the current input has run, waiting at most maxMs for it; a lookup still pending after that answers
    // state "pending" (go ahead as @handle; the lookup keeps going and the screen fills in when it lands)
    async ensure(maxMs = 1500) {
      const h = normHandle(input.value);
      if (!h) { set({ state: "idle" }); return cur; }
      if (!HANDLE_RE.test(h)) { set({ state: "invalid", handle: h }); return cur; }
      const k = h.toLowerCase();
      if (!(cur.state === "loading" || k !== String(cur.handle || "").toLowerCase() || cur.state === "idle")) return cur;
      if (!(cur.state === "loading" && last === k)) { clearTimeout(timer); lookup(h); }
      await Promise.race([new Promise((ok) => waiters.push(ok)), new Promise((ok) => setTimeout(ok, maxMs))]);
      if (cur.state === "loading") return { state: "pending", handle: h, profile: { name: "@" + h, handle: h, av: "" } };
      return cur;
    },
    retry() { last = ""; const h = normHandle(input.value); if (h) PQ_XMEM.delete(h.toLowerCase()); onInput(true); },
  };
}

// ---------- metallic podium (2026-11-01): gold / silver / bronze, shared by host podium, player final screen, ended screen ----------
const PQ_CROWN = '<svg class="crown" viewBox="0 0 64 40" aria-hidden="true"><defs><linearGradient id="pqcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6C4"/><stop offset=".35" stop-color="#F9D45C"/><stop offset=".7" stop-color="#D99A12"/><stop offset="1" stop-color="#9A6400"/></linearGradient></defs><path d="M4 34 8 10l14 12L32 4l10 18 14-12 4 24z" fill="url(#pqcg)" stroke="#8A5A00" stroke-width="1.5" stroke-linejoin="round"/><circle cx="32" cy="5" r="3.5" fill="#FFF6C4"/><circle cx="8" cy="10" r="3" fill="#FFF6C4"/><circle cx="56" cy="10" r="3" fill="#FFF6C4"/><rect x="5" y="32" width="54" height="6" rx="2" fill="url(#pqcg)" stroke="#8A5A00" stroke-width="1.2"/></svg>';
function pqPodiumHTML(list, { mini = false, avCls = "av pod" } = {}) {
  const metal = ["gold", "silver", "bronze"], lbl = ["1st", "2nd", "3rd"];
  const slot = (i) => {
    const p = list[i], cls = ["p1", "p2", "p3"][i];
    if (!p) return `<div class="pl ${cls} empty"></div>`;
    return `<div class="pl ${cls} ${metal[i]}">
      <div class="float"><div class="avwrap">${i === 0 ? PQ_CROWN : ""}<span class="ring">${avHTML(p, avCls)}</span></div>
        <div class="name">${esc(p.name)}</div>${showsHandle(p) ? `<div class="hdl">@${esc(p.handle)}</div>` : ""}</div>
      <div class="ped"><div class="cap"></div><div class="body"><span class="num" aria-label="${lbl[i]} place">${i + 1}</span><span class="pts">${fmt(p.score)}<small> pts</small></span></div></div>
    </div>`;
  };
  // fixed confetti sprinkle (decor) — positions are stable so the stage looks the same every time
  const bits = [[6,14,"#F9D45C",20],[14,40,"#8077FF",-30],[22,8,"#AEF061",45],[31,28,"#DEDCFF",10],[40,4,"#F9D45C",-50],[58,10,"#8077FF",60],[66,30,"#E59A5B",-15],[74,6,"#BDB9FF",35],[83,22,"#F9D45C",-40],[92,12,"#AEF061",15],[48,20,"#FFF1A8",80],[88,44,"#8077FF",-70],[10,52,"#D8DCE3",25]]
    .map(([x, y, c, r], k) => `<i style="left:${x}%;top:${y}%;background:${c};--r:${r}deg;animation-delay:-${(k * 0.37).toFixed(2)}s"></i>`).join("");
  return `<div class="podium vD${mini ? " mini" : ""}"><div class="lights" aria-hidden="true"><b class="l2"></b><b class="l1"></b><b class="l3"></b></div><div class="bits" aria-hidden="true">${bits}</div><div class="stage" aria-hidden="true"></div>${slot(1)}${slot(0)}${slot(2)}</div>`;
}

function pqConfetti(host, n = 26) {
  try {
    if (!host || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const box = document.createElement("div"); box.className = "confetti"; box.setAttribute("aria-hidden", "true");
    const cols = ["#F9D45C", "#FFF1A8", "#D8DCE3", "#E59A5B", "#AEF061", "#8077FF"];
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.style.left = (Math.random() * 100).toFixed(1) + "%"; s.style.background = cols[i % cols.length];
      s.style.animationDelay = (Math.random() * 1.2).toFixed(2) + "s"; s.style.animationDuration = (2.6 + Math.random() * 1.6).toFixed(2) + "s";
      s.style.setProperty("--r", Math.round(Math.random() * 720 - 360) + "deg"); s.style.setProperty("--x", Math.round(Math.random() * 80 - 40) + "px");
      box.appendChild(s);
    }
    host.appendChild(box); setTimeout(() => box.remove(), 5200);
  } catch (e) {}
}
