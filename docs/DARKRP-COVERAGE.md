# DarkRP coverage audit

Reviewed September 7, 2026 against OpenRP `1e1a400` and upstream DarkRP `5abcf7abab9e489b2d882a55d95f84c206d9d05c`. This is a first system audit, not a parity certificate. Follow-up review covers local work through `33544d3` and the subsequent mayor-broadcast change. Production remains 0.5.2; police inspection/evidence, contracts and broadcasts described here are local additions.

## Evidence and scope

The upstream [module tree](https://github.com/FPtje/DarkRP/tree/5abcf7abab9e489b2d882a55d95f84c206d9d05c/gamemode/modules) and [entity/weapon tree](https://github.com/FPtje/DarkRP/tree/5abcf7abab9e489b2d882a55d95f84c206d9d05c/entities) identify base systems to investigate. A directory's existence establishes a subsystem, not its complete behavioral specification. Detailed implementation work must read that subsystem's rules before claiming coverage.

OpenRP evidence comes from `shared/types.ts` and `shared/catalog.ts` (supported jobs, objects and messages), `server/game.ts` (authoritative rules and commands), `server/persistence.ts`, `server/main.ts`, the client UI/renderers, and the tests. An implemented label means a working OpenRP counterpart exists, not that every upstream option, hook or edge case is reproduced.

Common server addons and Source/Sandbox functionality remain part of the broader investigation. They must be tracked separately so implementing a base module is not mistaken for implementing every server's addons. No percentage-complete estimate is justified yet.

## Gameplay findings

| Area                | Current evidence                                                                                      | Remaining work                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Jobs and elections  | Twelve catalog roles, salaries, equipment, role limits, majority ballots and persistent demotion bans | Audit upstream job configuration, agendas, role-specific permissions and additional roles     |
| Identity            | Persistent accounts, roleplay names and custom titles; titles do not change job authority             | Additional identity/social tools and configurable restrictions                                |
| Local chat          | Local, whisper, yell, actions, OOC, group, mayor broadcasts, tuned text radio and paid advertisements; authoritative delivery and logs    | Private messaging; browser/network and log-metadata review of text radio                                  |
| Police              | Wanted/warrants, custody, ram, licenses, laws, targeted scanner inspection and timed confiscation with persistent evidence/returns         | Stunstick behavior, wider police-rule comparison and additional scanner animation review |
| Property            | Purchasable doors, shared keys, lock/open, rename and resale; apartments and public stairs            | Upstream ownership groups, administration and additional door-policy options                  |
| Trading             | Shipments, adjustable prices, direct money, loose firearms with ammunition and pocket storage         | Recipient-bound cheques and additional shop types                                   |
| Illegal economy     | Printer purchase, periodic income, collection, health and police confiscation                         | Printer lifecycle/fire behavior and other original illegal-production counterparts            |
| Food and medicine   | Hunger, meals, microwave stock/production and medical-kit healing                                     | Food variety and fuller upstream medic/hunger behavior comparison                             |
| Combat              | Three firearms, ammunition/reload, armor, damage and respawn                                          | Wider original weapon roster and better aiming/reload poses              |
| Contracts           | Funded offers, acceptance, expiry/cancellation refunds, assigned-kill payouts, cooldowns, atomic saves, private menus/HUD and original Hitman outfit         | Broader multiplayer browser scenarios, settlement history/presentation and upstream option comparison                                       |
| Hobo activities     | Hobo job, ordinary prop building and basic tip jars with offline wallet payments                      | Further role activities and donation presentation                                             |
| AFK and sleep       | No player AFK/sleep state or commands; physics sleeping is unrelated                                  | Player state, presentation, input restrictions and economy policy                             |
| World communication | Laws menu and map signage                                                                             | Player-authored letters, notices and billboards                                               |
| Administration      | Authenticated operator kick/ban/unban/cleanup and private observability                               | Broader permissions, in-game moderation workflow and upstream FAdmin/FPP comparison           |
| Building            | Seven props, Physics Gun, Tool Gun, freeze, paint, fading and undo                                    | Wider construction tooling, constraints, precision placement and duplication workflows        |

Specific upstream checks: [chat declarations](https://github.com/FPtje/DarkRP/blob/5abcf7abab9e489b2d882a55d95f84c206d9d05c/gamemode/modules/chat/sh_chatcommands.lua) include private messages, mayor broadcasts and radio selection/speech. [Money declarations](https://github.com/FPtje/DarkRP/blob/5abcf7abab9e489b2d882a55d95f84c206d9d05c/gamemode/modules/money/sh_commands.lua) include recipient-bound cheques. The [hit module](https://github.com/FPtje/DarkRP/blob/5abcf7abab9e489b2d882a55d95f84c206d9d05c/gamemode/modules/hitmenu/sh_init.lua) defines designated hitman jobs, requests, prices, active targets and cooldown constraints. [Tip-jar communication](https://github.com/FPtje/DarkRP/blob/5abcf7abab9e489b2d882a55d95f84c206d9d05c/gamemode/modules/tipjar/sv_communication.lua) checks donation distance, affordability and ownership and distributes donation updates. OpenRP now has tip-jar, hit-contract and mayor-broadcast counterparts. Private messages and recipient-bound cheques remain missing. Text radio now has a local counterpart with session tuning, an off setting and channel-scoped delivery.

## Visual findings

The character, foliage and glazing passes improve the current city, but their measurements are limited to the scenes recorded in TESTING.md. They do not prove the expanded city is optimized or visually complete.

Outstanding work includes equipment grip/aim/reload motion; richer clothing and material detail; interiors and reusable street props; pocket object thumbnails; foliage motion and distant stability; lighting/atmosphere; and repeatable GPU measurements with crowds and the expanded district. Narrow HUD/menu checks must cover ballots, title editing and full pockets. Source assets should not be extracted to fill these gaps; new assets must remain original or appropriately licensed.

## Next implementation sequence

1. Tip jars implemented for 0.5.2: original prop, amount form, authoritative payment checks and offline persistence. Continue donation presentation and narrow-screen review.
2. Police weapon searching/confiscation implemented locally with custody/inventory tests, persistent evidence, scanner and menus; continue tool animation and broader scenario review.
3. Hit contracts implemented locally with escrow, interruption settlement, persistence, private participant delivery, role/menu/model and active HUD; continue browser lifecycle coverage.
4. Mayor broadcast browser/network/log checks passed. Text radio has authoritative tuning/delivery and focused tests; complete its network/browser/log review, then implement private messages with explicit recipient handling and accurate log/privacy wording.
5. Continue the visual backlog in parallel across subsequent increments; verify each change in the actual game and retain performance baselines.

For each system, completion requires server rules, usable UI, world/character representation where relevant, reconnect/persistence behavior, multiplayer verification and browser review. This sequence does not remove the other gaps from the active objective.
