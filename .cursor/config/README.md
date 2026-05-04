# Cursor project config

- **`settings.json`** — project-level Cursor settings (e.g. plugin toggles). The canonical file is **`config/settings.json`**.
- **`.cursor/settings.json`** at the repo root is a **symlink** to **`config/settings.json`** so tools that only look for the legacy path keep working. Edit either path; they resolve to the same file.
