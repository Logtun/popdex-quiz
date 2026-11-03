// Multiplayer result card (same style as the solo card)
const pqCardLogo = new Image(); pqCardLogo.src = "logo.png";
function pqRoundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function pqFit(x, text, maxW) { if (x.measureText(text).width <= maxW) return text; let t = text; while (t.length > 1 && x.measureText(t + "…").width > maxW) t = t.slice(0, -1); return t + "…"; }
// a slow or missing photo never holds a card up: after 6 s the card is drawn without it (2026-11-02)
function pqLoadImg(src, ms = 6000) { return new Promise((res) => { if (!src) return res(null); const im = new Image(); im.decoding = "async"; const t = setTimeout(() => res(null), ms); im.onload = () => { clearTimeout(t); res(im.naturalWidth ? im : null); }; im.onerror = () => { clearTimeout(t); res(null); }; im.src = src; }); }
function pqReady(im) { return im.complete ? Promise.resolve() : new Promise((r) => { im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true }); }); }
// X identity row on a card: round avatar (if any), display name big, @handle under it. Returns nothing.
// id = { name, handle, avatar (loaded same-origin Image or null) }; (x0, top) = top-left; maxW = available width
// col (optional, 2026-11-01) = { name, handle, ring } colours for the light/lime card designs
function pqDrawIdentity(x, id, x0, top, maxW, F, col) {
  col = col || {};
  const S = 92; let tx = x0;
  if (id.avatar) {
    const im = id.avatar, s = Math.min(im.naturalWidth, im.naturalHeight);
    x.save(); x.beginPath(); x.arc(x0 + S / 2, top + S / 2, S / 2, 0, Math.PI * 2); x.closePath(); x.clip();
    x.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, x0, top, S, S); x.restore();
    x.strokeStyle = col.ring || "#8077FF"; x.lineWidth = 4; x.beginPath(); x.arc(x0 + S / 2, top + S / 2, S / 2 + 2, 0, Math.PI * 2); x.stroke();
    tx = x0 + S + 22;
  }
  const hasH = id.handle && String(id.name || "").replace(/^@/, "").toLowerCase() !== id.handle.toLowerCase();
  x.fillStyle = col.name || "#fff"; x.font = `800 46px ${F}`; x.fillText(pqFit(x, id.name || "", maxW - (tx - x0)), tx, hasH ? top + 46 : top + 62);
  if (hasH) { x.fillStyle = col.handle || "#BDB9FF"; x.font = `600 28px ${F}`; x.fillText(pqFit(x, "@" + id.handle, maxW - (tx - x0)), tx, top + 86); }
}

