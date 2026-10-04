/** PTY / FitAddon size after a successful proposeDimensions(). */
export interface TerminalSize {
  cols: number
  rows: number
}

const MIN_COLS = 10
const MIN_ROWS = 2

/** Hold 2-cell flips this long. 1-cell flips are dropped entirely unless
 *  `force` — a 160ms 1-cell window still WINCH'd Cursor ~6 times/sec. */
export const TERMINAL_FIT_HYSTERESIS_MS = 400
export const TERMINAL_FIT_IGNORE_CELLS = 1
export const TERMINAL_FIT_HYSTERESIS_CELLS = 2

export function isUsableTerminalSize(proposed: { cols: number; rows: number } | undefined | null): proposed is TerminalSize {
  if (!proposed) {
    return false
  }

  const { cols, rows } = proposed

  return Number.isFinite(cols) && Number.isFinite(rows) && cols >= MIN_COLS && rows >= MIN_ROWS
}

/**
 * True when FitAddon should apply `proposed` and the PTY should be WINCH'd.
 *
 * Drops NaN / degenerate sizes (xterm #4338) and 1-col/1-row oscillation
 * inside a short window (viewport scrollbar appearing while the user scrolls
 * or a TUI slash menu redraws).
 */
export function shouldApplyTerminalFit(
  proposed: { cols: number; rows: number } | undefined | null,
  lastApplied: TerminalSize | null,
  now: number,
  lastAppliedAt: number,
  hysteresisMs = TERMINAL_FIT_HYSTERESIS_MS,
  force = false
): proposed is TerminalSize {
  if (!isUsableTerminalSize(proposed)) {
    return false
  }

  if (!lastApplied || force) {
    return true
  }

  if (lastApplied.cols === proposed.cols && lastApplied.rows === proposed.rows) {
    return false
  }

  const dCol = Math.abs(proposed.cols - lastApplied.cols)
  const dRow = Math.abs(proposed.rows - lastApplied.rows)

  if (dCol <= TERMINAL_FIT_IGNORE_CELLS && dRow <= TERMINAL_FIT_IGNORE_CELLS) {
    return false
  }

  if (dCol <= TERMINAL_FIT_HYSTERESIS_CELLS && dRow <= TERMINAL_FIT_HYSTERESIS_CELLS && now - lastAppliedAt < hysteresisMs) {
    return false
  }

  return true
}
