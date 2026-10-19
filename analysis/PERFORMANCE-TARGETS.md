# Poképulse prediction performance target

Updated user goal: the 300 ms target supersedes the earlier one-second target. This is a development target, not a hard requirement or a guarantee for every battle:

- Publish an initial usable estimate in **under 300 milliseconds** of a stable battle decision state, including a cold search.
- That initial estimate should be within **10 percentage points of the correct win probability** under the selected opponent model and supported battle scope.
- Continue refining after the first 300 ms. The existing final display target remains one percentage point, shown as a plain whole-number percentage.
- A first prediction arriving at or after 300 ms falls short of the latency goal, even if it is accurate.

Measure latency from accepting the observation to publishing the usable result, including decoding, dispatch, policy construction and search. Report cold and reused-state timings separately. Do not count a placeholder, a stale prior matchup, or an uninformed midpoint as meeting the initial-estimate target.

Measure accuracy against an independent exact solution where practical. For larger cases use a documented reference and distinguish reference agreement from independently established accuracy. Passing one fixture, convergence of a biased search, or adding more samples does not establish this target across all battles.

An early version of the native continuation policy took roughly five seconds to publish an initial estimate in a Buneary replay. Broad first-turn coverage reduced core replay timings to roughly 0.5-0.7 seconds. These measurements exclude worker startup, decoder and UI latency, and do not establish the 10-percentage-point accuracy goal. Improving and measuring end-to-end latency while retaining the mechanics corrections is a development priority.

The warm core benchmark now records a strict-before-300ms checkpoint alongside
historical one-second checkpoints. Old reports without a 300ms observation do
not pass the new goal retrospectively. Keep application/worker startup, fresh
ready-worker search, retained-turn reuse, and UI animation timings distinct.
