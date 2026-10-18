# Reporting a PokéPulse bug

While playing, press **Ctrl+Shift+F8**, or choose **Report bug** in the meter's three-dot menu. A notification confirms saving. If another application owns the hotkey, use the menu.

Reports stay in `C:\Users\mathm\Pokethreat Meter\bug-reports`. Use **Open bug reports** in the menu to find them. Each folder contains `report.json`, `timeline.html`, `note.txt`, and a screenshot of the meter (`overlay.png`) when saved through the overlay. Add a description to `note.txt` if helpful. Then tell the assistant **check my latest report**. Saving does not send a chat message or automatically start an investigation.

The recorder retains up to ten minutes, subject to event and size limits. It captures observed battle-state changes, search estimates and bounds, search telemetry, tracking changes, and samples of the displayed meter. It preserves the snapshot context needed to replay those samples. It does not record keyboard input, game video, ROM contents, save files, or raw emulator memory. An observed state change is not necessarily a completed turn or confirmed player action. Display samples are periodic, not every animation frame.

Large changes within the same observed state are flagged for review. They can be normal search refinement; a flag does not establish a bug. Reports fingerprint the engine files so a replay can identify version differences. Restarting the server clears unsaved history; saved reports remain until you remove them.

## Local replay

From the project directory:

```
node scripts/replay-bug-report.mjs "bug-reports\REPORT-FOLDER\report.json" --time-ms 1000
```

The replay writes `replay.json` beside the report. It evaluates the latest twelve captured states, reuses compatible search sessions, compares original estimates, and identifies engine fingerprint changes. Use `--state ID` for one captured state. This is a bounded diagnostic replay, not a claim that an unfinished search has solved the battle.

## Practice for other ROM hacks

Keep private gameplay reports separate from public regression fixtures. Reproduce a suspicious event with a synthetic fixture, change one condition at a time, and test decoder, mechanics, search, display, and reporting independently. Use a thin ROM adapter with explicit game/version fingerprints; mark mappings as synthetic-only until live-verified. Preserve uncertainty and distinguish intermediate animations from stable states. Compare replay bounds and unsupported-mechanics warnings before attributing a display change to the predictor.
