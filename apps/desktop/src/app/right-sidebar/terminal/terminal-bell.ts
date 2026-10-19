/** Ignore BEL spam from TUI redraws / paired OSC+BEL in one finish event. */
export const TERMINAL_BELL_DEBOUNCE_MS = 1500

let lastBellAt = 0

export function resetTerminalBellClock(): void {
  lastBellAt = 0
}

export function shouldPlayTerminalBell(now: number, lastPlayedAt: number, debounceMs = TERMINAL_BELL_DEBOUNCE_MS): boolean {
  if (lastPlayedAt <= 0) {
    return true
  }

  return now - lastPlayedAt >= debounceMs
}

export async function announceTerminalBell(
  now = Date.now(),
  api: { playChime?: () => Promise<boolean>; notify?: (payload: {
    title: string
    body: string
    kind: string
    tag: string
    silent: boolean
  }) => Promise<boolean> } | undefined = typeof window === 'undefined' ? undefined : window.hermesDesktop
): Promise<boolean> {
  if (!shouldPlayTerminalBell(now, lastBellAt)) {
    return false
  }

  lastBellAt = now
  const played = (await api?.playChime?.()) ?? false

  await api?.notify?.({
    title: 'Cursor finished',
    body: 'A VPS agent turn completed.',
    kind: 'success',
    tag: 'terminal-bell',
    silent: played
  })

  return true
}

/** OSC 9 used as a desktop notification, not ConEmu `9;9;<cwd>`. */
export function isNotificationOsc9(payload: string): boolean {
  const text = payload.trim()

  return Boolean(text) && !text.startsWith('9;')
}
