import { useCallback, useEffect, useRef, useState } from 'react'

import { ideApi } from './api'
import { foldEvent } from './fold'
import { refresh } from './store'
import type { RunEvent, Turn } from './types'

export interface SessionApi {
  busy: boolean
  live: null | Turn
  send: (text: string, extra?: { attachments?: unknown[]; mode?: string; model?: string }) => Promise<void>
  stop: () => void
  turns: Turn[]
}

interface Options {
  /** Called for every `ui` event (the Hermes chat asks the shell to open a panel). */
  onUi?: (action: string, agent?: string) => void
  /** How to start a run for a prompt. Returns the run id. */
  start: (text: string, extra?: { attachments?: unknown[]; mode?: string; model?: string }) => Promise<string>
  /** Loads the persisted transcript (and any run still in flight). */
  load: () => Promise<{ run?: null | string; ui: Turn[] }>
  key: null | string
}

/** One conversation: persisted turns + a live assistant turn fed by polling the run's event stream. */
export function useSession({ key, load, onUi, start }: Options): SessionApi {
  const [turns, setTurns] = useState<Turn[]>([])
  const [live, setLive] = useState<null | Turn>(null)
  const [busy, setBusy] = useState(false)
  const runRef = useRef<null | string>(null)
  const [alive] = useState(() => ({ on: true }))
  // Latest-render holder: `send` is a long-lived async closure, so it must call the CURRENT reload (the chat id can change mid-send).
  const [latest] = useState<{ reload: () => Promise<void> }>(() => ({ reload: async () => undefined }))
  const onUiRef = useRef(onUi)
  onUiRef.current = onUi

  const follow = useCallback(async (run: string) => {
    runRef.current = run
    setBusy(true)
    let after = 0
    let cur: Turn = { id: `live-${run}`, role: 'assistant', steps: [], text: '', ts: Date.now() }
    setLive(cur)

    while (alive.on) {
      try {
        const d = await ideApi.poll(run, after)
        after = d.next

        for (const ev of d.events as RunEvent[]) {
          if (ev.type === 'ui') {
            onUiRef.current?.(ev.action, ev.agent)
          } else if (ev.type !== 'done') {
            cur = foldEvent(cur, ev)
          }
        }

        if (d.events.length) {
          setLive(cur)
        }

        if (d.done) {
          break
        }
      } catch {
        break
      }

      await new Promise(r => setTimeout(r, 220))
    }

    runRef.current = null
    setBusy(false)
    setLive(null)
    void refresh()
  }, [alive])

  const reload = useCallback(async () => {
    if (!key) {
      setTurns([])

      return
    }

    try {
      const c = await load()

      if (alive.on) {
        setTurns(c.ui)

        if (c.run && !runRef.current) {
          void follow(c.run)
        }
      }
    } catch {
      setTurns([])
    }
  }, [alive, follow, key, load])

  latest.reload = reload

  useEffect(() => {
    alive.on = true
    void reload()

    return () => {
      alive.on = false
    }
  }, [alive, reload])

  const send = useCallback<SessionApi['send']>(
    async (text, extra) => {
      if (runRef.current) {
        return
      }

      setTurns(t => [...t, { id: `u-${Date.now()}`, role: 'user', text, ts: Date.now() }])

      try {
        const run = await start(text, extra)
        await follow(run)
        await latest.reload()
      } catch (e) {
        setLive(null)
        setBusy(false)
        setTurns(t => [...t, { error: e instanceof Error ? e.message : String(e), id: `e-${Date.now()}`, role: 'assistant', ts: Date.now() }])
      }
    },
    [follow, latest, start]
  )

  const stop = useCallback(() => {
    if (runRef.current) {
      void ideApi.stop(runRef.current)
    }
  }, [])

  return { busy, live, send, stop, turns }
}
