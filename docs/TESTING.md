# Testing

## Automated

Run `npm run check`. It runs strict TypeScript checks, Node's test runner through `tsx`, a production client build, and an HTTP smoke test of the built files. Tests use disposable worlds and storage; they do not modify a running player's wallet file.

Coverage includes:

- Fixed-rate movement despite excess input; malformed numeric input and ray slabs.
- Closed-door collision and passage into an actual building when open.
- Remote/unauthorized property actions, purchase, shared keys and resale.
- Role limits, elections, duplicate votes, job cooldowns and chief prerequisites.
- Printer purchase/production/collection/confiscation and shipment cash/stock transfers.
- Physics settling, freezing, ownership restrictions and fading collision restoration.
- Weapon damage, world occlusion, ammunition, reload timing, death and respawn.
- Wanted/arrest permissions, custody restrictions, release and lockpicking.
- Credential privacy, wallet reconnect, local/global chat delivery and text filtering.
- Real WebSocket clients sharing players, props, jobs and chat; cleanup on disconnect.
- Invalid JSON, origin restrictions, flooding, optional passwords and server status.
- Atomic wallet round-trip and refusal to load corrupt economy data.
- Voice frame validation and quantization; capture at 44.1/48 kHz with no packets outside push-to-talk.
- Real voice sockets: server-enforced range, dead-player suppression, individual mute, deafen and no self echo.
- Voice ticket admission/revocation, duplicate sockets, origin rejection, replayed frames, flood isolation and operator removal.
- Production worklet asset, same-origin microphone policy, and exclusion of the development voice lab.

## Browser checklist

1. Inspect the initial city and name-entry screen at desktop and narrow viewport sizes.
2. Join, return to play and capture the mouse. Verify WASD, look, sprint, crouch and jump. In embedded browsers that reject mouse capture, test right-drag look and Alt + left click alternate use.
3. Press F4. Apply for a non-voting job and confirm the HUD/loadout updates. With another resident, apply for Mayor and cast one vote per player.
4. Stand in clear space. Q → Shelving; press 2 for Physics Gun. Aim at the shelf, hold left mouse to grab, scroll its distance, R to rotate, and right click to freeze. Check the second player sees these changes.
5. With the Tool Gun, test paint, remove, freeze and fading doors. F should restore collision automatically after six seconds. Z should remove only the owner's most recent prop.
6. Approach a purchasable door, C → Buy, share keys with another resident, then lock/open/sell. Verify an unrelated player cannot operate a locked door and you can enter the room when it is open.
7. Dealer → shipment → price in C → second player buys with E. Confirm both wallets, stock and inventory change once. Medic heals; Cook's microwave supplies meals.
8. Test firearm ammo/reload and wall occlusion. Mark a suspect wanted, arrest them, verify jail constraints, then release them. Issue a warrant and ram the appropriate door.
9. Verify local/OOC/group chat and mayor laws. Names containing `<`, `>` or quotes must display as text.
10. Disconnect/reconnect and reload the page. Check wallet continuity, cleanup, readable errors, graphics settings and no console exceptions.
11. Voice: Settings → Enable microphone → allow the browser permission → return to play → hold V. Another nearby resident should hear directional audio that fades with distance and stops at 28 metres. Test V release, menus, chat, blur, tab visibility, death, mute/unmute in Tab, mute all, volume and microphone off. Permission denial or a missing device must leave text/gameplay working and show a useful retry message.

### Reproducible browser voice lab

Run `node --import tsx scripts/voice-lab.ts`, then open `http://localhost:3175/voice-lab.html` and click **Run synthetic voice checks**. It uses disposable residents and a synthesized MediaStream, never `getUserMedia`, so it exercises the actual AudioWorklet → voice relay → PannerNode → output graph without accessing a person's microphone. It checks silence before PTT, received audio energy, individual mute, deafen, PTT release and track release. The loopback-only lab and its client are excluded from the production build/container. This does not replace testing two real microphones and devices for echo or network quality.

Chrome on Windows, September 7, 2026: the synthetic run captured 108 frames and played 108, with measured nonzero output (peak RMS 0.01757). The device context ran at 48 kHz and the transport at 16 kHz. All six browser audio checks passed. Automated voice tests also exercise 44.1 kHz capture. Voice crowd capacity and other browsers have not been measured.

Browser checks use the real browser. Automated tests additionally cover 80 concurrent connections, delta reconstruction, trusted proxy headers and operator authorization. Run `npx tsx scripts/load.ts 100 15` for an isolated local synthetic movement load check; it never targets production. A local September 2026 run held 100 connections for 15 seconds, delivered 12.93 updates/client/second, used 10.49 MiB/s total outbound traffic and measured 21.45 ms p99 event-loop delay. This is a reproducible diagnostic, not a real-player or production capacity guarantee. CI validates Node 22 and 24; graphical rendering depends on a WebGL2-capable browser and GPU.
