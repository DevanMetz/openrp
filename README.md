# OpenRP

**An open-source multiplayer city sandbox inspired by Garry’s Mod DarkRP, built with Three.js.**

Choose a job, buy a storefront, sell weapons or meals, hide money printers, build with physics props, become mayor, or patrol the city as Civil Protection. Everyone plays in the same server-owned world.

OpenRP is a playable **0.5 alpha**, not a complete Source engine port. All map geometry, characters, equipment, textures, and game sound effects are original and generated locally. No Garry’s Mod installation, extracted Valve assets, external asset CDN, API keys, or paid services are required to run your own server.

## Run it

Install **Node.js 22.12 or newer** (Node 24 recommended), then:

```sh
git clone https://github.com/DevanMetz/openrp.git
cd openrp
npm ci
npm run dev
```

Open **http://localhost:3000**. Create an account with a username and password, or choose **Guest** and enter a roleplay name. Then select **Return to the streets**. The server and Vite run together on one port.

For a production build:

```sh
npm run build
npm start
```

For Docker:

```sh
docker compose up --build
```

### Play with friends

On your LAN, friends open `http://YOUR-COMPUTER-LAN-IP:3000`. The server binds to `0.0.0.0` by default. Allow the chosen TCP port through your firewall if needed. `localhost` always points to the viewer’s own computer, so send your actual LAN IP to friends.

For internet play, run the Node server on a host that supports long-lived WebSockets and put HTTPS in front of it. Forward `/ws` and `/voice` upgrades to the same server as the page. Voice needs HTTPS or localhost; a plain HTTP LAN address can play the game but cannot access the microphone. Static hosts such as GitHub Pages alone cannot run the multiplayer server. See [hosting and configuration](docs/HOSTING.md).

To test two identities yourself, use two different browsers or a private window. Guest and account sessions keep separate browser credentials. Signing into an account on another browser moves that character to the new session.

## What works

| System      | Implemented behavior                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiplayer | Real WebSockets, 30 Hz server simulation, 15 Hz snapshots, client movement prediction, interpolated players and props, no player slot cap; compact delta updates                      |
| City        | Expanded Union District: 17 buildings, four neighborhoods around the original square, 24 three-room apartments on three walkable floors, and four new businesses with connected rooms |
| Movement    | First-person mouse look, WASD, sprint, crouch, jump, gravity, shared world collision, browser mouse-capture fallback                                                                  |
| Jobs        | Citizen, Civil Protection, Gangster, Mob Boss, Gun Dealer, Medic, Police Chief, Mayor, Hobo, Cook, Thief; limits, loadouts, salaries and job cooldowns                                |
| Elections   | Public elections and reasoned demotion votes; fixed electorate, majority required, one vote per identity; five-minute demotion bans persist                                           |
| Property    | Buy and sell doors, lock/unlock/open, rename your property, share and revoke keys, up to three properties per player                                                                  |
| Building    | Seven prop types, server-side Cannon rigid-body physics, Physics Gun grab/rotate/distance/freeze, Tool Gun freeze/remove/paint/fading doors, undo and cleanup                         |
| Economy     | Salaries, saved wallets, money printers, cash drops, direct cash transfers, food, hunger and armor                                                                                    |
| Businesses  | Job-restricted weapon shipments and microwaves, adjustable sale prices, stock, purchases that pay the owner, recurring meal production                                                |
| Equipment   | Keys, Physics Gun, Tool Gun, pistol, SMG, shotgun, arrest/unarrest batons, lockpick, medical kit and battering ram                                                                    |
| Combat      | Server raycasts, line-of-sight checks, shotgun spread, ammo, timed reloads, armor, damage, death, cash loss and respawn                                                               |
| Law         | Wanted status, arrests and timed jail, release, search warrants, door ramming, printer confiscation, gun licenses, mayor laws and lockdowns                                           |
| Social      | Nearby chat, global OOC, advertisements, roleplay actions, job/group chat, names and scoreboard                                                                                       |
| Voice       | Hold V to talk within 28 metres; positional stereo audio, distance fade, explicit microphone consent, individual mute, mute all, independent volume and server-enforced proximity     |
| Interface   | F4 jobs/shop/laws, Q build menu, C context actions, F1 guide, minimap, role-colored HUD, equipment selection, settings and procedural audio                                           |

### Accounts and apartments

Accounts need **only a username and password**: no email, payment or external identity provider. Usernames are case-insensitive, 3–24 characters, and use letters, numbers, dots, underscores or hyphens, starting with a letter or number. Passwords or passphrases are 15–128 characters. Use **F4 → Account** while playing as a guest to attach that character's existing belongings to an account. Sign in with the same account on any browser to recover inventory, ammunition, cash, props, businesses and property. Signing out keeps those belongings saved. Only one live session can use an identity.

