import { Fragment, memo, type ReactNode, useState } from 'react'

import { openAgentTerminal } from '@/app/right-sidebar/terminal/terminals'
import { StatusPendingIcon } from '@/components/chat/status-pending-icon'
import { StatusRow } from '@/components/chat/status-row'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { Tip } from '@/components/ui/tooltip'
import { type Translations, useI18n } from '@/i18n'
import { capitalize } from '@/lib/text'
import type { TodoStatus } from '@/lib/todos'
import { cn } from '@/lib/utils'
import type { ComposerStatusItem } from '@/store/composer-status'
import { $gateway } from '@/store/gateway'

const toolLabel = (name: string) => name.split('_').filter(Boolean).map(capitalize).join(' ') || name

// Todo rows speak checkbox, not spinner-and-dot: a dashed ring while the item
// is still open (pending), codicons once it resolves, a live spinner only on
// the in-progress item.
const TODO_GLYPHS: Record<Exclude<TodoStatus, 'in_progress' | 'pending'>, { icon: string; tone: string }> = {
  cancelled: { icon: 'circle-slash', tone: 'text-muted-foreground/45' },
  completed: { icon: 'pass-filled', tone: 'text-emerald-500/80' }
}

// Left slot: braille spinner while running, otherwise a small status dot
// (green = done, red = failed) so the slot is always filled and rows align.
function leadingGlyph(item: ComposerStatusItem, s: Translations['statusStack'], historical = false): ReactNode {
  if (item.type === 'goal') {
    if (item.goalStatus === 'paused') {
      return <Codicon className="text-muted-foreground/60" name="debug-pause" size="0.8rem" />
    }

    if (item.goalStatus === 'done') {
      return <Codicon className="text-emerald-500/80" name="pass-filled" size="0.8rem" />
    }

    return (
      <GlyphSpinner
        ariaLabel={s.running}
        className="text-[0.85rem] leading-none text-emerald-500/80"
        spinner="braille"
      />
    )
  }

  if (item.todoStatus === 'pending' || (historical && item.todoStatus === 'in_progress')) {
    return <StatusPendingIcon />
  }

  if (item.todoStatus && item.todoStatus !== 'in_progress') {
    const glyph = TODO_GLYPHS[item.todoStatus]

    return <Codicon className={glyph.tone} name={glyph.icon} size="0.8rem" />
  }

  if (item.state === 'running') {
    return (
      <GlyphSpinner
        ariaLabel={s.running}
        className="text-[0.85rem] leading-none text-muted-foreground/80"
        spinner="braille"
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn('size-1.5 rounded-full', item.state === 'failed' ? 'bg-destructive/80' : 'bg-emerald-500/70')}
    />
  )
}

interface StatusItemRowProps {
  item: ComposerStatusItem
  /** Render a retained, non-running task snapshot. */
  historical?: boolean
  /** Clear a finished background task from the stack. */
  onDismiss?: (id: string) => void
  /** Open the subagent's own session window, livestreamed by the gateway's
   *  child-session mirror (Agents view fallback for older gateways). */
  onOpen?: () => void
  /** Cancel a running background task. */
  onStop?: (id: string) => void
  sessionId?: null | string
}

/**
 * Renders one {@link ComposerStatusItem} into the shared {@link StatusRow}.
 * Memoised + keyed by id so parent re-renders never remount it (the spinner
 * keeps ticking instead of resetting).
 */
