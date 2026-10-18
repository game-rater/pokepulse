# Poképulse prediction performance target

User goal, recorded October 17, 2026. This is a development target, not a hard requirement or a guarantee for every battle:

- Publish an initial usable estimate within **one second** of a stable battle decision state, including a cold search.
- That initial estimate should be within **10 percentage points of the correct win probability** under the selected opponent model and supported battle scope.
- Continue refining after the first second. The existing final display target remains one percentage point, shown as a plain whole-number percentage.
- Five seconds to produce the first estimate falls short of the goal.

Measure latency from accepting the observation to publishing the usable result, including decoding, dispatch, policy construction and search. Report cold and reused-state timings separately. Do not count a placeholder, a stale prior matchup, or an uninformed midpoint as meeting the initial-estimate target.

Measure accuracy against an independent exact solution where practical. For larger cases use a documented reference and distinguish reference agreement from independently established accuracy. Passing one fixture, convergence of a biased search, or adding more samples does not establish this target across all battles.

An early version of the native continuation policy took roughly five seconds to publish an initial estimate in a Buneary replay. Broad first-turn coverage reduced core replay timings to roughly 0.5-0.7 seconds. These measurements exclude worker startup, decoder and UI latency, and do not establish the 10-percentage-point accuracy goal. Improving and measuring end-to-end latency while retaining the mechanics corrections is a development priority.
