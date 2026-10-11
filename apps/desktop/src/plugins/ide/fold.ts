import type { RunEvent, Step, Turn } from './types'

/** Fold one streamed run event into an assistant turn (mirror of the backend's `_fold`). */
export function foldEvent(turn: Turn, ev: RunEvent): Turn {
  const t = { ...turn, steps: [...(turn.steps ?? [])] }

  switch (ev.type) {
    case 'text':
      t.text = (t.text ?? '') + ev.text

      break

    case 'thinking':
      t.thinking = (t.thinking ?? '') + ev.text

      break
    case 'tool': {
      const s: Step = { agent: ev.agent, arg: ev.arg, id: ev.id, kind: ev.kind, name: ev.name }
      t.steps = [...t.steps, s]

      break
    }

    case 'tool_result':
      t.steps = t.steps.map(s => (s.id === ev.id ? { ...s, ok: ev.ok, result: ev.result } : s))

      break

    case 'usage':
      t.usage = { cost: ev.cost, input: ev.input, output: ev.output }

      break

    case 'error':
      t.error = ev.message

      break

    default:
  }

  return t
}

export function ago(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)

  if (s < 60) {
    return 'now'
  }

  if (s < 3600) {
    return `${Math.floor(s / 60)}m`
  }

  if (s < 86400) {
    return `${Math.floor(s / 3600)}h`
  }

  return `${Math.floor(s / 86400)}d`
}

export const dur = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`)
export const repoName = (p: null | string | undefined) => (p ? (p.split('/').filter(Boolean).pop() ?? p) : '')
