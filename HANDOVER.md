# HANDOVER — Glass Launcher

For whoever picks this up next (human, Cline, Qwen). Read **ROADMAP.md** for the phase plan.

## What this is
An Electron popup launcher with **Windows-Start behavior** on a GNOME dock: left-click the dock icon → popup toggles at the bottom-left anchor above the dock. Source of truth = **this repo's root**. Runtime = `~/.local/share/system-launcher/` (a byte-identical copy; never edit there — edit here, then sync).

## Architecture
| File | Role |
|---|---|
| `main.js` | Main process: frameless transparent fullscreen window (panel positioned via CSS), single-instance + dock-click toggle detection, XDG app scan with GIO `should_show` parity, icon resolution, tools store (`~/.config/system-launcher/tools/*.json`), tool runner (`bash -c`, output streamed over IPC), launch via `gio launch` |
| `preload.js` | `contextBridge` API surface |
| `renderer.js` | UI state: Apps/Tools views, favorites list, grid, console drawer, modals, keyboard navigation |
| `index.html` / `styles.css` | Panel UI (glass aesthetic) |
| `setup-glass.sh` | Installer; `/usr/local/bin/launcher-toggle` + `glass-launcher-toggle.desktop` implement the dock pin/toggle hack |

## The left-click toggle model (fragile — understand before touching)
- `favorite-apps[0]` = `glass-launcher-toggle.desktop` (`Exec=launcher-toggle`, must NOT be `NoDisplay`).
- `/usr/local/bin/launcher-toggle` spawns the Electron app (`LAUNCHER_HIDDEN=1` on first run); the single-instance lock makes every later activation a `second-instance` → toggle.
- GNOME's own "show running" is set to `false` so the real app never adds a second dock icon.
- Blur closes (deferred 250ms with dock-cursor detection); backdrop click closes; Esc closes.

## Known-good restore
- **Git tag:** `glass-m1-p1-stable` (2026-10-19) — the accepted P1 state before the P2 rewrite.
- **Full backup:** `~/ProjectSpace/backups/glass-<date>.tar.gz` = git bundle (whole repo) + favorites JSON + tools JSONs + the NoDisplay override desktop file + `launcher-toggle` + deployed app (minus `node_modules`) + gsettings dump.
- **Restore:** untar → `git clone` from the bundle → copy state files back to their paths → `npm install` in the deploy dir → toggle the dock icon.

## Credentials (GitHub push bridge)
- `~/.git-credentials` (chmod 600) holds a classic PAT (scope `repo`) for `Prog71` — installed 2026-10-19, **expires ≈ 2026-11-18** (30-day default). `credential.helper store` is set globally, so pushes from any context are silent.
- The token value is never displayed anywhere; VSCodium's own stored token happens to expire the same day (2026-11-18).
- **Rotation (~5 min):** mint a fresh classic token at `https://github.com/settings/tokens/new` (scope `repo`) → save it as `~/github_token.txt` → tell Cline to swap the vault → the file is deleted after install. *Alternative:* create a **no-expiration** token once and never rotate again.
- Safety net: systemd user timer `gh-token-reminder.timer` fires a desktop notification on ≈ Nov 15 if rotation is still pending.

## House rules (from the P1 war room)
1. Never `NoDisplay=true` on a pinned favorite (regression `c9fb327` — it gets pruned → dead click).
2. Never write `favorite-apps` from code; watchers are log-only.
3. Grid must stay deduped with the OS app grid (same scan + `should_show` rules) — parity is a feature.
4. Keep this file and ROADMAP.md updated at each phase boundary.
