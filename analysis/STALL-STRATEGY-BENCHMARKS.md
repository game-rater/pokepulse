# Stall strategy benchmarks

## Purpose and scope

Test whether the existing search recognizes delayed passive wins, sustains a healing/protection plan, respects resource exhaustion and Protect probability, and changes estimates sensibly as a battle progresses. The initial benchmark commit added controls without changing predictions. The subsequent shared temporal-evaluation changes are measured below against the same references.

Thirteen synthetic active-pair positions have fingerprinted exact references for both minimax and NPC scoring. Most have a single opponent move; the long case's player-win proof holds for every opponent choice, so both models still have the same true target. These are purpose-built controls, not recorded battle reconstructions or a claim that every synthetic build is obtainable.

## Why the targets are independent

`scripts/stall-benchmark-oracles.mjs` uses HP recurrences, PP bounds and Protect probability algebra. It does not call production search, its continuation policy, or its cutoff evaluation. Calculator critical-damage maxima bound Struggle; the calculator is shared mechanics infrastructure and is not independent ROM verification.

The native engine is checked separately by full winning/losing witness replays, both ends of the RNG range where appropriate, and exhaustive native chance enumeration for the short Protect cases. Replaying a winning line alone is not used to prove an optimal win probability: the arithmetic reference supplies the resource/survival proof.

