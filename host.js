
const view = $("#view"), login = $("#login");
let game = null, st = null, lastKey = "", raf = null, polling = false, busy = false;
const COLORS = ["var(--a0)", "var(--a1)", "var(--a2)", "var(--a3)"];
// game sounds (sound.js); safe no-ops if audio is unavailable
function sfx(n, o) { try { return window.PQSound ? PQSound.play(n, o) : false; } catch (e) { return false; } }
function sfx1(k, n, o) { try { return window.PQSound ? PQSound.once(k, n, o) : false; } catch (e) { return false; } }
let heardPin = "", heard = new Set(); // players already announced with a pop (first fill after a reload is silent)

async function boot() {
  const me = await api("me");
  if (!me.host) { login.classList.remove("hide"); view.innerHTML = ""; $("#pw").focus(); return; }
  login.classList.add("hide");
  try { game = JSON.parse(localStorage.getItem("pq_host_game") || "null"); } catch { game = null; }
  if (game) { const r = await api(`state?pin=${game.pin}&hk=${encodeURIComponent(game.hk)}`); if (r.ok && r.phase !== "podium") { startPolling(); return; } localStorage.removeItem("pq_host_game"); game = null; }
  setup();
}
login.addEventListener("submit", async (e) => {
  e.preventDefault(); $("#loginErr").textContent = "";
  const r = await api("login", { method: "POST", body: { password: $("#pw").value } });
  if (!r.ok) { $("#loginErr").textContent = r.error; return; }
  localStorage.setItem("pq_host_token", r.token); localStorage.setItem("pq_host_seen", String(Date.now())); $("#pw").value = ""; boot();
});

