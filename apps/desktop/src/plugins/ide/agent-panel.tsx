import { Codicon, useValue } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useState } from 'react'

import { ideApi } from './api'
import { $repo, $repos, refresh } from './store'

export function RepoPicker({ onAdd }: { onAdd: () => void }) {
  const repos = useValue($repos)
  const repo = useValue($repo)

  return (
    <div className="flex items-center gap-1">
      <select
        className="h-7 max-w-44 rounded-lg bg-(--ui-bg-quaternary) px-2 text-[0.78rem] outline-none"
        onChange={e => $repo.set(e.target.value || null)}
        value={repo ?? ''}
      >
        {!repos.length ? <option value="">No repository</option> : null}
        {repos.map(r => (
          <option key={r.path} value={r.path}>
            {r.name}
          </option>
        ))}
      </select>
      <button className="grid size-7 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)" onClick={onAdd} title="Add repository" type="button">
        <Codicon name="new-folder" size="0.85rem" />
      </button>
    </div>
  )
}

export function AddRepoDialog({ onClose }: { onClose: () => void }) {
  const [dir, setDir] = useState<null | { dirs: { name: string; path: string }[]; isGit: boolean; parent: string; path: string }>(null)
  const [err, setErr] = useState('')

  const go = useCallback((p: string) => void ideApi.browse(p).then(setDir).catch(e => setErr(String(e?.message ?? e))), [])

  useEffect(() => go(''), [go])

  return (
    <div className="absolute inset-0 z-30 grid place-items-start justify-center bg-black/50 pt-[12vh]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[60vh] w-[480px] flex-col overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-primary,#1b1b1b) shadow-2xl">
        <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2.5 text-[0.85rem]">
          <button className="hover:text-foreground" onClick={() => dir && go(dir.parent)} type="button">
            <Codicon name="arrow-up" size="0.9rem" />
          </button>
          <input
            className="min-w-0 flex-1 bg-transparent text-(--ui-text-secondary) outline-none"
            defaultValue={dir?.path ?? ''}
            key={dir?.path}
            onKeyDown={e => e.key === 'Enter' && go((e.target as HTMLInputElement).value)}
            placeholder="Type a path and press Enter"
          />
          <button
            className="rounded-lg bg-foreground px-3 py-1 text-[0.8rem] text-background"
            onClick={() => dir && void ideApi.addRepo(dir.path).then(r => { $repo.set(r.path); void refresh(); onClose() })}
            type="button"
          >
            Add {dir?.isGit ? 'repository' : 'folder'}
          </button>
        </div>
        <div className="overflow-y-auto p-1.5">
          {err ? <div className="p-3 text-red-400">{err}</div> : null}
          {dir?.dirs.map(d => (
            <button className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[0.84rem] hover:bg-(--chrome-action-hover)" key={d.path} onClick={() => go(d.path)} type="button">
              <Codicon name="folder" size="0.85rem" />
              {d.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}


export function useWidth<T extends HTMLElement>(): [number, (el: null | T) => void] {
  const [w, setW] = useState(1200)
  const [obs] = useState(() => new ResizeObserver(es => setW(es[0]?.contentRect.width ?? 1200)))

  const set = useCallback((el: null | T) => {
    obs.disconnect()

    if (el) {
      obs.observe(el)
    }
  }, [obs])

  return [w, set]
}

