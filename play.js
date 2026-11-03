
const params = new URLSearchParams(location.search);
const form = $("#joinForm"), view = $("#view");
let me = null; // {pin,pid,key,name}
let st = null, lastKey = "", polling = false, timerRAF = null, pending = null, msel = null, tdraft = null;
// game sounds (sound.js); safe no-ops if audio is unavailable
function sfx(n, o) { try { return window.PQSound ? PQSound.play(n, o) : false; } catch (e) { return false; } }
function sfx1(k, n, o) { try { return window.PQSound ? PQSound.once(k, n, o) : false; } catch (e) { return false; } }
if (params.get("pin")) $("#pin").value = params.get("pin").replace(/\D/g, "");
const saved = (() => { try { return JSON.parse(localStorage.getItem("pq_player") || "null"); } catch { return null; } })();
if (saved && (!params.get("pin") || params.get("pin") === saved.pin)) { me = saved; start(); }
else if ($("#pin").value.length === 6) $("#xh").focus();
// ended / unknown PIN (2026-11-01): check the PIN as soon as it has 6 digits, so an ended game's link shows "This game has ended"
let pinChecked = "";
$("#pin").addEventListener("input", () => { const v = $("#pin").value.replace(/\D/g, ""); if (v.length === 6) checkPin(v); else { pinChecked = ""; if ($("#joinErr").dataset.pin) { $("#joinErr").textContent = ""; delete $("#joinErr").dataset.pin; } } });
if (!me && $("#pin").value.length === 6) checkPin($("#pin").value);
async function checkPin(pin) {
  pin = String(pin).replace(/\D/g, ""); if (pin.length !== 6 || pin === pinChecked || me) return; pinChecked = pin;
  const r = await api("pin?pin=" + pin);
  if (me || $("#pin").value.replace(/\D/g, "") !== pin) return;
  const er = $("#joinErr");
  if (r.ok && r.game_state === "ended") showEnded(r); // (r.status is the HTTP status, set by api())
  else if (r.not_found) { er.textContent = r.error; er.dataset.pin = "1"; }
  else if (er.dataset.pin) { er.textContent = ""; delete er.dataset.pin; }
}
function showEnded(info) {
  const ep = Number(info.ep) || 0, pod = info.podium || [];
  form.classList.add("hide"); view.classList.remove("hide");
  view.innerHTML = `<div class="card center ended-box">${ep > 0 ? `<span class="ep-badge">EP ${ep}</span>` : ""}<p class="status-big">This game has ended</p><p class="muted" style="margin-top:0">${ep > 0 ? `EP ${ep} of PopDEX Quiz Night is over.` : "This PopDEX Quiz Night game is over."}</p>
    ${pod.length ? `<h2 class="lb-title">Final results</h2>${pqPodiumHTML(pod, { mini: true })}` : ""}
    <div class="row" style="justify-content:center;margin-top:18px"><a class="btn primary" href="/solo.html">Play solo</a><button class="btn ghost" id="otherPin" type="button">Enter another PIN</button></div>
    </div>`;
  $("#otherPin").onclick = () => { view.classList.add("hide"); view.innerHTML = ""; form.classList.remove("hide"); pinChecked = ""; $("#pin").value = ""; $("#joinErr").textContent = ""; history.replaceState(null, "", "/play.html"); $("#pin").focus(); };
}
try { const lh = localStorage.getItem("pq_xhandle"); if (lh && !$("#xh").value) $("#xh").value = lh; } catch (e) {}
let joining = false; // a join request is under way (keeps the button disabled)
const picker = xPicker($("#xh"), $("#xprev"), (s) => {
  const b = $("#joinBtn"); if (!b) return; $("#joinErr").textContent = "";
  if (!joining) b.disabled = s.state === "invalid" || s.state === "notfound";
  b.textContent = s.state === "found" ? `Join as ${s.profile.name}` : s.state === "unavailable" ? `Join as @${s.handle}` : "Join";
}, { verb: "join" });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = $("#pin").value.replace(/\D/g, "");
  $("#joinErr").textContent = "";
  if (pin.length !== 6) { $("#joinErr").textContent = "The PIN has 6 digits."; return; }
  $("#joinBtn").disabled = true; joining = true;
  // wait at most 1.5 s for a lookup still under way; after that join as @handle (the server fills in the X name/photo when X answers)
  const s = await picker.ensure(1500);
  if (s.state === "idle") { joining = false; $("#joinBtn").disabled = false; $("#joinErr").textContent = "Enter your X handle."; $("#xh").focus(); return; }
  if (s.state === "invalid" || s.state === "notfound") { joining = false; $("#xh").focus(); return; }
  const sv = (() => { try { return JSON.parse(localStorage.getItem("pq_player") || "null"); } catch { return null; } })();
  const prev = sv && sv.pin === pin ? { pid: sv.pid, key: sv.key } : {}; // same device rejoining keeps its player
  let r = await api("join", { method: "POST", body: { pin, handle: s.handle, ...prev } });
  if (!r.ok && r.net) { await new Promise((ok) => setTimeout(ok, 800)); r = await api("join", { method: "POST", body: { pin, handle: s.handle, ...prev } }); } // one quiet retry on a dropped connection
  joining = false; $("#joinBtn").disabled = false;
  if (!r.ok) { if (r.ended) { showEnded(r); return; } $("#joinErr").textContent = r.error; if (r.status === 404 && !r.not_found && /X/.test(r.error)) picker.retry(); return; }
  try { localStorage.setItem("pq_xhandle", r.handle); } catch (e) {}
  me = { pin, pid: r.pid, key: r.key, name: r.name, handle: r.handle, av: r.av };
  localStorage.setItem("pq_player", JSON.stringify(me));
  if (r.late && !r.rejoined) lateNote(r.late);
  start();
});
// late joining (2026-11-01): a small note the first time a late joiner lands mid-game ("You joined at Question 6 of 20")
let lateMsg = "", lateUntil = 0;
function lateNote(l) {
  const qi = Number(l.qi) || 0, total = Number(l.total) || 0;
  lateMsg = l.phase === "question" ? `You joined at Question ${qi + 1} of ${total}` : qi + 1 < total ? `You joined at Question ${qi + 2} of ${total}` : `You joined at the end of Question ${total} of ${total}`;
  lateUntil = Date.now() + 3500;
  setTimeout(() => { const n = $("#lateNote"); if (n) { n.classList.add("gone"); setTimeout(() => n.remove(), 400); } lateMsg = ""; }, 3500);
}
function showLate() {
  if (!lateMsg || Date.now() > lateUntil || $("#lateNote") || view.classList.contains("hide")) return;
  const n = document.createElement("p"); n.className = "late-note"; n.id = "lateNote"; n.setAttribute("role", "status"); n.textContent = lateMsg;
  view.prepend(n);
}

