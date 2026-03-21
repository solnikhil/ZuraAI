import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import McpLibraryDialog from './McpLibraryDialog'

const showToast = vi.fn()
const readResource = vi.fn()
const getPrompt = vi.fn()

vi.mock('@/components/shared', () => ({
  useToast: () => ({ showToast }),
}))

vi.mock('@/mcp/McpContext', () => ({
  useMcp: () => ({
    resources: [
      {
        serverId: 'server-1',
        serverName: 'Filesystem',
        manifest: {
          uri: 'file:///tmp/demo.txt',
          title: 'Demo File',
        },
        exposure: {
          userVisible: true,
          modelVisible: false,
          requiresExplicitUserAction: true,
        },
      },
    ],
    prompts: [
      {
        serverId: 'server-1',
        serverName: 'Filesystem',
        manifest: {
          name: 'summarize_demo',
          title: 'Summarize Demo',
          arguments: [{ name: 'topic', required: true }],
        },
        exposure: {
          userVisible: true,
          modelVisible: false,
          requiresExplicitUserAction: true,
        },
      },
    ],
    readResource,
    getPrompt,
  }),
}))

describe('McpLibraryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readResource.mockResolvedValue({
      contents: [{ uri: 'file:///tmp/demo.txt', text: 'Demo resource body' }],
    })
    getPrompt.mockResolvedValue({
      description: 'Prompt preview',
      messages: [{ role: 'user', content: 'Prompt body' }],
    })
  })

  it('reads a resource and inserts it into the composer draft', async () => {
    const onInsertText = vi.fn()

    render(
      <McpLibraryDialog open={true} onOpenChange={vi.fn()} onInsertText={onInsertText} />
    )

    fireEvent.click(screen.getByRole('button', { name: /demo file/i }))

    await waitFor(() => {
      expect(readResource).toHaveBeenCalledWith('server-1', 'file:///tmp/demo.txt')
    })

    fireEvent.click(screen.getByRole('button', { name: /insert into composer/i }))

    expect(onInsertText).toHaveBeenCalledWith(expect.stringContaining('Demo resource body'))
  })

  it('renders prompts and inserts the expanded prompt into the composer draft', async () => {
    const onInsertText = vi.fn()

    render(
      <McpLibraryDialog
        open={true}
        onOpenChange={vi.fn()}
        initialMode="prompts"
        onInsertText={onInsertText}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /summarize demo/i }))
    fireEvent.change(screen.getByPlaceholderText('topic'), { target: { value: 'release notes' } })
    fireEvent.click(screen.getByRole('button', { name: /preview prompt/i }))

    await waitFor(() => {
      expect(getPrompt).toHaveBeenCalledWith('server-1', 'summarize_demo', { topic: 'release notes' })
    })

    fireEvent.click(screen.getByRole('button', { name: /insert into composer/i }))

    expect(onInsertText).toHaveBeenCalledWith(expect.stringContaining('Prompt body'))
  })

  it('resets preview state when the dialog is reopened', async () => {
    const { rerender } = render(
      <McpLibraryDialog open={true} onOpenChange={vi.fn()} onInsertText={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: /demo file/i }))

    await waitFor(() => {
      expect(readResource).toHaveBeenCalledWith('server-1', 'file:///tmp/demo.txt')
    })

    expect(screen.getByRole('button', { name: /insert into composer/i })).toBeInTheDocument()

    rerender(<McpLibraryDialog open={false} onOpenChange={vi.fn()} onInsertText={vi.fn()} />)
    rerender(<McpLibraryDialog open={true} onOpenChange={vi.fn()} onInsertText={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /insert into composer/i })).not.toBeInTheDocument()
    expect(screen.getByText('Select a resource to preview its contents.')).toBeInTheDocument()
  })
})
