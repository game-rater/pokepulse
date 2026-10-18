# Recovery and setup strategy references

These seven synthetic Run & Bun active-pair positions test decisions whose value
depends on later turns. They do not reproduce recorded battles or include switches.
The opponent has one move, so minimax and NPC move selection have the same true
probability. This isolates strategy evaluation from trainer AI.

## Independent targets

| Case | Optimal win chance | Purpose |
| --- | ---: | --- |
| recover-1 | 18.0671922863% | Recover is necessary; damage rolls and critical hits can still defeat it. |
| recover-35 | 98.0502669699% | Healing preserves a nearly certain toxic-stall win. |
| recover-70 | 98.8788306713% | Immediate damage slightly beats immediate healing. |
| setup-35 | 100% | Both openings can win; avoid inventing a setup requirement. |
| setup-90 | 100% | Swords Dance first wins; attacking first gives only 13.9775335789%. |
| setup-120 | 11.9262695313% | Setup is the best opening, but still needs favorable later damage. |
| setup-too-late | 6.25% | Setup loses; an immediate critical attack is the only win. |

The reference dynamic program explicitly backs up HP, target HP, Attack stage,
turn number and remaining move PP. It enumerates all sixteen damage rolls and
the Run & Bun 1/16 critical probability, chooses the best remaining action at
each observed state, and applies action order, healing, retaliation and toxic.
It rejects unsupported abilities, items, status, fields, move effects, speed
order and any reachable Struggle continuation. It has a finite work limit;
failure to finish cannot become a target.

Damage formulas come from the bundled calculator, independently of production
search and the native simulator. This is not complete implementation independence:
both implementations describe the same game, and the calculator remains a shared
dependency elsewhere in the tool. Tests compare every normal and critical damage
roll with the native engine at multiple setup stages, plus native healing, toxic
timing and setup order. An explicit Steadfast ability prevents the calculator
from supplying Machamp's default Guts for an empty ability.

Targets and exact input fingerprints are frozen in
`scripts/benchmark-references.json`. Never replace a target with a later search
estimate. Re-prove any changed input.

## Running

```
node --test test/strategy-benchmarks.test.mjs
node scripts/benchmark-retained-turn.mjs --group=strategy --require-reference --mode=hybrid --seconds=3 --trials=2 --out=analysis/benchmarks/strategy-minimax-2026-10-18.json
node scripts/benchmark-retained-turn.mjs --group=strategy --require-reference --mode=hybrid --opponent-model=npc-ai --seconds=3 --trials=2 --out=analysis/benchmarks/strategy-npc-2026-10-18.json
node scripts/check-strategy-benchmarks.mjs analysis/benchmarks/strategy-minimax-2026-10-18.json analysis/benchmarks/strategy-npc-2026-10-18.json --out=analysis/benchmarks/strategy-assessment-2026-10-18.json
```

Run timing benchmarks after the regression suite, sequentially. Native engine
preparation is excluded, so these are warm-search measurements, not startup,
decoder, overlay or end-to-end live latency measurements. Assessment checks the
one-second, ten-percentage-point goal and the final error separately; the goal
is not a universal guarantee. The assessment command deliberately exits with a
failure when a measured case misses it.

No new production proof provider or matchup-specific scoring rule is introduced.
These references establish evidence for subsequent general search improvements.

## Measurements on 2026-10-18

Two sequential trials per position and opponent model produced 28 measurements.
The report is `benchmarks/strategy-assessment-2026-10-18.json`; the two underlying
reports preserve inputs, source hashes, reference action values and raw readings.

* 25/28 met the one-second accuracy goal and final-error check.
* All 28 final estimates were within ten percentage points of their references.
* Three early misses were `strategy-setup-120`: both minimax trials and one NPC
  trial showed 1% by one second, versus the independently enumerated 11.92626953125%.
* The other NPC trial showed 12.5% by one second. Its true reference is identical;
  these runs do not demonstrate a trainer-policy advantage.
* The low-HP recovery case finished at 13.671875% versus 18.067192286252975% in
  every trial. It passes the stated goal but still exposes residual bias.

This is evidence of remaining early-estimate instability, not a successful fix
for it. A promising general next experiment is to integrate terminal chance
distributions more broadly, including endings with additional legal but losing
move choices. The current sampler only attempts its small exact-ending integral
when both sides have a single legal continuation action. Any expansion must
preserve policy weighting and simultaneous decisions, remain bounded, and be
measured against these unchanged references and existing benchmarks.
