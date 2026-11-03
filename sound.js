// PopDEX Quiz game sounds (Alogi, 2026-11-01). Every sound is synthesised with the Web Audio API:
// no audio files, nothing extra to download. The 🔊/🔇 button in the header mutes this device only;
// the choice is kept in localStorage ("pq_sound") and applies on host, play and solo.
(function () {
  "use strict";
  var KEY = "pq_sound", ctx = null, chain = null, onceSeen = {}, lastAt = {};
  var log = []; // instrumentation for QA: {n: name, on: played?, t: ms}
  function isMuted() { try { return localStorage.getItem(KEY) === "off"; } catch (e) { return false; } }
  function note(n, on) { log.push({ n: n, on: on, t: Date.now() }); if (log.length > 300) log.shift(); }

  // ---- synthesis helpers (work on a live AudioContext or an OfflineAudioContext) ----
  var noiseCache = typeof WeakMap === "function" ? new WeakMap() : null;
  function noise(c) {
    var b = noiseCache && noiseCache.get(c);
    if (b) return b;
    b = c.createBuffer(1, Math.floor(c.sampleRate * 1), c.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (noiseCache) noiseCache.set(c, b);
    return b;
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(c, out, type, f, t, a, peak, d, fEnd, fDur) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + (fDur || a + d));
    env(g, t, a, peak, d);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  function burst(c, out, t, ftype, freq, q, a, peak, d) {
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noise(c); f.type = ftype; f.frequency.setValueAtTime(freq, t); if (q) f.Q.value = q;
    env(g, t, a, peak, d);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + a + d + 0.05);
    return f;
  }
  function brass(c, out, f, t, dur, peak) {
    var lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = "lowpass"; lp.frequency.setValueAtTime(1200, t); lp.frequency.linearRampToValueAtTime(2400, t + 0.06); lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.setValueAtTime(peak, t + Math.max(0.03, dur - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    lp.connect(g); g.connect(out);
    [-6, 6].forEach(function (cents) {
      var o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(f, t); o.detune.value = cents;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.2);
    });
  }

  // ---- the patches: name -> function(ctx, destination, startTime, option) ----
  var P = {
    join: function (c, o, t) { // bubbly pop
      tone(c, o, "sine", 380, t, 0.004, 0.6, 0.14, 1100, 0.07);
      tone(c, o, "triangle", 760, t, 0.004, 0.12, 0.1, 2000, 0.06);
    },
    beep: function (c, o, t) { // countdown 3, 2, 1
      tone(c, o, "triangle", 784, t, 0.005, 0.5, 0.16);
      tone(c, o, "sine", 1568, t, 0.005, 0.08, 0.12);
    },
    go: function (c, o, t) { // countdown GO / start
      tone(c, o, "triangle", 1047, t, 0.006, 0.42, 0.45);
      tone(c, o, "triangle", 1568, t, 0.006, 0.2, 0.4);
      tone(c, o, "sine", 523, t, 0.006, 0.18, 0.35);
    },
    click: function (c, o, t) { // answer tapped
      tone(c, o, "sine", 1800, t, 0.002, 0.3, 0.05, 900, 0.03);
      burst(c, o, t, "highpass", 3000, 0, 0.001, 0.08, 0.02);
    },
    tick: function (c, o, t, n) { // last seconds of the timer (n = seconds left; the last two are a little higher)
      var f = n && n <= 2 ? 1400 : 1150;
      tone(c, o, "sine", f, t, 0.002, 0.42, 0.07, f * 0.7, 0.05);
      burst(c, o, t, "bandpass", 2500, 3, 0.001, 0.16, 0.03);
    },
    correct: function (c, o, t) { // bright two-note ding
      [[880, 0], [1319, 0.09]].forEach(function (n) {
        tone(c, o, "triangle", n[0], t + n[1], 0.005, 0.4, 0.5);
        tone(c, o, "sine", n[0] * 2, t + n[1], 0.005, 0.1, 0.3);
      });
    },
    wrong: function (c, o, t) { // low "eh-eh" buzz, filtered so it is not harsh
      [0, 0.19].forEach(function (dt) {
        var lp = c.createBiquadFilter(), g = c.createGain(), s = t + dt;
        lp.type = "lowpass"; lp.frequency.value = 750; lp.connect(g); g.connect(o);
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.3, s + 0.01);
        g.gain.setValueAtTime(0.3, s + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
        [140, 146].forEach(function (f) { var x = c.createOscillator(); x.type = "sawtooth"; x.frequency.setValueAtTime(f, s); x.frequency.linearRampToValueAtTime(f * 0.9, s + 0.16); x.connect(lp); x.start(s); x.stop(s + 0.2); });
      });
    },
    timeup: function (c, o, t) { // descending three-note "time's up"
      tone(c, o, "triangle", 659, t, 0.006, 0.4, 0.16);
      tone(c, o, "triangle", 523, t + 0.16, 0.006, 0.4, 0.16);
      tone(c, o, "triangle", 392, t + 0.32, 0.006, 0.42, 0.55);
      tone(c, o, "sine", 196, t + 0.32, 0.01, 0.2, 0.5);
    },
    whoosh: function (c, o, t) { // leaderboard reveal
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noise(c); f.type = "bandpass"; f.Q.value = 1.2;
      f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.3); f.frequency.exponentialRampToValueAtTime(1200, t + 0.55);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      s.connect(f); f.connect(g); g.connect(o); s.start(t); s.stop(t + 0.6);
    },
    fanfare: function (c, o, t) { // final podium / results
      brass(c, o, 392, t, 0.12, 0.13);
      brass(c, o, 523, t + 0.14, 0.12, 0.13);
      brass(c, o, 659, t + 0.28, 0.12, 0.13);
      [523, 659, 784].forEach(function (f) { brass(c, o, f, t + 0.42, 0.75, 0.1); });
      tone(c, o, "triangle", 1568, t + 0.42, 0.01, 0.12, 0.7);
      tone(c, o, "sine", 2093, t + 0.5, 0.01, 0.06, 0.6);
    }
  };
  var LEN = { join: 0.2, beep: 0.2, go: 0.5, click: 0.08, tick: 0.1, correct: 0.65, wrong: 0.4, timeup: 0.9, whoosh: 0.6, fanfare: 1.35 };

  // master chain: moderate volume + a gentle compressor so stacked sounds never clip
  function makeChain(c) {
    var m = c.createGain(), comp = c.createDynamicsCompressor();
    m.gain.value = 0.7;
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    m.connect(comp); comp.connect(c.destination);
    return m;
  }
  function getCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); chain = makeChain(ctx); } catch (e) { ctx = null; chain = null; }
    return ctx;
  }
  // browsers keep audio locked until a tap: create/resume the context on the first gesture
  function unlock() {
    if (isMuted()) return;
    var c = getCtx(); if (!c) return;
    try {
      if (c.state !== "running" && c.resume) c.resume().catch(function () {});
      var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); // iOS needs a sound started inside the gesture
    } catch (e) {}
  }
  ["pointerdown", "touchend", "keydown", "click"].forEach(function (ev) { document.addEventListener(ev, unlock, { capture: true, passive: true }); });

  function play(name, opt) {
    try {
      if (!P[name]) return false;
      if (isMuted()) { note(name, false); return false; }
      var now = Date.now();
      if (lastAt[name] && now - lastAt[name] < 60) return false; // never stack the same sound
      lastAt[name] = now;
      var c = getCtx();
      if (!c) { note(name, false); return false; }
      if (c.state === "suspended" && c.resume) c.resume().catch(function () {});
      P[name](c, chain, c.currentTime + 0.01, opt);
      note(name, true);
      return true;
    } catch (e) { return false; }
  }
  function once(key, name, opt) { if (onceSeen[key]) return false; onceSeen[key] = 1; return play(name, opt); }

  // ---- the speaker button ----
  var ICON_ON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function paintBtn() {
    var b = document.getElementById("soundBtn"); if (!b) return;
    var off = isMuted();
    b.innerHTML = off ? ICON_OFF : ICON_ON;
    b.setAttribute("aria-pressed", off ? "false" : "true");
    b.setAttribute("aria-label", off ? "Sound is off. Tap to turn sound on" : "Sound is on. Tap to mute");
    b.title = off ? "Sound off" : "Sound on";
    b.classList.toggle("off", off);
  }
  function setMuted(off) {
    try { localStorage.setItem(KEY, off ? "off" : "on"); } catch (e) {}
    if (off && ctx && ctx.suspend) { try { ctx.suspend(); } catch (e) {} }
    paintBtn();
    if (!off) { unlock(); play("click"); }
  }
  function addBtn() {
    if (document.getElementById("soundBtn")) return;
    var top = document.querySelector("header.top"); if (!top) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "soundBtn"; b.className = "snd-btn";
    b.addEventListener("click", function () { setMuted(!isMuted()); });
    top.appendChild(b); paintBtn();
  }
  window.addEventListener("storage", function (e) { if (e.key === KEY) paintBtn(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addBtn); else addBtn();

  window.PQSound = { play: play, once: once, muted: isMuted, setMuted: setMuted, unlock: unlock, patches: P, lengths: LEN, makeChain: makeChain, log: log };
})();
