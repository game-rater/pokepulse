# Early tactical coverage

The default tactical horizon is four turns. A bounded pilot prioritizes status
and setup action pairs before broad, expensive heuristic leaf evaluation. A
covered decisive row or column can supply an early sampled estimate without
waiting for unrelated pairs. Unvisited pairs remain [0,1] when checking whether
they could change that estimate; this is conditional reasoning about the sampled
table, never a battle certificate. The pilot yields back to broad coverage when
its work allowance is exhausted. Further samples refine that horizon; they do not extend to 12 or 24
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

Continuation policies scan native terminal results before evaluating heuristic
leaves. A terminal anchor win prioritizes completing its row; a terminal loss
prioritizes its column. Nonterminal probes replay their same pair-specific seeds
for later feature evaluation. Both sides receive this treatment. Policies also
recognize pure saddle points without fictitious-play pseudocount leakage. These
shortcuts select approximate policies, not exact battle certificates.

The pilot allowance is 300ms of current-thread CPU work where supported, falling
back to wall time on older runtimes. Time slices remain bounded by wall time.
Workers warm generic scoring and native mechanics in separate disposable caches
before announcing readiness; no live state or benchmark fixture is preloaded.

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

## Targeted latency investigation

The original scheduling profiler spent approximately 1.8s completing 48 shallow
samples before the decisive status line was allowed. The corrected pilot visits
12 samples: four opposing replies times three native sleep durations. The public
synthetic regression verifies this work count and zero unrelated feature values,
in both orientations. Timing assertions are separate from concurrent unit tests.

Three direct warmed-engine replays of the reported state reached 1% in 135–214ms.
Three subsequent preloaded-worker trials, including normalization, competing
exact search, and result publication, reached 1% in 300–389ms. These worker trials
exclude startup, emulator decoding, HTTP polling and meter animation. Startup now
includes the generic warmup described above. The 300ms goal is still not reliably
met end to end; a direct-engine measurement must not be presented as live latency.
