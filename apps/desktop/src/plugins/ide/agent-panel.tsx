import { cn, Codicon, useValue } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ideApi } from './api'
import { Composer } from './composer'
import { ago, repoName } from './fold'
import { SKINS } from './skins'
import { $chats, $ide, $panelChat, $repo, $repos, refresh } from './store'
import { Transcript } from './transcript'
import type { AgentId, ChatLight } from './types'
import { useSession } from './use-session'
import { WorkPane } from './work-pane'

function RepoPicker({ onAdd }: { onAdd: () => void }) {
  const repos = useValue($repos)
  const repo = useValue($repo)

  return (
    <div className="flex items-center gap-1">
      <select
        className="h-7 max-w-44 rounded-lg bg-(--ui-bg-quaternary) px-2 text-[0.78rem] outline-none"
        onChange={e => $repo.set(e.target.value || null)}
        value={repo ?? ''}
      >
        {!repos.length ? <option value="">No repository</option> : null}
        {repos.map(r => (
          <option key={r.path} value={r.path}>
            {r.name}
          </option>
        ))}
      </select>
      <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={onAdd} title="Add repository" type="button">
        <Codicon name="new-folder" size="0.85rem" />
      </button>
    </div>
  )
}

export function AddRepoDialog({ onClose }: { onClose: () => void }) {
  const [dir, setDir] = useState<null | { dirs: { name: string; path: string }[]; isGit: boolean; parent: string; path: string }>(null)
  const [err, setErr] = useState('')

  const go = useCallback((p: string) => void ideApi.browse(p).then(setDir).catch(e => setErr(String(e?.message ?? e))), [])

  useEffect(() => go(''), [go])

  return (
    <div className="absolute inset-0 z-30 grid place-items-start justify-center bg-black/50 pt-[12vh]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[60vh] w-[480px] flex-col overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-primary,#1b1b1b) shadow-2xl">
        <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2.5 text-[0.85rem]">
          <button className="hover:text-foreground" onClick={() => dir && go(dir.parent)} type="button">
            <Codicon name="arrow-up" size="0.9rem" />
          </button>
          <input
            className="min-w-0 flex-1 bg-transparent text-(--ui-text-secondary) outline-none"
            defaultValue={dir?.path ?? ''}
            key={dir?.path}
            onKeyDown={e => e.key === 'Enter' && go((e.target as HTMLInputElement).value)}
            placeholder="Type a path and press Enter"
          />
          <button
            className="rounded-lg bg-foreground px-3 py-1 text-[0.8rem] text-background"
            onClick={() => dir && void ideApi.addRepo(dir.path).then(r => { $repo.set(r.path); void refresh(); onClose() })}
            type="button"
          >
            Add {dir?.isGit ? 'repository' : 'folder'}
          </button>
        </div>
        <div className="overflow-y-auto p-1.5">
          {err ? <div className="p-3 text-red-400">{err}</div> : null}
          {dir?.dirs.map(d => (
            <button className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[0.84rem] hover:bg-(--chrome-action-hover)" key={d.path} onClick={() => go(d.path)} type="button">
              <Codicon name="folder" size="0.85rem" />
              {d.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Sessions({ agent, activeId, onNew, onPick, onDelete }: { activeId: null | string; agent: AgentId; onDelete: (c: ChatLight) => void; onNew: () => void; onPick: (c: ChatLight) => void }) {
  const chats = useValue($chats)
  const repo = useValue($repo)
  const mine = chats.filter(c => c.agent === agent && (!repo || c.repo === repo)).sort((a, b) => b.updated - a.updated)
  const skin = SKINS[agent]

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-(--ui-stroke-tertiary)">
      <div className="p-2">
        <button className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[0.84rem] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground" onClick={onNew} type="button">
          <Codicon name="add" size="0.9rem" />
          New {agent === 'cursor' ? 'chat' : 'session'}
        </button>
      </div>
      <div className="px-3 pt-1 pb-1 text-[0.72rem] text-(--ui-text-tertiary)">{repo ? repoName(repo) : 'All repositories'}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {mine.length === 0 ? <div className="px-2 py-1.5 text-[0.78rem] text-(--ui-text-tertiary)">No {agent === 'cursor' ? 'agents' : 'sessions'} yet</div> : null}
        {mine.map(c => (
          <div
            className={cn('group flex h-7 cursor-default items-center gap-2 rounded-lg px-2 text-[0.82rem] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground', activeId === c.id && 'bg-(--ui-bg-quaternary) text-foreground')}
            key={c.id}
            onClick={() => onPick(c)}
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.running ? '#e6b450' : c.unread ? skin.accent : 'var(--ui-text-tertiary)' }} />
            <span className="flex-1 truncate">{c.title}</span>
            <span className="text-[0.7rem] text-(--ui-text-tertiary) group-hover:hidden">{ago(c.updated)}</span>
            <button className="hidden text-(--ui-text-tertiary) group-hover:block hover:text-red-400" onClick={e => { e.stopPropagation(); onDelete(c) }} type="button">
              <Codicon name="trash" size="0.75rem" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function useWidth<T extends HTMLElement>(): [number, (el: null | T) => void] {
  const [w, setW] = useState(1200)
  const [obs] = useState(() => new ResizeObserver(es => setW(es[0]?.contentRect.width ?? 1200)))

  const set = useCallback((el: null | T) => {
    obs.disconnect()

    if (el) {
      obs.observe(el)
    }
  }, [obs])

  return [w, set]
}

export function AgentPanel({ agent, id, visible }: { agent: AgentId; id: string; visible: boolean }) {
  const ide = useValue($ide)
  const repo = useValue($repo)
  const panelChat = useValue($panelChat)
  const chatId = panelChat[id] ?? null
  const [mode, setMode] = useState('agent')
  const [browserUrl, setBrowserUrl] = useState('')
  const [addRepo, setAddRepo] = useState(false)
  const [showSessions, setShowSessions] = useState(true)
  const [showWork, setShowWork] = useState(false)
  const [width, measure] = useWidth<HTMLDivElement>()
  const scroller = useRef<HTMLDivElement>(null)
  const skin = SKINS[agent]
  const status = ide?.agents.find(a => a.id === agent)
  const model = ''

  const load = useCallback(async () => (chatId ? ideApi.chat(chatId).then(c => ({ ui: c.ui })) : { ui: [] }), [chatId])

  const start = useCallback(
    async (text: string, extra?: { mode?: string }) => {
      let cid = chatId

      if (!cid) {
        const c = await ideApi.newChat(agent, repo)
        cid = c.id
        $panelChat.set({ ...$panelChat.get(), [id]: cid })
      }

      const r = await ideApi.send(cid, { mode: extra?.mode ?? mode, model, text })
      void refreshSoon()

      return r.run
    },
    [agent, chatId, id, mode, repo]
  )

  const session = useSession({ key: chatId ?? `none-${id}`, load, start })

  useEffect(() => {
    const el = scroller.current

    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
      el.scrollTop = el.scrollHeight
    }
  }, [session.turns, session.live])

  const newSession = () => $panelChat.set({ ...$panelChat.get(), [id]: '' })

  const cursorLayout = agent === 'cursor'
  const title = chatId ? (ide?.chats.find(c => c.id === chatId)?.title ?? skin.label) : `New ${cursorLayout ? 'chat' : 'session'}`

  return (
    <div className={cn('relative flex h-full min-h-0 w-full overflow-hidden', !visible && 'hidden')} ref={measure} style={{ ['--ide-accent' as string]: skin.accent }}>
      {showSessions && width >= 640 ? (
        <Sessions
          activeId={chatId}
          agent={agent}
          onDelete={c => void ideApi.deleteChat(c.id).then(() => { if (c.id === chatId) {newSession();} void refresh() })}
          onNew={newSession}
          onPick={c => $panelChat.set({ ...$panelChat.get(), [id]: c.id })}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 px-3">
          <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={() => setShowSessions(s => !s)} title="Sessions" type="button">
            <Codicon name="layout-sidebar-left" size="0.9rem" />
          </button>
          {!cursorLayout ? (
            <span className="font-mono text-[0.78rem]" style={{ color: skin.accent }}>
              {skin.tagline}
            </span>
          ) : null}
          <span className="truncate text-[0.82rem] text-(--ui-text-secondary)">{title}</span>
          <span className="flex-1" />
          <RepoPicker onAdd={() => setAddRepo(true)} />
          {cursorLayout ? (
            <button className={cn('grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)', showWork && 'bg-(--ui-bg-quaternary)')} onClick={() => setShowWork(w => !w)} title="Browser, terminal, files and changes" type="button">
              <Codicon name="layout-sidebar-right" size="0.9rem" />
            </button>
          ) : null}
        </div>
        {status && !status.installed ? (
          <div className="m-4 rounded-xl border border-(--ui-stroke-tertiary) p-4 text-[0.85rem] text-(--ui-text-secondary)">
            {skin.label} is not installed on this machine. Install its CLI there and it will appear here automatically.
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4" ref={scroller}>
              <div className={cn('mx-auto w-full', cursorLayout ? 'max-w-[680px]' : 'max-w-[820px]')}>
                {agent === 'codex' && session.turns.length === 0 && !session.live ? (
                  <div className="mt-4 mb-2 w-fit rounded-md border border-(--ui-stroke-secondary) px-3 py-2 font-mono text-[0.78rem]">
                    <div style={{ color: skin.accent }}>
                      <b>&gt;_ OpenAI Codex</b>
                    </div>
                    <div className="mt-1 text-(--ui-text-tertiary)">directory: {repo ?? '~'}</div>
                  </div>
                ) : null}
                {agent === 'claude' && session.turns.length === 0 && !session.live ? (
                  <div className="mt-4 mb-2 w-fit rounded-lg border px-4 py-3 font-mono text-[0.8rem]" style={{ borderColor: skin.accent }}>
                    <div><span style={{ color: skin.accent }}>✻</span> Welcome to <b>Claude Code</b></div>
                    <div className="mt-1 text-(--ui-text-tertiary)">cwd: {repo ?? '~'}</div>
                  </div>
                ) : null}
                {session.turns.length === 0 && !session.live && cursorLayout ? (
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
                  agent={agent}
                  busy={session.busy}
                  live={session.live}
                  onApply={code => void navigator.clipboard.writeText(code)}
                  onLink={u => (/localhost|127\.0\.0\.1/.test(u) ? setBrowserUrl(u) : window.open(u, '_blank'))}
                  turns={session.turns}
                />
              </div>
            </div>
            <div className="shrink-0 px-5 pb-3">
              <div className={cn('mx-auto w-full', cursorLayout ? 'max-w-[680px]' : 'max-w-[820px]')}>
                <Composer
                  agent={agent}
                  busy={session.busy}
                  mode={mode}
                  onMode={setMode}
                  onSend={t => void session.send(t, { mode })}
                  onStop={session.stop}
                  repoLabel={repo ? repoName(repo) : undefined}
                />
              </div>
            </div>
          </>
        )}
      </div>
      {cursorLayout && (showWork || browserUrl) && width >= 760 ? (
        <div className="w-[40%] min-w-[300px] max-w-[560px] shrink-0">
          <WorkPane browserUrl={browserUrl} onBrowserUrl={setBrowserUrl} repo={repo} />
        </div>
      ) : null}
      {addRepo ? <AddRepoDialog onClose={() => setAddRepo(false)} /> : null}
    </div>
  )
}

async function refreshSoon() {
  await new Promise(r => setTimeout(r, 400))
  await refresh()
}
