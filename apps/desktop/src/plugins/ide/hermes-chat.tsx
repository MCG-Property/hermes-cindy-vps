import { cn, Codicon, useValue } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useRef } from 'react'

import { ideApi } from './api'
import { Composer } from './composer'
import { repoName } from './fold'
import { $panels, $repo, openPanel } from './store'
import { Transcript } from './transcript'
import { AGENT_IDS, type AgentId } from './types'
import { useSession } from './use-session'

/**
 * The persistent Hermes chat. It stays docked while any agent panel is open and drives the coding agents
 * as tools (run_cursor / run_claude / run_opencode / run_codex) through the Hermes model on the connected box.
 */
export function HermesChat({ onClose }: { onClose: () => void }) {
  const repo = useValue($repo)
  const panels = useValue($panels)
  const scroller = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const r = await ideApi.orchChat(repo ?? '')

    return { run: r.run, ui: r.ui }
  }, [repo])

  const start = useCallback(
    async (text: string) => (await ideApi.orchSend({ context: {}, panels: panels.map(p => p.kind), repo, text })).run,
    [panels, repo]
  )

  const session = useSession({
    key: `hermes-${repo ?? '~'}`,
    load,
    onUi: (action, agent) => {
      if (action === 'open_panel' && agent && (AGENT_IDS as string[]).includes(agent)) {
        openPanel(agent as AgentId)
      }
    },
    start
  })

  useEffect(() => {
    const el = scroller.current

    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 260) {
      el.scrollTop = el.scrollHeight
    }
  }, [session.turns, session.live])

  return (
    <div className="flex h-full min-h-0 w-[340px] shrink-0 flex-col border-l border-(--ui-stroke-tertiary)">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span className="grid size-5 place-items-center rounded-md bg-(--ui-bg-quaternary)">
          <Codicon name="sparkle" size="0.8rem" />
        </span>
        <span className="text-[0.84rem] font-medium">Hermes</span>
        <span className="truncate text-[0.72rem] text-(--ui-text-tertiary)">{repo ? repoName(repo) : 'no repository'}</span>
        <span className="flex-1" />
        <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={onClose} title="Hide chat" type="button">
          <Codicon name="close" size="0.85rem" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3" ref={scroller}>
        {session.turns.length === 0 && !session.live ? (
          <div className="mt-8 text-[0.82rem] leading-relaxed text-(--ui-text-secondary)">
            <p className={cn('font-medium text-foreground')}>One chat for every coding agent.</p>
            <p className="mt-2">Ask for a task and Hermes picks Cursor, Claude Code, OpenCode or Codex — or several — runs them in this repository and reports back. It can also open their panels for you.</p>
            <ul className="mt-3 space-y-1 text-(--ui-text-tertiary)">
              <li>“Have Claude review the auth flow, then Codex fix what it finds.”</li>
              <li>“Ask Cursor to rename the API client across the repo.”</li>
            </ul>
          </div>
        ) : null}
        <Transcript agent="hermes" busy={session.busy} live={session.live} turns={session.turns} />
      </div>
      <div className="shrink-0 px-3 pb-3">
        <Composer agent="hermes" busy={session.busy} mode="agent" onSend={t => void session.send(t)} onStop={session.stop} repoLabel={repo ? repoName(repo) : undefined} />
      </div>
    </div>
  )
}
