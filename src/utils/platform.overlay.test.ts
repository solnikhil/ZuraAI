import { describe, expect, it } from 'vitest'

import { readOverlayMaterialFromLocation } from './platform'

describe('readOverlayMaterialFromLocation', () => {
  it('reads acrylic from the overlay hash query', () => {
    expect(readOverlayMaterialFromLocation({ hash: '#/overlay?material=acrylic' })).toBe('acrylic')
  })

  it('reads css from a hash with other params', () => {
    expect(readOverlayMaterialFromLocation({ hash: '#/overlay?material=css&foo=1' })).toBe('css')
  })

  it('returns null when material is absent', () => {
    expect(readOverlayMaterialFromLocation({ hash: '#/overlay' })).toBeNull()
  })
})