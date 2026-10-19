/**
 * Tasks entry in the composer + menu. Pulled onto the Mac at
 * ~/.hermes/desktop-plugins/task-list/plugin.js
 */
import { host } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'task-list'
const POLL_MS = 2000
const FLAG = '__hermesTaskListBar'
const OPEN_EVENT = 'hermes-task-list-open'

const CSS = `
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

async function startHermesOnTasks(sessionId, contents) {
  const prompt = `${TASK_SYSTEM_PROMPT}\n\nTasks:\n${contents.map((text, index) => `${index + 1}. ${text}`).join('\n')}`
  if (sessionId) {
    try {
      const result = await host.request('prompt.submit', { session_id: sessionId, text: prompt, source: 'desktop' })
      const status = String(result?.status || '').toLowerCase()
      if (status === 'streaming' || status === 'queued' || status === 'steered' || status === 'redirected') {
        return true
      }
    } catch {
      // composer fallback
    }
  }
  return submitViaComposerEvent(prompt)
}

async function hiddenTaskTurn(sessionId, body) {
  if (!body) return
  const prompt = `${TASK_SYSTEM_PROMPT}\n\n${body}`
  if (sessionId) {
    try {
      await host.request('prompt.submit', { session_id: sessionId, text: prompt, source: 'desktop' })
      return
    } catch {
      // composer fallback
    }
  }
  submitViaComposerEvent(prompt)
}

function currentSessionId() {
  const state = host.state || {}
  return (
    readAtom(state.focusedSessionId) ||
    readAtom(state.activeSessionId) ||
    readAtom(state.focusedStoredSessionId) ||
    ''
  )
}

function todoId(item) {
  return String(item?.id || item?.code || '').replace(/^todo:/, '')
}

function workStatus(item) {
  const raw = String(item?.work_status || '').trim().toLowerCase()
  if (raw === 'planned' || raw === 'pending_review' || raw === 'blocked') return raw
  const status = String(item?.status || '').trim().toLowerCase()
  if (status === 'cancelled') return 'blocked'
  if (status === 'completed') return item?.user_confirmed ? 'finished' : 'pending_review'
  return 'planned'
}

function isOutstanding(item) {
  if (!item) return false
  if (item.outstanding === true) return true
  if (item.outstanding === false || item.user_confirmed === true) return false
  const ws = workStatus(item)
  return ws === 'planned' || ws === 'pending_review' || ws === 'blocked'
}

function taskLabel(item) {
  if (item?.label) return String(item.label)
  const code = String(item?.code || item?.id || '').replace(/^todo:/, '') || '?'
  const ws = workStatus(item).toUpperCase()
  let line = `${code}_${ws}: ${item?.content || ''}`
  if (ws === 'BLOCKED' && item?.blocked_reason) {
    line += `_BLOCKED_REASON: ${item.blocked_reason}`
  }
  return line
}

function TaskPanel() {
  const [expanded, setExpanded] = useState(false)
  const [sid, setSid] = useState(() => currentSessionId())
  const [state, setState] = useState({ todos: [], keep_open: false, revision: 0 })
  const [draft, setDraft] = useState('')
  const [queue, setQueue] = useState([])
  const [editing, setEditing] = useState('')
  const [editText, setEditText] = useState('')
  const inputRef = useRef(null)
  const queueRef = useRef([])
  const draftRef = useRef('')
  const submitRef = useRef(() => {})
  const queueDraftRef = useRef(() => {})
  queueRef.current = queue
  draftRef.current = draft

  useEffect(() => {
    let cancelled = false
    const unsubs = []
    const applySid = () => {
      if (!cancelled) setSid(currentSessionId())
    }
    for (const atom of [host.state?.focusedSessionId, host.state?.activeSessionId]) {
      if (atom && typeof atom.listen === 'function') unsubs.push(atom.listen(applySid))
    }
    const refresh = async () => {
      applySid()
      const sessionId = currentSessionId()
      if (!sessionId) return
      try {
        const next = await host.request('todo.get', { session_id: sessionId })
        if (!cancelled && next) setState(next)
      } catch {
        // RPC not on this serve yet
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    const offUpdated =
      typeof host.onEvent === 'function'
        ? host.onEvent('todo.updated', event => {
            const eventSid = String(event?.session_id || '')
            if (!eventSid || eventSid === currentSessionId()) void refresh()
          })
        : () => {}
    const onOpen = () => {
      setExpanded(true)
      window.setTimeout(() => inputRef.current?.focus?.(), 0)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
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
        try {
          fn()
        } catch {
          // ignore
        }
      })
      offUpdated()
      window.removeEventListener(OPEN_EVENT, onOpen)
      document.removeEventListener('keydown', onDocKey, true)
    }
  }, [])

  const todos = Array.isArray(state.todos) ? state.todos : []
  const outstanding = todos.filter(isOutstanding)

  const stopKeys = event => {
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
  }

  const liveSessionId = () => currentSessionId() || sid

  const collectTexts = () => {
    const liveDraft = String(inputRef.current?.value ?? draftRef.current ?? '').trim()
    return [...queueRef.current, liveDraft].map(text => String(text || '').trim()).filter(Boolean)
  }

  const addAll = async (texts, sessionId) => {
    const contents = texts.map(text => String(text || '').trim()).filter(Boolean)
    if (!contents.length || !sessionId) return null
    try {
      return await host.request('todo.add_batch', { session_id: sessionId, contents })
    } catch {
      let next = null
      for (let i = 0; i < contents.length; i += 1) {
        next = await host.request('todo.add', {
          session_id: sessionId,
          content: contents[i],
          new_group: i === 0
        })
      }
      return next
    }
  }

  const submitToHermes = async () => {
    const contents = collectTexts()
    if (!contents.length) return
    setQueue([])
    setDraft('')
    setExpanded(false)
    const stamp = Date.now()
    setState(prev => ({
      ...prev,
      keep_open: true,
      todos: [
        ...(Array.isArray(prev.todos) ? prev.todos : []),
        ...contents.map((content, index) => ({
          id: `local-${stamp}-${index}`,
          content,
          status: 'pending',
          work_status: 'planned',
          outstanding: true,
          local: true,
          label: content
        }))
      ]
    }))
    const sessionId = liveSessionId()
    if (sessionId) {
      try {
        const next = await addAll(contents, sessionId)
        if (next?.todos) setState(next)
      } catch {
        // keep local rows
      }
    }
    await startHermesOnTasks(sessionId, contents)
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
    } catch {
      // ignore
    }
  }

  const remove = async id => {
    const sessionId = liveSessionId()
    if (!sessionId) return
    const item = todos.find(row => todoId(row) === id)
    const label = item ? taskLabel(item) : id
    try {
      const next = await host.request('todo.delete', { session_id: sessionId, id })
      if (next) setState(next)
    } catch {
      // ignore
    }
    try {
      await hiddenTaskTurn(
        sessionId,
        `Cam cancelled this task with the x button. Stop work on it. Remove it from todo_list:\n${label}`
      )
    } catch {
      // already removed from the list
    }
  }

  const barLabel = outstanding.length
    ? `Tasks · ${outstanding.length} · ${outstanding.map(item => item.code || todoId(item)).join(' ')}`
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
            const id = todoId(item)
            const ws = workStatus(item)
            if (editing === id) {
              return jsxs(
                'div',
                {
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
                },
                id
              )
            }
            return jsxs(
              'div',
              {
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
                    'aria-label': `Remove ${item.content}`,
                    onClick: () => void remove(id),
                    children: '×'
                  })
                ]
              },
              id
            )
          }),
          ...queue.map((text, index) =>
            jsxs(
              'div',
              {
                className: 'hermes-tasks-row',
                children: [
                  jsx('span', {
                    className: 'hermes-tasks-text',
                    'data-status': 'queued',
                    children: text
                  }),
                  jsx('button', {
                    type: 'button',
                    className: 'hermes-tasks-btn',
                    'data-kind': 'danger',
                    title: 'Remove',
                    onClick: () => setQueue(current => current.filter((_, i) => i !== index)),
                    children: '×'
                  })
                ]
              },
              `queued-${index}-${text}`
            )
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

export function registerTaskList(ctx) {
  if (typeof window !== 'undefined' && window[FLAG]) return

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)
  // Horizontal bar above the chat input. Not in the plus menu.
  ctx.register({
    id: 'task-panel',
    area: 'composer.top',
    order: 20,
    render: () => jsx(TaskPanel, {})
  })
  if (typeof window !== 'undefined') window[FLAG] = true
  ctx.onDispose(() => {
    style.remove()
    if (typeof window !== 'undefined') delete window[FLAG]
  })
}

export default {
  id: ID,
  name: 'Task list',
  description: 'Tasks in the composer plus menu. Persistent add field, queue with Cmd+Enter, send with Enter.',
  defaultEnabled: true,
  register(ctx) {
    registerTaskList(ctx)
  }
}
