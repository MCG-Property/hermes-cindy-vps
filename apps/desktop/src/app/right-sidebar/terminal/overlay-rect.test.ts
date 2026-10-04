import { describe, expect, it } from 'vitest'

import { stabilizeOverlayRect } from './overlay-rect'

const base = { hidden: false, top: 10, left: 20, width: 200, height: 100 }

describe('stabilizeOverlayRect', () => {
  it('keeps the first rect', () => {
    expect(stabilizeOverlayRect(null, base)).toEqual(base)
  })

  it('ignores 1px size and position chase', () => {
    expect(stabilizeOverlayRect(base, { ...base, width: 201, height: 101, top: 11, left: 21 })).toEqual(base)
  })

  it('applies a real move or resize', () => {
    const next = { hidden: false, top: 40, left: 20, width: 240, height: 100 }

    expect(stabilizeOverlayRect(base, next)).toEqual(next)
  })

  it('does not snap across a visibility change', () => {
    const hidden = { ...base, hidden: true, width: 201 }

    expect(stabilizeOverlayRect(base, hidden)).toEqual(hidden)
  })
})
