import { describe, expect, it, vi } from 'vitest'

import {
  announceTerminalBell,
  isNotificationOsc9,
  resetTerminalBellClock,
  shouldPlayTerminalBell,
  TERMINAL_BELL_DEBOUNCE_MS
} from './terminal-bell'

describe('shouldPlayTerminalBell', () => {
  it('plays the first bell', () => {
    expect(shouldPlayTerminalBell(1_000, 0)).toBe(true)
  })

  it('swallows a second bell inside the debounce window', () => {
    expect(shouldPlayTerminalBell(1_000, 1_000 - 200)).toBe(false)
  })

  it('plays again after the debounce window', () => {
    expect(shouldPlayTerminalBell(1_000 + TERMINAL_BELL_DEBOUNCE_MS, 1_000)).toBe(true)
  })
})

describe('isNotificationOsc9', () => {
  it('treats a finish title as a notification', () => {
    expect(isNotificationOsc9('Cursor finished: A Cursor agent turn completed.')).toBe(true)
  })

  it('leaves ConEmu cwd OSC 9 alone', () => {
    expect(isNotificationOsc9('9;/home/hermes/project')).toBe(false)
  })
})

describe('announceTerminalBell', () => {
  it('plays once, then notifies silently when the chime ran', async () => {
    resetTerminalBellClock()
    const playChime = vi.fn(async () => true)
    const notify = vi.fn(async () => true)

    await expect(announceTerminalBell(5_000, { notify, playChime })).resolves.toBe(true)
    await expect(announceTerminalBell(5_100, { notify, playChime })).resolves.toBe(false)
    expect(playChime).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledOnce()
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ silent: true, tag: 'terminal-bell' })
  })
})
