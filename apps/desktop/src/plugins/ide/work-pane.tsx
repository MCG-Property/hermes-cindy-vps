import { cn, Codicon } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useState } from 'react'

import { ideApi } from './api'
import { repoName } from './fold'
import { IdeTerminal } from './terminal'
import type { FsEntry, GitChange } from './types'

type Tab = 'browser' | 'changes' | 'files' | 'terminal'

const TABS: { icon: string; id: Tab; label: string }[] = [
  { icon: 'git-compare', id: 'changes', label: 'Changes' },
  { icon: 'globe', id: 'browser', label: 'Browser' },
  { icon: 'terminal', id: 'terminal', label: 'Terminal' },
  { icon: 'files', id: 'files', label: 'Files' }
]

function Tree({ depth = 0, onOpen, path }: { depth?: number; onOpen: (p: string) => void; path: string }) {
  const [items, setItems] = useState<FsEntry[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    void ideApi.fsTree(path).then(setItems).catch(() => setItems([]))
  }, [path])

  return (
    <div>
      {items.map(e => (
        <div key={e.path}>
          <button
            className="flex h-6 w-full items-center gap-1.5 rounded px-1 text-left text-[0.8rem] text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground"
            onClick={() => (e.dir ? setOpen(o => ({ ...o, [e.path]: !o[e.path] })) : onOpen(e.path))}
            style={{ paddingLeft: 4 + depth * 12 }}
            type="button"
          >
            <Codicon name={e.dir ? (open[e.path] ? 'folder-opened' : 'folder') : 'file'} size="0.8rem" />
            <span className="truncate">{e.name}</span>
          </button>
          {e.dir && open[e.path] ? <Tree depth={depth + 1} onOpen={onOpen} path={e.path} /> : null}
        </div>
      ))}
    </div>
  )
}

export function FilesTab({ repo }: { repo: string }) {
  const [file, setFile] = useState<null | string>(null)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<string[]>([])

  const open = useCallback(
    async (p: string) => {
      const r = await ideApi.fsRead(p)
      setFile(p)
      setText(r.text ?? '')
      setNote(r.binary ? 'Binary file' : r.big ? 'File too large to preview' : '')
    },
    []
  )

  useEffect(() => {
    if (!q) {
      setHits([])

      return
    }

    const t = setTimeout(() => void ideApi.fsFind(repo, q).then(setHits).catch(() => setHits([])), 180)

    return () => clearTimeout(t)
  }, [q, repo])

  if (file) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-1.5 text-[0.8rem] text-(--ui-text-secondary)">
          <button className="hover:text-foreground" onClick={() => setFile(null)} type="button">
            <Codicon name="arrow-left" size="0.85rem" />
          </button>
          <span className="flex-1 truncate">{file.replace(`${repo}/`, '')}</span>
          <button className="rounded bg-(--ui-bg-quaternary) px-2 py-0.5 hover:bg-(--chrome-action-hover)" onClick={() => void ideApi.fsWrite(file, text)} type="button">
            Save
          </button>
        </div>
        {note ? (
          <div className="p-4 text-(--ui-text-tertiary)">{note}</div>
        ) : (
          <textarea
            className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[0.78rem] leading-relaxed outline-none"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault()
                void ideApi.fsWrite(file, text)
              }
            }}
            spellCheck={false}
            value={text}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 p-4">
        <div className="flex h-8 items-center gap-2 rounded-full bg-(--ui-bg-quaternary) px-3 text-(--ui-text-tertiary)">
          <Codicon name="search" size="0.85rem" />
          <input className="flex-1 bg-transparent text-[0.82rem] text-foreground outline-none" onChange={e => setQ(e.target.value)} placeholder="Files, Folders..." value={q} />
        </div>
        <div className="mt-3 space-y-0.5">
          {hits.slice(0, 14).map(p => (
            <button className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[0.82rem] hover:bg-(--chrome-action-hover)" key={p} onClick={() => void open(p)} type="button">
              <Codicon name="file" size="0.85rem" />
              <span className="truncate">{p.replace(`${repo}/`, '')}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="w-52 shrink-0 overflow-y-auto border-l border-(--ui-stroke-tertiary) p-2">
        <div className="px-1 pb-1.5 text-[0.78rem] text-(--ui-text-tertiary)">{repoName(repo)}</div>
        <Tree onOpen={p => void open(p)} path={repo} />
      </div>
    </div>
  )
}

export function ChangesTab({ repo }: { repo: string }) {
  const [rows, setRows] = useState<GitChange[]>([])
  const [diff, setDiff] = useState('')

  const load = useCallback(() => void ideApi.gitChanges(repo).then(setRows).catch(() => setRows([])), [repo])

  useEffect(() => {
    load()
    const t = setInterval(load, 4000)

    return () => clearInterval(t)
  }, [load])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 py-2 text-[0.78rem] text-(--ui-text-tertiary)">
        {rows.length} changed file{rows.length === 1 ? '' : 's'}
      </div>
      <div className="max-h-[40%] overflow-y-auto">
        {rows.map(r => (
          <button
            className="flex h-7 w-full items-center gap-2 px-4 text-left text-[0.82rem] hover:bg-(--chrome-action-hover)"
            key={r.file}
            onClick={() => void ideApi.gitDiff(repo, r.file).then(d => setDiff(d.diff))}
            type="button"
          >
            <span className="w-4 text-[0.72rem] text-amber-400">{r.status}</span>
            <span className="flex-1 truncate">{r.file}</span>
            <span className="font-mono text-[0.72rem]">
              <span className="text-emerald-400">+{r.add ?? 0}</span> <span className="text-red-400">-{r.del ?? 0}</span>
            </span>
          </button>
        ))}
      </div>
      {diff ? (
        <pre className="min-h-0 flex-1 overflow-auto border-t border-(--ui-stroke-tertiary) p-3 font-mono text-[0.72rem] leading-relaxed select-text">
          {diff.split('\n').map((l, i) => (
            <div className={l.startsWith('+') ? 'text-emerald-400' : l.startsWith('-') ? 'text-red-400' : l.startsWith('@@') ? 'text-sky-400' : ''} key={i}>
              {l || ' '}
            </div>
          ))}
        </pre>
      ) : null}
    </div>
  )
}

