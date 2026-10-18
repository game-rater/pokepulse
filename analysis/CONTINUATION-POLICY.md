# Continuation strategy audit and changes

## What changed

The previous continuation picker compared hand-written damage scores and a small list of status bonuses. Executable move definitions did not make that strategy correct: conditional failures, stat changes, ability immunity, item activation and useful defensive turns could be missed.

`continuation-policy.mjs` now executes candidate move pairs as complete native turns. Both sides' choices are evaluated together, including their order, failures, damage, status/stat changes, recovery, items and residual effects. A small mixed-strategy solver selects continuation distributions; NPC mode keeps its separate NPC distribution and evaluates the player's responses against it.

Each candidate pair currently receives two deterministic, seeded native probes. These help select a strategy; they are not an exhaustive chance enumeration or a proof of optimal play. The actual trajectory samples still use native outcome probabilities.

The finite-horizon evaluator uses isolated native move execution for attack pressure. Using the native damage formula by itself was also insufficient: ability immunity and move-success callbacks can run outside that function. Evaluation includes actual stat stages, defensive stats, speed/Trick Room, accuracy/evasion through native execution, remaining sleep tempo and Substitute health. It remains a heuristic, particularly for long setup sequences and conditional responses. No universal accuracy claim follows from having implemented callbacks.

## Other corrections

- Live actual stats also populate the native baseline stats used when restoring stats later.
- First-turn eligibility follows the engine's action counter, including loaded snapshots.
- Retained-turn initialization is neutral; an unvisited child's HP ratio cannot supply an apparently informed backed-up result.
- Cached continuation outcomes do not become empirical observations of an optimized new root. Retained values remain available as provisional starting estimates.
- Observation keys preserve relevant histories and distinguish exhausted first-turn eligibility while ignoring incidental RNG/log history.
- Stratification applies only to a stable first-turn chance event. Future policy choices cannot cause unrelated later events to share a stratum.
- Fast-path Toxic damage rounds the base tick before multiplying its stage, matching the native engine.
- A previous matchup's result is cleared when a different Pokémon enters during an animation; mixed identity/HP transition frames do not create a new terminal prediction.

## Responsiveness and limits

Early samples cover all initial move pairs with a short forecast before longer continuations are constructed. The search then deepens to four turns, the configured normal horizon, and the longer horizon for competitive pairs. Single-action races retain full trajectories. Confidence statistics restart when the trajectory horizon changes. The displayed estimate can still combine evidence from different horizons and is not a certified bound.

Policy construction resumes across time slices, uses bounded caches shared across retained nodes, and skips strategy construction when both sides have only one choice. Separate native probes do not mutate the actual trajectory's RNG, stats, items or requests.

Core replay measurements on the reported Buneary opening and following turn produced initial estimates in roughly 0.5-0.7 seconds after adding broad first-turn coverage. These exclude worker startup, decoder and UI latency; they do not establish the goal in `PERFORMANCE-TARGETS.md` or its 10-percentage-point accuracy target.

Regression fixtures are synthetic. Private bug reports are used only for local diagnosis and are not copied into distributable fixtures. Runtime source and the runnable package must stay synchronized.
