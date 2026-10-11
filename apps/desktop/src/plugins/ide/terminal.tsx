import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef, useState } from 'react'

import { ideApi } from './api'

export type TermKind = 'claude' | 'codex' | 'cursor' | 'opencode' | 'shell'

const BASE_ANSI = {
  black: '#1e1e1e', blue: '#4f9cf5', brightBlack: '#6b6b6b', brightBlue: '#7db8ff', brightCyan: '#5fe0e0', brightGreen: '#6fe08a',
  brightMagenta: '#d68cf0', brightRed: '#ff7a7a', brightWhite: '#ffffff', brightYellow: '#ffd866', cyan: '#3cc7c7', green: '#4ec96a',
  magenta: '#c678dd', red: '#f0506e', white: '#d4d4d4', yellow: '#e5c07b'
}

/** Terminal chrome per agent: the TUI paints its own colours; this is the canvas and cursor they sit on. */
export const TERM_THEME: Record<TermKind, Record<string, string>> = {
  claude: { ...BASE_ANSI, background: '#0d0d0d', cursor: '#d77757', foreground: '#e8e8e8', selectionBackground: '#d7775744' },
  codex: { ...BASE_ANSI, background: '#0c0c0c', cursor: '#56b6c2', foreground: '#e6e6e6', selectionBackground: '#56b6c244' },
  cursor: { ...BASE_ANSI, background: '#181818', cursor: '#8ba8c7', foreground: '#f0f0f0', selectionBackground: '#8ba8c744' },
  opencode: { ...BASE_ANSI, background: '#0a0a0a', cursor: '#fab283', foreground: '#eeeeee', selectionBackground: '#fab28344' },
  shell: { ...BASE_ANSI, background: '#00000000', cursor: '#e8e8e8', foreground: '#e8e8e8' }
}

export interface TermHandle {
  id: string
  title: string
}

interface Props {
  cwd: null | string
  fontSize?: number
  kind: TermKind
  /** Called once the PTY exists (new or re-attached) so the owner can persist its id. */
  onReady?: (t: TermHandle) => void
  resume?: boolean
  /** Existing PTY to re-attach to; if it is gone a fresh one is started (with `resume`). */
  termId?: string
  visible: boolean
  /** bump to force a fresh PTY */
  nonce?: number
}

const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

/**
 * xterm bound to a PTY on the connected box. Output is long-polled (the backend holds the request until bytes arrive), input is
 * batched into ordered POSTs, and the PTY outlives this component, so panels keep their session across tab switches and reloads.
 */
