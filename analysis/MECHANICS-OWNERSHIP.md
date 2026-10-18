# Battle prediction: rule ownership

The architecture has accumulated duplicated rules. This document defines their boundaries and the remaining duplication; it does not claim that refactoring has eliminated every interaction bug.

| Responsibility | Owner | Check |
|---|---|---|
| Observed HP, base stats, stat stages, statuses, counters and identity | `run-bun/memory.mjs`, `live-effects.mjs`, `identity.mjs` | Decoder fixtures and snapshot reconstruction |
| Which engine supports the snapshot | `analysis/mechanics-contract.mjs`, `requiresCompleteMoves` | Scenario routing checks |
| Native move, ability, item and end-of-turn execution | Vendored Showdown engine and Run & Bun overrides | Native turn scenarios and cross-engine comparisons |
| Reproducible Run & Bun overrides | `scripts/configure-complete-move-engine.mjs` | Imported definitions and calculator parity |
| Fast-model execution for its supported subset | `outlook.mjs`, `turn-mechanics.mjs`, `secondary-effects.mjs`, `held-items.mjs` | Exact small-battle oracles and native comparisons |
| Choosing strategies and propagating chance probabilities | `search.mjs`, `sampled-moves.mjs`, `continuation-policy.mjs` | Analytic games, weighted outcomes and continuation scenarios |
| State equivalence and retained values | `observation-key.mjs`, `retained-turn.mjs` | Rerooting and changed-state rejection checks |
| Publishing a result for the right live matchup | `run-bun/search-service.mjs`, `server.mjs` | Stream and stale-result checks |

## Capability rule

The fast model has an explicit ability/item allowlist in one capability contract. Anything outside that contract uses native execution. A known move, a damage-calculator entry, or the absence of a definition callback does not establish support. Blunder Policy, for example, executes inside core engine code.

The contract selects an engine; it contains no damage or effect formulas. Native overrides belong in the reproducible configuration script, not the move picker. A fast-path addition needs behavior coverage for the relevant interactions, not just a routing assertion.

## Scenario audit structure

Checks distinguish:

1. **Routing:** does a snapshot reach an engine that implements its interactions?
2. **Execution:** what happens over the actual turn, including failure, consumption and expiry?
3. **Evaluation:** do changed stats, legality, health and outcome probabilities affect unfinished estimates?
4. **Reuse and publication:** does the saved value belong to this state and this matchup?

`test/scenario-audit.test.mjs` groups the additional interaction checks by these categories. Existing progression, retained-turn and stream suites cover successive observations. Routing coverage is not equivalent to ROM verification or accurate strategic prediction.

## Remaining work

The fast model still duplicates a subset of native mechanics. The current fix makes that boundary explicit and conservative; it does not unify the implementations. Continuation strategy probes and cutoff values remain approximations. Keep adding cross-engine behavior comparisons around the supported fast subset, and measure both latency and accuracy using `PERFORMANCE-TARGETS.md`.
