import { cn } from '@hermes/plugin-sdk'
import { type ReactNode, useMemo } from 'react'

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|https?:\/\/[^\s)<]+)/g

function inline(s: string, onLink?: (u: string) => void): ReactNode[] {
  return s.split(INLINE).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code className="rounded bg-(--ui-bg-quaternary) px-1 py-px font-mono text-[0.85em]" key={i}>
          {part.slice(1, -1)}
        </code>
      )
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }

    if (/^https?:\/\//.test(part)) {
      return (
        <button className="cursor-pointer text-(--ui-accent) hover:underline" key={i} onClick={() => onLink?.(part)} type="button">
          {part}
        </button>
      )
    }

    return part
  })
}

export function Markdown({ className, onCode, onLink, text }: { className?: string; onCode?: (code: string, lang: string) => ReactNode; onLink?: (u: string) => void; text: string }) {
  const nodes = useMemo(() => {
    const out: ReactNode[] = []
    const parts = text.split(/```/)

    parts.forEach((p, i) => {
      if (i % 2 === 1) {
        const nl = p.indexOf('\n')
        const lang = (nl >= 0 ? p.slice(0, nl) : '').trim().split(/\s+/)[0] || 'code'
        const code = (nl >= 0 ? p.slice(nl + 1) : p).replace(/\n$/, '')

        out.push(
          <div className="my-2 overflow-hidden rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-widget-surface-background)" key={`c${i}`}>
            <div className="flex h-7 items-center justify-between px-3 text-[0.7rem] text-(--ui-text-tertiary)">
              <span>{lang}</span>
              {onCode?.(code, lang)}
            </div>
            <pre className="overflow-x-auto px-3 pb-3 font-mono text-[0.78rem] leading-relaxed text-(--ui-text-primary)">{code}</pre>
          </div>
        )

        return
      }

      let list: ReactNode[] = []
      let ordered = false

      const flush = (k: string) => {
        if (list.length) {
          out.push(
            ordered ? (
              <ol className="my-1.5 list-decimal pl-5" key={k}>
                {list}
              </ol>
            ) : (
              <ul className="my-1.5 list-disc pl-5" key={k}>
                {list}
              </ul>
            )
          )
          list = []
        }
      }

      p.split('\n').forEach((line, j) => {
        const k = `${i}-${j}`
        let m: null | RegExpExecArray

        if ((m = /^\s*[-*]\s+(.*)/.exec(line))) {
          if (ordered) {
            flush(k)
          }

          ordered = false
          list.push(<li key={k}>{inline(m[1], onLink)}</li>)
        } else if ((m = /^\s*\d+\.\s+(.*)/.exec(line))) {
          if (!ordered) {
            flush(k)
          }

          ordered = true
          list.push(<li key={k}>{inline(m[1], onLink)}</li>)
        } else if ((m = /^#{1,3}\s+(.*)/.exec(line))) {
          flush(k)
          out.push(
            <div className="mt-3 mb-1 font-semibold" key={k}>
              {inline(m[1], onLink)}
            </div>
          )
        } else if (!line.trim()) {
          flush(k)
        } else {
          flush(k)
          out.push(
            <p className="my-1.5" key={k}>
              {inline(line, onLink)}
            </p>
          )
        }
      })
      flush(`f${i}`)
    })

    return out
  }, [onCode, onLink, text])

  return <div className={cn('select-text break-words', className)}>{nodes}</div>
}
