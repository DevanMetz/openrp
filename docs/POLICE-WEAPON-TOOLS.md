# Police weapon tools: next increment

Status: implementation plan after the 0.5.2 release candidate; not implemented.

The upstream [weapon checker](https://github.com/FPtje/DarkRP/blob/5abcf7abab9e489b2d882a55d95f84c206d9d05c/entities/weapons/weaponchecker/shared.lua) supports inspection, timed confiscation and returning stored weapons. Its filters depend on configuration. OpenRP should implement its own rules and original presentation.

## OpenRP rules to implement

- Police and Chief can inspect another living resident within 3 metres with clear line of sight. Show carried and pocketed firearms, loaded/reserve rounds and license status. Notify the searched resident. Results are a private event to the officer, not a global chat message.
- Confiscation requires a wanted unlicensed civilian and a five-second uninterrupted search. Pin the target ID at start; cancel on distance, occlusion, death, custody, role/authority change, license grant or target disconnect. Revalidate at completion. Do not take issued tools or job weapons.
- Preserve exact confiscated weapons and ammunition in bounded saved evidence belonging to the searched resident. Pocketed and carried instances can coexist: track separate items rather than a map keyed only by weapon type. Never overwrite earlier evidence.
- Return evidence through a nearby police interaction. Return each item only when capacity permits; preserve the remainder. If an identical firearm is already carried, use a safe world drop or leave that evidence pending. Never overwrite a resident's current ammunition.
- Arrest currently removes carried equipment and release restores the base loadout. Evidence must survive this cycle, death, role changes, reconnect and world replacement. Specify whether future arrest seizure feeds the same evidence storage before changing current arrest behavior.
- Keep weapon search distinct from a property warrant. A gun license does not grant police authority. Custom job titles never change permission.

## Build and verification

Start with inspection and its resident-context button, permission/range/occlusion tests and a real-client private-result test. Then add timed confiscation and saved evidence, with cancellation and exact conservation tests. Finish return/partial return, original tool presentation, browser review and migration validation. Advance the coverage table only for shipped behavior.

The current public snapshots include inventory fields for all residents. Private inspection results improve presentation but do not make inventories secret from modified clients. A separate replication/privacy change would be necessary before claiming that protection.

Inspection implemented locally after 0.5.2, including server authority/reach checks, exact carried/pocketed reporting, resident notification and timestamped context report. All 90 tests and browser report review passed. Timed confiscation, evidence persistence and return are still unimplemented; the remaining rules above remain the next scope.
