# Cloudflare hosting

OpenRP runs as one Worker (`openrp`) with Workers Static Assets and one SQLite-backed `World` Durable Object, selected by `idFromName('official')`. Both custom domains, `openrp.dev` and `www.openrp.dev`, use that same world. The Worker serves the Vite client; the object terminates `/ws` and `/voice`, owns accounts, moderation and analytics, and runs the existing Game simulation. No Node process, container, volume, D1 database or external service is required.

## Local development

Use Node 22.12 or newer (24 recommended), `npm ci`, and `npm run dev`. Open http://localhost:8787. The command builds the three HTML entry points, watches the client and runs `wrangler dev`. Refresh after a client rebuild. Wrangler stores local state in ignored `.wrangler/`; deleting it resets the local world. Copy `.dev.vars.example` to `.dev.vars` for private local keys. Same-host requests are accepted locally even when the production origin allowlist is configured.

`npm run build` builds the client. `npm run cf-typegen` regenerates binding types from Wrangler configuration; installed Workers types supply platform declarations. `npm run check` typechecks, runs regression and real Worker tests, builds, exercises the built Worker and performs a credential-free dry-run deploy. Tests need permission to bind loopback ports. `node --import tsx scripts/load.ts 100 15` runs an isolated local Worker load scenario; its driver memory/lag are not Worker metrics or a production capacity promise.

## Deploy on your Cloudflare account

Authenticate Wrangler, change or remove the two `routes` custom-domain entries in `wrangler.jsonc` for your own zone, and update `ALLOWED_ORIGINS`. Leave the account ID out of the config; select your account through Wrangler or `CLOUDFLARE_ACCOUNT_ID`. Set private keys interactively:

```sh
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put ANALYTICS_READ_TOKEN
# Only for a password-protected game:
npx wrangler secret put SERVER_PASSWORD
npm run check
npm run deploy
```

Generate independent high-entropy operator and read tokens privately; never put values in command arguments, config, browser code or Git. Unset operator access returns 503; incorrect credentials return 401. The read token only grants analytics/chat/event reads. Removing SERVER_PASSWORD opens joins. Non-secret settings are `SERVER_NAME`, `STARTING_MONEY`, `SALARY_SECONDS`, `JAIL_SECONDS`, `LOG_RETENTION_DAYS` and comma-separated `ALLOWED_ORIGINS`.

The SQLite migration provisions the `World` class on first deploy. Preserve its class name, migration history, binding and instance name on subsequent releases. `workers_dev: true` also exposes a workers.dev address. The custom domains target the Worker directly. The known apex DNS points to a removed Railway application: remove that obsolete CNAME if it conflicts with adding the Workers Custom Domain. Check the www record for conflicts too. See [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). No DNS changes or production deployment have been verified by this migration.

`.github/workflows/ci.yml` validates Node 22 and 24, including a dry-run deploy. `.github/workflows/deploy.yml` checks and deploys pushes to main only when both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets exist. Otherwise it succeeds with a skip notice. These secrets have not been configured here. The API token needs appropriate Worker deployment and zone access; configure application secrets separately with Wrangler.

## World storage and recovery

World JSON, bans and bounded daily analytics/chat/event streams are stored in SQLite rows inside the world object. Blob rows are chunked to at most 64 KiB so a large world or summary never depends on a single large storage value. World replacement is transactional. The strict existing save validator runs on load, checkpoint and import. Invalid state fails closed instead of silently starting an empty economy.

The simulation runs at 30 Hz and sends snapshots at 15 Hz only while residents are joined. The object uses standard WebSocket acceptance, deliberately keeping the instance awake for the simulation. It checkpoints every three seconds and on joins, disconnects and operator/account changes. When the last player leaves it checkpoints, flushes logs and stops its timers. Redeployment disconnects clients; they reconnect using their existing credentials. Abrupt failure can lose the last few seconds and unfinished session-completion accounting. A Durable Object alarm at each UTC day boundary enforces log retention while idle. No process signals or draining settings apply.

The old Railway volume is unavailable. No world, accounts, bans or historic logs have been migrated. A new object starts with a new world. If you have a private `world.json` backup, an authenticated operator may POST it to `/api/admin/world` when no gameplay sockets are connected. The endpoint streams at most 32 MiB, validates the complete save and constructs a replacement Game before atomically replacing storage. Invalid backups leave current state intact. It restores world profiles and objects, not old ban lists or analytics. GET on the same endpoint exports a current world backup. Use a private client that sends `Authorization: Bearer` from your environment, never a token in a URL. Saved account hashes are compatible with the existing scrypt format; reconnect hashes still require the original browser token. Keep backups private, including hashes, character details and chat in any separately exported logs.

Operator commands use `ADMIN_TOKEN` and default to https://openrp.dev:

```sh
node --import tsx scripts/admin.ts list
node --import tsx scripts/admin.ts kick RESIDENT_ID reason
node --import tsx scripts/admin.ts ban RESIDENT_ID reason
node --import tsx scripts/admin.ts unban RESIDENT_ID
node --import tsx scripts/admin.ts cleanup RESIDENT_ID reason
node --import tsx scripts/admin.ts announce message
```

Set `OPENRP_ADMIN_URL=http://localhost:8787` for local operations. Remote CLI access requires HTTPS and does not follow redirects. Analytics uses its own environment token; see [OBSERVABILITY.md](OBSERVABILITY.md).

## Runtime limits and cost

One world is one authoritative object: CPU, memory, storage and fan-out constrain capacity even without an application player slot cap. Long-lived active WebSockets and simulation timers keep it running and incur usage. Scrypt password work, physics, snapshots and voice share the instance's resources. Measure on your account before making capacity promises. Consult current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/); no fixed price or throughput is promised here.

Workers sockets do not expose Node's `bufferedAmount` or server-initiated protocol ping. Gameplay uses existing client input/ping activity: after five seconds without inbound activity, snapshots pause and require a full resync; after thirty seconds the session closes. Server-initiated closes release simulation state immediately, even without a peer close acknowledgement. A per-session byte budget bounds gameplay delivery and forces snapshot resync when exhausted. Cloudflare handles incoming protocol ping automatically. Voice remains tied to the gameplay heartbeat, validates and rate-limits frames, bounds aggregate delivery per listener with a byte budget and drops excess live frames. These bounds cannot measure a socket's actual network backlog. No new wire protocol is introduced; version 0.6.5/protocol 7 remain unchanged.

`/health` checks object initialization and `/api/status` reports population, version, protocol and password/account flags. The root and index routes run Worker-first to record successful home-page/referrer analytics; the other static pages and assets go directly to Static Assets. Worker logs and traces are enabled. Structured errors exclude secrets. Performance logs report observed tick duration and scheduling lag, not Node RSS or perf_hooks percentiles. Worker clock precision and frozen time within synchronous execution can produce zero-duration ticks; these values are not CPU profiling. Browser voice needs HTTPS or localhost. Nothing records audio or transcripts.
