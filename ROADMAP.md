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

## M1/P2 — "Layout & Filtering" (The Structural Rewrite) 🔜 IN PROGRESS
Skeleton (owner brief, Qwen 2026-10-19):
- [ ] Phase tag `glass-m2-p2-start`; 3-column structure: **PINNED 25% | RECOMMENDED 35% (placeholder) | ALL APPS 40%**
- [ ] Header: **full-width search bar** on top; Tools/Apps tabs moved to the **top-right**
- [ ] Existing data rendered into the new containers; keyboard navigation preserved across columns
- [ ] Letter jumpers **A–Z** on the right edge of All Apps (quick scroll)
- [ ] Search filters the columns
- ❌ Not yet: Recommended logic (→ P4), Power Bar (→ P3), `main.js`/`preload.js` changes, CSS frameworks

## M1/P3 — "Powers & Identity" (The Bottom Bar)
- [ ] Identity (left): user avatar + name via AccountsService (fallback: generic icon)
- [ ] Powers (right): Settings, Files, Suspend, Restart, PowerOff, Logout
- [ ] **Safety:** destructive actions (Restart/PowerOff/Logout) must trigger a custom transparent confirmation modal

## M1/P4 — "Recommended" (Recent Launches)
- [ ] Track launches locally in `~/.config/glass-launcher/recent.json` — **strict rule: never write gsettings**
- [ ] Middle column shows the last 6–8 launched items; updates on every launch from the panel

## M1/P5 — "Feel & Keyboard" (World-Class Polish)
- [ ] Full keyboard flow across the 3 columns (Tab/Shift+Tab between columns, Enter launches)
- [ ] **In-Place Add Tool browse** — remove the big Select-App modal; the Tools grid flips into browse mode (search + app grid + Import Script) in the same panel
- [ ] Thin translucent scrollbars (`::-webkit-scrollbar`) + smooth Apps/Tools transitions

## 🚪 Gate v0.9
Owner compares the result to a Windows 11 Start Menu screenshot and says **"this is it."**
First checklist item at the gate: **refresh all README screenshots + add one short silent demo video** — old PNGs replaced and deleted in a single `docs: refresh media` commit.

## Hard rules (never violate)
1. **Never** `NoDisplay=true` on a *pinned* favorite — GNOME prunes it from `favorite-apps` → dead click.
2. **Never** write the `favorite-apps` gsettings array from code — full-array writes flicker; watchers are **log-only**.
3. Deploy copy `~/.local/share/system-launcher/` stays **byte-identical** to the repo root (diff on every sync).
4. Read the **root** `main.js` — the nested `glass-launcher/` dir is a stale gitignored copy.
5. XDG-precedence override (`~/.local/share/applications/<same-id>.desktop`) is the no-sudo way to hide/modify system entries.
6. **Backup Gate (owner rule):** every implementation step ends with a clean-tree check, a commit, a step tag (`p2-step-N-*`), and a silent push **before** the next step begins. Rollback = `git reset --hard <previous-step-tag>` + re-sync to the deploy dir.
