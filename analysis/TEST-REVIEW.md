# Test review — 2026-10-18

Scope: all 51 existing `test/*.test.mjs` files and their shared fixtures/runners.
Two test files and one synthetic capture helper were added. No mechanics or
probability target was weakened to make a test pass.

## Changes and findings

* Removed six tests: three checks of fixed fixture literals/counts, a source
  import/name restriction, and two overlapping display tests. Display behavior
  now has three focused tests in one file. Native hydration checks now compare
  exact moves, PP, stats, abilities, sleep and protection counters.
* Strengthened the Damp test from an uninformative `[0,100]` result to a proven
  win. The 625-game matrix check now also requires a narrow interval. Executing
  every mapped move must actually advance a turn or finish the battle. A hidden
  provisional score no longer satisfies the forced-move forecast test.
* Added public-entry critical-rate coverage, journal/capture pairing and recovery,
  history browser refresh/download behavior, recorder bounds/ownership checks,
  earlier bad-luck context, disconnect isolation and benchmark boundary tests.
* Independent benchmark targets are keyed by case ID instead of array position.
  The accuracy/action scenario runner accepts explicit search options; its unit
  test avoids spending a normal prediction budget on assertions about immediate
  accuracy/action mechanics. A deliberately wrong expected result must fail.
* The short forced-final-turn correctness test now waits for sample completion
  with a generous work budget before checking its exact probability. The default
  test command runs two files at a time. Latency measurements remain separate.
* The synthetic helper lives in `test-ground/helpers/`, outside Node's default
  `test/` discovery, so loading a helper is not counted as a passing test.

New regression tests exposed production issues, fixed in separate commits:

1. Duplicate journal IDs could count a critical hit twice. Repeated IDs are now
   consumed once, including duplicates within the same batch.
2. An undecodable journal record vanished from the causal sequence. It now
   produces an explicit gap, blocking unsupported final-damage attribution.
3. Benchmark acceptance allowed out-of-range probabilities and numeric-looking
   timestamp strings, and rejected an immediate time-zero result. Acceptance now
   requires finite numeric probabilities in `[0,100]` and times in `[0,1000]`.

The new regressions were observed failing before their fixes. No user emulator,
save, or ROM was altered during this review.

Validation: `node --test --test-concurrency=2` passed all **556 tests**, with zero
failures, cancellations or skips (about 98 seconds on this machine). The helper
module is excluded from that count. All changed runtime files were also
synchronized to the local distributable; test files were not copied there.

## File-by-file disposition

“Retain” means the file protects behavior distinct from the other layers,
including when the same mechanic appears in a unit test and a whole forecast.

