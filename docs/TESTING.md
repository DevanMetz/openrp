# Testing

## Pendant distance fade

High-quality pendant illumination now fades smoothly from full intensity at 12 metres to zero at 18 metres before the light is hidden, replacing the abrupt distance switch. Low graphics still disables the extra illumination.

The actual City renderer fixture used a fixed interior camera and synthetic focus distances relative to the first spotlight. Chrome verified intensities 9.00 at 10m, 4.50 at 15m and 0.00 at 18m. This checks the distance response, not a walking-camera or exterior light-leak review. Build and production HTTP smoke passed. Local and undeployed.

## Cafe pendant illumination

Added two warm downward spotlights under the pendant diffusers, with soft cone edges, four-metre range and 512px shadow maps. Lights are enabled only on high graphics within 18 metres of each fixture. Existing ambient illumination keeps low graphics usable.

Chrome reviewed table illumination and furniture shadows, then switched City quality high → low → high and verified that the added lighting disappeared and returned. Fixture draw-call counters do not measure the additional shadow passes or GPU lighting cost; profiling remains outstanding. The short cones fit within the cafe seating area, but a separate exterior wall-leak review remains pending. Build and production HTTP smoke passed. Local and undeployed.

## Cafe pendant fixtures

Replaced the cafe's plain ceiling strips with two table-centred pendant fixtures: ceiling mounts, suspension rods, tapered metal shades and warm emissive diffusers. Other business ceiling fixtures retain their current design. The diffusers provide a visible glow, not additional room illumination or dynamic shadows.

Chrome reviewed one pendant and its table from the cafe interior, confirming connected mounting and shade/diffuser placement. Build and production HTTP smoke passed. Actual interior illumination remains a separate rendering improvement. Local and undeployed.

## Cafe furniture construction

Cafe chairs now have four legs, side braces, back supports and three wooden back slats instead of a single central leg and solid back. Tables retain their tops and stems with added cross feet and underside mounting plates. Existing wood/metal materials and static batching are reused.

Chrome reviewed the furniture from inside the actual cafe. The first table feet sat beneath the existing floor; their corrected height was reviewed again and the full cross base is visible. Final build and production HTTP smoke passed. These remain decorative furnishings; seating interaction and interior lighting improvements are outside this increment. Local and undeployed.

## Clock tower landmark detail

The tower now has four shared-material clock faces with quarter-hour numerals, minute ticks, metal rims and stone surrounds. Clock hands retain their existing decorative fixed time. Close-up review exposed the pyramid roof's diagonal alignment leaving tower corners uncovered; rotated the roof by 45 degrees and added an eave band to match the square walls.

Chrome verified the detailed front face, adjacent side face and corrected roof alignment from (5,26,-65). Final build and production HTTP smoke passed. The opposite faces use the same rotated geometry but were not separately viewed. Local and undeployed; no game-rule changes.

## Skyline side elevations and grounding

Distant buildings now have inward-facing east/west window planes in addition to their existing north/south windows. Selected roofs have modest setbacks and caps, using deterministic index variation without changing building placement. An elevated eastern-edge review exposed absent ground under the distant scenery; a two-triangle background plane now grounds that scenery beneath the playable ground surface.

Chrome verified side windows, roof setbacks and building bases meeting the background at camera (105,15,0), looking toward (188,22,0). The added ground changed this view from 17 calls/85,184 triangles to 18/85,186. Final build and production HTTP smoke passed. The background remains sparse and is decorative, not an expanded playable map. Local and undeployed.

## Combined visual-pass validation

At commit 44d5663, `npm run check` passed all 118 tests, typecheck, production build and production HTTP smoke. This validates the accumulated local gameplay and renderer changes against the existing automated suite; it does not establish full DarkRP parity.

Chrome additionally reviewed the actual City renderer from (3, 1.7, 48), looking toward (0, 2, 0), at 1100 × 760. Crossings, cafe awnings, trees, fountain and sky remained visible together. The view reported 84 calls/103,656 triangles, a scene observation rather than a GPU benchmark. Broad road areas and distant buildings still need visual development. An attempted elevated follow-up could not run after the browser tab closed; it remains unverified. Local and undeployed.

