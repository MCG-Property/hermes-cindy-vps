import { cn, Codicon, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, host, useValue } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AddRepoDialog, useWidth } from './agent-panel'
import { ideApi } from './api'
import { type Attachment, CursorComposer } from './cursor-composer'
import { ago, repoName } from './fold'
import { Splitter, useSize } from './splitter'
import { $chats, $ide, $panelChat, $repo, $repos, $views, refresh } from './store'
import { AgentTerminal } from './terminal'
import { Transcript } from './transcript'
import type { AgentId, Automation, ChatLight } from './types'
import { useSession } from './use-session'
import { BrowserTab, ChangesTab, FilesTab } from './work-pane'

type Page = 'automations' | 'chat' | 'customize'
type PaneKind = 'browser' | 'changes' | 'files' | 'terminal'
interface PaneTab {
  id: string
  kind: PaneKind
  termId?: string
  title: string
  url?: string
}

const uid = () => Math.random().toString(36).slice(2, 8)
const PANE_ICON: Record<PaneKind, string> = { browser: 'globe', changes: 'git-compare', files: 'file', terminal: 'terminal' }

function connectionLabel(): string {
  const c = host.state.connectionId.get()

  return !c || c === 'local' ? 'This Mac' : String(c)
}

function SidebarRow({ active, children, icon, onClick, right }: { active?: boolean; children: React.ReactNode; icon?: string; onClick?: () => void; right?: React.ReactNode }) {
  return (
    <div
      className={cn('group flex h-7 cursor-default items-center gap-2.5 rounded-lg px-2 text-[0.84rem] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground', active && 'bg-(--ui-bg-quaternary) text-foreground')}
      onClick={onClick}
    >
      {icon ? <Codicon name={icon} size="0.9rem" /> : null}
      {children}
      {right}
    </div>
  )
}

