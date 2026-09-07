# Hosting OpenRP

## One process, one port

`npm run dev` runs the Node HTTP/WebSocket host and Vite middleware together. `npm run build && npm start` serves the built client from `dist/` and runs the same game server. The game WebSocket endpoint is `/ws`; `/health` is a liveness endpoint; `/api/status` reports the actual player count and whether a password is required.

Production needs Node, writable persistent storage, and a host/reverse proxy that supports WebSocket upgrades. A static-only deployment cannot simulate this game. The included Dockerfile builds the client in one stage and runs the server as an unprivileged user in another. The Compose volume stores wallets across container replacements. Docker configuration is provided; validate it on your own Docker host before an internet deployment.

## Configuration

Copy `.env.example` to `.env`. The server reads it at startup. Environment variables provided by the host take precedence.

| Variable          | Default                    | Meaning                                                      |
| ----------------- | -------------------------- | ------------------------------------------------------------ |
| `PORT`            | `3000`                     | HTTP and game WebSocket port                                 |
| `HOST`            | `0.0.0.0`                  | Listen address; use `127.0.0.1` behind a local proxy         |
| `SERVER_NAME`     | `OpenRP \| Union District` | Name shown in the game                                       |
| `MAX_PLAYERS`     | `32`                       | Slot cap, clamped to 1–64; not a measured capacity guarantee |
| `STARTING_MONEY`  | `1500`                     | Wallet for new identities                                    |
| `SALARY_SECONDS`  | `60`                       | Payday interval                                              |
| `JAIL_SECONDS`    | `60`                       | Sentence length                                              |
| `DATA_DIR`        | `./data`                   | Persistent wallet directory                                  |
| `ALLOWED_ORIGINS` | same host                  | Exact comma-separated browser origins                        |
| `SERVER_PASSWORD` | empty                      | Optional shared join password                                |

When hosting at `https://rp.example.com`, set `ALLOWED_ORIGINS=https://rp.example.com`. Preserve the original request host when reverse-proxying, or explicitly configure this origin list. Serve the page and WebSocket from the same public origin. Use TLS for internet play so browser bearer credentials and passwords are encrypted in transit.

Do not expose the development server as the production deployment. Build and use `npm start`. Configure automatic process restart through your hosting platform or the provided Compose service.

## Persistence and backups

`data/profiles.json` contains names, balances and SHA-256 hashes of anonymous reconnect credentials. Raw reconnect credentials live in the player's browser, never in snapshots or the server's saved JSON. Wallets flush every 10 seconds and during graceful shutdown using write-then-rename. Stop the server before restoring a backup. A corrupt wallet file fails startup instead of silently overwriting the data.

Only run **one server process** per world/data directory. There is no distributed-state layer. Multiple server instances create separate worlds and must use separate data directories.

Doors, inventory, jobs and props are intentionally session-scoped in this alpha. Disconnecting cleans up owned entities and releases property. Changing away from Gun Dealer/Cook removes that job's shipments/microwaves. A disconnected owner's wallet remains saved.

## Operational limits

Clients are limited to 8 KiB messages, 120 messages per second, 8 simultaneous sockets per source IP, a 10-second join window, 20 building props per player and 240 entities per world. Heartbeats terminate stale connections. Slow consumers are disconnected before unlimited send buffers accumulate.

The per-IP cap uses the direct TCP peer. Behind a proxy, every player can appear under the same IP; raise or adapt that cap in `server/main.ts` with a trusted-proxy policy if needed. OpenRP deliberately does not trust arbitrary forwarded IP headers.

There is no verified-account system, moderation console, ban list, DDoS protection, or administrative persistence editor. Operate the alpha as a small community or passworded server until those systems are added. A user can create a new anonymous identity by using a different browser; starting funds and job elections are not Sybil-resistant.

## Quick smoke test

1. Run `npm run check` and `npm start`.
2. Visit `/health`, then the game in a regular and a private browser window.
3. Join with two names. Confirm both appear in Tab.
4. Spawn a shelf with Q. Confirm the other player sees it move and freeze.
5. Use F4 to become a dealer, buy a shipment, and have the second player purchase a weapon with E.
6. Disconnect and reconnect. Confirm the wallet survives and old props are cleaned up.

The browser bundle uses local fonts and generated art/audio. After installing dependencies and building, it requires no third-party asset requests.
