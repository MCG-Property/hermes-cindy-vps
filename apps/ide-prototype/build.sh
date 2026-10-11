#!/usr/bin/env bash
# Assembles "Clone IDE.app" from VSCodium (MIT) + the clone-ai built-in extension. Re-run after editing ext/clone-ai.
set -euo pipefail
cd "$(dirname "$0")"
APP="Clone IDE.app"
rm -rf "$APP"
ditto base/VSCodium.app "$APP"
R="$APP/Contents/Resources/app"
rm -rf "$R/extensions/clone-ai"; cp -R ext/clone-ai "$R/extensions/clone-ai"
python3 - "$R/product.json" <<'PY'
import json, sys
p = sys.argv[1]; j = json.load(open(p))
j.update({"nameShort": "Clone IDE", "nameLong": "Clone IDE", "applicationName": "clone-ide", "dataFolderName": ".clone-ide",
          "urlProtocol": "clone-ide", "darwinBundleIdentifier": "dev.clone.ide"})
j["configurationDefaults"] = {
  "workbench.colorTheme": "Clone Dark", "workbench.startupEditor": "none", "telemetry.telemetryLevel": "off",
  "workbench.secondarySideBar.defaultVisibility": "visible", "editor.inlineSuggest.enabled": True,
  "editor.fontSize": 13, "window.commandCenter": True, "workbench.layoutControl.enabled": True,
  "workbench.activityBar.location": "hidden", "editor.minimap.enabled": False, "breadcrumbs.enabled": False, "workbench.tree.indent": 12, "window.titleBarStyle": "custom", "workbench.editor.showTabs": "multiple", "editor.fontFamily": "SF Mono, Menlo, monospace", "update.mode": "none", "extensions.autoUpdate": False, "git.openRepositoryInParentFolders": "never"}
json.dump(j, open(p, "w"), indent=2)
PY
for plist in "$APP/Contents/Info.plist"; do
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'Clone IDE'" "$plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string 'Clone IDE'" "$plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier dev.clone.ide" "$plist"
done
xattr -cr "$APP"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
echo "built $APP"