// ---------- live-game card: four designs (2026-11-01) ----------
// Each live game has one design fixed on the server (EP1->A, EP2->B, EP3->C, EP4->D, EP5->A ...), so every player
// in a game gets the same card and games running side by side never share one. Bottom-left stays empty on every
// design: X overlays the link title there on phones.
const pqTintCache = {};
function pqLogoIn(color) { // the white PopDEX wordmark recoloured (for light backgrounds)
  if (!(pqCardLogo.complete && pqCardLogo.naturalWidth)) return null;
  if (!color) return pqCardLogo;
  if (pqTintCache[color]) return pqTintCache[color];
  const c = document.createElement("canvas"); c.width = pqCardLogo.naturalWidth; c.height = pqCardLogo.naturalHeight;
  const x = c.getContext("2d"); x.drawImage(pqCardLogo, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return (pqTintCache[color] = c);
}
// pill with centred text; (a, mid) = left edge and vertical centre. Returns its width.
function pqPill(x, text, a, mid, bg, fg, F, size, stroke) {
  x.font = `900 ${size}px ${F}`; const w = x.measureText(text).width + size * 1.3, h = size * 1.55;
  x.fillStyle = bg; pqRoundRect(x, a, mid - h / 2, w, h, h / 2); x.fill();
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = 2; pqRoundRect(x, a, mid - h / 2, w, h, h / 2); x.stroke(); }
  x.fillStyle = fg; x.textBaseline = "middle"; x.fillText(text, a + size * .65, mid + 1); x.textBaseline = "alphabetic";
  return w;
}
// shared left column: logo + "Quiz Night", LIVE GAME · FINAL RESULT (+ EP pill), identity, X/Y correct, points/streak
function pqCardLeft(x, r, F, T) {
  const lg = pqLogoIn(T.logo); let lx = 70;
  if (lg) { const h = 56, w = (lg.naturalWidth || lg.width) * h / (lg.naturalHeight || lg.height); x.drawImage(lg, 70, 70, w, h); lx = 70 + w + 16; }
  else { x.fillStyle = T.logo || "#fff"; x.font = `800 44px ${F}`; x.fillText("PopDEX", 70, 114); lx = 70 + x.measureText("PopDEX").width + 14; }
  x.fillStyle = T.quiz; x.font = `800 44px ${F}`; x.fillText("Quiz Night", lx, 114);
  x.fillStyle = T.label; x.font = `700 24px ${F}`; const lab = "LIVE GAME · FINAL RESULT"; x.fillText(lab, 70, 178);
  if (r.ep > 0 && T.epInline !== false) pqPill(x, "EP " + r.ep, 70 + x.measureText(lab).width + 16, 169, T.epBg, T.epFg, F, 22, T.epStroke);
  pqDrawIdentity(x, r, 70, 208, T.idW || 690, F, { name: T.name, handle: T.handle, ring: T.ring });
  x.fillStyle = T.big; x.font = `900 140px ${F}`; const big = `${r.correct}/${r.total}`; x.fillText(big, 64, 450);
  const bw = x.measureText(big).width;
  x.fillStyle = T.correct; x.font = `700 32px ${F}`; x.fillText("correct", 64 + bw + 18, 450);
  x.fillStyle = T.pts; x.font = `800 40px ${F}`; x.fillText(`${fmt(r.score)} points`, 70, 528);
  if (r.best_streak > 1) { const pw = x.measureText(`${fmt(r.score)} points`).width; x.fillStyle = T.streak; x.font = `600 30px ${F}`; x.fillText(`·  best streak ${r.best_streak}`, 70 + pw + 18, 528); }
}
// FINAL RANK panel on the right (x 800..1130)
function pqRankPanel(x, r, F, P) {
  const a = P.a || 800, b = P.b || 186, w = P.w || 330, h = P.h || 300, cx = a + w / 2;
  if (P.fill) { x.fillStyle = P.fill; pqRoundRect(x, a, b, w, h, P.rad || 28); x.fill(); }
  if (P.stroke) { x.strokeStyle = P.stroke; x.lineWidth = P.lw || 2; pqRoundRect(x, a, b, w, h, P.rad || 28); x.stroke(); }
  x.textAlign = "center";
  x.fillStyle = P.label; x.font = `700 24px ${F}`; x.fillText("FINAL RANK", cx, b + 54);
  x.fillStyle = P.num; x.font = `900 ${String(r.rank).length > 2 ? 110 : 140}px ${F}`; x.fillText(`#${r.rank}`, cx, b + 204);
  x.fillStyle = P.sub; x.font = `700 30px ${F}`; x.fillText(`of ${r.players} player${r.players === 1 ? "" : "s"}`, cx, b + 260);
  x.textAlign = "left";
}
function pqFooter(x, F, color) { x.fillStyle = color; x.font = `600 24px ${F}`; x.textAlign = "right"; x.fillText("The trader-first perp DEX", 1130, 600); x.textAlign = "left"; x.font = `700 24px ${F}`; x.fillText("popdex-quiz.site", 70, 600); }

