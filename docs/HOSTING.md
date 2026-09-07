# Hosting OpenRP

Run `npm ci`, `npm run build`, then `npm start`. The Node process serves the client and `/ws` on one port. `/health` is the deployment health check. `/api/status` reports the live population; `maxPlayers: null` means no slot cap. A static website host cannot run the simulation.

## Railway

Connect the GitHub repository, attach a volume at `/app/data`, keep one replica and serverless sleeping disabled, and set the health-check path to `/health`. Enable **Wait for CI**. Dockerfile detection supplies build/start commands. The entrypoint gives the mounted directory to `node` and drops root privileges before starting the game. New Railway services use dashboard settings because first-time legacy config-as-code adoption closed in August 2026.

| Variable          | Default                 | Purpose                                                            |
| ----------------- | ----------------------- | ------------------------------------------------------------------ |
| `PORT`            | `3000`                  | HTTP and WebSocket port                                            |
| `HOST`            | `0.0.0.0`               | Bind address                                                       |
| `SERVER_NAME`     | `OpenRP Union District` | In-game name                                                       |
| `DATA_DIR`        | `./data`                | Persistent directory; `/app/data` on Railway                       |
| `STARTING_MONEY`  | `1500`                  | New identity wallet                                                |
| `SALARY_SECONDS`  | `60`                    | Payday interval                                                    |
| `JAIL_SECONDS`    | `60`                    | Sentence length                                                    |
| `ALLOWED_ORIGINS` | same host               | Exact comma-separated browser origins                              |
| `TRUST_PROXY`     | `none`                  | Use `railway` only behind Railway ingress to trust its `X-Real-IP` |
| `SERVER_PASSWORD` | empty                   | Optional shared join password                                      |

There is no `MAX_PLAYERS` setting or fixed total admission limit. Job limits, 20 props/player, 240 world entities, and abuse protections still apply. Active residents do not count toward the eight pending, unjoined sockets/IP. Connection churn is limited to 120 attempts/IP/minute. Messages are limited to 8 KiB and 120/second per socket. Heartbeats remove dead sockets; slow consumers cannot accumulate unbounded buffers.

## Domain and TLS

Add the custom domain with target port 3000 in Railway. Copy both its CNAME target and ownership-verification TXT record into Cloudflare. Cloudflare proxying is supported. In Railway mode the server accepts CF-Connecting-IP only when Railway reports a peer inside Cloudflare's published networks. Direct callers cannot spoof that header. Keep Cloudflare-to-origin TLS enabled; verify the origin certificate and HTTPS before opening play.

Set `ALLOWED_ORIGINS=https://openrp.dev,https://www.openrp.dev` on the official host. Never publish the Vite development server.

## Persistence

Wallets, names and credential hashes are stored atomically in `profiles.json`, flushed every 10 seconds and on graceful shutdown. Corrupt files fail startup rather than replacing data. Raw reconnect credentials stay in the player's browser. Use Railway volume backups; stop the server before restoring one.

The volume also stores identity bans and a generated operator key. Keep it private. Run **one game process per world/data directory**. Replicas would create separate worlds. Jobs, inventory, props and property reset on disconnect/restart.

## Operator commands

Run inside the container using Railway SSH or the dashboard Console:

```sh
node --import tsx scripts/admin.ts list
node --import tsx scripts/admin.ts kick RESIDENT_ID Repeated spawn camping
node --import tsx scripts/admin.ts ban RESIDENT_ID Prop blocking
node --import tsx scripts/admin.ts unban RESIDENT_ID
node --import tsx scripts/admin.ts announce Update in five minutes. Wallets will be saved.
```

The CLI reads the private mounted key and calls the authenticated endpoint on loopback. The key never enters the browser or repository. Bans persist immediately and apply to anonymous identities; fresh identities can evade them. Starting funds and elections are not Sybil-resistant. Moderate the public alpha and use the optional password if needed.

## Verification and capacity

Run `npm run check`, then test two browsers on the public hostname, job changes, props, chat, reconnects, and wallets across a restart. Run `npx tsx scripts/load.ts 100 15` for an isolated local synthetic movement check. No slot cap is a product behavior, not unlimited hardware or bandwidth. Watch CPU, memory, egress and gameplay latency as population grows. Current local measurements are in `TESTING.md`.
