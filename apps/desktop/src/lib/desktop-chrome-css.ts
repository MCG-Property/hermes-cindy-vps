const BLOCKED_CSS =
  /@import\b|expression\s*\(|url\s*\(\s*['"]?\s*javascript:|behavior\s*:|-moz-binding\b/i

/** Shared overlay CSS gate — used by the Electron snapshot kernel and the
 *  renderer injector so they never disagree about what is safe to apply. */
export function validateOverlayCss(css: string): { error: string; ok: false } | { ok: true } {
  if (css.length > 512_000) {
    return { error: 'overlay.css exceeds 512 KiB', ok: false }
  }

  if (BLOCKED_CSS.test(css)) {
    return {
      error: 'overlay.css uses a blocked construct (@import, expression, javascript: URL, or behavior)',
      ok: false
    }
  }

  return { ok: true }
}