function Sidebar({
  activeChat,
  onAddRepo,
  onAutomations,
  onCustomize,
  onNew,
  onOpen,
  page
}: {
  activeChat: null | string
  onAddRepo: () => void
  onAutomations: () => void
  onCustomize: () => void
  onNew: (repo?: string) => void
  onOpen: (c: ChatLight) => void
  page: Page
}) {
  const ide = useValue($ide)
  const chats = useValue($chats)
  const repos = useValue($repos)
  const repo = useValue($repo)
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [project, setProject] = useState<null | string>(null)
  const [newProject, setNewProject] = useState(false)
  const [pname, setPname] = useState('')
  const [pRepos, setPRepos] = useState<string[]>([])
  const mine = chats.filter(c => c.agent === 'cursor' && (!q || c.title.toLowerCase().includes(q.toLowerCase())))
  const pinned = mine.filter(c => c.pinned)
  const projects = ide?.projects ?? []
  const shownRepos = project ? repos.filter(r => projects.find(p => p.id === project)?.repos.includes(r.path)) : repos

  const row = (c: ChatLight) => (
    <SidebarRow
      active={activeChat === c.id && page === 'chat'}
      key={c.id}
      onClick={() => onOpen(c)}
      right={
        <>
          <span className="ml-auto text-[0.72rem] text-(--ui-text-tertiary) group-hover:hidden">{ago(c.updated)}</span>
          <span className="ml-auto hidden items-center gap-1 text-(--ui-text-tertiary) group-hover:flex">
            <button className="hover:text-foreground" onClick={e => { e.stopPropagation(); void ideApi.patchChat(c.id, { pinned: !c.pinned }).then(() => refresh()) }} title={c.pinned ? 'Unpin' : 'Pin'} type="button">
              <Codicon name={c.pinned ? 'pinned' : 'pin'} size="0.75rem" />
            </button>
            <button className="hover:text-red-400" onClick={e => { e.stopPropagation(); void ideApi.deleteChat(c.id).then(() => refresh()) }} title="Delete" type="button">
              <Codicon name="trash" size="0.75rem" />
            </button>
          </span>
        </>
      }
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.running ? '#e6b450' : c.unread ? '#4aa3ff' : 'var(--ui-text-tertiary)' }} />
      <span className="truncate">{c.title}</span>
    </SidebarRow>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-px p-2">
        <SidebarRow icon="filter" onClick={() => onNew()}>
          New Chat
        </SidebarRow>
        {searching ? (
          <div className="flex h-7 items-center gap-2.5 rounded-lg bg-(--ui-bg-quaternary) px-2">
            <Codicon name="search" size="0.9rem" />
            <input autoFocus className="min-w-0 flex-1 bg-transparent text-[0.84rem] outline-none" onBlur={() => !q && setSearching(false)} onChange={e => setQ(e.target.value)} placeholder="Search chats" value={q} />
          </div>
        ) : (
          <SidebarRow icon="search" onClick={() => setSearching(true)}>
            Search
          </SidebarRow>
        )}
        <SidebarRow active={page === 'automations'} icon="robot" onClick={onAutomations}>
          Automations
        </SidebarRow>
        <SidebarRow active={page === 'customize'} icon="extensions" onClick={onCustomize}>
          Customize
        </SidebarRow>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex items-center justify-between px-2 pt-3 pb-1 text-[0.72rem] text-(--ui-text-tertiary)">
          <span>Projects</span>
          <button className="grid size-5 place-items-center rounded hover:bg-(--chrome-action-hover) hover:text-foreground" onClick={() => setNewProject(v => !v)} title="New project" type="button">
            <Codicon name="add" size="0.8rem" />
          </button>
        </div>
        {newProject ? (
          <div className="mb-2 rounded-lg border border-(--ui-stroke-tertiary) p-2">
            <input autoFocus className="mb-1.5 w-full rounded bg-(--ui-bg-quaternary) px-2 py-1 text-[0.8rem] outline-none" onChange={e => setPname(e.target.value)} placeholder="Project name" value={pname} />
            {repos.map(r => (
              <label className="flex items-center gap-2 py-0.5 text-[0.78rem] text-(--ui-text-secondary)" key={r.path}>
                <input checked={pRepos.includes(r.path)} onChange={e => setPRepos(e.target.checked ? [...pRepos, r.path] : pRepos.filter(x => x !== r.path))} type="checkbox" />
                {r.name}
              </label>
            ))}
            <button
              className="mt-1.5 rounded bg-foreground px-2 py-1 text-[0.76rem] text-background"
              onClick={() => pname.trim() && void ideApi.addProject(pname, pRepos).then(() => { setPname(''); setPRepos([]); setNewProject(false); void refresh() })}
              type="button"
            >
              Create
            </button>
          </div>
        ) : null}
        {projects.map(p => (
          <SidebarRow
            active={project === p.id}
            icon="project"
            key={p.id}
            onClick={() => setProject(project === p.id ? null : p.id)}
            right={
              <>
                <span className="ml-auto text-[0.72rem] text-(--ui-text-tertiary) group-hover:hidden">{ago(p.created)}</span>
                <button className="ml-auto hidden text-(--ui-text-tertiary) group-hover:block hover:text-red-400" onClick={e => { e.stopPropagation(); void ideApi.deleteProject(p.id).then(() => refresh()) }} type="button">
                  <Codicon name="trash" size="0.75rem" />
                </button>
              </>
            }
          >
            <span className="truncate">{p.name}</span>
          </SidebarRow>
        ))}
        {pinned.length ? (
          <>
            <div className="px-2 pt-3 pb-1 text-[0.72rem] text-(--ui-text-tertiary)">Pinned</div>
            {pinned.map(row)}
          </>
        ) : null}
        <div className="flex items-center justify-between px-2 pt-3 pb-1 text-[0.72rem] text-(--ui-text-tertiary)">
          <span>Repositories</span>
          <span className="flex items-center gap-0.5">
            <button className={cn('grid size-5 place-items-center rounded hover:bg-(--chrome-action-hover) hover:text-foreground', project && 'text-sky-300')} onClick={() => setProject(null)} title="Clear project filter" type="button">
              <Codicon name="filter" size="0.8rem" />
            </button>
            <button className="grid size-5 place-items-center rounded hover:bg-(--chrome-action-hover) hover:text-foreground" onClick={onAddRepo} title="Add repository" type="button">
              <Codicon name="new-folder" size="0.8rem" />
            </button>
          </span>
        </div>
        {shownRepos.map(r => {
          const rc = mine.filter(c => c.repo === r.path && !c.pinned).sort((a, b) => b.updated - a.updated)

          return (
            <div key={r.path}>
              <SidebarRow
                active={repo === r.path && false}
                icon={repo === r.path ? 'folder-opened' : 'folder'}
                onClick={() => $repo.set(r.path)}
                right={
                  <button className="ml-auto hidden text-(--ui-text-tertiary) group-hover:block hover:text-foreground" onClick={e => { e.stopPropagation(); onNew(r.path) }} title="New chat here" type="button">
                    <Codicon name="add" size="0.8rem" />
                  </button>
                }
              >
                <span className={cn('truncate', repo === r.path && 'text-foreground')}>{r.name}</span>
              </SidebarRow>
              {rc.length ? rc.map(row) : <div className="py-1 pl-8 text-[0.76rem] text-(--ui-text-tertiary)">No agents yet</div>}
            </div>
          )
        })}
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3">
        <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-slate-600 text-[0.7rem] font-semibold text-slate-900">C</span>
        <span className="flex-1 text-[0.84rem]">Cam</span>
        <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={onCustomize} title="Settings" type="button">
          <Codicon name="settings-gear" size="0.9rem" />
        </button>
      </div>
    </div>
  )
}

