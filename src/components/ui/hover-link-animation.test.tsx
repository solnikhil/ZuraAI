import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HoverLinkAnimation } from './hover-link-animation'

describe('HoverLinkAnimation', () => {
  it('renders paragraph-safe inline markup', () => {
    const { container } = render(
      <p>
        <HoverLinkAnimation highlightColor="#0b1220">Citation</HoverLinkAnimation>
      </p>
    )

    expect(container.querySelector('p div')).toBeNull()
  })
})
