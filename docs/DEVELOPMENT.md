# Ongoing DarkRP development

The active objective is comprehensive DarkRP feature coverage and the best practical visuals. This is an ongoing worklist, not a claim of feature parity or visual completion.

## Verified increments

- Legal controls: revoke search warrants and civilian gun licenses; wanted and warrant HUD countdowns; correct reason parsing for player-ID commands.
- Public demotion: chat and context-menu entry points, reasoned 20-second ballots, fixed electorate and majority threshold, five-minute role restrictions, reconnect-safe cooldowns and offline results. Police and Chief share their role restriction. Completed restrictions persist; pending votes are cancelled on restart.
- Voting interface: distinct demotion ballot, reason, threshold meter, eligibility state and countdown updates without rebuilding the menu every second.
- Characters: shaped shirts, collars, faces, hair and footwear; police caps/vests/rank details, chef hats/aprons, medical markings, suits and underworld accessories. Articulated knees, elbows and feet support crouching without squashing the model. Head pitch follows the player's gaze; walking uses interpolated movement instead of pulsing only on incoming snapshots.
- Character rendering: vertex-colored batches preserve moving joints while reducing draw calls. In a local 11-role review scene with labels hidden and no shadow pass, the old models used 242 calls / 19,242 triangles; the detailed models use 150 calls / 46,050 triangles. This is a draw-call reduction, not a full-game FPS or large-crowd benchmark. Unique labels/materials are released on model removal while shared surfaces remain reusable.
- City surfaces: branching trees with original cutout leaf clusters; cool/warm window textures with painted sky/roofline reflections and curtain edges. Opaque glazing and map collision remain unchanged. Same-camera Chrome review with shadows enabled measured 103 draw calls / 55,444 triangles / 39 textures, versus 105 / 57,844 / 37 before. Alpha-tested leaf overdraw still needs GPU profiling; these counts do not prove a frame-rate improvement.
- Integration: preserved the expanded district, 24 apartments, account sign-in and resident actions from the concurrent release. Legal chat commands share resident-action validation and cooldowns; the new resident panel includes demotion.
- Physical firearms: drop a personal firearm from F4 Shop or `/dropweapon`, then pick it up with E. Loaded and reserve rounds travel with the object and persist across world replacement. Current job loadout equipment cannot be dropped. Duplicate inventory and blocked placement are rejected without consuming rounds or the firearm.
- Validation: 75 automated tests plus typecheck, production build and HTTP smoke checks passed September 7, 2026. Chrome verified chat submission, ballot presentation, the resulting demotion and firearm drop/pickup. See TESTING.md for limits of the browser coverage.

## Next work

Local identity increment: custom roleplay titles through `/job` and F4 Jobs, displayed on the HUD, resident list, player context and overhead labels. Underlying job permissions, salaries and equipment are unchanged. Titles persist in character saves and reset with role changes, offline demotion and full-slot reconnect fallback. This increment is not yet deployed.

Local roleplay chat increment: `/w` and `/whisper` reach 5 metres; `/y` and `/yell` reach 56 metres; ordinary local chat remains 28 metres. Server distance includes height and uses the existing shared cooldown. Channel labels appear in chat and while composing; accepted messages are logged once with searchable whisper/yell channels. Text range passes through walls. This is not yet deployed.

Local increment after 0.5.1: eight-object pocket with C storage and F4 inventory/placement. Preserves ammunition, cash, health and paint; reserves stored prop quota; rejects foreign props, held/frozen/fading objects and businesses. Persistence validates bounds and unique IDs across pockets/world objects. Contents survive death, custody and job changes. Protocol 6 is required for the next release. This increment is not deployed yet.

1. Finish narrow-width ballot review. Resident-panel demotion submission is now verified in Chrome, including target, reason, recorded vote and majority threshold. Resident panels now include warrant and civilian license revocation.
2. Continue character polish: equipment grip/aim poses, transitions, clothing surfaces and distance-based detail. The first detailed model pass is implemented; large-crowd GPU costs and weapon poses still need dedicated visual review.
3. Continue foliage and window polish: wind motion, texture variation, distant leaf stability and GPU profiling. The initial branching foliage and window-surface pass is implemented; reflections are painted texture detail, not dynamic scene reflections.
4. Continue physical trading polish: pocket storage and placement are implemented locally. Add object thumbnails and narrow-screen review, and assess configurable death/arrest dropping against the server's intended economy.
5. Follow the first source-backed system audit in [DARKRP-COVERAGE.md](DARKRP-COVERAGE.md). Next substantive gameplay increments are tip jars, police weapon tools, contracts and missing social channels. Continue expanding the audit; it is not a complete specification or parity claim.
6. Continue city interiors, equipment animation, lighting and atmosphere, followed by player-visible performance checks and multiplayer regression coverage.

Released as 0.5.1 on September 7, 2026, commit `bfabc2d`, Railway deployment `3aa9ad7a-7044-47e1-b6a6-929a0c5d2bec`. GitHub CI passed on Node 22 and 24. The public health endpoint, version/protocol, Chrome entry screen and exact built JS/CSS bytes were verified. The same `/app/data` volume remains attached, with one replica, zero overlap and 30-second draining. Vote and dropped-firearm schema changes use protocol 5; clients must refresh to match the server.
