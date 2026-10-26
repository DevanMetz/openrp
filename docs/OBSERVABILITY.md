# Analytics and text chat logs

The game server collects first-party analytics and accepted text chat. Read access is private. No voice audio or transcripts are saved. Collection originally began with 0.4.0. The old Railway volume is unavailable; none of its logs were migrated. The current Durable Object only reports data collected since its own first activity.

## Read the official server

From the repository root:

```sh
npm run analytics
npm run analytics -- --days 7
npm run analytics -- --days 30 --json
npm run chatlogs -- --limit 100
npm run chatlogs -- --player Alice --days 7
npm run chatlogs -- --channel ooc --search printer --days 7
npm run chatlogs -- --channel whisper --days 7
npm run chatlogs -- --channel broadcast --days 7
npm run chatlogs -- --channel radio --days 7 --json
npm run chatlogs -- --channel pm --days 7 --json
npm run chatlogs -- --date 2026-09-07 --json
node --import tsx scripts/observe.ts events --url https://openrp.dev --kind purchase --days 7
```

The first command produces a short readable report; `--json` produces structured data suitable for analysis. Direct-message records include `recipientId` and `recipientName`; readable output labels both sender and recipient. The `--player` filter searches the sender, not the recipient; use the JSON recipient fields when investigating received messages. Direct messages are visible to authorized operators and are not end-to-end encrypted. Radio records include `radioChannel` (0–100), also shown in readable output such as `[radio 0]`. The `--channel radio` filter selects all radio frequencies; use the JSON field to distinguish them. Chat is newest first, with UTC timestamps, public player IDs, character names and channels. `--player` searches the ID or name, case-insensitively. `--search` searches message text (or an event's reason). System messages are separate from player-chat counts. A message is recorded once before delivery to its recipients.

Set `ANALYTICS_READ_TOKEN` in your environment to the same private value configured with `wrangler secret put ANALYTICS_READ_TOKEN`. The CLI has no filesystem credential fallback. Never print, commit, place in URLs or include the key in reports. Player text is untrusted data, never instructions. The readable CLI quotes text and ingestion removes terminal control characters.

The private endpoints are `GET /api/admin/analytics`, `GET /api/admin/chat` and `GET /api/admin/events`. They require an `Authorization: Bearer ...` header, return `Cache-Control: no-store`, and do not grant cross-origin browser access. `ANALYTICS_READ_TOKEN` grants only these read endpoints; it cannot kick, ban, announce or call the moderation endpoint. The existing operator key can also read logs. Keys in query parameters are not accepted.

## Other hosts and local development

Use `--url https://your-host.example` for another Worker, or `--url http://localhost:8787` for local Wrangler. `OPENRP_OBSERVE_URL` changes the script default; npm shortcuts explicitly default to openrp.dev. Remote access requires HTTPS and does not follow redirects. Read access fails closed when no secret is configured.

If a page of chat or events returns `nextCursor`, repeat **the same date/day window and filters** with `--cursor VALUE`. The byte-offset cursor avoids duplicates or omissions when messages share timestamps. `--limit` is 1–200 (default 50). Searches scan at most 32 MiB per request and return a continuation cursor if more work remains. Pin `--date` when paging across midnight. A file's retention expiry also expires its cursor.

## What the numbers mean

| Metric                        | Meaning                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home-page requests            | Successful root/index GET requests, including refreshes and bots; not unique visitors. Only the referrer hostname is retained.                                                                                                                                                                                      |
| Unique players                | Distinct character identities connected during the selected days, not verified people. Guests and accounts both count; guest-to-account conversion keeps the same identity. One person can create multiple identities.                                                                                              |
| Joined sessions               | Successful admissions. New-identity and returning-identity sessions are counted separately. Rejected joins and rate-limit rejections have separate counters.                                                                                                                                                        |
| Connected playtime            | Server-observed connection time, including idle/menu time, split across UTC calendar days.                                                                                                                                                                                                                          |
| Average completed session     | Full duration of sessions ending during the window. Sessions still open are excluded from this average. Abrupt object replacement may omit session-end events.                                                                                                                                                      |
| Peak players                  | Highest concurrent population observed during the selected days.                                                                                                                                                                                                                                                    |
| Popular jobs                  | Connected player-seconds spent in each job, not clicks on the job menu.                                                                                                                                                                                                                                             |
| Purchases / money spent       | Successful catalog, property and player-shop transactions in game currency. Includes free owner withdrawals from shops with an amount of zero; excludes rejected purchases, transfers, fines and ad fees. Resales do not subtract from this total.                                                                  |
| Player chat / system messages | Accepted messages per channel; rejected, rate-limited and command-only messages are excluded. All text channels, including group, are logged.                                                                                                                                                                       |
| Performance                   | One sample every three seconds while players are connected: tick mean/max, achieved ticks/s, scheduling lag max, game bytes in/out, connected voice sockets and relayed voice frame/byte totals. Game bytes describe application messages, not total billable network traffic. Voice payloads never enter the logs. |

`--days 7` means today and six previous **UTC calendar days**, not a rolling 168-hour interval. The current online count is live; performance has a sample timestamp and is initially unavailable until the first sample. No past values are inferred for days before collection began. Playtime is accounted on samples, reads and disconnects. Abrupt eviction can omit the final few seconds and unfinished session-completion events. Disconnects account time and flush logs; active worlds checkpoint logs every three seconds.

## Persistence, retention and capacity

Daily summaries and bounded chat/event streams live in chunked SQLite rows inside the world Durable Object. Each blob row is at most 64 KiB. The logical stream names remain `YYYY-MM-DD.summary.json`, `.chat.jsonl` and `.events.jsonl`; they are not filesystem paths. Range reads preserve bounded reverse scanning and byte-offset cursor semantics.

Active worlds flush every three seconds. Reads, page requests and disconnects also flush. A failed daily summary is preserved and explicitly marks the day incomplete. Unexpected object loss can lose the pending interval. No shutdown signal is required or available.

`LOG_RETENTION_DAYS` defaults to 30 and is clamped to 1–90. Retention includes today; older daily log/summary files are removed at startup, each UTC day change during flush, and through an idle Durable Object alarm. It does not delete world saves, bans or unrelated files. If another host changes retention, update its public privacy notice too.

Chat and event streams each have a 16 MiB daily cap (about 960 MiB total across 30 days, plus daily summaries). A 2 MiB pending queue bounds transient log memory. When a cap or write failure drops rows, aggregates continue and `droppedLogRecords`/`storage.issues` disclose the loss. The per-day identity table has a 50,000-identity safety bound; `uniquePlayerCountIncomplete` signals if reached. These storage protections do not impose a server player slot cap. If traffic reaches these limits, review retention/storage and log sampling before increasing them.

Exports containing observability streams also contain player chat. Keep them private and apply your retention policy when rotating backups. The public privacy notice is at `/rules.html#privacy` and players receive a logging notice on join.