// A · Midnight: the original dark card with the purple glow
function pqDesignA(x, r, F) {
  const g = x.createLinearGradient(0, 0, 1200, 675); g.addColorStop(0, "#201C5C"); g.addColorStop(.55, "#0E0E0E"); g.addColorStop(1, "#171819");
  x.fillStyle = g; x.fillRect(0, 0, 1200, 675);
  x.globalAlpha = .5; const rg = x.createRadialGradient(980, 120, 10, 980, 120, 520); rg.addColorStop(0, "#4D42FC"); rg.addColorStop(1, "rgba(77,66,252,0)"); x.fillStyle = rg; x.fillRect(0, 0, 1200, 675); x.globalAlpha = 1;
  x.fillStyle = "rgba(189,185,255,.14)"; for (let a = 0; a < 14; a++) for (let b = 0; b < 8; b++) { x.beginPath(); x.arc(820 + a * 26, 330 + b * 26, 3, 0, 7); x.fill(); }
  pqCardLeft(x, r, F, { quiz: "#BDB9FF", label: "#BDB9FF", name: "#fff", handle: "#BDB9FF", ring: "#8077FF", big: "#fff", correct: "#DEDCFF", pts: "#fff", streak: "#DEDCFF", epBg: "#4D42FC", epFg: "#fff" });
  pqRankPanel(x, r, F, { fill: "rgba(14,14,14,.55)", stroke: "rgba(189,185,255,.35)", label: "#BDB9FF", num: "#fff", sub: "#DEDCFF" });
  pqFooter(x, F, "#a7a9b4");
}
// B · Lavender: light card, deep-purple type, solid purple rank tile
function pqDesignB(x, r, F) {
  const g = x.createLinearGradient(0, 0, 1200, 675); g.addColorStop(0, "#F4F3FF"); g.addColorStop(1, "#DEDCFF");
  x.fillStyle = g; x.fillRect(0, 0, 1200, 675);
  x.fillStyle = "rgba(128,119,255,.16)"; x.beginPath(); x.arc(1120, 40, 300, 0, 7); x.fill();
  x.fillStyle = "rgba(77,66,252,.10)"; x.beginPath(); x.arc(1210, 640, 230, 0, 7); x.fill();
  x.strokeStyle = "rgba(77,66,252,.18)"; x.lineWidth = 3; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(1120, 40, 340 + i * 34, 0, 7); x.stroke(); }
  x.fillStyle = "#4D42FC"; x.fillRect(0, 0, 1200, 12);
  pqCardLeft(x, r, F, { logo: "#201C5C", quiz: "#4D42FC", label: "#645AFF", name: "#201C5C", handle: "#645AFF", ring: "#4D42FC", big: "#201C5C", correct: "#2F299E", pts: "#201C5C", streak: "#2F299E", epBg: "#201C5C", epFg: "#fff" });
  x.save(); x.shadowColor = "rgba(47,41,158,.35)"; x.shadowBlur = 40; x.shadowOffsetY = 14;
  const pg = x.createLinearGradient(800, 186, 1130, 486); pg.addColorStop(0, "#645AFF"); pg.addColorStop(1, "#2F299E");
  x.fillStyle = pg; pqRoundRect(x, 800, 186, 330, 300, 28); x.fill(); x.restore();
  pqRankPanel(x, r, F, { label: "#DEDCFF", num: "#fff", sub: "#DEDCFF" });
  pqFooter(x, F, "#2F299E");
}
// C · Lime: near-black card with PopDEX lime accents
function pqDesignC(x, r, F) {
  x.fillStyle = "#0E0E0E"; x.fillRect(0, 0, 1200, 675);
  const rg = x.createRadialGradient(1000, 600, 10, 1000, 600, 560); rg.addColorStop(0, "rgba(174,240,97,.16)"); rg.addColorStop(1, "rgba(174,240,97,0)"); x.fillStyle = rg; x.fillRect(0, 0, 1200, 675);
  x.save(); x.beginPath(); x.rect(760, 0, 440, 140); x.clip(); x.strokeStyle = "rgba(174,240,97,.22)"; x.lineWidth = 10;
  for (let i = -6; i < 16; i++) { x.beginPath(); x.moveTo(760 + i * 40, 140); x.lineTo(760 + i * 40 + 140, 0); x.stroke(); } x.restore();
  pqCardLeft(x, r, F, { quiz: "#AEF061", label: "#d6d7dd", name: "#fff", handle: "#AEF061", ring: "#AEF061", big: "#AEF061", correct: "#fff", pts: "#fff", streak: "#c9cbd2", epBg: "#AEF061", epFg: "#0E0E0E" });
  pqRankPanel(x, r, F, { fill: "#171819", stroke: "#AEF061", lw: 4, label: "#AEF061", num: "#fff", sub: "#d6d7dd" });
  x.fillStyle = "#AEF061"; pqRoundRect(x, 800 + 115, 186 - 6, 100, 12, 6); x.fill();
  pqFooter(x, F, "#AEF061");
}
// D · Split: bold purple block cut on a diagonal against black, lime edge
function pqDesignD(x, r, F) {
  x.fillStyle = "#0E0E0E"; x.fillRect(0, 0, 1200, 675);
  const g = x.createLinearGradient(0, 0, 760, 675); g.addColorStop(0, "#645AFF"); g.addColorStop(.6, "#4D42FC"); g.addColorStop(1, "#2F299E");
  x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(790, 0); x.lineTo(700, 675); x.lineTo(0, 675); x.closePath(); x.fill();
  x.fillStyle = "#AEF061"; x.beginPath(); x.moveTo(790, 0); x.lineTo(806, 0); x.lineTo(716, 675); x.lineTo(700, 675); x.closePath(); x.fill();
  x.fillStyle = "rgba(255,255,255,.07)"; x.beginPath(); x.arc(560, 120, 260, 0, 7); x.fill();
  x.fillStyle = "rgba(189,185,255,.16)"; for (let a = 0; a < 9; a++) for (let b = 0; b < 4; b++) { x.beginPath(); x.arc(900 + a * 26, 540 + b * 26, 3, 0, 7); x.fill(); }
  pqCardLeft(x, r, F, { quiz: "#DEDCFF", label: "#DEDCFF", name: "#fff", handle: "#DEDCFF", ring: "#fff", big: "#fff", correct: "#DEDCFF", pts: "#fff", streak: "#DEDCFF", epBg: "#0E0E0E", epFg: "#AEF061", idW: 620 });
  pqRankPanel(x, r, F, { a: 830, w: 300, label: "#AEF061", num: "#fff", sub: "#BDB9FF", stroke: "rgba(189,185,255,.28)" });
  pqFooter(x, F, "#a7a9b4");
}
// r = { name, handle, avatar, correct, total, score, rank, players, best_streak, ep, design }
function drawMultiCard(r) {
  const c = document.createElement("canvas"); c.width = 1200; c.height = 675; const x = c.getContext("2d");
  const F = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const d = String(r.design || "A").toUpperCase();
  (d === "B" ? pqDesignB : d === "C" ? pqDesignC : d === "D" ? pqDesignD : pqDesignA)(x, r, F);
  return c;
}

