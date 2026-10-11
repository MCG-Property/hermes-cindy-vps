import { cn, Codicon } from '@hermes/plugin-sdk'

export type View = 'chat' | 'tui' | 'web'

const LABEL: Record<View, { icon: string; label: string; tip: string }> = {
  chat: { icon: 'comment-discussion', label: 'Chat UI', tip: 'Hermes-rendered chat view of this agent' },
  tui: { icon: 'terminal', label: 'Native UI', tip: "The agent's own interface, running live" },
  web: { icon: 'globe', label: 'Web UI', tip: "OpenCode's own web interface (this machine only)" }
}

export function ViewToggle({ onChange, options, value }: { onChange: (v: View) => void; options: View[]; value: View }) {
  return (
    <div className="flex items-center rounded-lg bg-(--ui-bg-quaternary) p-0.5">
      {options.map(o => (
        <button
          className={cn('flex h-6 items-center gap-1 rounded-md px-2 text-[0.74rem] text-(--ui-text-tertiary) hover:text-foreground', value === o && 'bg-(--chrome-action-hover) text-foreground')}
          key={o}
          onClick={() => onChange(o)}
          title={LABEL[o].tip}
          type="button"
        >
          <Codicon name={LABEL[o].icon} size="0.8rem" />
          {LABEL[o].label}
        </button>
      ))}
    </div>
  )
}