Primary sources are [status conditions](https://github.com/smogon/pokemon-showdown/blob/master/data/conditions.ts), [moves](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts), [items](https://github.com/smogon/pokemon-showdown/blob/master/data/items.ts), and [abilities](https://github.com/smogon/pokemon-showdown/blob/master/data/abilities.ts), checked against the vendored Run & Bun implementation. Relevant details include integer rounding, Leftovers preceding poison, the Toxic stage, and successive Protect denominators.

### Proved scenarios

- **Ordinary poison:** full-health Mew's Leftovers offsets every incoming Seismic Toss. Blissey dies in nine poison ticks. Target 100%.
- **Poison plus enemy Leftovers:** healing before poison stretches that same clock to fifteen turns. Target 100%.
- **Enemy recovery delay:** five Recover PP plus twenty Seismic Toss PP can keep the foe alive at turn 25. When those moves expire, Struggle recoil and poison finish it within four further turns. Even maximum critical enemy Struggle is below the player's passive healing; forty Splash PP suffice. Target 100% under any opponent policy. One legal delaying line ends at turn 28, beyond the current 24-turn maximum default rollout.
- **Recover/Protect:** a one-HP Mew can alternate faster Recover and nonconsecutive Protect until poison wins at turn fifteen. It has sufficient PP and survives before each residual heal. Target 100%.
- **Progression:** snapshots after eight and twelve turns of that same line retain targets of 100%, with seven and three turns remaining. Native replays verify their HP and counters.
- **PP exhaustion counterfactual:** the same initial HP/status/items, but only one Recover PP and one Protect PP, forces Struggle on turn three. Its maximum critical cannot KO the foe; recoil and retaliation KO the player first. Both available initial orderings lose. Target 0%.
- **Consecutive Protect:** surviving two Toxic ticks requires two consecutive successes, giving 1/3. Starting with an existing protection streak gives 1/27. A three-tick Toxic clock with a fresh streak also gives 1/27. Exact targets are stored as fractions, not rounded meter labels.
- **Heal instead:** faster Recover sustains the player until the two-tick Toxic clock expires. Target 100%; this checks that waiting does not have to mean repeatedly gambling on Protect.
- **Lum Berry / Poison Heal counterfactuals:** neither allows Toxic to KO the foe. Protect PP ends before opponent attack PP; the ensuing Struggle cannot KO and its recoil loses. Target 0%.

## Baseline search results (before temporal evaluation)

One exploratory trial per case/model, hybrid native search, 100 ms slices, 128 samples per root pair, three-second total window. Warm engine initialization is excluded. The second number is the final available estimate, not a proven value; some runs finish their sample budget early.

| Case | Exact target | Minimax: by 1s / final | NPC: by 1s / final |
|---|---:|---:|---:|
| stall-poison-clock | 100.000% | 99.00% / 99.00% | 99.00% / 99.00% |
| stall-poison-leftovers | 100.000% | 98.00% / 98.00% | 2.00% / 71.75% |
| stall-recovery-delay | 100.000% | 2.00% / 2.00% | 2.00% / 2.00% |
| stall-recover-protect | 100.000% | 2.00% / 2.00% | 2.00% / 39.69% |
| stall-recover-protect-mid | 100.000% | 2.00% / 2.00% | 21.60% / 83.08% |
| stall-recover-protect-late | 100.000% | 44.00% / 51.00% | 93.88% / 96.94% |
| stall-pp-exhaustion | 0.000% | 1.00% / 1.00% | 1.00% / 1.00% |
| stall-protect-risk | 33.333% | 33.33% / 33.33% | 25.00% / 25.00% |
| stall-protect-used | 3.704% | 3.70% / 3.70% | 2.60% / 2.60% |
| stall-protect-three | 3.704% | 8.33% / 8.33% | 3.12% / 3.12% |
| stall-heal-instead | 100.000% | 99.00% / 99.00% | 94.84% / 96.94% |
| stall-lum-cure | 0.000% | 1.00% / 1.00% | 1.00% / 1.00% |
| stall-poison-heal | 0.000% | 1.00% / 1.00% | 1.00% / 1.00% |

**18/26 runs pass; 8/26 fail** the explicit acceptance check: a usable estimate by one second within ten percentage points of the reference, with the final estimate still within that error budget. This is the initial-estimate development goal, not a claim of one-point final accuracy. Passing with an eight-point error is still visibly different from the exact reference; all raw errors are retained.

The largest errors are 98 points on guaranteed stall wins. The three-turn late snapshot also fails under minimax, so search depth alone does not explain the failures. Continuation move selection and the cutoff evaluation are candidates for investigation; these tests do not yet isolate a single cause.

### Actual preloaded live-worker checks

The forced native/hybrid harness is not always the engine chosen by live minimax routing. Three additional runs use the actual SearchService, with the worker preloaded and its initialization recorded separately:

| Case | First publication | First score | Final score | Selected algorithm |
|---|---:|---:|---:|---|
| stall-recovery-delay | 1326 ms | 100.0% | 100.0% | bounded-stochastic-game-search |
| stall-recover-protect | 292 ms | 2.0% | 2.0% | retained-next-turn-native-hybrid |
| stall-recover-protect-late | 298 ms | 21.6% | 51.0% | retained-next-turn-native-hybrid |

The live route proves the long recovery-delay win correctly, but its 1.326-second first result misses the one-second latency goal. The actual Recover/Protect forecasts are also wrong, so the failures are not confined to an artificial harness. These worker runs are individual observations, exclude decoder/UI time, and are not p50/p95 measurements.

## Commands and test interpretation

```powershell
# Reference guards, native witnesses, exact chance checks and acceptance-tool tests
node --test test/stall-strategies.test.mjs test/stall-benchmark-check.test.mjs

# Current predictor against exact stall references
node scripts/benchmark-retained-turn.mjs --group=stall --require-reference --mode=hybrid --seconds=3 --trials=1 --out=.local-tools/stall-minimax.json
node scripts/benchmark-retained-turn.mjs --group=stall --require-reference --mode=hybrid --opponent-model=npc-ai --seconds=3 --trials=1 --out=.local-tools/stall-npc.json

# Evaluate current results against the original independent references.
node scripts/check-stall-benchmarks.mjs .local-tools/stall-minimax.json .local-tools/stall-npc.json
```

The ordinary regression tests validate reference integrity, mechanics and the acceptance checker; they do not assert that the current predictor is already accurate on every stall. The original baseline accuracy report deliberately retains its failures. Do not change the reference values to make it pass, mark those failures as successes, or special-case fixture IDs in production.

The checker validates input fingerprints and stored targets, recomputes errors instead of trusting saved `goal_met`, rejects stale references, and fails for missing/late estimates and later regression. Fixed seeds and one trial per model provide a repeatable starting point, not a statistical accuracy guarantee. Future fixes should rerun these cases, the mid/late snapshots, and independent-seed trials.

## Baseline validation and remaining coverage

All 457 ordinary regression tests passed, including 36 new stall-reference/native-witness/acceptance-checker tests. The separate accuracy acceptance run reports eight failures; its nonzero exit is expected until prediction behavior is improved. Source and distributed benchmark copies match.

These controls primarily start after poison has been inflicted. Choosing and landing the initial Toxic, additional recovery abilities, Substitute costs and opponents with varied offensive disruption are useful future extensions; this first suite does not claim complete stall coverage.

## Shared temporal evaluation results (2026-10-18)

The original reference targets and snapshots are unchanged. The shared temporal model, probability-weighted continuation probes, depth-specific estimates and retained-child depth checks are described in [the position evaluation design](POSITION-EVALUATION-DESIGN.md). Production code has no benchmark identifiers or fixture imports.

One isolated warm trial per model and case uses the same 100 ms slices, 128 root samples per pair and three-second window as the baseline. All 26 checks now pass the existing one-second/ten-point acceptance check, compared with 18/26 before. This is a measured result for these controls, not a universal performance or calibration guarantee.

| Case | Exact target | Minimax: by 1s / final | NPC: by 1s / final |
|---|---:|---:|---:|
| stall-poison-clock | 100.000% | 99.00% / 99.00% | 99.00% / 99.00% |
| stall-poison-leftovers | 100.000% | 98.00% / 99.00% | 98.00% / 99.00% |
| stall-recovery-delay | 100.000% | 98.00% / 98.00% | 98.00% / 98.00% |
| stall-recover-protect | 100.000% | 91.73% / 98.00% | 91.73% / 99.00% |
| stall-recover-protect-mid | 100.000% | 97.82% / 99.00% | 98.00% / 99.00% |
| stall-recover-protect-late | 100.000% | 99.00% / 99.00% | 99.00% / 99.00% |
| stall-pp-exhaustion | 0.000% | 1.00% / 1.00% | 1.00% / 1.00% |
| stall-protect-risk | 33.333% | 33.33% / 33.33% | 33.33% / 33.33% |
| stall-protect-used | 3.704% | 3.70% / 3.70% | 3.70% / 3.70% |
| stall-protect-three | 3.704% | 2.22% / 2.08% | 3.59% / 3.59% |
| stall-heal-instead | 100.000% | 99.00% / 99.00% | 99.00% / 99.00% |
| stall-lum-cure | 0.000% | 1.00% / 1.00% | 1.00% / 1.00% |
| stall-poison-heal | 0.000% | 1.00% / 1.00% | 1.00% / 1.00% |

Raw records: [minimax](benchmarks/stall-temporal-minimax-2026-10-18.json), [NPC](benchmarks/stall-temporal-npc-2026-10-18.json), [acceptance assessment](benchmarks/stall-temporal-assessment-2026-10-18.json). Records fingerprint the runtime sources, including the feature model and benchmark worker.

### Live-worker route

Two actual preloaded SearchService runs record every published score, including the last publication available by one second. Initialization is recorded separately; capture and UI latency are excluded.

| Case | First publication / score | Score by 1s | Final score |
|---|---:|---:|---:|
| stall-recover-protect | 296 ms / 88.57% | 89.60% | 98.00% |
| stall-recover-protect-late | 307 ms / 98.00% | 99.00% | 99.00% |

The initial live Recover/Protect case is greatly improved but still narrowly misses the one-second accuracy goal: 89.60% is 10.40 points below the proved 100% target. It refines to 98%. The late snapshot meets the goal. The warm forced-native harness and actual worker route must not be conflated. No reference or acceptance tolerance was relaxed.

### Generality and remaining limits

Twelve additional unit controls cover alternative healing/protection moves, finite PP, Toxic counters, native cure/healing abilities, Endure and side guards, damage before HP clipping, state/RNG immutability, cancellation/resumption, depth replacement, rare terminal probabilities and one-time healing. A Sitrus Berry contributes a finite reserve, not healing multiplied by Splash PP or a recurring passive heal. The original 10 ms worker fallback regression remains intact.

The temporal value remains a heuristic, with bounded passive projections and approximate resource scheduling. It is not an exact arbitrary-loop solver, and the suite does not establish one-point accuracy or one-second accuracy for all battles. Feature extraction adds work; caches and resumable cursors keep small slices progressing, but larger move matrices still need separate latency work.

### Final regression validation

`node --test --test-concurrency=1`: 469 tests passed, zero failed (150.1 seconds).
The 10 ms-slice broad fallback test publishes successfully in 6.95 seconds;
the earlier baseline log records 4.88 seconds for that artificial small-slice
configuration. These are individual observations, not a throughput benchmark.
Resumption fixes starvation, but richer feature extraction still has a cost.
The live-worker and warm benchmark latency results above remain the relevant
separate measurements. Runtime distribution files and recorded source hashes
were checked against the final source before committing.

## Bounded backward resource solver (2026-10-18)

The [bounded passive endgame provider](PASSIVE-ENDGAME-SOLVER.md) now proves eligible passive wins and exact Protect outcomes. It compiles native mechanics into a small HP/PP/Protect-state graph and backs up terminal values. The previous reference targets, fixtures and ten-point acceptance tolerance are unchanged.

| Case | Exact target | Minimax: by 1s / final | NPC: by 1s / final | Result |
|---|---:|---:|---:|---|
| stall-poison-clock | 100.000% | 100.000% / 100.000% | 100.000% / 100.000% | proven |
| stall-poison-leftovers | 100.000% | 100.000% / 100.000% | 100.000% / 100.000% | proven |
| stall-recovery-delay | 100.000% | 98.000% / 99.000% | 98.000% / 98.000% | estimate |
| stall-recover-protect | 100.000% | 100.000% / 100.000% | 100.000% / 100.000% | proven |
| stall-recover-protect-mid | 100.000% | 100.000% / 100.000% | 100.000% / 100.000% | proven |
| stall-recover-protect-late | 100.000% | 100.000% / 100.000% | 100.000% / 100.000% | proven |
| stall-pp-exhaustion | 0.000% | 1.000% / 1.000% | 1.000% / 1.000% | estimate |
| stall-protect-risk | 33.333% | 33.333% / 33.333% | 33.333% / 33.333% | proven |
| stall-protect-used | 3.704% | 3.704% / 3.704% | 3.704% / 3.704% | proven |
| stall-protect-three | 3.704% | 3.704% / 3.704% | 3.704% / 3.704% | proven |
| stall-heal-instead | 100.000% | 100.000% / 100.000% | 100.000% / 100.000% | proven |
| stall-lum-cure | 0.000% | 1.000% / 1.000% | 1.000% / 1.000% | estimate |
| stall-poison-heal | 0.000% | 1.000% / 1.000% | 1.000% / 1.000% | estimate |

All 26 warm accuracy/latency acceptance checks pass. Nine positions per opponent model now have certificates, including the fractional Protect cases; four retain fallback behavior. The proof does not infer a Struggle loss or approximate enemy recovery. Exact proof construction uses no rollout values; incomplete compilation can coexist with fallback sampling before the proof is published.

Raw records: [minimax](benchmarks/stall-backward-minimax-2026-10-18.json), [NPC](benchmarks/stall-backward-npc-2026-10-18.json), [acceptance](benchmarks/stall-backward-assessment-2026-10-18.json). These exploratory warm runs have one trial per model/case, 100 ms slices, a three-second maximum and separately recorded source hashes.

### Actual preloaded worker results

| Position | Trials | First estimate range | Exact completion range | Score by 1s |
|---|---:|---:|---:|---:|
| initial Recover/Protect | 3 | 353–374 ms | 389–402 ms | 100% |
| late Recover/Protect | 3 | 350–386 ms | 372–432 ms | 100% |

The initial live position previously reported 89.60% by one second and was still refining at 98% after three seconds. It now reaches a certified 100% before one second in all three recorded trials. Early publications can still be approximate while the compiler resumes. Preload time is recorded separately; decoder/UI latency is excluded. These six runs are not a universal latency guarantee.

Worker records: [initial position](benchmarks/stall-backward-recover-worker-2026-10-18.json), [late position](benchmarks/stall-backward-late-worker-2026-10-18.json).

### Regression checks and stopping point

The full suite passes 495 tests (zero failures), including 26 new passive-solver tests. Independent checks include four short exhaustive native trees; twelve HP/PP/speed/item variants; native winning-policy replays with other healing moves/species; failed-Protect reset; resource/counter changes; cancellation and resumed graph/state budgets; malformed input and mid-turn rejection; shared proof caching; and declines for unsupported mechanics. The earlier conditional-expectation unit test explicitly disables this provider so it still exercises the sampled terminal-turn optimization.

This evidence supports keeping the bounded provider. It does not justify a general inverse simulator or unrestricted reverse-search engine. Ordinary random attacks, enemy recovery and more complex effects continue through the existing search. Broader proof domains require their own native/reference validation before certification.
