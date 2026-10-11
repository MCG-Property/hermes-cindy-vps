import { describe, expect, it } from 'vitest'

import { dur, foldEvent } from './fold'
import type { Turn } from './types'

const blank = (): Turn => ({ id: 't', role: 'assistant', steps: [], text: '', ts: 0 })

describe('foldEvent', () => {
  it('appends text, records tools and attaches their results', () => {
    let t = blank()
    t = foldEvent(t, { n: 0, text: 'He', type: 'text' })
    t = foldEvent(t, { n: 1, text: 'llo', type: 'text' })
    t = foldEvent(t, { arg: 'a.txt', id: 'k', kind: 'read', n: 2, name: 'read', type: 'tool' })
    t = foldEvent(t, { id: 'k', n: 3, ok: true, result: 'hi', type: 'tool_result' })
    expect(t.text).toBe('Hello')
    expect(t.steps).toEqual([{ agent: undefined, arg: 'a.txt', id: 'k', kind: 'read', name: 'read', ok: true, result: 'hi' }])
  })

  it('keeps the error and usage', () => {
    let t = foldEvent(blank(), { message: 'boom', n: 0, type: 'error' })
    t = foldEvent(t, { cost: 0.1, input: 1, n: 1, output: 2, type: 'usage' })
    expect(t.error).toBe('boom')
    expect(t.usage).toEqual({ cost: 0.1, input: 1, output: 2 })
  })
})

describe('dur', () => {
  it('formats seconds and minutes', () => {
    expect(dur(9)).toBe('9s')
    expect(dur(69)).toBe('1m 9s')
  })
})
