import { useState, useEffect, useRef, useId } from 'react'
import { Copy, Check, Code, AlertCircle, Maximize2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface MermaidDiagramProps {
  code: string
}

interface MermaidRenderResult {
  svg: string
}

interface MermaidRuntime {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, code: string) => Promise<MermaidRenderResult>
}

function isMermaidRuntime(value: unknown): value is MermaidRuntime {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.initialize === 'function' && typeof candidate.render === 'function'
}

// Lazy load mermaid
const mermaidPromise = import('mermaid')

// Track if mermaid has been initialized
let mermaidInitialized = false
let mermaidInstance: MermaidRuntime | null = null

export default function MermaidDiagram({ code }: MermaidDiagramProps) {
  const isValidCode = typeof code === 'string' && code.trim().length > 0
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSource, setShowSource] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const uniqueId = useId().replace(/:/g, '-') // Replace colons with dashes for valid HTML id

  // Detect theme changes
  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'))
    }

    checkTheme()

    // Watch for theme changes via MutationObserver
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  // Track the last successfully rendered code to avoid redundant renders
  const lastRenderedCodeRef = useRef<string>('')

  useEffect(() => {
    if (!isValidCode) {
      setSvg(null)
      setError(null)
      setIsLoading(false)
      return
    }

    let mounted = true
    let timeoutId: NodeJS.Timeout | null = null
    let debounceId: NodeJS.Timeout | null = null

    const renderDiagram = async () => {
      // Skip if code hasn't changed since last successful render (and theme is the same)
      const cacheKey = `${code.trim()}::${isDark}`
      if (lastRenderedCodeRef.current === cacheKey) {
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        timeoutId = setTimeout(() => {
          if (mounted) {
            setError('Diagram rendering timed out. Please check the mermaid syntax.')
            setIsLoading(false)
          }
        }, 10000) // 10 second timeout

        const mermaidModule = await mermaidPromise

        if (!mermaidInstance) {
          const mermaidCandidate =
            mermaidModule.default ||
            (mermaidModule as Record<string, unknown>).mermaid ||
            mermaidModule

          if (!isMermaidRuntime(mermaidCandidate)) {
            const availableKeys =
              typeof mermaidCandidate === 'object' && mermaidCandidate !== null
                ? Object.keys(mermaidCandidate as Record<string, unknown>).join(', ')
                : 'none'
            console.error('[MermaidDiagram] Mermaid runtime shape is invalid', {
              availableKeys,
            })
            throw new Error(
              `Mermaid instance is missing required methods. Available keys: ${availableKeys}`
            )
          }

          mermaidInstance = mermaidCandidate
        }

        // Bail out early if unmounted during async init
        if (!mounted) return

        if (!mermaidInitialized) {
          mermaidInstance.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: isDark ? 'dark' : 'default',
            themeVariables: {
              // Match app's theme colors
              primaryColor: isDark ? '#3b82f6' : '#2563eb',
              primaryTextColor: isDark ? '#e0e0e0' : '#1a1a1a',
              primaryBorderColor: isDark ? '#3b82f6' : '#2563eb',
              lineColor: isDark ? '#666' : '#999',
              secondaryColor: isDark ? '#1e1e1e' : '#f5f5f5',
              tertiaryColor: isDark ? '#2a2a2a' : '#ffffff',
              background: isDark ? '#1a1a1a' : '#ffffff',
              mainBkgColor: isDark ? '#1a1a1a' : '#ffffff',
              secondaryBkgColor: isDark ? '#2a2a2a' : '#f5f5f5',
              textColor: isDark ? '#e0e0e0' : '#1a1a1a',
              secondaryTextColor: isDark ? '#aaa' : '#666',
              tertiaryTextColor: isDark ? '#888' : '#999',
              secondaryBorderColor: isDark ? '#444' : '#ddd',
              tertiaryBorderColor: isDark ? '#333' : '#eee',
              noteBkgColor: isDark ? '#2a2a2a' : '#f5f5f5',
              noteTextColor: isDark ? '#e0e0e0' : '#1a1a1a',
              noteBorderColor: isDark ? '#444' : '#ddd',
              actorBorder: isDark ? '#444' : '#ddd',
              actorBkg: isDark ? '#2a2a2a' : '#f5f5f5',
              actorTextColor: isDark ? '#e0e0e0' : '#1a1a1a',
              actorLineColor: isDark ? '#666' : '#999',
              signalColor: isDark ? '#e0e0e0' : '#1a1a1a',
              signalTextColor: isDark ? '#e0e0e0' : '#1a1a1a',
              labelBoxBkgColor: isDark ? '#2a2a2a' : '#f5f5f5',
              labelBoxBorderColor: isDark ? '#444' : '#ddd',
              labelTextColor: isDark ? '#e0e0e0' : '#1a1a1a',
              loopTextColor: isDark ? '#e0e0e0' : '#1a1a1a',
              activationBorderColor: isDark ? '#3b82f6' : '#2563eb',
              activationBkgColor: isDark ? '#1e3a5f' : '#dbeafe',
              sequenceNumberColor: isDark ? '#fff' : '#000',
              sectionBkgColor: isDark ? '#2a2a2a' : '#f5f5f5',
              altSectionBkgColor: isDark ? '#1e1e1e' : '#ffffff',
              sectionBkgColor2: isDark ? '#1e1e1e' : '#ffffff',
              excludeBkgColor: isDark ? '#1a1a1a' : '#ffffff',
              excludeBorderColor: isDark ? '#444' : '#ddd',
              critBorderColor: isDark ? '#ef4444' : '#dc2626',
              critBkgColor: isDark ? '#7f1d1d' : '#fee2e2',
              doneBkgColor: isDark ? '#1e3a5f' : '#dbeafe',
              doneBorderColor: isDark ? '#3b82f6' : '#2563eb',
              taskBkgColor: isDark ? '#2a2a2a' : '#f5f5f5',
              taskTextColor: isDark ? '#e0e0e0' : '#1a1a1a',
              taskTextLightColor: isDark ? '#aaa' : '#666',
              taskTextOutsideColor: isDark ? '#aaa' : '#666',
              taskTextClickableColor: isDark ? '#60a5fa' : '#2563eb',
              activeTaskBorderColor: isDark ? '#3b82f6' : '#2563eb',
              activeTaskBkgColor: isDark ? '#1e3a5f' : '#dbeafe',
              gridColor: isDark ? '#444' : '#ddd',
              doneTaskBkgColor: isDark ? '#1e3a5f' : '#dbeafe',
              doneTaskBorderColor: isDark ? '#3b82f6' : '#2563eb',
              critTaskBkgColor: isDark ? '#7f1d1d' : '#fee2e2',
              critTaskBorderColor: isDark ? '#ef4444' : '#dc2626',
              taskLineColor: isDark ? '#666' : '#999',
              labelColor: isDark ? '#e0e0e0' : '#1a1a1a',
              errorBkgColor: isDark ? '#7f1d1d' : '#fee2e2',
              errorTextColor: isDark ? '#fca5a5' : '#dc2626',
            },
          })
          mermaidInitialized = true
        } else {
          mermaidInstance.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: isDark ? 'dark' : 'default',
          })
        }

        const trimmedCode = code.trim()
        if (!trimmedCode) {
          throw new Error('Mermaid diagram code is empty')
        }

        const renderId = `mermaid-${uniqueId}`

        // mermaid.render() returns a Promise that resolves to { svg, bindFunctions }
        const result = await mermaidInstance.render(renderId, trimmedCode)

        if (!result) {
          throw new Error('Mermaid render returned null or undefined')
        }

        if (!result.svg) {
          throw new Error('Mermaid render returned result without svg property')
        }

        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        if (mounted) {
          lastRenderedCodeRef.current = cacheKey
          setSvg(result.svg)
          setIsLoading(false)
        }
      } catch (err: unknown) {
        console.error('[MermaidDiagram] Rendering error:', err)
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        if (mounted) {
          const errorMessage =
            err instanceof Error && err.message
              ? err.message
              : typeof err === 'string'
                ? err
                : 'Failed to render mermaid diagram'
          setError(errorMessage)
          setIsLoading(false)
        }
      }
    }

    // Debounce the render call to prevent rapid re-renders when code
    // changes quickly (e.g. multiple diagrams in a message during edits).
    // Use a short debounce (300ms) so completed diagrams still feel responsive.
    debounceId = setTimeout(renderDiagram, 300)

    return () => {
      mounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (debounceId) {
        clearTimeout(debounceId)
      }
    }
  }, [code, isDark, isValidCode, uniqueId])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isValidCode) {
    return (
      <div
        style={{
          margin: '12px 0',
          padding: '12px',
          borderRadius: '8px',
          background: 'var(--theme-error-bg)',
          border: '1px solid var(--theme-error)',
          color: 'var(--theme-error)',
          fontSize: '0.9rem',
        }}
      >
        <AlertCircle
          size={16}
          style={{ display: 'inline-block', marginRight: '8px', verticalAlign: 'middle' }}
        />
        Invalid mermaid diagram code
      </div>
    )
  }

  if (showSource) {
    return (
      <div
        style={{
          margin: '12px 0',
          borderRadius: '8px',
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            backgroundColor: 'var(--theme-surface)',
            borderBottom: '1px solid var(--theme-border)',
            fontSize: '0.75rem',
            color: 'var(--theme-text-tertiary)',
          }}
        >
          <span>mermaid</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowSource(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--theme-text-tertiary)',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--theme-surface-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
            >
              Diagram
            </button>
            <button
              onClick={handleCopy}
              style={{
                background: 'none',
                border: 'none',
                color: copied ? 'var(--theme-success)' : 'var(--theme-text-tertiary)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? (
                <Check size={14} style={{ display: 'block' }} />
              ) : (
                <Copy size={14} style={{ display: 'block' }} />
              )}
            </button>
          </div>
        </div>
        <div
          style={{
            padding: '12px 16px',
            overflowX: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.9em',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--theme-text-secondary)',
          }}
        >
          {code}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        margin: '12px 0',
        borderRadius: '8px',
        background: 'var(--theme-surface)',
        border: '1px solid var(--theme-border)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          backgroundColor: 'var(--theme-surface)',
          borderBottom: '1px solid var(--theme-border)',
          fontSize: '0.75rem',
          color: 'var(--theme-text-tertiary)',
        }}
      >
        <span>Mermaid Diagram</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setIsFullscreen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--theme-text-tertiary)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--theme-surface-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
            title="View Fullscreen"
          >
            <Maximize2 size={12} />
            Fullscreen
          </button>
          <button
            onClick={() => setShowSource(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--theme-text-tertiary)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--theme-surface-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
            title="View Source"
          >
            <Code size={12} />
            Source
          </button>
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              color: copied ? 'var(--theme-success)' : 'var(--theme-text-tertiary)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? (
              <Check size={14} style={{ display: 'block' }} />
            ) : (
              <Copy size={14} style={{ display: 'block' }} />
            )}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          padding: '16px',
          maxHeight: '600px',
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          background: 'var(--theme-surface)',
          minHeight: isLoading ? '200px' : 'auto',
        }}
      >
        {isLoading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: 'var(--theme-text-tertiary)',
              fontSize: '0.9rem',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid var(--theme-border)',
                borderTopColor: 'var(--theme-accent)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span>Rendering diagram...</span>
          </div>
        )}

        {error && (
          <div
            style={{
              width: '100%',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--theme-error)',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              <AlertCircle size={16} />
              <span>Failed to render diagram</span>
            </div>
            <div
              style={{
                padding: '12px',
                borderRadius: '6px',
                background: 'var(--theme-error-bg)',
                border: '1px solid var(--theme-error)',
                fontSize: '0.85rem',
                color: 'var(--theme-error)',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {error}
            </div>
            <details style={{ marginTop: '8px' }}>
              <summary
                style={{
                  cursor: 'pointer',
                  color: 'var(--theme-text-secondary)',
                  fontSize: '0.85rem',
                  marginBottom: '8px',
                }}
              >
                View Source Code
              </summary>
              <div
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-border)',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--theme-text-secondary)',
                }}
              >
                {code}
              </div>
            </details>
          </div>
        )}

        {svg && !error && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent
          style={{
            maxWidth: '95vw',
            maxHeight: '95vh',
            width: '95vw',
            height: '95vh',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            margin: '2.5vh auto',
          }}
        >
          <DialogHeader
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--theme-border)',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <DialogTitle style={{ margin: 0, fontSize: '1rem', fontWeight: 500 }}>
              Mermaid Diagram - Fullscreen
            </DialogTitle>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={handleCopy}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? 'var(--theme-success)' : 'var(--theme-text-tertiary)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '4px',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={copied ? 'Copied!' : 'Copy Source'}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </DialogHeader>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '24px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              background: 'var(--theme-surface)',
              minHeight: 0,
            }}
          >
            {isLoading && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: 'var(--theme-text-tertiary)',
                  fontSize: '0.9rem',
                  height: '100%',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid var(--theme-border)',
                    borderTopColor: 'var(--theme-accent)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span>Rendering diagram...</span>
              </div>
            )}

            {error && (
              <div
                style={{
                  width: '100%',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--theme-error)',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                  }}
                >
                  <AlertCircle size={16} />
                  <span>Failed to render diagram</span>
                </div>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: 'var(--theme-error-bg)',
                    border: '1px solid var(--theme-error)',
                    fontSize: '0.85rem',
                    color: 'var(--theme-error)',
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {error}
                </div>
              </div>
            )}

            {svg && !error && (
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
