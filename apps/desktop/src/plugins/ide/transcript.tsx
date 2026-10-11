import { cn, Codicon, CopyButton } from '@hermes/plugin-sdk'
import { useState } from 'react'

import { ago, dur } from './fold'
import { Markdown } from './md'
import { KIND_VERB, type Skin, SKINS } from './skins'
import type { AgentId, Step, Turn } from './types'

interface Props {
  agent: AgentId | 'hermes'
  live: null | Turn
  turns: Turn[]
  busy: boolean
  onApply?: (code: string) => void
  onLink?: (u: string) => void
  onFork?: () => void
  cwd?: null | string
}

const verb = (s: Step) => KIND_VERB[s.kind ?? 'other'] ?? s.name

function firstLine(s: string | undefined, n = 110): string {
  const l = (s ?? '').split('\n').find(x => x.trim()) ?? ''

  return l.length > n ? `${l.slice(0, n)}…` : l
}

// ---------- shared pieces ----------

function CodeActions({ code, onApply }: { code: string; onApply?: (c: string) => void }) {
  return (
    <span className="flex items-center gap-1">
      <CopyButton className="size-5" text={code} />
      {onApply ? (
        <button className="rounded px-1.5 text-[0.68rem] text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground" onClick={() => onApply(code)} type="button">
          Apply
        </button>
      ) : null}
    </span>
  )
}

function Body({ onApply, onLink, text }: { onApply?: (c: string) => void; onLink?: (u: string) => void; text: string }) {
  return <Markdown onCode={(c) => <CodeActions code={c} onApply={onApply} />} onLink={onLink} text={text} />
}

// ---------- Cursor skin: bubbles + collapsible “Worked for” ----------

