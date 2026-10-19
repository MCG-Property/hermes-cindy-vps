import { afterEach, describe, expect, it } from 'vitest'

import { applyOverlayCss, clearOverlayCss, DESKTOP_CHROME_STYLE_ID } from './desktop-chrome'

afterEach(() => {
  clearOverlayCss()
})

describe('applyOverlayCss', () => {
  it('injects a style tag for safe token overrides', () => {
    expect(applyOverlayCss(':root { --radius-scalar: 1.1; }')).toEqual({ ok: true })
    expect(document.getElementById(DESKTOP_CHROME_STYLE_ID)?.textContent).toContain('--radius-scalar')
  })

  it('rejects blocked CSS and leaves the previous injection in place', () => {
    applyOverlayCss(':root { --ok: 1; }')
    expect(applyOverlayCss('@import "https://evil.example/x.css";').ok).toBe(false)
    expect(document.getElementById(DESKTOP_CHROME_STYLE_ID)?.textContent).toContain('--ok')
  })
})
