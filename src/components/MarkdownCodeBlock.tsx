import * as React from 'react'
import { Code2, LoaderCircle, Play } from 'lucide-react'

import { executeTool } from '../tools/executor'
import { WithTooltip } from './ui/WithTooltip'

export interface MarkdownLanguageMeta {
  label: string
}

const LANGUAGE_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  plaintext: 'text',
  cs: 'csharp',
  cxx: 'cpp',
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'TSX',
  javascript: 'JavaScript',
  jsx: 'JSX',
  python: 'Python',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  yaml: 'YAML',
  shell: 'Shell',
  bash: 'Shell',
  sql: 'SQL',
  markdown: 'Markdown',
  text: 'Plain Text',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  php: 'PHP',
  ruby: 'Ruby',
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  csharp: 'C#',
  'c#': 'C#',
}

const RUNNABLE_LANGUAGES: Record<string, 'javascript' | 'python'> = {
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  typescript: 'javascript',
  ts: 'javascript',
  tsx: 'javascript',
  python: 'python',
  py: 'python',
}

export function normalizeHighlightLanguage(language?: string): string | undefined {
  if (!language) return undefined
  const normalized = language.toLowerCase()
  return LANGUAGE_ALIASES[normalized] ?? normalized
}

export function getMarkdownLanguageMeta(language?: string): MarkdownLanguageMeta {
  const key = normalizeHighlightLanguage(language)
  if (!key) return { label: 'Code' }
  const knownLabel = LANGUAGE_LABELS[key]
  if (knownLabel) return { label: knownLabel }
  return {
    label: key
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
  }
}

export function getRunnableCodeLanguage(language?: string): 'javascript' | 'python' | undefined {
  return language ? RUNNABLE_LANGUAGES[language.toLowerCase()] : undefined
}

export function hasMarkdownCodeBlock(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false
  const className = (node.props as { className?: unknown }).className
  if (typeof className === 'string' && className.includes('markdown-code-block')) return true
  const children = (node.props as { children?: React.ReactNode }).children
  return children
    ? React.Children.toArray(children).some((child) => hasMarkdownCodeBlock(child))
    : false
}

interface ExecOutput {
  stdout: string
  stderr: string
  exitCode: number | null
}

export function RunnableCodeBlock({
  code,
  execLanguage,
  codeView,
  headerStyle,
  headerLeftContent,
  copyButton,
  isGenerating,
}: {
  code: string
  execLanguage: 'javascript' | 'python'
  codeView: React.ReactNode
  headerStyle: React.CSSProperties
  headerLeftContent: React.ReactNode
  copyButton: React.ReactNode
  isGenerating: boolean
}) {
  const [execState, setExecState] = React.useState<'idle' | 'running' | 'done'>('idle')
  const [viewMode, setViewMode] = React.useState<'code' | 'output'>('code')
  const [output, setOutput] = React.useState<ExecOutput | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setExecState('idle')
    setViewMode('code')
    setOutput(null)
    setError(null)
  }, [code])

  const handleRun = React.useCallback(async () => {
    setExecState('running')
    try {
      // User initiation does not grant execution authority. Main performs its normal approval
      // flow; no autoApprove flag or renderer-created approval token is sent here.
      const result = await executeTool('code_execution', {
        code,
        language: execLanguage,
        description: 'User-initiated run',
      })
      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>
        setOutput({
          stdout: typeof data.stdout === 'string' ? data.stdout : '',
          stderr: typeof data.stderr === 'string' ? data.stderr : '',
          exitCode: typeof data.exitCode === 'number' ? data.exitCode : null,
        })
        setError(null)
      } else {
        setOutput(null)
        setError(result.error || 'Execution failed')
      }
    } catch (executionError) {
      setOutput(null)
      setError(executionError instanceof Error ? executionError.message : 'Execution failed')
    }
    setExecState('done')
    setViewMode('output')
  }, [code, execLanguage])

  const disabled = isGenerating || execState === 'running'
  const showOutput = viewMode === 'output' && execState === 'done'
  const title = execState === 'running' ? 'Running...' : showOutput ? 'Show code' : 'Run code'

  return (
    <>
      <div style={{ ...headerStyle, padding: '13px 94px 9px 16px' }}>
        {headerLeftContent}
        {showOutput && (
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--theme-text-tertiary)',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              letterSpacing: '0.02em',
            }}
          >
            Output
          </span>
        )}
        <WithTooltip tooltip={title}>
          <button
            type="button"
            onClick={showOutput ? () => setViewMode('code') : () => void handleRun()}
            disabled={disabled}
            aria-label={title}
            style={{
              background: 'transparent',
              border: '1px solid color-mix(in srgb, var(--theme-border) 72%, transparent)',
              color: 'var(--theme-text-muted)',
              cursor: disabled ? 'default' : 'pointer',
              width: '32px',
              height: '32px',
              borderRadius: '11px',
              position: 'absolute',
              top: '14px',
              right: '52px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {execState === 'running' ? (
              <LoaderCircle
                size={16}
                style={{ animation: 'markdown-code-spin 900ms linear infinite' }}
              />
            ) : showOutput ? (
              <Code2 size={16} />
            ) : (
              <Play size={16} />
            )}
          </button>
        </WithTooltip>
        {copyButton}
      </div>
      {showOutput ? (
        <pre
          style={{
            margin: 0,
            padding: '14px 16px 18px',
            background: 'transparent',
            overflowX: 'auto',
            maxHeight: '400px',
            overflowY: 'auto',
          }}
        >
          <code
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.95rem',
              lineHeight: '1.72',
              color: error ? 'var(--theme-error, #ef4444)' : 'var(--theme-text-primary)',
            }}
          >
            {error || output?.stdout || (!output?.stderr ? 'No output' : '')}
            {!error && output?.stderr && (
              <span style={{ color: 'var(--theme-text-warning, #f59e0b)' }}>
                {output.stdout ? '\n' : ''}
                {output.stderr}
              </span>
            )}
            {!error && output?.exitCode != null && output.exitCode !== 0 && (
              <span style={{ color: 'var(--theme-error, #ef4444)', display: 'block' }}>
                exit code {output.exitCode}
              </span>
            )}
          </code>
        </pre>
      ) : (
        codeView
      )}
    </>
  )
}
