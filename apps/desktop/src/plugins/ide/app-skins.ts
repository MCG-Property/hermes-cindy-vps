import type { AgentId } from './types'

export type PaneKind = 'browser' | 'changes' | 'files' | 'terminal'

export interface AppSkin {
  id: AgentId
  accent: string
  /** sidebar: group chats under repos (Cursor), by date (Claude), or under projects (Codex, OpenCode) */
  group: 'date' | 'projects' | 'repos'
  empty: string
  newLabel: string
  searchPlaceholder: string
  /** extra nav rows under New/Search (Cursor: Automations, Customize) */
  nav: { icon: string; id: 'automations' | 'customize'; label: string }[]
  sectionLabel: string
  composer: {
    chips: ('design' | 'terminal')[]
    effort?: string[]
    followUp: string
    initial: string
    modes: { id: string; label: string }[]
    /** the small environment label under the composer */
    env: 'connection' | 'local'
  }
  pane: PaneKind[]
  paneLabels: Record<PaneKind, string>
  /** assistant text font */
  serif: boolean
  title: string
  user: 'bar' | 'pill' | 'plain'
}

export const APP_SKINS: Record<AgentId, AppSkin> = {
  claude: {
    id: 'claude',
    accent: '#d97757',
    composer: {
      chips: [],
      env: 'local',
      followUp: 'Reply to Claude…',
      initial: 'How can I help you today?',
      modes: [
        { id: 'ask', label: 'Ask permissions' },
        { id: 'agent', label: 'Auto accept edits' },
        { id: 'plan', label: 'Plan mode' },
        { id: 'bypass', label: 'Bypass permissions' }
      ]
    },
    empty: 'No sessions yet',
    group: 'date',
    nav: [],
    newLabel: 'New session',
    pane: ['changes', 'browser', 'terminal', 'files'],
    paneLabels: { browser: 'Preview', changes: 'Diff', files: 'Files', terminal: 'Terminal' },
    searchPlaceholder: 'Search sessions',
    sectionLabel: 'Recents',
    serif: true,
    title: 'Claude Code',
    user: 'plain'
  },
  codex: {
    id: 'codex',
    accent: '#10a37f',
    composer: {
      chips: [],
      effort: ['Low', 'Medium', 'High'],
      env: 'local',
      followUp: 'Ask for follow-up changes',
      initial: 'Ask Codex anything',
      modes: [
        { id: 'agent', label: 'Auto' },
        { id: 'plan', label: 'Read-only' },
        { id: 'bypass', label: 'Full access' }
      ]
    },
    empty: 'No threads yet',
    group: 'projects',
    nav: [
      { icon: 'robot', id: 'automations', label: 'Automations' },
      { icon: 'extensions', id: 'customize', label: 'Skills' }
    ],
    newLabel: 'New thread',
    pane: ['changes', 'terminal', 'files', 'browser'],
    paneLabels: { browser: 'Browser', changes: 'Review', files: 'Files', terminal: 'Terminal' },
    searchPlaceholder: 'Search threads',
    sectionLabel: 'Threads',
    serif: false,
    title: 'Codex',
    user: 'pill'
  },
  cursor: {
    id: 'cursor',
    accent: '#8ba8c7',
    composer: {
      chips: ['terminal', 'design'],
      env: 'connection',
      followUp: 'Send follow-up',
      initial: 'Plan, search, build anything',
      modes: [
        { id: 'agent', label: 'Agent' },
        { id: 'plan', label: 'Plan' },
        { id: 'ask', label: 'Ask' }
      ]
    },
    empty: 'No agents yet',
    group: 'repos',
    nav: [
      { icon: 'robot', id: 'automations', label: 'Automations' },
      { icon: 'extensions', id: 'customize', label: 'Customize' }
    ],
    newLabel: 'New Chat',
    pane: ['changes', 'browser', 'terminal', 'files'],
    paneLabels: { browser: 'Browser', changes: 'Changes', files: 'Files', terminal: 'Terminal' },
    searchPlaceholder: 'Search',
    sectionLabel: 'Repositories',
    serif: false,
    title: 'Cursor',
    user: 'pill'
  },
  opencode: {
    id: 'opencode',
    accent: '#fab283',
    composer: {
      chips: [],
      env: 'local',
      followUp: 'Ask anything…',
      initial: 'Ask anything… "Fix a TODO in the codebase"',
      modes: [
        { id: 'agent', label: 'Build' },
        { id: 'plan', label: 'Plan' }
      ]
    },
    empty: 'No sessions yet',
    group: 'projects',
    nav: [],
    newLabel: 'New session',
    pane: ['files', 'changes', 'terminal', 'browser'],
    paneLabels: { browser: 'Preview', changes: 'Review', files: 'Files', terminal: 'Terminal' },
    searchPlaceholder: 'Search sessions',
    sectionLabel: 'Projects',
    serif: false,
    title: 'opencode',
    user: 'bar'
  }
}
