# ROADMAP — Glass Launcher (M1 · Phase Plan P1 → P5)

_Maintained with Qwen (design counsel). Frozen at tag `glass-m1-p1-stable` (2026-10-19) before the P2 rewrite._

## Doors
- **Door A — Spotlight shape** (current): single panel, favorites sidebar + grid. Cosmetic polish only. *Not the chosen direction.*
- **Door B — Full Vision** ✅ chosen: Windows-Start-style layout.

## M1/P1 — "Chrome + Anchor" ✅ DONE & ACCEPTED (`glass-m1-p1-stable`)
- Bottom-left anchor above dock; **left-click dock icon toggles** the popup (pin-swap: `glass-launcher-toggle.desktop` first in `favorite-apps`; single-instance lock toggles).
- **One dock icon only** (`show-running=false`; `NoDisplay` on the pinned toggle = forbidden regression, c9fb327).
- **App grid = OS App Grid parity**: scans all XDG data dirs (Flatpak/Snap/`/usr/local`), replicates GIO `should_show` (NoDisplay, Hidden, Type, OnlyShowIn/NotShowIn).
- **Icons** resolve across every XDG `icons/` root (incl. user Flatpak exports).
- **Tools tab**: run system scripts/apps with a live embedded console — tucks away outside the Tools tab, live dot on the tab, expand/restore toggle, output persists across launcher hide.
- **Tool import**: from installed apps or local scripts (`.py` → `python3`, others → `bash`).
- Reopen resets entry state (search, modals) while keeping tab + console session.

## M1/P2 — "Full Vision Layout" 🔜 NEXT
- [ ] Integrated tabs in the title bar: `[📱 Apps] [⚙ Tools]` + **full-width search**.
- [ ] 3-column body: **PINNED** (favorites) | **RECOMMENDED** (launch history — *file-based only, never gsettings*) | **ALL APPS (A–Z)**.
- [ ] **Power bar** at the bottom: user row + lock/restart/shutdown (`loginctl` via `spawnSafe`; zero gsettings writes).
- [ ] **In-place Add-Tool browse** — the Tools grid swaps into a large-icon picker *in its own area*; modals reserved for edit/confirm. Built on the P2 skeleton (decision: not on the legacy layout).

## M1/P3 → P5 — TBD with Qwen
- **P3 — Polish**: slim translucent scrollbars (match the solid/glass chrome), recommended-tracker tuning, icon sizing pass.
- **P4/P5**: open — candidates: launch-history recency UI, power-session niceties, i18n (RTL/Arabic).

## Hard rules (never violate)
1. **Never** `NoDisplay=true` on a *pinned* favorite — GNOME prunes it from `favorite-apps` → dead click.
2. **Never** write the `favorite-apps` gsettings array from code — full-array writes flicker; watchers are **log-only**.
3. Deploy copy `~/.local/share/system-launcher/` stays **byte-identical** to the repo root (diff on every sync).
4. Read the **root** `main.js` — the nested `glass-launcher/` dir is a stale gitignored copy.
5. XDG-precedence override (`~/.local/share/applications/<same-id>.desktop`) is the no-sudo way to hide/modify system entries.
