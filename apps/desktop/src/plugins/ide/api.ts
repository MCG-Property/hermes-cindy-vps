/**
 * IDE data layer. Everything goes through `ctx.rest` — the plugin's own `/api/plugins/ide/*` router
 * (`plugins/ide/dashboard/plugin_api.py`) on whichever Hermes box the desktop is connected to, so the
 * same UI drives the local machine and every SSH-remote box.
 */

import type { PluginRestOptions } from '@hermes/plugin-sdk'

import type { AgentId, ChatFull, ChatLight, FsEntry, GitChange, IdeState, Repo, RunEvent } from './types'

type Rest = <T>(path: string, opts?: PluginRestOptions) => Promise<T>

let rest: null | Rest = null

export function bindApi(r: Rest): () => void {
  rest = r

  return () => {
    rest = null
  }
}

function call<T>(path: string, opts?: PluginRestOptions): Promise<T> {
  if (!rest) {
    return Promise.reject(new Error('IDE plugin is not bound'))
  }

  return rest<T>(path, opts)
}

const q = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')

const post = <T>(path: string, body?: unknown) => call<T>(path, { body: body ?? {}, method: 'POST' })

export const ideApi = {
  addRepo: (path: string) => post<Repo>('/repos', { path }),
  browse: (path = '') => call<{ dirs: { name: string; path: string }[]; isGit: boolean; parent: string; path: string }>(`/browse?${q({ path })}`),
  chat: (id: string) => call<ChatFull>(`/chats/${id}`),
  deleteChat: (id: string) => call<{ ok: boolean }>(`/chats/${id}`, { method: 'DELETE' }),
  fsFind: (root: string, query: string) => call<string[]>(`/fs/find?${q({ q: query, root })}`),
  fsRead: (path: string) => call<{ big?: boolean; binary?: boolean; text?: string }>(`/fs/read?${q({ path })}`),
  fsTree: (path: string) => call<FsEntry[]>(`/fs/tree?${q({ path })}`),
  fsWrite: (path: string, text: string) => call<{ ok: boolean }>('/fs/write', { body: { path, text }, method: 'PUT' }),
  gitChanges: (repo: string) => call<GitChange[]>(`/git/changes?${q({ repo })}`),
  gitDiff: (repo: string, file: string) => call<{ diff: string }>(`/git/diff?${q({ file, repo })}`),
  newChat: (agent: AgentId, repo: null | string) => post<ChatLight>('/chats', { agent, repo }),
  orchChat: (repo: string) => call<{ id: string; run: null | string; ui: ChatFull['ui'] }>(`/orchestrator/chat?${q({ repo })}`),
  orchSend: (body: { context?: Record<string, unknown>; panels: string[]; repo: null | string; text: string }) =>
    post<{ chat: string; run: string }>('/orchestrator/send', body),
  patchChat: (id: string, patch: Partial<{ agent: string; pinned: boolean; title: string }>) =>
    call<ChatLight>(`/chats/${id}`, { body: patch, method: 'PATCH' }),
  poll: (run: string, after: number) => call<{ done: boolean; events: RunEvent[]; next: number }>(`/runs/${run}?after=${after}`),
  removeRepo: (path: string) => call<{ ok: boolean }>(`/repos?${q({ path })}`, { method: 'DELETE' }),
  send: (id: string, body: { attachments?: unknown[]; mode?: string; model?: string; text: string }) => post<{ run: string }>(`/chats/${id}/send`, body),
  setSettings: (s: { fullAuto?: boolean }) => post<IdeState['settings']>('/settings', s),
  state: () => call<IdeState>('/state'),
  stop: (run: string) => post<{ ok: boolean }>(`/runs/${run}/stop`),
  termInput: (id: string, data: string) => post<{ ok: boolean }>(`/terminal/${id}/input`, { data }),
  termKill: (id: string) => call<{ ok: boolean }>(`/terminal/${id}`, { method: 'DELETE' }),
  termNew: (cwd: null | string, cols: number, rows: number) => post<{ id: string }>('/terminal', { cols, cwd, rows }),
  termRead: (id: string, after: number) => call<{ alive: boolean; data: string; next: number }>(`/terminal/${id}/read?after=${after}`),
  termResize: (id: string, cols: number, rows: number) => post<{ ok: boolean }>(`/terminal/${id}/resize`, { cols, rows })
}
