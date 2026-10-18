# Shared position evaluation

## Ownership

`position-evaluator.mjs:evaluatePosition` is the single public orchestration entry. `analyzeBattle`, `simulateCompleteMoves` and the sampled-search compatibility facade delegate to it. It selects eligible proofs, looks up solved values, and chooses the fallback engine. Engine implementations do not import proof providers.

```mermaid
flowchart TD
  A[Battle analysis / compatibility APIs] --> E[Position evaluator]
  E --> C[Solved-value cache]
  E --> P[Registered proof providers]
  E --> F[Fast bounded model]
  E --> N[Native bounded search]
  E --> R[Retained native search]
  E --> S[Sampled native search]
  N --> K[Shared continuation evaluator]
  R --> K
  S --> K
  K --> C
  K --> P
  P --> M[Native battle mechanics]
  N --> M
  R --> M
  S --> M
```

- **Native mechanics:** `native-battle.mjs` creates/restores battles, applies live state, enumerates chance and exposes legal moves. It does not import search orchestration.
- **Native input and bounded search:** `native-search.mjs` validates/prepares native inputs once and runs the bounded native adapter. Its continuation resolver comes from the evaluator.
- **Approximate strategies:** `sampled-search.mjs` and `retained-turn.mjs` implement their strategies and use the supplied evaluation context for continuation proofs. They have no knowledge of the fixed-retaliation solver. A solved child updates retained bounds without being counted as a Monte Carlo rollout.
- **Proof providers:** `exact-endgame.mjs` declares a cheap snapshot applicability filter and a guarded native solver. It does not prepare snapshots, own session caches, choose search engines or format forecasts. Adding another proof provider requires registering it in the evaluator, not editing search loops.
- **Result contract:** the evaluator formats proof results with coincident bounds and provenance under `proof`. Existing `result-contract.mjs` continues to classify all final engine outputs. Approximate continuation use never converts the surrounding sampled calculation into a certificate.
- **Compatibility:** `complete-moves.mjs` and `sampled-moves.mjs` retain their public export names as small facades. Internal mechanics consumers import the mechanics module directly, so mechanics no longer depend on forecast initialization. The old `exactEndgameChecked` flag and the separate snapshot/native proof-result helpers are removed.

## Evaluation flow

1. When a native-capable caller supplies a snapshot, determine whether a proof or native route needs native preparation. Unrelated legacy positions avoid that cost.
2. Validate and prepare the native position once when needed. Missing input prevents proof publication.
3. Look up a solved value using solver version, complete native state key, opponent model and NPC options. The bounded cache lives in `session.positionValues` and survives worker context updates.
4. Try enabled proofs at most once per native state during this evaluation. A failed or timed-out attempt is not permanently cached; a later pass may retry. Warm-only requests only look up existing proofs. Cancellation and deadlines prevent proof work and publication.
5. On a proof miss, dispatch to the selected engine. Native search continuations reuse the same context, cache and proof-attempt set. Continuation probes do not recursively start another full search.

The fast bounded model retains its own compact state representation and internal search cache. Native continuation proofs require lossless native state; the evaluator does not invent missing native history to apply them to compact states. Its root still passes through the common proof and dispatch stage.

## Regression coverage

New evaluator contract tests verify shared snapshot/native/continuation caches; opponent-model isolation; one failed proof attempt per evaluation with later retry; legacy fallback exactly once; no proof work on missing data, cancellation or an uncached warm-only request; invalidation on changed native input; and shared continuation use in both bounded and sampled native search. Dependency-boundary tests keep mechanics and strategy implementations independent of proof providers.

The existing exact-target, live-first-result, status/item/counter rejection, worker lifecycle and battle progression tests remain in place. Proof equations and battle-mechanics guards are unchanged by this reorganization. The legacy diagnostic `exact_endgame` field is replaced by generic `proof` provenance; scores, bounds and display contracts remain unchanged.

## Validation after consolidation

All 421 tests passed. The six proved-complex cases were rerun under minimax and NPC scoring: the same three eligible cases return exact targets with zero rollouts, while status/item cases retain sampled fallback behavior. Eligible warm first estimates were 18-30 ms across these exploratory single-trial runs. Three preloaded live-worker trials published the correct 81% as the first result in 151-185 ms. Initialization is excluded from that decision timer and recorded separately.

Reports: `analysis/benchmarks/shared-evaluator-minimax-2026-10-18.json`, `shared-evaluator-npc-2026-10-18.json`, and `shared-evaluator-worker-2026-10-18.json`. These measurements check for a material regression on this suite, not statistical equivalence or universal latency.
