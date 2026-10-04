import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { atom } from 'nanostores'
import type * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/hermes'
import { createClientSessionState } from '@/lib/chat-runtime'
import type * as ChatRuntime from '@/lib/chat-runtime'
import { formatSydneyStamp } from '@/lib/time'
import type * as Time from '@/lib/time'
import type * as ComposerStatusStore from '@/store/composer-status'
import type * as SessionStore from '@/store/session'
import { clearAllSessionStates, publishSessionState } from '@/store/session-states'
import type * as SessionStatesStore from '@/store/session-states'
import type * as WindowsStore from '@/store/windows'

import { SidebarSessionRow } from './session-row'

afterEach(cleanup)

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      sidebar: {
        messageCount: (count: number) => `${count} messages`,
        toolCallCount: (count: number) => `${count} tool calls`,
        projects: {
          home: 'Home'
        },
        row: {
          ageMin: 'm',
          ageNow: 'now',
          backgroundRunning: 'Running in background',
          finishedUnread: 'Finished',
          handoffOrigin: (platform: string) => `Started on ${platform}`,
          continuationOrigin: 'Automatic continuation — this conversation was compressed and continued',
          messageCount: (count: number) => `${count} messages`,
          needsInput: 'Needs input',
          sessionActions: 'Session actions',
          sessionRunning: 'Running',
          todoProgress: 'Tasks completed',
          waitingForAnswer: 'Waiting for answer'
        }
      },
      assistant: {
        thread: {
          today: (time: string) => `Today at ${time}`,
          yesterday: (time: string) => `Yesterday at ${time}`
        }
      }
    }
  })
}))

vi.mock('@/app/chat/profile-tag', () => ({ ProfileTag: () => null }))
vi.mock('@/app/chat/session-drag', () => ({ startSessionDrag: vi.fn() }))
// PlatformAvatar is intentionally NOT mocked (do not reintroduce this — see
// #67500, Gille's third pass): it's a forwardRef component that spreads its
// props onto the rendered span, and mocking it with a stand-in that spreads
// props itself only proves the MOCK forwards them, not that the real
// component does. This file exercises the actual production component so a
// regression in its ref/prop forwarding fails here again.
// Only `sessionTitle` is overridden (makeSession fakes a bare `title` the real
// one wouldn't read); the rest of the module is genuine so the arc test can
// build session state with the same factory the app uses.
const sessionTitle = vi.fn((s: SessionInfo) => (s as unknown as { title: string }).title)

vi.mock('@/lib/chat-runtime', async importOriginal => {
  const actual = await importOriginal<typeof ChatRuntime>()

  return { ...actual, sessionTitle: (s: SessionInfo) => sessionTitle(s) }
})
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))
vi.mock('@/lib/session-source', () => ({
  handoffOriginSource: (state?: string, platform?: string) => (state && platform ? platform : null),
  sessionSourceLabel: (source: string) => source
}))
vi.mock('@/lib/time', async importOriginal => {
  const actual = await importOriginal<typeof Time>()

  return { ...actual, coarseElapsed: () => ({ unit: 'minute' as const, value: 5 }) }
})

// These mocks use importOriginal rather than replacing the module wholesale:
// session-row.tsx (and its transitive imports, e.g. session-color.ts) reads
// several store exports beyond the ones this file cares about, and that set
// keeps growing as the app evolves upstream. A wholesale replacement mock
// silently turns every export it doesn't list into `undefined`, which then
// crashes nanostores' `computed()` the moment a new dependency is added
// upstream (as happened twice already: $stalledSessionIds, then $sessions).
// Overriding only the named atoms we actually control keeps this test
// resilient to that drift.
vi.mock('@/store/composer-status', async importOriginal => {
  const actual = await importOriginal<typeof ComposerStatusStore>()

  return { ...actual, $backgroundRunningSessionIds: atom<string[]>([]) }
})
vi.mock('@/store/session', async importOriginal => {
  const actual = await importOriginal<typeof SessionStore>()

  return { ...actual, $unreadFinishedSessionIds: atom<string[]>([]) }
})
vi.mock('@/store/session-states', async importOriginal => {
  const actual = await importOriginal<typeof SessionStatesStore>()

  return {
    ...actual,
    $attentionSessionIds: atom<string[]>([]),
    $stalledSessionIds: atom<string[]>([]),
    openSessionTile: vi.fn()
  }
})
vi.mock('@/store/windows', async importOriginal => {
  const actual = await importOriginal<typeof WindowsStore>()

  return {
    ...actual,
    canOpenSessionWindow: () => false,
    openSessionInNewWindow: vi.fn()
  }
})

// SessionActionsMenu open behavior is covered in session-actions-menu.test.tsx
// against the real component. Stub it here so this file stays focused on the
// row chrome (handoff avatar tip, etc.) — but record the props so the row's
// own state plumbing (e.g. the archived flag, #98813) is still asserted.
const menuProps = vi.hoisted(() => vi.fn())

vi.mock('./session-actions-menu', () => ({
  SessionActionsMenu: (props: { children?: React.ReactNode }) => {
    menuProps(props)

    return <>{props.children}</>
  },
  SessionContextMenu: (props: { children?: React.ReactNode }) => {
    menuProps(props)

    return <>{props.children}</>
  }
}))