function leave() { localStorage.removeItem("pq_player"); me = null; location.href = "/play.html"; }
function start() { form.classList.add("hide"); view.classList.remove("hide"); view.innerHTML = '<div class="spinner" aria-label="Loading"></div>'; if (!polling) { polling = true; poll(); } }

async function poll() {
  if (!me) return;
  const r = await api(`state?pin=${me.pin}&pid=${encodeURIComponent(me.pid)}&key=${encodeURIComponent(me.key)}`);
  if (!r.ok) {
    if (r.status === 404 || r.status === 403) { localStorage.removeItem("pq_player"); view.innerHTML = `<div class="card center"><p class="status-big">Game over</p><p class="muted">${esc(r.error)}</p><a class="btn primary" href="/play.html">Join another game</a> <a class="btn" href="/solo.html">Play solo</a></div>`; polling = false; return; }
  } else { st = r; render(); }
  if (st && st.phase === "podium") { polling = false; return; }
  setTimeout(poll, st && (st.phase === "question" || st.phase === "reveal" || st.phase === "leaderboard") ? 700 : 1000);
}

// auto-advance (2026-11-01): server-timed countdown to the next screen; same clock on every phone and the host
function autoBar() { return `<div class="autobar hide" id="autoBar" aria-live="polite"><div class="autotxt" id="autoTxt"></div><div class="timerbar"><i id="autoFill"></i></div></div>`; }
function moveHTML(m) { m = Number(m) || 0; return m > 0 ? ` <span class="mv up" aria-label="up ${m}">▲${m}</span>` : m < 0 ? ` <span class="mv down" aria-label="down ${-m}">▼${-m}</span>` : ""; }
function updateAuto() {
  const bar = $("#autoBar"); if (!bar || !st) return;
  const ph = st.phase, total = (st.auto_ms && st.auto_ms[ph]) || 6000;
  if ((ph !== "reveal" && ph !== "leaderboard") || (!st.paused && !(st.auto_at > 0))) { bar.classList.add("hide"); return; }
  bar.classList.remove("hide");
  const last = st.qi + 1 >= st.total;
  const what = ph === "reveal" ? "Leaderboard" : last ? "Final results" : "Next question";
  const left = st.paused ? (st.pause_left || 0) : Math.max(0, st.auto_at - serverNow());
  const n = Math.ceil(left / 1000);
  $("#autoTxt").textContent = st.paused ? "Paused by the host" : n > 0 ? `${what} in ${n}…` : `${what}…`;
  bar.classList.toggle("paused", !!st.paused);
  $("#autoFill").style.transform = `scaleX(${Math.max(0, Math.min(1, left / total))})`;
}
setInterval(updateAuto, 200);
function statbar() {
  const m = st.me;
  return `<div class="statbar"><div class="sb-who"><span>Player</span>${whoHTML(m, { cls: "sm" })}</div><div><span>Score</span>${fmt(m.score)}</div><div><span>Rank</span>${ordinal(m.rank)}</div></div>`;
}
// the list scrolls inside its own box, sized to the rest of the screen so "You're in!" and the list both stay in view
function fitLobby() { const l = $("#whoList"); if (!l) return; const top = l.getBoundingClientRect().top + scrollY; l.style.maxHeight = Math.max(190, Math.min(560, innerHeight - top - 26)) + "px"; }
addEventListener("resize", fitLobby);
// lobby "who's here" list (2026-11-01): every player sees who has joined, updated in place on each poll (no full re-render, so scroll + animations hold)
let lobbySeen = null, lobbyPopAt = 0;
function updateLobby() {
  const box = $("#whoList"); if (!box || !st.lobby) return;
  const n = st.player_count, list = [...st.lobby.filter((p) => p.you), ...st.lobby.filter((p) => !p.you).reverse()]; // "You" first, then newest first, so new joiners land at the top
  const line = $("#lobbyLine"); if (line) line.textContent = `${n} player${n === 1 ? "" : "s"} in the lobby. Waiting for the host to start…`;
  $("#whoN").textContent = `${n} player${n === 1 ? "" : "s"} in`;
  const sb = $("#sbWrap"); if (sb && st.me) sb.innerHTML = statbar();
  const keyOf = (p) => `${p.j}|${p.handle}|${p.name}`;
  const keys = new Set(list.map(keyOf)), first = lobbySeen === null;
  if (first) { lobbySeen = new Set(); fitLobby(); }
  $$("li", box).forEach((li) => { if (!keys.has(li.dataset.k)) li.remove(); });
  let fresh = 0, prev = null;
  for (const p of list) {
    const k = keyOf(p);
    let li = box.querySelector(`li[data-k="${CSS.escape(k)}"]`);
    if (!li) {
      li = document.createElement("li"); li.dataset.k = k; li.className = "wh" + (p.you ? " you" : "");
      li.innerHTML = `${avHTML(p)}<span class="wh-t"><span class="wh-n">${esc(p.name)}</span>${showsHandle(p) ? `<span class="wh-h">@${esc(p.handle)}</span>` : ""}</span>${p.you ? '<span class="wh-you">You</span>' : ""}`;
      if (!first && !lobbySeen.has(k)) { li.classList.add("pop"); if (!p.you) fresh++; }
    }
    lobbySeen.add(k);
    const want = prev ? prev.nextSibling : box.firstChild;
    if (li !== want) box.insertBefore(li, want);
    prev = li;
  }
  // a soft pop for new joiners, at most once every 3 s (each phone's own mute applies inside PQSound)
  if (fresh && Date.now() - lobbyPopAt > 3000) { lobbyPopAt = Date.now(); sfx("join"); }
}
function render() { renderView(); showLate(); }
function renderView() {
  if (st.kicked) { localStorage.removeItem("pq_player"); view.innerHTML = `<div class="card center"><p class="status-big">You were removed from this game</p><a class="btn primary" href="/play.html">Join again</a></div>`; polling = false; return; }
  const key = [st.phase, st.qi, st.my_answer ? "a" : "", "", st.phase === "question" && serverNow() < st.q_start ? "pre" : ""].join("|");
  if (key === lastKey) { const c = $("#cnt"); if (c && st.phase === "question") c.textContent = `${st.answered}/${st.player_count} answered`; if (st.phase === "lobby") updateLobby(); return; } lastKey = key;
  cancelAnimationFrame(timerRAF);
  if (pending && (st.phase !== "question" || pending.qi !== st.qi)) pending = null;
  const m = st.me;
  if (st.phase === "lobby") {
    view.innerHTML = `<div class="card center lobby-me">${st.ep > 0 ? `<span class="ep-badge">EP ${st.ep}</span> ` : ""}<span class="pill">PIN ${esc(st.pin)}</span><p class="status-big">You're in!</p><div class="me-big">${avHTML(m, "av lg")}<div class="who-n">${esc(m.name)}</div>${showsHandle(m) ? `<div class="who-h">@${esc(m.handle)}</div>` : ""}</div><p class="muted" id="lobbyLine">${st.player_count} player${st.player_count === 1 ? "" : "s"} in the lobby. Waiting for the host to start…</p><div class="spinner"></div></div><section class="card whos-here" aria-labelledby="whoH"><div class="wh-head"><h3 id="whoH">Who's here</h3><span class="pill" id="whoN"></span></div><ul class="wh-grid" id="whoList" aria-live="polite"></ul></section><div id="sbWrap">${statbar()}</div><p class="center"><button class="btn ghost" id="leave" type="button">Leave game</button></p>`;
    $("#leave").onclick = leave; sfx1("lobby", "join"); lobbySeen = null; updateLobby(); return;
  }
  if (st.phase === "question") {
    const q = st.question;
    const head = `<div class="qmeta"><span>Question ${st.qi + 1} of ${st.total}</span><span>${esc(typeLabel(q))}</span></div>`;
    if (serverNow() < st.q_start) {
      view.innerHTML = `<div class="card">${head}<p class="qtext">${esc(q.q)}</p><div class="timerbar"><i id="pre"></i></div><p class="muted center">Get ready…</p></div>${statbar()}`;
      const qn = st.qi;
      const tick = () => { const left = st.q_start - serverNow(); const el = $("#pre"); if (el) el.style.transform = `scaleX(${Math.max(0, left / 4000)})`; const n = Math.ceil(left / 1000); if (n >= 1 && n <= 3) sfx1("cd" + qn + "-" + n, "beep"); if (left <= 0) { sfx1("go" + qn, "go"); lastKey = ""; render(); return; } timerRAF = requestAnimationFrame(tick); };
      tick(); return;
    }
    const answered = st.my_answer || pending;
    view.innerHTML = `<div class="card">${head}<p class="qtext">${esc(q.q)}</p><div class="timerbar"><i id="tb"></i></div><div class="row" style="justify-content:space-between;margin-bottom:12px"><b id="secs" aria-live="off"></b><span class="muted" id="cnt">${st.answered}/${st.player_count} answered</span></div><div id="ans"></div>${answered ? '<p class="center status-big" style="font-size:22px">Answer locked in. Waiting for the others…</p>' : ""}</div>${statbar()}`;
    if (q.type === "text") {
      if (!tdraft || tdraft.qi !== st.qi) tdraft = { qi: st.qi, v: "" };
      if (answered) $("#ans").innerHTML = `<div class="typed-locked"><span class="muted">Your answer</span><b>${esc(answered.typed || tdraft.v || "")}</b></div>`;
      else $("#ans").appendChild(textPicker({ draft: tdraft, onSubmit: pickText }));
    } else if (q.type === "multi" && !answered) {
      if (!msel || msel.qi !== st.qi) msel = Object.assign([], { qi: st.qi });
      $("#ans").appendChild(multiPicker(q, { sel: msel, onSubmit: pickMulti }));
    } else $("#ans").appendChild(answerButtons(q, { picked: answered ? (answered.choices || answered.choice) : null, onPick: pick }));
    const total = q.time * 1000;
    const qn = st.qi;
    const tick = () => { const left = Math.max(0, st.q_end - serverNow()); const el = $("#tb"); if (!el) return; el.style.transform = `scaleX(${left / total})`; const n = Math.ceil(left / 1000); $("#secs").textContent = n + "s"; if (!answered && n >= 1 && n <= 5) sfx1("tk" + qn + "-" + n, "tick", n); if (left > 0) timerRAF = requestAnimationFrame(tick); else if (!answered) { sfx1("tu" + qn, "timeup"); $("#ans").innerHTML = '<p class="center status-big" style="font-size:22px">Time\'s up!</p>'; } };
    tick(); return;
  }
  if (st.phase === "reveal") {
    const a = st.my_answer, q = st.question;
    let fb;
    if (!a) fb = `<div class="feedback none"><div class="big">No answer</div><p>Streak lost. Be quicker on the next one!</p></div>`;
    else if (a.correct) fb = `<div class="feedback good"><div class="big">Correct!</div>${a.streak > 1 ? `<p>Answer streak: ${a.streak}</p>` : ""}<div class="plus">+${fmt(a.points)}</div></div>`;
    else fb = `<div class="feedback bad"><div class="big">Wrong</div><p>Streak lost.</p><div class="plus">+0</div></div>`;
    const behind = m.rank === 1 ? `<p class="center muted">You're in the lead!</p>` : (m.behind && m.behind.by > 0 ? `<p class="center muted">${fmt(m.behind.by)} points behind ${esc(m.behind.name)}</p>` : "");
    view.innerHTML = `${fb}${autoBar()}<div class="card" style="margin-top:14px"><p style="margin-top:0;font-weight:700">${esc(q.q)}</p><div id="ans"></div></div>${statbar()}${behind}`;
    if (q.type === "text") $("#ans").innerHTML = `<div class="text-answer"><span class="muted">The answer</span><b>${esc(st.answer)}</b></div>${a && a.typed ? `<p class="muted" style="margin:10px 0 0">You typed: <b class="${a.correct ? "ok-t" : "bad-t"}">${esc(a.typed)}</b></p>` : ""}`;
    else $("#ans").appendChild(answerButtons(q, { answer: st.answer, picked: a ? (a.choices || a.choice) : null }));
    if (!a) sfx1("tu" + st.qi, "timeup"); else sfx1("rv" + st.qi, a.correct ? "correct" : "wrong");
    updateAuto(); return;
  }
  if (st.phase === "leaderboard") {
    const lb = st.leaderboard || [], inTop = lb.some((p) => p.me);
    const behind = m.rank === 1 ? "" : m.behind && m.behind.by > 0 ? `${fmt(m.behind.by)} points behind ${esc(m.behind.name)}` : "";
    view.innerHTML = `<div class="card center lb-card">${autoBar()}<span class="pill">After question ${st.qi + 1} of ${st.total}</span><p class="status-big">${m.rank === 1 ? "You're in the lead!" : `You're ${ordinal(m.rank)}`}</p><p style="font-size:20px;font-weight:800">${fmt(m.score)} points</p>${behind ? `<p class="muted">${behind}</p>` : ""}${m.streak > 1 ? `<p>Answer streak: ${m.streak}</p>` : ""}
      <h2 class="lb-title">Leaderboard</h2><ol class="lb lb-phone lb10">${lb.map((p, i) => `<li class="${p.me ? "me" : ""}"><span class="n">${i + 1}</span>${whoHTML(p)}${p.me ? ' <span class="you-tag">You</span>' : ""}${moveHTML(p.move)}<span class="s">${fmt(p.score)}</span></li>`).join("")}${inTop ? "" : `<li class="me you-row"><span class="you-line">You: #${m.rank} · ${fmt(m.score)} pts</span>${moveHTML(m.move)}</li>`}</ol></div>${statbar()}`;
    sfx1("lb" + st.qi, "whoosh");
    updateAuto(); return;
  }
  if (st.phase === "podium") {
    localStorage.removeItem("pq_player");
    sfx1("podium", "fanfare");
    const res = { name: m.name, handle: m.handle, av: m.av, correct: m.correct, total: st.played || st.total, score: m.score, rank: m.rank, players: st.player_count, best_streak: m.best_streak, ep: st.ep || 0, design: st.design || "A" };
    const _ep = res.ep > 0 ? " EP " + res.ep : "", _r = `#${res.rank} of ${res.players}`, _c = `${res.correct}/${res.total}`;
    const _caps = [
      `Finished ${_r} on PopDEX Quiz Night${_ep} 🧠 ${_c} correct, ${fmt(res.score)} pts.\n\nNow I know my way around @popdex_, the fully on-chain perp DEX. Time to trade it 📈`,
      `I scored ${_c} and ranked ${_r} on PopDEX Quiz Night${_ep} 🏆\n\nThink you know @popdex_ better? Join the next one and trade perps fully on-chain ⚡`,
      `${_r} on PopDEX Quiz Night${_ep} 🎉 (${_c})\n\nFun fact I learned: every trade on @popdex_ earns tickets for the weekly MegaPop draw 🎟️`,
      `${_c} on PopDEX Quiz Night${_ep}, ${_r} 🔥\n\n@popdex_: perps, one margin account, fully on-chain. Go try it.`,
      `Quiz night with the @popdex_ fam 💜 Ranked ${_r} with ${_c}${_ep ? " on" + _ep : ""}.\n\nLearn it, trade it, win MegaPop. See you next week!`
    ];
    const text = _caps[Math.floor(Math.random() * _caps.length)];
    const fname = `popdex-quiz-${res.rank}-of-${res.players}.png`;
    view.innerHTML = `<div class="card center">${res.ep > 0 ? `<span class="ep-badge">EP ${res.ep}</span> ` : ""}<span class="pill">Final results</span><p class="status-big">You finished ${ordinal(res.rank)}</p><p style="font-size:20px;font-weight:800">${fmt(res.score)} points · ${res.correct}/${res.total} correct</p><p class="muted" style="margin:4px 0 0">#${res.rank} of ${res.players} player${res.players === 1 ? "" : "s"}${res.best_streak > 1 ? ` · best streak ${res.best_streak}` : ""}</p></div>
      <div class="card" style="margin-top:14px"><h2>Podium</h2>${pqPodiumHTML(st.podium || [], { mini: true })}</div>
      <div class="card" style="margin-top:14px"><h2 style="margin-top:0">Your score card</h2><div id="cardwrap"></div>
        <div class="row card-actions" style="justify-content:center;margin-top:14px"><button class="btn primary" id="dl" type="button">Download card</button><button class="btn hide" id="shareImg" type="button">Share image</button><a class="btn" id="tw" target="_blank" rel="noopener">Share on X</a></div>
        <p class="muted center" id="shareNote" style="font-size:14px;margin-bottom:0">Preparing your share link…</p></div>
      <div class="row" style="justify-content:center;margin-top:16px"><a class="btn" href="/solo.html">Play solo</a><a class="btn ghost" href="/play.html">Join another game</a></div>`;
    let blob = null, uploaded = false, resolveUp;
    pqConfetti(view.querySelector(".podium"));
    pqWireShare($("#tw"), $("#shareNote"), text, "https://www.popdex-quiz.site", new Promise((r) => { resolveUp = r; }));
    const paint = () => {
      const c = drawMultiCard(res); c.className = "card-preview"; c.setAttribute("role", "img"); c.setAttribute("aria-label", text);
      const w = $("#cardwrap"); if (!w) return; w.innerHTML = ""; w.appendChild(c);
      if (!uploaded) { uploaded = true; { const mq = { kind: "mp", pin: me.pin, pid: me.pid, key: me.key }; pqUploadCard(c, mq).then((u) => u || pqUploadCard(c, mq)).then((u) => u || new Promise((ok) => setTimeout(ok, 1500)).then(() => pqUploadCard(c, mq))).then(resolveUp); } }
      c.toBlob((b) => {
        blob = b;
        try { const f = new File([b], fname, { type: "image/png" }); if (navigator.canShare && navigator.share && navigator.canShare({ files: [f] })) $("#shareImg").classList.remove("hide"); } catch (e) {}
      }, "image/png");
    };
    Promise.all([pqReady(pqCardLogo), pqLoadImg(res.av)]).then(([, av]) => { res.avatar = av; paint(); });
    $("#dl").onclick = () => { if (!blob) { toast("Card is still being made, one second…"); return; } const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    $("#shareImg").onclick = async () => {
      if (!blob) return;
      try { await navigator.share({ files: [new File([blob], fname, { type: "image/png" })], text: `${text} ${($("#tw").dataset.share) || location.origin}` }); }
      catch (e) { if (e && e.name !== "AbortError") toast("Sharing didn't work here. Use Download card instead."); }
    };
  }
}

async function pick(i) {
  if (pending || st.my_answer) return;
  sfx("click"); pending = { choice: i, qi: st.qi }; lastKey = ""; render();
  if (navigator.vibrate) navigator.vibrate(30);
  const r = await api("answer", { method: "POST", body: { pin: me.pin, pid: me.pid, key: me.key, qi: st.qi, choice: i } });
  if (!r.ok) { toast(r.error); if (/already/.test(r.error)) return; pending = null; lastKey = ""; render(); }
  else { st.my_answer = { choice: i }; }
}
// "Type the answer": the server does the matching; speed is counted at submit
async function pickText(v) {
  if (pending || st.my_answer || !v) return;
  sfx("click"); pending = { choice: -1, typed: v, qi: st.qi }; lastKey = ""; render();
  if (navigator.vibrate) navigator.vibrate(30);
  const r = await api("answer", { method: "POST", body: { pin: me.pin, pid: me.pid, key: me.key, qi: st.qi, text: v } });
  if (!r.ok) { toast(r.error); if (/already/.test(r.error)) return; pending = null; lastKey = ""; render(); }
  else { st.my_answer = { choice: -1, typed: v }; }
}
// "Select two answers": both picks go in one submit; speed is counted at submit
async function pickMulti(picks) {
  if (pending || st.my_answer || picks.length !== 2) return;
  sfx("click"); pending = { choice: picks[0], choices: picks.slice(), qi: st.qi }; lastKey = ""; render();
  if (navigator.vibrate) navigator.vibrate(30);
  const r = await api("answer", { method: "POST", body: { pin: me.pin, pid: me.pid, key: me.key, qi: st.qi, choices: picks } });
  if (!r.ok) { toast(r.error); if (/already/.test(r.error)) return; pending = null; lastKey = ""; render(); }
  else { st.my_answer = { choice: picks[0], choices: picks.slice() }; }
}
