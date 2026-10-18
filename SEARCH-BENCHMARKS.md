# Search performance benchmarks

Run from the project root with Node or the bundled `dist/Run-and-Bun-Automatic/node.exe`.

```powershell
# Short smoke comparison: all cases, one trial, one second per case/mode.
node scripts/benchmark-retained-turn.mjs --quick

# Repeatable comparison: three trials, three seconds per case/mode.
node scripts/benchmark-retained-turn.mjs

# Sustained refinement of the previous slow matchup.
node scripts/benchmark-retained-turn.mjs --case=herdier-wingull --seconds=30 --trials=3

# Measure the observed-turn handoff repeatedly.
node scripts/benchmark-retained-turn.mjs --case=reusable-next-turn --seconds=3 --trials=10

# Compare the two-worker race with the previous single-worker fallback.
node scripts/benchmark-search-race.mjs

# Four battle-inspired families, three constructed decision states per family.
node scripts/benchmark-retained-turn.mjs --group=real-battle --mode=hybrid --seconds=10 --trials=3

# Same states evaluated against the community NPC policy; separate results.
node scripts/benchmark-retained-turn.mjs --group=real-battle --mode=hybrid --opponent-model=npc-ai --seconds=10 --trials=3

# Limit a comparison to the initial reconstructed state of each family.
node scripts/benchmark-retained-turn.mjs --group=real-battle --variant=initial --seconds=3 --trials=3

# Actual worker startup on the four initial states, fallback versus race.
node scripts/benchmark-search-race.mjs --group=real-battle --variant=initial --seconds=5 --trials=3
```

Results are JSON files under `.local-tools/search-benchmarks/`. `--out=path` selects a file. Fixtures are synthetic/public and use no ROM, save file or live captures.

The race comparison uses actual persistent service workers in isolated processes. Initial-reading measurements include worker startup. The next-turn measurements reuse those same workers. It records selection, exact-probe status, CPU time and combined process RSS; two workers can improve which result becomes available while increasing CPU and memory. Run it separately from tests and preserve the JSON with source hashes for future comparisons.

## Cases

| Case | What it measures |
|---|---|
| cheap-ending | Native finishing turn with fixed damage; overhead on an easy position |
| rare-critical | Exact immediate win probability of 1/16; probability-weight correctness |
| reusable-next-turn | Reconstruct a real native descendant as reader-style input; measure immediate reuse and fresh sampling |
| four-by-four | Sixteen root move pairs, priority, protection, healing and secondaries |
| persistent-effects | Confusion, toxic counters and item healing |
| herdier-wingull | Existing public reproduction of the slow Run & Bun matchup |
| drednaw-lunatone-* | Hypnosis, Chesto Berry, Weakness Policy and Speed changes |
| monferno-scraggy-* | Rest/Shed Skin, attack boosts, and status versus attack choices |
| hariyama-porygon2-* | Deliberate Guts activation, paralysis, and Recover |
| togedemaru-cinccino-* | Skill Link, flinch, contact damage, first-turn moves and Protect history |

The battle-inspired families use pinned public trainer sets and constructed player states. Only the Drednaw build is substantially specified in its battle report; other player builds, HP, PP and histories are explicitly synthetic. Each family includes three independent states, not a recorded three-turn trajectory. They have no analytic accuracy reference and do not establish ROM learnset legality. See `scripts/real-battle-fixtures.mjs` for provenance and `analysis/REAL-BATTLE-BENCHMARK-CANDIDATES.md` for the source selection.

The retained-turn report records point estimates available by 1, 3 and 10 seconds. A checkpoint beyond the measurement window stays unmeasured unless the search already finished. A result arriving after a deadline is not credited retrospectively. A later score from the same approximate engine is a refinement comparison, not ground truth. The real-battle states currently measure independent starting positions; reuse remains measured by `reusable-next-turn` and the actual-worker race benchmark.

## Comparison method

Each case/mode/trial runs in an isolated process. Both modes warm native engine initialization before measuring. Trials alternate execution order. `baseline` disables the retained next-turn layer while retaining the existing sampled engine; `hybrid` enables the new layer. Native RNG seeds, per-pass budgets and root sample targets are identical. Tests should run separately from timing benchmarks; background application load can still affect these wall-clock measurements.

Measure separately:

1. **First usable reading:** time before a new position has a displayable estimate. A missing reading within the window is recorded as null, not zero.
2. **Observed-turn reuse:** time to the next reading, whether it appears immediately without new rollouts, and how many observations were retained.
3. **Refinement cost:** completed root samples, total root/child rollouts, CPU time, longest slice, and completion status within the window.
4. **Memory:** largest RSS observed at slice boundaries and retained state count. This is a sampled memory measurement, not a guaranteed instantaneous peak.
5. **Quality:** the analytic rare-critical case must remain 6.25%; score traces reveal changes during refinement. This one analytic case cannot establish general forecast calibration.

