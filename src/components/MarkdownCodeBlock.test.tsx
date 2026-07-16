import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getMarkdownLanguageMeta,
  getRunnableCodeLanguage,
  RunnableCodeBlock,
} from './MarkdownCodeBlock'
import { executeTool } from '../tools/executor'

vi.mock('../tools/executor', () => ({
  executeTool: vi.fn(async () => ({
    success: true,
    data: { stdout: 'hello\n', stderr: '', exitCode: 0 },
  })),
}))

describe('MarkdownCodeBlock', () => {
  beforeEach(() => vi.mocked(executeTool).mockClear())

  it('normalizes display and runnable languages', () => {
    expect(getMarkdownLanguageMeta('ts')).toEqual({ label: 'TypeScript' })
    expect(getRunnableCodeLanguage('tsx')).toBe('javascript')
    expect(getRunnableCodeLanguage('python')).toBe('python')
    expect(getRunnableCodeLanguage('rust')).toBeUndefined()
  })

  it('runs user-initiated code without placing approval authority in arguments', async () => {
    render(
      <RunnableCodeBlock
        code="console.log('hello')"
        execLanguage="javascript"
        codeView={<pre>code view</pre>}
        headerStyle={{ position: 'relative' }}
        headerLeftContent={<span>JavaScript</span>}
        copyButton={<button type="button">Copy</button>}
        isGenerating={false}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run code' }))

    await waitFor(() => expect(executeTool).toHaveBeenCalledTimes(1))
    expect(executeTool).toHaveBeenCalledWith('code_execution', {
      code: "console.log('hello')",
      language: 'javascript',
      description: 'User-initiated run',
    })
    expect(await screen.findByText(/hello/)).toBeInTheDocument()
  })
})