## Cafe awning geometry

Replaced the flat canopy, thick valance and raised stripe blocks with sloping cloth panels whose alternating stripes continue down the front edge. Two rough double-sided cloth materials support views from below; slim metal supports remain beneath the outer edges. Geometry still participates in static batching.

Chrome reviewed the Union Cafe awning at street level and from an elevated camera, verifying continuous top/front stripes. At the established street camera, calls changed from 62 to 63 and triangles from 93,014 to 92,918. Build and production HTTP smoke passed. Fabric weave, sag and weathering remain possible visual improvements. Local and undeployed; no collision changes.

## Brick course tiling

Brick and industrial masonry textures now use four bricks by eight courses per tile, replacing dimensions that clipped the bond at repeat boundaries. Half-bricks at opposing edges share their shade. Narrow bevel highlights and reduced color contrast soften the mortar treatment. The original 54 random draws are retained before drawing, preserving later city placement.

Chrome reviewed the Union Cafe facade close-up with aligned courses and matching edge bricks. The view also exposed awkward awning stripe geometry for a later pass. Final build and production HTTP smoke passed. No new materials or geometry; local and undeployed. Industrial facades still need dedicated review.

## Crossing placement correction

The north-side review revealed the thin paint was mostly hidden under the raised plaza. Moved that crossing from z=-3.5 to z=-6.2, wholly onto asphalt beyond the plaza edge at z=-4.5. Lane dashes now exclude crossing footprints as well as the square; this also removes a pre-existing dash overlapping the south crossing.

Chrome verified all seven north stripes are visible and the south crossing no longer has a lane dash through its centre stripe. Build and production HTTP smoke passed. Local and undeployed; markings are visual only.

## Road paint geometry and wear

Crossings and dashed lane markings now use planes one millimetre above the asphalt instead of raised boxes. A shared original cutout texture adds fine paint loss and irregular edges; an independent deterministic seed preserves city placement. Polygon offset helps prevent depth conflict with the road.

Chrome review at the crossing camera caught a regular diagonal chip pattern in the initial version. The revised irregular chips and softened edges were reviewed again. Calls stayed at 73 and triangles fell from 104,802 to 103,162. Final build and production HTTP smoke passed. Distant lane markings and moving-camera flicker remain unverified. Local and undeployed; no server collision changes.

## Road wear scale correction

Removed the broad sinusoidal wear from the repeating asphalt tile after review exposed its repetition. Broad color variation now uses vertex colors on a 48 × 48 subdivided ground plane at the former ground surface height, retaining the existing map extent and fine texture. Server collision rules are unchanged.

Chrome review at the same crossing camera showed less obvious broad repetition. Draw calls stayed at 73; triangles increased from 100,206 to 104,802. Build and production HTTP smoke passed. Fine texture tiling and distant road views still warrant review; this is not a GPU benchmark. Local and undeployed.

## Asphalt aggregate pass

Added fine light/dark aggregate and low-contrast periodic wear to the existing asphalt texture. Deterministic placement preserves city random values, and the existing material and geometry are reused. Chrome review at a road-level camera by the Union Square crossing showed grain in the foreground and legible crossing markings. Texture repetition remains visible across large road areas and needs a broader treatment.

Build and production HTTP smoke passed. This material-only increment remains local and undeployed; no frame-rate claim is made.

## Paving material detail

Outdoor paving now has restrained per-slab tint variation, painted bevel highlights/shadows and fine mineral grain. The procedural additions use deterministic coordinates and preserve the existing city random sequence. They reuse the existing texture, geometry and material.

Reviewed in Chrome at the Union Square street camera, 1100 × 760: slab edges and variation remain visible under sunlight and tree shadows. The scene remains at 75 calls/100,262 triangles. Build and production HTTP smoke passed. This is a local material improvement, not a citywide performance audit; undeployed.

## Atmosphere graphics settings

The game graphics setting now reaches the City renderer. Low quality uses one cloud-noise layer and hides/skips moving fountain droplets; high quality restores three layers and droplets. Spillways and impact rings remain visible in both modes.

