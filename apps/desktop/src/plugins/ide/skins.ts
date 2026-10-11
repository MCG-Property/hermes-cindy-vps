import type { AgentId } from './types'

/**
 * Per-agent look, measured from the real products installed on this machine (REA analysis, see research/README.md):
 *  - Claude Code TUI theme table (claude rgb(215,119,87), permission rgb(87,105,247), planMode, promptBorder…), glyphs ⏺ ⎿ ✻
 *  - OpenCode desktop app default theme (neutral #0a0a0a, primary #fab283, accent #9d7cd8, success #7fd88f, error #e06c75…)
 *  - Codex TUI conventions (“>_ OpenAI Codex” banner, › prompt, • items, └ output)
 *  - Cursor Agents window (neutral surfaces, #8ba8c7 links, rounded bubbles + composer pill)
 * Surfaces stay on Hermes tokens so every panel reads as native; accent, typography, glyphs and layout come from the agent.
 */
export interface Skin {
  accent: string
  accentSoft: string
  ok: string
  err: string
  /** transcript typography */
  mono: boolean
  label: string
  tagline: string
  placeholder: string
  footerHint: string
  /** assistant / user / result glyphs for the TUI-style skins */
  glyph: { assistant: string; user: string; result: string; thinking: string }
}

export const SKINS: Record<AgentId, Skin> = {
  claude: {
    accent: '#d77757',
    accentSoft: '#f59575',
    err: '#ff6b80',
    footerHint: '? for shortcuts',
    glyph: { assistant: '⏺', result: '⎿', thinking: '✻', user: '>' },
    label: 'Claude Code',
    mono: true,
    ok: '#4eba65',
    placeholder: 'Try “fix lint errors”',
    tagline: 'Claude Code'
  },
  codex: {
    accent: '#56b6c2',
    accentSoft: '#7fd0da',
    err: '#e06c75',
    footerHint: '⏎ send   ⇧⏎ newline   100% context left',
    glyph: { assistant: '•', result: '└', thinking: '•', user: '›' },
    label: 'Codex',
    mono: true,
    ok: '#7fd88f',
    placeholder: 'Ask Codex to do anything',
    tagline: '>_ OpenAI Codex'
  },
  cursor: {
    accent: '#8ba8c7',
    accentSoft: '#a6bdd6',
    err: '#ff4f5f',
    footerHint: '',
    glyph: { assistant: '', result: '', thinking: '', user: '' },
    label: 'Cursor',
    mono: false,
    ok: '#6dc27a',
    placeholder: 'Plan, search, build anything',
    tagline: 'Cursor'
  },
  opencode: {
    accent: '#fab283',
    accentSoft: '#fcc6a3',
    err: '#e06c75',
    footerHint: 'tab agents   ctrl+p commands',
    glyph: { assistant: '', result: '→', thinking: '◇', user: '' },
    label: 'OpenCode',
    mono: false,
    ok: '#7fd88f',
    placeholder: 'Ask anything…  “Fix a TODO in the codebase”',
    tagline: 'opencode'
  }
}

export const KIND_VERB: Record<string, string> = {
  agent: 'Task',
  edit: 'Edit',
  other: 'Tool',
  read: 'Read',
  search: 'Search',
  shell: 'Run',
  todo: 'Todo',
  web: 'Web'
}
