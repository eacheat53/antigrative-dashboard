# Antigrative Dashboard v1.0.0

First independent fork release (`eacheat53/antigrative-dashboard`), combining custom inline UX and transcript export features with upstream stability and protocol fixes through `v0.9.14`:

- **In-app updater switched to fork:** `Check for updates` now checks and downloads verified packages exclusively from `eacheat53/antigrative-dashboard`.
- **Chat-header transcript export:** Selective Markdown/JSON export of conversations directly from the chat header (`compat/export-ui.cjs` & `sidecars/panel/exporter.mjs`).
- **Context ring & breakdown card:** `#context-card` displays the segmented occupancy breakdown (`User / Assistant / Tool / System / Free / Compactions`), threshold coloring (`75%` / `90%`), and persistent custom context limit override (`contextLimitOverride`).
- **Ported backend, protocol & stability fixes (from upstream v0.9.9–v0.9.14):**
  - Antigravity 2.34.0 sidecar CSRF credential and transcript fallback support.
  - Persistent SQLite usage index (`usage-index.mjs`), non-blocking cold-start indexing, and hybrid quota capacity estimator (`quota-estimator.mjs`).
  - Inline bar persistence across transient bridge timeouts/reconnects (`compat/runtime-ui.mjs`, `compat/inline-widget.cjs`).
  - Model thinking-tier merge in token usage UI (`compat/usage-ui.cjs`) and Windows discovery / redirected folder / non-ASCII shortcut fixes.

## Install or update

- **Desktop App:** Download `antigrative-dashboard-1.0.0.zip`, extract it, and run `python manage.py install` (`python3` on Linux/macOS), then fully quit and reopen Antigravity from your shortcut / `Antigravity (Dashboard).app` (or run `python3 manage.py launch --restart`). Existing installations can also update in-app via **⋯ → Check for updates**, then restart Antigravity once.
- **Standalone IDE:** Download `antigrative-dashboard-ide-1.0.0.vsix` and choose **Install from VSIX…** in the IDE extensions view. Fully quit the IDE and restart using `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`.
- **CLI:** Extract `antigrative-dashboard-1.0.0.zip` and rerun `python manage.py install-cli` (`python3` on Linux/macOS), including any previously chosen `--language` or `--node` options.

Existing statistics, preferences and IDE extension storage are retained. SHA-256 checksum files accompany both packages.

[Compatibility](https://github.com/eacheat53/antigrative-dashboard/blob/main/COMPATIBILITY.md) · [IDE installation](https://github.com/eacheat53/antigrative-dashboard/blob/main/ide/README.md)
