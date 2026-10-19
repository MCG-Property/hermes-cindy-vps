import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { desktopChromeRoot, rollbackChrome, snapshotChrome, validateOverlayCss } from './desktop-chrome'

const homes: string[] = []

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-chrome-'))
  homes.push(home)

  return home
}

afterEach(() => {
  for (const home of homes.splice(0)) {
    fs.rmSync(home, { force: true, recursive: true })
  }
})

describe('validateOverlayCss', () => {
  it('accepts ordinary token overrides', () => {
    expect(validateOverlayCss(':root { --radius-scalar: 1.2; }')).toEqual({ ok: true })
  })

  it('rejects remote imports and script URLs', () => {
    expect(validateOverlayCss('@import url("https://evil.example/x.css");').ok).toBe(false)
    expect(validateOverlayCss('a { background: url(javascript:alert(1)); }').ok).toBe(false)
  })
})

describe('desktop chrome snapshot / rollback', () => {
  it('restores the last successful overlay after a bad write', async () => {
    const root = await desktopChromeRoot(makeHome())
    fs.writeFileSync(path.join(root, 'overlay.css'), '.ok { color: green; }')
    await snapshotChrome(root)

    fs.writeFileSync(path.join(root, 'overlay.css'), '@import "nope.css";')
    const rolled = await rollbackChrome(root)

    expect(rolled).toEqual({ ok: true, restored: ['overlay.css'] })
    expect(fs.readFileSync(path.join(root, 'overlay.css'), 'utf8')).toBe('.ok { color: green; }')
  })
})
