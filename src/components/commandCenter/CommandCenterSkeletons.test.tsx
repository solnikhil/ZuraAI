import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  CommandCenterSkeleton,
  isCommandCenterSkeletonTemplate,
} from './CommandCenterSkeletons'

describe('CommandCenterSkeleton', () => {
  it('recognizes trusted skeleton templates only', () => {
    expect(isCommandCenterSkeletonTemplate('rows')).toBe(true)
    expect(isCommandCenterSkeletonTemplate('workspace')).toBe(true)
    expect(isCommandCenterSkeletonTemplate('custom')).toBe(false)
    expect(isCommandCenterSkeletonTemplate(null)).toBe(false)
  })

  it('renders an accessible busy status without loading copy', () => {
    render(<CommandCenterSkeleton template="rows" label="Loading Command Center" />)
    const status = screen.getByRole('status', { name: 'Loading Command Center' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Loading Command Center...')).not.toBeInTheDocument()
  })

  it('renders the workspace template for GitHub-style hosts', () => {
    const { container } = render(
      <CommandCenterSkeleton template="workspace" label="Loading repository workspace" />
    )
    expect(container.querySelector('.cc-skeleton--workspace')).toBeTruthy()
  })
})
