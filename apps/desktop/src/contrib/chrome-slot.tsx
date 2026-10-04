import { type ReactNode } from 'react'

import { ErrorBoundary } from '@/components/error-boundary'

import { ContribRender } from './react/boundary'
import { useContributions } from './react/use-contributions'

/** Plugins replace a bundled chrome piece by registering here with a local
 *  id that matches the slot (`model-pill`). The host namespaces plugin ids
 *  (`plugin:foo:model-pill`); we match the suffix. */
export const CHROME_SLOTS_AREA = 'chrome.slots'

function localSlotId(id: string): string {
  const colon = id.lastIndexOf(':')

  return colon >= 0 ? id.slice(colon + 1) : id
}

/**
 * Kernel chrome that a disk plugin may replace. If the replacement throws,
 * the bundled children come back — the window stays usable.
 */
export function ChromeSlot({ children, id }: { children: ReactNode; id: string }) {
  const items = useContributions(CHROME_SLOTS_AREA)
  const override = [...items].reverse().find(item => localSlotId(item.id) === id && item.render)

  if (!override?.render) {
    return children
  }

  return (
    <ErrorBoundary fallback={() => children} label={`chrome-slot:${id}`}>
      <ContribRender render={override.render} />
    </ErrorBoundary>
  )
}
