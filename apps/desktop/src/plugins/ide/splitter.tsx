import { cn, useValue } from '@hermes/plugin-sdk'
import { type PointerEvent as RPointerEvent, useCallback } from 'react'

import { $sizes } from './store'

/** Persisted pane size (px) for `key`, clamped to [min, max]. */
export function useSize(key: string, initial: number, min: number, max: number): [number, (n: number) => void] {
  const sizes = useValue($sizes)
  const v = Math.min(max, Math.max(min, sizes[key] ?? initial))

  const set = useCallback(
    (n: number) => {
      $sizes.set({ ...$sizes.get(), [key]: Math.round(Math.min(max, Math.max(min, n))) })
    },
    [key, max, min]
  )

  return [v, set]
}

/**
 * A draggable divider. `edge` is the side of the *resized* pane the handle sits on:
 * dragging toward the pane's inside shrinks it (e.g. a right-docked pane has its handle on its `left` edge).
 */
export function Splitter({ edge, onResize, size }: { edge: 'left' | 'right'; onResize: (n: number) => void; size: number }) {
  const onDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const start = size
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const move = (ev: PointerEvent) => onResize(edge === 'left' ? start - (ev.clientX - startX) : start + (ev.clientX - startX))

      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [edge, onResize, size]
  )

  return (
    <div
      aria-orientation="vertical"
      className={cn('group absolute inset-y-0 z-20 w-2 cursor-col-resize', edge === 'left' ? '-left-1' : '-right-1')}
      onDoubleClick={() => onResize(0)}
      onPointerDown={onDown}
      role="separator"
    >
      <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-(--ui-accent,#8ba8c7)/70 group-active:bg-(--ui-accent,#8ba8c7)" />
    </div>
  )
}
