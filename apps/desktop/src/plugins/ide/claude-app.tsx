import { cn, Codicon, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, useValue } from '@hermes/plugin-sdk'
import { useState } from 'react'

import { AddRepoDialog } from './agent-panel'
import { useWidth } from './agent-panel'
import { ideApi } from './api'
import { APP_SKINS } from './app-skins'
import { AutomationsPage, CustomizePage, type PaneTab, RightPane, uid } from './desktop-app'
import { ago, repoName } from './fold'
import { IconBtn, Pick } from './menus'
import { Splitter, useSize } from './splitter'
import { $ide, refresh } from './store'
import { Transcript } from './transcript'
import { useAgentApp } from './use-agent-app'

const skin = APP_SKINS.claude
const MODELS = [{ id: 'sonnet', label: 'Sonnet 5.5' }, { id: 'opus', label: 'Opus 5.5' }, { id: 'haiku', label: 'Haiku 4.5' }]
const EFFORT = ['Low', 'Medium', 'High'].map(e => ({ id: e, label: e }))
const SLASH = [{ id: '/clear', label: 'Clear — start a new session' }, { id: '/compact', label: 'Compact — continue in a fresh session' }, { id: '/model', label: 'Model — switch model' }]

/** Claude desktop app, Code tab: sidebar (New / Projects / Artifacts / Customize / More + sessions), env + folder pills, serif-free transcript, "Type / for commands" composer. */
export function ClaudeApp({ id, visible }: { id: string; visible: boolean }) {
  const a = useAgentApp('claude', id, { effort: 'High', mode: 'bypass' })
  const ide = useValue($ide)
  const [text, setText] = useState('')
  const [model, setModel] = useState('sonnet')
  const [page, setPage] = useState<'automations' | 'chat' | 'customize'>('chat')
  const [side, setSide] = useState(true)
  const [pane, setPane] = useState(false)
  const [tabs, setTabs] = useState<PaneTab[]>([])
  const [active, setActive] = useState('')
  const [addRepo, setAddRepo] = useState(false)
  const [survey, setSurvey] = useState(true)
  const [width, measure] = useWidth<HTMLDivElement>()
  const [sideW, setSideW] = useSize(`${id}.claude.side`, 232, 180, 380)
  const [paneW, setPaneW] = useSize(`${id}.claude.pane`, 460, 300, 1000)
  const sideShown = side && width >= (pane ? paneW + 700 : 560)
  const paneEff = pane ? Math.max(280, Math.min(paneW, width - (sideShown ? sideW : 0) - 420)) : 0
  const mode = skin.composer.modes.find(m => m.id === a.mode)?.label ?? 'Bypass permissions'
  const grouped = a.chats.filter(c => !a.repo || c.repo === a.repo).sort((x, y) => y.updated - x.updated)

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

  const submit = (v: string) => {
    const s = v.trim()

    if (!s) {
      return
    }

    if (s === '/clear' || s === '/compact') {
      a.newChat()
      setText('')

      return
    }

    a.send(s)
    setText('')
  }

  const lastAssistant = [...a.session.turns].reverse().find(t => t.role === 'assistant' && t.text)
  const long = a.session.turns.length >= 10

  return (
    <div className={cn('relative flex h-full min-h-0 w-full overflow-hidden bg-[#161616]', !visible && 'hidden')} ref={measure}>
      {sideShown ? (
        <aside className="relative flex h-full shrink-0 flex-col bg-[#111111]" style={{ width: sideW }}>
          <div className="flex h-12 shrink-0 items-center gap-0.5 px-2">
            <IconBtn onClick={() => setSide(false)} title="Hide sidebar"><Codicon name="layout-sidebar-left" size="0.9rem" /></IconBtn>
            <IconBtn title="Search"><Codicon name="search" size="0.9rem" /></IconBtn>
            <IconBtn disabled={!a.hist.canBack} onClick={a.hist.back}><Codicon name="arrow-left" size="0.9rem" /></IconBtn>
            <IconBtn disabled={!a.hist.canFwd} onClick={a.hist.fwd}><Codicon name="arrow-right" size="0.9rem" /></IconBtn>
            <span className="flex-1" />
            <span className="flex items-center rounded-lg bg-[#1d1d1b] p-0.5">
              <button className="grid size-6 place-items-center rounded-md text-(--ui-text-tertiary)" title="Chat (in the Claude app)" type="button"><Codicon name="comment-discussion" size="0.85rem" /></button>
              <button className="grid size-6 place-items-center rounded-md bg-[#363636] text-foreground" title="Code" type="button"><Codicon name="code" size="0.85rem" /></button>
            </span>
          </div>
          <nav className="space-y-0.5 px-2 pt-1 text-[0.86rem]">
            <button className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-(--ui-text-secondary) hover:bg-white/5 hover:text-foreground" onClick={() => { a.newChat(); setPage('chat') }} type="button">
              <span className="grid size-5 place-items-center rounded-full bg-[#2a2a2a]"><Codicon name="add" size="0.8rem" /></span>
              New
            </button>
            <button className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-(--ui-text-secondary) hover:bg-white/5 hover:text-foreground" type="button">
              <Codicon name="folder-library" size="0.95rem" />
              Projects
              <span className="rounded-md bg-white/10 px-1.5 text-[0.66rem] text-(--ui-text-secondary)">Beta</span>
            </button>
            <button className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-(--ui-text-secondary) hover:bg-white/5 hover:text-foreground" onClick={() => setPage('automations')} type="button">
              <Codicon name="symbol-misc" size="0.95rem" />
              Artifacts
            </button>
            <button className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-(--ui-text-secondary) hover:bg-white/5 hover:text-foreground" onClick={() => setPage('customize')} type="button">
              <Codicon name="briefcase" size="0.95rem" />
              Customize
            </button>
            <button className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-(--ui-text-secondary) hover:bg-white/5 hover:text-foreground" type="button">
              <Codicon name="chevron-right" size="0.95rem" />
              More
            </button>
          </nav>
          <div className="mt-5 flex items-center px-4 text-[0.8rem] text-(--ui-text-tertiary)">
            <span className="flex-1 truncate">{a.repo ? repoName(a.repo) : 'No folder'}</span>
            <IconBtn onClick={() => a.newChat()} title="New session"><Codicon name="add" size="0.85rem" /></IconBtn>
            <IconBtn onClick={() => setAddRepo(true)} title="Folders"><Codicon name="settings" size="0.85rem" /></IconBtn>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pt-1">
            {grouped.map(c => (
              <div
                className={cn('group flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[0.88rem] text-(--ui-text-secondary) hover:bg-white/5', a.chatId === c.id && 'bg-[#2a2a2a] text-foreground')}
                key={c.id}
                onClick={() => { a.openChat(c.id); setPage('chat') }}
              >
                <span className={cn('size-2.5 shrink-0 rounded-full border', c.running ? 'animate-pulse border-amber-400 bg-amber-400/40' : 'border-(--ui-text-tertiary)')} />
                <span className="flex-1 truncate">{c.title}</span>
                <button className="hidden text-(--ui-text-tertiary) group-hover:block hover:text-red-400" onClick={e => { e.stopPropagation(); void ideApi.deleteChat(c.id).then(() => refresh()) }} type="button"><Codicon name="trash" size="0.75rem" /></button>
              </div>
            ))}
            {!grouped.length ? <div className="px-3 py-2 text-[0.8rem] text-(--ui-text-tertiary)">No sessions yet</div> : null}
          </div>
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-t border-white/5 px-3">
            <span className="grid size-7 place-items-center rounded-full bg-[#2f2f2f] text-[0.66rem] font-medium tracking-wide">CD</span>
            <span className="text-[0.88rem]">Cam</span>
            <span className="text-[0.8rem] text-(--ui-text-tertiary)">· Pro</span>
            <Codicon className="text-(--ui-text-tertiary)" name="chevron-down" size="0.8rem" />
            <span className="flex-1" />
            <IconBtn onClick={() => setPage('customize')} title="Settings"><Codicon name="sparkle" size="0.9rem" /></IconBtn>
          </div>
          <Splitter edge="right" onResize={setSideW} size={sideW} />
        </aside>
      ) : null}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 px-3">
          {!sideShown ? <IconBtn onClick={() => setSide(true)} title="Show sidebar"><Codicon name="layout-sidebar-left" size="0.9rem" /></IconBtn> : null}
          <button className="flex h-8 items-center gap-2 rounded-xl px-1.5 text-[0.92rem] hover:bg-white/5" type="button">
            <span className="grid size-7 place-items-center rounded-lg bg-[#002143] text-sky-400"><Codicon name="device-desktop" size="0.95rem" /></span>
            <span className="max-w-[260px] truncate">{page === 'chat' ? (a.cur?.title ?? 'New session') : page === 'customize' ? 'Customize' : 'Artifacts'}</span>
            <Codicon className="text-(--ui-text-tertiary)" name="chevron-down" size="0.8rem" />
          </button>
          {a.repo ? <span className="rounded-lg bg-[#2a2a2a] px-2.5 py-1 text-[0.82rem] text-(--ui-text-secondary)">{repoName(a.repo)}</span> : null}
          <span className="flex-1" />
          <IconBtn active={tabs.some(t => t.kind === 'terminal') && pane} onClick={() => openPane('terminal')} title="Terminal"><Codicon name="terminal" size="0.95rem" /></IconBtn>
          <IconBtn onClick={() => openPane('changes')} title="Diff"><Codicon name="diff" size="0.95rem" /></IconBtn>
          <IconBtn onClick={() => openPane('browser')} title="Preview"><Codicon name="globe" size="0.95rem" /></IconBtn>
          <IconBtn onClick={() => openPane('files')} title="Files"><Codicon name="folder" size="0.95rem" /></IconBtn>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-white/10" type="button"><Codicon name="kebab-vertical" size="0.95rem" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => a.cur && void ideApi.patchChat(a.cur.id, { pinned: !a.cur.pinned }).then(() => refresh())}>{a.cur?.pinned ? 'Unpin session' : 'Pin session'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { const t = window.prompt('Rename session', a.cur?.title ?? '');

 if (a.cur && t) {void ideApi.patchChat(a.cur.id, { title: t }).then(() => refresh())} }}>Rename…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => a.cur && void ideApi.deleteChat(a.cur.id).then(() => { a.newChat(); void refresh() })}>Archive session</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {page === 'automations' ? (
          <div className="min-h-0 flex-1 overflow-y-auto"><AutomationsPage automations={ide?.automations ?? []} repos={ide?.repos ?? []} /></div>
        ) : page === 'customize' ? (
          <div className="min-h-0 flex-1 overflow-y-auto"><CustomizePage /></div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6" ref={a.scroller}>
              <div className="mx-auto w-full max-w-[760px] pt-2 pb-6">
                {a.session.turns.length === 0 && !a.session.live ? (
                  <div className="mt-[22vh] text-center text-(--ui-text-secondary)">
                    <div className="text-[1.6rem] text-foreground" style={{ color: skin.accent }}>✻</div>
                    <div className="mt-2 text-[1.1rem] text-foreground">{a.repo ? repoName(a.repo) : 'Add a folder to start'}</div>
                    {!a.repo ? <button className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-[0.84rem] hover:bg-white/15" onClick={() => setAddRepo(true)} type="button">Add a folder</button> : null}
                  </div>
                ) : null}
                <Transcript agent="claude" busy={a.session.busy} live={a.session.live} turns={a.session.turns} />
                {lastAssistant && !a.session.busy ? (
                  <>
                    {long ? (
                      <div className="mt-2 text-[0.86rem] text-(--ui-text-secondary)">
                        Compacting before your next message keeps later replies fast and lighter on your usage.{' '}
                        <button className="text-sky-400 underline-offset-2 hover:underline" onClick={() => a.newChat()} type="button">Compact session</button>
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-1 text-(--ui-text-tertiary)">
                      <IconBtn onClick={() => void navigator.clipboard.writeText(lastAssistant.text ?? '')} title="Copy"><Codicon name="copy" size="0.85rem" /></IconBtn>
                      <IconBtn title="Fork"><Codicon name="repo-forked" size="0.85rem" /></IconBtn>
                      <IconBtn onClick={() => a.cur && void ideApi.patchChat(a.cur.id, { pinned: !a.cur.pinned }).then(() => refresh())} title="Pin"><Codicon name="pin" size="0.85rem" /></IconBtn>
                      <IconBtn title="Read aloud"><Codicon name="unmute" size="0.85rem" /></IconBtn>
                      <span className="ml-2 text-[0.86rem]">{ago(lastAssistant.ts)} ago</span>
                    </div>
                    {survey ? (
                      <div className="mt-5 flex items-center gap-4 text-[0.86rem] text-(--ui-text-secondary)">
                        How is Claude doing this session?
                        {['Bad', 'Fine', 'Good'].map(l => <button className="text-(--ui-text-tertiary) hover:text-foreground" key={l} onClick={() => setSurvey(false)} type="button">{l}</button>)}
                        <button className="text-(--ui-text-tertiary) hover:text-foreground" onClick={() => setSurvey(false)} type="button"><Codicon name="close" size="0.8rem" /></button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 px-6 pb-3">
              <div className="relative mx-auto w-full max-w-[760px]">
                {text.startsWith('/') ? (
                  <div className="absolute bottom-full mb-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#1f1f1f] p-1 shadow-2xl">
                    {SLASH.filter(s => s.id.startsWith(text.split(' ')[0])).map(s => (
                      <button className="flex h-8 w-full items-center gap-3 rounded-lg px-3 text-left text-[0.84rem] hover:bg-white/10" key={s.id} onClick={() => submit(s.id)} type="button">
                        <span className="font-mono text-[0.78rem] text-(--ui-text-secondary)">{s.id}</span>
                        <span className="text-(--ui-text-tertiary)">{s.label.split(' — ')[1]}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-end gap-2 rounded-[14px] border border-white/10 bg-[#1f1f1f] px-4 py-3 focus-within:border-white/20">
                  <textarea
                    className="max-h-48 min-h-6 flex-1 resize-none bg-transparent text-[0.95rem] leading-6 outline-none placeholder:text-(--ui-text-tertiary)"
                    onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(192, e.target.scrollHeight)}px` }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(text) } else if (e.key === 'Escape' && a.session.busy) { a.session.stop() } }}
                    placeholder="Type / for commands"
                    rows={1}
                    value={text}
                  />
                  <button className="text-(--ui-text-tertiary) hover:text-foreground" onClick={a.session.busy ? a.session.stop : () => submit(text)} title={a.session.busy ? 'Stop' : 'Send'} type="button">
                    {a.session.busy ? <Codicon name="debug-stop" size="1rem" /> : <span className="text-[1.05rem] leading-none">⏎</span>}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-1 px-1 text-[0.84rem] text-(--ui-text-secondary)">
                  <IconBtn onClick={() => void ideApi.fsFind(a.repo ?? '', '').then(async fs => { if (fs[0]) { const r = await ideApi.fsRead(fs[0]); a.setAttachments([...a.attachments, { kind: 'file', name: fs[0].split('/').pop() ?? 'file', text: r.text ?? '' }]) } })} title="Attach a file"><Codicon name="add" size="0.95rem" /></IconBtn>
                  <IconBtn title="Dictate"><Codicon name="mic" size="0.95rem" /></IconBtn>
                  <Codicon className="-ml-1 text-(--ui-text-tertiary)" name="chevron-down" size="0.7rem" />
                  <Pick className="ml-2" items={skin.composer.modes} label={mode} onPick={a.setMode} />
                  <span className="flex-1" />
                  <Pick align="end" items={MODELS} label={MODELS.find(m => m.id === model)?.label} onPick={m => { setModel(m); a.setModel(m) }} />
                  <Pick align="end" items={EFFORT} label={a.effort} onPick={a.setEffort} />
                  <span className="ml-1 size-4 rounded-full" style={{ background: `conic-gradient(${skin.accent} ${Math.max(6, a.contextPct)}%, #3a3a38 0)`, mask: 'radial-gradient(circle, transparent 4px, #000 5px)' }} title={`Context ${Math.round(a.contextPct)}%`} />
                </div>
                {a.attachments.length ? <div className="mt-1 flex flex-wrap gap-1 px-1">{a.attachments.map((x, i) => <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.72rem]" key={`${x.name}${i}`}>{x.name}</span>)}</div> : null}
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
      {addRepo ? <AddRepoDialog onClose={() => setAddRepo(false)} /> : null}
    </div>
  )
}
