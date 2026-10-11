import { cn, Codicon, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'

import { AddRepoDialog, useWidth } from './agent-panel'
import { ideApi } from './api'
import { APP_SKINS } from './app-skins'
import { type PaneTab, RightPane, uid } from './desktop-app'
import { repoName } from './fold'
import { IconBtn, Pick } from './menus'
import { Splitter, useSize } from './splitter'
import { $repo, refresh } from './store'
import { Transcript } from './transcript'
import { useAgentApp } from './use-agent-app'

const skin = APP_SKINS.opencode

const GLYPH: Record<string, string[]> = {
  c: ['####', '#...', '#...', '#...', '####'],
  d: ['...#', '...#', '####', '#..#', '####'],
  e: ['####', '#..#', '####', '#...', '####'],
  n: ['....', '###.', '#..#', '#..#', '#..#'],
  o: ['####', '#..#', '#..#', '#..#', '####'],
  p: ['####', '#..#', '####', '#...', '#...']
}

/** The block-pixel "opencode" wordmark of the desktop home screen, drawn as SVG so it scales with the panel. */
function Wordmark() {
  const word = 'opencode'
  const cell = 9
  const gap = 5
  let x = 0
  const rects: React.ReactNode[] = []

  for (const ch of word) {
    const g = GLYPH[ch]

    g.forEach((row, y) => [...row].forEach((c, i) => c === '#' && rects.push(<rect fill="#191919" height={cell} key={`${x}-${i}-${y}`} width={cell} x={x + i * cell} y={y * cell} />)))
    x += g[0].length * cell + gap
  }

  return (
    <svg className="mx-auto h-auto w-[62%] max-w-[680px]" viewBox={`0 0 ${x - gap} ${cell * 5}`}>
      {rects}
    </svg>
  )
}

interface Tab {
  chat: null | string
  id: string
}

/** OpenCode desktop app (rebuilt for remote boxes): tab bar with "New session" tabs, block wordmark, "Build / model / effort" composer, project + git row. */
export function OpenCodeApp({ id, visible }: { id: string; visible: boolean }) {
  const a = useAgentApp('opencode', id, { effort: 'High', mode: 'agent' })
  const [text, setText] = useState('')
  const [tabs, setTabs] = useState<Tab[]>([{ chat: null, id: 't0' }])
  const [cur, setCur] = useState('t0')
  const [pane, setPane] = useState(false)
  const [ptabs, setPtabs] = useState<PaneTab[]>([])
  const [pactive, setPactive] = useState('')
  const [addRepo, setAddRepo] = useState(false)
  const [branch, setBranch] = useState<null | string | undefined>(undefined)
  const [width, measure] = useWidth<HTMLDivElement>()
  const [paneW, setPaneW] = useSize(`${id}.opencode.pane`, 440, 300, 1000)
  const paneEff = pane ? Math.max(280, Math.min(paneW, width - 420)) : 0
  const model = a.model || a.models[0] || ''
  const home = a.session.turns.length === 0 && !a.session.live

  useEffect(() => {
    if (!a.repo) {
      setBranch(undefined)

      return
    }

    void ideApi.gitBranch(a.repo).then(r => setBranch(r.git ? (r.branch ?? 'HEAD') : null)).catch(() => setBranch(null))
  }, [a.repo])

  // keep the active tab bound to the panel's current chat
  useEffect(() => {
    if (a.chatId) {
      setTabs(ts => ts.map(t => (t.id === cur && !t.chat ? { ...t, chat: a.chatId } : t)))
    }
  }, [a.chatId, cur])

  const openTab = (t: Tab) => {
    setCur(t.id)

    if (t.chat) {
      a.openChat(t.chat)
    } else {
      a.newChat()
    }
  }

  const addTab = () => {
    const t = { chat: null, id: uid() }
    setTabs(ts => [...ts, t])
    openTab(t)
  }

  const closeTab = (t: Tab) => {
    const left = tabs.filter(x => x.id !== t.id)
    const next = left.length ? left : [{ chat: null, id: uid() }]
    setTabs(next)

    if (cur === t.id) {
      openTab(next[next.length - 1])
    }
  }

  const title = (t: Tab) => (t.chat ? (a.chats.find(c => c.id === t.chat)?.title ?? 'Session') : 'New session')

  const submit = () => {
    const s = text.trim()

    if (s) {
      a.send(s)
      setText('')
    }
  }

  const openPane = (kind: PaneTab['kind']) => {
    setPane(true)
    const ex = ptabs.find(t => t.kind === kind)

    if (ex) {
      setPactive(ex.id)

      return
    }

    const t: PaneTab = { id: uid(), kind, title: skin.paneLabels[kind] }
    setPtabs(ts => [...ts, t])
    setPactive(t.id)
  }

  const composer = (
    <div className="mx-auto w-full max-w-[760px] rounded-xl border border-white/[0.07] bg-[#161616] px-4 pt-3.5 pb-3">
      <textarea
        className="max-h-48 min-h-9 w-full resize-none bg-transparent text-[0.94rem] leading-6 outline-none placeholder:text-(--ui-text-tertiary)"
        onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(192, e.target.scrollHeight)}px` }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } else if (e.key === 'Escape' && a.session.busy) { a.session.stop() } }}
        placeholder={home ? 'Ask anything, / for commands, @ for context...' : 'Ask anything…'}
        rows={1}
        value={text}
      />
      <div className="mt-2 flex items-center gap-1 text-[0.88rem] text-(--ui-text-secondary)">
        <IconBtn title="Attach"><Codicon name="add" size="1rem" /></IconBtn>
        <Pick className="ml-1" items={skin.composer.modes} label={skin.composer.modes.find(m => m.id === a.mode)?.label ?? 'Build'} onPick={a.setMode} />
        <Pick className="ml-1" items={(a.models.length ? a.models : [model]).map(m => ({ id: m, label: m }))} label={<span className="flex items-center gap-1.5"><span className="grid size-4 place-items-center rounded bg-white/15"><Codicon name="chip" size="0.65rem" /></span>{model || 'Select model'}</span>} onPick={a.setModel} />
        <Pick className="ml-1" items={['Low', 'Medium', 'High'].map(e => ({ id: e, label: e }))} label={a.effort} onPick={a.setEffort} />
        <span className="flex-1" />
        <button className="grid size-9 place-items-center rounded-lg bg-[#2a2a2a] text-(--ui-text-secondary) hover:bg-[#333] hover:text-foreground" onClick={a.session.busy ? a.session.stop : submit} title={a.session.busy ? 'Stop' : 'Send'} type="button">
          <Codicon name={a.session.busy ? 'debug-stop' : 'arrow-up'} size="1rem" />
        </button>
      </div>
    </div>
  )

  const projectRow = (
    <div className="mt-6 flex items-center justify-center gap-3 text-[0.88rem] text-(--ui-text-secondary)">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/10" type="button">
            <span className="grid size-5 place-items-center rounded-md bg-[#3a3a3a] text-[0.6rem] text-white">{a.repo ? repoName(a.repo).slice(0, 1) : '+'}</span>
            {a.repo ? repoName(a.repo) : 'Select project'}
            <Codicon name="chevron-down" size="0.7rem" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {a.repos.map(r => <DropdownMenuItem key={r.path} onSelect={() => $repo.set(r.path)}>{r.name}</DropdownMenuItem>)}
          <DropdownMenuItem onSelect={() => setAddRepo(true)}>Add project…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-(--ui-text-tertiary)">/</span>
      <span className="flex items-center gap-1.5"><Codicon name="git-branch" size="0.9rem" />{branch === undefined ? '…' : branch ?? 'No Git'}</span>
    </div>
  )

  return (
    <div className={cn('relative flex h-full min-h-0 w-full overflow-hidden bg-[#080808]', !visible && 'hidden')} ref={measure}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 px-3">
          <IconBtn onClick={() => openPane('files')} title="Projects"><Codicon name="layout" size="0.95rem" /></IconBtn>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {tabs.map(t => (
              <div className={cn('group flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-[0.9rem]', cur === t.id ? 'bg-[#2b2b2b] text-foreground' : 'text-(--ui-text-secondary) hover:bg-white/5')} key={t.id}>
                <button className="flex items-center gap-2" onClick={() => openTab(t)} type="button">
                  <Codicon name="edit" size="0.9rem" />
                  <span className="max-w-[220px] truncate">{title(t)}</span>
                </button>
                <button className="text-(--ui-text-tertiary) hover:text-foreground" onClick={() => closeTab(t)} type="button"><Codicon name="close" size="0.8rem" /></button>
              </div>
            ))}
            <IconBtn onClick={addTab} title="New session"><Codicon name="add" size="0.95rem" /></IconBtn>
          </div>
          <button className="relative grid size-8 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-white/10" onClick={() => (pane ? setPane(false) : openPane('changes'))} title="Review and files" type="button">
            <Codicon name="layout-sidebar-right" size="0.95rem" />
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-500" />
          </button>
        </div>
        {home ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-16">
            <Wordmark />
            <div className="mt-14 w-full">{composer}</div>
            {projectRow}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6" ref={a.scroller}>
              <div className="mx-auto w-full max-w-[760px] py-4">
                <Transcript agent="opencode" busy={a.session.busy} live={a.session.live} turns={a.session.turns} />
              </div>
            </div>
            <div className="shrink-0 px-6 pb-3">
              {composer}
              <div className="mt-2 flex items-center justify-center text-[0.8rem] text-(--ui-text-tertiary)">{a.repo ? repoName(a.repo) : ''} / {branch ?? 'No Git'}</div>
            </div>
          </>
        )}
      </div>
      {pane ? (
        <div className="relative h-full shrink-0" style={{ width: paneEff }}>
          <Splitter edge="left" onResize={setPaneW} size={paneEff} />
          <RightPane active={pactive} browserUrl="" onBrowserUrl={() => undefined} repo={a.repo} setActive={setPactive} setTabs={setPtabs} skin={skin} tabs={ptabs} />
        </div>
      ) : null}
      {addRepo ? <AddRepoDialog onClose={() => { setAddRepo(false); void refresh() }} /> : null}
    </div>
  )
}
