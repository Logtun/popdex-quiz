
const f = $("#joinForm");
const pinIn = $("#pin");
const u = new URLSearchParams(location.search);
if (u.get("pin")) location.replace("/play.html?pin=" + encodeURIComponent(u.get("pin")));
f.addEventListener("submit", (e) => { e.preventDefault(); const pin = pinIn.value.replace(/\D/g, ""); if (pin.length !== 6) { toast("The PIN has 6 digits."); pinIn.focus(); return; } location.href = "/play.html?pin=" + pin; });
