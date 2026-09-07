# Testing

## Automated

Run `npm run check`. It runs strict TypeScript checks, Node's test runner through `tsx`, a production client build, and an HTTP smoke test of the built files. Tests use disposable worlds and storage; they do not modify a running player's wallet file.

Coverage includes:

- Fixed-rate movement despite excess input; malformed numeric input and ray slabs.
- Closed-door collision and passage into an actual building when open.
- Remote/unauthorized property actions, purchase, shared keys and resale.
- Role limits, elections, duplicate votes, job cooldowns and chief prerequisites.
- Demotion majority/ties, fixed electorates, request cooldowns, role bans, custody preservation, offline results, reconnects and real WebSocket ballot/result replication.
- Printer purchase/production/collection/confiscation and shipment cash/stock transfers.
- Physics settling, freezing, ownership restrictions and fading collision restoration.
- Weapon damage, world occlusion, ammunition, reload timing, death and respawn.
- Physical firearm drop/pickup with exact ammunition transfer, duplicate/reach/custody/issued-equipment restrictions, obstructed placement, corrupt ammunition rejection, saved-world replacement and real multi-client WebSocket replication.
- Wanted/arrest permissions, custody restrictions, release and lockpicking.
- Resident actions through menus and chat: exact identity targeting, full names/IDs, role checks, clean reasons, shared cooldown, transfer conservation, wallet caps, range/occlusion and stale targets.
- Credential privacy, wallet reconnect, local/global chat delivery and text filtering.
- Real WebSocket clients sharing players, props, jobs and chat; retained belongings on disconnect.
- Invalid JSON, origin restrictions, flooding, optional passwords and server status.
- Atomic world/inventory round-trip, migration from legacy wallets, and refusal to load corrupt or unsupported saves.
- Real WebSocket purchases through a refresh and replacement server using the same data directory: inventory, ammo, armor, cash, props, property and stock.
- Restored rigid-body rotation, frozen/fading collision, offline shop income, persistent prop limits, shared keys and reconnect penalties.
- Authenticated offline-owner cleanup, preserved inventories and unrelated objects, immediate checkpointing, and rejection of analytics-only credentials.
- Voice frame validation and quantization; capture at 44.1/48 kHz with no packets outside push-to-talk.
- Real voice sockets: server-enforced range, dead-player suppression, individual mute, deafen and no self echo.
- Voice ticket admission/revocation, duplicate sockets, origin rejection, replayed frames, flood isolation and operator removal.
- Production worklet asset, same-origin microphone policy, and exclusion of the development voice lab.
- Analytics across UTC midnight, new/returning identity counts, job time, completed-session averages and successful-only purchases.
- Chat captured once before audience fan-out, all channels, search filters, Unicode disk boundaries, identical-timestamp pagination and interrupted-tail recovery.
- Log and summary persistence through server replacement, expiration, disk-cap loss indicators and preservation of corrupt summaries.
- Private HTTP endpoints, rejection of URL credentials, read-key isolation from moderation, credential redaction and human/JSON CLI reads against a real local server.

## Browser checklist

Custom-title QA, September 7, 2026: Chrome saved Union Cafe Owner through F4 Jobs, displayed it on the HUD, and showed both Union Cafe Owner and Citizen in the resident list. Salary remained $45. Tests cover invalid values, custody/death restrictions, chat reset, role changes, offline demotion, saved-world replacement and full-slot fallback; a Citizen titled Mayor cannot grant licenses. Full 83-test checks passed; narrow title-editor layout and overhead custom labels still need visual review.

Narrow chat QA, September 7, 2026: Chrome rendered the actual game in a 360×780 iframe. The initial whisper composer wrapped its label beside a cramped field. The updated layout uses the available width, puts the channel/range above the input and keeps the Enter hint alongside it; the test message remained fully visible. Build, typecheck and production smoke passed. This is a CSS viewport check, not touch-input or mobile gameplay support.

Chat range QA, September 7, 2026: Chrome showed WHISPER · 5m while composing `/w`, delivered the speaker's message with a [WHISPER] label, reset the composer to LOCAL · 28m, and showed YELL · 56m for `/y`. Server tests cover aliases, exact distance boundaries, height and shared cooldowns; observability tests cover one log record per message and filtering each new channel. The 81-test full check passed before the composer enhancement; the final composer build and production smoke were checked separately. Multiple live browser recipients and narrow-width composer layout remain unverified.

Government menu QA, September 7, 2026: in a disposable three-resident Chrome session, Mayor used Revoke search warrant and Revoke gun license on a Medic. The panel removed the active warrant and switched to No gun license / Grant gun license. The same panel submitted a demotion reason; F4 showed the correct target, reason, 1 yes / 0 no, two required yes votes and vote-recorded state. Automated role-matrix coverage verifies revocation authority and protection of government-issued licenses. Full 80-test checks passed. Narrow-width ballots remain unverified.

