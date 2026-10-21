# Early tactical coverage

The default tactical horizon is four turns. The first sampling pass covers the
root action pairs and their small first chance branches. Once covered, four-turn
samples begin immediately. Further samples refine that horizon; they do not extend to 12 or 24
turns. An explicitly configured diagnostic horizon is honored without doubling.
Status, volatile and setup actions receive extra work until their tactical estimator
is available. This is symmetric between player and opponent; it does not use
trainer AI. Fixed NPC probability mode retains its separate weighted allocator.

At the final turn, a completed continuation response table is integrated using
the two sides' simultaneous policies. The rollout does not draw and re-execute
another action pair from that same table. Native outcomes remain sampled; this
is broad move coverage rather than exhaustive coverage of randomness. If both
sides have one forced action and no table was probed, that turn still executes.

The live exact worker is limited to four turns, with repeated time slices
refining that same horizon. Specialized analytic endgame proofs remain available.

Continuation policies recognize pure saddle points without fictitious-play
pseudocount leakage. Completing a sampled terminal losing column can select a
reply before evaluating the rest of the policy table. This shortcut selects an
approximate policy: it is not an exact battle certificate.

Small first chance branches (two through four outcomes, including sleep
duration) visit more likely outcomes first and use the native probabilities.
Rare outcomes are still covered before publication. New terminal epochs can replace the
shallow estimate once every such stratum has been observed. Unfinished heuristic
epochs retain their four-sample stabilization rule. Other chance events still
use probability-weighted native sampling.

Regression controls include both orientations of a sleeping-target finishing
attack, each available reply over two native turns at both chance extremes,
fixed NPC weights, chance coverage, scheduling fairness, and a full-HP target
that survives with one HP. These controls do not constitute exhaustive proof
for arbitrary battles or all internal random sequences.

Before this change, a local warmed-engine diagnostic of the synthetic 50-HP
Farfetch'd-Galar versus Breloom control reached the losing estimate in about
3.6 seconds. With the four-turn changes it took about 3.3 seconds. Both ran during
concurrent test load; this is not a controlled comparison and does not establish
a speedup. It does not meet the 300ms initial-estimate goal. Full root coverage
and native feature evaluation still dominate before the tactical forecast is
published.