Guest play remains available and reconnects through its saved browser credential. Clearing that credential loses access to an unclaimed guest; create an account first. There is no email or automated forgotten-password recovery. Accounts belong to the server you join, so a different independently hosted server has its own accounts and world.

Find **Alder Court** and **Mercer Court** in West Alder, and **Linden House** and **Canal House** in Canal Quarter. Each building has six independently purchasable apartments, two on each of three floors, with a living room/kitchen, bedroom and bathroom. The shared lobby and stairs stay public; private unit doors can be bought, locked, renamed and shared. North Market and the Foundry sit in Foundry Ward; South Studio and South Bakery are in Southbank. Each new business has a front room, workshop and back office. The original buildings keep their footprints and door IDs so existing homes and builds survive the expansion.

### Private analytics and chat logs

Operators can read live population, daily joins and returning identities, connected playtime, peak population, popular jobs, purchases and server performance. All accepted text-chat channels are searchable by player, date, channel or message. Logs stay on the private server volume for 30 days; voice audio is never recorded.

On the configured owner's workstation, run `npm run analytics -- --days 7` or `npm run chatlogs -- --limit 100`. A separate read-only key cannot moderate players. See [analytics access, definitions and retention](docs/OBSERVABILITY.md) to configure your own host or read structured JSON.

### Default economy

New players start with $1,500 to make the initial sandbox easy to explore. Salaries pay every 60 seconds. A $1,000 printer produces $100 per 30 seconds, with a $5,000 collection cap. Door prices range from $100 to $350; resale returns 65%. Jail lasts 60 seconds. Edit `.env` and [the catalog](shared/catalog.ts) to rebalance your server.

## Controls

| Key                              | Action                                                            |
| -------------------------------- | ----------------------------------------------------------------- |
| WASD / mouse                     | Move / look                                                       |
| Shift / Ctrl / Space             | Sprint / crouch / jump                                            |
| E                                | Use a door, printer, shipment, microwave or cash pile             |
| C                                | Actions for the resident, property or object under your crosshair |
| F4                               | Jobs, purchases, laws and voting                                  |
| Q                                | Props and Tool Gun modes                                          |
| 1–9 / mouse wheel                | Select equipment                                                  |
| Left / right mouse               | Primary / alternate equipment action                              |
| R                                | Reload; rotate a held physics prop                                |
| Hold left mouse with Physics Gun | Grab your prop; release to drop                                   |
| Right mouse while grabbing       | Freeze prop                                                       |
| Mouse wheel while grabbing       | Adjust hold distance                                              |
| F / Z                            | Activate your fading doors / undo your last prop                  |
| Y or Enter                       | Open chat                                                         |
| Hold V                           | Proximity voice after enabling the microphone in Settings         |
| Tab / F1 / Escape                | Scoreboard / field guide / pause                                  |

Some embedded browsers disallow Pointer Lock. OpenRP then uses **hold right mouse and drag to look**, with **Alt + left click** for alternate use. A normal desktop Chrome, Edge or Firefox window is recommended for captured first-person controls. Menus do not pause a multiplayer server.

Select a resident's name in **Tab**, or look at them and press **C**, to give cash or use government actions. Transfers require a living recipient within 3.5 metres and a clear view, and accept whole dollars up to $50,000. A full recipient wallet rejects the transfer without deducting cash. Government menus show wanted status, warrants and gun licenses, with actions limited to your current job. Names and permissions update while the menu is open; typed amounts and reasons survive name or status updates. Menus use the selected resident's identity, so a different person reusing their name must be selected again.

### Proximity voice

Enable your microphone in the pause menu or Settings, allow the browser permission, return to the streets and **hold V**. Release V to stop. Nearby voices come from each player's direction and fade to silence at 28 metres. Text chat still works without microphone permission. Use **Tab → Mute** for an individual resident, or **Mute all voice** in Settings. Voice volume is separate from game effects. Headphones help prevent echo.

The microphone starts off on every join. Opening menus or chat, losing focus, hiding the tab, death, disconnecting or releasing V stops transmission. **Turn microphone off** releases the device entirely. No voice recording or transcription is stored by the game. Audio is relayed through the game host to eligible nearby listeners; this is transport-encrypted over HTTPS/WSS, not end-to-end encrypted. Other players can hear and independently record what you say. The proximity radius goes through walls; wall occlusion is not simulated.

### Useful chat commands

```text
/ooc Hello, everyone
/me checks the storefront
/advert Fresh meals at the café
/g Meet at the police station
/rpname Alex Citizen
/give 100
/dropmoney 100
/dropweapon
/demote Full Player Name reason
/wanted Full Player Name reason
/unwanted Full Player Name
/warrant Full Player Name reason
/unwarrant Full Player Name
/license Full Player Name
/unlicense Full Player Name
/addlaw Keep firearms holstered in the square.
/removelaw 1
/resetlaws
/lockdown reason
/unlockdown
```

