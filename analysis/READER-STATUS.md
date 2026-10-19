# Reader status panel

Open **⋯ → Connection and status** on the desktop overlay. The modeless panel
shows the connection state, last game update, last prediction, an explanation and
an appropriate next action. It has no prediction percentage or uncertainty label.
The main meter and its animation are unchanged.

## Ownership

- `reader-status.mjs` classifies the server's existing tracking, prediction,
  battle-phase and missing-input evidence. It neither starts searches nor changes
  their results. Both compact and full state responses include `reader_status`.
- The server records when a search starts and when its callback publishes a
  result. Last-prediction time survives a disconnect; it is not replaced by the
  time of an HTTP poll or an overlay paint.
- `reader-status-panel.ps1` renders the Windows panel. It uses the overlay's
  existing 120 ms poll, so opening it introduces no additional requests or search.
  Transport failures are classified locally, even when the server cannot respond.
  Closing the overlay closes the panel; reopening the panel reuses the latest view.

## Interpretation

| Status | Evidence |
| --- | --- |
| Disconnected | No reader response, or no game connection established |
| Game updates stopped | Explicit stale tracking, or capture time older than four seconds, even if HTTP still responds |
| Waiting for a battle | Fresh game data reports no active battle |
| Unsupported battle | The reader rejects the ROM, battle type or another unsupported input |
| Reading battle/data | Initial loading, an animation/transition, or waiting for a decision state |
| Calculating | A requested search has no displayable result yet |
| Refining prediction | A displayable result exists and calculation continues |
| Reading battle, prediction available | The latest result can be displayed |
| Missing battle data | Search explicitly reports blocked input; available reasons are shown |
| Prediction unavailable/failed | Work stopped without a displayable result, or the search reported an error |

Zero is a valid prediction. An explicit null display value does not fall back to
an old victory number. Unfinished search bounds are not labeled missing data.
A previous result held during an animation is not described as a new decision.
If an older server lacks detailed status, the panel says the reader responds and
asks for a restart to load the updated diagnostics.

## Validation

Regression checks cover classification, stale capture versus live HTTP, exact
timestamps, missing-input reasons, valid zero, held/absent results, animation,
errors, panel reconnection, resizing and unchanged meter targets. An isolated
server consumes synthetic capture packets, publishes a prediction timestamp,
expires stale input and recovers on fresh packets. Native panel controls are
created and updated without showing a window or touching a live game.

The full correctness suite passed 608 tests with no failures, skips or
cancellations. A controlled rendering check also inspected the Windows panel.
