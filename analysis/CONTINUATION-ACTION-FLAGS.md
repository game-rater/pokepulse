# State flags for continuation choices

`action-usefulness.mjs` inspects the current native battle state and move
definitions. It does not query trainer AI, predict the opponent's next move,
or assume a particular opponent choice. The same flags apply to either side.

The first flags are:

* First-turn-only moves after their eligibility has expired.
* Singles moves with no battle effect or no valid ally target.
* Pure self boosts with every affected stat already at its effective limit,
  accounting for Contrary and mixed positive/negative boosts.
* Pure self recovery at full HP, only when it would act before every legal
  opponent move. Slow heals, speed ties and uncertain priority remain available.
* Redundant direct statuses and selected static status immunities, where the
  move would act before every opponent choice and no unmodeled callback is involved.

## Flags versus waiting

A failed move can still be a useful way to pass time. The selector retains
waiting choices when statuses, items, timers, counters, contact/recoil effects,
reactive moves or scarce attack PP could matter. It also retains native legal
choices if every option is flagged; it never invents premature Struggle.

One regression demonstrates why this matters: at one HP against a poisoned foe
with Rough Skin, an expired Fake Out can wait for poison to win, whereas Tackle
loses through contact damage. The flag correctly records Fake Out's direct
failure while the continuation policy correctly retains and selects the wait.

Unknown move callbacks and move-triggered ability/item interactions remain in
native simulation. This deliberately leaves some ineffective actions unfiltered.
The checks are conservative approximations, not a claim to recognize every
dominated strategy or every useful wait in the full game.

## Ownership and scope

The flag module owns classification and conservative selection. The continuation
policy owns move-pair probes and strategy selection. Cached policies expose
per-slot reasons, filtered slots and whether waiting was retained. Policy version
4 invalidates older continuation and sampled-root caches; the diagnostic option
`filterUselessTurns: false` has a separate cache key.

These flags narrow optimized rollout continuations. Native legal move lists,
root comparisons, retained exact turn graphs and certified proof providers stay
complete. Externally supplied fixed move distributions keep their original
support and probability mass; usefulness flags cannot silently rewrite them.

Server report hashing and all three search benchmark drivers include the new
module. The packaged runtime is synchronized separately from tests.

## Checks and performance

The dedicated tests cover both sides, Contrary, partial boosts, healing order,
priority/ties/Trick Room, status interactions, preserved waiting, exhausted PP,
cache separation and native execution agreement. Recovery/setup benchmarks keep
their original independent references. Flags do not solve the deeper problem of
choosing between productive setup and attacking when both have delayed value.

### Recorded measurements, 2026-10-18

`scripts/benchmark-continuation-choices.mjs` alternates enabled/disabled flags
with fresh policy caches and warmed temporal features. Twelve observations per
mode gave these median construction times:

| Position | Disabled | Enabled | Native policy probes |
| --- | ---: | ---: | ---: |
| Capped Swords Dance | 16.00 ms | 1.10 ms | 4 to 0 |
| Faster Recover at full HP | 16.34 ms | 1.19 ms | 4 to 0 |
| Sleep immunity with guarded waiting | 15.90 ms | 15.74 ms | 4 to 4 |

The third case is a retained-action control: the flag exists, but the conservative
waiting guard keeps the move. These are policy-construction microbenchmarks,
not overall engine speedups. Raw readings and source hashes are in
`benchmarks/continuation-action-flags-2026-10-18.json`.

Two warm minimax trials for each of the seven unchanged recovery/setup cases
met the early accuracy goal in 13/14 runs; all final estimates were within ten
points. One `strategy-setup-120` run still showed 1% by one second against the
11.92626953125% reference. See `benchmarks/strategy-action-flags-assessment-2026-10-18.json`
and its underlying minimax report. This small timing-sensitive sample does not
establish a general accuracy improvement over the previous 12/14 minimax result.

The full regression run passed 516 tests. The final dedicated module passed
all ten tests, including an additional poison/contact waiting regression.
