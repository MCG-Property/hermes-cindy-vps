import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import type { StatusbarItem } from '@/app/shell/statusbar-controls'
import { CreditCard } from '@/lib/icons'
import { $activeSessionId, $selectedStoredSessionId } from '@/store/session'
import { $statusbarHiddenIds } from '@/store/statusbar-prefs'

const POLL_MS = 5_000

export interface SpendSnapshot {
  session_usd?: number
  hour_usd?: number
  day_usd?: number
  last_request_usd?: number
  last_request_at?: string | null
  limit_usd?: number
  over_limit?: boolean
  mode?: 'free' | 'paid' | string
  reset_in_s?: number
  reset_at?: string | null
  at?: string
  history?: SpendHistoryRow[]
}

export interface SpendHistoryRow {
  at?: string
  ts?: number
  session_usd?: number
  hour_usd?: number
  day_usd?: number
  last_request_usd?: number
  mode?: string
  reset_in_s?: number
}

function money(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '$—'
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`.replace(/(\.\d{2})\d+/, '$1')
}

function formatMoney(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '$—'
  if (value === 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function formatCountdown(seconds: number | undefined, over: boolean): string {
  if (!over) return 'paid now'
  const s = Math.max(0, Math.round(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function toneClass(over: boolean, hour: number | undefined, limit: number | undefined): string {
  if (over) return 'text-destructive hover:text-destructive'
  if (hour != null && limit && hour / limit >= 0.7) return 'text-amber-600 hover:text-amber-600'
  return 'text-foreground/80 hover:text-foreground'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <span className="truncate text-(--ui-text-tertiary)">{label}</span>
      <span className="shrink-0 tabular-nums text-foreground">{value}</span>
    </div>
  )
}

export function useSpendTrackerStatusbarItem(
  requestGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>
): StatusbarItem {
  const hiddenIds = useStore($statusbarHiddenIds)
  const liveId = useStore($activeSessionId)
  const storedId = useStore($selectedStoredSessionId)
  const sessionId = storedId || liveId || ''
  const shown = !hiddenIds.includes('hourly-spend')
  const [spend, setSpend] = useState<SpendSnapshot | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!shown) return
    let cancelled = false
    let timer: number | null = null

    const poll = async () => {
      try {
        const next = (await requestGateway('spend.snapshot', { session_id: sessionId })) as SpendSnapshot
        if (!cancelled) setSpend(next)
      } catch {
        if (!cancelled) setSpend(prev => prev)
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), POLL_MS)
    }

    void poll()
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
      window.clearInterval(tick)
    }
  }, [requestGateway, sessionId, shown])

  const resetIn = useMemo(() => {
    if (!spend?.over_limit) return 0
    if (spend.reset_at) {
      const until = Date.parse(spend.reset_at) - now
      if (!Number.isNaN(until)) return Math.max(0, until / 1000)
    }
    return Math.max(0, (spend.reset_in_s || 0) - 0)
  }, [now, spend])

  const over = spend?.over_limit === true
  const hour = spend?.hour_usd
  const limit = spend?.limit_usd ?? 1
  const label = hour == null ? '$—/hr' : `${formatMoney(hour)}/${formatMoney(limit)}`
  const history = (spend?.history ?? []).slice().reverse()

  return {
    className: toneClass(over, hour, limit),
    detail: over ? formatCountdown(resetIn, true) : undefined,
    icon: <CreditCard className="size-3 opacity-80" />,
    id: 'hourly-spend',
    label,
    menuAlign: 'end',
    menuClassName: 'w-80 p-0',
    menuContent: (
      <div className="grid max-h-80 grid-cols-[minmax(0,1fr)] gap-0 text-[0.75rem]" data-slot="spend-tracker-panel">
        <div className="grid gap-2 border-b border-border/60 p-3">
          <p className="font-medium text-foreground">Spend</p>
          <Row label="This chat" value={formatMoney(spend?.session_usd)} />
          <Row label="Past hour (all chats)" value={`${formatMoney(hour)} / ${formatMoney(limit)}`} />
          <Row label="Past day (all chats)" value={formatMoney(spend?.day_usd)} />
          <Row label="Last request" value={formatMoney(spend?.last_request_usd)} />
          <Row
            label="Paid models reset"
            value={over ? formatCountdown(resetIn, true) : 'paid route active'}
          />
        </div>
        <div className="min-h-0 overflow-y-auto p-3">
          <p className="mb-2 text-[0.6875rem] font-medium text-(--ui-text-tertiary)">Last 24 hours</p>
          {history.length === 0 ? (
            <p className="text-(--ui-text-tertiary)">No spend samples yet.</p>
          ) : (
            <ol className="grid gap-1.5">
              {history.map((row, index) => (
                <li
                  className="flex min-w-0 items-baseline justify-between gap-2 text-[0.6875rem]"
                  key={`${row.at || row.ts || index}`}
                >
                  <span className="truncate text-(--ui-text-tertiary)">
                    {(row.at || '').replace('T', ' ').replace('Z', '')} · {row.mode || '—'}
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {formatMoney(row.hour_usd)}/hr · {formatMoney(row.last_request_usd)} req
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    ),
    title: over
      ? `Free fallback · paid models in ${formatCountdown(resetIn, true)}`
      : `Hourly spend ${label} · click for session, day, last request, and 24h history`,
    toggleLabel: 'Spend',
    variant: 'menu'
  }
}

export { formatCountdown, formatMoney, money }