| Test file (`.test.mjs`) | Decision and meaningful coverage |
| --- | --- |
| accuracy | Strengthen runner rejection coverage; avoid unrelated forecast work; retain exact stage multipliers. |
| action-usefulness | Retain symmetric state-only flags, immunity exceptions, useful waiting and input/cache isolation. |
| arena-mechanics | Strengthen Damp to require a win; retain explosion, mutual KO and finite Endure semantics. |
| arena-mirror | Retain public analysis/search integration and the mirror interval around 50%, rather than only a matrix unit test. |
| battle-engine | Retain standard calculator entry, exact damage, validation and custom-chart fallback. This is a separate supported app path. |
| battle-history | Retain decision grouping, uncertainty, estimate alignment, escaping and saved report routing. |
| battle-messages | Add duplicate/undecodable event regressions and cross-turn/battle context; label Lua source checks honestly. |
| battle-phase | Retain ROM callback/turn/action decoding and unknown-phase handling. |
| battle-progression | Retain independent race probabilities, every observed turn, item/PP/status transitions and reused-session invalidation. |
| battle-recorder | Require exact ring contents; add oversized-event preservation, detached messages and age expiry. |
| battle-stream | Retain real worker replacement across both models and normal/fast/burst observation delivery. |
| benchmark-oracles | Key targets by case ID; retain independent expected probabilities, scope/fingerprint guards and CLI rejection. |
| bound-pruning | Require useful precision across 625 analytic matrices; retain pruning work reduction, missing mass and threshold reuse. |
| bridge | Add real packet/sidecar delivery, exactly-once consumption, malformed/mismatched recovery and integration reload. |
| complete-moves | Require actual turn advancement for every mapped move; retain individual effect and chance-mass assertions. |
| continuation-policy | Retain native tactical preferences, input preservation, resumable deadlines and live-stat restoration. |
| critical | Add public Run & Bun entry-rate coverage; retain rate modifiers and a rare-critical forecast with an analytic target. |
| display-estimate | New home for previously overlapping display checks, with complete clamping/readiness/invalid-data cases. |
| engine | Retain shared heuristic/type-chart path, validation, symmetry and HP endpoints. This path remains supported. |
| exact-endgame | Retain kernel/reference agreement, guard rejection, immutable probes and zero-rollout worker publication. |
| forced-move-search | Require a usable published estimate; retain legal forced slots in all optimizers and charge/recharge transitions. |
| frontier | Retain persistent queue deduplication, mixed games, cycles and resumption under explicit work limits. |
| held-items | Retain one-time item consumption, item damage/status timing, accuracy modifiers and searched outcomes. |
| history-app | New executed browser-controller tests: overlapping fetches, errors/retry, unchanged rendering, visibility and escaped saved HTML. |
| live-effects | Retain memory-to-native counter hydration and subsequent execution, rather than only raw decoder fields. |
| machop-strategy | Retain the hard recovery/setup integration regression and exact damage precondition. Its work budget is not a latency claim. |
| memory | Remove one unused extra search; retain decoding, validation, restrictions, battle state and decoded-effect integration. |
| move-effects | Retain flinch lifetime and drain timing; move display tests to their own file. |
| move-inputs | Retain decrypted identity/checksum checks and conservative first-turn history. |
| npc-ai | Retain normalized policies, legality, weighted backup, allocation, missing input and worker/model isolation. |
| npc-ai-correctness | Retain controlled scoring cases for healing, immunity, toxic, priority and terrain. This option is separate from minimax. |
| optimizer-api | Retain real HTTP validation, origin checks, persisted menu selection, restart and history routes. |
| outlook | Retain independent stochastic games, setup, sleep expiry, bounds and recursive reuse/cancellation. |
| passive-endgame | Retain held-out species/moves, exhaustive small trees, policy replay, resumable work and refusal of unsupported proofs. |
| position-evaluator | Remove source-text architecture restriction; retain behavioral provider call counts, cache/model isolation and both search consumers. |
| position-features | Require completed sampling before exact outcome checks; retain finite resources, estimator epochs and bounded probes. |
| prediction-contract | Retain certainty/publication contracts, diagnostic provenance, immutable requests and both input boundaries. |
| priority | Remove a vacuous nonnegative-counter assertion; retain concrete expansion order, fair exploration and preserved game values. |
| real-battle-fixtures | Remove literal/count checks; strengthen each reconstructed state's actual native hydration. No invented exact outcomes. |
| reference-damage-race | Retain an independent finite solver, adaptive action values, mass merging and invalid-distribution rejection. |
| refinement | Retain publication/cancellation, deepening, cycle contraction and action-pair fairness across slices. |
| retained-turn | Retain observation identity, rare/missing mass, next-turn reuse and bounded graph retention. |
| run-bun | Retain complete public snapshot-to-analysis path and malformed effects/stats rejection. |
| run-bun-effects | Retain per-hit critical/accuracy distributions, secondary interactions, item timing and custom calculator behavior. |
| sampled-moves | Retain stratified weights, estimator readiness, adaptive allocation, exact endings and sampled/certified separation. |
| scenario-audit | Retain callback routing for all listed abilities/items plus concrete execution and cross-engine checks. Routing smoke tests do not prove every callback. |
| search-race | Retain chooser policy separately from actual two-worker execution, cancellation and paused-exact fallback. |
| search-service | Retain asynchronous publication, worker reuse, stale suppression, native fallback and preload; consolidate display tests. |
| stall-benchmark-check | Add inclusive time/error boundaries and rejection of invalid probabilities/timestamps. |
| stall-strategies | Retain independent stall targets, native witnesses, full short Protect trees and altered-scope rejection. |
| status | Retain action-opportunity units plus whole forecasts for sleep, paralysis, freeze and confusion. |
| strategy-benchmarks | Key frozen references by ID; retain strategic alternatives, exact roll comparisons, native timing and assessment. |
| struggle | Retain PP transition, recoil/mutual KO, unsupported-move uncertainty and immunity/accuracy behavior. |

## What this review does not establish

The suite does not prove complete ROM parity, all NPC tactics, live mGBA Lua
execution, visual/native overlay correctness, or universal first-second accuracy.
The retained Lua test checks protocol wiring and absence of write calls, not Lua
execution. Synthetic browser I/O tests cover controller behavior, not visual QA.
Public battle-inspired reconstructions without an independent proof remain
unresolved benchmark references. These limits must not be hidden by more smoke
tests or by counting passing cases as proof of complete battle coverage.
