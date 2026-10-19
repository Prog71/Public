#!/bin/bash
# Glass Launcher — installer
# Configures the full working mechanism: deploy copy, toggle command,
# pinned dock favorite, dash-to-dock display rule, autostart, Super+Space.
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="$HOME/.local/share/system-launcher"

echo "Installing Glass Launcher..."

# 1. Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing..."
    sudo apt update && sudo apt install nodejs npm -y
fi

# 2. Deploy the runtime copy (whitelist copy — never touches user data,
#    which lives in ~/.config/system-launcher and ~/.config/launcher-favorites.json)
echo "Deploying app to $DEPLOY ..."
mkdir -p "$DEPLOY"
for f in main.js renderer.js preload.js index.html styles.css package.json package-lock.json; do
    cp -f "$SRC/$f" "$DEPLOY/"
done

echo "Installing app dependencies..."
( cd "$DEPLOY" && npm install )

echo "Fixing Electron sandbox permissions..."
sudo chown root:root "$DEPLOY/node_modules/electron/dist/chrome-sandbox"
sudo chmod 4755 "$DEPLOY/node_modules/electron/dist/chrome-sandbox"

# 3. Toggle command: starts the resident instance, or toggles it (dock/left-click,
#    middle-click and Super+Space all funnel through this)
echo "Installing /usr/local/bin/launcher-toggle ..."
sudo tee /usr/local/bin/launcher-toggle > /dev/null <<'EOF'
#!/bin/bash
cd "$HOME/.local/share/system-launcher" || exit 1
nohup ./node_modules/.bin/electron . >/dev/null 2>&1 &
disown
EOF
sudo chmod +x /usr/local/bin/launcher-toggle

# 4. Pinned dock entry — unique file identity makes every dock left-click LAUNCH
#    (-> second-instance -> toggle) instead of merely focusing the window
echo "Installing dock entry..."
mkdir -p "$HOME/.local/share/applications"
cp -f "$SRC/glass-launcher-toggle.desktop" "$HOME/.local/share/applications/"

# 5. GNOME / dash-to-dock integration
if command -v gsettings &> /dev/null; then
    # Pin the toggle entry first, preserving all existing favorites
    FAVS=$(gsettings get org.gnome.shell favorite-apps 2>/dev/null || echo "[]")
    case "$FAVS" in
        *glass-launcher-toggle.desktop*) : ;;
        *)
            if [ "$FAVS" = "[]" ]; then NEW="['glass-launcher-toggle.desktop']"
            else NEW="['glass-launcher-toggle.desktop', ${FAVS:1}"; fi
            gsettings set org.gnome.shell favorite-apps "$NEW" 2>/dev/null || true
            ;;
    esac
    # Hide running-but-unpinned icons so the popup never shows as a second dock icon
    gsettings set org.gnome.shell.extensions.dash-to-dock show-running false 2>/dev/null || true
fi

# 6. Resident background instance at login (hidden until toggled)
echo "Installing autostart..."
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/system-launcher.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=System Launcher Background
Exec=env LAUNCHER_HIDDEN=1 /usr/local/bin/launcher-toggle
X-GNOME-Autostart-Delay=3
EOF

# 7. Super+Space keyboard shortcut (GNOME; added only if not already present)
if command -v gsettings &> /dev/null; then
    KS='/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/'
    if ! gsettings get org.gnome.settings-daemon.plugins.media-keys custom-keybindings 2>/dev/null | grep -q "$KS"; then
        gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "['$KS']" 2>/dev/null || true
        KSSCHEMA="org.gnome.settings-daemon.plugins.media-keys.custom-keybindings:$KS"
        gsettings set "$KSSCHEMA" name 'Glass Launcher' 2>/dev/null || true
        gsettings set "$KSSCHEMA" binding '<Super>space' 2>/dev/null || true
        gsettings set "$KSSCHEMA" command '/usr/local/bin/launcher-toggle' 2>/dev/null || true
    fi
fi

echo ""
echo "Installation complete!"
echo "  - Dock icon: left-click or middle-click toggles the launcher"
echo "  - Keyboard:  Super+Space"
echo "  - Starts hidden in the background on login"

