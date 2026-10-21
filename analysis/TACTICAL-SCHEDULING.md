# Early tactical coverage

The first sampling pass covers the root action pairs and their small first
chance branches. Once covered, two-turn samples begin immediately. Status,
volatile and setup actions receive extra work until their two-turn estimator
is available. This is symmetric between player and opponent; it does not use
trainer AI. Fixed NPC probability mode retains its separate weighted allocator.

Continuation policies recognize pure saddle points without fictitious-play
pseudocount leakage. Completing a sampled terminal losing column can select a
reply before evaluating the rest of the policy table. This shortcut selects an
approximate policy: it is not an exact battle certificate.

Small first chance branches (two through four outcomes, including sleep
duration) use the native probabilities. New terminal epochs can replace the
shallow estimate once every such stratum has been observed. Unfinished heuristic
epochs retain their four-sample stabilization rule. Other chance events still
use probability-weighted native sampling.

Regression controls include both orientations of a sleeping-target finishing
attack, each available reply over two native turns at both chance extremes,
fixed NPC weights, chance coverage, scheduling fairness, and a full-HP target
that survives with one HP. These controls do not constitute exhaustive proof
for arbitrary battles or all internal random sequences.

Latency remains unresolved. A local warmed-engine diagnostic of the synthetic
50-HP Farfetch'd-Galar versus Breloom control reached the losing estimate in
about 3.6 seconds during concurrent test load. This is not a controlled benchmark
and does not meet the 300ms initial-estimate goal. Full root coverage and native
feature evaluation still dominate before the tactical forecast is published.
