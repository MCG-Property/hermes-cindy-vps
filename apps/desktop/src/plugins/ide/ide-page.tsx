import { cn, Codicon, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, useValue } from '@hermes/plugin-sdk'

import { AgentPanel } from './agent-panel'
import { HermesChat } from './hermes-chat'
import { SKINS } from './skins'
import { Splitter, useSize } from './splitter'
import {
  $activePanel,
  $hermesOpen,
  $ide,
  $ideError,
  $layout,
  $panels,
  $views,
  closePanel,
  openPanel,
  refresh
} from './store'
import { $repo } from './store'
import { IdeTerminal } from './terminal'
import { TuiPanel } from './tui-panel'
import { AGENT_IDS, AGENT_LABEL, type AgentId } from './types'

function Surface({ agent, id, visible }: { agent: AgentId; id: string; visible: boolean }) {
  const views = useValue($views)
  const view = views[id] ?? (agent === 'cursor' ? 'chat' : 'tui')

  return view === 'chat' ? <AgentPanel agent={agent} id={id} visible={visible} /> : <TuiPanel agent={agent} id={id} visible={visible} />
}

function Slot({ children, id, last, visible }: { children: React.ReactNode; id: string; last: boolean; visible: boolean }) {
  const [w, setW] = useSize(`slot.${id}`, 560, 280, 1800)
  const split = useValue($layout) === 'split'

  return (
    <div className={cn('relative min-w-0', !visible && 'hidden', split && !last ? 'shrink-0 border-r border-(--ui-stroke-tertiary)' : 'flex-1')} style={split && !last ? { width: w } : undefined}>
      {children}
      {split && !last ? <Splitter edge="right" onResize={setW} size={w} /> : null}
    </div>
  )
}

function Dot({ agent }: { agent: AgentId }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ background: SKINS[agent].accent }} />
}

export function IdePage() {
  const panels = useValue($panels)
  const active = useValue($activePanel)
  const hermes = useValue($hermesOpen)
  const layout = useValue($layout)
  const ide = useValue($ide)
  const error = useValue($ideError)
  const repo = useValue($repo)

  if (error && !ide) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-md text-[0.9rem] text-(--ui-text-secondary)">
          <p className="mb-1 text-[1rem] font-medium text-foreground">IDE backend unavailable</p>
          <p>{error}</p>
          <p className="mt-2 text-(--ui-text-tertiary)">The IDE plugin runs on the connected Hermes box. Make sure that box has the IDE plugin (update it) and its dashboard is running.</p>
          <button className="mt-4 rounded-lg bg-(--ui-bg-quaternary) px-3 py-1.5 hover:bg-(--chrome-action-hover)" onClick={() => void refresh()} type="button">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const shown = layout === 'split' ? panels : panels.filter(p => p.id === active)

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-(--ui-stroke-tertiary) px-2">
        {panels.map(p => {
          const agent = p.kind as AgentId
          const isAgent = (AGENT_IDS as string[]).includes(p.kind)
          const installed = !isAgent || (ide?.agents.find(a => a.id === agent)?.installed ?? true)

          return (
            <div
              className={cn('group flex h-7 items-center gap-1.5 rounded-lg pr-1 pl-2.5 text-[0.82rem] text-(--ui-text-secondary) hover:text-foreground', active === p.id && 'bg-(--ui-bg-quaternary) text-foreground', !installed && 'opacity-50')}
              key={p.id}
            >
              <button className="flex items-center gap-1.5" onClick={() => $activePanel.set(p.id)} type="button">
                {isAgent ? <Dot agent={agent} /> : <Codicon name={p.kind === 'terminal' ? 'terminal' : 'files'} size="0.85rem" />}
                {isAgent ? AGENT_LABEL[agent] : p.kind === 'terminal' ? 'Terminal' : 'Files'}
              </button>
              <button className="grid size-5 place-items-center rounded opacity-0 hover:bg-(--chrome-action-hover) group-hover:opacity-100" onClick={() => closePanel(p.id)} type="button">
                <Codicon name="close" size="0.7rem" />
              </button>
            </div>
          )
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground" title="Open a coding-agent panel" type="button">
              <Codicon name="add" size="0.9rem" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {AGENT_IDS.map(a => (
              <DropdownMenuItem key={a} onSelect={() => openPanel(a)}>
                <Dot agent={a} />
                <span className="ml-2">{AGENT_LABEL[a]}</span>
                {ide && !ide.agents.find(x => x.id === a)?.installed ? <span className="ml-auto pl-3 text-[0.7rem] text-(--ui-text-tertiary)">not installed</span> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openPanel('terminal')}>
              <Codicon name="terminal" size="0.85rem" />
              <span className="ml-2">Terminal</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="flex-1" />
        <button
          className={cn('flex h-7 items-center gap-1.5 rounded-lg px-2 text-[0.78rem] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)', layout === 'split' && 'bg-(--ui-bg-quaternary)')}
          onClick={() => $layout.set(layout === 'split' ? 'tabs' : 'split')}
          title="Show open panels side by side"
          type="button"
        >
          <Codicon name="split-horizontal" size="0.85rem" />
          Split
        </button>
        <button
          className={cn('flex h-7 items-center gap-1.5 rounded-lg px-2 text-[0.78rem] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)', hermes && 'bg-(--ui-bg-quaternary) text-foreground')}
          onClick={() => $hermesOpen.set(!hermes)}
          title="Hermes chat"
          type="button"
        >
          <Codicon name="sparkle" size="0.85rem" />
          Hermes
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1">
          {panels.length === 0 ? (
            <div className="grid h-full w-full place-items-center text-(--ui-text-tertiary)">Open a coding agent with + above.</div>
          ) : null}
          {panels.map((p, i) => {
            const visible = shown.some(s => s.id === p.id)
            const isAgent = (AGENT_IDS as string[]).includes(p.kind)
            const lastVisible = shown[shown.length - 1]?.id === p.id

            return (
              <Slot id={p.id} key={p.id} last={lastVisible || i === panels.length - 1} visible={visible}>
                {isAgent ? <Surface agent={p.kind as AgentId} id={p.id} visible={visible} /> : p.kind === 'terminal' ? <IdeTerminal cwd={repo} visible={visible} /> : null}
              </Slot>
            )
          })}
        </div>
        {hermes ? <HermesChat onClose={() => $hermesOpen.set(false)} /> : null}
      </div>
    </div>
  )
}
