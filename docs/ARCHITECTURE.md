# Architecture

## Authority and transport

`server/main.ts` owns HTTP, static files, WebSocket admission, rate limits and lifecycle. `Game` in `server/game.ts` owns players, transactions, jobs, entities, laws and Cannon physics. A client submits movement intent and named actions. It never submits authoritative position, cash, health, ownership, spawn coordinates or damage.

The server targets 30 Hz simulation and 15 Hz updates. Initial joins and five-second resyncs receive a full snapshot; other frames carry changed fields and removal IDs. Encoding is shared across recipients. Slow consumers receive a fresh snapshot after backpressure. No fixed player slot cap is enforced. Spatial interest management remains future work; traffic still grows with the number of moving players and recipients.

```mermaid
flowchart LR
    A[Browser A: Three.js + UI] -->|Input and actions| S[Node game server]
    B[Browser B: Three.js + UI] -->|Input and actions| S
    S --> P[Cannon rigid bodies]
    P --> S
    S -->|Authoritative snapshots and events| A
    S -->|Authoritative snapshots and events| B
    S --> D[Atomic world and inventory checkpoint]
```

Game messages are defined in `shared/types.ts`. The connection begins with `join`, followed by `welcome` (including a fresh or resumed bearer token and a separate ephemeral voice ticket) and a snapshot. A protocol number prevents a stale frontend from silently joining an incompatible server. Chat, notices, sound, lockpicking progress and bullet traces are transient events.

## Accounts and sessions

`server/accounts.ts` handles same-origin JSON `POST /api/account` registration, login and logout. Accounts add a unique normalized username and salted password hash to the existing profile. Optional guest credentials prove ownership when attaching an account to an existing character, preserving the profile ID used by every inventory, entity and property. Guest and account bearer tokens use separate browser storage keys. Neither plaintext passwords nor account hashes enter game replication, logs or browser storage.

Password hashing uses Node's asynchronous scrypt with N=32768, r=8, p=3, a random 16-byte salt and a 32-byte derived key, following an [OWASP scrypt configuration](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Comparisons use `timingSafeEqual`; unknown usernames still perform password work. There are two concurrent hash slots, a 4 KiB request cap, request timeouts and five-minute IP/username attempt limits. Origins, content type, username format and password length are checked server-side. Duplicate usernames and guest claims are rechecked after hashing. Bans and shutdown are checked again before mutation.

Registration, password login and logout rotate the bearer token and synchronously checkpoint the complete world before responding. Save failure restores the previous profile credential and account fields. A successful rotation closes the old game/voice session after detaching its identity, so a late socket-close event cannot disconnect its replacement. Account joins with revoked tokens fail explicitly instead of silently producing an empty guest. Accounts share the world's storage and backup lifecycle; no external identity provider or forgotten-password reset is implemented.

## Proximity voice

`server/voice.ts` handles a separate `/voice` WebSocket so audio congestion cannot block gameplay updates. A random ticket binds one voice socket to an active, admitted game identity. The server stamps the sender ID and forwards valid audio only to living, listening, unmuted residents inside a 28 metre sphere. Clients never choose recipients or report authoritative voice positions. Game disconnect and operator removal revoke the ticket and close audio. Origin checks, pending-join limits, a capture-rate allowance, hard flood limits, strict frame shape, sequence checks and backpressure apply independently of gameplay admission.

`client/voice-worklet.ts` resamples the microphone's native sample rate into 320-sample mono frames at 16 kHz. `shared/voice.ts` defines the versioned PCM16 packet format. `client/voice.ts` schedules short audio buffers with an initial 60 ms cushion and at most about 180 ms queued playback. Late bursts are discarded, not accumulated. Each active remote speaker gets a PannerNode with HRTF direction and linear distance attenuation, followed by a shared volume gain and compressor. Speaking indicators reflect recently received audio. Stale players, mute changes, death and disconnect cancel queued sources.

Microphone capture requires an explicit button press. Both the media track and worklet gate are disabled outside push-to-talk; disabling the mic stops all tracks. A generation counter also cancels permission requests that resolve after disconnect or cancellation. Menus, chat, key release, blur and hidden tabs stop transmission. Browser echo cancellation, noise suppression and automatic gain control are requested. Voice is not persisted or transcribed, has no wall occlusion, and is not end-to-end encrypted. PCM is broadly compatible but uses more egress than Opus; bandwidth limits still apply to crowded voice activity.

## Prediction and collision

`shared/movement.ts` provides the same movement integrator to the client and server. The client predicts unacknowledged fixed-step inputs, then replays them from the next authoritative player snapshot. Camera movement is damped to reduce visible corrections; large corrections snap to authoritative locations, including jail and respawn. Remote players and rigid bodies interpolate toward snapshots.