The isolated City review switched high → low → high at 1100 × 760, reporting 75 → 74 → 75 draw calls. This fixture changes City effects only, not the game's separate shadow and pixel-ratio settings. Build and production HTTP smoke passed. No GPU speedup is claimed; high-resolution profiling remains outstanding. Local and undeployed.

## Sky atmosphere pass

The existing sky sphere now shades soft procedural cloud cover with slow drift, a horizon fade and a broad sun glow aligned with the directional light. The shader includes tone mapping and output color conversion, correcting the old gradient's missing output conversion. It uses the existing sky mesh with no new textures or geometry.

Reviewed at street level and an upward-facing 1100 × 760 camera in the actual City renderer; the shader compiled and displayed soft cloud boundaries without a visible seam in those views. Build and production HTTP smoke passed. GPU cost at high resolutions and low-quality settings still needs measurement; unchanged geometry does not imply unchanged rendering cost. Local and undeployed.

## Planter ground detail

Replaced the two Union Square planters' plain green bed surfaces with an original procedural soil texture and sparse low grass tufts, excluding the tree bases. Soil generation uses its own deterministic seed; grass positions do not consume the city's random sequence. Ground-cover triangles share one statically batched material.

Reviewed at the established tree close-up in the actual City renderer: 63 calls/95,202 triangles versus 62/94,794 before this pass. These camera-specific figures do not establish frame-rate performance. Build and production HTTP smoke passed. Local and undeployed; no collision or gameplay changes.

## Tree silhouette follow-up

Union Square trunks now taper into the canopy with slight position-dependent lean and a continuous flared base. Branches use gently curved, tapered geometry and attach to the trunk's revised centerline. Canopy placement and the city random sequence are preserved. Static batching remains in use.

Reviewed the actual City renderer at the previous bark camera. A separate base flare initially produced a seam; it was replaced with deformation of the trunk mesh and rechecked. The camera reported 62 calls/94,794 triangles versus 62/92,698 before this shape pass; this is a narrow scene comparison, not a frame-rate benchmark. Final build and production smoke passed. Local and undeployed; no collision or game-rule change.

## Dedicated bark visual pass

Tree trunks and branches now use their own procedural bark texture and subtle bump relief, rather than furniture wood. The texture introduces broken longitudinal ridges and flecks without consuming city random values. Close-up review in the actual City renderer exposed excessive striping in the first version; reduced contrast and relief and interrupted ridges were then reviewed again. Tree silhouettes and geometry remain unchanged, including the visible flat trunk tip, which needs a later geometry pass.

Final build and production smoke passed. This is a material review at one Union Square camera, not a full lighting/performance audit. No external assets or server changes; local and undeployed.

## Bench and wood visual pass

Added finer procedural grain and knots to the shared wood texture without consuming additional city random values. Union Square benches now have back supports, armrests, wider feet and seat fasteners using existing static geometry batching. Close-up review exposed the pre-existing seat/planter overlap; both benches moved 0.6 metres toward the square, leaving their frames clear of the planter.

Reviewed the actual City renderer in an isolated 1100 × 760 close-up before and after repositioning. Final build and production HTTP smoke passed. The shared wood texture also affects interiors and trees; those uses have not yet received a dedicated visual check. No server collision rules changed, and this work remains local and undeployed.

## Fountain visual pass

The Union Square fountain now has eight arcing spillways, 128 moving droplets, sixteen expanding impact rings and water normals updated with the surface waves. Spillways share merged geometry; droplets share one Points object and rings use instancing. Animation and droplet/ripple visibility stop beyond 60 metres. Explicit bounds preserve frustum culling for animated geometry.

Reviewed with the actual City renderer in an isolated 1100 × 760 browser fixture from street level and above the basin. Spillway endpoints and ripple placement were visually inspected. The fixture reported 72 render calls/97,054 triangles at the street camera and 52/96,962 above the basin; these are scene-specific observations, not FPS or whole-city performance benchmarks. Build and production smoke passed. Original procedural geometry only; no external assets, server rules or collisions changed. This pass is local and undeployed.

