# Accuracy benchmark references

## What counts as a correct answer

A battle's recorded winner is one realized outcome, not its win probability. A long run of the production predictor is not an independent oracle. Targets below concern the active pair, with no switch-ins, under the named opponent policy.

The seven new controls are synthetic adaptations of public mechanics tests. They are not published full-battle probability benchmarks. The upstream [Smogon calculator tests](https://github.com/smogon/damage-calc/blob/master/calc/src/test/calc.test.ts) supply a fixed-damage Mew/Vulpix example. [Showdown move definitions](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts) supply accuracy/priority/multihit rules; [conditions](https://github.com/smogon/pokemon-showdown/blob/master/data/conditions.ts) specify paralysis. Run & Bun overrides, including Focus Blast's 80% accuracy, are checked against the vendored move data and `run-bun/reference/move-changes.csv`.

[Public VGC scenarios](https://github.com/JDub323/vgc-master/blob/master/scenarios.py) include strategy assertions rather than exact full-game probabilities and use a different ruleset. [NuzlockeAI](https://github.com/Fracture17/NuzlockeAI) searches Run & Bun guaranteed wins, with documented mechanics limitations. Its failure to prove a guaranteed win does not establish a 0% win probability. Neither supplies defensible numeric targets for our twelve complex states.

## Exact analytic controls

Each side has one move, so minimax and NPC policy have the same target. No switching is permitted.

| Control | Exact player win probability | Reason |
|---|---:|---|
| Fixed-damage win | 100% | Five Seismic Toss hits; opponent only has Splash |
| Fixed-damage loss | 0% | Reverse matchup |
| Equal-speed knockout | 50% | Either first hit wins; fair Speed tie |
| Focus Blast | 80% | Faster attacker wins on a hit, loses on a miss |
| Paralysis | 75% | Priority attack wins unless full paralysis occurs |
| Triple Axel | 72.9% | Three hits required: 0.9 cubed |
| Skill Link Triple Axel | 90% | Only the first accuracy check applies |

For ordinary Triple Axel, even the maximum first two critical hits total 564 damage, below Blissey's 600 HP; the minimum three noncritical hits total 635. For Skill Link Cinccino, those bounds are 308 and 348 with target HP 330. Thus damage rolls and criticals cannot change either target. A missed sequence permits a guaranteed Seismic Toss knockout of the one-HP attacker.

These calculations share the vendored damage calculator with production; they independently establish probability algebra and search outcomes, not independent proof of every ROM damage mechanic. Some controls use intentionally artificial movesets to isolate the rule.

## Assessment of every existing reconstructed matchup

| State | Minimax target | NPC-policy target |
|---|---:|---:|
| drednaw-lunatone-initial | Unresolved | Unresolved |
| drednaw-lunatone-triggered | 0% | Unresolved |
| drednaw-lunatone-asleep | 0% | Unresolved |
| monferno-scraggy-initial | Unresolved | Unresolved |
| monferno-scraggy-boosted | Unresolved | Unresolved |
| monferno-scraggy-resting | Unresolved | Unresolved |
| hariyama-porygon2-initial | Unresolved | Unresolved |
| hariyama-porygon2-paralyzed | Unresolved | Unresolved |
| hariyama-porygon2-pressure | Unresolved | Unresolved |
| togedemaru-cinccino-initial | Unresolved | Unresolved |
| togedemaru-cinccino-chipped | Unresolved | Unresolved |
| togedemaru-cinccino-protected | Unresolved | Unresolved |

For both solved Lunatone states, effective Speed is 34 versus Drednaw's 30. Stored Power's minimum damage is 76 versus Drednaw's current 51 HP. Every available player move has ordinary priority and none protects. The opponent can therefore force an immediate win. This proves 0% under minimax; it does not prove NPC 0%, because that policy may choose another move.

The remaining entries have been assessed but not independently solved. No exact winner or percentage is claimed for them. They remain performance fixtures, not accuracy fixtures. Establishing their numeric values requires a full-game solver with certified bounds or another defensible independent reference; observed videos and our ten-second estimates do not provide that.

## Policy for future benchmarks

1. Specify complete input, rules version, active-pair/full-team scope, opponent policy, terminal/draw rules, and history/counters.
2. Supply an analytic proof, independently enumerated probability tree, or independently solved interval before calling a fixture an accuracy benchmark.
3. Store the reference separately from prediction output, with a SHA256 of the exact input and a proof/source. Re-prove after input changes; never update the target merely to match a new predictor result.
4. Unsolved cases are explicitly timing-only. Use `--require-reference` for accuracy runs; it rejects unknown targets before launching work.
5. Report first-second error against the reference and later error separately. Keep the one-second/ten-point goal distinct from exact reference values.
6. Sampled evidence needs confidence intervals and repeated seeds; agreement in a single deterministic run is not a proof. An oracle depending on production mechanics must disclose that dependency.

Commands:

```powershell
node scripts/benchmark-retained-turn.mjs --group=accuracy --require-reference --mode=hybrid --seconds=3 --trials=1
node scripts/benchmark-retained-turn.mjs --group=accuracy --require-reference --opponent-model=npc-ai --mode=hybrid --seconds=3 --trials=1
node --test test/benchmark-oracles.test.mjs
```

## Initial measured results (2026-10-18)

The checked-in JSON reports retain reference targets, input hashes, source hashes, timings and raw readings. One trial per case/model, warm initialization excluded; these are exploratory measurements, not statistical validation.

Minimax returned 99, 1, 50, 80, 75, 64.6875, and 90 percent respectively. Triple Axel is 8.2125 points below the exact target. The guaranteed cases expose the sampler's existing 1..99 cap; keep their true targets at 0 and 100. Do not rebaseline the oracle to the cap. Initial estimates arrived in roughly 0.11 seconds on these deliberately simple controls; that does not establish performance on the complex battles.

NPC-policy results were 99, 1, 51.5625, 80, 75, 64.6875, and 90 percent in the same order. Its Speed-tie error was 1.5625 points and Triple Axel error 8.2125 points.

Both independently proved Lunatone losses returned 1% in their one-second benchmark runs, again reflecting the existing sampled-estimate cap. Their first estimates arrived at about 0.73 seconds.

## More complex controls

Six additional multi-turn, item/status and adaptive-strategy controls are documented in [complex proved benchmarks](COMPLEX-PROVED-BENCHMARKS.md), along with measured errors and concrete optimization opportunities. The original seven controls remain unchanged.

Seven recovery and setup decision controls, with independently enumerated damage,
critical hits, HP, PP and action choices, are documented in
[recovery and setup benchmarks](RECOVERY-SETUP-BENCHMARKS.md).
