import { atom, computed, host } from '@hermes/plugin-sdk'

import { ideApi } from './api'
import type { AgentId, ChatLight, IdeState, PanelKind } from './types'

export interface Panel {
  id: string
  kind: PanelKind
}

type Storage = { get: <T>(k: string, f: T) => T; set: (k: string, v: unknown) => void }
let storage: null | Storage = null

const DEFAULT_PANELS: Panel[] = [{ id: 'p-cursor', kind: 'cursor' }]

export const $ide = atom<IdeState | null>(null)
export const $ideError = atom<null | string>(null)
export const $panels = atom<Panel[]>(DEFAULT_PANELS)
export const $activePanel = atom<string>('p-cursor')
export const $hermesOpen = atom<boolean>(true)
export const $layout = atom<'split' | 'tabs'>('tabs')
export const $repo = atom<null | string>(null)
/** chat id per panel id (which conversation each agent panel shows) */
export const $panelChat = atom<Record<string, string>>({})
/** UI actions requested by the Hermes chat (open a panel, focus a repo…) */
export const $uiAction = atom<{ agent?: string; nonce: number; type: string } | null>(null)

export const $chats = computed($ide, s => s?.chats ?? [])
export const $repos = computed($ide, s => s?.repos ?? [])

const scope = () => host.state.connectionId.get() ?? 'local'
const key = (k: string) => `${scope()}:${k}`

export function bindStore(s: Storage): () => void {
  storage = s

  const load = () => {
    $panels.set(s.get<Panel[]>(key('panels'), DEFAULT_PANELS))
    $activePanel.set(s.get(key('active'), 'p-cursor'))
    $hermesOpen.set(s.get(key('hermes'), true))
    $layout.set(s.get(key('layout'), 'tabs'))
    $repo.set(s.get(key('repo'), null))
    $panelChat.set(s.get(key('chats'), {}))
    void refresh()
  }

  load()

  const offs = [
    host.state.connectionId.listen(() => load()),
    $panels.listen(v => s.set(key('panels'), v)),
    $activePanel.listen(v => s.set(key('active'), v)),
    $hermesOpen.listen(v => s.set(key('hermes'), v)),
    $layout.listen(v => s.set(key('layout'), v)),
    $repo.listen(v => s.set(key('repo'), v)),
    $panelChat.listen(v => s.set(key('chats'), v))
  ]

  return () => {
    offs.forEach(o => o())
    storage = null
  }
}

export async function refresh(): Promise<void> {
  try {
    const st = await ideApi.state()
    $ide.set(st)
    $ideError.set(null)

    if (!$repo.get() || !st.repos.some(r => r.path === $repo.get())) {
      $repo.set(st.repos[0]?.path ?? null)
    }
  } catch (e) {
    $ide.set(null)
    $ideError.set(e instanceof Error ? e.message : String(e))
  }
}

export function openPanel(kind: PanelKind): void {
  const existing = $panels.get().find(p => p.kind === kind)

  if (existing) {
    $activePanel.set(existing.id)

    return
  }

  const p = { id: `p-${kind}-${Math.random().toString(36).slice(2, 6)}`, kind }
  $panels.set([...$panels.get(), p])
  $activePanel.set(p.id)
}

export function closePanel(id: string): void {
  const next = $panels.get().filter(p => p.id !== id)
  $panels.set(next)

  if ($activePanel.get() === id) {
    $activePanel.set(next[next.length - 1]?.id ?? '')
  }
}

export function chatsFor(agent: AgentId | 'hermes', repo: null | string): ChatLight[] {
  return ($ide.get()?.chats ?? []).filter(c => c.agent === agent && (!repo || c.repo === repo)).sort((a, b) => b.updated - a.updated)
}

export const isStorageBound = () => storage !== null