Summaries report medians across trials. Preserve old JSON reports when changing code; a future baseline mode may itself change. Compare first readings and observed-turn readings separately. Faster reuse can justify some background work, but slower initial readings should be investigated explicitly. Sample counts from different modes are not interchangeable: the hybrid also evaluates descendant matrices.

## Future optimization experiments

Use the same series to compare one change at a time:

- Cache or batch native first-turn replay to avoid repeated restoration for chance prefixes.
- Allocate descendant refinement by both outcome probability and influence on the selected move strategy.
- Reduce cloning/serialization cost while keeping all mechanic-sensitive fields in state keys.
- Vary retained-state limit, eight-sample child target and enumeration share; measure reuse rate against memory and initial latency.
- Add recorded **synthetic** sequences of several turns and measure cumulative CPU work, reuse coverage and cold fallbacks.
- Expand analytic fixtures for misses, speed ties, paralysis and multi-hit effects before trusting faster approximations.

Implementation tests in `test/retained-turn.test.mjs` check matching, rejection of incompatible states, exact rare-event mass, resumable probability frontiers, observed-turn reuse and cache limits. They do not assert machine-specific timing thresholds.

## Initial results, 2026-10-12

Three isolated trials per case/mode, three-second refinement windows. Report: `.local-tools/search-benchmarks/retained-turn-baseline.json`.

| Reading | Baseline median | Retained hybrid median |
|---|---:|---:|
| First reading, reusable position | 241 ms | 240 ms |
| Reading after observed turn | 127 ms | 2.5 ms |
| First reading, four-by-four | 1,241 ms | 1,319 ms |
| First reading, persistent effects | 355 ms | 381 ms |
| First reading, Herdier/Wingull | 456 ms | 466 ms |

The reuse case matched retained evidence in all three trials. Both modes returned 6.25% in every rare-critical trial, and the hybrid completed exact first-turn enumeration there. The complex cases did not finish their full refinement budgets within three seconds. Their hybrid root sample counts were lower because time also went into exact turn enumeration and descendant evaluations. These measurements demonstrate fast reuse in the synthetic handoff case, not a general speedup or calibrated accuracy on real battles.

## Exact/hybrid race comparison

Three trials of actual service workers, with startup included. Report: `.local-tools/search-benchmarks/search-race-baseline.json`.

| Metric | Single-worker fallback | Two-worker race |
|---|---:|---:|
| Easy ending, first reading | 945 ms | 1,081 ms |
| Reusable position, first reading | 1,130 ms | 1,242 ms |
| Reusable position, observed next turn | 5 ms | 11 ms |
| Herdier/Wingull, first reading | 1,383 ms | 1,530 ms |
| Herdier/Wingull, process RSS | 396 MB | 629 MB |

The race consumed roughly twice the CPU in these windows and did not demonstrate a latency improvement. It remains available for experimenting with certificate coverage. The server therefore retains the single-worker fallback as its default. To enable the race, set `POKEPULSE_SEARCH_MODE=race` in the server's environment before starting it; remove that variable or set it to `fallback` to restore the default. Restarting the server is required. The meter's percent format remains unchanged.

Before enabling it by default, add warm-worker latency and certificate-coverage cases, then try a shorter exact probe or sequential worker warmup. Measure gains against the extra memory and CPU rather than relying on worker count.

## Bound-pruning comparison

```powershell
node scripts/benchmark-bound-pruning.mjs
```

The report compares enabled/disabled branch pruning in controlled solved games, then runs the synthetic Herdier/Wingull native matchup in isolated processes with alternating order and equal time budgets. `boundPruning: false` disables the new action/branch and confidence pruning; the shared matrix solver still uses equivalent matrix reductions in both modes. The benchmark is for the additional search pruning, not a historical executable comparison.

Initial report: `.local-tools/search-benchmarks/bound-pruning-baseline.json`.

| Controlled game | Disabled transition calls | Enabled transition calls | Same solved value |
|---|---:|---:|---:|
| Recursive dominated chance tail | 68 | 4 | 0.8 |
| Frontier componentwise dominance | 134 | 70 | 0.9 |

The native matchup's median first reading was approximately 328 ms disabled and 331 ms enabled. This fixture did not demonstrate an overall speedup. Controlled games demonstrate skipped work with unchanged answers; additional real-shaped cases are needed to measure how often the pruning helps.

`test/bound-pruning.test.mjs` independently checks 625 small matrix-game values, preservation of mixed strategies, chance-tail mass, threshold proof reuse, confidence epoch resets and native state identity safeguards.