export function AgentTerminal({ cwd, fontSize = 12.5, kind, nonce = 0, onReady, resume, termId, visible }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [exited, setExited] = useState<null | number>(null)
  const [error, setError] = useState('')
  const [restart, setRestart] = useState(0)
  const [inst, setInst] = useState<null | { fit: FitAddon; term: Terminal }>(null)

  useEffect(() => {
    if (!inst) {
      return
    }

    inst.term.options.fontSize = fontSize

    try {
      inst.fit.fit()
    } catch {
      /* hidden */
    }
  }, [fontSize, inst])

  useEffect(() => {
    const el = host.current

    if (!el) {
      return
    }

    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: kind === 'opencode' ? 'bar' : 'block',
      fontFamily: '"SF Mono", ui-monospace, Menlo, "JetBrains Mono", monospace',
      fontSize,
      lineHeight: 1.15,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: TERM_THEME[kind]
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    const uni = new Unicode11Addon()
    term.loadAddon(uni)
    term.unicode.activeVersion = '11'
    term.loadAddon(new WebLinksAddon((_e, uri) => window.open(uri, '_blank')))
    term.open(el)

    try {
      const gl = new WebglAddon()
      gl.onContextLoss(() => gl.dispose())
      term.loadAddon(gl)
    } catch {
      /* canvas renderer fallback */
    }

    const safeFit = () => {
      try {
        fit.fit()
      } catch {
        /* hidden */
      }
    }

    safeFit()
    setInst({ fit, term })
    let dead = false
    let id = ''
    let after = 0
    let queue = ''
    let flushing = false
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const dec = new TextDecoder()

    const flush = async () => {
      if (flushing || !id) {
        return
      }

      flushing = true

      while (queue && !dead) {
        const chunk = queue
        queue = ''

        try {
          await ideApi.termInput(id, chunk)
        } catch {
          break
        }
      }

      flushing = false
    }

    const dispData = term.onData(d => {
      queue += d
      void flush()
    })

    const dispResize = term.onResize(({ cols, rows }) => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => id && void ideApi.termResize(id, cols, rows).catch(() => undefined), 60)
    })

    void (async () => {
      try {
        // Re-attach to the PTY we had; if it is gone (backend restarted) start the agent again, resuming its last
        // session when it has one and falling back to a fresh session when it exits straight away.
        let info: null | { id: string; title: string } = null
        const explicit = !!resume || restart > 0
        let useResume = explicit || !!termId

        if (termId && restart === 0) {
          const alive = await ideApi.termList(kind === 'shell' ? '' : kind).catch(() => [])
          const hit = alive.find(t => t.id === termId)

          if (hit) {
            info = { id: hit.id, title: hit.title }
            useResume = false
          }
        }

        for (let attempt = 0; attempt < 2 && !dead; attempt++) {
          const startedAt = Date.now()

          if (!info) {
            info = await ideApi.termNew({ cols: term.cols, cwd, kind, resume: useResume, rows: term.rows })
          }

          id = info.id
          after = 0
          onReady?.(info)
          void ideApi.termResize(id, term.cols, term.rows).catch(() => undefined)
          void flush()
          let quickFail = false

          while (!dead) {
            try {
              const r = await ideApi.termRead(id, after, 20)
              after = r.next

              if (r.data) {
                term.write(dec.decode(b64(r.data), { stream: true }))
              }

              if (!r.alive && !r.data) {
                quickFail = useResume && !explicit && !!r.exit && Date.now() - startedAt < 6000

                if (!quickFail) {
                  setExited(r.exit ?? 0)
                }

                break
              }
            } catch (e) {
              if (dead) {
                break
              }

              setError(e instanceof Error ? e.message : String(e))
              await new Promise(res => setTimeout(res, 1500))
            }
          }

          if (!quickFail) {
            break
          }

          term.reset()
          info = null
          useResume = false
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()

    const ro = new ResizeObserver(safeFit)
    ro.observe(el)

    return () => {
      dead = true
      clearTimeout(resizeTimer)
      ro.disconnect()
      dispData.dispose()
      dispResize.dispose()
      term.dispose()
      setInst(null)
    }
    // A restart/nonce re-runs the attach loop on a fresh terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, restart])

  useEffect(() => {
    if (visible && inst) {
      const t = setTimeout(() => {
        try {
          inst.fit.fit()
          inst.term.focus()
        } catch {
          /* hidden */
        }
      }, 40)

      return () => clearTimeout(t)
    }
  }, [inst, visible])

  return (
    <div className="relative h-full min-h-0 w-full" style={{ background: TERM_THEME[kind].background }}>
      <div className="h-full min-h-0 w-full px-2 pt-2" ref={host} />
      {error ? <div className="absolute top-2 right-3 rounded bg-red-500/20 px-2 py-0.5 text-[0.72rem] text-red-300">{error}</div> : null}
      {exited !== null ? (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <button
            className="rounded-lg bg-white/10 px-3 py-1.5 text-[0.8rem] text-white hover:bg-white/20"
            onClick={() => {
              inst?.term.reset()
              setExited(null)
              setRestart(n => n + 1)
            }}
            type="button"
          >
            Session ended{exited ? ` (exit ${exited})` : ''} — restart
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Plain shell panel. */
export function IdeTerminal({ cwd, visible }: { cwd: null | string; visible: boolean }) {
  return <AgentTerminal cwd={cwd} kind="shell" visible={visible} />
}
