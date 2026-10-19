/**
 * Spend tracker for the Desktop status bar.
 * Replace this file on the Mac at ~/.hermes/desktop-plugins/spend-tracker/plugin.js
 * then Command Palette → Reload desktop plugins.
 */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  host,
  STATUSBAR_AREAS
} from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'spend-tracker'
const POLL_MS = 5000

const CSS = `
.hermes-spend-chip{display:inline-flex;align-items:center;gap:5px;height:100%;padding:0 6px;border:0;background:transparent;color:var(--ui-text-secondary);font-size:11px;line-height:1;cursor:pointer}
.hermes-spend-chip:hover{background:var(--chrome-action-hover);color:var(--ui-text-primary)}
.hermes-spend-chip[data-tone=over]{color:var(--ui-danger, var(--destructive))}
.hermes-spend-chip[data-tone=warn]{color:#d97706}
.hermes-spend-num{font-variant-numeric:tabular-nums}
.hermes-spend-panel{width:20rem;max-width:calc(100vw - 24px);display:flex;flex-direction:column;max-height:min(24rem,70vh);font-size:12px}
.hermes-spend-head{display:grid;gap:8px;padding:12px;border-bottom:1px solid var(--ui-stroke-secondary, rgba(127,127,127,.25));flex:0 0 auto}
.hermes-spend-title{margin:0;font-weight:600;color:var(--ui-text-primary)}
.hermes-spend-row{display:flex;justify-content:space-between;gap:12px;min-width:0}
.hermes-spend-row span:first-child{color:var(--ui-text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hermes-spend-row span:last-child{color:var(--ui-text-primary);font-variant-numeric:tabular-nums;flex-shrink:0}
.hermes-spend-hist{flex:1 1 auto;min-height:10rem;max-height:16rem;overflow-y:auto;padding:12px}
.hermes-spend-hist p{margin:0 0 8px;font-size:11px;font-weight:600;color:var(--ui-text-tertiary)}
.hermes-spend-hist ol{margin:0;padding:0;list-style:none;display:grid;gap:6px}
.hermes-spend-hist li{display:flex;justify-content:space-between;gap:8px;font-size:11px;min-width:0}
.hermes-spend-hist li span:first-child{color:var(--ui-text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hermes-spend-hist li span:last-child{color:var(--ui-text-primary);font-variant-numeric:tabular-nums;flex-shrink:0}
`

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return '$—'
  const n = Number(value)
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function countdown(seconds, over) {
  if (!over) return 'paid now'
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function toneOf(spend) {
  if (spend?.over_limit) return 'over'
  const hour = Number(spend?.hour_usd)
  const limit = Number(spend?.limit_usd) || 1
  if (Number.isFinite(hour) && hour / limit >= 0.7) return 'warn'
  return 'ok'
}

function Row({ label, value }) {
  return jsxs('div', { className: 'hermes-spend-row', children: [jsx('span', { children: label }), jsx('span', { children: value })] })
}

function SpendChip() {
  const [spend, setSpend] = useState(null)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    let timer = 0
    const poll = async () => {
      try {
        const next = await host.request('spend.snapshot', { session_id: '' })
        if (!cancelled) setSpend(next || null)
        await pullFromVps()
      } catch {
        if (!cancelled) setSpend(prev => prev)
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), POLL_MS)
    }
    void poll()
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearInterval(tick)
    }
  }, [])

  const over = spend?.over_limit === true
  const hour = spend?.hour_usd
  const limit = spend?.limit_usd ?? 1
  let resetIn = 0
  if (over) {
    if (spend?.reset_at) {
      const until = Date.parse(spend.reset_at) - now
      resetIn = Number.isNaN(until) ? spend.reset_in_s || 0 : Math.max(0, until / 1000)
    } else {
      resetIn = spend?.reset_in_s || 0
    }
  }
  const label = hour == null ? '$—/hr' : `${money(hour)}/${money(limit)}`
  const history = Array.isArray(spend?.history) ? spend.history.slice().reverse() : []
  const tone = toneOf(spend)
  const title = over
    ? `Free fallback · paid models in ${countdown(resetIn, true)}`
    : `Hourly spend ${label} · click for session, day, last request, and 24h history`

  return jsxs(DropdownMenu, {
    modal: false,
    open,
    onOpenChange: setOpen,
    children: [
      jsx(DropdownMenuTrigger, {
        asChild: true,
        children: jsxs('button', {
          type: 'button',
          className: 'hermes-spend-chip',
          'data-tone': tone,
          'data-slot': 'hourly-spend',
          title,
          children: [
            jsx('span', { 'aria-hidden': true, children: '💳' }),
            jsx('span', { className: 'hermes-spend-num', children: label }),
            over ? jsx('span', { className: 'hermes-spend-num', children: countdown(resetIn, true) }) : null
          ]
        })
      }),
      jsx(DropdownMenuContent, {
        side: 'top',
        align: 'end',
        sideOffset: 8,
        className: 'w-80 p-0',
        'aria-label': 'Spend',
        children: jsxs('div', {
          className: 'hermes-spend-panel',
          children: [
            jsxs('div', {
              className: 'hermes-spend-head',
              children: [
                jsx('p', { className: 'hermes-spend-title', children: 'Spend' }),
                jsx(Row, { label: 'This chat', value: money(spend?.session_usd) }),
                jsx(Row, { label: 'Past hour (all chats)', value: `${money(hour)} / ${money(limit)}` }),
                jsx(Row, { label: 'Past day (all chats)', value: money(spend?.day_usd) }),
                jsx(Row, { label: 'Last request', value: money(spend?.last_request_usd) }),
                jsx(Row, {
                  label: 'Paid models reset',
                  value: over ? countdown(resetIn, true) : 'paid route active'
                })
              ]
            }),
            jsxs('div', {
              className: 'hermes-spend-hist',
              children: [
                jsx('p', { children: 'Last 24 hours' }),
                history.length === 0
                  ? jsx('div', { children: 'No spend samples yet.' })
                  : jsx('ol', {
                      children: history.map((row, index) =>
                        jsxs(
                          'li',
                          {
                            children: [
                              jsx('span', {
                                children: `${String(row.at || '').replace('T', ' ').replace('Z', '')} · ${
                                  row.mode || '—'
                                }`
                              }),
                              jsx('span', {
                                children: `${money(row.hour_usd)}/hr · ${money(row.last_request_usd)} req`
                              })
                            ]
                          },
                          row.at || row.ts || index
                        )
                      )
                    })
              ]
            })
          ]
        })
      })
    ]
  })
}

