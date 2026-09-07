# Contributing

OpenRP is a small TypeScript game. Issues, bug fixes, original assets, new props and improvements to the roleplay systems are welcome.

1. Fork the repository and create a branch for a focused change.
2. Run `npm ci` and `npm run dev`.
3. Put authoritative rules in `server/game.ts`; share collision and movement in `shared/`.
4. Run `npm run check`. Add regression tests for changes to game rules, permissions, money or networking.
5. Test graphical or input changes in a desktop browser. Include a screenshot and the steps you tried in the pull request.

Use existing jobs, map and item definitions before introducing a new framework. Public network messages are untrusted: validate at the server boundary. Never accept client-supplied balances, damage, world coordinates or ownership as authoritative.

New art must be original or clearly licensed for redistribution. Include attribution and the license for external assets. Do not submit extracted Valve/Garry’s Mod models, sounds, textures or proprietary map files.

Keep `data/`, `.env`, credentials, logs, generated builds and `node_modules/` out of commits. Describe incomplete behavior plainly. By submitting code, you agree to make your contribution available under this repository’s MIT license.
