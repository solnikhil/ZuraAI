import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'
import ThinkingBlock from './ThinkingBlock'

describe('ThinkingBlock tool visibility', () => {
  it('expands failed artifact calls with input and output visible', () => {
    render(
      <ThinkingBlock
        thinking=""
        completedBlocks={[
          {
            type: 'tool',
            toolName: 'artifact_create',
            timestamp: 1,
            toolInput: {
              content: '',
              kind: 'text',
              title: 'New Text Artifact',
            },
            toolOutput: {
              success: false,
              error:
                "Missing required parameter(s): content. Please provide 'content' to use artifact_create.",
            },
          },
        ]}
      />
    )

    expect(screen.getByText('Artifact Create: New Text Artifact')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Input')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
    expect(screen.getByText(/Missing required parameter\(s\): content/)).toBeInTheDocument()
  })

  it('renders active tool calls with a live input/output panel', () => {
    render(
      <ThinkingBlock
        thinking=""
        activeToolCalls={[
          {
            name: 'artifact_create',
            arguments: {
              content: 'Draft',
              kind: 'text',
              title: 'New Text Artifact',
            },
          },
        ]}
      />
    )

    expect(screen.getByText('Artifact Create')).toBeInTheDocument()
    expect(screen.getByText(': text')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Input')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
    expect(screen.getByLabelText('Tool output loading')).toBeInTheDocument()
  })
})
