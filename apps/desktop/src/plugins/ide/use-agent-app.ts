import { useValue } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ideApi } from './api'
import { $chats, $ide, $panelChat, $repo, $repos, refresh } from './store'
import type { AgentId, ChatLight } from './types'
import { type SessionApi, useSession } from './use-session'

export interface Attach {
  kind: string
  name: string
  text: string
}

export interface AgentApp {
  agent: AgentId
  attachments: Attach[]
  chatId: null | string
  chats: ChatLight[]
  contextPct: number
  cur: ChatLight | undefined
  effort: string
  hasRepo: boolean
  hist: { back: () => void; canBack: boolean; canFwd: boolean; fwd: () => void }
  mode: string
  model: string
  models: string[]
  newChat: (repo?: string) => void
  openChat: (id: string) => void
  repo: null | string
  repos: { name: string; path: string }[]
  scroller: React.RefObject<HTMLDivElement | null>
  send: (text: string) => void
  session: SessionApi
  setAttachments: (a: Attach[]) => void
  setEffort: (e: string) => void
  setMode: (m: string) => void
  setModel: (m: string) => void
}

/** Chat/session plumbing shared by every desktop-app UI (one conversation per panel, backed by the plugin backend). */
export function useAgentApp(agent: AgentId, panelId: string, defaults: { effort?: string; mode: string }): AgentApp {
  const ide = useValue($ide)
  const repo = useValue($repo)
  const repos = useValue($repos)
  const chats = useValue($chats).filter(c => c.agent === agent)
  const panelChat = useValue($panelChat)
  const chatId = panelChat[panelId] || null
  const [mode, setMode] = useState(defaults.mode)
  const [effort, setEffort] = useState(defaults.effort ?? '')
  const [models, setModels] = useState<string[]>([])
  const [model, setModelState] = useState(agent === 'cursor' ? (ide?.settings.cursorModel ?? '') : '')
  const [attachments, setAttachments] = useState<Attach[]>([])
  const [hist, setHist] = useState<string[]>([])
  const [hi, setHi] = useState(-1)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void ideApi.models(agent).then(r => setModels(r.models)).catch(() => undefined)
  }, [agent])

  const setChat = useCallback(
    (cid: string, push = true) => {
      $panelChat.set({ ...$panelChat.get(), [panelId]: cid })

      if (push) {
        setHist(h => [...h.slice(0, hi + 1), cid])
        setHi(i => i + 1)
      }
    },
    [hi, panelId]
  )

  const load = useCallback(async () => (chatId ? ideApi.chat(chatId).then(c => ({ ui: c.ui })) : { ui: [] }), [chatId])

  const start = useCallback(
    async (text: string, extra?: { attachments?: unknown[]; mode?: string; model?: string }) => {
      let cid = chatId

      if (!cid) {
        cid = (await ideApi.newChat(agent, repo)).id
        setChat(cid)
      }

      const m = extra?.mode ?? mode
      // UI permission labels -> backend run mode: "bypass/full access" = agent + full auto; "ask/read-only" = read-only runs.
      const r = await ideApi.send(cid, { attachments: extra?.attachments, full_auto: m === 'bypass' ? true : undefined, mode: m === 'bypass' ? 'agent' : m, model: extra?.model ?? model, text })
      void refresh()

      return r.run
    },
    [agent, chatId, mode, model, repo, setChat]
  )

  const session = useSession({ key: chatId ?? `none-${panelId}`, load, start })

  useEffect(() => {
    const el = scroller.current

    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 260) {
      el.scrollTop = el.scrollHeight
    }
  }, [session.turns, session.live])

  const usage = [...session.turns].reverse().find(t => t.usage)?.usage

  return {
    agent,
    attachments,
    chatId,
    chats,
    contextPct: usage ? (((usage.input ?? 0) + (usage.output ?? 0)) / 200000) * 100 : 0,
    cur: chats.find(c => c.id === chatId),
    effort,
    hasRepo: !!repo,
    hist: { back: () => { setHi(hi - 1); setChat(hist[hi - 1], false) }, canBack: hi > 0, canFwd: hi < hist.length - 1, fwd: () => { setHi(hi + 1); setChat(hist[hi + 1], false) } },
    mode,
    model,
    models,
    newChat: r => {
      if (r) {
        $repo.set(r)
      }

      $panelChat.set({ ...$panelChat.get(), [panelId]: '' })
    },
    openChat: id => setChat(id),
    repo,
    repos,
    scroller,
    send: text => {
      const a = attachments

      setAttachments([])
      void session.send(text, { attachments: a, mode, model })
    },
    session,
    setAttachments,
    setEffort,
    setMode,
    setModel: m => {
      setModelState(m)

      if (agent === 'cursor') {
        void ideApi.setSettings({ cursorModel: m })
      }
    }
  }
}
