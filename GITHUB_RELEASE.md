# Antigrative Dashboard v0.9.8

Removes the **Neon (氖龙)** plush mascot Easter egg and its toggle completely so standard downloads and in-app updates stay clean and lightweight, while retaining all v0.9.6 macOS launcher ergonomics and v0.9.5 memory/backfill optimizations:

- **Completely Neon-free default:** Removes all Neon mascot code, embedded WebP assets, and toggles from both the Desktop App plugin and standalone IDE extension.
- **Want the Neon Easter Egg?** The dedicated `v0.9.7 (Neon Easter Egg)` release remains available on the [Releases page](https://github.com/ATtacK030130/antigrative-dashboard/releases/tag/v0.9.7).

## Install or update

- **Desktop App:** Download `antigrative-dashboard-0.9.8.zip`, extract it, and run `python manage.py install` (`python3` on Linux/macOS), then fully quit and reopen Antigravity from your shortcut / `Antigravity (Dashboard).app` (or run `python3 manage.py launch --restart`). Existing `v0.9.1+` installations can also update in-app via **⋯ → Check for updates**, then restart Antigravity once.
- **Standalone IDE:** Download `antigrative-dashboard-ide-0.9.8.vsix` and choose **Install from VSIX…** in the IDE extensions view. Fully quit the IDE and restart using `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`.
- **CLI:** Extract `antigrative-dashboard-0.9.8.zip` and rerun `python manage.py install-cli` (`python3` on Linux/macOS), including any previously chosen `--language` or `--node` options.

Existing statistics, preferences and IDE extension storage are retained. SHA-256 checksum files accompany both packages.

[Compatibility](https://github.com/ATtacK030130/antigrative-dashboard/blob/main/COMPATIBILITY.md) · [IDE installation](https://github.com/ATtacK030130/antigrative-dashboard/blob/main/ide/README.md)
