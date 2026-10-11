import { cn, Codicon } from '@hermes/plugin-sdk'
import { type KeyboardEvent, useRef, useState } from 'react'

import { SKINS } from './skins'
import type { AgentId } from './types'

interface Props {
  agent: AgentId | 'hermes'
  busy: boolean
  contextLabel?: string
  mode: string
  onMode?: (m: string) => void
  onSend: (text: string) => void
  onStop: () => void
  placeholder?: string
  repoLabel?: string
  hint?: string
}

const MODES = ['agent', 'plan', 'ask']

export function Composer({ agent, busy, contextLabel, hint, mode, onMode, onSend, onStop, placeholder, repoLabel }: Props) {
  const [text, setText] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const skin = agent === 'hermes' ? null : SKINS[agent]
  const accent = skin?.accent ?? 'var(--theme-primary, #8ba8c7)'

  const submit = () => {
    const v = text.trim()

    if (!v || busy) {
      return
    }

    onSend(v)
    setText('')

    if (ta.current) {
      ta.current.style.height = 'auto'
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape' && busy) {
      onStop()
    }
  }

  const area = (
    <textarea
      className={cn('max-h-44 min-h-6 flex-1 resize-none bg-transparent py-0.5 text-[0.88rem] leading-6 outline-none placeholder:text-(--ui-text-tertiary)', skin?.mono && 'font-mono text-[0.82rem]')}
      onChange={e => {
        setText(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = `${Math.min(176, e.target.scrollHeight)}px`
      }}
      onKeyDown={onKey}
      placeholder={placeholder ?? skin?.placeholder ?? 'Ask Hermes to coordinate your coding agents…'}
      ref={ta}
      rows={1}
      value={text}
    />
  )

  const send = (
    <button
      className="grid size-7 shrink-0 place-items-center rounded-full text-(--ui-bg-primary,#151515) transition-opacity hover:opacity-90"
      onClick={busy ? onStop : submit}
      style={{ background: agent === 'cursor' || agent === 'hermes' ? '#f2f2f2' : accent }}
      title={busy ? 'Stop (Esc)' : 'Send (Enter)'}
      type="button"
    >
      <Codicon name={busy ? 'debug-stop' : 'arrow-up'} size="0.85rem" />
    </button>
  )

  const modeBtn = onMode ? (
    <button className="rounded px-1.5 py-0.5 text-[0.75rem] text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground" onClick={() => onMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length])} title="Cycle mode" type="button">
      {mode === 'agent' ? (agent === 'claude' ? '⏵⏵ auto-edit' : '∞ Agent') : mode === 'plan' ? (agent === 'claude' ? '⏸ plan mode' : 'Plan') : 'Ask'}
    </button>
  ) : null

  if (agent === 'cursor' || agent === 'hermes') {
    return (
      <div>
        <div className="flex flex-col gap-1 rounded-[22px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) px-3 py-2 focus-within:border-(--ui-stroke-secondary)">
          <div className="flex items-center gap-2">
            {area}
            {send}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[0.75rem] text-(--ui-text-tertiary)">{modeBtn}{contextLabel ? <span className="truncate">{contextLabel}</span> : null}</div>
            <span className="truncate text-[0.72rem] text-(--ui-text-tertiary)">{repoLabel}</span>
          </div>
        </div>
        {hint ? <div className="px-3 pt-1 text-[0.68rem] text-(--ui-text-tertiary)">{hint}</div> : null}
      </div>
    )
  }

  if (agent === 'opencode') {
    return (
      <div>
        <div className="flex items-start gap-2 rounded-sm border-l-2 bg-(--ui-bg-quaternary) px-3 py-2" style={{ borderColor: accent }}>
          {area}
          {send}
        </div>
        <div className="flex items-center justify-between px-3 pt-1 text-[0.7rem] text-(--ui-text-tertiary)">
          <span>
            <span style={{ color: accent }}>{mode === 'plan' ? 'Plan' : 'Build'}</span> · {repoLabel}
          </span>
          <span>{skin?.footerHint}</span>
        </div>
      </div>
    )
  }

  // Claude Code + Codex: bordered prompt box with a glyph, footer hint line
  const glyph = skin?.glyph.user
  const claude = agent === 'claude'

  return (
    <div>
      <div className={cn('flex items-start gap-2 px-3 py-2', claude ? 'rounded-lg border' : 'rounded-md bg-(--ui-bg-quaternary)')} style={claude ? { borderColor: mode === 'plan' ? '#339999' : 'var(--ui-stroke-secondary, #999)' } : undefined}>
        <span className="mt-px font-mono text-[0.85rem]" style={{ color: accent }}>
          {glyph}
        </span>
        {area}
        {send}
      </div>
      <div className="flex items-center justify-between px-3 pt-1 font-mono text-[0.68rem] text-(--ui-text-tertiary)">
        <span>{modeBtn ?? null} {claude ? skin?.footerHint : null}</span>
        <span>{claude ? repoLabel : skin?.footerHint}</span>
      </div>
    </div>
  )
}
