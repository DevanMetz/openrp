# Ongoing DarkRP development

The active objective is comprehensive DarkRP feature coverage and the best practical visuals. This is an ongoing worklist, not a claim of feature parity or visual completion.

## Verified increments

- Legal controls: revoke search warrants and civilian gun licenses; wanted and warrant HUD countdowns; correct reason parsing for player-ID commands.
- Public demotion: chat and context-menu entry points, reasoned 20-second ballots, fixed electorate and majority threshold, five-minute role restrictions, reconnect-safe cooldowns and offline results. Police and Chief share their role restriction. Completed restrictions persist; pending votes are cancelled on restart.
- Voting interface: distinct demotion ballot, reason, threshold meter, eligibility state and countdown updates without rebuilding the menu every second.
- Characters: shaped shirts, collars, faces, hair and footwear; police caps/vests/rank details, chef hats/aprons, medical markings, suits and underworld accessories. Articulated knees, elbows and feet support crouching without squashing the model. Head pitch follows the player's gaze; walking uses interpolated movement instead of pulsing only on incoming snapshots.
- Character rendering: vertex-colored batches preserve moving joints while reducing draw calls. In a local 11-role review scene with labels hidden and no shadow pass, the old models used 242 calls / 19,242 triangles; the detailed models use 150 calls / 46,050 triangles. This is a draw-call reduction, not a full-game FPS or large-crowd benchmark. Unique labels/materials are released on model removal while shared surfaces remain reusable.
- City surfaces: branching trees with original cutout leaf clusters; cool/warm window textures with painted sky/roofline reflections and curtain edges. Opaque glazing and map collision remain unchanged. Same-camera Chrome review with shadows enabled measured 103 draw calls / 55,444 triangles / 39 textures, versus 105 / 57,844 / 37 before. Alpha-tested leaf overdraw still needs GPU profiling; these counts do not prove a frame-rate improvement.
- Physical firearms: drop a personal firearm from F4 Shop or `/dropweapon`, then pick it up with E. Loaded and reserve rounds travel with the object and persist across world replacement. Current job loadout equipment cannot be dropped. Duplicate inventory and blocked placement are rejected without consuming rounds or the firearm.
- Validation: 59 automated tests plus typecheck, production build and HTTP smoke checks passed September 7, 2026. Chrome verified chat submission, ballot presentation, the resulting demotion and firearm drop/pickup. See TESTING.md for limits of the browser coverage.

## Next work

1. Finish browser coverage of context-menu demotion and ballots at narrow widths.
2. Continue character polish: equipment grip/aim poses, transitions, clothing surfaces and distance-based detail. The first detailed model pass is implemented; large-crowd GPU costs and weapon poses still need dedicated visual review.
3. Continue foliage and window polish: wind motion, texture variation, distant leaf stability and GPU profiling. The initial branching foliage and window-surface pass is implemented; reflections are painted texture detail, not dynamic scene reflections.
4. Expand physical trading with pocket storage and explicit capacity and ownership rules. Dropped firearms, ammunition transfer, pickup and persistence are implemented.
5. Audit the upstream DarkRP modules against actual OpenRP behavior to track remaining base features separately from common server addons. Follow through on remaining systems, including social/job tools, building tools, entities and roleplay activities.
6. Continue city interiors, equipment animation, lighting and atmosphere, followed by player-visible performance checks and multiplayer regression coverage.

Production deployment is being prepared for these increments. Preserve the persistent production volume across releases. Vote and dropped-firearm schema changes use protocol 5; clients must refresh to match the server.
