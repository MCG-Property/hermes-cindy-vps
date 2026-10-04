import { validateOverlayCss } from '@/lib/desktop-chrome-css'
import { notifyError } from '@/store/notifications'

export const DESKTOP_CHROME_STYLE_ID = 'hermes-desktop-chrome-overlay'

let watching = false

function styleEl(): HTMLStyleElement | null {
  return document.getElementById(DESKTOP_CHROME_STYLE_ID) as HTMLStyleElement | null
}

export function applyOverlayCss(css: string): { error: string; ok: false } | { ok: true } {
  const check = validateOverlayCss(css)

  if (!check.ok) {
    return check
  }

  let el = styleEl()

  if (!el) {
    el = document.createElement('style')
    el.id = DESKTOP_CHROME_STYLE_ID
    el.setAttribute('data-slot', 'desktop-chrome-overlay')
    document.head.appendChild(el)
  }

  el.textContent = css

  return { ok: true }
}

export function clearOverlayCss(): void {
  styleEl()?.remove()
}

/** Read `desktop-chrome/overlay.css`, inject it, and snapshot on success.
 *  Invalid CSS keeps the previous injection and leaves the last-known-good
 *  snapshot untouched. */
export async function reloadDesktopChrome(): Promise<{ applied: boolean; css: string }> {
  const desktop = window.hermesDesktop
  const root = await desktop?.desktopChromeRoot?.()

  if (!root || !desktop?.readFileText) {
    return { applied: false, css: '' }
  }

  let css = ''

  try {
    const overlay = `${root.replace(/[/\\]+$/, '')}/overlay.css`
    css = (await desktop.readFileText(overlay)).text
  } catch {
    clearOverlayCss()
    await desktop.desktopChromeSnapshot?.()

    return { applied: true, css: '' }
  }

  const applied = applyOverlayCss(css)

  if (!applied.ok) {
    notifyError(new Error(applied.error), 'Desktop chrome overlay rejected')

    return { applied: false, css }
  }

  await desktop.desktopChromeSnapshot?.()

  return { applied: true, css }
}

export async function rollbackDesktopChrome(): Promise<boolean> {
  const desktop = window.hermesDesktop
  const result = await desktop?.desktopChromeRollback?.()

  if (!result?.ok) {
    notifyError(new Error('No last-known-good chrome snapshot'), 'Restore desktop chrome')

    return false
  }

  const next = await reloadDesktopChrome()

  return next.applied
}

export function watchDesktopChrome(): void {
  if (watching) {
    return
  }

  watching = true
  const desktop = window.hermesDesktop

  if (!desktop?.desktopChromeRoot) {
    return
  }

  void (async () => {
    await reloadDesktopChrome()
    const root = await desktop.desktopChromeRoot?.()

    if (!root) {
      return
    }

    const watchIds = new Set<string>()

    try {
      if (desktop.watchDirectory) {
        watchIds.add((await desktop.watchDirectory(root)).id)
      }
    } catch {
      // Overlay dir missing — first write still lands via palette reload.
    }

    try {
      watchIds.add((await desktop.watchPreviewFile(`${root.replace(/[/\\]+$/, '')}/overlay.css`)).id)
    } catch {
      // overlay.css is optional until the agent writes it.
    }

    desktop.onPreviewFileChanged(({ id }) => {
      if (watchIds.has(id)) {
        void reloadDesktopChrome()
      }
    })
  })()
}