To hand over a personal firearm, equip it and use `/dropweapon` or **F4 → Shop → Drop firearm**. Anyone nearby can pick it up with **E**, retaining its loaded and reserve ammunition. Equipment supplied by your current job cannot be dropped.

`/demote Full Player Name reason` (or C on a player → Request demotion) opens a 20-second public vote. More than half of the residents connected at the start must vote yes, including the requester’s automatic yes. The target may vote; late arrivals cannot. A passed vote returns the target to Citizen and blocks the former role for five minutes (Civil Protection and Chief share this restriction). Custody, property and ordinary props remain; job-specific shop stock is removed as with a normal job change. Disconnecting does not cancel a demotion; completed bans and request cooldowns survive reconnects and server restarts. Pending votes are cancelled by a server restart.

`/give` uses the nearby player under your crosshair. Government commands enforce job permissions on the server. Full names with spaces work without quotes. Job aliases (`/citizen`, `/cp`, `/gundealer`, `/medic`, `/mayor`, etc.) use the same rules as F4.

## Scope and fidelity

The mechanics aim to capture the recognizable DarkRP loop, but this is an independent implementation. Union District is an original map, not `rp_downtown` or `rp_evocity`. Character rigs and collisions are simplified. All three floors of the four new apartment buildings are playable; upper stories of the original buildings and businesses remain scenery. The alpha does not include Source/BSP/Lua compatibility, Workshop addons, vehicles, ragdolls, welded constraints or wire systems. Operators have authenticated kick/ban commands; a full admin UI and forgotten-password recovery remain future work. Physics Gun manipulation is owner-only. Police need a wanted flag before using the arrest baton. Gun licenses and most written laws are social roleplay rules rather than a complete legal simulation.

Names, wallets, inventory, ammunition, armor, position, props, shop stock, printer cash and property ownership persist together in `data/world.json`. Refreshing or restarting the server keeps your belongings; sign into your account or use the same guest browser identity, and keep the server's data directory on persistent storage. Props retain their placement, rotation, paint and frozen state. Shops stay open while their owner is offline and sales credit the saved wallet. Jobs resume when a slot is available; a full job returns you as a Citizen with your inventory. Normal gameplay can still consume, destroy or remove items, and operator removals still clean up owned objects. Accounts save a salted password hash and can recover their character across browsers. Guest access depends on its browser bearer credential. The server enforces bounds, prices, ownership, role restrictions and request limits, but this alpha has not been audited or load-tested for a large hostile public server.

Full-world persistence starts with **0.4.0**. Earlier versions saved names, wallets and credentials only. Upgrading imports those saved profiles, but cannot recover inventory, props or property held only in an old server process after it stops. The official first 0.4.0 upgrade preserved saved wallets; no pre-upgrade world snapshot was available. Subsequent updates restore the full `world.json` checkpoint. See [persistence and upgrades](docs/HOSTING.md#persistence).

## Development

```sh
npm run typecheck
npm test
npm run build
# All required checks:
npm run check
```

The test suite exercises the game rules and real multi-client WebSocket connections, including trading, collision, reconnect persistence, elections, police mechanics, malformed messages and origin/password enforcement. [Manual browser QA](docs/TESTING.md) covers the graphics and input paths.

```text
client/    Three.js rendering, procedural assets, input, audio and DOM interface
server/    HTTP/WebSocket host, authoritative game rules, Cannon physics, wallet storage
shared/    Map collision, movement, jobs, items and network types
tests/     Node test runner: rules, persistence, and real WebSocket integration
docs/      Architecture, deployment, testing and fidelity notes
```

To add jobs or entities, start in `shared/catalog.ts`. To extend the city, edit `shared/map.ts` and `client/world.ts` together so visuals and collisions stay aligned. Keep all balance-changing decisions on the server. See [architecture](docs/ARCHITECTURE.md) and [contributing](CONTRIBUTING.md).

## Credits and license

OpenRP code and original procedural assets: **MIT**, copyright Devan Metz. See [LICENSE](LICENSE).

- [DarkRP](https://github.com/FPtje/DarkRP) by FPtje and contributors is the gameplay reference. No DarkRP Lua source was copied into this project.
- [Three.js](https://threejs.org/) — MIT.
- [Cannon-es](https://github.com/pmndrs/cannon-es) — MIT.
- [ws](https://github.com/websockets/ws), [Vite](https://vite.dev/), [tsx](https://tsx.is/) — MIT.
- Barlow and Barlow Condensed by Jeremy Tribby, distributed locally through Fontsource — SIL Open Font License 1.1. Their licenses are included in the dependency packages.

Garry’s Mod, DarkRP, and Valve names identify the inspiration. OpenRP is not affiliated with their creators.
