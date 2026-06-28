// Lazy-loaded Markdown component for memory optimization
// Only loads when markdown content is actually displayed
import * as React from 'react'
const { Suspense, useState, useEffect, useMemo } = React
import { lazy } from 'react'
import { Check, Code2, Copy, LoaderCircle, Play } from 'lucide-react'
import WebSourceCitation from './Dashboard/ChatArea/WebSourceCitation'
import { WithTooltip } from './ui/WithTooltip'
import type { WebSource } from './Dashboard/ChatArea/WebSourceCitation'
import MarkdownFileTree from './MarkdownFileTree'
import type { ExtraProps } from 'react-markdown'
import {
  getPreloadedMarkdown,
  waitForMarkdownPreload,
  type SyntaxHighlighterComponent,
} from '../utils/markdownPreloader'
import { normalizeSafeHttpUrl } from '../utils/urlSafety'
import { useSettings } from '../contexts/SettingsContext'
import { isCodeExecutionEnabled } from '../skills'
import { executeTool } from '../tools/executor'
const MermaidDiagram = lazy(() => import('./MermaidDiagram'))

// Lazy load react-markdown component (plugins are handled by markdownPreloader)
const ReactMarkdown = lazy(() => import('react-markdown'))

interface LazyMarkdownProps {
  content: string
  className?: string
  webSources?: Map<string, WebSource>
  isStreaming?: boolean
}

export function findMatchingWebSource(
  href: string,
  webSources?: Map<string, WebSource>
): WebSource | undefined {
  if (!href || !webSources) return undefined
  return webSources.get(href) || webSources.get(href.replace(/\/+$/, ''))
}

