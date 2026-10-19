import { describe, expect, it } from 'vitest'

import { isUsableTerminalSize, shouldApplyTerminalFit, TERMINAL_FIT_HYSTERESIS_MS } from './terminal-fit'

describe('isUsableTerminalSize', () => {
  it('rejects missing, NaN, and degenerate sizes', () => {
    expect(isUsableTerminalSize(undefined)).toBe(false)
    expect(isUsableTerminalSize({ cols: Number.NaN, rows: 24 })).toBe(false)
    expect(isUsableTerminalSize({ cols: 80, rows: Number.NaN })).toBe(false)
    expect(isUsableTerminalSize({ cols: 1, rows: 24 })).toBe(false)
    expect(isUsableTerminalSize({ cols: 80, rows: 1 })).toBe(false)
  })

  it('accepts a normal PTY size', () => {
    expect(isUsableTerminalSize({ cols: 80, rows: 24 })).toBe(true)
  })
})

describe('shouldApplyTerminalFit', () => {
  const size = { cols: 80, rows: 24 }

  it('applies the first usable size', () => {
    expect(shouldApplyTerminalFit(size, null, 1_000, 0)).toBe(true)
  })

  it('skips an identical size', () => {
    expect(shouldApplyTerminalFit(size, size, 1_000, 900)).toBe(false)
  })

  it('never applies a 1-cell scrollbar / slash-menu flip', () => {
    expect(shouldApplyTerminalFit({ cols: 79, rows: 24 }, size, 1_000, 900)).toBe(false)
    expect(
      shouldApplyTerminalFit({ cols: 79, rows: 24 }, size, 1_000 + TERMINAL_FIT_HYSTERESIS_MS + 50, 1_000)
    ).toBe(false)
  })

  it('holds a 2-cell flip inside the hysteresis window, then applies it', () => {
    expect(shouldApplyTerminalFit({ cols: 78, rows: 24 }, size, 1_010, 1_000)).toBe(false)
    expect(
      shouldApplyTerminalFit({ cols: 78, rows: 24 }, size, 1_000 + TERMINAL_FIT_HYSTERESIS_MS, 1_000)
    ).toBe(true)
  })

  it('applies a real pane resize immediately', () => {
    expect(shouldApplyTerminalFit({ cols: 100, rows: 30 }, size, 1_010, 1_000)).toBe(true)
  })

  it('applies a 1-cell change when forced (activation / window resize)', () => {
    expect(shouldApplyTerminalFit({ cols: 79, rows: 24 }, size, 1_010, 1_000, TERMINAL_FIT_HYSTERESIS_MS, true)).toBe(
      true
    )
  })
})
