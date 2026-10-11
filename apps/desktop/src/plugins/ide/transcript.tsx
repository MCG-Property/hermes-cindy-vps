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

function CursorTurn({ busy, onApply, onLink, turn }: { busy: boolean; onApply?: (c: string) => void; onLink?: (u: string) => void; turn: Turn }) {
  const [open, setOpen] = useState(false)
  const steps = turn.steps ?? []

  if (turn.role === 'user') {
    return <div className="my-4 whitespace-pre-wrap rounded-2xl bg-(--ui-bg-quaternary) px-4 py-3 text-[0.9rem] leading-relaxed select-text">{turn.text}</div>
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
        <div className="mt-1 flex items-center gap-1 text-(--ui-text-tertiary)">
          <CopyButton className="size-6" text={turn.text} />
          <span className="ml-1 text-[0.8rem]">{ago(turn.ts)} ago</span>
        </div>
      ) : null}
    </div>
  )
}

// ---------- TUI skins (Claude Code, Codex): glyph-led monospace transcript ----------

function TuiTurn({ busy, onApply, onLink, skin, turn }: { busy: boolean; onApply?: (c: string) => void; onLink?: (u: string) => void; skin: Skin; turn: Turn }) {
  const g = skin.glyph

  if (turn.role === 'user') {
    return (
      <div className="my-3 flex gap-2 rounded-md bg-(--ui-bg-quaternary)/60 px-2.5 py-1.5 font-mono text-[0.82rem]">
        <span style={{ color: skin.accent }}>{g.user}</span>
        <span className="whitespace-pre-wrap select-text">{turn.text}</span>
      </div>
    )
  }

  return (
    <div className="my-2 font-mono text-[0.82rem] leading-relaxed">
      {turn.thinking ? (
        <div className="mb-1 flex gap-2 text-(--ui-text-tertiary) italic">
          <span style={{ color: skin.accent }}>{g.thinking}</span>
          <span>{busy ? 'Thinking…' : 'Thought'} </span>
        </div>
      ) : null}
      {(turn.steps ?? []).map(s => (
        <div className="my-1" key={s.id}>
          <div className="flex gap-2">
            <span style={{ color: s.result === undefined ? skin.accent : s.ok === false ? skin.err : skin.ok }}>{g.assistant}</span>
            <span>
              <b style={{ color: skin.accentSoft }}>{skin.label === 'Codex' ? (s.kind === 'shell' ? 'Ran' : verb(s)) : `${s.name}(`}</b>
              <span className="text-(--ui-text-secondary)">{skin.label === 'Codex' ? ' ' : ''}{firstLine(s.arg, 90)}</span>
              {skin.label === 'Codex' ? null : <b style={{ color: skin.accentSoft }}>)</b>}
            </span>
          </div>
          {s.result !== undefined ? (
            <div className="ml-1 flex gap-2 text-(--ui-text-tertiary)">
              <span>{g.result}</span>
              <span className="whitespace-pre-wrap">{firstLine(s.result, 160) || (s.ok === false ? 'failed' : 'done')}</span>
            </div>
          ) : null}
        </div>
      ))}
      {turn.text ? (
        <div className="flex gap-2">
          <span className="mt-[0.15rem]" style={{ color: skin.label === 'Codex' ? skin.accent : 'var(--ui-text-primary)' }}>{g.assistant}</span>
          <Body onApply={onApply} onLink={onLink} text={turn.text} />
        </div>
      ) : null}
      {turn.error ? <div className="flex gap-2" style={{ color: skin.err }}><span>{g.assistant}</span>{turn.error}</div> : null}
      {busy ? (
        <div className="mt-1 flex items-center gap-2" style={{ color: skin.accent }}>
          <span className="animate-pulse">{skin.label === 'Codex' ? '•' : '✻'}</span>
          <span>{skin.label === 'Codex' ? 'Working' : 'Thinking…'}</span>
          <span className="text-(--ui-text-tertiary)">(esc to interrupt)</span>
        </div>
      ) : null}
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

export function Transcript({ agent, busy, live, onApply, onLink, turns }: Props) {
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
          return <CursorTurn busy={isLive && busy} key={k} onApply={onApply} onLink={onLink} turn={t} />
        }

        if (agent === 'opencode') {
          return <OpenCodeTurn busy={isLive && busy} key={k} onApply={onApply} onLink={onLink} skin={skin!} turn={t} />
        }

        return <TuiTurn busy={isLive && busy} key={k} onApply={onApply} onLink={onLink} skin={skin!} turn={t} />
      })}
      <div className={cn('h-2')} />
    </>
  )
}