const SHA_KEY = 'hermes.plugin.spend-tracker.sha256'
const RESCUE_IDS = [ID, 'vps-ui-sync', 'task-list']
const forcedWrite = new Set()

async function pullPlugin(desktop, root, id) {
  let src
  try {
    src = await host.request('desktop.plugin.source', { id })
  } catch {
    return
  }
  const next = src?.content
  const sha = src?.sha256
  if (!next || !sha) return
  const storageKey = id === ID ? SHA_KEY : `hermes.vps-ui-sync.sha.${id}`
  const force = id === 'vps-ui-sync' && !next.includes('probe') && !forcedWrite.has(id)
  try {
    if (!force && window.localStorage.getItem(storageKey) === sha) return
  } catch {
    // write anyway
  }
  const path = `${String(root).replace(/\/$/, '')}/${id}/plugin.js`
  try {
    await desktop.writeTextFile(path, next)
    if (force) forcedWrite.add(id)
    window.localStorage.setItem(storageKey, sha)
  } catch {
    // folder missing on Mac
  }
}

async function pullFromVps() {
  const desktop = typeof window !== 'undefined' ? window.hermesDesktop : null
  if (!desktop?.desktopPluginsRoot || !desktop.writeTextFile) return
  const root = await desktop.desktopPluginsRoot()
  if (!root) return
  for (const id of RESCUE_IDS) await pullPlugin(desktop, String(root).replace(/\/$/, ''), id)
}

export default {
  id: ID,
  name: 'Spend tracker',
  description: 'Status-bar spend next to permissions: session, hour, day, last request, reset, 24h history.',
  defaultEnabled: true,
  register(ctx) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    const timer = window.setInterval(() => void pullFromVps(), POLL_MS)
    ctx.onDispose(() => {
      style.remove()
      window.clearInterval(timer)
    })
    ctx.register({
      id: 'hourly-spend',
      area: STATUSBAR_AREAS.right,
      order: 90,
      render: () => jsx(SpendChip, {})
    })
    registerTaskListFromSpend(ctx)
    registerMessagingFromSpend(ctx)
    void pullFromVps()
  }
}