export function BrowserTab({ url, onUrl }: { onUrl: (u: string) => void; url: string }) {
  const [draft, setDraft] = useState(url)

  useEffect(() => setDraft(url), [url])

  const go = () => {
    let v = draft.trim()

    if (v && !/^\w+:\/\//.test(v)) {
      v = `http://${v}`
    }

    onUrl(v)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 items-center gap-1 px-2">
        <button className="grid size-7 place-items-center rounded text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={() => onUrl(url)} title="Reload" type="button">
          <Codicon name="refresh" size="0.85rem" />
        </button>
        <input
          className="h-7 flex-1 rounded-full bg-(--ui-bg-quaternary) px-3 text-[0.8rem] outline-none"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && go()}
          placeholder="localhost:3000"
          value={draft}
        />
        <button className="grid size-7 place-items-center rounded text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={() => url && window.open(url, '_blank')} title="Open in browser" type="button">
          <Codicon name="link-external" size="0.85rem" />
        </button>
      </div>
      {url ? (
        <iframe className="min-h-0 flex-1 border-t border-(--ui-stroke-tertiary) bg-white" key={url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" src={url} title="Preview" />
      ) : (
        <div className="grid flex-1 place-items-center text-(--ui-text-tertiary)">Enter a URL, or let the agent start a dev server.</div>
      )}
    </div>
  )
}

export function WorkPane({ browserUrl, onBrowserUrl, repo }: { browserUrl: string; onBrowserUrl: (u: string) => void; repo: null | string }) {
  const [tab, setTab] = useState<Tab>('files')

  useEffect(() => {
    if (browserUrl) {
      setTab('browser')
    }
  }, [browserUrl])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col border-l border-(--ui-stroke-tertiary)">
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        {TABS.map(t => (
          <button
            className={cn('flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] text-(--ui-text-secondary) hover:text-foreground', tab === t.id && 'bg-(--ui-bg-quaternary) text-foreground')}
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            <Codicon name={t.icon} size="0.85rem" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        {!repo ? (
          <div className="grid h-full place-items-center text-(--ui-text-tertiary)">Select a repository first.</div>
        ) : (
          <>
            <div className={cn('absolute inset-0', tab !== 'files' && 'hidden')}>
              <FilesTab repo={repo} />
            </div>
            <div className={cn('absolute inset-0', tab !== 'changes' && 'hidden')}>{tab === 'changes' ? <ChangesTab repo={repo} /> : null}</div>
            <div className={cn('absolute inset-0', tab !== 'browser' && 'hidden')}>
              <BrowserTab onUrl={onBrowserUrl} url={browserUrl} />
            </div>
            <div className={cn('absolute inset-0', tab !== 'terminal' && 'hidden')}>
              <IdeTerminal cwd={repo} visible={tab === 'terminal'} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