Session cleanup fixture follow-up: the actual UI class in a browser passed checks for clearing chat history/draft, closing chat, clearing contracts/inspection/resident/account caches and menu content, emptying/hiding contract labels, displaying entry after disconnect, and opening an empty next-session chat. This does not substitute for a complete account-switch network test.

## Session UI cleanup — local follow-up

Disconnect and the start of a new connection clear chat history/drafts, notices, menu content, contract entries/HUD text, weapon inspection, resident targets and cached player/snapshot/account UI state. Starting a connection also clears these when the previous socket is still closing. Message handlers ignore replaced sockets. The policy intentionally discards drafts on disconnect; menu navigation within a session still preserves them.

Build and production smoke passed after extracting the shared cleanup; typecheck passed after additionally clearing hidden contract label text. Browser account-switch/reconnect regression checks remain pending. This does not delete server saves or moderation logs, and has not been deployed.

## Direct messages — local implementation

Draft browser recheck: in an isolated 360 × 780 session, typed `Unfinished local message`, closed chat, opened Players → Morgan Vale → Message Morgan Vale. Chat reopened with the exact original text, LOCAL channel hint and preservation notice; selection did not send the draft. This resolves the pending browser recheck for the local-draft guard below. Cross-recipient PM drafts and disconnect/rejoin draft policy remain separate checks.

Draft preservation follow-up: clicking a resident's Message button now reopens a nonempty chat draft unchanged and explains that it must be sent or cleared before selecting a new recipient. This preserves both local text and an already-addressed direct message. Whitespace-only drafts can be replaced. Build and production smoke passed; this guard was inspected in code but its browser interaction has not yet been rechecked.

Recipient-selection follow-up: resident panels now provide a Message button outside the distance/custody-limited action fieldset. It opens chat with the resident's stable-ID address and a name-based `TO … · LOGGED` hint. An isolated 360 × 780 browser session selected Morgan Vale from Players, opened the addressed draft and sent a message; the sender copy named Morgan correctly. This was a functional browser check, not a comprehensive layout audit. The command/ID remains visible in the input; a dedicated composer and draft-preservation review remain UX work. Build and production smoke passed. Changes are local and undeployed.

Integration follow-up: a three-client WebSocket test exercises quoted-name sending and an ID-addressed reply. A nearby bystander receives neither; a later global message acts as an ordered delivery barrier. Persisted log tests verify recipient ID/name after reopening storage and absence of those fields on ordinary chat. All 28 network/observability tests passed. The live CLI test also verifies quoted sender/recipient labels and message text; all 13 observability tests and typecheck passed after that addition. Query documentation clarifies that `--player` currently filters the sender. Browser presentation remains pending; this supersedes the pending network/log/CLI checks below. No deployment occurred.

`/pm "Full Name" message` or `/pm player-id message` selects exactly one connected resident. Names without spaces may be unquoted; matching is case-insensitive and exact, with no prefix matching. Only sender and recipient receive the event. Self, missing, ambiguous and offline recipients are rejected; accepted messages share normal text limits/cooldown. Like other social text channels, PMs are allowed during death/custody. No offline queue exists.

Logs store the recipient ID/name once per accepted message, and the readable CLI identifies the recipient. The field guide, input hint and public privacy text explicitly describe moderation logging. The new Game test verifies quoted names/IDs, recipient isolation, one log per message, cooldown, malformed/missing/self targets and offline rejection. `npm run check` passed with 116 tests, build and production smoke. Real-client PM isolation, persisted recipient metadata, CLI output and browser presentation still need dedicated checks. All changes are local and undeployed.

## Text radio — local implementation

Browser follow-up: an isolated 360 × 780 session tuned to channel zero, sent a labeled radio message, switched off and received the expected rejection when attempting another transmission. Review exposed poor contrast over bright pavement; ordinary chat now has a translucent dark background and the narrow text size increased from 0.65rem to 0.75rem. The revised radio history and rejection notice were visually checked with clearance above the status panel. Build and production HTTP smoke passed. This supersedes the pending radio browser review below; long chat histories and other viewport sizes remain broader layout work. No production state was used.

