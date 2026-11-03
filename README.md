# PopDEX Quiz

A live quiz night for the PopDEX community. A host puts the game on a laptop or stream, players join from their phones with a PIN or QR code, and everyone races through PopDEX questions with a live leaderboard, a podium at the end and a shareable result card for X. There is also a solo practice mode and a no-code editor for making new rounds.

**Live:** https://popdex-quiz.vercel.app/

## Features

- **Live games (host + players):** game PIN and QR code, live lobby, question timer, answer reveal, leaderboard between questions and a final podium. Up to 200 players per game.
- **Auto-advance:** after each question the reveal and leaderboard move on by themselves; the host can pause and resume, or remove a player from the game.
- **Scoring:** faster correct answers earn more points (up to 1,000 per question), plus a streak bonus for consecutive correct answers.
- **Question types:** multiple choice, "select two" and "type the answer" (typed answers are matched server side, ignoring case, accents and punctuation).
- **X identity:** players can join with their X handle and avatar, shown in the lobby, leaderboard and podium.
- **Episodes and result cards:** each live game gets an episode number and one of four rotating card designs, so every player of the same game shares the same look. Cards are rendered in the browser (canvas) and get their own share page with an X link preview.
- **Solo mode:** play the featured question set alone and get a score card to share on X.
- **Editor:** add, edit, duplicate, import and export question sets (JSON) with no code; choose which set is used for solo play. Host password protected, and the password can be changed from the editor.
- **Sounds:** game sounds synthesised with the Web Audio API (no audio files), with a per-device mute.
- **Name filter:** player names are cleaned and filtered for profanity.

## Tech

- Static HTML, CSS and vanilla JavaScript (no build step, no framework).
- A Cloudflare Worker (`_worker.js`) for the API: games, players, answers, host login sessions, question sets and share cards.
- Cloudflare D1 (SQLite) for all game state. Real time is short polling; game phases advance lazily on reads, so no server timer is needed. The schema is created automatically on first request.
- Cloudflare R2 (optional) for uploaded result-card images.

## Data sources

- Questions are written from the public PopDEX docs (https://popdex.xyz/docs); the default set is in `default-questions.json`.
- X profile names and avatars are read through public profile lookups (fxtwitter, unavatar).

## Deploy

You need a Cloudflare account and Node.js.

1. Create the storage:
   ```
   npx wrangler d1 create popdex-quiz
   npx wrangler r2 bucket create popdex-quiz-files
   ```
   Put the D1 `database_id` into `wrangler.toml`.
2. Set the host password. It is not stored in this repo. Generate a hash and save it as a secret:
   ```
   node scripts/hash-password.mjs "your-host-password"
   npx wrangler secret put HOST_PASSWORD_HASH
   ```
   (paste the printed `pbkdf2$...` value). After the first login the host can change the password from the editor; the new hash is kept in D1.
3. Deploy:
   ```
   npx wrangler deploy
   ```

Bindings the worker expects: `DB` (D1 database), `FILES` (R2 bucket, optional), `ASSETS` (static files) and the secret `HOST_PASSWORD_HASH`. The same folder also works on Cloudflare Pages (the root `_worker.js` runs in advanced mode) with the same bindings.

If you deploy on your own domain, replace `https://popdex-quiz.vercel.app` in `_worker.js` and the HTML meta tags with your URL.

## Credits

Built by Alogi Olatunde ([@iamlogtun](https://x.com/iamlogtun)).

## License

MIT, see [LICENSE](LICENSE).
