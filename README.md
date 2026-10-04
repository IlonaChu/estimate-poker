# Refinement Poker

Real-time story estimation for refinement sessions. **One link = one session = many rounds**, so the PO never has to resend a link.

Stack: Vue 3 + Vite + Pinia (client), Node.js + Express + Socket.IO (server).

## Run

```bash
npm install
npm run dev        # server on :3001, client on http://localhost:5173 (proxied)
```

Production-style, one port:

```bash
npm run build
npm start          # http://localhost:3001 serves API, websockets and the built client
```

Other scripts: `npm test` (unit tests), `npm run smoke` (end-to-end test against a real server on port 3999).

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3001` | Server port (the Vite dev proxy reads it too) |

## Flow

1. PO opens `/`, enters a name, clicks **Create session**, then **Copy participant link** (`/s/<id>`, valid for the whole session).
2. Participants open the link, enter a name and pick a team (frontend, mobile, backend, qa). A refresh restores them automatically.
3. PO starts a round (story title and link are optional). Participants pick a Fibonacci card (1, 2, 3, 5, 8, 13, 21), `?` (unsure) or `☕` (pass). Votes stay hidden; the server does not send values before reveal.
4. PO reveals. Numeric votes are compared: differences are highlighted (lowest/highest, team disagreement, Fibonacci step gap, "large gap" at 2+ steps), or a consensus banner is shown.
5. PO can **Revote** (earlier attempts are kept), then records a final estimate per voting team plus a total.
6. **Next round** returns to the start form on the same link, or **Finish session** shows a summary for everyone, with Markdown copy and CSV download.

Teams skip stories that don't concern them by simply not voting (or passing). Non-votes and passes are ignored in all calculations.

## Persistence and restore

The server keeps state in memory only (idle sessions expire after 24h). The PO's browser saves a backup of the session in localStorage after every change. If the server restarts, the PO opens the same link and clicks **Restore session**; the session returns under the **same id**, and participants reconnect on their own. Finished sessions can be viewed from the "My sessions" list on `/` even when the server has forgotten them.

## Known limitations

- A server restart ends the session until the PO restores it; a vote in progress is lost on restore.
- Restore trusts the PO's browser backup (it is validated and recomputed, but not signed). Anyone who knows a session id could claim it *only* while the server doesn't have it.
- No accounts, no database, no rate limiting; meant for trusted internal use.
- Participant identity lives in localStorage; clearing it makes a participant rejoin as a new person.
- Local/dev hosting only; no Docker.

## Deploy the client to GitHub Pages

GitHub Pages only serves static files, so the Node server (API + Socket.IO) must be hosted separately (Render, Fly, Railway, ...).

1. Host the server with `CORS_ORIGIN=https://<user>.github.io` set.
2. Build and publish the client:

   ```bash
   VITE_API_URL=https://your-server.example npm run deploy
   ```

   This builds with base path `/estimate-poker/` (change `VITE_BASE` in the root `deploy` script if the repo name differs), copies `index.html` to `404.html` so deep links like `/s/<id>` work, and pushes `client/dist` to the `gh-pages` branch.
3. In the repo settings, set Pages source to the `gh-pages` branch.
