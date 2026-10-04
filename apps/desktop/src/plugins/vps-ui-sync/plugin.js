/**
 * Pull VPS desktop-plugins onto this Mac while Desktop is connected.
 * Install once at ~/.hermes/desktop-plugins/vps-ui-sync/plugin.js
 */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  host,
  STATUSBAR_AREAS
} from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'vps-ui-sync'
const POLL_MS = 15_000
const SHA_PREFIX = 'hermes.vps-ui-sync.sha.'

const CSS = `
.hermes-uisync-chip{display:inline-flex;align-items:center;gap:5px;height:100%;padding:0 6px;border:0;background:transparent;color:var(--ui-accent);font-size:11px;line-height:1;cursor:pointer}
.hermes-uisync-chip:hover{background:var(--chrome-action-hover);color:var(--ui-accent)}
.hermes-uisync-panel{width:18rem;max-width:calc(100vw - 24px);padding:12px;display:grid;gap:8px;font-size:12px}
.hermes-uisync-panel p{margin:0;color:var(--ui-text-secondary)}
.hermes-uisync-panel strong{color:var(--ui-text-primary)}
.hermes-uisync-list{margin:0;padding:0;list-style:none;display:grid;gap:4px;max-height:12rem;overflow-y:auto}
.hermes-uisync-list li{display:flex;justify-content:space-between;gap:8px;color:var(--ui-text-tertiary);font-size:11px}
`

function shaKey(id) {
  return `${SHA_PREFIX}${id}`
}

async function syncFromVps() {
  const desktop = typeof window !== 'undefined' ? window.hermesDesktop : null
  if (!desktop?.desktopPluginsRoot || !desktop.writeTextFile) {
    return { ok: false, error: 'local plugin writes unavailable', wrote: [], skipped: [] }
  }
  const listed = await host.request('desktop.plugin.list', {})
  const plugins = Array.isArray(listed?.plugins) ? listed.plugins : []
  const root = String((await desktop.desktopPluginsRoot()) || '').replace(/\/$/, '')
  if (!root) return { ok: false, error: 'plugin root missing', wrote: [], skipped: [] }
  const wrote = []
  const skipped = []
  for (const item of plugins) {
    const id = item?.id
    const sha = item?.sha256
    if (!id || !sha) continue
    try {
      if (window.localStorage.getItem(shaKey(id)) === sha) {
        skipped.push(id)
        continue
      }
    } catch {
      // compare anyway
    }
    const src = await host.request('desktop.plugin.source', { id })
    if (!src?.content || src.sha256 !== sha) {
      skipped.push(id)
      continue
    }
    const path = `${root}/${id}/plugin.js`
    try {
      await desktop.writeTextFile(path, src.content)
      try {
        window.localStorage.setItem(shaKey(id), sha)
      } catch {
        // ignore
      }
      wrote.push(id)
    } catch {
      skipped.push(`${id} (folder missing on Mac)`)
    }
  }
  return { ok: true, wrote, skipped, count: plugins.length }
}

function SyncChip() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('waiting')
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    let cancelled = false
    let timer = 0
    const tick = async () => {
      try {
        const result = await syncFromVps()
        if (!cancelled) {
          setDetail(result)
          setStatus(result.ok ? (result.wrote?.length ? 'pulled' : 'idle') : 'error')
        }
      } catch (error) {
        if (!cancelled) {
          setStatus('error')
          setDetail({ error: error instanceof Error ? error.message : String(error) })
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), POLL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  const label = status === 'pulled' ? 'UI pulled' : status === 'error' ? 'UI sync err' : 'UI sync'
  const wrote = detail?.wrote || []
  const skipped = detail?.skipped || []

  return jsxs(DropdownMenu, {
    modal: false,
    open,
    onOpenChange: setOpen,
    children: [
      jsx(DropdownMenuTrigger, {
        asChild: true,
        children: jsx('button', {
          type: 'button',
          className: 'hermes-uisync-chip',
          title: 'Pulls VPS desktop-plugins into this Mac folder while connected',
          children: label
        })
      }),
      jsx(DropdownMenuContent, {
        side: 'top',
        align: 'end',
        sideOffset: 8,
        className: 'p-0',
        children: jsxs('div', {
          className: 'hermes-uisync-panel',
          children: [
            jsx('p', { children: jsx('strong', { children: 'VPS → Mac plugins' }) }),
            jsx('p', {
              children:
                status === 'error'
                  ? detail?.error || 'sync failed'
                  : `Last pass: ${wrote.length} updated, ${skipped.length} unchanged or blocked.`
            }),
            wrote.length
              ? jsx('ol', {
                  className: 'hermes-uisync-list',
                  children: wrote.map(id => jsx('li', { children: id }, id))
                })
              : null
          ]
        })
      })
    ]
  })
}

export default {
  id: ID,
  name: 'VPS UI sync',
  description: 'Pull VPS desktop-plugins onto this Mac over the live gateway.',
  defaultEnabled: true,
  register(ctx) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    const timer = window.setInterval(() => void syncFromVps(), POLL_MS)
    ctx.onDispose(() => {
      style.remove()
      window.clearInterval(timer)
    })
    ctx.register({
      id: 'vps-ui-sync',
      area: STATUSBAR_AREAS.right,
      order: 95,
      render: () => jsx(SyncChip, {})
    })
  }
}