vi.mock('./use-profile-prewarm', () => ({
  useProfilePrewarm: () => ({ cancelPrewarm: vi.fn(), notePointerMove: vi.fn(), startPrewarm: vi.fn() })
}))

function makeSession(overrides: Partial<SessionInfo> & { title: string }): SessionInfo {
  return {
    handoff_platform: null,
    handoff_state: null,
    id: 's1',
    last_active: 0,
    profile: 'default',
    started_at: 0,
    ...overrides
  } as unknown as SessionInfo
}

const noop = vi.fn()

const renderRow = (session: SessionInfo, extra?: { card?: boolean }) =>
  render(
    <SidebarSessionRow
      card={extra?.card}
      isPinned={false}
      isSelected={false}
      onArchive={noop}
      onDelete={noop}
      onPin={noop}
      onResume={noop}
      onToggleUnread={noop}
      session={session}
      unread={false}
    />
  )

// The row no longer takes its running state as a prop, so this drives the real
// store the way the app does. $workingSessionIds is the actual computed here
// (the mock above only overrides its siblings), which is what makes this cover
// the wiring rather than the predicate — the arc has gone missing before.
describe('SidebarSessionRow running arc', () => {
  afterEach(() => {
    clearAllSessionStates()
  })

  const arc = (container: HTMLElement) => container.querySelector('.arc-row')

  it('paints no arc for a settled session', () => {
    const { container } = renderRow(makeSession({ title: 'Settled' }))

    expect(arc(container)).toBeNull()
  })

  it('paints the arc while the session is running', () => {
    publishSessionState('rt1', { ...createClientSessionState('s1'), busy: true })

    const { container } = renderRow(makeSession({ title: 'Running' }))

    expect(arc(container)).toBeTruthy()
  })
})

describe('SidebarSessionRow', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // Full-title tooltip on hover (#83000-class ask): the label is a tooltip
  // trigger, but the tip only opens when the title is actually truncated.
  describe('full-title overflow tooltip', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    const title = 'A very long session title that the sidebar cannot possibly fit'

    /** The rendered title label (tooltip trigger is the label itself). */
    const label = () => screen.getByText(title).closest('[data-slot="tooltip-trigger"]') as HTMLElement

    const setWidths = (el: HTMLElement, scrollWidth: number, clientWidth: number) => {
      Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth })
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth })
    }

    it('opens with the full title after a settled hover when the title overflows', () => {
      vi.useFakeTimers()
      renderRow(makeSession({ title }))

      const el = label()
      setWidths(el, 300, 100)

      act(() => {
        fireEvent.pointerEnter(el)
        vi.advanceTimersByTime(700)
      })

      expect(screen.getByRole('tooltip').textContent).toContain(title)
    })

    it('stays closed when the title fits', () => {
      vi.useFakeTimers()
      renderRow(makeSession({ title }))

      const el = label()
      setWidths(el, 100, 100)

      act(() => {
        fireEvent.pointerEnter(el)
        vi.advanceTimersByTime(700)
      })

      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('cancels a pending open when the pointer leaves before the delay', () => {
      vi.useFakeTimers()
      renderRow(makeSession({ title }))

      const el = label()
      setWidths(el, 300, 100)

      act(() => {
        fireEvent.pointerEnter(el)
        vi.advanceTimersByTime(200)
        fireEvent.pointerLeave(el)
        vi.advanceTimersByTime(700)
      })

      expect(screen.queryByRole('tooltip')).toBeNull()
    })
  })

  // The Archived view reuses the row menu, and the menu needs the row's
  // archived state to label its shared verb Unarchive (#98813).
  it('forwards the archived state to the row menu', () => {
    menuProps.mockClear()
    renderRow(makeSession({ archived: true, title: 'Archived row' }))

    expect(menuProps).toHaveBeenCalledWith(expect.objectContaining({ archived: true }))
  })

  it('forwards the non-archived state to the row menu', () => {
    menuProps.mockClear()
    renderRow(makeSession({ title: 'Live row' }))

    expect(menuProps).toHaveBeenCalledWith(expect.objectContaining({ archived: false }))
  })

  it('exposes the exact session time through a focusable Tip trigger', () => {
    // Pin the clock before deriving the timestamp: "5 minutes ago" only falls on
    // today when the run does not straddle local midnight. Only `Date` is faked,
    // so the component's own timers keep running for real.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 5, 12, 0, 0))

    const startedAt = Math.floor(Date.now() / 1000) - 5 * 60

    renderRow(makeSession({ started_at: startedAt, title: 'Timestamped session' }))

    const stamp = formatSydneyStamp(startedAt * 1000)
    const age = screen.getByText(stamp)
    expect(age.tagName).toBe('TIME')
    expect(age.getAttribute('datetime')).toBe(new Date(startedAt * 1000).toISOString())
    expect(age.getAttribute('aria-label')).toMatch(new RegExp(`^${stamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, `))
    expect(age.getAttribute('tabindex')).toBe('0')
    expect(age.getAttribute('title')).toBeNull()
  })
})
