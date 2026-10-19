# Temporal feature evaluation and cache ownership

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `position-features.mjs` | Public API, feature-value lookup, and composition of probes with scoring |
| `native-feature-probes.mjs` | Isolated native execution, action capabilities, resumable passive timelines, and extraction of plain scoring facts |
| `feature-probe-reuse.mjs` | Conservative dependency guards and projected keys for reusable native probes |
| `temporal-feature-model.mjs` | Pure scoring of measured capabilities, finite resources, sleep and initiative |
| `feature-cache.mjs` | Feature cache factory, owner selection, diagnostics and explicit clearing |
| `bounded-cache.mjs` | Shared bounded lookup-cache mechanics and operation counters |

The scoring model imports neither the native engine nor caches. Native probes
do not choose a heuristic score. Reuse eligibility does not execute a battle or
change the damage formula. The public APIs and probability calculations remain
the same. This refactor does not change the search-result contract.

## Cache inventory

| Cache | Owner | Capacity | Key / validity boundary |
| --- | --- | ---: | --- |
| Temporal values | Feature owner | 1,024 | Observed mechanics and uncertainty, plus probe-reuse mode |
| Native action/passive work | Feature owner | 1,024 combined | Same observation/mode, profile kind and side |
| Reusable capability probes | Feature owner | 1,024 | Conservatively projected native mechanics, move and side |
| Definition eligibility | Worker Dex metadata | 1,024 | Identity of a pinned immutable move definition |
| Proved values | Evaluation session | 256 | Provider version, complete native state, opponent model and NPC options |
| Pending proof work | Evaluation session | 32 | Same provider/state/model key; resumed work keeps its prior promotion behavior |
| Sampled roots | Sampled session | 64 | Native state, policy version, horizon, opponent model/options and filtering |
| Continuation policies | Sampled session or retained graph | 2,048 | Observed state, policy version, NPC weights and filtering |
| NPC policies | Sampled session | 2,048 | Native state and NPC options |
| Terminal-turn expectations | Sampled session | 2,048 | Native state and selected move pair; null means an ineligible ending |

`BoundedCache` preserves Map iteration and lookup behavior. Insertion evicts the
oldest key, matching the former FIFO helpers; reading or replacing an entry does
not promote it. `putCached` preserves compatibility when callers supply ordinary
Maps. Pending proof work still explicitly deletes and reinserts resumed jobs.

Retained search graphs and bounded-search graphs retain their specialized
lifecycle. Evicting a retained node must detach parent/child links and release
snapshots, not just remove a lookup entry. Search certificates and frontiers
also keep their existing search-specific ownership. They are not converted to
automatic FIFO caches by this change.

## Feature owner lifetime

The worker explicitly constructs `createFeatureCaches({owner: ...})` and keeps
that owner across request-context changes. The position evaluator passes it to
root and continuation calculations, including retained child sessions. Work can
therefore be reused across observed turns without becoming a process-wide
implicit dependency.

Other callers can pass `options.featureCaches` explicitly. Otherwise a supplied
session lazily acquires `session.featureCaches`. Direct callers without either
keep a named worker-local default, preserving prior compatibility. Creating a
new feature owner isolates completed values and partial work from other owners.
Only immutable move-definition metadata is shared independently of feature owners.

Changing an observation causes a full-value miss; only probes whose dependency
guards allow the projected key may reuse prior capabilities. Changing probe-reuse
mode selects a separate feature/work namespace. Solver and policy keys preserve
their existing model/version isolation. No benchmark reference answer enters a key.

Use `clearFeatureCaches(owner, reason)` to explicitly discard all three feature
tables, including partial native timelines. It does not clear proof results or
search graphs. Worker termination releases worker-owned tables and metadata.
Changing compiled mechanics requires a new worker; do not relabel the key-schema
version of a populated cache to imply that its contents have been revalidated.

## Diagnostics

Each bounded lookup cache exposes `snapshot()` with name, owner label, unique
instance ID, key-schema version, capacity, size, get hits/misses, writes,
evictions, explicit deletes, clears and last invalidation reason. Hits/misses
count `get` calls; `has` is an uncounted membership check. False and null are
valid cached values. Snapshots contain no keys, Pokémon data or native objects.

`featureCacheStats(owner)` describes the three feature tables.
`probeDefinitionCacheStats()` describes the immutable-definition memo.
The retained-turn benchmark includes these and available proof/sampled-cache
snapshots under `cache_diagnostics`, outside the timed calculation.

## Validation

Before extraction, 178 characterization records were captured from synthetic
benchmark roots and broad first-turn outcomes, in both probe modes. All matched
exactly after the module split and ownership changes. These temporary records
verify refactor parity, not independent battle-probability accuracy.

Focused tests cover pure scoring, FIFO behavior, bounds, counters, owner isolation,
changed observations, explicit clearing, mode separation and partial-work
resumption. Existing mechanics and probability tests remain the correctness
authority. The full suite passed 600 tests with no failures, skips or cancellations,
separately from latency measurements.

One isolated broad-workload trial before/after the refactor measured first
estimates of 846/840 ms for four-by-four, 428/426 ms for persistent effects and
737/640 ms for Herdier/Wingull. This small, load-sensitive comparison shows no
observed latency regression; it does not establish a speedup or the 300 ms goal.
Cold worker startup remains excluded from these prediction measurements.