Pocket browser QA, September 7, 2026: Chrome stored a dropped pistol via C → Store in pocket. The world object disappeared, F4 → Pocket showed 1/8 objects with 7 loaded / 19 reserve rounds, and Place in front of me returned the object. Automated tests cover ownership, capacity, held/frozen/fading/business restrictions, reach, custody, death, blocked placement, world and prop limits, contents, replacement saves, corrupt data and multi-client replication. Pocket thumbnails and narrow-screen rendering remain follow-up work. Local full checks cover 80 tests; this pocket increment is not yet deployed.

Release integration QA, September 7, 2026: 0.5.1 preserves the account, resident-panel and expanded-city updates from main. All 75 tests passed locally and on GitHub's Node 22/24 matrix. Chrome entered a disposable guest session in the merged build and used Shop's firearm drop control with the correct 7/19 floor prompt. The deployed public entry screen reports 0.5.1, `/health` responds successfully, `/api/status` reports protocol 5 with accounts enabled, and the three public JS/CSS assets exactly match the tested local build. This release check did not sign into a real resident account or change production possessions.

Firearm browser QA, September 7, 2026: on a disposable local server, Chrome used F4 Shop's Drop firearm button with a personal pistol holding 7 loaded / 19 reserve rounds. The menu closed, the pistol left inventory, and its floor model displayed both ammunition counts and the E pickup prompt. E recovered the firearm; selecting slot 4 displayed the same 7 / 19 rounds. Automated tests separately cover transfer to another resident and saved-world replacement. Context-menu pickup, other firearm models and other browsers still need manual coverage.

City-surface browser QA, September 7, 2026: Chrome rendered Union Square with branching cutout foliage and detailed cool/warm glazing in the actual game. A separate same-camera comparison (pixel ratio 1, soft shadows enabled, no residents) measured 103 calls / 55,444 triangles / 39 textures after the change versus 105 / 57,844 / 37 before. Map collision files were unchanged and the full 55-test suite, build and production smoke check passed. Foliage alpha overdraw, lower-end hardware and other browsers have not been profiled. Temporary comparison files are gitignored under `test-results/`.

Character browser QA, September 7, 2026: an isolated Chrome review compared all 11 jobs using the current `makeAvatar` against the previous implementation. Verified role accessories, colored geometry batching, head pitch, bent-knee crouching and articulated feet. With labels hidden and no shadow pass, the same scene measured 150 draw calls / 46,050 triangles for updated characters versus 242 / 19,242 previously. A live local WebSocket session separately displayed updated Citizen, Cook and Medic models in the city. These checks do not establish full-game frame rates, large-crowd GPU capacity or final weapon-grip fidelity. Temporary comparison files are in gitignored `test-results/`; they are excluded from deployment.

Demotion browser QA, September 7, 2026: on an isolated development server with two synthetic residents, Chrome submitted `/demote Morgan Vale Ignoring public requests`. F4 displayed the correct target, reason, two-vote majority threshold, countdown and recorded vote. The server's synthetic witness cast the deciding vote; after expiry, the Players menu showed Morgan Vale as Citizen and chat announced the five-minute role restriction. The context-menu submission path and narrow-screen ballot layout still need manual coverage. Automated tests cover ties, late joiners, offline demotion, saved-world replacement, retained custody and property, job-stock removal, ban expiry and real multi-client ballot/result delivery.

1. Inspect the initial city and name-entry screen at desktop and narrow viewport sizes.
2. Join, return to play and capture the mouse. Verify WASD, look, sprint, crouch and jump. In embedded browsers that reject mouse capture, test right-drag look and Alt + left click alternate use.
3. Press F4. Apply for a non-voting job and confirm the HUD/loadout updates. With another resident, apply for Mayor and cast one vote per player.
4. Stand in clear space. Q → Shelving; press 2 for Physics Gun. Aim at the shelf, hold left mouse to grab, scroll its distance, R to rotate, and right click to freeze. Check the second player sees these changes.
5. With the Tool Gun, test paint, remove, freeze and fading doors. F should restore collision automatically after six seconds. Z should remove only the owner's most recent prop.
6. Approach a purchasable door, C → Buy, share keys with another resident, then lock/open/sell. Verify an unrelated player cannot operate a locked door and you can enter the room when it is open.
7. Dealer → shipment → price in C → second player buys with E. Confirm both wallets, stock and inventory change once. Medic heals; Cook's microwave supplies meals.
8. Test firearm ammo/reload and wall occlusion. Mark a suspect wanted, arrest them, verify jail constraints, then release them. Issue a warrant and ram the appropriate door.
9. Verify local/OOC/group chat and mayor laws. Names containing `<`, `>` or quotes must display as text.
10. Buy a weapon and armor, spend ammunition, place/freeze/paint props, and lock a purchased door. Refresh, rejoin with the same browser identity, then gracefully stop/restart the server with the same `DATA_DIR`. Verify inventory, ammo, armor, cash, prop placement, paint, frozen state, shop stock and property keys remain. Check an offline owner's shop still pays the owner, and that offline shared keys can be revoked. Verify readable errors, graphics settings and no console exceptions. Normal removal, death rules and operator cleanup must still work.
11. Voice: Settings → Enable microphone → allow the browser permission → return to play → hold V. Another nearby resident should hear directional audio that fades with distance and stops at 28 metres. Test V release, menus, chat, blur, tab visibility, death, mute/unmute in Tab, mute all, volume and microphone off. Permission denial or a missing device must leave text/gameplay working and show a useful retry message.
12. Select a resident in Tab or aim at them and press C. Give cash and verify both wallets; repeat with a blocked view, distant/dead recipient and full wallet. As government, mark/clear wanted status, issue a warrant and grant a license with the appropriate job. Keep an amount or reason focused while the target renames, moves out of range or disconnects; drafts should survive updates, controls should match current permissions, and a replacement resident with the same name must not inherit the old menu's actions.

