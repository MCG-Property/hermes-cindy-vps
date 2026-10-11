import { cn, Codicon, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, host, useValue } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useState } from 'react'

import { AddRepoDialog, RepoPicker } from './agent-panel'
import { ideApi } from './api'
import { repoName } from './fold'
import { SKINS } from './skins'
import { $repo, $tui, $views, type TuiTab } from './store'
import { AgentTerminal } from './terminal'
import type { AgentId } from './types'
import { type View, ViewToggle } from './view-toggle'

const uid = () => Math.random().toString(36).slice(2, 8)

function WebView({ repo }: { repo: null | string }) {
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!repo) {
      return
    }

    void ideApi.opencodeWeb(repo).then(r => setUrl(r.url)).catch(e => setErr(e instanceof Error ? e.message : String(e)))
  }, [repo])

  if (err) {
    return <div className="p-6 text-(--ui-text-secondary)">{err}</div>
  }

  return url ? <iframe className="h-full w-full border-0 bg-white" src={url} title="OpenCode" /> : <div className="grid h-full place-items-center text-(--ui-text-tertiary)">Starting OpenCode…</div>
}

/**
 * The agent's own full-screen UI (Claude Code, Codex, OpenCode, Cursor Agent) running in a PTY on the connected box — every
 * element, shortcut, slash command and permission prompt is the real thing. Tabs are independent sessions.
 */
export function TuiPanel({ agent, id, visible }: { agent: AgentId; id: string; visible: boolean }) {
  const repo = useValue($repo)
  const all = useValue($tui)
  const views = useValue($views)
  const cur = all[id] ?? { active: '', tabs: [] as TuiTab[] }
  const skin = SKINS[agent]
  const [font, setFont] = useState(12.5)
  const [addRepo, setAddRepo] = useState(false)
  const view: View = views[id] ?? 'tui'

  const patch = useCallback(
    (fn: (s: { active: string; tabs: TuiTab[] }) => { active: string; tabs: TuiTab[] }) => $tui.set({ ...$tui.get(), [id]: fn($tui.get()[id] ?? { active: '', tabs: [] }) }),
    [id]
  )

  const openTab = useCallback(
    (resume = false) => {
      const t: TuiTab = { cwd: repo ?? undefined, id: uid(), resume, title: `${skin.label} ${(($tui.get()[id]?.tabs.length ?? 0) + 1)}` }
      patch(s => ({ active: t.id, tabs: [...s.tabs, t] }))
    },
    [id, patch, repo, skin.label]
  )

  useEffect(() => {
    if (visible && !$tui.get()[id]?.tabs.length) {
      openTab(false)
    }
  }, [id, openTab, visible])

  const close = (t: TuiTab) => {
    if (t.termId) {
      void ideApi.termKill(t.termId).catch(() => undefined)
    }

    patch(s => {
      const tabs = s.tabs.filter(x => x.id !== t.id)

      return { active: s.active === t.id ? (tabs[tabs.length - 1]?.id ?? '') : s.active, tabs }
    })
  }

  const setView = (v: View) => $views.set({ ...$views.get(), [id]: v })
  const local = (host.state.connectionId.get() ?? 'local') === 'local'
  const options: View[] = agent === 'opencode' && local ? ['tui', 'web', 'chat'] : ['tui', 'chat']

  return (
    <div className={cn('relative flex h-full min-h-0 w-full flex-col', !visible && 'hidden')} style={{ background: 'var(--ide-term-bg)' }}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-(--ui-stroke-tertiary) bg-background px-2">
        <span className="mr-1 flex items-center gap-1.5 font-mono text-[0.76rem]" style={{ color: skin.accent }}>
          <span className="size-2 rounded-full" style={{ background: skin.accent }} />
          {skin.tagline}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {cur.tabs.map(t => (
            <div
              className={cn('group flex h-6 shrink-0 items-center gap-1 rounded-md pr-1 pl-2 text-[0.76rem] text-(--ui-text-secondary) hover:text-foreground', cur.active === t.id && 'bg-(--ui-bg-quaternary) text-foreground')}
              key={t.id}
            >
              <button onClick={() => patch(s => ({ ...s, active: t.id }))} type="button">
                {t.title}
              </button>
              <button className="grid size-4 place-items-center rounded opacity-0 group-hover:opacity-100 hover:bg-(--chrome-action-hover)" onClick={() => close(t)} type="button">
                <Codicon name="close" size="0.65rem" />
              </button>
            </div>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid size-6 shrink-0 place-items-center rounded-md text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" title="New session" type="button">
                <Codicon name="add" size="0.8rem" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => openTab(false)}>New session in {repo ? repoName(repo) : '~'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openTab(true)}>Resume last session</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ViewToggle onChange={setView} options={options} value={view} />
        <button className="grid size-6 place-items-center rounded-md text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={() => setFont(f => Math.max(9, f - 1))} title="Smaller text" type="button">
          <Codicon name="remove" size="0.75rem" />
        </button>
        <button className="grid size-6 place-items-center rounded-md text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={() => setFont(f => Math.min(22, f + 1))} title="Larger text" type="button">
          <Codicon name="add" size="0.75rem" />
        </button>
        <RepoPicker onAdd={() => setAddRepo(true)} />
      </div>
      <div className="relative min-h-0 flex-1">
        {view === 'web' ? <WebView repo={repo} /> : null}
        {cur.tabs.map(t => (
          <div className={cn('absolute inset-0', (cur.active !== t.id || view === 'web') && 'hidden')} key={t.id}>
            <AgentTerminal
              cwd={t.cwd ?? repo}
              fontSize={font}
              kind={agent}
              onReady={info => patch(s => ({ ...s, tabs: s.tabs.map(x => (x.id === t.id ? { ...x, termId: info.id } : x)) }))}
              resume={t.resume}
              termId={t.termId}
              visible={visible && cur.active === t.id && view !== 'web'}
            />
          </div>
        ))}
      </div>
      {addRepo ? <AddRepoDialog onClose={() => setAddRepo(false)} /> : null}
    </div>
  )
}