function RightPane({ browserUrl, onBrowserUrl, repo, tabs, setTabs, active, setActive }: { active: string; browserUrl: string; onBrowserUrl: (u: string) => void; repo: null | string; setActive: (id: string) => void; setTabs: (t: PaneTab[]) => void; tabs: PaneTab[] }) {
  const add = (kind: PaneKind, extra: Partial<PaneTab> = {}) => {
    const t: PaneTab = { id: uid(), kind, title: kind === 'terminal' ? 'zsh' : kind[0].toUpperCase() + kind.slice(1), ...extra }
    setTabs([...tabs, t])
    setActive(t.id)
  }

  const close = (id: string) => {
    const t = tabs.find(x => x.id === id)

    if (t?.termId) {
      void ideApi.termKill(t.termId).catch(() => undefined)
    }

    const next = tabs.filter(x => x.id !== id)
    setTabs(next)

    if (active === id) {
      setActive(next[next.length - 1]?.id ?? '')
    }
  }

  const cur = tabs.find(t => t.id === active)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col border-l border-(--ui-stroke-tertiary)">
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map(t => (
            <div className={cn('group flex h-7 shrink-0 items-center gap-1.5 rounded-lg pr-1 pl-2.5 text-[0.8rem] text-(--ui-text-secondary) hover:text-foreground', active === t.id && 'bg-(--ui-bg-quaternary) text-foreground')} key={t.id}>
              <button className="flex items-center gap-1.5" onClick={() => setActive(t.id)} type="button">
                <Codicon name={PANE_ICON[t.kind]} size="0.85rem" />
                {t.kind === 'browser' && t.url ? t.url.replace(/^https?:\/\//, '').slice(0, 18) : t.title}
              </button>
              <button className="grid size-4 place-items-center rounded opacity-0 group-hover:opacity-100 hover:bg-(--chrome-action-hover)" onClick={() => close(t.id)} type="button">
                <Codicon name="close" size="0.65rem" />
              </button>
            </div>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid size-7 shrink-0 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" title="Open tab" type="button">
                <Codicon name="add" size="0.9rem" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(['changes', 'browser', 'terminal', 'files'] as const).map(k => (
                <DropdownMenuItem key={k} onSelect={() => add(k)}>
                  <Codicon name={PANE_ICON[k]} size="0.85rem" />
                  <span className="ml-2 capitalize">{k}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {!tabs.length || !cur ? (
          <div className="p-7 text-[0.86rem]">
            {tabs.some(t => t.kind === 'browser') ? (
              <>
                <div className="mb-2 text-[0.8rem] text-(--ui-text-tertiary)">Open Tabs</div>
                {tabs.filter(t => t.kind === 'browser').map(t => (
                  <button className="flex h-8 w-full items-center gap-2.5 rounded-lg px-1 text-left hover:bg-(--chrome-action-hover)" key={t.id} onClick={() => setActive(t.id)} type="button">
                    <Codicon name="globe" size="0.9rem" />
                    {t.url ?? t.title}
                  </button>
                ))}
              </>
            ) : null}
            <div className="mt-5 mb-2 text-[0.8rem] text-(--ui-text-tertiary)">On {repoName(repo) || 'this chat'}</div>
            {(['changes', 'browser', 'terminal', 'files'] as const).map(k => (
              <button className="flex h-8 w-full items-center gap-2.5 rounded-lg px-1 text-left hover:bg-(--chrome-action-hover)" key={k} onClick={() => add(k)} type="button">
                <Codicon name={PANE_ICON[k]} size="0.9rem" />
                <span className="capitalize">{k}</span>
              </button>
            ))}
          </div>
        ) : null}
        {tabs.map(t => (
          <div className={cn('absolute inset-0', active !== t.id && 'hidden')} key={t.id}>
            {!repo ? (
              <div className="grid h-full place-items-center text-(--ui-text-tertiary)">Select a repository first.</div>
            ) : t.kind === 'files' ? (
              <FilesTab repo={repo} />
            ) : t.kind === 'changes' ? (
              active === t.id ? <ChangesTab repo={repo} /> : null
            ) : t.kind === 'browser' ? (
              <BrowserTab onUrl={u => { setTabs(tabs.map(x => (x.id === t.id ? { ...x, url: u } : x))); onBrowserUrl(u) }} url={t.url ?? browserUrl} />
            ) : (
              <AgentTerminal cwd={repo} kind="shell" onReady={i => setTabs(tabs.map(x => (x.id === t.id ? { ...x, termId: i.id } : x)))} termId={t.termId} visible={active === t.id} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AutomationsPage({ automations, repos }: { automations: Automation[]; repos: { name: string; path: string }[] }) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [repo, setRepo] = useState(repos[0]?.path ?? '')
  const [agent, setAgent] = useState<AgentId>('cursor')
  const [every, setEvery] = useState('60')
  const [msg, setMsg] = useState('')

  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-7">
      <h2 className="mb-1 text-[1.25rem] font-semibold">Automations</h2>
      <p className="mb-4 text-(--ui-text-secondary)">Run a prompt in a repository on a schedule. They run on this machine's Hermes backend, even when the window is closed.</p>
      {automations.map(a => (
        <div className="my-2.5 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) p-3" key={a.id}>
          <div className="font-medium">{a.name}</div>
          <div className="mt-1 text-[0.78rem] text-(--ui-text-tertiary)">
            {a.agent} · every {a.everyMin} min · {repoName(a.repo)} · {a.last ? `last run ${ago(a.last)} ago` : 'not run yet'}
          </div>
          <div className="mt-1 line-clamp-2 text-[0.82rem] text-(--ui-text-secondary)">{a.prompt}</div>
          <div className="mt-2 flex gap-2">
            <button className="rounded-lg bg-white/10 px-2.5 py-1 text-[0.78rem] hover:bg-white/15" onClick={() => void ideApi.runAutomation(a.id).then(r => { setMsg(r.error ?? 'Started'); void refresh() })} type="button">
              Run now
            </button>
            <button className="rounded-lg bg-white/10 px-2.5 py-1 text-[0.78rem] hover:bg-white/15" onClick={() => void ideApi.deleteAutomation(a.id).then(() => refresh())} type="button">
              Delete
            </button>
          </div>
        </div>
      ))}
      <div className="mt-4 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) p-3">
        <div className="mb-2 font-medium">New automation</div>
        <input className="mb-2 w-full rounded-lg bg-black/20 px-2.5 py-1.5 outline-none" onChange={e => setName(e.target.value)} placeholder="Name" value={name} />
        <textarea className="mb-2 min-h-20 w-full resize-y rounded-lg bg-black/20 px-2.5 py-1.5 outline-none" onChange={e => setPrompt(e.target.value)} placeholder="Prompt" value={prompt} />
        <div className="mb-2 flex gap-2">
          <select className="min-w-0 flex-1 rounded-lg bg-black/20 px-2 py-1.5 outline-none" onChange={e => setRepo(e.target.value)} value={repo}>
            {repos.map(r => <option key={r.path} value={r.path}>{r.name}</option>)}
          </select>
          <select className="rounded-lg bg-black/20 px-2 py-1.5 outline-none" onChange={e => setAgent(e.target.value as AgentId)} value={agent}>
            {(['cursor', 'claude', 'opencode', 'codex'] as const).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="w-20 rounded-lg bg-black/20 px-2 py-1.5 outline-none" onChange={e => setEvery(e.target.value)} value={every} />
        </div>
        <button
          className="rounded-lg bg-foreground px-3 py-1.5 text-[0.82rem] text-background"
          onClick={() => prompt.trim() && void ideApi.addAutomation({ agent, everyMin: Math.max(1, parseInt(every, 10) || 60), name: name || 'Automation', prompt, repo: repo || null }).then(() => { setName(''); setPrompt(''); void refresh() })}
          type="button"
        >
          Create
        </button>
        {msg ? <span className="ml-3 text-(--ui-text-tertiary)">{msg}</span> : null}
      </div>
    </div>
  )
}

function CustomizePage() {
  const ide = useValue($ide)
  const [full, setFull] = useState(!!ide?.settings.fullAuto)
  const agents = ide?.agents ?? []

  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-7">
      <h2 className="mb-4 text-[1.25rem] font-semibold">Customize</h2>
      <div className="rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) p-3">
        <div className="font-medium">Agent permissions</div>
        <label className="mt-2 flex items-center gap-2 text-(--ui-text-secondary)">
          <input checked={full} onChange={e => { setFull(e.target.checked); void ideApi.setSettings({ fullAuto: e.target.checked }) }} type="checkbox" />
          Run agents without asking (full auto) — applies to the Chat UI and Hermes chat
        </label>
      </div>
      <div className="mt-3 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) p-3">
        <div className="mb-1 font-medium">Installed agents on {connectionLabel()}</div>
        {agents.map(a => (
          <div className="flex items-center gap-2 py-0.5 text-[0.84rem]" key={a.id}>
            <span className={cn('size-2 rounded-full', a.installed ? 'bg-emerald-400' : 'bg-red-400')} />
            {a.label}
            <span className="truncate text-(--ui-text-tertiary)">{a.path ?? 'not installed'}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) p-3 text-(--ui-text-secondary)">
        <div className="mb-1 font-medium text-foreground">Rules</div>
        Add <code>.clonerules</code>, <code>.cursorrules</code>, <code>AGENTS.md</code> or <code>.cursor/rules/*.mdc</code> to a repository and the agents follow them.
      </div>
    </div>
  )
}

export function CursorApp({ id, visible }: { id: string; visible: boolean }) {
  const ide = useValue($ide)
  const repo = useValue($repo)
  const chats = useValue($chats)
  const panelChat = useValue($panelChat)
  const chatId = panelChat[id] || null
  const [page, setPage] = useState<Page>('chat')
  const [sideOpen, setSideOpen] = useState(true)
  const [paneOpen, setPaneOpen] = useState(false)
  const [tabs, setTabs] = useState<PaneTab[]>([])
  const [active, setActive] = useState('')
  const [browserUrl, setBrowserUrl] = useState('')
  const [addRepo, setAddRepo] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [mode, setMode] = useState('agent')
  const [design, setDesign] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState(ide?.settings.cursorModel ?? '')
  const [hist, setHist] = useState<string[]>([])
  const [hi, setHi] = useState(-1)
  const [sideW, setSideW] = useSize(`${id}.cursor.side`, 232, 170, 420)
  const [paneW, setPaneW] = useSize(`${id}.cursor.pane`, 460, 300, 1000)
  const scroller = useRef<HTMLDivElement>(null)
  const [menuKey, setMenuKey] = useState(0)
  const [width, measure] = useWidth<HTMLDivElement>()
  const MAIN_MIN = 400
  // Responsive: keep the chat column usable. The sidebar yields first, then the right pane narrows.
  const sideShown = sideOpen && (!paneOpen ? width >= 520 : width - paneW >= MAIN_MIN + sideW)
  const sideEff = sideShown ? sideW : 0
  const paneEff = paneOpen ? Math.max(260, Math.min(paneW, width - sideEff - MAIN_MIN)) : 0

  useEffect(() => {
    void ideApi.models('cursor').then(r => setModels(r.models)).catch(() => undefined)
  }, [])

  useEffect(() => {
    const u = ide?.settings.cursorModel

    if (u !== undefined) {
      setModel(u)
    }
  }, [ide?.settings.cursorModel])

  const setChat = useCallback(
    (cid: string, push = true) => {
      $panelChat.set({ ...$panelChat.get(), [id]: cid })
      setPage('chat')

      if (push) {
        setHist(h => [...h.slice(0, hi + 1), cid])
        setHi(i => i + 1)
      }
    },
    [hi, id]
  )

  const load = useCallback(async () => (chatId ? ideApi.chat(chatId).then(c => ({ ui: c.ui })) : { ui: [] }), [chatId])

  const start = useCallback(
    async (text: string, extra?: { attachments?: unknown[]; mode?: string; model?: string }) => {
      let cid = chatId

      if (!cid) {
        cid = (await ideApi.newChat('cursor', repo)).id
        setChat(cid)
      }

      const r = await ideApi.send(cid, { attachments: extra?.attachments, mode: extra?.mode ?? mode, model: extra?.model ?? model, text })
      void refresh()

      return r.run
    },
    [chatId, mode, model, repo, setChat]
  )

  const session = useSession({ key: chatId ?? `none-${id}`, load, start })

  useEffect(() => {
    const el = scroller.current

    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 260) {
      el.scrollTop = el.scrollHeight
    }
  }, [session.turns, session.live])

  const newChat = (r?: string) => {
    if (r) {
      $repo.set(r)
    }

    $panelChat.set({ ...$panelChat.get(), [id]: '' })
    setPage('chat')
    setMenuKey(k => k + 1)
  }

  const cur = chats.find(c => c.id === chatId)
  const usage = [...session.turns].reverse().find(t => t.usage)?.usage
  const ctxPct = usage ? (((usage.input ?? 0) + (usage.output ?? 0)) / 200000) * 100 : 0
  const termCount = tabs.filter(t => t.kind === 'terminal').length

  const openTab = (k: PaneKind, extra: Partial<PaneTab> = {}) => {
    setPaneOpen(true)
    const existing = k !== 'terminal' ? tabs.find(t => t.kind === k) : undefined

    if (existing) {
      setActive(existing.id)

      return
    }

    const t: PaneTab = { id: uid(), kind: k, title: k === 'terminal' ? 'zsh' : k[0].toUpperCase() + k.slice(1), ...extra }
    setTabs(ts => [...ts, t])
    setActive(t.id)
  }

  const onLink = (u: string) => {
    if (/localhost|127\.0\.0\.1/.test(u)) {
      setBrowserUrl(u)
      openTab('browser', { url: u })
    } else {
      window.open(u, '_blank')
    }
  }

  const title = page === 'automations' ? 'Automations' : page === 'customize' ? 'Customize' : (cur?.title ?? 'New chat')
  const widthOk = useMemo(() => true, [])

  return (
    <div className={cn('relative flex h-full min-h-0 w-full overflow-hidden', !visible && 'hidden')} key={widthOk ? 'cursor-app' : 'x'} ref={measure}>
      {sideShown ? (
        <div className="relative h-full shrink-0 border-r border-(--ui-stroke-tertiary)" style={{ width: sideW }}>
          <Sidebar
            activeChat={chatId}
            onAddRepo={() => setAddRepo(true)}
            onAutomations={() => setPage('automations')}
            onCustomize={() => setPage('customize')}
            onNew={newChat}
            onOpen={c => setChat(c.id)}
            page={page}
          />
          <Splitter edge="right" onResize={setSideW} size={sideW} />
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-[300px] flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-1 px-2">
          <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={() => setSideOpen(o => !o)} title="Toggle sidebar" type="button">
            <Codicon name="layout-sidebar-left" size="0.9rem" />
          </button>
          <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) disabled:opacity-30" disabled={hi <= 0} onClick={() => { setHi(hi - 1); setChat(hist[hi - 1], false) }} type="button">
            <Codicon name="arrow-left" size="0.9rem" />
          </button>
          <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) disabled:opacity-30" disabled={hi >= hist.length - 1} onClick={() => { setHi(hi + 1); setChat(hist[hi + 1], false) }} type="button">
            <Codicon name="arrow-right" size="0.9rem" />
          </button>
          <span className="ml-1 inline-flex h-7 max-w-[40%] items-center gap-2 rounded-lg bg-(--ui-bg-quaternary) px-2.5 text-[0.82rem]">
            <span className="truncate">{title}</span>
            <Codicon className="text-(--ui-text-tertiary)" name="device-desktop" size="0.8rem" />
          </span>
          <span className="flex-1" />
          <button
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[0.78rem] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground"
            onClick={() => repo && void ideApi.openInEditor(repo).catch(e => window.alert(e instanceof Error ? e.message : String(e)))}
            title="Open this repository in a desktop editor on this machine"
            type="button"
          >
            IDE <Codicon name="link-external" size="0.75rem" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" type="button">
                <Codicon name="ellipsis" size="0.9rem" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => cur && void ideApi.patchChat(cur.id, { pinned: !cur.pinned }).then(() => refresh())}>{cur?.pinned ? 'Unpin chat' : 'Pin chat'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { const t = window.prompt('Rename chat', cur?.title ?? '');

 if (cur && t) {void ideApi.patchChat(cur.id, { title: t }).then(() => refresh())} }}>Rename…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => $views.set({ ...$views.get(), [id]: 'tui' })}>Switch to Native UI</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => cur && void ideApi.deleteChat(cur.id).then(() => { newChat(); void refresh() })}>Delete chat</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button className={cn('grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)', paneOpen && 'bg-(--ui-bg-quaternary)')} onClick={() => setPaneOpen(o => !o)} title="Toggle right pane" type="button">
            <Codicon name="layout-sidebar-right" size="0.9rem" />
          </button>
        </div>
        {page === 'automations' ? (
          <div className="min-h-0 flex-1 overflow-y-auto"><AutomationsPage automations={ide?.automations ?? []} repos={ide?.repos ?? []} /></div>
        ) : page === 'customize' ? (
          <div className="min-h-0 flex-1 overflow-y-auto"><CustomizePage /></div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4" ref={scroller}>
              <div className="mx-auto w-full max-w-[680px]">
                {session.turns.length === 0 && !session.live ? (
                  <div className="mt-[16vh] text-center text-(--ui-text-secondary)">
                    <div className="text-[1.3rem] font-semibold text-foreground">{repo ? repoName(repo) : 'What should we build?'}</div>
                    <div className="mt-1">Describe the task. Cursor runs it in this repository.</div>
                    {!repo ? (
                      <button className="mt-4 rounded-lg bg-(--ui-bg-quaternary) px-3 py-1.5 text-[0.84rem] text-foreground hover:bg-(--chrome-action-hover)" onClick={() => setAddRepo(true)} type="button">
                        Add a repository
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <Transcript
                  agent="cursor"
                  busy={session.busy}
                  live={session.live}
                  onApply={code => void navigator.clipboard.writeText(code)}
                  onFork={() => newChat()}
                  onLink={onLink}
                  turns={session.turns}
                />
              </div>
            </div>
            <div className="shrink-0 px-6 pb-3">
              <div className="mx-auto w-full max-w-[680px]">
                <CursorComposer
                  attachments={attachments}
                  busy={session.busy}
                  connection={connectionLabel()}
                  contextPct={ctxPct}
                  design={design}
                  hasChat={session.turns.length > 0}
                  key={menuKey}
                  mode={mode}
                  model={model}
                  models={models}
                  onDesign={() => { setDesign(d => !d); openTab('browser') }}
                  onMode={setMode}
                  onModel={m => { setModel(m); void ideApi.setSettings({ cursorModel: m }) }}
                  onOpenTerminal={() => openTab('terminal')}
                  onSend={(t, a) => void session.send(t, { attachments: a, mode, model })}
                  onStop={session.stop}
                  repo={repo}
                  setAttachments={setAttachments}
                  terminals={termCount}
                />
              </div>
            </div>
          </>
        )}
      </div>
      {paneOpen ? (
        <div className="relative h-full shrink-0" style={{ width: paneEff }}>
          <Splitter edge="left" onResize={setPaneW} size={paneEff} />
          <RightPane active={active} browserUrl={browserUrl} onBrowserUrl={setBrowserUrl} repo={repo} setActive={setActive} setTabs={setTabs} tabs={tabs} />
        </div>
      ) : null}
      {addRepo ? <AddRepoDialog onClose={() => setAddRepo(false)} /> : null}
    </div>
  )
}
