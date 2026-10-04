import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ChromeSlot, CHROME_SLOTS_AREA } from './chrome-slot'
import { registry } from './registry'

const disposers: Array<() => void> = []

afterEach(() => {
  cleanup()
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
})

describe('ChromeSlot', () => {
  it('renders bundled chrome when nothing is registered', () => {
    render(
      <ChromeSlot id="model-pill">
        <button type="button">bundled pill</button>
      </ChromeSlot>
    )

    expect(screen.getByRole('button', { name: 'bundled pill' })).not.toBeNull()
  })

  it('falls back to bundled chrome when a replacement throws', () => {
    disposers.push(
      registry.register({
        area: CHROME_SLOTS_AREA,
        id: 'plugin:demo:model-pill',
        render: () => {
          throw new Error('broken skin')
        }
      })
    )

    render(
      <ChromeSlot id="model-pill">
        <button type="button">bundled pill</button>
      </ChromeSlot>
    )

    expect(screen.getByRole('button', { name: 'bundled pill' })).not.toBeNull()
  })
})
