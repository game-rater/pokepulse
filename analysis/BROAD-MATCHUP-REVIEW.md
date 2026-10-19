# Broader matchup response review

## Findings

The first estimate still misses the under-300-ms goal in these broader cases.
The expensive path repeatedly restores native battle objects and executes move,
status and residual probes before every root move pair has adequate coverage.
No graphics or emulator execution participates in this computation.

Two experimental event-dispatch shortcuts did not help and were removed.
The retained changes operate inside the shared temporal feature evaluator:

1. Reuse native capability probes across HP/PP histories only when their
   dependencies allow it. The cache keeps stats, boosts, types, statuses,
   uncertainty and other mechanics in its key. Dynamic callbacks, HP-dependent
   attacks, recoil, drain, multi-hit moves, items, abilities, volatiles and field
   interactions decline this reuse. Declarative healing retains the actual HP
   used by its wounded-health probe. Future Struggle uses its existing full-HP
   probe and native max-HP recoil.
2. Ask the native engine whether any Update/Residual handler or duration clock
   exists. If none exists, the passive forecast is constant and requires no
   additional battle copies or residual ticks. This check includes Pokémon,
   slots, sides, field and battle handlers. Active effects retain their timelines.

These are computation reuse changes, not a new damage approximation or an NPC
policy. They do not certify an approximate search as an exact battle solution.
Caches are bounded, and an explicit benchmark opt-out allows comparison
against the original uncached native probes.

## Measurements

Three trials per configuration, separate processes with engine initialization
excluded, alternating enabled/disabled order. Two seconds of refinement per run.
Local application load is uncontrolled; these small samples are not guarantees.

| Core workload | Previous median first estimate | Optimized median | Change |
| --- | ---: | ---: | ---: |
| Four-by-four strategic move pairs | 939 ms | 847 ms | 10% faster |
| Herdier/Wingull | 1,055 ms | 636 ms | 40% faster |
| Confusion, Toxic and healing-item effects | 426 ms | 428 ms | Essentially unchanged |

The optimized four-by-four trials ranged from 840 to 951 ms. Herdier/Wingull
ranged from 631 to 643 ms. The persistent-effects case had one slower 1,113 ms
trial, alongside 427 and 428 ms; its tail remains a concern.

The real normalizer/ready-worker/publication path for Herdier/Wingull took
836–881 ms in three further trials. It excludes worker startup, RAM-file decoding,
HTTP polling and visual animation. It does not meet 300 ms.

These broad fixtures have no registered independent win-probability solution.
Consequently these timings do not establish the ten-percentage-point accuracy
goal. Regression comparisons establish agreement of optimized feature values
with uncached native execution; that is a different claim.

The measured A/B report retains its feature-source SHA-256 and full timing traces
in the ignored `.local-tools/broad-final-ab.json`. Additional rejection guards
for crash and Steel Beam recoil were added afterward; neither move occurs in
the measured workloads.

The complete correctness suite passed **591 tests**, with no failures, skips or
cancellations.

## Regression checks and reproduction

`test/feature-probe-reuse.test.mjs` checks actual probe reuse, all legal first-turn
move pairs in the three broad fixtures, HP/PP changes, healing, future Struggle,
and rejection/parity for variable-power attacks, Pain Split, drain, recoil,
multi-hit attacks, Multiscale, Defeatist, held items, confusion, Substitute,
paralysis, burn and weather. The baseline and optimized evaluators must agree on
all feature values; the passive step count may differ when no steps are needed.

Run timing comparisons separately from correctness tests:

```powershell
node scripts/benchmark-retained-turn.mjs --group=broad --mode=hybrid --seconds=2 --trials=3 --feature-probe-reuse=off
node scripts/benchmark-retained-turn.mjs --group=broad --mode=hybrid --seconds=2 --trials=3 --feature-probe-reuse=on
node scripts/benchmark-live-response.mjs --case=herdier-wingull --trials=3
```

The benchmark records the probe-reuse setting for each row. Application/worker
startup remains separate from the prediction target.

## Remaining work

Most remaining cost is native probing in states with interacting effects,
especially continuation-policy construction. Reusing more of that work needs
explicit dependency boundaries for abilities, items and field effects. Broader
independent probability references are also needed before faster early estimates
can be judged against the ten-point goal. Fewer samples or a cheaper early
evaluator should be evaluated against those references before adoption.
