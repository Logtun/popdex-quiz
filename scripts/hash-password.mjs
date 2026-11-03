// Prints a HOST_PASSWORD_HASH value for the quiz host login.
// Usage: node scripts/hash-password.mjs "your-host-password"
import { webcrypto as crypto } from "node:crypto";

const pw = process.argv[2];
if (!pw || pw.length < 8) { console.error("Give a password of at least 8 characters."); process.exit(1); }
const b64 = (buf) => Buffer.from(buf).toString("base64");
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
console.log("pbkdf2$100000$" + b64(salt) + "$" + b64(bits));
