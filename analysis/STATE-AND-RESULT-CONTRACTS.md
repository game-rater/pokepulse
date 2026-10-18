# Observation, simulation, and result boundaries

## Result certainty

`result.prediction` is the publication contract. `analysis/result-contract.mjs` owns its classification and display estimate; the worker race uses the same rules when deciding whether a resolved certificate can replace a sampled estimate.

| Kind | Meaning |
|---|---|
| `blocked` | Required input is missing. No displayed estimate or certificate. |
| `unavailable` | No valid bounds or usable estimate. |
| `estimate` | A sampled or heuristic forecast. Completing its sample budget does not prove its value. |
| `bounded` | Certified lower and upper bounds within the modeled game. Completion at a tolerance leaves an interval. |
| `proven` | The modeled bounds coincide within numerical precision. This does not establish ROM parity. |

`prediction.estimate` holds a point and its basis. `prediction.certificate` is a separate interval or null. `prediction.search` distinguishes searching, paused, blocked, sample-budget-finished, tolerance-resolved, and proven results. The legacy `victory`, `outlook`, and `display_score` fields remain available. The meter still renders a plain rounded percentage.

An approximate result cannot become certified through `complete`, a narrow confidence interval, a reused value, or a finished sample budget. A blocked result cannot win the race as a completed exact result. Legacy `next_turn_exact` describes an expanded first turn with estimated continuations; the new `next_turn` object names those properties separately.

## State boundary

`run-bun/battle-state.mjs` defines a versioned, named `SearchRequest`. The service clones it before dispatch. Workers receive species, rules, HP, builds, field, effects, live values, and provenance as named fields. `searchArguments` is the compatibility adapter for the existing scoring API; native simulated states and their canonical cache keys remain owned by the engine.

`normalizeSnapshot` validates observations and copies mutable effects. Profile validation now includes exact HP/stats and PP instead of validating only the percentage/build subset. Inconsistent exact HP and percentages are rejected at this boundary.

Provenance identifies an emulator observation, a diagnostic submission, or an unattributed caller. It records supplied paths, unknown values, and defaulted assumptions. Supplied does not mean measured: for example an adapter can supply a placeholder nature and mark it unknown. Missing counters are not rewritten into observed zeros. Provenance is carried into published results but does not enter mechanics cache keys; it cannot itself certify input completeness.

This is an incremental boundary refactor. It does not replace native state serialization, unify engine implementations, or remove legacy result fields.

## Scenario and benchmark organization

| Concern | Existing scenario suites | Benchmark evidence |
|---|---|---|
| Result publication and stale versions | `search-service`, `search-race`, `refinement` | certainty kind and certificate width at each reading |
| Observation and counters | `memory`, `live-effects`, `move-inputs` | persistent-effects fixture |
| Execution and evaluation | `scenario-audit`, `complete-moves`, `outlook`, `continuation-policy` | analytic finishing and critical-hit fixtures |
| Reuse after a turn | `retained-turn`, `sampled-moves` | reroot latency and retained samples |

The retained-turn benchmark now records the latest usable result actually available by 1,000 ms and compares it with an analytic reference where available. Missing references remain null; they do not count as accuracy successes. A pass finishing after the deadline does not supply a retrospective first-second result. Engine/module initialization remains excluded, so these timings are not end-to-end overlay latency.

`test/prediction-contract.test.mjs` covers sampling finished with `complete:true` remaining an estimate, tolerance-resolved bounds remaining an interval, blocked results losing the worker race, supplied false/zero values, unknown counters, mutation isolation, and exact HP/PP validation through the scoring entry point. Benchmark timings still require a separate measured run.
