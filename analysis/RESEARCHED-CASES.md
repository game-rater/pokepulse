# Mechanics review and 300 ms response target

## Research and regression coverage

The review uses upstream simulator regression tests as leads, then exercises the
vendored Run & Bun engine. These are simulator checks, not live ROM verification.
New cases avoid switching, doubles and generation-specific assumptions outside
the pinned Run & Bun rules.

| Case | What the regression establishes | Finding |
| --- | --- | --- |
| [Multiscale](https://raw.githubusercontent.com/smogon/pokemon-showdown/master/test/sim/abilities/multiscale.js) | Full HP protection, chipped HP and Mold Breaker | Existing mechanics pass |
| [Substitute](https://raw.githubusercontent.com/smogon/pokemon-showdown/master/test/sim/moves/substitute.js) | Later hits damage real HP after a substitute breaks | Existing mechanics pass |
| [Disguise](https://raw.githubusercontent.com/smogon/pokemon-showdown/master/test/sim/abilities/disguise.js) | First hit only; observed busted form stays busted | Fixed hydration recreating intact Disguise |
| [Encore](https://raw.githubusercontent.com/smogon/pokemon-showdown/master/test/sim/moves/encore.js) and [Disable](https://raw.githubusercontent.com/smogon/pokemon-showdown/master/test/sim/moves/disable.js) | Combined restrictions, Struggle, PP and expiration | Fixed restoring existing effects through move-start events |
| [Magic Guard](https://raw.githubusercontent.com/smogon/pokemon-showdown/master/test/sim/abilities/magicguard.js) | Life Orb, contact and recoil interactions | Existing mechanics pass |
| [Liquid Ooze](https://raw.githubusercontent.com/smogon/pokemon-showdown/master/test/sim/abilities/liquidooze.js) | Drain becomes damage | Existing mechanics pass |

The Run & Bun calculator reference remains the
[pinned community calculator](https://raw.githubusercontent.com/SynchEleven/rnb-calc-ultimate/15a0ea580604595786e0f81d965e68afc66279e4/calc/src/mechanics/gen789.ts).
Upstream latest-generation tests do not override the game's pinned mechanics.

Additional regressions check branch ownership of nested sets, logs, requests and
RNG; restoration parity with full cloning; root invalidation after changed
snapshots; passive poison clocks; and stochastic effects such as Shed Skin.
The full suite passed 585 tests, with no failures, skips or cancellations. A
subsequently added real-worker benchmark smoke test also passed, alongside the
three response-target checks; timing itself is not asserted under suite load.

## Faster prediction without changing mechanics

Restoration now copies only the objects the pinned deserializer would otherwise
share. Identical snapshots reuse an immutable root. Feature extraction shares one
observation hash, and deterministic passive loops stop at a repeated state.
Actual stochastic residual effects retain the full probe horizon.

A bounded strategic proof provider compiles supported native damage distributions,
healing and Toxic timing into an HP/stage dynamic program. It merges identical
successors and evaluates every supported player action. It uses no benchmark IDs,
reference answers or NPC policy. Unsupported interactions or exhausted budgets
return no proof and leave the general search responsible.

The current domain covers strictly faster players using combinations of Recover,
Swords Dance, Tackle and Seismic Toss against a single Strength or Seismic Toss,
with a short forced damage or Toxic horizon. Items, relevant abilities, field
effects, uncertain Toxic counters, volatile effects and insufficient PP decline
the proof. It is deliberately a restricted solver, not general stall coverage.

## Measured response times

Target: an estimate strictly before 300 ms, within ten percentage points of an
independent reference; refine afterward. This is a development goal. The checks
reject late corrections being substituted for an inaccurate early reading.

| Measurement | Results | Scope |
| --- | --- | --- |
| Seven recovery/setup reference cases, three trials each | 21/21 met target; zero reference error; most 19–41 ms, one 210 ms | Initialized engine, core search |
| Recovery case through normalizer and ready worker, three trials | 163–178 ms; 3/3 met target; exact 18.067192286252975% | Includes worker messaging and published score |
| Same case with cold worker | 1,033 ms; missed target | Includes worker startup |
| Broad four-by-four move case | No usable estimate within 1,043 ms | General search; no independent accuracy reference |

Before these changes, the seven strategy cases produced first readings in
110–242 ms, but fast output alone was misleading: one setup case remained more
than ten percentage points wrong after a second. Intermediate loop optimizations
also did not reliably meet the accuracy goal. The proof provider resolves the
supported strategy domain exactly.

These measurements exclude RAM-file decoding, HTTP polling and visual animation.
They are small local samples, not percentile guarantees. The server already
preloads its worker, but cold launch and broad searches remain too slow. No claim
is made that every battle now meets 300 ms or ten-point accuracy.

Reproduce with `scripts/benchmark-retained-turn.mjs` for isolated core timings and
`scripts/benchmark-live-response.mjs` for ready/cold worker timings. Performance
runs should be separate from the concurrent correctness suite. Acceptance uses
the new `initial_estimate` record; historical one-second records cannot establish
the new target. Ignored local reports retain full timing traces.
