import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { StatusbarControls } from '@/app/shell/statusbar-controls'
import { $activeSessionId } from '@/store/session'
import { stubMenuDomApis, stubResizeObserver } from '@/test/jsdom'

import { formatCountdown, formatMoney, useSpendTrackerStatusbarItem } from './spend-tracker-statusbar'

beforeAll(() => {
  stubResizeObserver()
  stubMenuDomApis()
})

afterEach(() => {
  cleanup()
  $activeSessionId.set('')
})

function Harness({
  requestGateway
}: {
  requestGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>
}) {
  const item = useSpendTrackerStatusbarItem(requestGateway)
  return (
    <MemoryRouter>
      <StatusbarControls items={[item]} />
    </MemoryRouter>
  )
}

describe('spend tracker statusbar item', () => {
  it('formats money and countdown', () => {
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(1.234)).toBe('$1.23')
    expect(formatCountdown(125, true)).toBe('02:05')
    expect(formatCountdown(0, false)).toBe('paid now')
  })

  it('opens a drop-up with session, hour, day, last request, reset, and history', async () => {
    const requestGateway = vi.fn(async () => ({
      session_usd: 0.41,
      hour_usd: 5.79,
      day_usd: 6.12,
      last_request_usd: 0.03,
      limit_usd: 1,
      over_limit: true,
      mode: 'free',
      reset_in_s: 125,
      reset_at: null,
      history: [
        { at: '2026-09-13T18:00:00Z', hour_usd: 4.1, last_request_usd: 0.02, mode: 'free' },
        { at: '2026-09-13T19:00:00Z', hour_usd: 5.79, last_request_usd: 0.03, mode: 'free' }
      ]
    }))
    $activeSessionId.set('chat-1')
    render(<Harness requestGateway={requestGateway} />)

    await waitFor(() => {
      expect(requestGateway).toHaveBeenCalledWith('spend.snapshot', { session_id: 'chat-1' })
    })

    const statusbar = screen.getByRole('contentinfo')
    const trigger = within(statusbar).getByRole('button')
    fireEvent.pointerDown(trigger, { button: 0 })

    expect(await screen.findByText('This chat')).toBeTruthy()
    expect(screen.getByText('Past hour (all chats)')).toBeTruthy()
    expect(screen.getByText('Past day (all chats)')).toBeTruthy()
    expect(screen.getByText('Last request')).toBeTruthy()
    expect(screen.getByText('Paid models reset')).toBeTruthy()
    expect(screen.getByText('Last 24 hours')).toBeTruthy()
    expect(screen.getByText(/5\.79/)).toBeTruthy()
  })
})
