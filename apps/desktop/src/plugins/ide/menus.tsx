import { cn, Codicon, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@hermes/plugin-sdk'
import type { ReactNode } from 'react'

/** Small "label ˅" dropdown used by every composer footer. */
export function Pick({ align = 'start', className, items, label, onPick, title }: { align?: 'end' | 'start'; className?: string; items: { id: string; label: string }[]; label: ReactNode; onPick: (id: string) => void; title?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-white/10', className)} title={title} type="button">
          {label}
          <Codicon name="chevron-down" size="0.7rem" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-72 overflow-y-auto">
        {items.map(i => (
          <DropdownMenuItem key={i.id} onSelect={() => onPick(i.id)}>
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function IconBtn({ active, children, disabled, onClick, title }: { active?: boolean; children: ReactNode; disabled?: boolean; onClick?: () => void; title?: string }) {
  return (
    <button
      className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-(--ui-text-secondary) hover:bg-white/10 hover:text-foreground disabled:opacity-30', active && 'bg-white/10 text-foreground')}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}
