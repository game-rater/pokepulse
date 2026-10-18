# Exact endgame optimization

## Implemented

- The shared position evaluator checks the bounded exact kernel before selecting an engine. Native bounded, retained and sampled searches use the same continuation evaluator. See `POSITION-EVALUATION-DESIGN.md` for ownership and dependency boundaries.
- Eligible positions have known nature/order, neutral stages, no status/items/volatiles/field or pending side/slot effects, no relevant abilities, and an opponent with one legal Seismic Toss. Player moves are Seismic Toss and/or Focus Blast. There are at most three player opportunities and sufficient PP for every branch.
- Focus Blast uses all sixteen native damage rolls and Run & Bun's 1/16 base critical probability. Native damage calculation preserves exact live stats, typing and rounding. When a nonterminal hit can lower SpD, a guaranteed Seismic Toss finish must make that change irrelevant; other positions fall back.
- A memoized weighted backup chooses the best move at each resulting HP state. Outcomes leading to the same remaining HP or terminal knockout are combined before evaluating continuation. Probabilities are added, never renormalized.
- Exact root results are cached by complete native state. They return coincident certified model bounds, including genuine 0/100 values; sampled estimates retain their existing contract. Live input errors prevent the shortcut.
- The kernel has a 50 ms work budget, a three-opportunity domain, a state limit, and cancellation checks. `exactEndgames:false` disables it for A/B investigation. Unsupported positions keep the existing search behavior.

This implements outcome merging inside the exact kernel; it does not merge arbitrary native states merely because their HP looks similar. The independent reference solver and stored benchmark targets remain separate from production.

## Measurements

Warm initialized-engine runs, one fixed-seed trial per case/model:

| Case | Before minimax | After minimax | Correct result | Rollouts after |
|---|---:|---:|---:|---:|
| Three Focus Blast opportunities | 110 ms | 19 ms | 99.2% | 0 |
| Choose guaranteed fixed hits | 115 ms | 19 ms | 100% | 0 |
| Adaptive second move | 115 ms | 20 ms | 81% | 0 |

NPC-mode first estimates on those cases took 19-27 ms and returned the same exact targets. Paralysis, Sash and poison cases remain on the fallback, roughly 110-118 ms warm in these exploratory runs. These positions test the guard boundaries; their status/item effects are not discarded for speed.

First-result score logging also caught a legacy route that initially emitted about 33% before reaching 81%. The proof check now runs before engine selection, and live worker regression tests require the first result to match 81%.

The earlier actual cold adaptive-worker measurement first published at 1138 ms. After explicit worker preload, three actual SearchService runs first published at 160-176 ms (median 173 ms), excluding separately recorded preload time. Preloading moves initialization to application startup; it does not remove that cost. These measurements exclude decoder/UI latency and do not establish universal one-second performance.

Reports: `analysis/benchmarks/exact-endgame-minimax-2026-10-18.json`, `exact-endgame-npc-2026-10-18.json`, and `preloaded-adaptive-worker-2026-10-18.json`.

## Regression coverage

Tests compare exact outputs for both opponent models against independent registered proofs; verify the conditional 81/80 percent action values and merged outcomes; reject status, items, unhandled abilities, insufficient PP, speed ties, changed SpD, unknown nature, unsupported moves, unsafe damage bands, pending slot effects and weather; verify cancellation, timeout, input blocking, opt-out, cache reuse and saved-state immutability.

Commands:

```powershell
node --test test/exact-endgame.test.mjs test/search-service.test.mjs
node scripts/benchmark-search-race.mjs --case=oracle-choice-adaptive --mode=fallback --preload --seconds=3 --trials=3
node scripts/benchmark-retained-turn.mjs --family=proved-complex --require-reference --mode=hybrid --seconds=3 --trials=1
```

Final validation: all 412 tests passed with zero failures. The recorded live worker runs publish 81% as their first result, as well as their final result. Source and distributed runtime copies match.