const QUEUE_FLAG = '__hermesQueueEditCapture'

function findQueuedEditSave() {
  for (const button of document.querySelectorAll('button')) {
    if ((button.textContent || '').trim() !== 'Save') continue
    const banner = (button.closest('div')?.parentElement?.textContent || '')
    if (/edit(ing)? queued/i.test(banner)) return button
  }
  return null
}

function composerEditor() {
  return (
    document.querySelector('[data-slot="composer-root"] [contenteditable="true"]') ||
    document.querySelector('[contenteditable="true"]')
  )
}

function composerIsEmpty() {
  const editor = composerEditor()
  return !editor || !(editor.textContent || '').trim()
}

function findStopButton() {
  for (const button of document.querySelectorAll('button')) {
    const label = (button.getAttribute('aria-label') || button.textContent || '').trim().toLowerCase()
    if (label === 'stop') return button
  }
  return null
}

function isTaskListKeyEvent(event) {
  const nodes = [event?.target, typeof document !== 'undefined' ? document.activeElement : null]
  for (const el of nodes) {
    if (!el || typeof el.closest !== 'function') continue
    if (
      el.closest('[data-slot="hermes-task-list"]') ||
      el.closest('[data-hermes-task-input]') ||
      el.classList?.contains('hermes-tasks-input')
    ) {
      return true
    }
  }
  return false
}

function QueueCapture() {
  useEffect(() => {
    const onKey = event => {
      if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing) return
      if (isTaskListKeyEvent(event)) return
      const save = findQueuedEditSave()
      if (save) {
        event.preventDefault()
        event.stopImmediatePropagation()
        save.click()
        return
      }
      if (!event.metaKey && !event.ctrlKey && composerIsEmpty() && findStopButton()) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])
  return null
}

const TASK_FLAG = '__hermesTaskListBar'
const TASK_OPEN = 'hermes-task-list-open'
const TASK_POLL_MS = 2000
const TASK_CSS = `
.hermes-tasks{display:flex;flex-direction:column;gap:2px;padding:2px 0 4px;max-height:min(36vh,18rem);overflow-y:auto;width:100%;box-sizing:border-box;border-bottom:1px solid color-mix(in srgb,var(--ui-stroke-secondary, rgba(127,127,127,.25)) 80%,transparent)}
.hermes-tasks[data-min="1"]{flex-direction:row;align-items:center;max-height:none;overflow:hidden;padding:1px 0 2px;gap:4px;border-bottom:1px solid color-mix(in srgb,var(--ui-stroke-secondary, rgba(127,127,127,.25)) 55%,transparent)}
.hermes-tasks-head{display:flex;align-items:center;gap:4px;min-width:0;width:100%}
.hermes-tasks-toggle{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:1.35rem;height:1.35rem;padding:0;border:0;border-radius:6px;background:transparent;color:var(--ui-text-tertiary);cursor:pointer;font-size:12px;line-height:1}
.hermes-tasks-toggle:hover{background:var(--chrome-action-hover);color:var(--ui-text-primary)}
.hermes-tasks-title{margin:0;flex:1 1 auto;min-width:0;padding:0;border:0;background:transparent;color:var(--ui-text-secondary);font-size:11px;font-weight:500;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hermes-tasks-title:hover{color:var(--ui-text-primary)}
.hermes-tasks-btn{display:inline-flex;align-items:center;justify-content:center;width:1.35rem;height:1.35rem;padding:0;border:0;border-radius:6px;background:transparent;color:var(--ui-text-tertiary);cursor:pointer;font-size:14px;line-height:1}
.hermes-tasks-btn:hover{background:var(--chrome-action-hover);color:var(--ui-text-primary)}
.hermes-tasks-btn[data-kind=danger]:hover{color:var(--ui-danger, var(--destructive))}
.hermes-tasks-body{display:flex;flex-direction:column;gap:2px;padding:0 0 0 1.35rem}
.hermes-tasks-row{display:flex;align-items:center;gap:4px;min-width:0}
.hermes-tasks-text{flex:1 1 auto;min-width:0;border:0;background:transparent;color:var(--ui-text-primary);font-size:12px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;cursor:text}
.hermes-tasks-text[data-status=pending_review]{color:var(--ui-accent)}
.hermes-tasks-text[data-status=blocked]{color:var(--ui-danger, var(--destructive))}
.hermes-tasks-text[data-status=queued]{color:var(--ui-text-secondary);font-style:italic}
.hermes-tasks-input{flex:1 1 auto;min-width:0;height:1.5rem;padding:2px 6px;border:1px solid color-mix(in srgb,var(--ui-accent) 35%,transparent);border-radius:6px;background:transparent;color:var(--ui-text-primary);font-size:12px;resize:none;line-height:1.25}
.hermes-tasks-hint{margin:0;padding:0 2px;font-size:10px;color:var(--ui-text-tertiary)}
`

