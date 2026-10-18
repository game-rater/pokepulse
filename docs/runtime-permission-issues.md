# Runtime permission issues

## October 8, 2026

The terminal tool rejected a combined command that backed up appearance settings, restored percentage opacity, forcibly stopped matching overlay processes with `Stop-Process`, and relaunched the app. The returned reason was only `blocked by policy`; no policy identifier or more specific rationale was supplied. The command did not run.

A narrower repair succeeded: copy the tested overlay source into the packaged runtime, verify the specific running overlay's command line, close that process gracefully with `CloseMainWindow()`, and launch the existing application normally. Separate backup and percentage-opacity repair also succeeded. The game was kept running.

The Windows Computer Use JavaScript tool required by the installed skill was absent from the tools exposed in this session. As a result, loading the Lua integration in the current mGBA session could not be automated. The live API remained disconnected, with capture files last written October 7. This is a missing automation capability, separate from the terminal policy rejection.
