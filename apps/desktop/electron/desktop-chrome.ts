import fs from 'node:fs'
import path from 'node:path'

import { validateOverlayCss } from '../src/lib/desktop-chrome-css'
import { ensureDir } from './desktop-plugins-root'

export { validateOverlayCss }

/** App-level chrome overlay. Lives next to `desktop-plugins` so a remote
 *  gateway cannot point Desktop at a path on another machine. */
export const DESKTOP_CHROME_DIR = 'desktop-chrome'
export const DESKTOP_CHROME_GOOD_DIR = '.good'
export const DESKTOP_CHROME_FILES = ['manifest.json', 'overlay.css'] as const

export async function desktopChromeRoot(hermesHome: string): Promise<string> {
  return ensureDir(path.join(hermesHome, DESKTOP_CHROME_DIR))
}

export async function snapshotChrome(root: string): Promise<{ ok: boolean; saved: string[] }> {
  const good = path.join(root, DESKTOP_CHROME_GOOD_DIR)
  await fs.promises.rm(good, { force: true, recursive: true })
  await ensureDir(good)
  const saved: string[] = []

  for (const name of DESKTOP_CHROME_FILES) {
    const src = path.join(root, name)

    try {
      await fs.promises.copyFile(src, path.join(good, name))
      saved.push(name)
    } catch {
      // Optional files stay optional.
    }
  }

  return { ok: true, saved }
}

export async function rollbackChrome(root: string): Promise<{ ok: boolean; restored: string[] }> {
  const good = path.join(root, DESKTOP_CHROME_GOOD_DIR)
  const restored: string[] = []

  for (const name of DESKTOP_CHROME_FILES) {
    const src = path.join(good, name)

    try {
      await fs.promises.copyFile(src, path.join(root, name))
      restored.push(name)
    } catch {
      // Missing last-known-good file is not a failure by itself.
    }
  }

  return { ok: restored.length > 0, restored }
}
