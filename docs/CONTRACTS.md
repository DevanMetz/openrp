# Contract implementation status

The first server lifecycle core is in `server/contracts.ts`; it is not connected to live Game actions, wallets, saves or UI yet. No contract can currently be created in the running game.

The core reserves money for a 30-second offer, allows only the designated hitman to accept, expires an accepted contract after ten minutes, and settles by refund or payout. Requests cost $250–$50,000 and require three distinct available residents, a real hitman and a nearby customer. Customers receive a five-minute request cooldown; a completed target receives a five-minute cooldown. Only the assigned hitman's kill pays. Other deaths, expiry, cancellation or participant departure refund. Full/missing wallets retain pending escrow rather than lose or redirect it.

Next integration requirements:

1. Add a hitman job and original character presentation. Wire live/saved resident adapters with write-through money access, authoritative role/life/custody checks and three-metre unobstructed request reach. Never pass copies of wallet balances.
2. Save contracts, pending settlement and cooldowns in the same atomic world checkpoint as wallets. Validate IDs, owners, prices, timestamps, status, participant uniqueness, counts and cooldown bounds. Preserve escrow on reload; cancel interrupted offers/contracts into refunds without losing pending payouts. Legacy saves default to empty contract state.
3. Hook requests/acceptance/cancellation to server actions; hook actual damage deaths, disconnect, role change, custody and tick expiry. Test actual Game wallets and saved restore before making the actions available to clients.
4. Deliver contract status only to relevant participants; existing global inventory replication does not establish privacy for a new contract system. Add customer request form, hitman offers and active-target presentation with explicit timers and cancellation/refund wording.
5. Exercise real clients, duplicate requests, full wallets, restart while funded, job-change/death/disconnect races, and browser interaction. Add original hitman/tool visuals and review narrow layouts.

Reference: the pinned [upstream hit module](https://github.com/FPtje/DarkRP/blob/5abcf7abab9e489b2d882a55d95f84c206d9d05c/gamemode/modules/hitmenu/sh_init.lua) checks hitman teams, request distance, affordability and cooldowns. OpenRP's escrow and deadlines are its own rules, not a claim of exact upstream parity.