function CursorUser({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false)
  const long = (turn.text ?? '').length > 320

  return (
    <div className={cn('group relative my-5 cursor-default rounded-2xl bg-(--ui-bg-quaternary) px-4 py-3 text-[0.9rem] leading-relaxed whitespace-pre-wrap select-text', long && !open && 'max-h-40 overflow-hidden')} onClick={() => long && setOpen(o => !o)}>
      {turn.attachments?.length ? <div className="mb-2 flex flex-wrap gap-1">{turn.attachments.map(a => <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.72rem] text-(--ui-text-secondary)" key={a}>{a}</span>)}</div> : null}
      {turn.text}
      {long && !open ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-(--ui-bg-quaternary) to-transparent" /> : null}
      <span className="absolute right-3 bottom-2 hidden text-(--ui-text-tertiary) group-hover:block" title="Revert to this message">
        <Codicon name="discard" size="0.85rem" />
      </span>
    </div>
  )
}

function CursorTurn({ busy, onApply, onFork, onLink, turn }: { busy: boolean; onApply?: (c: string) => void; onFork?: () => void; onLink?: (u: string) => void; turn: Turn }) {
  const [open, setOpen] = useState(false)
  const steps = turn.steps ?? []

  if (turn.role === 'user') {
    return <CursorUser turn={turn} />
  }

  return (
    <div className="my-2">
      {(steps.length > 0 || busy || turn.worked) && (
        <button className="mb-1 inline-flex items-center gap-1.5 text-[0.88rem] text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)" onClick={() => setOpen(o => !o)} type="button">
          {busy ? <span className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <Codicon name={open ? 'chevron-down' : 'chevron-right'} size="0.8rem" />}
          {busy ? (steps.length ? `${verb(steps[steps.length - 1])} ${firstLine(steps[steps.length - 1].arg, 60)}` : 'Thinking…') : `Worked for ${dur(Math.max(1, turn.worked ?? 1))}`}
        </button>
      )}
      {open && steps.length > 0 && (
        <div className="mb-2 ml-1 border-l border-(--ui-stroke-tertiary) pl-3">
          {steps.map(s => (
            <div className="py-0.5 text-[0.8rem] text-(--ui-text-tertiary)" key={s.id}>
              <span className="font-medium text-(--ui-text-secondary)">{verb(s)}</span> <span className="font-mono text-[0.75rem]">{firstLine(s.arg, 80)}</span>
              {s.result ? <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-(--ui-widget-surface-background) p-2 font-mono text-[0.7rem] whitespace-pre-wrap">{s.result}</pre> : null}
            </div>
          ))}
        </div>
      )}
      {turn.text ? <Body onApply={onApply} onLink={onLink} text={turn.text} /> : null}
      {turn.error ? <div className="my-1 text-(--ui-error,#ff4f5f)">{turn.error}</div> : null}
      {!busy && turn.text ? (
        <div className="mt-1 flex items-center gap-0.5 text-(--ui-text-tertiary)">
          <button className="grid size-7 place-items-center rounded-md hover:bg-(--chrome-action-hover) hover:text-foreground" title="Good response" type="button">
            <Codicon name="thumbsup" size="0.85rem" />
          </button>
          <button className="grid size-7 place-items-center rounded-md hover:bg-(--chrome-action-hover) hover:text-foreground" title="Bad response" type="button">
            <Codicon name="thumbsdown" size="0.85rem" />
          </button>
          <CopyButton className="size-7" text={turn.text} />
          <button className="grid size-7 place-items-center rounded-md hover:bg-(--chrome-action-hover) hover:text-foreground" onClick={onFork} title="Fork into a new chat" type="button">
            <Codicon name="repo-forked" size="0.85rem" />
          </button>
          <span className="ml-2 text-[0.8rem]">{ago(turn.ts)} ago</span>
        </div>
      ) : null}
    </div>
  )
}

// ---------- Claude desktop app (Code tab): serif assistant text, plain user text, collapsible tool rows ----------

const STEP_ICON: Record<string, string> = { agent: 'organization', edit: 'edit', other: 'tools', read: 'file', search: 'search', shell: 'terminal', todo: 'checklist', web: 'globe' }

function ClaudeDesktopTurn({ busy, onApply, onLink, skin, turn }: { busy: boolean; onApply?: (c: string) => void; onLink?: (u: string) => void; skin: Skin; turn: Turn }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})

  if (turn.role === 'user') {
    return (
      <div className="my-5 w-fit max-w-[92%] rounded-2xl bg-[#262626] px-4 py-2.5 text-[0.92rem] leading-relaxed whitespace-pre-wrap select-text">
        {turn.attachments?.length ? <div className="mb-1.5 flex flex-wrap gap-1">{turn.attachments.map(a => <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[0.72rem]" key={a}>{a}</span>)}</div> : null}
        {turn.text}
      </div>
    )
  }

  return (
    <div className="my-4 min-w-0">
      {turn.thinking ? <div className="mb-1 text-[0.82rem] text-(--ui-text-tertiary) italic">{busy && !turn.text ? 'Thinking…' : 'Thought'}</div> : null}
      {(turn.steps ?? []).map(s => (
        <div className="my-1" key={s.id}>
          <button className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-[0.8rem] hover:bg-white/[0.06]" onClick={() => setOpen(o => ({ ...o, [s.id]: !o[s.id] }))} type="button">
            <Codicon name={STEP_ICON[s.kind ?? 'other'] ?? 'tools'} size="0.85rem" style={{ color: s.result === undefined ? skin.accent : s.ok === false ? skin.err : undefined }} />
            <span className="font-medium">{verb(s)}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[0.74rem] text-(--ui-text-tertiary)">{firstLine(s.arg, 90)}</span>
            {s.result === undefined ? <span className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent text-(--ui-text-tertiary)" /> : <Codicon name={open[s.id] ? 'chevron-up' : 'chevron-down'} size="0.75rem" />}
          </button>
          {open[s.id] && s.result ? <pre className="mx-1 mt-1 max-h-48 overflow-auto rounded-lg bg-white/[0.04] p-2.5 font-mono text-[0.72rem] whitespace-pre-wrap text-(--ui-text-secondary)">{s.result}</pre> : null}
        </div>
      ))}
      {turn.text ? (
        <div className="text-[0.95rem] leading-[1.7]">
          <Body onApply={onApply} onLink={onLink} text={turn.text} />
        </div>
      ) : null}
      {turn.error ? <div className="my-1 text-(--ui-error,#ff6b80)">{turn.error}</div> : null}
      {busy ? (
        <div className="mt-1 flex items-center gap-2 text-[0.86rem]" style={{ color: skin.accent }}>
          <span className="animate-pulse">✻</span>
          <span>Thinking…</span>
        </div>
      ) : null}
    </div>
  )
}

// ---------- Codex desktop app: right-aligned user bubble, plain assistant text, grouped command / edit lines ----------

function CodexDesktopTurn({ busy, onApply, onLink, skin, turn }: { busy: boolean; onApply?: (c: string) => void; onLink?: (u: string) => void; skin: Skin; turn: Turn }) {
  const [open, setOpen] = useState(false)

  if (turn.role === 'user') {
    return (
      <div className="my-4 ml-auto w-fit max-w-[82%] rounded-[18px] bg-(--ui-bg-quaternary) px-4 py-2.5 text-[0.9rem] leading-relaxed whitespace-pre-wrap select-text">
        {turn.attachments?.length ? <div className="mb-1.5 flex flex-wrap gap-1">{turn.attachments.map(a => <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.72rem]" key={a}>{a}</span>)}</div> : null}
        {turn.text}
      </div>
    )
  }

  const steps = turn.steps ?? []
  const cmds = steps.filter(s => s.kind === 'shell')
  const edits = steps.filter(s => s.kind === 'edit')
  const rest = steps.filter(s => s.kind !== 'shell' && s.kind !== 'edit')

  return (
    <div className="my-3 text-[0.92rem] leading-relaxed">
      {turn.thinking ? <div className="mb-1 text-[0.8rem] text-(--ui-text-tertiary)">{busy && !turn.text ? 'Thinking…' : 'Thought'}</div> : null}
      {steps.length ? (
        <div className="mb-2">
          <button className="flex items-center gap-1.5 text-[0.82rem] text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)" onClick={() => setOpen(o => !o)} type="button">
            <Codicon name={open ? 'chevron-down' : 'chevron-right'} size="0.75rem" />
            {[cmds.length ? `Ran ${cmds.length} command${cmds.length > 1 ? 's' : ''}` : '', edits.length ? `Edited ${edits.length} file${edits.length > 1 ? 's' : ''}` : '', rest.length ? `Explored ${rest.length}` : ''].filter(Boolean).join(', ')}
          </button>
          {open ? (
            <div className="mt-1 ml-1 space-y-0.5 border-l border-(--ui-stroke-tertiary) pl-3">
              {steps.map(s => (
                <div className="text-[0.78rem] text-(--ui-text-tertiary)" key={s.id}>
                  <span className="text-(--ui-text-secondary)">{verb(s)}</span> <span className="font-mono text-[0.74rem]">{firstLine(s.arg, 90)}</span>
                  {s.result ? <div className="line-clamp-3 font-mono text-[0.7rem] whitespace-pre-wrap">{s.result}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
          {edits.length ? (
            <div className="mt-2 space-y-1">
              {edits.map(s => (
                <div className="flex items-center gap-2 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-widget-surface-background) px-2.5 py-1.5 text-[0.8rem]" key={s.id}>
                  <Codicon name="file" size="0.85rem" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.76rem]">{firstLine(s.arg, 80)}</span>
                  <span style={{ color: s.ok === false ? skin.err : skin.ok }}>{s.result === undefined ? '…' : s.ok === false ? 'failed' : 'edited'}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {turn.text ? <Body onApply={onApply} onLink={onLink} text={turn.text} /> : null}
      {turn.error ? <div className="text-(--ui-error,#e06c75)">{turn.error}</div> : null}
      {busy ? <div className="mt-1 flex items-center gap-2 text-[0.82rem] text-(--ui-text-tertiary)"><span className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent" />Working</div> : null}
      {!busy && turn.worked ? <div className="mt-1 text-[0.76rem] text-(--ui-text-tertiary)">Worked for {dur(Math.max(1, turn.worked))}</div> : null}
    </div>
  )
}

// ---------- OpenCode skin: accent-barred message blocks ----------

function OpenCodeTurn({ busy, onApply, onLink, skin, turn }: { busy: boolean; onApply?: (c: string) => void; onLink?: (u: string) => void; skin: Skin; turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div className="my-3 rounded-sm border-l-2 bg-(--ui-bg-quaternary) px-3 py-2 text-[0.88rem] whitespace-pre-wrap select-text" style={{ borderColor: skin.accent }}>
        {turn.text}
      </div>
    )
  }

  return (
    <div className="my-2 px-1 text-[0.88rem]">
      {(turn.steps ?? []).map(s => (
        <div className="flex items-baseline gap-2 py-px text-[0.8rem] text-(--ui-text-tertiary)" key={s.id}>
          <span style={{ color: s.result === undefined ? skin.accent : s.ok === false ? skin.err : skin.ok }}>{s.result === undefined ? '◇' : s.ok === false ? '✗' : '→'}</span>
          <span>{verb(s)}</span>
          <span className="truncate font-mono text-[0.76rem] text-(--ui-text-secondary)">{firstLine(s.arg, 90)}</span>
        </div>
      ))}
      {turn.text ? <Body onApply={onApply} onLink={onLink} text={turn.text} /> : null}
      {turn.error ? <div style={{ color: skin.err }}>{turn.error}</div> : null}
      {busy ? <div className="mt-1 text-[0.8rem]" style={{ color: skin.accent }}>▣ working…</div> : null}
      {!busy && turn.usage?.cost ? <div className="mt-1 text-[0.7rem] text-(--ui-text-tertiary)">${turn.usage.cost.toFixed(4)} · {turn.usage.input ?? 0}↓ {turn.usage.output ?? 0}↑</div> : null}
    </div>
  )
}

// ---------- Hermes (orchestrator) skin: native chat with agent-call cards ----------

function HermesTurn({ busy, onLink, turn }: { busy: boolean; onLink?: (u: string) => void; turn: Turn }) {
  if (turn.role === 'user') {
    return <div className="my-3 ml-auto w-fit max-w-[92%] rounded-2xl bg-(--ui-bg-quaternary) px-3 py-2 text-[0.85rem] whitespace-pre-wrap select-text">{turn.text}</div>
  }

  return (
    <div className="my-2 text-[0.85rem]">
      {(turn.steps ?? []).map(s => {
        const a = s.name.startsWith('run_') ? (s.name.slice(4) as AgentId) : null
        const accent = a ? SKINS[a].accent : 'var(--ui-text-tertiary)'

        return (
          <div className="my-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-widget-surface-background) px-2.5 py-1.5" key={s.id}>
            <div className="flex items-center gap-2 text-[0.78rem]">
              <span className="size-2 rounded-full" style={{ background: s.result === undefined ? accent : s.ok === false ? '#ff4f5f' : accent, opacity: s.result === undefined ? 1 : 0.9 }} />
              <b>{a ? SKINS[a].label : s.name}</b>
              <span className="truncate text-(--ui-text-tertiary)">{firstLine(s.arg, 80)}</span>
              {s.result === undefined ? <span className="ml-auto size-3 animate-spin rounded-full border-2 border-(--ui-text-tertiary) border-r-transparent" /> : null}
            </div>
            {s.result ? <div className="mt-1 line-clamp-4 font-mono text-[0.7rem] whitespace-pre-wrap text-(--ui-text-tertiary)">{s.result}</div> : null}
          </div>
        )
      })}
      {turn.text ? <Markdown onLink={onLink} text={turn.text} /> : null}
      {turn.error ? <div className="text-(--ui-error,#ff4f5f)">{turn.error}</div> : null}
      {busy && !turn.text && !(turn.steps ?? []).length ? <span className="text-(--ui-text-tertiary)">Thinking…</span> : null}
    </div>
  )
}

export function Transcript({ agent, busy, live, onApply, onFork, onLink, turns }: Props) {
  const all = live ? [...turns, live] : turns
  const skin = agent === 'hermes' ? null : SKINS[agent]

  return (
    <>
      {all.map((t, i) => {
        const isLive = live !== null && i === all.length - 1
        const k = `${t.id}-${i}`

        if (agent === 'hermes') {
          return <HermesTurn busy={isLive && busy} key={k} onLink={onLink} turn={t} />
        }

        if (agent === 'cursor') {
          return <CursorTurn busy={isLive && busy} key={k} onApply={onApply} onFork={onFork} onLink={onLink} turn={t} />
        }

        if (agent === 'opencode') {
          return <OpenCodeTurn busy={isLive && busy} key={k} onApply={onApply} onLink={onLink} skin={skin!} turn={t} />
        }

        if (agent === 'claude') {
          return <ClaudeDesktopTurn busy={isLive && busy} key={k} onApply={onApply} onLink={onLink} skin={skin!} turn={t} />
        }

        return <CodexDesktopTurn busy={isLive && busy} key={k} onApply={onApply} onLink={onLink} skin={skin!} turn={t} />
      })}
      <div className={cn('h-2')} />
    </>
  )
}
