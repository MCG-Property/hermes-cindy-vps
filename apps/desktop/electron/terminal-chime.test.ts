import { describe, expect, it } from 'vitest'

import { macChimePath } from './terminal-chime'

describe('macChimePath', () => {
  it('returns null off macOS', () => {
    expect(macChimePath('linux', () => true)).toBeNull()
  })

  it('returns the first existing system sound on macOS', () => {
    expect(macChimePath('darwin', path => path.endsWith('Ping.aiff'))).toBe('/System/Library/Sounds/Ping.aiff')
  })
})
