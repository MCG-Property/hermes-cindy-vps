export type AgentId = 'claude' | 'codex' | 'cursor' | 'opencode'
export type PanelKind = AgentId | 'files' | 'terminal'
export const AGENT_IDS: AgentId[] = ['cursor', 'claude', 'opencode', 'codex']

export interface AgentStatus {
  id: AgentId
  installed: boolean
  label: string
  path: null | string
}

export interface Repo {
  added: number
  name: string
  path: string
}

export interface ChatLight {
  agent: AgentId | 'hermes'
  created: number
  id: string
  pinned: boolean
  repo: null | string
  running: boolean
  title: string
  unread?: boolean
  updated: number
}

export interface Step {
  agent?: null | string
  arg?: string
  id: string
  kind?: string
  name: string
  ok?: boolean
  result?: string
}

export interface Turn {
  agent?: string
  error?: string
  id: string
  role: 'assistant' | 'user'
  steps?: Step[]
  text?: string
  thinking?: string
  ts: number
  usage?: { cost?: null | number; input?: null | number; output?: null | number }
  worked?: number
  attachments?: string[]
}

export interface ChatFull extends ChatLight {
  ui: Turn[]
}

export interface IdeState {
  agents: AgentStatus[]
  chats: ChatLight[]
  home: string
  platform: string
  repos: Repo[]
  settings: { fullAuto?: boolean }
}

export type RunEvent =
  | { agent?: string; n: number; type: 'done'; worked: number }
  | { action: string; agent?: string; n: number; type: 'ui' }
  | { agent?: string; id: string; kind?: string; n: number; name: string; arg?: string; type: 'tool' }
  | { agent?: string; id: string; n: number; ok?: boolean; result?: string; type: 'tool_result' }
  | { agent?: string; message: string; n: number; type: 'error' }
  | { agent?: string; n: number; text: string; type: 'text' | 'thinking' }
  | { cost?: null | number; input?: null | number; n: number; output?: null | number; type: 'usage' }
  | { id?: string; n: number; type: 'session' }

export interface FsEntry {
  dir: boolean
  name: string
  path: string
}

export interface GitChange {
  add?: number
  del?: number
  file: string
  status: string
}

export const AGENT_LABEL: Record<AgentId | 'hermes', string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  hermes: 'Hermes',
  opencode: 'OpenCode'
}