Integration follow-up: three real WebSocket clients verify distant matching-channel delivery, exclusion of another channel, and immediate receive opt-out after `/channel off`; ordered OOC barriers make the negative delivery assertions meaningful. Persisted observability fixtures retain channel 0 and 100 after reopening storage and omit radio metadata from ordinary chat. All 26 network/observability tests passed. The CLI now displays radio frequencies, with an additional live CLI assertion for `[radio 0]`; all 12 observability tests passed after that change, as did typecheck. Browser radio controls/presentation remain pending. This increment does not change production game state or deploy the feature.

`/channel 0–100` selects a session-only text radio channel; `/channel off` disables sending and listening, and `/channel` reports tuning. Joining defaults to channel 1. `/radio message` reaches matching listeners independent of distance, with a channel-number label. The field guide explains open-channel access, logging and separation from proximity voice. Logs retain the radio channel number. Like existing group/local chat, text radio remains usable during death/custody; this is an explicit policy rather than a police-equipment permission.

The Game test covers default listeners, distant matching recipients, channel isolation, off, invalid tuning, channel zero, shared cooldown, empty messages and reconnect reset. `npm run check` passed with 113 tests, typecheck, build and production HTTP smoke. Dedicated real-client delivery, persisted log metadata and browser review remain pending; the feature is not deployed.

## Mayor broadcast — local implementation

Follow-up: a three-client WebSocket test verifies exactly one broadcast at distant positions, rejection after losing the Mayor role, and no log entry for that rejection. A persisted observability fixture verifies broadcast channel/player/text filters. All 24 network and observability tests passed. In an isolated 360 × 780 browser session, the command hint and submitted message worked; review led to a dark broadcast card and additional clearance above the status panel. The revised chat-history layout was visually checked. Final build and production smoke passed. This supersedes the pending dedicated checks listed below; production deployment remains pending.

`/broadcast message` produces a distinct server-wide chat event, input channel hint and field-guide entry. Authority uses the actual Mayor job, excludes death/custody, and shares existing chat rate/text limits. Accepted messages are logged once and the observability channel filter accepts `broadcast`.

The new Game test covers title-based impersonation, custody/death, case-insensitive command handling, global-event delivery, empty input, truncation and shared cooldown. `npm run check` passed with 110 tests, production build and HTTP smoke. Dedicated multiplayer network delivery, broadcast log-query and browser presentation checks remain pending. This feature is local and undeployed.

## Contract and notification layout follow-up

The contract card and notices now occupy one vertical feed, with the card first. At 360 × 780, the feed starts below the voice control; a live connection notice was visibly separated from both controls. Opening a menu hides the card, and closing it restores the active assignment. Entry/disconnected screens also suppress the card. This supersedes the earlier narrow notification-overlap finding below. Large notice bursts and short-height viewports remain to be reviewed.

The final build and production HTTP smoke passed. An earlier smoke attempt failed when Node fetch rejected a randomly allocated local port; the existing port-0 smoke harness passed on retry, and that intermittent harness issue remains unresolved. No server rules changed in this layout follow-up, and the full 109-test suite was not repeated after the prior HUD check. Changes remain local and undeployed.

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

Weapon inspection increment: npm run check passed all 90 tests, typecheck, build and production smoke. Tests cover permission, role-title spoofing, reach, obstruction, death/custody, shared cooldown, exact carried/pocketed ammunition and three-client report delivery. Chrome verified the resident button and timestamped report with a carried pistol (3/17) and pocketed SMG (12/40). Narrow report review and timed confiscation remain outstanding.

Evidence implementation: all 95 tests passed with typecheck/build/production smoke. Tests cover five-second timing, cancellation on reach/obstruction/authority/license/wanted/custody/death/disconnect, duplicate firearm ammunition conservation, capacity rejection, partial return, unauthorized return, saved restoration and duplicate-ID rejection. Real WebSocket clients observe seizure and return with exact loaded/reserve ammunition. Browser review recorded separately below.

Chrome verified five-second confiscation, evidence count 2, return receipt naming the resident, and immediate disabled count 0 after both firearms returned. The menu refresh fix was rebuilt and passed production smoke. Dedicated tool visuals, recipient evidence browsing and narrow layouts remain outstanding.