function readAtom(atom) {
  try {
    if (!atom) return ''
    if (typeof atom.get === 'function') {
      const value = atom.get()
      return value == null ? '' : String(value).trim()
    }
    if (typeof atom === 'string') return atom.trim()
  } catch {
    // ignore
  }
  return ''
}

function taskSessionId() {
  const state = host.state || {}
  return (
    readAtom(state.focusedSessionId) ||
    readAtom(state.activeSessionId) ||
    readAtom(state.focusedStoredSessionId) ||
    ''
  )
}

function rpcFailed(result) {
  return Boolean(result && typeof result === 'object' && result.error)
}

function rpcStatusOk(result) {
  const status = String(result?.status || '').toLowerCase()
  return status === 'streaming' || status === 'queued' || status === 'steered' || status === 'redirected'
}

async function rpc(method, params) {
  const result = await host.request(method, params)
  if (rpcFailed(result)) {
    const message = result.error?.message || method
    const err = new Error(message)
    err.code = result.error?.code
    throw err
  }
  return result
}

async function ensureSessionId() {
  const runtime = readAtom(host.state?.focusedSessionId) || readAtom(host.state?.activeSessionId)
  if (runtime) return runtime
  const stored = readAtom(host.state?.focusedStoredSessionId)
  try {
    const listed = await rpc('session.active_list', {})
    const rows = listed?.sessions || listed || []
    const first = Array.isArray(rows) ? rows[0] : null
    const live = String(first?.session_id || first?.id || '').trim()
    if (live) return live
  } catch {
    // resume the stored chat if the live list is empty
  }
  if (!stored) return ''
  try {
    const resume = await rpc('session.resume', {
      session_id: stored,
      source: 'desktop',
      omit_messages: true
    })
    return String(resume?.session_id || resume?.id || resume?.session?.id || stored).trim()
  } catch {
    return stored
  }
}

const TASK_SYSTEM_PROMPT = [
  '[TASK_BOARD]',
  'Use the existing todo_list tool for this session. Cam submitted these tasks from the Desktop task list.',
  'They are already on the session todo list when add succeeded. Call todo_list with merge=true to record any that are missing, then execute them. Do not invent a second task system.',
  'Permitted statuses are only PLANNED, PENDING_REVIEW, and BLOCKED.',
  'Write unfinished work as A1_PLANNED: paraphrase. Related work shares a letter. A new theme takes the next letter and keeps the global number. Integrations use combined letters (AB7).',
  'When a task is verified and working, set that item to PENDING_REVIEW (status completed or work_status pending_review). Do not leave it PLANNED after you finish.',
  'NEVER delete, cancel, or omit tasks from todo_list. Removals are Cam-only: the x button or Cam explicitly confirming in chat.',
  'BLOCKED must include _BLOCKED_REASON: why.',
  'End every visible reply with the outstanding unfinished list. Outstanding means unfinished, never finished.',
  'Keep working each task until Cam says stop or ignore. Coding and docs go to Cursor. Cursor returns finished results. Use subagents in parallel when that is faster.'
].join('\n')

function taskPrompt(contents) {
  const lines = contents.map((text, index) => `${index + 1}. ${text}`)
  return `${TASK_SYSTEM_PROMPT}\n\nTasks:\n${lines.join('\n')}`
}

function visibleComposerSurface() {
  const nodes = [...document.querySelectorAll('[data-composer-target]')]
  return nodes.find(el => !el.closest('[data-pane-hidden]')) || nodes[0] || null
}