/** Skeleton placeholder shown while markdown plugins are loading */
function MarkdownSkeleton({ className }: { className?: string }) {
  const lineWidths = ['85%', '70%', '60%', '90%']
  return (
    <div className={className} style={{ padding: '2px 0' }}>
      {lineWidths.map((width, i) => (
        <div
          key={i}
          style={{
            height: '14px',
            width,
            marginBottom: i < lineWidths.length - 1 ? '10px' : 0,
            borderRadius: '4px',
            background: 'var(--theme-surface-hover, rgba(255,255,255,0.06))',
            animation: 'markdown-skeleton-pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  )
}

type LanguageMeta = {
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
  csharp: 'csharp',
  cs: 'csharp',
  cpp: 'cpp',
  cxx: 'cpp',
}

export function normalizeHighlightLanguage(language?: string): string | undefined {
  if (!language) return undefined

  const normalized = language.toLowerCase()
  return LANGUAGE_ALIASES[normalized] ?? normalized
}

function getLanguageMeta(language?: string): LanguageMeta {
  const key = normalizeHighlightLanguage(language)
  if (!key) return { label: 'Code' }

  const meta: Record<string, LanguageMeta> = {
    typescript: { label: 'TypeScript' },
    tsx: { label: 'TSX' },
    javascript: { label: 'JavaScript' },
    jsx: { label: 'JSX' },
    python: { label: 'Python' },
    html: { label: 'HTML' },
    css: { label: 'CSS' },
    json: { label: 'JSON' },
    yaml: { label: 'YAML' },
    shell: { label: 'Shell' },
    bash: { label: 'Shell' },
    sql: { label: 'SQL' },
    markdown: { label: 'Markdown' },
    text: { label: 'Plain Text' },
    go: { label: 'Go' },
    rust: { label: 'Rust' },
    java: { label: 'Java' },
    kotlin: { label: 'Kotlin' },
    swift: { label: 'Swift' },
    php: { label: 'PHP' },
    ruby: { label: 'Ruby' },
    c: { label: 'C' },
    cpp: { label: 'C++' },
    'c++': { label: 'C++' },
    csharp: { label: 'C#' },
    'c#': { label: 'C#' },
  }

  if (meta[key]) return meta[key]

  const fallbackLabel = key
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return { label: fallbackLabel }
}

function hasMarkdownCodeBlock(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false

  const className = (node.props as { className?: unknown }).className
  if (typeof className === 'string' && className.includes('markdown-code-block')) {
    return true
  }

  const children = (node.props as { children?: React.ReactNode }).children
  if (!children) return false

  return React.Children.toArray(children).some((child) => hasMarkdownCodeBlock(child))
}

// Languages the sandbox can execute (normalized keys)
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

interface ExecOutput {
  stdout: string
  stderr: string
  exitCode: number | null
}

/** Wraps a code block with run-button + code/output toggle when execution is available. */
function RunnableCodeBlock({
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
  const [execState, setExecState] = useState<'idle' | 'running' | 'done'>('idle')
  const [viewMode, setViewMode] = useState<'code' | 'output'>('code')
  const [output, setOutput] = useState<ExecOutput | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset execution state when code changes (e.g. during streaming)
  const prevCodeRef = React.useRef(code)
  if (prevCodeRef.current !== code && execState === 'done') {
    prevCodeRef.current = code
    setExecState('idle')
    setViewMode('code')
  }
  prevCodeRef.current = code

  const handleRun = React.useCallback(async () => {
    setExecState('running')
    try {
      const result = await executeTool('code_execution', {
        code,
        language: execLanguage,
        description: 'User-initiated run',
        autoApprove: true,
      })
      if (result.success && result.data) {
        const d = result.data as Record<string, unknown>
        setOutput({
          stdout: typeof d.stdout === 'string' ? d.stdout : '',
          stderr: typeof d.stderr === 'string' ? d.stderr : '',
          exitCode: typeof d.exitCode === 'number' ? d.exitCode : null,
        })
        setError(null)
      } else {
        setOutput(null)
        setError(result.error || 'Execution failed')
      }
    } catch (e) {
      setOutput(null)
      setError(e instanceof Error ? e.message : 'Execution failed')
    }
    setExecState('done')
    setViewMode('output')
  }, [code, execLanguage])

  const runButtonDisabled = isGenerating || execState === 'running'
  const showOutput = viewMode === 'output' && execState === 'done'

  const runButtonStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid color-mix(in srgb, var(--theme-border) 72%, transparent)',
    color: 'var(--theme-text-muted)',
    cursor: runButtonDisabled ? 'default' : 'pointer',
    width: '32px',
    height: '32px',
    borderRadius: '11px',
    position: 'absolute',
    top: '14px',
    right: '52px',
    transition: 'background-color 160ms ease, border-color 160ms ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    flexShrink: 0,
    boxShadow: 'none',
    pointerEvents: runButtonDisabled ? 'none' : 'auto',
  }

  const runButtonTitle =
    execState === 'running' ? 'Running...' : showOutput ? 'Show code' : 'Run code'

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
              lineHeight: 1,
              transform: 'translateY(0.5px)',
            }}
          >
            Output
          </span>
        )}
        <WithTooltip tooltip={runButtonTitle}>
          <button
            onClick={
              showOutput
                ? () => setViewMode('code')
                : () => {
                    void handleRun()
                  }
            }
            style={runButtonStyle}
            aria-label={runButtonTitle}
            onMouseEnter={(e) => {
              if (runButtonDisabled) return
              e.currentTarget.style.background =
                'color-mix(in srgb, var(--theme-surface-active) 42%, transparent)'
              e.currentTarget.style.borderColor = 'var(--theme-border-hover)'
            }}
            onMouseLeave={(e) => {
              if (runButtonDisabled) return
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor =
                'color-mix(in srgb, var(--theme-border) 72%, transparent)'
            }}
          >
            {execState === 'running' ? (
              <LoaderCircle
                size={16}
                style={{
                  display: 'block',
                  color: 'var(--theme-text-muted)',
                  animation: 'markdown-code-spin 900ms linear infinite',
                }}
              />
            ) : showOutput ? (
              <Code2 size={16} style={{ display: 'block', color: 'var(--theme-text-muted)' }} />
            ) : (
              <Play size={16} style={{ display: 'block', color: 'var(--theme-text-muted)' }} />
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
            {error ? (
              error
            ) : (
              <>
                {output?.stdout || (!output?.stderr ? 'No output' : '')}
                {output?.stderr && (
                  <span style={{ color: 'var(--theme-text-warning, #f59e0b)' }}>
                    {output.stdout ? '\n' : ''}
                    {output.stderr}
                  </span>
                )}
                {output?.exitCode != null && output.exitCode !== 0 && (
                  <span
                    style={{
                      color: 'var(--theme-error, #ef4444)',
                      display: 'block',
                      marginTop: '4px',
                      fontSize: '0.85rem',
                    }}
                  >
                    exit code {output.exitCode}
                  </span>
                )}
              </>
            )}
          </code>
        </pre>
      ) : (
        codeView
      )}
    </>
  )
}

const MarkdownContent = React.memo(function MarkdownContent({
  content,
  webSources,
  isStreaming = false,
}: {
  content: string
  webSources?: Map<string, WebSource>
  isStreaming?: boolean
}) {
  // Initialize from preloaded cache if available (avoids flash of unstyled content)
  const preloaded = getPreloadedMarkdown()
  // Wrap function/component values in arrow functions so React doesn't
  // call them as lazy initialisers (useState treats bare functions as initialisers).
  const [remarkPlugin, setRemarkPlugin] = useState<(() => void) | null>(() => preloaded.remarkGfm)
  const [syntaxHighlighter, setSyntaxHighlighter] = useState<SyntaxHighlighterComponent | null>(
    () => preloaded.syntaxHighlighter
  )
  const [prismStyle, setPrismStyle] = useState<Record<string, React.CSSProperties> | null>(
    preloaded.prismStyle
  )
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [loadAttempted, setLoadAttempted] = useState(preloaded.ready)

  useEffect(() => {
    // If preloader already resolved, nothing to do
    if (loadAttempted) return

    let mounted = true
    waitForMarkdownPreload().then(() => {
      if (!mounted) return
      const cached = getPreloadedMarkdown()
      if (cached.remarkGfm) setRemarkPlugin(() => cached.remarkGfm)
      if (cached.syntaxHighlighter) setSyntaxHighlighter(() => cached.syntaxHighlighter)
      if (cached.prismStyle) setPrismStyle(cached.prismStyle)
      setLoadAttempted(true)
    })
    return () => {
      mounted = false
    }
  }, [loadAttempted])

  const SyntaxHighlighter = syntaxHighlighter
  // Derive code execution availability from settings
  const { settings } = useSettings()
  const codeExecutionEnabled = isCodeExecutionEnabled(settings.skills)
  const remarkPlugins = [remarkPlugin].filter(Boolean) as (() => void)[]

  // Memoize the components object to give ReactMarkdown a stable reference,
  // preventing it from doing a full internal reconciliation on every render.
  // Dependencies: anything the component renderers close over that can change.
  const components = useMemo(
    () => ({
      code(
        codeProps: React.ClassAttributes<HTMLElement> &
          React.HTMLAttributes<HTMLElement> &
          ExtraProps & { inline?: boolean }
      ) {
        const { className, children, node: _node, inline, ...props } = codeProps
        const match = /language-([\w-]+)/.exec(className || '')
        const codeString = Array.isArray(children) ? children.join('') : String(children ?? '')
        const isInline = inline === true
        const isCodeBlock = !isInline && (!!match || codeString.includes('\n'))

        const language = match?.[1]?.toLowerCase()
        const highlightLanguage = normalizeHighlightLanguage(match?.[1])

        // Mermaid diagrams
        const isMermaid = language === 'mermaid'
        if (!isInline && isCodeBlock && isMermaid) {
          const mermaidCode = codeString.replace(/\n$/, '')
          // During streaming, if this mermaid block is still being generated
          // (it's the trailing code block), show a static placeholder instead
          // of repeatedly attempting expensive mermaid.render() with partial code.
          const isMermaidStillStreaming =
            isStreaming && content.trimEnd().endsWith(mermaidCode.trimEnd())

          if (isMermaidStillStreaming) {
            return (
              <div
                style={{
                  margin: '12px 0',
                  padding: '48px 24px',
                  borderRadius: '8px',
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-border)',
                  textAlign: 'center',
                  color: 'var(--theme-text-tertiary)',
                }}
                className="markdown-mermaid-skeleton"
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    margin: '0 auto 12px',
                    border: '3px solid var(--theme-border)',
                    borderTopColor: 'var(--theme-accent)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span style={{ display: 'block', fontSize: '0.8rem' }}>Generating diagram...</span>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            )
          }

          return (
            <Suspense
              fallback={
                <div
                  style={{
                    margin: '12px 0',
                    padding: '48px 24px',
                    borderRadius: '8px',
                    background: 'var(--theme-surface)',
                    border: '1px solid var(--theme-border)',
                    textAlign: 'center',
                    color: 'var(--theme-text-tertiary)',
                  }}
                  className="markdown-mermaid-skeleton"
                >
                  <div
                    style={{
                      width: '120px',
                      height: '12px',
                      margin: '0 auto 12px',
                      borderRadius: '4px',
                      background: 'var(--theme-surface-hover)',
                      animation: 'markdown-skeleton-pulse 1.5s ease-in-out infinite',
                    }}
                  />
                  <div
                    style={{
                      width: '200px',
                      height: '80px',
                      margin: '0 auto',
                      borderRadius: '6px',
                      background: 'var(--theme-surface-hover)',
                      animation: 'markdown-skeleton-pulse 1.5s ease-in-out infinite',
                      animationDelay: '0.1s',
                    }}
                  />
                  <span style={{ display: 'block', marginTop: '12px', fontSize: '0.8rem' }}>
                    Loading diagram...
                  </span>
                </div>
              }
            >
              <MermaidDiagram code={mermaidCode} />
            </Suspense>
          )
        }

        const isTreeLanguage =
          !!language &&
          ['tree', 'dir', 'filetree', 'file-tree', 'zura-tree', 'zura_tree'].includes(language)
        // Render file-tree view only when we have clear tree evidence.
        // This avoids false positives for normal code/config blocks (e.g. .gitignore).
        const hasVisualTreeMarkers =
          /^(?:\s*(?:\| {3})*|\s*(?:│ {3})*)?(?:├──|└──|\|--|\+--|\|[-─—]{2,}|\+[-─—]{2,}|├[-─—]{2,}|└[-─—]{2,})\s+/m.test(
            codeString
          )
        const hasFolderComments = /^\s*\S+\/\s*#\s+/m.test(codeString)
        const hasIndentedHierarchy = /^(?:\s{2,}|\t+)\S/m.test(codeString)
        const looksLikeTree =
          codeString.includes('\n') &&
          (hasVisualTreeMarkers || (hasFolderComments && hasIndentedHierarchy))
        const hasExplicitNonTreeLanguage = !!language && !isTreeLanguage
        const isStructuredTreeLanguage =
          !!language && ['zura-tree', 'zura_tree', 'filetree', 'file-tree'].includes(language)
        const shouldRenderTree =
          isStructuredTreeLanguage ||
          (isTreeLanguage && looksLikeTree) ||
          (!hasExplicitNonTreeLanguage && looksLikeTree)

        if (!isInline && isCodeBlock && shouldRenderTree) {
          return <MarkdownFileTree language={language} content={codeString.replace(/\n$/, '')} />
        }

        const normalizedCode = codeString.replace(/\n$/, '')
        const codeFrameStyle: React.CSSProperties = {
          position: 'relative',
          margin: '4px 0',
          borderRadius: '30px',
          overflow: 'hidden',
          border: '1px solid var(--theme-border)',
          background: 'color-mix(in srgb, var(--theme-surface-active) 72%, black 28%)',
          boxShadow: 'none',
        }
        const codeHeaderStyle: React.CSSProperties = {
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '13px 56px 9px 16px',
          background: 'transparent',
        }
        const codeHeaderLeftStyle: React.CSSProperties = {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          minWidth: 0,
          lineHeight: 1,
        }
        const codeGlyphWrapStyle: React.CSSProperties = {
          width: '15px',
          height: '15px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }
        const codeGlyphStyle: React.CSSProperties = {
          color: 'var(--theme-text-muted)',
          display: 'block',
        }
        const codeHeaderLabelStyle: React.CSSProperties = {
          color: 'var(--theme-text-primary)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: '0.95rem',
          lineHeight: 1,
          letterSpacing: '0.01em',
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: '16px',
          transform: 'translateY(0.5px)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }
        const codeBodyStyle: React.CSSProperties = {
          margin: 0,
          padding: '14px 16px 18px',
          background: 'transparent',
          overflowX: 'auto',
        }
        const getCopyButtonStyle = (isGenerating: boolean): React.CSSProperties => ({
          background: 'transparent',
          border: '1px solid color-mix(in srgb, var(--theme-border) 72%, transparent)',
          color: 'var(--theme-text-muted)',
          cursor: isGenerating ? 'default' : 'pointer',
          width: '32px',
          height: '32px',
          borderRadius: '11px',
          position: 'absolute',
          top: '14px',
          right: '14px',
          transition: 'background-color 160ms ease, border-color 160ms ease',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          flexShrink: 0,
          boxShadow: 'none',
          pointerEvents: isGenerating ? 'none' : 'auto',
        })
        const iconSlotStyle: React.CSSProperties = {
          position: 'relative',
          width: '16px',
          height: '16px',
        }
        const getIconStateStyle = (visible: boolean): React.CSSProperties => ({
          position: 'absolute',
          inset: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) rotate(0deg)' : 'scale(0.75) rotate(-8deg)',
          transition: 'opacity 220ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: 'none',
        })
        const loadingSpinnerStyle: React.CSSProperties = {
          display: 'block',
          color: 'var(--theme-text-muted)',
          animation: 'markdown-code-spin 900ms linear infinite',
        }
        const renderCodeHeader = (
          meta: LanguageMeta,
          isCopied: boolean,
          isGenerating: boolean,
          onCopy: () => void
        ) => (
          <div style={codeHeaderStyle}>
            <span style={codeHeaderLeftStyle}>
              <span style={codeGlyphWrapStyle} aria-hidden="true">
                <Code2 size={13} strokeWidth={2.2} style={codeGlyphStyle} />
              </span>
              <span style={codeHeaderLabelStyle}>{meta.label}</span>
            </span>
            <WithTooltip
              tooltip={isGenerating ? 'Generating code...' : isCopied ? 'Copied!' : 'Copy code'}
            >
              <button
                onClick={onCopy}
                style={getCopyButtonStyle(isGenerating)}
                aria-label={
                  isGenerating ? 'Generating code' : isCopied ? 'Copied code' : 'Copy code'
                }
                onMouseEnter={(event) => {
                  if (isGenerating) return
                  event.currentTarget.style.background =
                    'color-mix(in srgb, var(--theme-surface-active) 42%, transparent)'
                  event.currentTarget.style.borderColor = 'var(--theme-border-hover)'
                }}
                onMouseLeave={(event) => {
                  if (isGenerating) return
                  event.currentTarget.style.background = 'transparent'
                  event.currentTarget.style.borderColor =
                    'color-mix(in srgb, var(--theme-border) 72%, transparent)'
                }}
              >
                {isGenerating ? (
                  <LoaderCircle size={16} style={loadingSpinnerStyle} />
                ) : (
                  <span style={iconSlotStyle}>
                    <span style={getIconStateStyle(!isCopied)}>
                      <Copy
                        size={16}
                        style={{ display: 'block', color: 'var(--theme-text-muted)' }}
                      />
                    </span>
                    <span style={getIconStateStyle(isCopied)}>
                      <Check
                        size={16}
                        style={{ display: 'block', color: 'var(--theme-success)' }}
                      />
                    </span>
                  </span>
                )}
              </button>
            </WithTooltip>
          </div>
        )

        if (isCodeBlock && match && SyntaxHighlighter && prismStyle) {
          // Code block with language - syntax highlighted
          const isCopied = copiedCode === codeString
          const handleCopy = () => {
            navigator.clipboard.writeText(codeString)
            setCopiedCode(codeString)
            setTimeout(() => setCopiedCode(null), 2000)
          }
          const languageMeta = getLanguageMeta(match[1])
          const isGeneratingBlock =
            isStreaming && content.trimEnd().endsWith(normalizedCode.trimEnd())
          const execLang = language ? RUNNABLE_LANGUAGES[language] : undefined
          const canRun = codeExecutionEnabled && !!execLang && !isGeneratingBlock

          const syntaxView = (
            <SyntaxHighlighter
              {...props}
              children={normalizedCode}
              style={prismStyle}
              language={highlightLanguage}
              PreTag="div"
              customStyle={codeBodyStyle}
              useInlineStyles={true}
              codeTagProps={{
                style: {
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.95rem',
                  lineHeight: '1.72',
                  background: 'transparent',
                },
              }}
            />
          )

          if (canRun) {
            const headerLeft = (
              <span style={codeHeaderLeftStyle}>
                <span style={codeGlyphWrapStyle} aria-hidden="true">
                  <Code2 size={13} strokeWidth={2.2} style={codeGlyphStyle} />
                </span>
                <span style={codeHeaderLabelStyle}>{languageMeta.label}</span>
              </span>
            )
            const copyBtn = (
              <WithTooltip tooltip={isCopied ? 'Copied!' : 'Copy code'}>
                <button
                  onClick={handleCopy}
                  style={getCopyButtonStyle(false)}
                  aria-label={isCopied ? 'Copied code' : 'Copy code'}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      'color-mix(in srgb, var(--theme-surface-active) 42%, transparent)'
                    e.currentTarget.style.borderColor = 'var(--theme-border-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderColor =
                      'color-mix(in srgb, var(--theme-border) 72%, transparent)'
                  }}
                >
                  <span style={iconSlotStyle}>
                    <span style={getIconStateStyle(!isCopied)}>
                      <Copy
                        size={16}
                        style={{ display: 'block', color: 'var(--theme-text-muted)' }}
                      />
                    </span>
                    <span style={getIconStateStyle(isCopied)}>
                      <Check
                        size={16}
                        style={{ display: 'block', color: 'var(--theme-success)' }}
                      />
                    </span>
                  </span>
                </button>
              </WithTooltip>
            )
            return (
              <div style={codeFrameStyle} className="markdown-code-block">
                <RunnableCodeBlock
                  code={normalizedCode}
                  execLanguage={execLang}
                  codeView={syntaxView}
                  headerStyle={codeHeaderStyle}
                  headerLeftContent={headerLeft}
                  copyButton={copyBtn}
                  isGenerating={isGeneratingBlock}
                />
              </div>
            )
          }

          return (
            <div style={codeFrameStyle} className="markdown-code-block">
              {renderCodeHeader(languageMeta, isCopied, isGeneratingBlock, handleCopy)}
              {syntaxView}
            </div>
          )
        } else if (isCodeBlock) {
          // Code block without language - plain block
          const isCopied = copiedCode === codeString
          const handleCopy = () => {
            navigator.clipboard.writeText(codeString)
            setCopiedCode(codeString)
            setTimeout(() => setCopiedCode(null), 2000)
          }
          const isGeneratingBlock =
            isStreaming && content.trimEnd().endsWith(normalizedCode.trimEnd())

          return (
            <div style={codeFrameStyle} className="markdown-code-block">
              {renderCodeHeader(getLanguageMeta(), isCopied, isGeneratingBlock, handleCopy)}
              <pre style={codeBodyStyle}>
                <code
                  style={{
                    color: 'var(--theme-text-primary)',
                    whiteSpace: 'pre',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.95rem',
                    lineHeight: '1.72',
                  }}
                >
                  {normalizedCode}
                </code>
              </pre>
            </div>
          )
        } else {
          // Inline code
          return (
            <code {...props} className={className}>
              {children}
            </code>
          )
        }
      },
      pre: ({
        node: _node,
        children,
        ...props
      }: ExtraProps & React.HTMLAttributes<HTMLPreElement>) => {
        const wrapsCustomCodeBlock = React.Children.toArray(children).some((child) =>
          hasMarkdownCodeBlock(child)
        )

        if (wrapsCustomCodeBlock) {
          return <>{children}</>
        }

        return <pre {...props}>{children}</pre>
      },
      blockquote: ({
        node: _node,
        ...props
      }: ExtraProps & React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
        <blockquote {...props} />
      ),
      table: ({
        node: _node,
        ...props
      }: ExtraProps & React.TableHTMLAttributes<HTMLTableElement>) => (
        <div className="markdown-table">
          <table {...props} />
        </div>
      ),
      th: ({
        node: _node,
        ...props
      }: ExtraProps & React.ThHTMLAttributes<HTMLTableCellElement>) => <th {...props} />,
      td: ({
        node: _node,
        ...props
      }: ExtraProps & React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...props} />,
      a: ({
        href,
        children,
        ...props
      }: React.ClassAttributes<HTMLAnchorElement> &
        React.AnchorHTMLAttributes<HTMLAnchorElement> &
        ExtraProps) => {
        if (!href) return <span {...props}>{children}</span>

        const safeHref = normalizeSafeHttpUrl(href)
        if (!safeHref) return <span {...props}>{children}</span>

        const source = findMatchingWebSource(safeHref, webSources)
        if (source) {
          return (
            <WebSourceCitation href={safeHref} source={source}>
              {children}
            </WebSourceCitation>
          )
        }

        return (
          <a
            {...props}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="markdown-link"
          >
            {children}
          </a>
        )
      },
      ul: ({ node: _node, ...props }: ExtraProps & React.HTMLAttributes<HTMLUListElement>) => (
        <ul {...props} />
      ),
      ol: ({ node: _node, ...props }: ExtraProps & React.OlHTMLAttributes<HTMLOListElement>) => (
        <ol {...props} />
      ),
      li: ({
        node: _node,
        children,
        ...props
      }: ExtraProps & React.LiHTMLAttributes<HTMLLIElement>) => <li {...props}>{children}</li>,
      h1: ({
        node: _node,
        children,
        ...props
      }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h1 {...props}>{children}</h1>,
      h2: ({
        node: _node,
        children,
        ...props
      }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
      h3: ({
        node: _node,
        children,
        ...props
      }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h3 {...props}>{children}</h3>,
      h4: ({
        node: _node,
        children,
        ...props
      }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h4 {...props}>{children}</h4>,
      h5: ({
        node: _node,
        children,
        ...props
      }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h5 {...props}>{children}</h5>,
      h6: ({
        node: _node,
        children,
        ...props
      }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h6 {...props}>{children}</h6>,
      p: ({
        node: _node,
        children,
        ...props
      }: ExtraProps & React.HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
    }),
    [
      copiedCode,
      isStreaming,
      content,
      SyntaxHighlighter,
      prismStyle,
      webSources,
      codeExecutionEnabled,
    ]
  )

  if (!loadAttempted) return <MarkdownSkeleton />

  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {content}
    </ReactMarkdown>
  )
})

export default function LazyMarkdown({
  content,
  className,
  webSources,
  isStreaming = false,
}: LazyMarkdownProps) {
  return (
    <Suspense fallback={<MarkdownSkeleton className={className} />}>
      <MarkdownContent content={content} webSources={webSources} isStreaming={isStreaming} />
    </Suspense>
  )
}
