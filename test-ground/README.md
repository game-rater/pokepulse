# Battle test ground

Screen eyedropper: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File test-ground/screen-picker.ps1`. A temporary synthetic color swatch verifies actual desktop capture, pixel selection, and cancel behavior without storing screen images. `overlay-controls.ps1` also checks eyedropper placement at normal/150-percent scaling and exact RGB plus preserved opacity for each editable element.

Branch-priority regression: `node --test --test-isolation=none test/priority.test.mjs test/frontier.test.mjs`. These synthetic games have known answers and check that prioritization changes work order without inventing certainty or dropping rare outcomes. They cover misleading heuristic estimates, fair exploration, mixed strategies, cheap endings, safe player-action elimination, and revisiting depth cutoffs. Reuse them for future ROM adapters. Live battle replay benchmarks belong in local arena logs rather than shared fixtures.

Live search continuity regression: `node test-ground/live-search-smoke.mjs` (also `--package`). This uses synthetic captures in a temporary bridge, never the player's emulator or save. It tests retaining the displayed estimate through a PP/HP snapshot burst, rerooting to a saved descendant with zero new node expansions, immediate replacement by a resolved loss, and clearing when battle ends. `test/search-service.test.mjs` tests worker identity, cache invalidation, settling, and separate certified/display scores; `overlay-controls.ps1` tests their propagation to the native meter. Run this matrix for each future ROM adapter. Settling is a timing safeguard; verify a ROM-specific turn-boundary signal before treating intermediate memory as completed turns.

Measure the full calculator plus the 512-path knockout forecast with four damaging moves on each side:

```powershell
node test-ground/benchmark.mjs
```

This reports warm calculation latency, CPU time, and process memory. It runs independently of the live server. Compare results on the same machine; the sampled matchup is a benchmark case, not a guarantee for every battle. The current server caches unchanged battle snapshots, so it does not rerun the forecast for every emulator frame.

Run the suite without opening an emulator:

```powershell
node test-ground/runner.mjs
```

Exercise the local diagnostic API in an isolated temporary bridge directory:

```powershell
node test-ground/api-smoke.mjs
```

Test the packaged Windows build on an isolated temporary port after syncing its files:

```powershell
node test-ground/api-smoke.mjs --package
```

Exercise the native PokéPulse overlay controls and rendering without starting its message loop:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File test-ground/overlay-controls.ps1
```

This checks that exactly two overlay buttons remain visible, the icons remain transparent, the score colors follow red-yellow-green stoplight interpolation, the background color and opacity save correctly, resize hit areas work, and both orientations render through waiting and near-zero scores.

Each JSON scenario starts from a clean pair of Pokémon and changes only declared fields. Expected hit and action chances make accuracy/evasion stages, ordinary statuses, and move exceptions easy to reproduce. HP and score expectations cover outcomes such as landing a hit as sleep ends. The estimator's seeded rollout makes each fixture repeatable while sampling hit chance, damage rolls, action order, and supported status failures toward a knockout. A 256-turn safety limit and unknown future actions produce unresolved paths and outcome bounds, never an HP-based terminal guess. Use the ground to reproduce a reported case, then add it as a named scenario before changing the estimator. The same fixture format is usable by other ROM adapters; a new adapter should map its captured game state to `player`, `opponent`, `field`, and temporary effects without adding ROM/save/state files to fixtures.

Reproduce the reconstructed level-2 Gossifleur/Lillipup sleep-and-three-hits sequence:

```powershell
node test-ground/runner.mjs test-ground/scenarios/lillipup-sleep.json
```

`test/outlook.test.mjs` also covers a sleeping enemy that wakes and wins despite three guaranteed hits, a winning sequence through wake-up, a forced cutoff, partially unresolved bounds, unknown sleep timers, and future PP exhaustion. Keep temporary action prevention separate from future move availability: a sleeping Pokémon still has attacks after it wakes. Compare snapshots immediately before and after wake-up at identical HP, and test successful-hit trajectories using controlled damage. Never enforce unconditional score monotonicity on arbitrary observations; waking earlier or taking a low damage roll can legitimately change the conditional outlook. Keep sampling noise distinct from mechanics or horizon errors.

For a new hack, first fingerprint the exact ROM, keep source saves and emulator states untouched, and experiment only in an isolated copy. Capture the relevant memory before and after a controlled move or status change, map one field at a time, and record whether the finding came from live play or only a synthetic fixture. Run decoder and scoring scenarios before integration checks, then verify the displayed overlay against a live battle. Keep custom mechanics fail-closed when their memory mapping or rules are unknown. Fixture files should contain only small, synthetic or public battle snapshots, never ROM bytes, personal saves, or raw emulator state.

The rollout-specific expectations above are superseded by the bounded stochastic search in ../analysis/SEARCH.md. Unresolved is now interval width (0–1), not a count of sampled paths. See test/outlook.test.mjs for analytic search oracles and test/search-service.test.mjs for worker cancellation.