Persistence browser QA, September 7, 2026: an isolated production server retained a Civil Protection character's pistol (11/36 rounds), 100 armor and owned frozen shelf after a page reload/rejoin and after replacing the server process from its checkpoint. The shelf remained in the same place, equipped weapon and ownership matched, and the browser reported no console errors. Automated tests separately cover graceful shutdown, purchased inventory, shop stock, property keys, legacy migration and corrupt saves.

Resident-menu browser QA, September 7, 2026: an isolated production build transferred $125 (sender $1,375, recipient $1,625), marked a suspect wanted, issued a warrant and granted a license. Rapid submissions showed a cooldown notice and retained drafts. Names containing quotes and angle brackets displayed as text; a rename preserved the focused warrant reason. Movement disabled an out-of-range transfer without losing its amount, a job change removed government controls, and disconnect/replacement left the old menu unavailable. C targeting and resident mute worked. The resident form and player list fit at 1280×720 and 640×820 with no browser console warnings or errors.

City and account browser QA, September 7, 2026: an isolated production build converted a guest to a username/password account while retaining the same character ID, pistol (7/30), 60 armor, frozen shelf and locked Alder Court apartment 201. Page reload/resume retained that state. Replacing the server from its checkpoint and signing in from a separate browser storage origin with only username/password recovered the same belongings. Sign-out revoked the session without deleting ownership, and password sign-in worked again. The apartment rooms, shelf, property sign, staircase, avenue and shared lobby were inspected; the lobby menu offered door use without purchase or locking. Sign-in fits at 1280×720 and 640×820 and can scroll on shorter screens. No browser console warnings or errors were reported.

The 0.5 automated suite has 64 tests. New checks walk every room in all 24 apartments, climb all three floors, traverse each added business, enforce upper-floor property reach, preserve old door IDs and builds, keep loose props on the ground beyond the former map boundary before and after restoring a save, and exercise account recovery, duplicate/racing claims, session rotation, invalid credentials, bans, shutdown, request limits, corrupt saves and failed-checkpoint rollback. One local run hit the browser fetch API's blocked-port list when Windows assigned a test server an ephemeral port; the full rerun passed. The 0.5 isolated 100-client movement check kept all connections open for 15.01 seconds, delivered 12.99 updates/client/second, used 10.30 MiB/s outbound and measured 21.58 ms p99 event-loop delay. This remains a local diagnostic, not a production capacity guarantee.

### Reproducible browser voice lab

Run `node --import tsx scripts/voice-lab.ts`, then open `http://localhost:3175/voice-lab.html` and click **Run synthetic voice checks**. It uses disposable residents and a synthesized MediaStream, never `getUserMedia`, so it exercises the actual AudioWorklet → voice relay → PannerNode → output graph without accessing a person's microphone. It checks silence before PTT, received audio energy, individual mute, deafen, PTT release and track release. The loopback-only lab and its client are excluded from the production build/container. This does not replace testing two real microphones and devices for echo or network quality.

Chrome on Windows, September 7, 2026: the synthetic run captured 108 frames and played 108, with measured nonzero output (peak RMS 0.01757). The device context ran at 48 kHz and the transport at 16 kHz. All six browser audio checks passed. Automated voice tests also exercise 44.1 kHz capture. Voice crowd capacity and other browsers have not been measured.

Browser checks use the real browser. Automated tests additionally cover 80 concurrent connections, delta reconstruction, trusted proxy headers and operator authorization. Run `npx tsx scripts/load.ts 100 15` for an isolated local synthetic movement load check; it never targets production. A local September 2026 run held 100 connections for 15 seconds, delivered 12.93 updates/client/second, used 10.49 MiB/s total outbound traffic and measured 21.45 ms p99 event-loop delay. This is a reproducible diagnostic, not a real-player or production capacity guarantee. CI validates Node 22 and 24; graphical rendering depends on a WebGL2-capable browser and GPU.

0.5.2 tip jars: server tests cover exact wallet conservation, invalid input, self tipping, overflow, reach/occlusion, custody/death, purchase limits, offline payment and world replacement. A real two-client WebSocket test checks replicated donor/owner balances. Chrome review covers opening the amount form with E; narrow form and wider performance review remain outstanding.

Release validation: all 87 tests passed, typecheck/build and production HTTP smoke passed. Chrome verified the ceramic jar, E donation form, $25 debit ($1,520 to $1,495) and receipt naming the offline owner.
