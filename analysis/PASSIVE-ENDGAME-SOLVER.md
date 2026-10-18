# Bounded passive endgame solver

## What the prototype does

`passive-endgame.mjs` supplies a resumable proof provider to the shared position
evaluator. It builds a compact resource graph from the current position and
backs values up from terminal outcomes. The speed benefit comes from a known
finite passive deadline and compact HP/PP states; the simulator is not inverted
to generate arbitrary predecessor positions.

The provider compiles its transition amounts from isolated native Run & Bun
execution:

- The opponent's poison/Toxic timeline, including native Leftovers rounding and
  Toxic counters, is projected for at most 32 ticks.
- A native fixed-attack probe measures incoming damage before HP clipping.
  Stable type immunity can produce zero incoming damage.
- Each supported recovery move supplies its native heal amount.
- Full native turns supply Protect success/failure probabilities and successor
  counters, including failure reset and the native counter cap.
- A native residual probe supplies the player's passive heal amount.

Native shuffle ordering is suppressed only inside this guarded compilation:
all admitted tied residual effects act independently on their own Pokemon.
Action-order speed ties are rejected. Meaningful randomness, including Protect,
is explicitly enumerated. Full native witness replays and short exhaustive
native action/chance trees check the compiled model separately.

## Proof domain and resource states

The supported domain has one active Pokemon per side, Run & Bun mechanics, a
known existing poison/Toxic status on the opponent, and one accurate fixed-damage
opponent move with enough PP to last through the projected passive deadline.
There are no changing fields, side conditions, transformed forms, stat boosts,
player status, or unrelated volatiles. The only permitted items are Leftovers
and no item; permitted abilities are a small explicitly inert set. Protect's
known stall counter is admitted. Opponent moves with recovery, recoil, variable
power, accuracy rolls or additional callbacks are outside the domain.

Player actions modeled exactly are pure self-heals described by native heal
fractions, ordinary Protect effects (including Detect and Run & Bun Defend
Order), and Splash. Rest, Roost's type change, side guards and other effects are
not substituted with approximate effects. Slower healing is supported when
order is known: lethal retaliation occurs before the attempted heal.

Each resource state contains elapsed turns, player HP, remaining PP for modeled
actions, and the Protect counter. The opponent's passive state is indexed by
elapsed turns because supported player actions cannot change that timeline.
This creates a finite graph. Terminal values are 0 or 1; chance nodes use exact
native probabilities; decision nodes optimize the player action. Finding one
sure-win action proves the maximum value 1 without exploring inferior actions.
The action ordering changes work, not the value calculation.

Unmodeled player options may be present. A sure-win strategy using the modeled
subset still proves 100%, but fractional or losing results are withheld unless
all legal options were modeled. Running out of modeled PP leaves unknown bounds
[0,1]; Struggle is never silently called a loss. Unfinished or unsupported work
falls back to the existing search.

## Integration and budgets

The existing `position-evaluator.mjs` registry owns dispatch, result formatting,
solved-value caching and the bounded pending-work map. Providers with `start`
and `advance` methods can resume across work slices. This generic interface
supports later bounded solvers without adding domain branches to search loops.

The default limit is 50 ms per advance, additionally bounded by the caller's
slice/deadline, with at most 2,048 compact states. Native clock snapshots,
compilation cursors and backward frames survive interruption. A higher state
limit can resume the saved graph. Pending work has a 32-position cache limit,
scoped by provider, complete native state and opponent model. The worker retains
matching work across observation-context updates. Warm-only requests never
advance work; cancellation prevents publication.

Only a completed coincident bound produces a certificate. Successful proofs use
`exact-native-passive-resource-endgame`, carry provenance under `proof`, and
report zero rollouts. Eligible NPC and minimax positions have the same opponent
behavior because the opponent has a single fixed action. The provider adds no
trainer-AI dependence.

## Validation and scope of the recommendation

Tests retain the original stall references, add alternative species/moves and
slow-heal scenarios, compare short states with exhaustive native action/chance
trees, replay long winning policies in the native engine, and exercise resource,
PP, counter, deadline, state-limit and cache changes. Surviving a failed Protect
is tested separately because its reset changes later success probabilities.

The measured benchmark results live in `STALL-STRATEGY-BENCHMARKS.md`. Initialization
and UI/capture latency remain separate from warm decision latency. This prototype
supports keeping a bounded resource solver; it does not establish that a general
reverse-search engine would be useful. Enemy recovery, ordinary random damage,
more complicated abilities/items and arbitrary loops remain outside its proof
domain and retain the existing search.
