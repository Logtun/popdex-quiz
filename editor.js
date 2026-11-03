
const view = $("#view"), login = $("#login");
let sets = [], cur = null, dirty = false;
const TIMES = [5, 10, 15, 20, 30, 45, 60, 90, 120];
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

async function boot() {
  const me = await api("me");
  if (!me.host) { login.classList.remove("hide"); view.innerHTML = ""; $("#pw").focus(); return; }
  login.classList.add("hide"); load();
}
login.addEventListener("submit", async (e) => {
  e.preventDefault(); $("#loginErr").textContent = "";
  const r = await api("login", { method: "POST", body: { password: $("#pw").value } });
  if (!r.ok) { $("#loginErr").textContent = r.error; return; }
  localStorage.setItem("pq_host_token", r.token); localStorage.setItem("pq_host_seen", String(Date.now())); $("#pw").value = ""; boot();
});
async function load(selectId) {
  view.innerHTML = '<div class="spinner"></div>';
  const r = await api("sets");
  if (!r.ok) { if (r.status === 401) { localStorage.removeItem("pq_host_token"); return boot(); } view.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
  sets = r.sets; const pick = sets.find((s) => s.id === selectId) || sets[0];
  cur = JSON.parse(JSON.stringify(pick)); dirty = false; draw();
}
function blankQ() { return { q: "", type: "mc", options: ["", "", "", ""], answer: 0, time: 20, source: "" }; }
function draw() {
  view.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:14px"><h1 style="margin:0;font-size:32px">Question editor</h1>
    <div class="row"><label for="pick" class="hide">Question set</label><select id="pick" style="width:auto;min-width:220px">${sets.map((s) => `<option value="${esc(s.id)}" ${s.id === cur.id ? "selected" : ""}>${esc(s.title)}</option>`).join("")}${cur.id ? "" : '<option selected value="">(new set, not saved)</option>'}</select>
    <button class="btn" id="newset" type="button">New set</button></div></div>
    <div class="card" style="margin-bottom:16px"><div class="grid2"><div class="field"><label for="title">Set title</label><input id="title" maxlength="80" value="${esc(cur.title)}"></div>
    <div class="field"><label for="feat">Solo mode</label><select id="feat"><option value="1" ${cur.featured ? "selected" : ""}>Used for solo play</option><option value="0" ${cur.featured ? "" : "selected"}>Live games only</option></select></div>
    <div class="field"><label>&nbsp;</label><div class="row"><button class="btn ghost" id="exp" type="button">Export JSON</button><label class="btn ghost" style="margin:0" for="imp">Import JSON</label><input id="imp" type="file" accept="application/json,.json" class="hide"></div></div></div>
    <p class="muted" style="margin:0;font-size:14px">${cur.questions.length} questions. Mark the right answer with the round button. Import replaces the questions in this set (save to keep).</p></div>
    <div id="qs"></div>
    <div class="sticky-save"><button class="btn" id="add" type="button">Add question</button><button class="btn primary" id="save" type="button">Save set</button>${cur.id ? '<button class="btn danger" id="delset" type="button">Delete set</button>' : ""}<span class="muted" id="state" style="align-self:center"></span></div>
    <details class="card" style="margin-top:24px"><summary style="cursor:pointer;font-weight:800">Change host password</summary><form id="pwf" style="margin-top:14px" autocomplete="off"><div class="grid2"><div class="field"><label for="pwc">Current password</label><input id="pwc" type="password" autocomplete="current-password" required></div><div class="field"><label for="pwn">New password (8+ characters)</label><input id="pwn" type="password" autocomplete="new-password" minlength="8" required></div><div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">Change</button></div></div></form></details>
    <p class="center"><a class="btn ghost" href="/host.html">Go to host screen</a> <button class="btn ghost" id="logout" type="button">Log out</button></p>`;
  const qs = $("#qs");
  cur.questions.forEach((q, i) => qs.appendChild(qCard(q, i)));
  $("#pick").onchange = (e) => { if (dirty && !confirm("Discard unsaved changes?")) { e.target.value = cur.id; return; } load(e.target.value); };
  $("#newset").onclick = () => { if (dirty && !confirm("Discard unsaved changes?")) return; cur = { id: "", title: "New quiz", featured: false, questions: [blankQ()] }; dirty = true; draw(); };
  $("#title").oninput = (e) => { cur.title = e.target.value; mark(); };
  $("#feat").onchange = (e) => { cur.featured = e.target.value === "1"; mark(); };
  $("#add").onclick = () => { cur.questions.push(blankQ()); mark(); draw(); const last = $$(".qedit").pop(); last.scrollIntoView({ behavior: "smooth" }); $("textarea", last).focus(); };
  $("#save").onclick = save;
  if ($("#delset")) $("#delset").onclick = async () => { if (!confirm(`Delete the set "${cur.title}"?`)) return; const r = await api("sets?id=" + encodeURIComponent(cur.id), { method: "DELETE" }); if (!r.ok) return toast(r.error); dirty = false; toast("Set deleted"); load(); };
  $("#exp").onclick = () => { const data = { title: cur.title, questions: cur.questions }; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = (cur.title || "quiz").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json"; a.click(); };
  $("#imp").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); const list = Array.isArray(data) ? data : data.questions; if (!Array.isArray(list) || !list.length) throw new Error("No questions array found.");
      cur.questions = list.map((q) => { if (q.type === "text") { const acc = (Array.isArray(q.accept) ? q.accept : Array.isArray(q.answers) ? q.answers : [q.answer ?? q.correct ?? ""]).map((x) => String(x ?? "")).filter((x) => x.trim()).slice(0, TEXT_ACCEPT_MAX); return { q: String(q.q || q.question || ""), type: "text", options: [], accept: acc.length ? acc : [""], time: Number(q.time) || 20, source: String(q.source || "") }; }
        const type = q.type === "tf" ? "tf" : q.type === "multi" ? "multi" : "mc"; const options = type === "tf" ? ["True", "False"] : [...(q.options || q.answers || []).map(String).slice(0, 4), "", "", "", ""].slice(0, type === "multi" ? 4 : Math.max(2, (q.options || q.answers || []).length)).slice(0, 4); const raw = q.answer ?? q.correct ?? 0; return { q: String(q.q || q.question || ""), type, options, answer: type === "multi" ? (Array.isArray(raw) ? raw.map(Number) : []).slice(0, 2) : Number(Array.isArray(raw) ? raw[0] : raw) || 0, time: Number(q.time) || 20, source: String(q.source || "") }; });
      if (!Array.isArray(data) && data.title) cur.title = data.title;
      mark(); draw(); toast(`Imported ${cur.questions.length} questions. Save to keep them.`);
    } catch (err) { toast("Could not read that file: " + err.message, 4000); }
  };
  $("#pwf").onsubmit = async (e) => { e.preventDefault(); const r = await api("password", { method: "POST", body: { current: $("#pwc").value, next: $("#pwn").value } }); if (!r.ok) return toast(r.error); $("#pwc").value = $("#pwn").value = ""; toast("Host password changed"); };
  $("#logout").onclick = () => { localStorage.removeItem("pq_host_token"); boot(); };
  mark(dirty);
}
function mark(v = true) { dirty = v; const s = $("#state"); if (s) s.textContent = dirty ? "Unsaved changes" : "All changes saved"; }
const TEXT_ACCEPT_MAX = 5;
// "Type the answer" fields: main answer (shown at the reveal) + extra accepted answers
function textFields(q, i) {
  const acc = q.accept || [""];
  return `<label for="acc${i}_0">Correct answer</label><p class="multi-tip">Players type their answer. Capital letters, spaces and punctuation don't matter.</p>
    <div class="opts text-acc"><div class="opt"><input id="acc${i}_0" data-acc="0" maxlength="60" value="${esc(acc[0] || "")}" placeholder="Main answer, e.g. Bitcoin"></div>
    ${acc.slice(1).map((a, k) => `<div class="opt"><input data-acc="${k + 1}" maxlength="60" value="${esc(a)}" placeholder="Also accept, e.g. BTC" aria-label="Also accepted answer ${k + 1}"><button class="btn ghost" type="button" data-accdel="${k + 1}" aria-label="Remove accepted answer ${k + 1}">✕</button></div>`).join("")}</div>
    ${acc.length < TEXT_ACCEPT_MAX ? `<button class="btn ghost" type="button" data-accadd="1" style="margin-top:8px">+ Also accept another answer</button>` : ""}
    <p class="muted" style="font-size:13px;margin:6px 0 0">Small typos in longer answers (6+ letters) also count as right.</p>`;
}
function qCard(q, i) {
  const d = document.createElement("div"); d.className = "qedit";
  const opts = q.type === "tf" ? ["True", "False"] : q.options || [], multi = q.type === "multi", isText = q.type === "text";
  if (isText && (!Array.isArray(q.accept) || !q.accept.length)) q.accept = [""];
  d.innerHTML = `<div class="head"><b>Question ${i + 1}</b><div class="tools"><button class="btn ghost" type="button" data-a="up" aria-label="Move question ${i + 1} up">↑</button><button class="btn ghost" type="button" data-a="down" aria-label="Move question ${i + 1} down">↓</button><button class="btn ghost" type="button" data-a="dup">Duplicate</button><button class="btn danger" type="button" data-a="del">Delete</button></div></div>
    <div class="field"><label for="q${i}">Question</label><textarea id="q${i}" rows="2" maxlength="200">${esc(q.q)}</textarea></div>
    <div class="grid2" style="grid-template-columns:1fr 1fr"><div class="field"><label for="t${i}">Type</label><select id="t${i}"><option value="mc" ${q.type === "mc" ? "selected" : ""}>Multiple choice</option><option value="tf" ${q.type === "tf" ? "selected" : ""}>True / false</option><option value="multi" ${q.type === "multi" ? "selected" : ""}>Select two answers</option><option value="text" ${isText ? "selected" : ""}>Type the answer</option></select></div>
    <div class="field"><label for="tm${i}">Time limit</label><select id="tm${i}">${TIMES.map((t) => `<option value="${t}" ${t === q.time ? "selected" : ""}>${t} seconds</option>`).join("")}</select></div></div>
    ${isText ? textFields(q, i) : `${multi ? `<label>Answers (tick the 2 correct ones)</label><p class="multi-tip">Players must pick both correct answers.</p>` : "<label>Answers (choose the correct one)</label>"}<div class="opts${multi ? " multi" : ""}">${opts.map((o, k) => `<div class="opt">${multi
      ? `<input type="checkbox" value="${k}" ${asList(q.answer).includes(k) ? "checked" : ""} aria-label="Answer ${k + 1} is correct">`
      : `<input type="radio" name="r${i}" value="${k}" ${k === q.answer ? "checked" : ""} aria-label="Answer ${k + 1} is correct">`}<input data-k="${k}" maxlength="80" value="${esc(o)}" placeholder="Answer ${k + 1}${k > (multi ? 2 : 1) ? " (optional)" : ""}" ${q.type === "tf" ? "readonly" : ""}></div>`).join("")}</div>`}
    <div class="field" style="margin-top:12px"><label for="s${i}">Source (optional)</label><input id="s${i}" maxlength="300" value="${esc(q.source || "")}" placeholder="https://…"></div>`;
  $(`#q${i}`, d).oninput = (e) => { q.q = e.target.value; mark(); };
  $(`#s${i}`, d).oninput = (e) => { q.source = e.target.value; mark(); };
  $(`#tm${i}`, d).onchange = (e) => { q.time = Number(e.target.value); mark(); };
  $(`#t${i}`, d).onchange = (e) => {
    const was = q.type; q.type = e.target.value;
    if (q.type === "text") {
      // seed the main answer from the old correct option
      if (!Array.isArray(q.accept) || !q.accept.some((x) => String(x).trim())) { const o = q.options || []; const k = asList(q.answer)[0] || 0; q.accept = [was === "tf" ? "" : String(o[k] || "")]; }
      mark(); draw(); return;
    }
    if (was === "text") { q.options = [String((q.accept || [])[0] || ""), "", "", ""]; q.answer = 0; }
    if (q.type === "multi") { q.answer = was === "multi" ? asList(q.answer) : was === "mc" ? [Number(q.answer) || 0] : []; }
    else if (Array.isArray(q.answer)) q.answer = q.answer.length ? Number(q.answer[0]) : 0;
    if (q.type === "tf") { q.options = ["True", "False"]; if (q.answer > 1) q.answer = 0; } else { q.options = [...q.options, "", "", "", ""].slice(0, 4).map((o) => (was === "tf" && (o === "True" || o === "False")) ? "" : o); }
    mark(); draw();
  };
  $$('input[type=checkbox]', d).forEach((cb) => cb.onchange = () => {
    const k = Number(cb.value), a = asList(q.answer).filter((x) => x !== k);
    if (cb.checked) { if (a.length >= 2) { cb.checked = false; return toast("Tick exactly 2 correct answers. Untick one first."); } a.push(k); }
    q.answer = a.sort((x, y) => x - y); mark();
  });
  $$("input[data-acc]", d).forEach((inp) => inp.oninput = () => { q.accept[Number(inp.dataset.acc)] = inp.value; mark(); });
  $$("[data-accdel]", d).forEach((b) => b.onclick = () => { q.accept.splice(Number(b.dataset.accdel), 1); mark(); draw(); });
  const addAcc = $("[data-accadd]", d);
  if (addAcc) addAcc.onclick = () => { if (q.accept.length >= TEXT_ACCEPT_MAX) return toast(`Up to ${TEXT_ACCEPT_MAX} accepted answers.`); q.accept.push(""); mark(); draw(); const box = $$(".qedit")[i]; const all = box ? $$("input[data-acc]", box) : []; if (all.length) all[all.length - 1].focus(); };
  $$('input[type=radio]', d).forEach((r) => r.onchange = () => { q.answer = Number(r.value); mark(); });
  $$("input[data-k]", d).forEach((inp) => inp.oninput = () => { q.options[Number(inp.dataset.k)] = inp.value; mark(); });
  $$("[data-a]", d).forEach((b) => b.onclick = () => {
    const a = b.dataset.a, L = cur.questions;
    if (a === "del") { if (L.length === 1) return toast("A set needs at least one question."); if (!confirm(`Delete question ${i + 1}?`)) return; L.splice(i, 1); }
    if (a === "up" && i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]];
    if (a === "down" && i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]];
    if (a === "dup") L.splice(i + 1, 0, JSON.parse(JSON.stringify(q)));
    mark(); draw();
  });
  return d;
}
async function save() {
  // drop empty trailing options (keep at least 2), keep the correct answer pointing at the same text
  const out = [];
  for (const [i, q] of cur.questions.entries()) {
    if (!q.q.trim()) return toast(`Question ${i + 1} has no text.`);
    if (q.type === "text") {
      const accept = (q.accept || []).map((a) => String(a).trim()).filter(Boolean);
      if (!String((q.accept || [])[0] || "").trim()) return toast(`Question ${i + 1}: type the correct answer.`, 4000);
      out.push({ q: q.q, type: "text", accept, time: q.time, source: q.source || "" });
      continue;
    }
    let opts = q.type === "tf" ? ["True", "False"] : q.options.map((o) => o.trim());
    if (q.type === "multi") {
      const a = asList(q.answer);
      if (a.length !== 2) return toast(`Question ${i + 1}: tick exactly 2 correct answers.`, 4000);
      if (a.some((k) => !opts[k])) return toast(`Question ${i + 1}: a ticked correct answer is empty.`, 4000);
      const keep = opts.map((o, k) => (o ? k : -1)).filter((k) => k >= 0);
      if (keep.length < 3) return toast(`Question ${i + 1} needs at least 3 answers for "Select two".`, 4000);
      out.push({ ...q, options: keep.map((k) => opts[k]), answer: a.map((k) => keep.indexOf(k)).sort((x, y) => x - y) });
      continue;
    }
    const right = opts[q.answer];
    if (!right) return toast(`Question ${i + 1}: the correct answer is empty.`);
    opts = opts.filter((o) => o);
    if (opts.length < 2) return toast(`Question ${i + 1} needs at least 2 answers.`);
    out.push({ ...q, options: opts, answer: opts.indexOf(right) });
  }
  $("#save").disabled = true;
  const r = await api("sets", { method: "POST", body: { id: cur.id || undefined, title: cur.title, featured: cur.featured, questions: out } });
  $("#save").disabled = false;
  if (!r.ok) return toast(r.error, 4000);
  dirty = false; toast("Saved"); load(r.id);
}
boot();
