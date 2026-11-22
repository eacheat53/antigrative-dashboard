# Independent Fork Rules (`eacheat53/antigrative-dashboard`)

This repository is an **independent fork** of `ATtacK030130/antigrative-dashboard`.

## 1. Remotes, Branches, and PR Targets

- **`origin` (`git@github.com:eacheat53/antigrative-dashboard.git`)** is the primary repository and release target. Develop features on topic branches and merge/PR into `origin/main`.
- **`upstream` (`https://github.com/ATtacK030130/antigrative-dashboard.git`)** is a **read-only reference** for backend/protocol fixes.
- **Never push or open PRs/issues against `upstream`.** When running `gh pr` / `gh issue` / `gh release`, always specify `--repo eacheat53/antigrative-dashboard` explicitly (fork clones default `gh` to `upstream` otherwise).

## 2. Syncing with `upstream` (Selective Porting Only)

- **Do not blind-merge or rebase `upstream/main` onto `main`** — UI direction has diverged.
- Inspect upstream changes via `git -c core.quotepath=false fetch upstream --tags` and `git log --oneline main..upstream/main`.
- **Safe to selectively `cherry-pick` or port**: backend/collector/protocol fixes in `sidecars/panel/` (`client.mjs`, `store.mjs`, `metrics.mjs`, `usage.mjs`, `discovery.mjs`, `transcript.mjs`, etc.), `compat/runtime-ui.mjs`, `compat/launch-config.mjs`, `compat/theme.cjs`, `cli/`, and `ide/` discovery fixes.
- **Manually adapt (never overwrite)**: `compat/inline-widget.cjs` and `compat/i18n.cjs`.

## 3. Custom Product Direction (Must Preserve)

- **Chat-header transcript export**: keep `compat/export-ui.cjs`, `sidecars/panel/exporter.mjs`, and their hooks in `compat/inline-widget.cjs`, `compat/runtime-ui.mjs`, `sidecars/panel/main.mjs`, and `compat/i18n.cjs`.
- **Inline context ring (`#context-card`)**: show detailed context occupancy breakdown (`#context-segmented-track`, `User / Assistant / Tool / System / Free / Compactions`), `.context-ring` threshold coloring (`75%` warning / `90%` danger), and `contextLimitOverride` persistence (`compat/preferences.mjs`). Do **not** re-introduce duplicated Antigravity account quota sections (`#quota-siblings`, `#five-quota-section`, `#week-quota-section`) inside `#context-card`.
- **IDE compatibility**: keep `compat/inline-widget.cjs` templates compatible with `ide/surface.cjs`'s `setMarkup` tag allowlist (create `<input>` elements via `document.createElement` rather than template HTML).

## 4. Local Install & Verification

- Deploy locally with `uv run python manage.py install` (restarting Antigravity Desktop to reload UI assets).
- Note that `compat/update-worker.py` currently still targets `ATtacK030130/antigrative-dashboard`; avoid clicking `Check for updates` inside the app unless `REPO` in `compat/update-worker.py` (and `tests/test_update_worker.py`) is switched to `eacheat53/antigrative-dashboard`.
- Run `node --test --test-timeout=60000 sidecars/panel/tests/*.test.mjs`, `node --test ide/tests/*.test.mjs cli/tests/*.test.mjs`, and `uv run python -m unittest discover -s tests -v` before pushing or releasing.