The server consumes one bounded movement intent per tick, regardless of the number of messages received. Stale input stops movement after 500 ms. `shared/map.ts` defines static world geometry, doorways and spawn positions. Closed doors participate in collisions and line-of-sight checks. `Cannon-es` handles dynamic prop gravity, contacts, rotations and sleeping. Player motion uses a simplified axis-aligned body; rotating props use their world-space AABBs for player/ray collision. Open door leaves are visual and are not rotating rigid colliders.

The Physics Gun uses a bounded velocity controller to pull an owned body toward an unobstructed point along the player’s view ray. Freezing turns the body static. Fading doors temporarily disable that prop's collision, then restore it on the server clock. This is not Source VPhysics or a general-purpose constraint editor.

## Economy and roleplay

`server/persistence.ts` validates and atomically replaces a versioned `world.json` checkpoint. The checkpoint contains credential-hashed profiles with saved character state, property state keyed by map door ID, city laws and complete entities. Legacy wallet-only profiles migrate on the first startup. A corrupt checkpoint aborts startup and never falls back to stale balances. Snapshot messages still contain only connected players and public world state; saved profiles and credential hashes never enter game replication.

The checkpoint format was introduced in 0.4.0. Legacy migration imports only data actually present in `profiles.json`; it cannot recover an older process's unsaved inventory or world objects after that process exits. Upgrades from an existing `world.json` restore the full checkpoint.

Normal disconnects save the character and release physics holds while retaining world ownership and shared keys. Rejoins restore inventory, ammo, vitals, position and active penalties with fresh input sequencing. A blocked saved position moves the player to spawn without changing inventory. Jobs respect current slot limits. Server startup recreates Cannon bodies with the saved rotations and static/dynamic state, using current map geometry for doors. Offline shop purchases credit the owner's saved profile, so stock and cash remain part of the same checkpoint. Held-body links, input queues, reloads, lockpicks and votes are transient; production does not accrue while the server is stopped.

Jobs and the shop catalog live in `shared/catalog.ts`; the client uses them to present options, while the server independently rechecks every transaction. A spawn must have valid space before cash is deducted. Shop transactions check stock, duplicate inventory, distance, role and price before money changes hands. There is no client-supplied custom item definition.

Votes record eligible connected identities and one ballot per identity. A majority of the original eligible roster must vote yes. Disconnects do not reduce the majority threshold; candidate disconnect cancels the vote. Role limits are rechecked when the vote completes. The one-process game loop makes these changes sequential.

Combat traces stop at walls, doors, entities or players. Ammo, reload timing, shot cooldown, spread, armor and death are server-owned. Tool access comes from the player's validated loadout. Written city laws are social rules; job permissions, warrants, lockpicks, arrests and printer confiscation are mechanical rules.

## Analytics and text logs

`server/observability.ts` receives explicit accepted-chat and successful-action hooks from the simulation. It records chat once before recipient fan-out and does not inspect raw incoming game or voice payloads. HTTP home-page counts retain referrer hostnames only. Connection bookkeeping accounts playtime by UTC day; a 60-second sample includes tick, event-loop, memory and game/voice traffic metrics.

Asynchronous five-second batches append private daily JSONL streams; daily aggregate files use atomic replacement. Read-only authenticated endpoints and `scripts/observe.ts` expose readable or JSON reports. The separate analytics key cannot invoke moderation commands. Retention, bounded queues/files, incomplete-data indicators and exact byte cursors are documented in [OBSERVABILITY.md](OBSERVABILITY.md).

## Rendering and assets

`client/world.ts` generates the district with repeated architectural details and seeded canvas textures. Static geometry is merged by material to reduce draw calls. The original nine buildings retain their ground-floor layouts. Four added apartment buildings have three traversable floors, shared stairs and six private units each. Each unit has three connected rooms; four new businesses also have partitioned ground floors. Room bounds, stairs, door heights and collision geometry come from the shared map. Property ownership remains keyed by stable door IDs, and new construction sits beyond the former city boundary to preserve old builds. `client/entities.ts` generates prop meshes, lightweight animated residents and equipment. The renderer uses Three.js WebGL2, ambient/environment lighting, directional shadows that follow the viewer into the outer neighborhoods, haze and tone mapping.

The DOM layer in `client/ui.ts` renders HUD and game menus. Player-controlled text is inserted through `textContent` or HTML escaping. Font files are bundled locally. Audio is generated through the Web Audio API after a user interaction. No remote model, texture or sound downloads are needed.

## Extending it

- Add job definitions and permissions together; never rely on hiding a client button.
- Keep map visuals and collision boxes synchronized. Add collision-only blocks for complex decorative geometry.
- Add entity size, visual and authoritative behavior together. Respect server and owner limits.
- Add tests around transactions, timers, permissions, visibility and reconnect behavior.
- Preserve protocol compatibility intentionally, or increment the protocol number on both sides.

Potential later work includes original richer art, player pushing/contacts, constraint tools, a map editor, account recovery, spatial game-state networking and vehicles. None of those are represented as implemented systems in this release.
