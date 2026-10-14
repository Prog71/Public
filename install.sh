#!/bin/bash
echo "Installing Glass Launcher..."

if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing..."
    sudo apt update && sudo apt install nodejs npm -y
fi

echo "Installing app dependencies..."
npm install

echo "Fixing permissions..."
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox

echo "Creating desktop shortcut..."
cat > ~/.local/share/applications/glass-launcher.desktop <<DESKTOP
[Desktop Entry]
Name=Glass Launcher
Comment=A beautiful glass-effect app launcher
Exec=$(pwd)/node_modules/.bin/electron $(pwd)/.
Icon=utilities-system-monitor
Terminal=false
Type=Application
Categories=Utility;
DESKTOP

echo "Installation Complete! You can now find 'Glass Launcher' in your apps menu."
