# Architecture

## Authority and transport

`server/main.ts` owns HTTP, static files, WebSocket admission, rate limits and lifecycle. `Game` in `server/game.ts` owns players, transactions, jobs, entities, laws and Cannon physics. A client submits movement intent and named actions. It never submits authoritative position, cash, health, ownership, spawn coordinates or damage.

The server steps at 30 Hz and sends a full snapshot at 15 Hz. This is deliberately simple for a small community server. It is not a measured 32-player bandwidth or performance claim. State size grows with entity/player count; interest management and delta snapshots are potential later work.

```mermaid
flowchart LR
    A[Browser A: Three.js + UI] -->|Input and actions| S[Node game server]
    B[Browser B: Three.js + UI] -->|Input and actions| S
    S --> P[Cannon rigid bodies]
    P --> S
    S -->|Authoritative snapshots and events| A
    S -->|Authoritative snapshots and events| B
    S --> D[Atomic wallet file]
```

All messages are defined in `shared/types.ts`. The connection begins with `join`, followed by `welcome` (including a fresh or resumed bearer token) and a snapshot. A protocol number prevents a stale frontend from silently joining an incompatible server. Chat, notices, sound, lockpicking progress and bullet traces are transient events.

## Prediction and collision

`shared/movement.ts` provides the same movement integrator to the client and server. The client predicts unacknowledged fixed-step inputs, then replays them from the next authoritative player snapshot. Camera movement is damped to reduce visible corrections; large corrections snap to authoritative locations, including jail and respawn. Remote players and rigid bodies interpolate toward snapshots.

The server consumes one bounded movement intent per tick, regardless of the number of messages received. Stale input stops movement after 500 ms. `shared/map.ts` defines static world geometry, doorways and spawn positions. Closed doors participate in collisions and line-of-sight checks. `Cannon-es` handles dynamic prop gravity, contacts, rotations and sleeping. Player motion uses a simplified axis-aligned body; rotating props use their world-space AABBs for player/ray collision. Open door leaves are visual and are not rotating rigid colliders.

The Physics Gun uses a bounded velocity controller to pull an owned body toward an unobstructed point along the player’s view ray. Freezing turns the body static. Fading doors temporarily disable that prop's collision, then restore it on the server clock. This is not Source VPhysics or a general-purpose constraint editor.

## Economy and roleplay

Jobs and the shop catalog live in `shared/catalog.ts`; the client uses them to present options, while the server independently rechecks every transaction. A spawn must have valid space before cash is deducted. Shop transactions check stock, duplicate inventory, distance, role and price before money changes hands. There is no client-supplied custom item definition.

Votes record eligible connected identities and one ballot per identity. A majority of the original eligible roster must vote yes. Disconnects do not reduce the majority threshold; candidate disconnect cancels the vote. Role limits are rechecked when the vote completes. The one-process game loop makes these changes sequential.

Combat traces stop at walls, doors, entities or players. Ammo, reload timing, shot cooldown, spread, armor and death are server-owned. Tool access comes from the player's validated loadout. Written city laws are social rules; job permissions, warrants, lockpicks, arrests and printer confiscation are mechanical rules.

## Rendering and assets

`client/world.ts` generates the district with repeated architectural details and seeded canvas textures. Static geometry is merged by material to reduce draw calls. Buildings contain real empty ground floors. `client/entities.ts` generates prop meshes, lightweight animated residents and equipment. The renderer uses Three.js WebGL2, ambient/environment lighting, directional shadows, haze and tone mapping.

The DOM layer in `client/ui.ts` renders HUD and game menus. Player-controlled text is inserted through `textContent` or HTML escaping. Font files are bundled locally. Audio is generated through the Web Audio API after a user interaction. No remote model, texture or sound downloads are needed.

## Extending it

- Add job definitions and permissions together; never rely on hiding a client button.
- Keep map visuals and collision boxes synchronized. Add collision-only blocks for complex decorative geometry.
- Add entity size, visual and authoritative behavior together. Respect server and owner limits.
- Add tests around transactions, timers, permissions, visibility and reconnect behavior.
- Preserve protocol compatibility intentionally, or increment the protocol number on both sides.

Potential later work includes original richer art, multiple floors, player pushing/contacts, constraint tools, a map editor, moderation/authentication, spatial networking, voice, vehicles and persistent properties. None of those are represented as implemented systems in this release.
