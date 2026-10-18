# Battle-inspired benchmark baseline: 2026-10-18

Twelve constructed states across four documented Run & Bun matchup families were measured separately against minimax and the community NPC model. This is one exploratory trial per state/model, with a ten-second refinement window. Cases use ordinary moves, stats computed by the Run & Bun calculator, and pinned community trainer sets. They are not exact video replays and have no independent full-matchup accuracy oracle.

The machine's existing background workload was left running. These numbers are a local baseline, not hardware-independent limits or distributions of tail latency.

## Warm engine

| Opponent model | States with a usable score by 1 second | First estimate range | Largest measured pass | Largest sampled process RSS |
|---|---|---|---|---|
| Minimax | 11 / 12 | 0.44–1.38 seconds | 189 ms | 430 MB |
| Community NPC model | 12 / 12 | 0.13–0.70 seconds | 218 ms | 432 MB |

The minimax timing miss was `togedemaru-cinccino-chipped`, whose first usable estimate arrived at 1.38 seconds. Module/native-engine initialization is excluded from this table. The NPC path uses a weighted opponent policy and its sampled continuation path; these are different probability questions, not interchangeable algorithms producing the same expected answer.

### Initial reconstructed states

Scores are rounded here for readability; raw readings are retained in the JSON artifact.

| Matchup | Minimax first estimate | Minimax score at 1s → 10s | NPC first estimate | NPC score at 1s → 10s |
|---|---|---|---|---|
| Drednaw / Lunatone | 0.93 s | 63% → 62% | 0.64 s | 77% → 85% |
| Monferno / Scraggy | 0.80 s | 79% → 80% | 0.48 s | 85% → 88% |
| Hariyama / Porygon2 | 0.82 s | 36% → 34% | 0.46 s | 48% → 51% |
| Togedemaru / Cinccino | 0.94 s | 53% → 53% | 0.28 s | 83% → 97% |

The Hariyama scenarios include Porygon2's +1 Special Attack Download boost against the constructed equal-defense Hariyama. The original three zero-boost states were corrected and rerun under both models; their preliminary measurements are excluded. Unchanged snapshots in the other nine cases reuse the original measurements, with per-input fingerprints checked during result assembly. Source-run hashes distinguish the measurements.

## Stability problems exposed

- Boosted Scraggy against Monferno, minimax: 65% at one second, 76% at ten seconds.
- Paralyzed Hariyama against Porygon2, NPC model: 61% at one second, 72% at three seconds, 46% at ten seconds.
- Chipped Togedemaru against Cinccino, NPC model: 71% at one second, about 98% at ten seconds.
- Previously protected Togedemaru against Cinccino, minimax: 38% at one second, 68% at three seconds, 46% at ten seconds.

These changes identify unstable early forecasts. They do not measure absolute prediction error: the later score is another approximate estimate. The benchmark does not establish the goal of being within ten percentage points of the correct probability during the first second.

## Actual worker startup

The same four initial states were also run through `SearchService`, with five-second windows. Worker startup is included; emulator observation, bridge latency, server transport, and UI painting are still excluded.

| Matchup | Single-worker fallback: first score | Two-worker race: first score |
|---|---|---|
| Drednaw / Lunatone | 2.43 s | 3.42 s |
| Monferno / Scraggy | 2.07 s | 2.68 s |
| Hariyama / Porygon2 | 2.43 s | 2.63 s |
| Togedemaru / Cinccino | 2.35 s | 2.66 s |

The race was slower to its first score in all four exploratory measurements. These are newly started workers, not timing of a new turn using an already running worker. Existing `reusable-next-turn` measurements cover a simpler retained-state handoff; the twelve constructed positions are independent starts rather than a recorded battle trajectory.

## Reproduction and evidence

See `SEARCH-BENCHMARKS.md` for commands and `REAL-BATTLE-BENCHMARK-CANDIDATES.md` for original battle sources. `benchmarks/real-battle-baseline-2026-10-18.json` contains the input snapshots, source provenance, source hashes, per-input fingerprints, score traces, and worker results. It contains only public/synthetic battle data.

Priorities suggested by these measurements are early-estimate stability, worker readiness/startup, and an independent accuracy reference for each matchup. Repeated trials and an actual reader-to-overlay timing measurement remain necessary before making stronger performance claims.
