import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import ToolCallIndicator from './ToolCallIndicator'

describe('ToolCallIndicator', () => {
  it('uses generic MCP phrasing instead of search-specific copy', () => {
    render(
      <ToolCallIndicator
        toolName="mcp__filesystem__read_file"
        status="executing"
        arguments={{ path: '/tmp/demo.txt' }}
      />
    )

    expect(screen.getByText('Running Read File on Filesystem: /tmp/demo.txt')).toBeInTheDocument()
  })
})
