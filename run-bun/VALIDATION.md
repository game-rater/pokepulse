# Automatic adapter validation

Test environment: mGBA 0.10.5, Windows x64, supplied Run & Bun 1.07 ROM. Tests used isolated copies under `Human Testing/isolated`; original ROM, save and save state were preserved.

## Verified against live gameplay

- Attaching the integration after loading an existing save state, without patching the ROM or changing the save.
- Automatic battle detection: Turtwig Lv10 (31/31 HP) versus Gossifleur Lv2; later Turtwig versus Seedot Lv2.
- Battle exit after escape: the result becomes null and the overlay shows waiting for a battle despite old battler records persisting in memory.
- Active species, level and HP matched the visible battle screen. Actual stats, moves, PP and ability IDs were decoded from the active records.
- Absorb lowered Seedot from 13 to 4 HP; Absorb PP changed from 25 to 24. A second Absorb changed PP to 23, Seedot HP to 0, and the matchup score to 100. The battle subsequently exited and the overlay cleared.
- Pausing mGBA stops captures. After four seconds the result becomes null and the overlay displays a paused/disconnected message.
- Restarting the server at the same installation path reconnects to the loaded script without restarting the ROM.
- Controlled tests retained/restored an in-memory checkpoint in the isolated emulator session and temporarily assigned moves to its active battlers. The shipped Lua remains read-only. Executing Sunny Day, Rain Dance, Sandstorm, Hail, Reflect, Light Screen, Tailwind, Trick Room and all four terrain moves verified their live flags. Reflect was exercised on both sides. These tests established the Run & Bun layout, which differs from vanilla Emerald.
- Growl lowered the opponent's Attack stage to -1. Will-O-Wisp set burn, matching the visible BRN indicator. Taunt was exercised on both sides; the game refused Growl after Taunt. Disable and Encore identified Growl, with remaining-turn counters decoded; the game refused disabled Growl.
- Browser: control-page analysis is hidden by default; the audience overlay remains visible. The compact overlay fits 400 × 64, including its status line.

## Automated verification

Automated coverage includes damage calculations, a seeded 512-path active-matchup forecast toward a knockout, with a 256-turn safety limit and unresolved outcome bounds, capture decoding, all eight live stat stages, exact-stat overrides, PP exhaustion, faint endpoints, player-side selection from battler positions, unsupported double battles/ROMs, partial packet rejection, stale bridge recovery, field flags, timed move restrictions, sleep wake-up timing, freeze, paralysis, confusion, and accuracy/evasion. The reusable test ground runs 22 named scenarios from `test-ground/scenarios/run-bun.json` without an emulator.

Automatic API smoke checks pass: generated read-only Lua, disabled manual edits/injection in normal mode, connection states, compact SSE, control page and OBS route. Diagnostic snapshot API smoke checks pass in a separate test server with `POKETHREAT_DIAGNOSTICS=1`.

## Remaining gaps

Choice locks, multi-turn moves, Substitute and other temporary effects remain unverified. The adapter clears the estimate for weather values beyond the four verified move-generated states. Additional field flags produce a warning. Player switching (the supplied save has one party member), held-item changes and major statuses besides burn still need gameplay validation. Their decoding or scoring checks have unit coverage where noted, which does not establish live compatibility. Full calculator compatibility with every custom mechanic is unverified. The bar is a short-horizon, probability-weighted outlook for the active matchup, not a full-battle win probability.

Sleep/freeze action rules follow the creator's Generation 8 default; live sleep-counter timing is not yet gameplay-verified. Sleep Talk and thawing caused by the opponent's move remain unmodeled. Accuracy and evasion stages and base move accuracy affect expected damage; abilities, items, weather, and field modifiers to accuracy remain unmodeled. Poison/burn residual damage remains outside the immediate comparison.

The Windows package is an **experimental automatic preview**, not a finished full-mechanics battle analyzer. ROM/save/state/capture files and testing tools are excluded from the package.

Sleep/wake-up regression: sleeping attacks remain in the future move set. A reconstructed Gossifleur/Lillipup trajectory and controlled losing/winning three-hit sequences verify wake-up continuity. Unfinished paths are never scored by remaining HP. PP exhaustion and unknown wake-up timers are reported as unresolved. The forecast still holds damage tables and unmodeled field/restriction effects fixed and does not simulate full teams or status-move strategies.

Overlay controls: Hide meter collapses to an on-screen Show meter button; Vertical/Horizontal switches the fill direction and preserves orientation when toggled. Verified button actions, dimensions, orientation retention, and vertical rendering. No permission rejection occurred during this update.

Compact overlay controls: eye icon toggles visibility; rotate icon switches orientation. Tooltips and accessible names describe each action. Horizontal footprint restored to 360 x 58; hidden controls occupy 52 x 28; vertical footprint is 160 x 330. Button/layout checks and rendered horizontal preview passed.

Vertical polish and resizing: rounded 120 x 330 panel, centered percentage, gradient capsule bar, subtle tick marks, and footer icon controls. Drag the bottom-right grip to resize proportionally (65% to 300%); drag elsewhere to move. Rendering verified at four scales, including control bounds and retained size/orientation on toggle. No permission rejections occurred.

Current resizing behavior supersedes proportional scaling: all four edges and corners use Windows resize hit areas and double-arrow cursors. Width and height reflow independently; fonts and icons stay fixed. Horizontal styling now matches the rounded vertical panel and gradient bar. Native hit tests passed for eight edges/corners and the interior; mode/visibility changes preserve each orientation's chosen dimensions. No permission rejection occurred.

Knockout paint regression: reproduced GDI+ gradient failure at tiny positive scores (1e-6 and below), as can occur while easing toward zero. Gradients now span the stable full track and clip to the current fill. Horizontal and vertical renders passed at zero, near-zero, ordinary scores, 100, and unknown status. Paint failures are caught and logged to run-bun/live/overlay-errors.log instead of leaving the WinForms red X. No permission rejection occurred.