export const StatusItemRow = memo(function StatusItemRow({
  historical = false,
  item,
  onDismiss,
  onOpen,
  onStop,
  sessionId
}: StatusItemRowProps) {
  const { t } = useI18n()
  const s = t.statusStack
  const failed = item.state === 'failed'
  const running = item.state === 'running'
  const todoKey = item.type === 'todo' ? item.id.replace(/^todo:/, '') : ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)

  const action =
    item.type === 'background'
      ? running
        ? onStop && { label: s.stop, onClick: () => onStop(item.id) }
        : onDismiss && { label: s.dismiss, onClick: () => onDismiss(item.id) }
      : null

  const saveTodo = () => {
    const content = draft.trim()
    setEditing(false)

    if (!sessionId || !todoKey || !content || content === item.title) {
      setDraft(item.title)

      return
    }

    void $gateway.get()?.request('todo.update', { session_id: sessionId, id: todoKey, content })
  }

  const removeTodo = () => {
    if (!sessionId || !todoKey) {
      return
    }

    void $gateway.get()?.request('todo.delete', { session_id: sessionId, id: todoKey })
  }

  const canOpen = item.type === 'subagent' && !!onOpen

  // Background rows link to their read-only terminal tab; subagents open their session.
  const onActivate =
    item.type === 'background' ? () => openAgentTerminal(item.id, item.title) : canOpen ? onOpen : undefined

  return (
    <Fragment>
      <StatusRow
        depth={Math.min(item.depth ?? 0, 4)}
        dismiss={action ? { label: action.label, onDismiss: action.onClick } : undefined}
        leading={leadingGlyph(item, s, historical)}
        onActivate={onActivate}
        trailing={
          item.type === 'todo' ? (
            <span className="flex items-center gap-0.5">
              <Tip label="Edit task">
                <Button
                  aria-label="Edit task"
                  className="-my-1 size-4 rounded-md text-muted-foreground/60 hover:text-foreground/90"
                  onClick={event => {
                    event.stopPropagation()
                    setDraft(item.title)
                    setEditing(true)
                  }}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Codicon name="edit" size="0.75rem" />
                </Button>
              </Tip>
              <Tip label="Remove task">
                <Button
                  aria-label="Remove task"
                  className="-my-1 size-4 rounded-md text-muted-foreground/60 hover:text-foreground/90"
                  onClick={event => {
                    event.stopPropagation()
                    removeTodo()
                  }}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Codicon name="close" size="0.75rem" />
                </Button>
              </Tip>
            </span>
          ) : action ? (
            <Tip label={action.label}>
              <Button
                aria-label={action.label}
                className="-my-1 size-4 rounded-md text-muted-foreground/60 hover:text-foreground/90"
                onClick={event => {
                  event.stopPropagation()
                  action.onClick()
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Codicon name="close" size="0.75rem" />
              </Button>
            </Tip>
          ) : canOpen ? (
            <Codicon aria-hidden className="text-muted-foreground/55" name="link-external" size="0.85rem" />
          ) : undefined
        }
        trailingVisible={item.type === 'todo' || Boolean(action)}
      >
        {item.type === 'todo' && editing ? (
          <input
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-[0.73rem] leading-4 text-foreground outline-none focus:border-(--ui-stroke-tertiary)"
            onBlur={saveTodo}
            onChange={event => setDraft(event.target.value)}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
              if (event.key === 'Enter') {saveTodo()}

              if (event.key === 'Escape') {
                setDraft(item.title)
                setEditing(false)
              }
            }}
            value={draft}
          />
        ) : (
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[0.73rem] leading-4',
            failed
              ? 'text-destructive/90'
              : item.todoStatus && item.todoStatus !== 'in_progress'
                ? 'text-muted-foreground/75'
                : 'text-foreground/92'
          )}
        >
          {item.title}
        </span>
        )}
        {item.type === 'subagent' && item.currentTool && (
          <span className="shrink-0 truncate text-[0.62rem] leading-4 text-muted-foreground/70">
            {toolLabel(item.currentTool)}
          </span>
        )}
        {item.type === 'goal' && item.currentTool && (
          <span className="shrink-0 truncate text-[0.62rem] leading-4 text-muted-foreground/70">
            {item.currentTool}
          </span>
        )}
        {failed && typeof item.exitCode === 'number' && item.exitCode !== 0 && (
          <span className="shrink-0 rounded bg-destructive/15 px-1 text-[0.58rem] font-semibold text-destructive tabular-nums">
            {s.exit(item.exitCode)}
          </span>
        )}
      </StatusRow>
    </Fragment>
  )
})
