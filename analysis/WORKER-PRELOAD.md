# Search worker preloading

The live server preloads the appropriate worker(s) after reading optimizer settings. A readiness handshake confirms module loading; preload never publishes a battle prediction. Tracking resets cancel current work through the generation token but retain idle workers. Explicit service shutdown still terminates workers. Changing worker modes rebuilds them as needed.

`SearchService.preload({opponentModel})` is idempotent and rejects initialization failures. The server reports failure and can retry on the next search. Focused search-service coverage passed all ten tests, including preload, cancellation, reuse, responsiveness and result suppression.
