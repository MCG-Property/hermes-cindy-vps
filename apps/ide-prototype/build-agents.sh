#!/usr/bin/env bash
# Packages the agent-first window (Electron) as Clone.app next to this script.
set -euo pipefail
cd "$(dirname "$0")"
OUT="Clone.app"
rm -rf "$OUT"
ditto app/node_modules/electron/dist/Electron.app "$OUT"
R="$OUT/Contents/Resources"
rm -f "$R/default_app.asar"
mkdir -p "$R/app/node_modules"
rsync -a --exclude node_modules --exclude '.DS_Store' app/ "$R/app/"
for m in @lydell @xterm; do rsync -a "app/node_modules/$m" "$R/app/node_modules/"; done
echo "$PWD/Clone IDE.app" > "$R/app/ide-path.txt"
cp assets/icon.icns "$R/electron.icns"
P="$OUT/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Clone" "$P" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Clone" "$P"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier dev.clone.agents" "$P"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile electron.icns" "$P"
xattr -cr "$OUT"
codesign --force --deep --sign - "$OUT" >/dev/null 2>&1
echo "built $OUT"
