# Recent battle history

Open **⋯ → Recent battle history** in the desktop overlay, or use the link on
the browser meter. The local page is `/history`; it refreshes every five seconds
while visible. **Save history** downloads a standalone HTML review. Bug reports
also include `review.html` and `review.json` alongside the original raw report
and diagnostic timeline.

The review covers the recorder's ten-minute in-memory window, showing up to the
latest fifty decisions. If more are retained, the page states how many are shown.
Completed decisions appear first. The window is lost when the reader shuts down;
save a review or bug report to keep it.

## What a review establishes

* A decision begins at an observed move-selection phase. Repeated selection
  captures merge; animations do not create extra turns.
* The next decision or a terminal HP observation closes it. Tracking gaps,
  changed Pokémon and skipped/unknown turn counters prevent action blame.
* PP decreases identify candidate moves. A decision flag additionally requires
  matching previous-move evidence and excludes known PP-draining ambiguity.
  This is inference from state, not a recording of controller input.
* The existing state-only continuation flags explain clearly ineffective actions
  and suggest other available moves to compare. Useful waiting is preserved.
  No trainer AI or counterfactual search is invoked by this review.
* HP, status, stat, item and ability changes are observations. Damage alone
  cannot identify a critical hit, miss, recoil or every residual effect.
* Outlook values come from matching state/model records before execution.
  Late refinements, blocked/pending results and other states cannot replace them.
  A probability drop alone never becomes a player mistake.

The review does not yet rank every alternative strategy or calculate regret
for arbitrary decisions. An unflagged move has not been proved optimal, and
suggested alternatives have not been proved to win.

## Architecture and bounds

`BattleRecorder` owns bounded observations and saved reports. `BattleHistory`
groups observations and builds read-only review entries. Its native flag cache
is limited to 200 entries per recorder; it does not run the prediction search.
The live endpoint reads retained immutable event references instead of cloning
the whole recorder payload on every poll. Saved reports still clone their data.

`history-view.mjs` renders escaped standalone/live HTML with whole percentages.
The browser app polls `/api/history`, preserves the old review on connection
failure, times out stalled requests, and exports the same renderer's standalone
document. No emulator RAM, ROM or save file is added to the review.

Tests cover native flag explanations, valid waiting, uncertain PP attribution,
missed turns, switches, terminal observations, reconnects, state/model estimate
alignment, bounded/read-only caching, escaping, saved files and HTTP routing.
The browser UI was also inspected with explicitly synthetic data; this does not
constitute a new live-emulator verification.
