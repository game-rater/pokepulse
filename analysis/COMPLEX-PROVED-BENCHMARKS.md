# More complex proved benchmarks and optimization opportunities

## Goal check

All sixteen earlier warm-search measurements (seven controls under both models plus two Lunatone minimax losses) produced an estimate within one second and within ten percentage points of the correct reference. That establishes the warm engine portion of the goal on those cases. The development goal includes cold search: those measurements alone do not establish it.

A new actual SearchService cold-worker run on the adaptive case first published after **1.138 seconds** and finished with **81%** after **1.261 seconds**, matching the exact target. First-publication accuracy was not recorded separately. This misses the one-second latency goal and excludes decoder/UI time. Its report is `analysis/benchmarks/complex-adaptive-worker-2026-10-18.json`.

## Six additional proved cases

These are synthetic, mechanics-inspired positions, with full fingerprints, proof guards and separately stored references. The opponent only has Seismic Toss; therefore both opponent policies have the same exact target, while the player still optimizes its choices.

| Case | Exact | Minimax at 1s | NPC model at 1s |
|---|---:|---:|---:|
| oracle-focus-three | 99.2% | 99.00% | 99.00% |
| oracle-paralysis-three | 98.4375% | 96.88% | 99.00% |
| oracle-sash-paralysis | 93.75% | 93.75% | 92.97% |
| oracle-poison-window | 80% | 80.00% | 80.00% |
| oracle-choice-guaranteed | 100% | 95.72% | 95.67% |
| oracle-choice-adaptive | 81% | 86.72% | 80.04% |

All twelve new warm measurements met the one-second/ten-point goal. They are single-trial results using the benchmark's fixed seeds; this is not an independent-seed reliability estimate. Initial estimates were approximately 108-115 ms. Current sampled caps at 1 and 99 remain reflected in comparisons against true 0/100 targets.

### Proofs

- **Three Focus Blast attempts: 99.2%.** Faster Alakazam at 201 HP survives two 100-damage retaliations. Any hit KOs the one-HP opponent. Failure requires three misses: 1 - 0.2^3.
- **Three paralysis attempts: 98.4375%.** Pikachu at 201 HP has three priority Quick Attacks. Only three consecutive full-paralysis events lose: 1 - 0.25^3.
- **Focus Sash plus paralysis: 93.75%.** Full-health level-one Pikachu survives its first failed action using Focus Sash. Priority still acts before the second retaliation. Both opportunities must fail: 1 - 0.25^2.
- **Poison removes the extra chance: 80%.** Alakazam at 101 HP misses, takes 100 damage, then poison KOs before another turn. This is deliberately paired with the survival cases to reject a shortcut that ignores residual damage.
- **Choose the guaranteed route: 100%.** Against 150 HP, two Seismic Toss hits win for sure. Repeating Focus Blast wins only 96%. Choosing the superficially stronger attack is inferior.
- **Adaptive choice: 81%.** Against 250 HP, normal Focus Blast damage is 172-204, and critical damage is 260-306. With two player actions available, Focus Blast first wins on any hit (80%): a critical KOs immediately, a normal hit allows a certain Seismic Toss finish. On a miss, a second hitting critical wins with probability 0.8/16. Total 0.8 + 0.2 * 0.8/16 = 0.81. Starting with Seismic Toss yields only 80%. Committing to Focus Blast twice gives 66%; the conditional second move matters.

Critical probability is Run & Bun's 1/16, not current standard generation-eight 1/24. `scripts/reference-damage-race.mjs` independently backs up the sixteen damage rolls, critical/miss probabilities and both turn-by-turn move choices for the last two cases, agreeing with their algebra. It uses calculator damage mechanics, not production continuation values or Monte Carlo search. Its fixed-retaliation domain requires enough PP and excludes items/status/residuals; callers guard those preconditions.

Primary mechanics sources: [Showdown moves](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts), [conditions](https://github.com/smogon/pokemon-showdown/blob/master/data/conditions.ts), and [items](https://github.com/smogon/pokemon-showdown/blob/master/data/items.ts). Run & Bun accuracy and critical overrides are checked locally; these fixtures are not claimed to be recorded public battles or independent ROM verification.

## How this can speed up prediction

### 1. Preload the worker before the first battle

`SearchService.start()` currently creates workers lazily. Persistent workers already help subsequent requests, but cannot remove first-request module initialization. Add an explicit warm-up/readiness step at tool launch, with no synthetic result published as a battle prediction. Measure first observed battle and subsequent requests separately. This directly targets the cold-worker gap above. Benefit remains to be measured in the application.

### 2. Extend exact shortcuts to eligible multi-turn endings

`sampled-moves.mjs:exactEnding` currently stops at a nonterminal next turn and caps enumeration at 48 steps. It cannot solve the multi-turn controls through that shortcut. A guarded small dynamic program can return an exact continuation value for fixed retaliation, sufficiently many PP, no changing field/effects and known action order. Use it at eligible search leaves and roots; fall back immediately outside its domain.

The standalone proof checks, including calculator calls, have warm median times of approximately 0.15-0.44 ms on these cases (see `complex-proof-cost-2026-10-18.json`). These are restricted proof computations, not measured production speedups. The existing general worker already solves the adaptive case exactly; the opportunity is to make the sampled route and repeated eligible leaves similarly cheap, and avoid unnecessary engine setup where safe.

### 3. Merge provably equivalent outcomes before expensive replay/serialization

The retained graph already merges states after native execution. More savings may come from merging before repeatedly replaying the turn: if all sixteen damage rolls and critical outcomes KO, they have the same terminal result; if different damages all lead to the same proven continuation, sum their probability mass once. The prototype demonstrates this for terminal damage successors. General HP bands require a proof of identical future behavior; poison thresholds, berries, abilities and damage-dependent moves can invalidate them.

### 4. Use solved continuations in strategy selection

The 150-HP case currently returns roughly 95.7% instead of the guaranteed 100%. A solved continuation can identify the certain two-hit route directly and remove repeated policy probes. The 250-HP case tests the opposite trap: the optimal first move is risky, with the second move depending on what happened. Reusing exact child values avoids sampling both decisions repeatedly. Existing retained bounds, transpositions and dominance pruning should be reused, not duplicated.

### 5. Tune budgets against held-out exact cases

The suite can identify where fewer rollouts preserve the first-second goal and where approximation biases the policy. Split controls into development and held-out variants (different HP, speed, PP, status and item boundaries); add independent seeds and measure cold/warm p50/p95 latency and accuracy. Reduce work only when the error evidence supports it. Never special-case fixture IDs or use benchmark target lookup in live prediction.

Recommended order: worker preload, guarded multi-turn exact continuation, then earlier chance-outcome merging. Keep the native engine as the fallback. No production search behavior was changed in this feature.

Commands:

```powershell
node scripts/benchmark-retained-turn.mjs --family=proved-complex --require-reference --mode=hybrid --seconds=3 --trials=1
node scripts/benchmark-retained-turn.mjs --family=proved-complex --require-reference --opponent-model=npc-ai --mode=hybrid --seconds=3 --trials=1
node scripts/benchmark-analytic-proofs.mjs
node --test test/benchmark-oracles.test.mjs test/reference-damage-race.test.mjs
```

Validation: 386 full-suite tests passed; the focused proof tests also pass. Runtime prediction code is unchanged.