function submitViaComposerEvent(text) {
  const trimmed = String(text || '').trim()
  const surface = visibleComposerSurface()
  const surfaceId = surface?.dataset?.composerSurfaceId
  const target = surface?.dataset?.composerTarget || 'main'
  if (!trimmed || !surfaceId) return false
  window.dispatchEvent(
    new CustomEvent('hermes:composer-submit', {
      detail: { surfaceId, target, text: trimmed }
    })
  )
  return true
}

async function submitViaComposer(text) {
  if (submitViaComposerEvent(text)) return true
  const editor = composerEditor()
  if (!editor || !text) return false
  editor.focus()
  try {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(editor)
    selection.removeAllRanges()
    selection.addRange(range)
    document.execCommand('insertText', false, text)
  } catch {
    editor.textContent = text
  }
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  await new Promise(resolve => window.setTimeout(resolve, 30))
  const form = editor.closest('form') || document.querySelector('[data-slot="composer-root"]')
  if (form && typeof form.requestSubmit === 'function') {
    form.requestSubmit()
    return true
  }
  editor.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
  )
  return true
}

async function startHermesOnTasks(sessionId, contents) {
  const prompt = taskPrompt(contents)
  if (sessionId) {
    try {
      const result = await rpc('prompt.submit', {
        session_id: sessionId,
        text: prompt,
        source: 'desktop'
      })
      if (rpcStatusOk(result)) return true
    } catch {
      // visible composer submit below
    }
  }
  return submitViaComposer(prompt)
}

async function hiddenTaskTurn(sessionId, body) {
  if (!body) return
  const prompt = `${TASK_SYSTEM_PROMPT}\n\n${body}`
  if (sessionId) {
    try {
      const result = await rpc('prompt.submit', { session_id: sessionId, text: prompt, source: 'desktop' })
      if (rpcStatusOk(result)) return
    } catch {
      // composer fallback
    }
  }
  await submitViaComposer(prompt)
}

function taskWorkStatus(item) {
  const raw = String(item?.work_status || '').trim().toLowerCase()
  if (raw === 'planned' || raw === 'pending_review' || raw === 'blocked') return raw
  const status = String(item?.status || '').trim().toLowerCase()
  if (status === 'cancelled') return 'blocked'
  if (status === 'completed') return item?.user_confirmed ? 'finished' : 'pending_review'
  return 'planned'
}

function taskIsOutstanding(item) {
  if (!item) return false
  if (item.outstanding === true) return true
  if (item.outstanding === false || item.user_confirmed === true) return false
  const ws = taskWorkStatus(item)
  return ws === 'planned' || ws === 'pending_review' || ws === 'blocked'
}

function taskLabel(item) {
  if (item?.label) return String(item.label)
  const code = String(item?.code || item?.id || '').replace(/^todo:/, '') || '?'
  const ws = taskWorkStatus(item).toUpperCase()
  let line = `${code}_${ws}: ${item?.content || ''}`
  if (ws === 'BLOCKED' && item?.blocked_reason) line += `_BLOCKED_REASON: ${item.blocked_reason}`
  return line
}

