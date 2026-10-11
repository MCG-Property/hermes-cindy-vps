import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef, useState } from 'react'

import { ideApi } from './api'

/** xterm bound to a PTY on the connected box: output is polled (cursor-based), input/resize are REST calls. */
export function IdeTerminal({ cwd, visible }: { cwd: null | string; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [fit] = useState(() => new FitAddon())

  useEffect(() => {
    if (!host.current) {
      return
    }

    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      theme: { background: '#00000000', cursor: '#e8e8e8', foreground: '#e8e8e8' }
    })

    term.loadAddon(fit)
    term.open(host.current)
    let id = ''
    let after = 0
    let dead = false
    const dec = new TextDecoder()

    const safeFit = () => {
      try {
        fit.fit()
      } catch {
        /* hidden */
      }
    }

    safeFit()

    void (async () => {
      try {
        id = (await ideApi.termNew(cwd, term.cols, term.rows)).id
      } catch (e) {
        term.write(`\r\n[terminal unavailable: ${e instanceof Error ? e.message : String(e)}]\r\n`)

        return
      }

      term.onData(d => void ideApi.termInput(id, d))
      term.onResize(({ cols, rows }) => void ideApi.termResize(id, cols, rows))

      while (!dead) {
        try {
          const r = await ideApi.termRead(id, after)
          after = r.next

          if (r.data) {
            const bin = atob(r.data)
            term.write(dec.decode(Uint8Array.from(bin, c => c.charCodeAt(0)), { stream: true }))
          }

          if (!r.alive && !r.data) {
            term.write('\r\n[process exited]\r\n')

            break
          }
        } catch {
          break
        }

        await new Promise(res => setTimeout(res, 90))
      }
    })()

    const ro = new ResizeObserver(safeFit)
    ro.observe(host.current)

    return () => {
      dead = true
      ro.disconnect()

      if (id) {
        void ideApi.termKill(id)
      }

      term.dispose()
    }
  }, [cwd, fit])

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        try {
          fit.fit()
        } catch {
          /* hidden */
        }
      }, 30)
    }
  }, [fit, visible])

  return <div className="h-full min-h-0 w-full px-2 pt-2" ref={host} />
}
