import { cn, Codicon, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'

import { ideApi } from './api'

export interface Attachment {
  kind: string
  name: string
  text: string
}

interface Props {
  busy: boolean
  connection: string
  contextPct: number
  design: boolean
  model: string
  models: string[]
  mode: string
  onDesign: () => void
  onMode: (m: string) => void
  onModel: (m: string) => void
  onOpenTerminal: () => void
  onSend: (text: string, atts: Attachment[]) => void
  onStop: () => void
  repo: null | string
  terminals: number
  attachments: Attachment[]
  setAttachments: (a: Attachment[]) => void
  hasChat: boolean
}

type SpeechRec = { continuous: boolean; interimResults: boolean; onend: () => void; onerror: (e: { error: string }) => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; start: () => void; stop: () => void }

/** Cursor's composer: chips row (Terminal / Design Mode), pill with +, model picker and mic, then environment / mode / context ring. */
export function CursorComposer(p: Props) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [note, setNote] = useState('')
  const [picker, setPicker] = useState<null | string[]>(null)
  const [filter, setFilter] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const rec = useRef<null | SpeechRec>(null)

  useEffect(() => {
    if (note) {
      const t = setTimeout(() => setNote(''), 3500)

      return () => clearTimeout(t)
    }
  }, [note])

  const send = () => {
    const v = text.trim()

    if (!v || p.busy) {
      return
    }

    p.onSend(v, p.attachments)
    setText('')
    p.setAttachments([])

    if (ta.current) {
      ta.current.style.height = 'auto'
    }
  }

  const addFile = async (path: string, name: string) => {
    const r = await ideApi.fsRead(path)
    p.setAttachments([...p.attachments, { kind: 'file', name, text: r.text ?? '' }])
  }

  const openPicker = async () => {
    if (!p.repo) {
      setNote('Add a repository first')

      return
    }

    setFilter('')
    setPicker(await ideApi.fsFind(p.repo, ''))
  }

  const addDiff = async () => {
    if (!p.repo) {
      return
    }

    const ch = await ideApi.gitChanges(p.repo)
    let t = ''

    for (const f of ch.slice(0, 12)) {
      t += `--- ${f.file}\n${(await ideApi.gitDiff(p.repo, f.file)).diff.slice(0, 6000)}\n`
    }

    p.setAttachments([...p.attachments, { kind: 'git', name: 'git diff', text: t || '(no changes)' }])
  }

  const toggleMic = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition

    if (!Ctor) {
      setNote('Voice input is not available in this build')

      return
    }

    if (listening) {
      rec.current?.stop()

      return
    }

    const r = new Ctor()
    r.continuous = true
    r.interimResults = false
    r.onresult = e => setText(t => `${t} ${Array.from(e.results).map(x => x[0].transcript).join(' ')}`.trim())

    r.onerror = e => {
      setNote(`Voice input failed (${e.error})`)
      setListening(false)
    }

    r.onend = () => setListening(false)
    rec.current = r
    setListening(true)

    try {
      r.start()
    } catch {
      setListening(false)
    }
  }

  const modeLabel = p.mode === 'agent' ? 'Agent' : p.mode === 'plan' ? 'Plan' : 'Ask'
  const hasText = text.trim().length > 0

  return (
    <div className="relative">
      <div className="mb-2 flex gap-2">
        <button className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-2.5 text-[0.78rem] text-(--ui-text-secondary) hover:text-foreground" onClick={p.onOpenTerminal} type="button">
          <Codicon name="terminal" size="0.8rem" />
          {p.terminals > 0 ? `${p.terminals} ` : ''}Terminal
        </button>
        <button
          className={cn('inline-flex h-7 items-center gap-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-2.5 text-[0.78rem] text-(--ui-text-secondary) hover:text-foreground', p.design && 'border-sky-400/50 text-sky-300')}
          onClick={p.onDesign}
          type="button"
        >
          Design Mode
        </button>
      </div>
      <div className="rounded-[22px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-2.5 py-2 focus-within:border-(--ui-stroke-secondary)">
        {p.attachments.length ? (
          <div className="mb-1.5 flex flex-wrap gap-1.5 px-1.5">
            {p.attachments.map((a, i) => (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-white/10 px-2 text-[0.72rem] text-(--ui-text-secondary)" key={`${a.name}-${i}`}>
                {a.name}
                <button className="opacity-70 hover:opacity-100" onClick={() => p.setAttachments(p.attachments.filter((_, j) => j !== i))} type="button">
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-(--ui-text-secondary) hover:bg-white/15 hover:text-foreground" title="Add context" type="button">
                <Codicon name="add" size="0.9rem" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => void openPicker()}>
                <Codicon name="file" size="0.85rem" />
                <span className="ml-2">File from repository…</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void addDiff()}>
                <Codicon name="git-compare" size="0.85rem" />
                <span className="ml-2">Git diff</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <textarea
            className="max-h-44 min-h-6 flex-1 resize-none bg-transparent py-0.5 text-[0.9rem] leading-6 outline-none placeholder:text-(--ui-text-tertiary)"
            onChange={e => {
              const v = e.target.value
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(176, e.target.scrollHeight)}px`

              if (/(^|\s)@$/.test(v)) {
                setText(v.slice(0, -1))
                void openPicker()

                return
              }

              setText(v)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              } else if (e.key === 'Escape' && p.busy) {
                p.onStop()
              }
            }}
            placeholder={p.hasChat ? 'Send follow-up' : 'Plan, search, build anything'}
            ref={ta}
            rows={1}
            value={text}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex max-w-44 items-center gap-1 rounded-md px-1.5 py-1 text-[0.78rem] text-(--ui-text-secondary) hover:bg-white/10 hover:text-foreground" type="button">
                <span className="truncate">{p.model || 'Auto'}</span>
                <Codicon name="chevron-down" size="0.7rem" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              <DropdownMenuItem onSelect={() => p.onModel('')}>Auto</DropdownMenuItem>
              {p.models.length ? <DropdownMenuSeparator /> : null}
              {p.models.map(m => (
                <DropdownMenuItem key={m} onSelect={() => p.onModel(m)}>
                  {m}
                </DropdownMenuItem>
              ))}
              {!p.models.length ? <div className="px-2 py-1.5 text-[0.74rem] text-(--ui-text-tertiary)">Sign in to Cursor Agent to list models</div> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className={cn('grid size-8 shrink-0 place-items-center rounded-full text-[#151515] transition-opacity hover:opacity-90', listening ? 'bg-red-400' : 'bg-[#f2f2f2]')}
            onClick={p.busy ? p.onStop : hasText ? send : toggleMic}
            title={p.busy ? 'Stop' : hasText ? 'Send' : listening ? 'Stop dictation' : 'Voice input'}
            type="button"
          >
            <Codicon name={p.busy ? 'debug-stop' : hasText ? 'arrow-up' : 'mic-filled'} size="0.9rem" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pt-1.5 text-[0.78rem] text-(--ui-text-secondary)">
        <span className="inline-flex items-center gap-1.5">
          <Codicon name="device-desktop" size="0.8rem" />
          {p.connection}
        </span>
        <span className="inline-flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-md px-1.5 py-0.5 hover:bg-(--chrome-action-hover) hover:text-foreground" type="button">
                {modeLabel}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(['agent', 'plan', 'ask'] as const).map(m => (
                <DropdownMenuItem key={m} onSelect={() => p.onMode(m)}>
                  {m === 'agent' ? 'Agent' : m === 'plan' ? 'Plan' : 'Ask'}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span
            className={cn('size-3.5 rounded-full', p.busy && 'animate-spin')}
            style={{ background: `conic-gradient(#ffffffaa ${Math.max(4, p.contextPct)}%, #ffffff22 0)`, mask: 'radial-gradient(circle, transparent 3px, #000 4px)' }}
            title={`Context used: ${Math.round(p.contextPct)}%`}
          />
        </span>
      </div>
      {note ? <div className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-1 text-[0.76rem] text-white">{note}</div> : null}
      {picker ? (
        <div className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-full overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-primary,#1b1b1b) shadow-2xl">
          <input
            autoFocus
            className="w-full border-b border-(--ui-stroke-tertiary) bg-transparent px-3 py-2 text-[0.84rem] outline-none"
            onChange={e => {
              setFilter(e.target.value)
              void ideApi.fsFind(p.repo ?? '', e.target.value).then(setPicker)
            }}
            onKeyDown={e => e.key === 'Escape' && setPicker(null)}
            placeholder="Add a file from the repository…"
            value={filter}
          />
          <div className="max-h-56 overflow-y-auto p-1">
            {picker.slice(0, 40).map(f => {
              const name = f.replace(`${p.repo}/`, '')

              return (
                <button
                  className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[0.82rem] hover:bg-(--chrome-action-hover)"
                  key={f}
                  onClick={() => {
                    void addFile(f, name)
                    setPicker(null)
                  }}
                  type="button"
                >
                  <Codicon name="file" size="0.85rem" />
                  <span className="truncate">{name}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
