
const view = $("#view");
let set = null, picker = null, ident = null, i = 0, score = 0, correct = 0, streak = 0, best = 0, t0 = 0, raf = null, done = false;
const logo = new Image(); logo.src = "logo.png";
// game sounds (sound.js); safe no-ops if audio is unavailable
function sfx(n, o) { try { return window.PQSound ? PQSound.play(n, o) : false; } catch (e) { return false; } }
function sfx1(k, n, o) { try { return window.PQSound ? PQSound.once(k, n, o) : false; } catch (e) { return false; } }
function shuffle(a) { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
async function boot() {
  const sid = new URLSearchParams(location.search).get("set");
  const r = await api("solo" + (sid ? "?set=" + encodeURIComponent(sid) : ""));
  if (!r.ok) { view.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
  set = r; intro();
}
function intro() {
  view.innerHTML = `<div class="card center"><span class="pill">Solo practice</span><h1 style="margin-top:14px">${esc(set.title)}</h1><p class="muted">${set.questions.length} questions · timed · faster right answers score more (up to 1,000), streaks add bonus points.</p><div class="solo-id"><label for="xh" style="font-weight:700">Your X handle <span class="muted" style="font-weight:500">(optional, shows your name and photo on your result)</span></label><div class="xin"><span class="at" aria-hidden="true">@</span><input id="xh" maxlength="40" placeholder="handle" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go"></div><div class="xprev" id="xprev" aria-live="polite"></div></div><button class="btn primary big" id="go" type="button">Start</button><p class="err" id="soloErr" role="alert"></p></div>`;
  try { const lh = localStorage.getItem("pq_xhandle"); if (lh) $("#xh").value = lh; } catch (e) {}
  picker = xPicker($("#xh"), $("#xprev"), (s) => {
    // started before the lookup finished (X slow): fill in the real name/photo when it lands
    if (ident && ident.pending && s.state !== "loading" && String(s.handle || "").toLowerCase() === ident.handle.toLowerCase()) {
      ident.pending = false;
      if (s.state === "found") { Object.assign(ident, { name: s.profile.name, handle: s.profile.handle, av: s.profile.av || "" }); try { localStorage.setItem("pq_xhandle", s.profile.handle); } catch (e) {} pqLoadImg(ident.av).then((im) => { if (ident) ident.avatar = im; }); }
    }
    const go = $("#go"); if (!go) return;
    $("#soloErr").textContent = ""; go.textContent = s.state === "found" ? `Start as ${s.profile.name}` : "Start"; go.disabled = s.state === "invalid" || s.state === "notfound";
  }, { verb: "play" });
  $("#xh").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#go").click(); } });
  $("#go").onclick = async () => {
    $("#go").disabled = true;
    const s = await picker.ensure(1500); // never hold Start for a slow X: after 1.5 s play as @handle, the name/photo fill in later
    $("#go").disabled = false;
    if (s.state === "invalid" || s.state === "notfound") { $("#xh").focus(); return; }
    ident = null;
    if (s.state === "found" || s.state === "unavailable" || s.state === "pending") {
      ident = { name: s.profile.name, handle: s.profile.handle, av: s.profile.av || "", avatar: null, pending: s.state === "pending" };
      try { localStorage.setItem("pq_xhandle", s.profile.handle); } catch (e) {}
      pqLoadImg(ident.av).then((im) => { if (ident) ident.avatar = im; });
    }
    i = score = correct = streak = best = 0; set.order = shuffle(set.questions.map((_, k) => k)); sfx("go"); ask();
  };
}
function ask() {
  cancelAnimationFrame(raf); done = false;
  const q = set.questions[set.order[i]];
  view.innerHTML = `<div class="card"><div class="qmeta"><span>Question ${i + 1} of ${set.questions.length}${q.type === "multi" ? ' · <span class="badge2">Select 2</span>' : q.type === "text" ? ' · <span class="badge2">Type it</span>' : ""}</span><span>${fmt(score)} pts${streak > 1 ? ` · streak ${streak}` : ""}</span></div><p class="qtext">${esc(q.q)}</p><div class="timerbar"><i id="tb"></i></div><div class="row" style="justify-content:space-between;margin-bottom:12px"><b id="secs"></b></div><div id="ans"></div><div id="fb"></div></div>`;
  if (q.type === "text") $("#ans").appendChild(textPicker({ draft: { v: "" }, onSubmit: (v) => finish({ typed: v }) }));
  else if (q.type === "multi") $("#ans").appendChild(multiPicker(q, { sel: [], onSubmit: (picks) => finish(picks) }));
  else $("#ans").appendChild(answerButtons(q, { onPick: (k) => finish(k) }));
  t0 = performance.now(); const total = q.time * 1000; let lastTick = 0;
  const tick = () => { const left = Math.max(0, total - (performance.now() - t0)); const el = $("#tb"); if (!el) return; el.style.transform = `scaleX(${left / total})`; const n = Math.ceil(left / 1000); $("#secs").textContent = n + "s"; if (n >= 1 && n <= 5 && n !== lastTick) { lastTick = n; sfx("tick", n); } if (left <= 0) return finish(null); raf = requestAnimationFrame(tick); };
  tick();
}
function finish(k) {
  if (done) return; done = true; cancelAnimationFrame(raf);
  const q = set.questions[set.order[i]], ms = Math.min(performance.now() - t0, q.time * 1000);
  let ok;
  if (q.type === "text") ok = !!(k && pqTextCorrect(k.typed, q.accept));
  else if (Array.isArray(k)) { const a = k.map(Number).sort((x, y) => x - y), b = asList(q.answer).sort((x, y) => x - y); ok = a.length === 2 && b.length === 2 && a[0] === b[0] && a[1] === b[1]; }
  else ok = k != null && k === q.answer;
  let pts = 0;
  if (ok) { streak++; best = Math.max(best, streak); correct++; pts = Math.round(1000 * (1 - ms / (q.time * 1000) / 2)) + Math.min(500, Math.max(0, streak - 1) * 100); score += pts; } else streak = 0;
  sfx(k == null ? "timeup" : ok ? "correct" : "wrong");
  $("#ans").innerHTML = "";
  if (q.type === "text") $("#ans").innerHTML = `<div class="text-answer"><span class="muted">The answer</span><b>${esc(q.answer)}</b></div>${k ? `<p class="muted" style="margin:10px 0 0">You typed: <b class="${ok ? "ok-t" : "bad-t"}">${esc(k.typed)}</b></p>` : ""}`;
  else $("#ans").appendChild(answerButtons(q, { answer: q.answer, picked: k }));
  const last = i + 1 >= set.questions.length;
  $("#fb").innerHTML = `<div class="feedback ${k == null ? "none" : ok ? "good" : "bad"}" style="margin-top:14px;padding:18px"><div class="big" style="font-size:28px">${k == null ? "Time's up" : ok ? "Correct!" : "Wrong"}</div>${!ok && q.type === "multi" ? `<p style="margin:6px 0 0">Both picks had to be right.</p>` : ""}${!ok && q.type === "text" ? `<p style="margin:6px 0 0">The answer was ${esc(q.answer)}</p>` : ""}${ok ? `<div class="plus">+${fmt(pts)}</div>` : ""}${streak > 1 ? `<p style="margin:8px 0 0">Streak: ${streak}</p>` : ""}</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary big" id="nx" type="button">${last ? "See my score" : "Next question"}</button></div>`;
  const nx = $("#nx"), lbl = last ? "See my score" : "Next question";
  let left = 4, moved = false;
  const go = () => { if (moved) return; moved = true; clearInterval(tick); i++; last ? result() : ask(); };
  nx.textContent = `${lbl} (${left})`;
  const tick = setInterval(() => { left--; if (left <= 0) go(); else if (document.body.contains(nx)) nx.textContent = `${lbl} (${left})`; }, 1000);
  nx.onclick = go; nx.focus();
}
function shareText() { return `I scored ${correct}/${set.questions.length} on the PopDEX Quiz Night — by @iamlogtun`; }
function drawCard() {
  const c = document.createElement("canvas"); c.width = 1200; c.height = 675; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 1200, 675); g.addColorStop(0, "#201C5C"); g.addColorStop(.55, "#0E0E0E"); g.addColorStop(1, "#171819");
  x.fillStyle = g; x.fillRect(0, 0, 1200, 675);
  x.globalAlpha = .5; const rg = x.createRadialGradient(980, 120, 10, 980, 120, 520); rg.addColorStop(0, "#4D42FC"); rg.addColorStop(1, "rgba(77,66,252,0)"); x.fillStyle = rg; x.fillRect(0, 0, 1200, 675); x.globalAlpha = 1;
  // dots
  x.fillStyle = "rgba(189,185,255,.14)"; for (let a = 0; a < 14; a++) for (let b = 0; b < 8; b++) { x.beginPath(); x.arc(820 + a * 26, 330 + b * 26, 3, 0, 7); x.fill(); }
  if (logo.complete && logo.naturalWidth) { const h = 56, w = logo.naturalWidth * h / logo.naturalHeight; x.drawImage(logo, 70, 64, w, h); }
  else { x.fillStyle = "#fff"; x.font = "800 44px system-ui, sans-serif"; x.fillText("PopDEX", 70, 108); }
  if (ident) {
    x.fillStyle = "#BDB9FF"; x.font = "700 24px system-ui, sans-serif"; x.textAlign = "right"; x.fillText("COMMUNITY QUIZ", 1130, 100); x.textAlign = "left";
    pqDrawIdentity(x, ident, 70, 150, 1060, "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif");
    x.fillStyle = "#fff"; x.font = "900 160px system-ui, sans-serif"; x.fillText(`${correct}/${set.questions.length}`, 62, 410);
    x.font = "800 38px system-ui, sans-serif"; x.fillText("on the PopDEX Quiz Night", 70, 468);
    x.fillStyle = "#DEDCFF"; x.font = "600 30px system-ui, sans-serif"; x.fillText(`${fmt(score)} points  ·  best streak ${best}`, 70, 518);
  } else {
  x.fillStyle = "#BDB9FF"; x.font = "700 26px system-ui, sans-serif"; x.fillText("COMMUNITY QUIZ", 70, 175);
  x.fillStyle = "#fff"; x.font = "900 190px system-ui, sans-serif"; x.fillText(`${correct}/${set.questions.length}`, 62, 380);
  x.font = "800 40px system-ui, sans-serif"; x.fillText("on the PopDEX Quiz Night", 70, 445);
  x.fillStyle = "#DEDCFF"; x.font = "600 30px system-ui, sans-serif"; x.fillText(`${fmt(score)} points  ·  best streak ${best}`, 70, 500);
  }
  // (site-link pill removed 2026-10-31: X lays its link title over the bottom-left of the preview)
  x.fillStyle = "#a7a9b4"; x.font = "600 24px system-ui, sans-serif"; x.textAlign = "right"; x.fillText("by @iamlogtun", 1130, 600); x.textAlign = "left";
  return c;
}
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function result() {
  const n = set.questions.length, pct = correct / n;
  const verdict = pct === 1 ? "Perfect score. PopDEX expert!" : pct >= .75 ? "Strong. You know your PopDEX." : pct >= .5 ? "Not bad. A few more rounds and you're there." : "Time to read the PopDEX docs and try again.";
  view.innerHTML = `<div class="card center"><span class="pill">Your result</span>${ident ? `<div class="me-big" style="margin-top:12px">${avHTML(ident, "av lg")}<div class="who-n">${esc(ident.name)}</div>${showsHandle(ident) ? `<div class="who-h">@${esc(ident.handle)}</div>` : ""}</div>` : ""}<p class="status-big" style="font-size:56px;margin:12px 0 0">${correct}/${n}</p><p style="font-size:20px;font-weight:800;margin:4px 0">${fmt(score)} points · best streak ${best}</p><p class="muted">${verdict}</p></div>
    <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary" id="again" type="button">Play again</button></div>`;
  sfx("fanfare");
  $("#again").onclick = intro;
}
boot();