function SpendTaskPanel() {
  const [expanded, setExpanded] = useState(false)
  const [sid, setSid] = useState(() => taskSessionId())
  const [state, setState] = useState({ todos: [], keep_open: false, revision: 0 })
  const [draft, setDraft] = useState('')
  const [queue, setQueue] = useState([])
  const [editing, setEditing] = useState('')
  const [editText, setEditText] = useState('')
  const inputRef = useRef(null)
  const queueRef = useRef([])
  const draftRef = useRef('')
  const sendingRef = useRef(false)
  const submitRef = useRef(() => {})
  const queueDraftRef = useRef(() => {})
  queueRef.current = queue
  draftRef.current = draft

  useEffect(() => {
    let cancelled = false
    const unsubs = []
    const applySid = () => {
      if (!cancelled) setSid(taskSessionId())
    }
    for (const atom of [
      host.state?.focusedSessionId,
      host.state?.activeSessionId,
      host.state?.focusedStoredSessionId
    ]) {
      if (atom && typeof atom.listen === 'function') unsubs.push(atom.listen(applySid))
    }
    const refresh = async () => {
      applySid()
      const sessionId = taskSessionId()
      if (!sessionId) return
      try {
        const next = await host.request('todo.get', { session_id: sessionId })
        if (!cancelled && next) {
          setState(prev => {
            const prevTodos = Array.isArray(prev.todos) ? prev.todos : []
            const remote = Array.isArray(next.todos) ? next.todos : []
            const remoteIds = new Set(
              remote.map(item => String(item?.id || item?.code || '').replace(/^todo:/, ''))
            )
            const remoteText = new Set(remote.map(item => String(item.content || '')))
            // Never let a remote wipe drop PENDING_REVIEW / PLANNED rows. Only Cam's
            // x or explicit confirm removes them from the bar.
            const kept = prevTodos.filter(item => {
              if (item.user_confirmed === true || item.outstanding === false) return false
              if (!taskIsOutstanding(item)) return false
              const id = String(item?.id || item?.code || '').replace(/^todo:/, '')
              if (remoteIds.has(id)) return false
              if (!item.local && remoteText.has(String(item.content || ''))) return false
              return true
            })
            const locals = kept.filter(item => item.local)
            const orphans = kept.filter(item => !item.local)
            return { ...next, todos: [...remote, ...orphans, ...locals] }
          })
        }
      } catch {
        // RPC not on this serve yet
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), TASK_POLL_MS)
    const off =
      typeof host.onEvent === 'function'
        ? host.onEvent('todo.updated', event => {
            const eventSid = String(event?.session_id || '')
            if (!eventSid || eventSid === taskSessionId()) void refresh()
          })
        : () => {}
    const onOpen = () => {
      setExpanded(true)
      window.setTimeout(() => inputRef.current?.focus?.(), 0)
    }
    window.addEventListener(TASK_OPEN, onOpen)
    const onDocKey = event => {
      if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing) return
      if (!isTaskListKeyEvent(event)) return
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
      if (event.metaKey || event.ctrlKey) {
        queueDraftRef.current()
        return
      }
      void submitRef.current()
    }
    document.addEventListener('keydown', onDocKey, true)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      unsubs.forEach(fn => {
        try { fn() } catch { /* ignore */ }
      })
      off()
      window.removeEventListener(TASK_OPEN, onOpen)
      document.removeEventListener('keydown', onDocKey, true)
    }
  }, [])

  const todos = Array.isArray(state.todos) ? state.todos : []
  const outstanding = todos.filter(taskIsOutstanding)
  // Always show the bar above the composer input (under the built-in status
  // stack). Collapse when empty; expand from the left caret.

  const stopKeys = event => {
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
  }

  const liveSessionId = () => taskSessionId() || sid

  const collectTexts = () => {
    const liveDraft = String(inputRef.current?.value ?? draftRef.current ?? '').trim()
    return [...queueRef.current, liveDraft].map(text => String(text || '').trim()).filter(Boolean)
  }

  const addAll = async (texts, sessionId) => {
    const contents = texts.map(text => String(text || '').trim()).filter(Boolean)
    if (!contents.length || !sessionId) return null
    try {
      return await rpc('todo.add_batch', { session_id: sessionId, contents })
    } catch {
      let next = null
      for (let i = 0; i < contents.length; i += 1) {
        next = await rpc('todo.add', {
          session_id: sessionId,
          content: contents[i],
          new_group: i === 0
        })
      }
      return next
    }
  }

  const submitToHermes = async () => {
    if (sendingRef.current) return
    const contents = collectTexts()
    if (!contents.length) return
    sendingRef.current = true
    setQueue([])
    setDraft('')
    setExpanded(false)
    const stamp = Date.now()
    setState(prev => {
      const existing = Array.isArray(prev.todos) ? prev.todos : []
      let seq = 0
      for (const item of existing) {
        const match = String(item.code || item.id || '').match(/(\d+)/)
        if (match) seq = Math.max(seq, Number(match[1]))
      }
      const locals = contents.map((content, index) => {
        const code = `A${seq + index + 1}`
        return {
          id: `local-${stamp}-${index}`,
          content,
          status: 'pending',
          work_status: 'planned',
          outstanding: true,
          local: true,
          code,
          label: `${code}_PLANNED: ${content}`
        }
      })
      return { ...prev, keep_open: true, todos: [...existing, ...locals] }
    })
    try {
      const sessionId = (await ensureSessionId()) || liveSessionId()
      if (sessionId) {
        try {
          const next = await addAll(contents, sessionId)
          if (next?.todos) {
            setState(prev => {
              const prevTodos = Array.isArray(prev.todos) ? prev.todos : []
              const remote = Array.isArray(next.todos) ? next.todos : []
              const remoteIds = new Set(
                remote.map(item => String(item?.id || item?.code || '').replace(/^todo:/, ''))
              )
              const keep = prevTodos.filter(item => {
                if (!taskIsOutstanding(item) || item.user_confirmed) return false
                const id = String(item?.id || item?.code || '').replace(/^todo:/, '')
                return !remoteIds.has(id) && !item.local
              })
              return { ...next, todos: [...remote, ...keep] }
            })
          }
        } catch {
          // keep the local rows until Hermes todo_list merge picks them up
        }
      }
      await startHermesOnTasks(sessionId, contents)
    } finally {
      sendingRef.current = false
    }
  }
  submitRef.current = submitToHermes

  const queueDraft = () => {
    const content = String(inputRef.current?.value ?? draftRef.current ?? '').trim()
    if (!content) return
    setQueue(current => [...current, content])
    setDraft('')
    window.setTimeout(() => inputRef.current?.focus?.(), 0)
  }
  queueDraftRef.current = queueDraft

  const saveEdit = async id => {
    const content = editText.trim()
    setEditing('')
    if (!content || !sid) return
    try {
      const next = await host.request('todo.update', { session_id: sid, id, content })
      if (next) setState(next)
    } catch { /* ignore */ }
  }

  const remove = async id => {
    const item = (Array.isArray(state.todos) ? state.todos : []).find(
      row => String(row?.id || '').replace(/^todo:/, '') === id || row?.code === id
    )
    setState(prev => ({
      ...prev,
      todos: (Array.isArray(prev.todos) ? prev.todos : []).filter(row => {
        const rowId = String(row?.id || '').replace(/^todo:/, '')
        return rowId !== id && row?.code !== id
      })
    }))
    if (String(id).startsWith('local-') || item?.local) return
    const sessionId = (await ensureSessionId()) || liveSessionId()
    const label = item ? taskLabel(item) : id
    if (sessionId) {
      try {
        let next
        try {
          next = await rpc('todo.cancel', { session_id: sessionId, id })
        } catch {
          next = await rpc('todo.delete', { session_id: sessionId, id })
        }
        if (next?.todos) setState(next)
      } catch { /* already dropped locally */ }
    }
    try {
      await hiddenTaskTurn(
        sessionId,
        `Cam cancelled this task with the x button. Stop work on it. Remove it from todo_list:\n${label}`
      )
    } catch { /* already removed from the list */ }
  }

  const barLabel = outstanding.length
    ? `Tasks · ${outstanding.length} · ${outstanding.map(item => item.code || String(item.id || '')).join(' ')}`
    : queue.length
      ? `Tasks · ${queue.length} queued`
      : 'Tasks'

  const toggle = () => {
    setExpanded(open => {
      const next = !open
      if (next) window.setTimeout(() => inputRef.current?.focus?.(), 0)
      return next
    })
  }

  const head = jsxs('div', {
    className: 'hermes-tasks-head',
    children: [
      jsx('button', {
        type: 'button',
        className: 'hermes-tasks-toggle',
        title: expanded ? 'Collapse' : 'Expand',
        'aria-expanded': expanded,
        'aria-label': expanded ? 'Collapse tasks' : 'Expand tasks',
        onClick: toggle,
        children: expanded ? '▾' : '▴'
      }),
      jsx('button', {
        type: 'button',
        className: 'hermes-tasks-title',
        title: expanded ? 'Collapse' : 'Expand',
        onClick: toggle,
        children: barLabel
      })
    ]
  })

  if (!expanded) {
    return jsxs('div', {
      className: 'hermes-tasks',
      'data-slot': 'hermes-task-list',
      'data-min': '1',
      children: [head]
    })
  }

  return jsxs('div', {
    className: 'hermes-tasks',
    'data-slot': 'hermes-task-list',
    children: [
      head,
      jsxs('div', {
        className: 'hermes-tasks-body',
        children: [
          ...outstanding.map(item => {
            const id = String(item?.id || item?.code || '').replace(/^todo:/, '')
            const ws = taskWorkStatus(item)
            if (editing === id) {
              return jsxs('div', {
                className: 'hermes-tasks-row',
                children: [
                  jsx('input', {
                    className: 'hermes-tasks-input',
                    value: editText,
                    autoFocus: true,
                    onChange: event => setEditText(event.target.value),
                    onKeyDown: event => {
                      if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                        stopKeys(event)
                        void saveEdit(id)
                      }
                      if (event.key === 'Escape') setEditing('')
                    }
                  }),
                  jsx('button', {
                    type: 'button',
                    className: 'hermes-tasks-btn',
                    'data-kind': 'danger',
                    title: 'Remove',
                    onClick: () => void remove(id),
                    children: '×'
                  })
                ]
              }, id)
            }
            return jsxs('div', {
              className: 'hermes-tasks-row',
              children: [
                jsx('button', {
                  type: 'button',
                  className: 'hermes-tasks-text',
                  'data-status': ws,
                  title: taskLabel(item),
                  onClick: () => {
                    setEditing(id)
                    setEditText(item.content || '')
                  },
                  children: taskLabel(item)
                }),
                jsx('button', {
                  type: 'button',
                  className: 'hermes-tasks-btn',
                  'data-kind': 'danger',
                  title: 'Remove',
                  onClick: () => void remove(id),
                  children: '×'
                })
              ]
            }, id)
          }),
          ...queue.map((text, index) =>
            jsxs('div', {
              className: 'hermes-tasks-row',
              children: [
                jsx('span', { className: 'hermes-tasks-text', 'data-status': 'queued', children: text }),
                jsx('button', {
                  type: 'button',
                  className: 'hermes-tasks-btn',
                  'data-kind': 'danger',
                  title: 'Remove',
                  onClick: () => setQueue(current => current.filter((_, i) => i !== index)),
                  children: '×'
                })
              ]
            }, `queued-${index}-${text}`)
          ),
          jsxs('div', {
            className: 'hermes-tasks-row',
            children: [
              jsx('textarea', {
                ref: inputRef,
                className: 'hermes-tasks-input',
                'data-hermes-task-input': '1',
                rows: 1,
                value: draft,
                placeholder: queue.length ? 'Another, then Enter' : 'New task',
                onChange: event => setDraft(event.target.value),
                onKeyDown: event => {
                  if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing) return
                  stopKeys(event)
                  if (event.metaKey || event.ctrlKey) {
                    queueDraft()
                    return
                  }
                  void submitToHermes()
                }
              }),
              jsx('button', {
                type: 'button',
                className: 'hermes-tasks-btn',
                title: 'Send',
                'aria-label': 'Send tasks',
                onClick: () => void submitToHermes(),
                children: '↵'
              })
            ]
          }),
          jsx('p', {
            className: 'hermes-tasks-hint',
            children: 'Enter send · ⌘↵ queue · × remove'
          })
        ]
      })
    ]
  })
}

function registerTaskListFromSpend(ctx) {
  if (typeof window !== 'undefined' && window[TASK_FLAG]) return
  const style = document.createElement('style')
  style.textContent = TASK_CSS
  document.head.append(style)
  // Horizontal bar above the chat input (composer.top), under the built-in
  // status stack. Not in the plus menu.
  ctx.register({
    id: 'task-panel',
    area: 'composer.top',
    order: 20,
    render: () => jsx(SpendTaskPanel, {})
  })
  if (typeof window !== 'undefined') window[TASK_FLAG] = true
  ctx.onDispose(() => {
    style.remove()
    if (typeof window !== 'undefined') delete window[TASK_FLAG]
  })
}

function registerMessagingFromSpend(ctx) {
  if (typeof window !== 'undefined' && window[QUEUE_FLAG]) return
  if (typeof window !== 'undefined') window[QUEUE_FLAG] = true
  ctx.onDispose(() => {
    if (typeof window !== 'undefined') delete window[QUEUE_FLAG]
  })
  ctx.register({
    id: 'queue-edit-capture',
    area: 'composer.top',
    order: 1,
    render: () => jsx(QueueCapture, {})
  })
}
