import { describe, expect, it } from 'vitest'
import { normalizeClickArgs, normalizeCursorArgs, normalizeScrollArgs } from './computer-use/normalize'

describe('computer-use argument normalization', () => {
  it('accepts numeric strings for click coordinates', () => {
    expect(normalizeClickArgs({ x: '42', y: '24', button: 'right' })).toEqual({
      args: { x: 42, y: 24, button: 'right' },
      autoApprove: false,
    })
  })

  it('keeps zero-valued click coordinates instead of treating them as missing', () => {
    expect(normalizeClickArgs({ x: 0, y: 0 })).toEqual({
      args: { x: 0, y: 0, button: 'left' },
      autoApprove: false,
    })
  })

  it('rejects invalid click coordinates instead of defaulting to the top-left corner', () => {
    expect(() => normalizeClickArgs({ x: 'left', y: 12 })).toThrow('Invalid x coordinate')
    expect(() => normalizeClickArgs({ x: 12, y: undefined })).toThrow('Invalid y coordinate')
  })

  it('normalizes scroll and cursor coordinates with the same finite-number rules', () => {
    expect(normalizeScrollArgs({ x: '10', y: '20', direction: 'up', amount: '4' }).args).toEqual({
      x: 10,
      y: 20,
      direction: 'up',
      amount: 4,
    })
    expect(normalizeCursorArgs({ x: '30', y: '40' }).args).toEqual({ x: 30, y: 40 })
    expect(() => normalizeScrollArgs({ x: 10, y: Number.NaN, direction: 'down' })).toThrow('Invalid y coordinate')
  })
})
