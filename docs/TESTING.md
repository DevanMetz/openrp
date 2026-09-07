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

Browser checks are manual; the repository does not claim an automated browser test suite or a 32-player stress test. CI validates Node 22 and 24; graphical rendering depends on a WebGL2-capable browser and GPU.