// ---------- share link with the card as its X preview (2026-10-31) ----------
// Canvas -> compact JPEG -> POST /api/card?<query> -> {id,url}. Resolves with the /r/<id> URL or null.
function pqJpeg(canvas) {
  return new Promise((res) => {
    const tryQ = (q) => canvas.toBlob((b) => { if (b && b.size > 300 * 1024 && q > 0.6) tryQ(Math.round((q - 0.1) * 100) / 100); else res(b); }, "image/jpeg", q);
    tryQ(0.85);
  });
}
async function pqUploadCard(canvas, query) {
  try {
    const blob = await pqJpeg(canvas);
    if (!blob || blob.size > 500 * 1024) return null;
    const ac = typeof AbortController === "function" ? new AbortController() : null; const to = ac ? setTimeout(() => ac.abort(), 25000) : 0;
    const r = await fetch("/api/card?" + new URLSearchParams(query).toString(), { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob, cache: "no-store", signal: ac ? ac.signal : undefined });
    clearTimeout(to);
    const j = await r.json().catch(() => null);
    return j && j.ok && j.url ? j.url : null;
  } catch (e) { return null; }
}
// Wire the "Share on X" link: disabled "Preparing card…" until the upload lands; falls back to the plain site link.
function pqWireShare(tw, note, text, fallbackUrl, uploadPromise) {
  const label = tw.textContent;
  tw.removeAttribute("href"); tw.setAttribute("aria-disabled", "true"); tw.classList.add("is-busy"); tw.textContent = "Preparing card…";
  tw.onclick = (e) => { if (tw.getAttribute("aria-disabled") === "true") e.preventDefault(); };
  return uploadPromise.then((u) => {
    tw.href = "https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(u || fallbackUrl);
    pqAppShare(tw, text + " " + (u || fallbackUrl), tw.href);
    tw.removeAttribute("aria-disabled"); tw.classList.remove("is-busy"); tw.textContent = label;
    if (tw.dataset) tw.dataset.share = u || "";
    if (note) note.textContent = u ? "Your card shows as the link preview on X. Want it as a full image? Download it and attach it." : "Download the card, then attach it to your post on X.";
    return u;
  });
}

// On phones, open the X app's own post composer directly (not a browser tab); desktop keeps the web composer.
function pqAppShare(tw, msg, webUrl) {
  const ua = navigator.userAgent || "";
  const android = /Android/i.test(ua), ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!android && !ios) return;
  tw.removeAttribute("target");
  tw.onclick = (e) => {
    if (tw.getAttribute("aria-disabled") === "true") { e.preventDefault(); return; }
    e.preventDefault();
    if (android) {
      // Android intent: opens the X app composer; if X isn't installed, Chrome falls back to the web composer
      location.href = "intent://post?message=" + encodeURIComponent(msg) + "#Intent;scheme=twitter;package=com.twitter.android;S.browser_fallback_url=" + encodeURIComponent(webUrl) + ";end";
      return;
    }
    let left = false;
    const onHide = () => { left = true; };
    document.addEventListener("visibilitychange", onHide, { once: true });
    window.addEventListener("pagehide", onHide, { once: true });
    location.href = "twitter://post?message=" + encodeURIComponent(msg);
    setTimeout(() => { if (!left && document.visibilityState === "visible") location.href = webUrl; }, 1500);
  };
}
