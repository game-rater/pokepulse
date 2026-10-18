# PokéPulse process-launch policy diagnostic

The request was to remove the visible PowerShell console while keeping the PokéPulse overlay available. The rejected command would stop the existing overlay PowerShell process, then relaunch the packaged script using Start-Process with WindowStyle Hidden, port 3002, and vertical orientation.

The execution tool returned `CreateProcess ... Rejected(... rejected: blocked by policy)` before producing a process exit code. It supplied no policy identifier or detailed rationale. This is evidence of an execution-tool policy rejection; it does not establish a Windows permission failure or identify the specific policy engine.

Verified session settings: approval_policy = never; approvals_reviewer = user; sandbox_policy = danger-full-access. The local Codex config also sets sandbox_mode = danger-full-access. No local auto_review policy section was present in the inspected config. Searches of the current desktop logs did not expose a more detailed matching rejection. The sandbox log did not explain this event.

An earlier chat response called this automatic approval review. That attribution was not established by the error. Current official documentation says Auto-review does not apply with approval_policy = never.

Official references:
- https://learn.chatgpt.com/docs/sandboxing
- https://learn.chatgpt.com/docs/sandboxing/auto-review

The packaged Start PokéPulse Overlay.cmd already passes WindowStyle Hidden. The visible instance had been launched directly without that flag. The investigation did not change security settings, override policies, or retry the denied action through another execution path.

## Search/background update restart
The execution tool rejected a targeted normal overlay close, stop of verified Node server PID 7128, and relaunch of Start PokéPulse.cmd. It returned 'rejected: blocked by policy' before execution, with no policy identifier or detailed reason. No part of that command ran. The update was saved and tested on disk; the live processes were not updated. No alternate route was used to perform the rejected restart. The project source was subsequently located under OneDrive\Documents\Pokethreat Meter; the original Documents folder retains the user's ROM/save.
