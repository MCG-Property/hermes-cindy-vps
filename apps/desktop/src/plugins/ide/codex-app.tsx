import { cn, Codicon, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@hermes/plugin-sdk'
import { useValue } from '@hermes/plugin-sdk'
import { useState } from 'react'

import { AddRepoDialog } from './agent-panel'
import { useWidth } from './agent-panel'
import { APP_SKINS } from './app-skins'
import { AutomationsPage, connectionLabel, CustomizePage, type PaneTab, RightPane, uid } from './desktop-app'
import { repoName } from './fold'
import { IconBtn } from './menus'
import { Splitter, useSize } from './splitter'
import { $ide, $repo, refresh } from './store'
import { Transcript } from './transcript'
import { useAgentApp } from './use-agent-app'

const skin = APP_SKINS.codex
const MODELS = ['GPT-6.1 Sol', 'GPT-6.1 Terra', 'GPT-5.6 Luna']
const EFFORT = ['Light', 'Medium', 'High']

function CodexMark({ size = 64 }: { size?: number }) {
  return (
    <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 64 64" width={size}>
      <path d="M32 7c4 0 7 2 9 4 4-1 8 0 10 4 2 3 1 7 0 10 3 3 4 7 2 11-2 3-5 5-9 5-2 4-6 6-10 6s-8-2-10-6c-4 0-7-2-9-5-2-4-1-8 2-11-1-3-2-7 0-10 2-4 6-5 10-4 2-2 5-4 5-4z" />
      <path d="m24 28 7 6-7 6M35 41h7" />
    </svg>
  )
}

/** OpenAI Codex desktop app: icon rail + "Codex ˅" project sidebar, centered "What should we work on in <project>?" home, chips row above the composer. */
export function CodexApp({ id, visible }: { id: string; visible: boolean }) {
  const a = useAgentApp('codex', id, { effort: 'Light', mode: 'bypass' })
  const ide = useValue($ide)
  const [text, setText] = useState('')
  const [model, setModel] = useState(MODELS[0])
  const [page, setPage] = useState<'automations' | 'chat' | 'skills'>('chat')
  const [side, setSide] = useState(true)
  const [pane, setPane] = useState(false)
  const [tabs, setTabs] = useState<PaneTab[]>([])
  const [active, setActive] = useState('')
  const [addRepo, setAddRepo] = useState(false)
  const [more, setMore] = useState<Record<string, boolean>>({})
  const [width, measure] = useWidth<HTMLDivElement>()
  const [sideW, setSideW] = useSize(`${id}.codex.side`, 236, 190, 400)
  const [paneW, setPaneW] = useSize(`${id}.codex.pane`, 460, 300, 1000)
  const sideShown = side && width >= (pane ? paneW + 720 : 560)
  const paneEff = pane ? Math.max(280, Math.min(paneW, width - (sideShown ? sideW + 52 : 52) - 420)) : 0
  const mode = skin.composer.modes.find(m => m.id === a.mode) ?? skin.composer.modes[2]
  const full = a.mode === 'bypass'
  const home = a.session.turns.length === 0 && !a.session.live

  const openPane = (kind: PaneTab['kind']) => {
    setPane(true)
    const ex = tabs.find(t => t.kind === kind)

    if (ex) {
      setActive(ex.id)

      return
    }

    const t: PaneTab = { id: uid(), kind, title: skin.paneLabels[kind] }
    setTabs(ts => [...ts, t])
    setActive(t.id)
  }

  const submit = () => {
    const s = text.trim()

    if (s) {
      a.send(s)
      setText('')
    }
  }

  const rail = (icon: string, title: string, onClick?: () => void, on?: boolean) => (
    <button className={cn('grid size-9 place-items-center rounded-xl text-(--ui-text-secondary) hover:bg-white/10 hover:text-foreground', on && 'bg-white/90 text-black hover:bg-white')} key={icon} onClick={onClick} title={title} type="button">
      <Codicon name={icon} size="1.05rem" />
    </button>
  )

  return (
    <div className={cn('relative flex h-full min-h-0 w-full overflow-hidden bg-[#181818]', !visible && 'hidden')} ref={measure}>
      <div className="flex w-[52px] shrink-0 flex-col items-center gap-3 bg-[#28272a] py-3">
        {rail('home', 'Home', () => setPage('chat'), page === 'chat')}
        {rail('history', 'Automations', () => setPage('automations'), page === 'automations')}
        {rail('library', 'Skills', () => setPage('skills'), page === 'skills')}
        {rail('layers', 'Plugins')}
        {rail('mention', 'Connectors')}
        {rail('ellipsis', 'More')}
        <span className="h-px w-6 bg-white/10" />
        {rail('git-pull-request', 'Review', () => openPane('changes'))}
        <span className="flex-1" />
        <span className="grid size-7 place-items-center rounded-full bg-[#3b82f6] text-white" title="Update available"><Codicon name="cloud-download" size="0.8rem" /></span>
        <span className="grid size-7 place-items-center rounded-full bg-[#ebcc57] text-[0.62rem] font-semibold text-black">CD</span>
      </div>
      {sideShown ? (
        <aside className="relative flex h-full shrink-0 flex-col bg-[#1e1e1e]" style={{ width: sideW }}>
          <div className="flex h-12 shrink-0 items-center gap-1 px-4">
            <span className="flex flex-1 items-center gap-1 text-[1.12rem] font-medium">Codex <Codicon className="text-(--ui-text-tertiary)" name="chevron-down" size="0.8rem" /></span>
            <IconBtn title="Notifications"><Codicon name="bell" size="0.95rem" /></IconBtn>
            <IconBtn title="Search"><Codicon name="search" size="0.95rem" /></IconBtn>
          </div>
          <div className="px-2 pt-1">
            <button className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.92rem] hover:bg-white/5" onClick={() => { a.newChat(); setPage('chat') }} type="button">
              <Codicon name="edit" size="0.95rem" />
              New chat
            </button>
          </div>
          <div className="px-4 pt-4 pb-1 text-[0.92rem] text-(--ui-text-secondary)">Projects</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {a.repos.map(r => {
              const rc = a.chats.filter(c => c.repo === r.path).sort((x, y) => y.updated - x.updated)
              const shown = more[r.path] ? rc : rc.slice(0, 5)

              return (
                <div key={r.path}>
                  <button className={cn('flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.92rem] hover:bg-white/5', a.repo === r.path && 'bg-[#303030]')} onClick={() => { $repo.set(r.path); a.newChat(r.path) }} type="button">
                    <Codicon name={a.repo === r.path ? 'folder-opened' : 'folder-opened'} size="0.95rem" />
                    <span className="truncate">{r.name}</span>
                  </button>
                  {shown.map(c => (
                    <button className={cn('block h-9 w-full truncate rounded-lg pr-2 pl-[2.1rem] text-left text-[0.9rem] text-(--ui-text-secondary) hover:bg-white/5 hover:text-foreground', a.chatId === c.id && 'text-foreground')} key={c.id} onClick={() => { $repo.set(r.path); a.openChat(c.id); setPage('chat') }} type="button">
                      {c.title}
                    </button>
                  ))}
                  {rc.length > 5 && !more[r.path] ? <button className="block h-8 pl-[2.1rem] text-left text-[0.88rem] text-(--ui-text-tertiary) hover:text-foreground" onClick={() => setMore(m => ({ ...m, [r.path]: true }))} type="button">Show more</button> : null}
                </div>
              )
            })}
            <button className="mt-1 flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.86rem] text-(--ui-text-tertiary) hover:bg-white/5 hover:text-foreground" onClick={() => setAddRepo(true)} type="button">
              <Codicon name="new-folder" size="0.9rem" />
              Add project
            </button>
          </div>
          <Splitter edge="right" onResize={setSideW} size={sideW} />
        </aside>
      ) : null}
      <main className="flex min-w-0 flex-1 flex-col rounded-tl-xl">
        <div className="flex h-12 shrink-0 items-center gap-1 px-3">
          <IconBtn disabled={!a.hist.canBack} onClick={a.hist.back}><Codicon name="arrow-left" size="0.95rem" /></IconBtn>
          <IconBtn disabled={!a.hist.canFwd} onClick={a.hist.fwd}><Codicon name="arrow-right" size="0.95rem" /></IconBtn>
          <IconBtn onClick={() => setSide(s => !s)} title="Sidebar"><Codicon name="layout-sidebar-left" size="0.95rem" /></IconBtn>
          <span className="flex-1 truncate px-2 text-center text-[0.84rem] text-(--ui-text-secondary)">{page === 'chat' && !home ? a.cur?.title : ''}</span>
          <IconBtn active={pane} onClick={() => (pane ? setPane(false) : openPane('changes'))} title="Review / terminal / files"><Codicon name="layout-sidebar-right" size="0.95rem" /></IconBtn>
        </div>
        {page === 'automations' ? (
          <div className="min-h-0 flex-1 overflow-y-auto"><AutomationsPage automations={ide?.automations ?? []} repos={ide?.repos ?? []} /></div>
        ) : page === 'skills' ? (
          <div className="min-h-0 flex-1 overflow-y-auto"><CustomizePage /></div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6" ref={a.scroller}>
              <div className="mx-auto w-full max-w-[760px]">
                {home ? (
                  <div className="mt-[18vh] flex flex-col items-center text-center">
                    <span className="text-(--ui-text-secondary)"><CodexMark /></span>
                    <h1 className="mt-6 text-[1.9rem] leading-tight font-normal">
                      What should we work on in{' '}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="underline decoration-dotted underline-offset-4" type="button">{a.repo ? repoName(a.repo) : 'a project'}</button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center">
                          {a.repos.map(r => <DropdownMenuItem key={r.path} onSelect={() => $repo.set(r.path)}>{r.name}</DropdownMenuItem>)}
                          <DropdownMenuItem onSelect={() => setAddRepo(true)}>Add project…</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      ?
                    </h1>
                  </div>
                ) : null}
                <Transcript agent="codex" busy={a.session.busy} live={a.session.live} turns={a.session.turns} />
              </div>
            </div>
            <div className="shrink-0 px-6 pb-4">
              <div className="mx-auto w-full max-w-[860px]">
                <div className="flex gap-2 rounded-t-2xl bg-[#2a2a2a] px-4 pt-2.5 pb-4 text-[0.9rem]">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 rounded-lg px-2 py-0.5 hover:bg-white/10" type="button"><Codicon name="folder-opened" size="0.95rem" />{a.repo ? repoName(a.repo) : 'Select project'}</button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {a.repos.map(r => <DropdownMenuItem key={r.path} onSelect={() => $repo.set(r.path)}>{r.name}</DropdownMenuItem>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="flex items-center gap-2 rounded-lg px-2 py-0.5 text-(--ui-text-secondary)"><Codicon name="device-desktop" size="0.95rem" />{connectionLabel() === 'This Mac' ? 'This computer' : connectionLabel()}</span>
                </div>
                <div className="-mt-3 rounded-[22px] bg-[#363636] px-4 pt-3 pb-2.5">
                  <textarea
                    className="max-h-48 min-h-9 w-full resize-none bg-transparent text-[0.98rem] leading-6 outline-none placeholder:text-(--ui-text-tertiary)"
                    onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(192, e.target.scrollHeight)}px` }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
                    placeholder={home ? 'Do anything' : 'Ask for follow-up changes'}
                    rows={1}
                    value={text}
                  />
                  <div className="mt-1 flex items-center gap-1 text-[0.9rem]">
                    <IconBtn title="Attach"><Codicon name="add" size="1rem" /></IconBtn>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className={cn('ml-1 flex items-center gap-1.5 rounded-lg px-2 py-1 whitespace-nowrap hover:bg-white/10', full ? 'text-orange-400' : 'text-(--ui-text-secondary)')} type="button">
                          <Codicon name={full ? 'warning' : 'shield'} size="0.9rem" />
                          {mode.label}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {skin.composer.modes.map(m => <DropdownMenuItem key={m.id} onSelect={() => a.setMode(m.id)}>{m.label}</DropdownMenuItem>)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <span className="flex-1" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1 rounded-lg px-2 py-1 whitespace-nowrap text-(--ui-text-secondary) hover:bg-white/10" type="button">
                          <span className="text-foreground">{model}</span> {a.effort}
                          <Codicon name="chevron-down" size="0.7rem" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {MODELS.map(m => <DropdownMenuItem key={m} onSelect={() => setModel(m)}>{m}</DropdownMenuItem>)}
                        {EFFORT.map(e => <DropdownMenuItem key={e} onSelect={() => a.setEffort(e)}>Effort: {e}</DropdownMenuItem>)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <IconBtn title="Dictate"><Codicon name="mic" size="1rem" /></IconBtn>
                    <button className="grid size-9 place-items-center rounded-full bg-[#2f6fe4] text-white hover:opacity-90" onClick={a.session.busy ? a.session.stop : submit} title={a.session.busy ? 'Stop' : text.trim() ? 'Send' : 'Voice'} type="button">
                      <Codicon name={a.session.busy ? 'debug-stop' : text.trim() ? 'arrow-up' : 'pulse'} size="1rem" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      {pane ? (
        <div className="relative h-full shrink-0" style={{ width: paneEff }}>
          <Splitter edge="left" onResize={setPaneW} size={paneEff} />
          <RightPane active={active} browserUrl="" onBrowserUrl={() => undefined} repo={a.repo} setActive={setActive} setTabs={setTabs} skin={skin} tabs={tabs} />
        </div>
      ) : null}
      {addRepo ? <AddRepoDialog onClose={() => { setAddRepo(false); void refresh() }} /> : null}
    </div>
  )
}