async function setup() {
  view.innerHTML = '<div class="spinner"></div>';
  const r = await api("sets");
  if (!r.ok) { if (r.status === 401) { localStorage.removeItem("pq_host_token"); return boot(); } view.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
  view.innerHTML = `<div class="card wrap-narrow"><span class="pill">New game</span><h2 style="margin-top:10px">Pick a question set</h2>
    <div class="field"><label for="set">Question set</label><select id="set">${r.sets.map((s) => `<option value="${esc(s.id)}">${esc(s.title)} (${s.questions.length} questions)</option>`).join("")}</select></div>
    <p class="muted" id="nextEp" style="margin:0 0 10px;font-size:14px"></p>
    <button class="btn primary big" id="create" type="button" style="width:100%">Create game</button>
    <p class="muted" style="font-size:14px">Players join on their phones with the PIN. Tip: share your screen in Discord, or read the questions out in your X Space (players see each question on their phone too).</p>
    <div class="row"><a class="btn ghost" href="/editor.html">Edit questions</a><button class="btn ghost" id="logout" type="button">Log out</button></div></div>`;
  api("episode").then((e) => { const el = $("#nextEp"); if (el && e && e.ok) el.innerHTML = `This game will be <span class="ep-badge">EP ${Number(e.next) || 1}</span> (you can change it in the lobby).`; });
  $("#create").onclick = async () => {
    $("#create").disabled = true;
    const c = await api("game", { method: "POST", body: { set: $("#set").value } });
    if (!c.ok) { toast(c.error); $("#create").disabled = false; return; }
    game = { pin: c.pin, hk: c.host_key }; localStorage.setItem("pq_host_game", JSON.stringify(game)); lastKey = ""; startPolling();
  };
  $("#logout").onclick = () => { localStorage.removeItem("pq_host_token"); boot(); };
}

// rank movement since the previous question (▲ up / ▼ down)
function moveHTML(m) { m = Number(m) || 0; return m > 0 ? ` <span class="mv up" aria-label="up ${m}">▲${m}</span>` : m < 0 ? ` <span class="mv down" aria-label="down ${-m}">▼${-m}</span>` : ""; }
// auto-advance countdown + Pause/Resume label; all timing comes from the server (auto_at / paused / pause_left)
function updateAuto() {
  if (!st) return;
  const pb = $("#pauseBtn");
  if (pb) { const want = st.paused ? "▶ Resume" : "❚❚ Pause"; if (pb.textContent !== want) { pb.textContent = want; pb.setAttribute("aria-pressed", st.paused ? "true" : "false"); } pb.classList.toggle("on", !!st.paused); }
  const bar = $("#autoBar"); if (!bar) return;
  const ph = st.phase, total = (st.auto_ms && st.auto_ms[ph]) || 6000;
  if (!st.paused && !(st.auto_at > 0)) { bar.classList.add("hide"); return; }
  bar.classList.remove("hide");
  const last = st.qi + 1 >= st.total;
  const what = ph === "reveal" ? "Leaderboard" : last ? "Final results" : "Next question";
  const left = st.paused ? (st.pause_left || 0) : Math.max(0, st.auto_at - serverNow());
  const n = Math.ceil(left / 1000);
  $("#autoTxt").textContent = st.paused ? "Paused · tap Resume to continue" : n > 0 ? `${what} in ${n}…` : `${what}…`;
  bar.classList.toggle("paused", !!st.paused);
  $("#autoFill").style.transform = `scaleX(${Math.max(0, Math.min(1, left / total))})`;
}
setInterval(updateAuto, 200);
function startPolling() { if (polling) return; polling = true; poll(); }
async function poll() {
  const r = await api(`state?pin=${game.pin}&hk=${encodeURIComponent(game.hk)}`);
  if (r.ok) { st = r; render(); } else if (!r.net) { toast(r.error); }
  if (st && st.phase === "podium") { polling = false; localStorage.removeItem("pq_host_game"); return; }
  setTimeout(poll, 700);
}
async function act(action, extra = {}) {
  if (busy) return; busy = true;
  const r = await api("host", { method: "POST", body: { pin: game.pin, hk: game.hk, action, ...extra } });
  busy = false;
  if (!r.ok) { toast(r.error); return; }
  st = r; render();
  if (!polling && r.phase !== "podium") startPolling();
}
function updateLobby() {
  const box = $("#chips"); if (!box) return;
  const list = st.players || [], ids = new Set(list.map((p) => p.id));
  $$(".chip", box).forEach((c) => { if (!ids.has(c.dataset.id)) c.remove(); });
  const fresh = heardPin !== game.pin; if (fresh) { heardPin = game.pin; heard = new Set(); }
  let joined = 0;
  for (const p of list) { if (!heard.has(p.id)) { heard.add(p.id); if (!fresh) joined++; } }
  for (const p of list) {
    if (box.querySelector(`[data-id="${CSS.escape(p.id)}"]`)) continue;
    const c = document.createElement("button"); c.type = "button"; c.className = "chip"; c.dataset.id = p.id; c.innerHTML = whoHTML(p); c.title = "Remove " + p.name + (p.handle ? ` (@${p.handle})` : "");
    c.onclick = () => { if (confirm(`Remove ${p.name}${p.handle ? ` (@${p.handle})` : ""} from the game?`)) act("kick", { player: p.id }); };
    box.appendChild(c);
  }
  $("#pcount").textContent = `${st.player_count} player${st.player_count === 1 ? "" : "s"}`;
  $("#phint").textContent = st.player_count ? "Click a player to remove them." : "Waiting for players to join…";
  $("#start").disabled = !st.player_count;
  if (joined) sfx("join");
}
function joinUrl() { return "https://www.popdex-quiz.site" + "/?pin=" + game.pin; }

function render() {
  const key = [st.phase, st.qi, st.phase === "question" && serverNow() < st.q_start ? "pre" : "", st.ep || 0].join("|");
  if (key === lastKey) { const c = $("#cnt"); if (c) c.textContent = `${st.answered} / ${st.player_count}`; if (st.phase === "lobby") updateLobby(); return; }
  lastKey = key; cancelAnimationFrame(raf);
  const epb = st.ep > 0 && st.phase !== "lobby" && st.phase !== "podium" ? `<span class="ep-badge">EP ${st.ep}</span>` : ""; // lobby/podium show a big one
  const top = `<div class="row" style="justify-content:space-between;margin-bottom:16px"><div class="row" style="gap:8px">${epb}<span class="pill">${esc(st.title)} · PIN ${esc(st.pin)}</span></div><div class="row">${st.phase !== "podium" && st.phase !== "lobby" ? `<button class="btn ghost" id="pauseBtn" type="button" aria-pressed="${st.paused ? "true" : "false"}">${st.paused ? "▶ Resume" : "❚❚ Pause"}</button><button class="btn ghost" id="end" type="button">End game</button>` : ""}</div></div>`;
  // auto-advance countdown ("Next question in 6…"), redrawn by updateAuto() from the server's auto_at
  const autoBar = `<div class="autobar" id="autoBar" aria-live="polite"><div class="autotxt" id="autoTxt"></div><div class="timerbar"><i id="autoFill"></i></div></div>`;
  if (st.phase === "lobby") {
    const host = "popdex-quiz.site";
    view.innerHTML = `${top}<div class="card host-lobby"><div><p class="muted" style="margin:0 0 4px;font-weight:700">Join at <span class="joinurl">${esc(host)}</span> with Game PIN:</p><div class="pin-ep"><div class="pinbig" aria-label="Game PIN ${st.pin.split("").join(" ")}">${esc(st.pin.slice(0, 3))} ${esc(st.pin.slice(3))}</div>${st.ep > 0 ? `<span class="ep-badge lg">EP ${st.ep}</span><button class="btn ghost ep-edit" id="epEdit" type="button" aria-label="Change episode number">Change EP</button>` : ""}</div><p class="muted" style="margin:14px 0 0">Or scan the QR code. Direct link: <a href="${esc(joinUrl())}" target="_blank" rel="noopener">${esc(joinUrl().replace(/^https?:\/\//, ""))}</a> <button class="btn ghost" id="copy" type="button" style="min-height:34px;padding:6px 10px;font-size:13px">Copy link</button></p></div><div class="qr" id="qr"></div></div>
      <div class="row" style="justify-content:space-between;margin-top:22px"><h2 style="margin:0" id="pcount"></h2><button class="btn primary big" id="start" type="button" disabled>Start game</button></div>
      <p class="muted" style="font-size:14px;margin:6px 0 0" id="phint"></p>
      <div class="chips" id="chips"></div>`;
    makeQR(joinUrl(), $("#qr"));
    $("#start").onclick = () => act("start");
    const epE = $("#epEdit");
    if (epE) epE.onclick = () => {
      const v = prompt("Episode number for this game:", String(st.ep));
      if (v === null) return;
      const n = parseInt(String(v).replace(/\D/g, ""), 10);
      if (!(n >= 1)) { toast("Enter a number, like 3."); return; }
      if (n !== st.ep) act("set_ep", { ep: n });
    };
    $("#copy").onclick = () => { navigator.clipboard && navigator.clipboard.writeText(joinUrl()).then(() => toast("Join link copied")); };
    updateLobby();
    return;
  }
  const endBtn = () => { const e = $("#end"); if (e) e.onclick = () => { if (confirm("End the game now and show the podium?")) act("end"); }; const pb = $("#pauseBtn"); if (pb) pb.onclick = () => act(st.paused ? "resume" : "pause"); updateAuto(); };
  const nextBtn = () => { const n = $("#next"); if (n) n.onclick = () => act("next", { from_phase: st.phase, from_qi: st.qi }); };
  if (st.phase === "question") {
    const q = st.question;
    if (serverNow() < st.q_start) {
      view.innerHTML = `${top}<div class="card center" style="padding:48px 24px"><span class="pill">Question ${st.qi + 1} of ${st.total}</span><p class="qtext" style="margin:22px auto;max-width:900px">${esc(q.q)}</p><div class="timerbar" style="max-width:600px;margin:0 auto"><i id="pre"></i></div></div>`;
      endBtn();
      const qn = st.qi;
      const tick = () => { const left = st.q_start - serverNow(); const el = $("#pre"); if (el) el.style.transform = `scaleX(${Math.max(0, left / 4000)})`; const n = Math.ceil(left / 1000); if (n >= 1 && n <= 3) sfx1("cd" + qn + "-" + n, "beep"); if (left <= 0) { sfx1("go" + qn, "go"); lastKey = ""; render(); return; } raf = requestAnimationFrame(tick); };
      tick(); return;
    }
    view.innerHTML = `${top}<div class="card"><div class="qmeta"><span>Question ${st.qi + 1} of ${st.total}</span><span>${esc(typeLabel(q))}</span></div>${q.type === "multi" ? '<p class="center" style="margin:0 0 6px"><span class="badge2">Select 2</span> <span class="muted">Pick both correct answers</span></p>' : ""}${q.type === "text" ? '<p class="center" style="margin:0 0 6px"><span class="badge2">Type the answer</span> <span class="muted">Players type their answer on their phones</span></p>' : ""}<p class="qtext center" style="margin:6px 0 20px">${esc(q.q)}</p>
      <div class="row" style="justify-content:space-between;margin-bottom:18px"><div class="clock" id="clock" aria-label="Seconds left">${q.time}</div><div class="center"><div style="font-size:34px;font-weight:900" id="cnt">${st.answered} / ${st.player_count}</div><div class="muted">answered</div></div><button class="btn" id="skip" type="button">Skip</button></div>
      <div id="ans"></div></div>`;
    if (q.type === "text") $("#ans").innerHTML = '<div class="text-wait"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span> Players are typing…</div>';
    else $("#ans").appendChild(answerButtons(q, { disabled: true }));
    $("#skip").onclick = () => act("skip"); endBtn();
    const qn = st.qi;
    const tick = () => { const left = Math.max(0, st.q_end - serverNow()); const c = $("#clock"); if (!c) return; const n = Math.ceil(left / 1000); c.textContent = n; if (n >= 1 && n <= 5) sfx1("tk" + qn + "-" + n, "tick", n); if (left > 0) raf = requestAnimationFrame(tick); else sfx1("tu" + qn, "timeup"); };
    tick(); return;
  }
  if (st.phase === "reveal" && st.question.type === "text") {
    // all player text goes in with esc() — it is untrusted
    const q = st.question, extra = (st.accept || []).slice(1), wrong = st.wrong_top || [];
    view.innerHTML = `${top}<div class="card"><div class="qmeta"><span>Question ${st.qi + 1} of ${st.total}</span><span>${st.correct_count} of ${st.player_count} got it right</span></div><p class="center" style="margin:0 0 6px"><span class="badge2">Type the answer</span></p><p class="qtext center" style="margin:6px 0 14px">${esc(q.q)}</p>
      <div class="text-answer big-ans"><span class="muted">The answer</span><b>${esc(st.answer)}</b>${extra.length ? `<small>Also accepted: ${extra.map(esc).join(", ")}</small>` : ""}</div>
      <div class="text-stats"><div><b>${st.correct_count}</b><span>got it right</span></div><div><b>${st.wrong_count || 0}</b><span>wrong</span></div><div><b>${Math.max(0, st.player_count - st.answered)}</b><span>no answer</span></div></div>
      ${wrong.length ? `<div class="wrong-list"><p class="muted" style="margin:0 0 8px;font-weight:700">Most common wrong answers</p><ol>${wrong.map((x) => `<li><span class="wt">${esc(x.text)}</span><span class="wn">${x.n}</span></li>`).join("")}</ol></div>` : ""}
      ${autoBar}<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn primary big" id="next" type="button">Leaderboard</button></div></div>`;
    nextBtn(); endBtn(); sfx1("tu" + st.qi, "timeup"); return;
  }
  if (st.phase === "reveal") {
    const q = st.question, d = st.distribution || [], max = Math.max(1, ...d), multi = q.type === "multi";
    const isRight = (i) => (Array.isArray(st.answer) ? st.answer.map(Number) : [Number(st.answer)]).includes(i);
    view.innerHTML = `${top}<div class="card"><div class="qmeta"><span>Question ${st.qi + 1} of ${st.total}</span><span>${st.correct_count} of ${st.player_count} got it right</span></div>${multi ? '<p class="center" style="margin:0 0 6px"><span class="badge2">Select 2</span> <span class="muted">Both picks had to be right</span></p>' : ""}<p class="qtext center" style="margin:6px 0 4px">${esc(q.q)}</p>
      ${multi ? '<p class="center muted dist-note" style="margin:6px 0 0;font-size:14px">Bars count every pick (each player picked 2 answers)</p>' : ""}
      <div class="dist" style="grid-template-columns:repeat(${q.options.length},1fr)">${q.options.map((o, i) => `<div class="bar"><b>${d[i] || 0}${isRight(i) ? " ✓" : ""}</b><i style="height:${Math.round(((d[i] || 0) / max) * 150) + 8}px;background:${COLORS[i]};${isRight(i) ? "" : "opacity:.35"}"></i></div>`).join("")}</div>
      <div id="ans"></div>${autoBar}<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn primary big" id="next" type="button">Leaderboard</button></div></div>`;
    $("#ans").appendChild(answerButtons(q, { answer: st.answer }));
    nextBtn(); endBtn(); sfx1("tu" + st.qi, "timeup"); return;
  }
  if (st.phase === "leaderboard") {
    const last = st.qi + 1 >= st.total;
    view.innerHTML = `${top}<div class="card wrap-narrow" style="max-width:760px"><h2 class="center">Leaderboard</h2><p class="center muted" style="margin-top:0">After question ${st.qi + 1} of ${st.total}</p><ol class="lb lb-host">${(st.leaderboard || []).map((p, i) => `<li><span class="n">${i + 1}</span>${whoHTML(p)}${p.streak > 1 ? ` <span class="st">streak ${p.streak}</span>` : ""}${moveHTML(p.move)}<span class="s">${fmt(p.score)}</span></li>`).join("") || '<li>No players</li>'}</ol>
      ${autoBar}<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn primary big" id="next" type="button">${last ? "Show podium" : "Next question"}</button></div></div>`;
    nextBtn(); endBtn(); sfx1("lb" + st.qi, "whoosh"); return;
  }
  if (st.phase === "podium") {
    const r = st.ranking || [];
    view.innerHTML = `${top}<h1 class="center">Podium${st.ep > 0 ? ` <span class="ep-badge lg">EP ${st.ep}</span>` : ""}</h1>${pqPodiumHTML(r)}
      <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Full ranking</h2><button class="btn ghost" id="csv" type="button">Download CSV</button></div>
      <div style="overflow-x:auto"><table class="rank"><thead><tr><th>#</th><th>Player</th><th>X handle</th><th class="num">Correct</th><th class="num">Best streak</th><th class="num">Points</th></tr></thead><tbody>${r.map((p, i) => `<tr><td>${i + 1}</td><td>${whoHTML(p, { cls: "sm" })}</td><td>${p.handle ? `<a href="https://x.com/${esc(p.handle)}" target="_blank" rel="noopener">@${esc(p.handle)}</a>` : ""}</td><td class="num">${p.correct}/${st.played || st.total}</td><td class="num">${p.best_streak}</td><td class="num">${fmt(p.score)}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="row" style="justify-content:center;margin-top:20px"><button class="btn primary big" id="again" type="button">New game</button></div>`;
    sfx1("podium" + st.pin, "fanfare");
    pqConfetti(view.querySelector(".podium"));
    $("#again").onclick = () => { game = null; st = null; lastKey = ""; setup(); };
    $("#csv").onclick = () => {
      const rows = [["rank", "display_name", "x_handle", "correct", "questions_played", "best_streak", "points"], ...r.map((p, i) => [i + 1, p.name, p.handle ? "@" + p.handle : "", p.correct, st.played || st.total, p.best_streak, p.score])];
      const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `popdex-quiz-${st.pin}.csv`; a.click();
    };
  }
}
boot();