Owner evidence browsing: Chrome verified a held pistol (3 loaded/17 reserve), held SMG (12/40), eight free slots and return instructions in F4 Pocket. Build/typecheck and production HTTP smoke passed. This UI-only increment adds no server rules; the previous 95-test server suite remains the latest complete suite. Final spacing separates evidence from pocket contents; narrow layout review remains pending.

Narrow evidence review: Chrome at a 360×780 iframe viewport showed two cramped card columns. Catalog cards now use one column below 480px, including pocket, shop and held evidence cards. Verified the evidence heading, return-space count, instructions, and the expanded firearm card without clipped text. Build/typecheck and production smoke passed. Full eight-item pocket interactions, narrow police controls and ballots remain to be reviewed.

Scanner validation: the full existing 95-test check, build and production smoke passed after implementation. An additional targeted test passed for scanner loadout, legacy reconnect preserving pistol ammunition, aimed inspection and civilian permission rejection. Chrome verified original first-person geometry, labels and HUD controls. Third-person scanner grip and animation were not visually verified.

Scanner holstering fix: changing to another equipped item now interrupts an active confiscation and ends its progress indicator. Switching back cannot resume the old timer; reselecting the current item does not interrupt. All 97 tests, typecheck/build and production smoke passed. Third-person renderer inspection found equipment positioned independently of hands; scanner forearm attachment and grip review remain next.

Scanner grip pass: third-person scanner attaches to the right forearm with its grip anchored to the palm, and compensates arm/torso rotation to keep the display upright. Scanner stance uses one bent arm and a relaxed free arm. Chrome visual lab verified Police/Chief standing and crouched with pitch 0 and 0.7. Build/typecheck and production smoke passed. The lab reused older captions, so its displayed model-count/performance labels are not evidence for performance claims. Walking transitions, extremes of pitch and live scanning animation still need review.

Contract Game integration: all 106 tests, typecheck/build and production HTTP smoke passed. Added real-wallet/occlusion/lethal-damage payout checks, disconnect/job/custody refunds, saved-world interrupted-work refunds, pending earned payout restoration, and corrupt-price checkpoint rejection. Contract network/UI and hitman visual review remain outstanding.

Contract UI increment: full check passed all 107 tests. Real four-client tests verify funded request, assigned acceptance, customer cancellation/refund, outsider rejection and absent contract details on target/bystander clients. Chrome verified offer form, $500 debit, named participants, countdown, and funded offer clearing with refund. Final explicit-target selection change passed build/typecheck and production smoke. Narrow UI, browser hitman acceptance and settlement receipts remain pending.

Contract settlement receipts: successful refunds and payouts now notify the customer and hitman with target and amount. Full/missing wallets do not emit receipts until transfer succeeds. Receipts are online notices, not persistent transaction history; offline wallet settlement remains correct but offline notice delivery is not queued. All 109 tests, typecheck/build and production smoke passed, including delayed payout exactly-once receipt checks and recipient scoping for refund/payout.

Original Hitman outfit: charcoal short jacket, high-neck knit, lapels/pockets/buttons, dark glasses and earpiece. Chrome visual lab reviewed standing and crouched poses at pitch 0/0.7 on two appearance variants. Build/typecheck and production smoke passed. Reused lab captions are not valid model-count or performance evidence; no GPU performance claim is made. Extreme motion/weapon combinations remain unreviewed.
# Active contract HUD — local follow-up

The assigned hitman now sees a compact target, escrow amount and remaining-time card during play. It opens Contracts and disappears after cancellation. Reviewed in isolated, nonpersistent browser sessions at desktop size and in a 360 × 780 iframe; the narrow menu opened from the card and cancellation cleared both views. Temporary connection notices can overlap the card on narrow screens; notification stacking remains a layout follow-up. No production game state was used.

Validation: `npm run check` passed after the final HUD styling change, including the existing 109 tests, production build and HTTP smoke. This UI increment adds no server protocol or payment behavior. It is local and has not been deployed.
