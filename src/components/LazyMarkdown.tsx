// Lazy-loaded Markdown component for memory optimization
// Only loads when markdown content is actually displayed
import * as React from 'react'
const { Suspense, useState, useEffect, useMemo } = React
import { lazy } from 'react'
import { Check, Code2, Copy, LoaderCircle } from 'lucide-react'
import WebSourceCitation from './Dashboard/ChatArea/WebSourceCitation'
import type { WebSource } from './Dashboard/ChatArea/WebSourceCitation'
import MarkdownFileTree from './MarkdownFileTree'
import type { ExtraProps } from 'react-markdown'
import {
    getPreloadedMarkdown,
    waitForMarkdownPreload,
    type SyntaxHighlighterComponent,
} from '../utils/markdownPreloader'
import { normalizeSafeHttpUrl } from '../utils/urlSafety'
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

function getLanguageMeta(language?: string): LanguageMeta {
    if (!language) return { label: 'Code' }

    const normalized = language.toLowerCase()
    const aliases: Record<string, string> = {
        ts: 'typescript',
        js: 'javascript',
        py: 'python',
        sh: 'shell',
        bash: 'shell',
        zsh: 'shell',
        yml: 'yaml',
        md: 'markdown',
        plaintext: 'text',
        csharp: 'c#',
        cs: 'c#',
        cpp: 'c++',
        cxx: 'c++',
    }
    const key = aliases[normalized] ?? normalized

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
        'c++': { label: 'C++' },
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

// Pure helper: wraps bare tree-like blocks in code fences (no component state needed)
function injectTreeCodeFences(markdown: string): string {
    const lines = markdown.split('\n')
    const out: string[] = []

    const markerRe = /^(?:\s*(?:\|   )*|\s*(?:│   )*)?(?:├──|└──|\|--|\+--|\|[-─—]{2,}|\+[-─—]{2,}|├[-─—]{2,}|└[-─—]{2,})\s*/
    const allowedCharsRe = /^[\s\w.\-_/\\'"@(){}\[\]:,#+=<>|│├└─—]+$/

    const isTreeCandidateLine = (line: string) => {
        if (!line.trim()) return false
        if (!allowedCharsRe.test(line)) return false
        if (markerRe.test(line)) return true
        if (line.trim().endsWith('/')) return true
        return false
    }

    let i = 0
    while (i < lines.length) {
        const line = lines[i] ?? ''

        if (!isTreeCandidateLine(line)) {
            out.push(line)
            i += 1
            continue
        }

        let j = i
        let markerCount = 0
        const block: string[] = []

        while (j < lines.length) {
            const l = lines[j] ?? ''
            if (!l.trim()) break
            if (!allowedCharsRe.test(l)) break
            if (!isTreeCandidateLine(l) && !markerRe.test(l)) break
            if (markerRe.test(l)) markerCount += 1
            block.push(l)
            j += 1
        }

        if (block.length >= 3 && markerCount >= 2) {
            out.push('```tree')
            out.push(...block)
            out.push('```')
            i = j
            continue
        }

        out.push(line)
        i += 1
    }

    return out.join('\n')
}

// Pure helper: normalizes math delimiters for remark-math (no component state needed)
function normalizeMathDelimiters(
    markdown: string,
    options: { enableTreeFences?: boolean } = {}
): string {
    const { enableTreeFences = true } = options
    const parts = markdown.split(/```/)
    return parts.map((part, index) => {
        if (index % 2 !== 0) return part
        const unescaped = part.replace(/\\\\/g, '\\')

        const normalized = unescaped
            .replace(/\\\[/g, '$$')
            .replace(/\\\]/g, '$$')
            .replace(/\\\(/g, '$')
            .replace(/\\\)/g, '$')

        const withMathInline = normalized.replace(/`([^`]+)`/g, (match: string, content: string) => {
            const trimmedContent = content.trim()

            const isCodeLike = /\b(const|let|var|function|return|=>|;\s*$|[{}])\b/.test(content) ||
                /^\s*\w+\s*[=\(]\s*/.test(content)
            if (isCodeLike) return match

            if (/https?:\/\//.test(content)) return match

            if (/^(git|npm|yarn|pnpm|npx|pip|curl|wget|docker|cd|ls|cat|mkdir|rm|cp|mv|chmod|chown|ssh|scp)\s/.test(content)) return match
            if (/^[.~]?\//.test(content) || /\w\/\w.*\/\w/.test(content)) return match

            const hyphenSegments = trimmedContent.split('-').filter(Boolean)
            const looksLikeHyphenatedIdentifier =
                !/\s/.test(trimmedContent) &&
                hyphenSegments.length >= 2 &&
                hyphenSegments.every((segment: string) => /^[A-Za-z0-9@._/]+$/.test(segment)) &&
                hyphenSegments.filter((segment: string) => segment.length > 1).length >= 2
            if (looksLikeHyphenatedIdentifier) return match

            const hasMathChars = /[\\^_={}\[\]()*/+\-]/.test(content)
            const hasMathPattern = /[a-zA-Z]\s*[+\-*/=]\s*[a-zA-Z0-9]/.test(content)
            const hasGreekOrSubscript = /[α-ωΑ-ΩΔΣΠπ∞]|_[a-zA-Z0-9]/.test(content)
            const hasVariablePattern = /[a-zA-Z][(_][a-zA-Z0-9]/.test(content) || /Δ[a-zA-Z]/.test(content)
            
            if ((hasMathChars && hasMathPattern) || hasGreekOrSubscript || hasVariablePattern) {
                if (content.startsWith('$') || content.endsWith('$')) {
                    return `$${content}$`
                }
                if (/^[a-zA-Zα-ωΑ-ΩΔΣΠπ∞_]+$/.test(content.trim())) {
                    return `$${content}$`
                }
                return `$${content}$`
            }
            return match
        })

        const withMathLines = withMathInline.split('\n').map((line: string) => {
            const match = line.match(/^(\s*(?:[-*+]\s+)?)\[(.+)\]\s*$/)
            if (!match) return line
            const prefix = match[1] || ''
            const inner = (match[2] ?? '').trim()
            const formulaLike = /[\\^_={}]/.test(inner) || /[a-zA-Z]\s*[+\-*/=]\s*[a-zA-Z0-9]/.test(inner)
            if (!formulaLike) return line
            return `${prefix}$$${inner}$$`
        }).join('\n')

        return enableTreeFences ? injectTreeCodeFences(withMathLines) : withMathLines
    }).join('```')
}

const MarkdownContent = React.memo(function MarkdownContent({ content, webSources, isStreaming = false }: { content: string; webSources?: Map<string, WebSource>; isStreaming?: boolean }) {
    // Initialize from preloaded cache if available (avoids flash of unstyled content)
    const preloaded = getPreloadedMarkdown()
    // Wrap function/component values in arrow functions so React doesn't
    // call them as lazy initialisers (useState treats bare functions as initialisers).
    const [remarkPlugin, setRemarkPlugin] = useState<(() => void) | null>(() => preloaded.remarkGfm)
    const [remarkMath, setRemarkMath] = useState<(() => void) | null>(() => preloaded.remarkMath)
    const [rehypeKatex, setRehypeKatex] = useState<(() => void) | null>(() => preloaded.rehypeKatex)
    const [syntaxHighlighter, setSyntaxHighlighter] = useState<SyntaxHighlighterComponent | null>(() => preloaded.syntaxHighlighter)
    const [prismStyle, setPrismStyle] = useState<Record<string, React.CSSProperties> | null>(preloaded.prismStyle)
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
            if (cached.remarkMath) setRemarkMath(() => cached.remarkMath)
            if (cached.rehypeKatex) setRehypeKatex(() => cached.rehypeKatex)
            if (cached.syntaxHighlighter) setSyntaxHighlighter(() => cached.syntaxHighlighter)
            if (cached.prismStyle) setPrismStyle(cached.prismStyle)
            setLoadAttempted(true)
        })
        return () => { mounted = false }
    }, [loadAttempted])

    const SyntaxHighlighter = syntaxHighlighter
    // Memoize the normalized content to avoid re-running expensive math/tree
    // transformations on every render when content hasn't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const normalizedContent = useMemo(
        () => normalizeMathDelimiters(content, { enableTreeFences: !isStreaming }),
        [content, isStreaming]
    )
    const remarkPlugins = [remarkPlugin, remarkMath].filter(Boolean) as (() => void)[]
    const rehypePlugins = [rehypeKatex].filter(Boolean) as (() => void)[]

    // Memoize the components object to give ReactMarkdown a stable reference,
    // preventing it from doing a full internal reconciliation on every render.
    // Dependencies: anything the component renderers close over that can change.
    const components = useMemo(() => ({
                code(codeProps: React.ClassAttributes<HTMLElement> & React.HTMLAttributes<HTMLElement> & ExtraProps & { inline?: boolean }) {
                    const { className, children, node: _node, inline, ...props } = codeProps
                    const match = /language-([\w-]+)/.exec(className || '')
                    const codeString = Array.isArray(children) ? children.join('') : String(children ?? '')
                    const isInline = inline === true
                    const isCodeBlock = !isInline && (!!match || codeString.includes('\n'))

                    const language = match?.[1]?.toLowerCase()
                    
                    // Mermaid diagrams
                    const isMermaid = language === 'mermaid'
                    if (!isInline && isCodeBlock && isMermaid) {
                        const mermaidCode = codeString.replace(/\n$/, '')
                        // During streaming, if this mermaid block is still being generated
                        // (it's the trailing code block), show a static placeholder instead
                        // of repeatedly attempting expensive mermaid.render() with partial code.
                        const isMermaidStillStreaming = isStreaming && normalizedContent.trimEnd().endsWith(mermaidCode.trimEnd())

                        if (isMermaidStillStreaming) {
                            return (
                                <div style={{
                                    margin: '12px 0',
                                    padding: '48px 24px',
                                    borderRadius: '8px',
                                    background: 'var(--theme-surface)',
                                    border: '1px solid var(--theme-border)',
                                    textAlign: 'center',
                                    color: 'var(--theme-text-tertiary)'
                                }} className="markdown-mermaid-skeleton">
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        margin: '0 auto 12px',
                                        border: '3px solid var(--theme-border)',
                                        borderTopColor: 'var(--theme-accent)',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite'
                                    }} />
                                    <span style={{ display: 'block', fontSize: '0.8rem' }}>Generating diagram...</span>
                                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                                </div>
                            )
                        }

                        return (
                            <Suspense fallback={
                                <div style={{
                                    margin: '12px 0',
                                    padding: '48px 24px',
                                    borderRadius: '8px',
                                    background: 'var(--theme-surface)',
                                    border: '1px solid var(--theme-border)',
                                    textAlign: 'center',
                                    color: 'var(--theme-text-tertiary)'
                                }} className="markdown-mermaid-skeleton">
                                    <div style={{
                                        width: '120px',
                                        height: '12px',
                                        margin: '0 auto 12px',
                                        borderRadius: '4px',
                                        background: 'var(--theme-surface-hover)',
                                        animation: 'markdown-skeleton-pulse 1.5s ease-in-out infinite'
                                    }} />
                                    <div style={{
                                        width: '200px',
                                        height: '80px',
                                        margin: '0 auto',
                                        borderRadius: '6px',
                                        background: 'var(--theme-surface-hover)',
                                        animation: 'markdown-skeleton-pulse 1.5s ease-in-out infinite',
                                        animationDelay: '0.1s'
                                    }} />
                                    <span style={{ display: 'block', marginTop: '12px', fontSize: '0.8rem' }}>Loading diagram...</span>
                                </div>
                            }>
                                <MermaidDiagram code={mermaidCode} />
                            </Suspense>
                        )
                    }
                    
                    const isTreeLanguage = !!language && ['tree', 'dir', 'filetree', 'file-tree', 'zura-tree', 'zura_tree'].includes(language)
                    // Render file-tree view only when we have clear tree evidence.
                    // This avoids false positives for normal code/config blocks (e.g. .gitignore).
                    const hasVisualTreeMarkers = /^(?:\s*(?:\|   )*|\s*(?:│   )*)?(?:├──|└──|\|--|\+--|\|[-─—]{2,}|\+[-─—]{2,}|├[-─—]{2,}|└[-─—]{2,})\s+/m.test(codeString)
                    const hasFolderComments = /^\s*\S+\/\s*#\s+/m.test(codeString)
                    const hasIndentedHierarchy = /^(?:\s{2,}|\t+)\S/m.test(codeString)
                    const looksLikeTree = codeString.includes('\n') && (hasVisualTreeMarkers || (hasFolderComments && hasIndentedHierarchy))
                    const hasExplicitNonTreeLanguage = !!language && !isTreeLanguage
                    const isStructuredTreeLanguage = !!language && ['zura-tree', 'zura_tree', 'filetree', 'file-tree'].includes(language)
                    const shouldRenderTree = isStructuredTreeLanguage || (isTreeLanguage && looksLikeTree) || (!hasExplicitNonTreeLanguage && looksLikeTree)

                    if (!isInline && isCodeBlock && shouldRenderTree) {
                        return (
                            <MarkdownFileTree
                                language={language}
                                content={codeString.replace(/\n$/, '')}
                            />
                        )
                    }
                    
                    const normalizedCode = codeString.replace(/\n$/, '')
                    const codeFrameStyle: React.CSSProperties = {
                        position: 'relative',
                        margin: '4px 0',
                        borderRadius: '30px',
                        overflow: 'hidden',
                        border: '1px solid var(--theme-border)',
                        background: 'color-mix(in srgb, var(--theme-surface-active) 72%, black 28%)',
                        boxShadow: 'none'
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
                        lineHeight: 1
                    }
                    const codeGlyphWrapStyle: React.CSSProperties = {
                        width: '15px',
                        height: '15px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }
                    const codeGlyphStyle: React.CSSProperties = {
                        color: 'var(--theme-text-muted)',
                        display: 'block'
                    }
                    const codeHeaderLabelStyle: React.CSSProperties = {
                        color: 'var(--theme-text-primary)',
                        fontFamily: "'Google Sans Flex', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
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
                        textOverflow: 'ellipsis'
                    }
                    const codeBodyStyle: React.CSSProperties = {
                        margin: 0,
                        padding: '14px 16px 18px',
                        background: 'transparent',
                        overflowX: 'auto'
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
                        pointerEvents: isGenerating ? 'none' : 'auto'
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
                        pointerEvents: 'none'
                    })
                    const loadingSpinnerStyle: React.CSSProperties = {
                        display: 'block',
                        color: 'var(--theme-text-muted)',
                        animation: 'markdown-code-spin 900ms linear infinite',
                    }
                    const renderCodeHeader = (meta: LanguageMeta, isCopied: boolean, isGenerating: boolean, onCopy: () => void) => (
                        <div style={codeHeaderStyle}>
                            <span style={codeHeaderLeftStyle}>
                                <span style={codeGlyphWrapStyle} aria-hidden="true">
                                    <Code2 size={13} strokeWidth={2.2} style={codeGlyphStyle} />
                                </span>
                                <span style={codeHeaderLabelStyle}>{meta.label}</span>
                            </span>
                            <button
                                onClick={onCopy}
                                style={getCopyButtonStyle(isGenerating)}
                                title={isGenerating ? 'Generating code...' : (isCopied ? 'Copied!' : 'Copy code')}
                                aria-label={isGenerating ? 'Generating code' : (isCopied ? 'Copied code' : 'Copy code')}
                                onMouseEnter={(event) => {
                                    if (isGenerating) return
                                    event.currentTarget.style.background = 'color-mix(in srgb, var(--theme-surface-active) 42%, transparent)'
                                    event.currentTarget.style.borderColor = 'var(--theme-border-hover)'
                                }}
                                onMouseLeave={(event) => {
                                    if (isGenerating) return
                                    event.currentTarget.style.background = 'transparent'
                                    event.currentTarget.style.borderColor = 'color-mix(in srgb, var(--theme-border) 72%, transparent)'
                                }}
                            >
                                {isGenerating ? (
                                    <LoaderCircle size={16} style={loadingSpinnerStyle} />
                                ) : (
                                    <span style={iconSlotStyle}>
                                        <span style={getIconStateStyle(!isCopied)}>
                                            <Copy size={16} style={{ display: 'block', color: 'var(--theme-text-muted)' }} />
                                        </span>
                                        <span style={getIconStateStyle(isCopied)}>
                                            <Check size={16} style={{ display: 'block', color: 'var(--theme-success)' }} />
                                        </span>
                                    </span>
                                )}
                            </button>
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
                        const isGeneratingBlock = isStreaming && normalizedContent.trimEnd().endsWith(normalizedCode.trimEnd())

                        return (
                            <div style={codeFrameStyle} className="markdown-code-block">
                                {renderCodeHeader(languageMeta, isCopied, isGeneratingBlock, handleCopy)}
                                <SyntaxHighlighter
                                    {...props}
                                    children={normalizedCode}
                                    style={prismStyle}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={codeBodyStyle}
                                    useInlineStyles={false}
                                    codeTagProps={{
                                        style: {
                                            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                            fontSize: '0.95rem',
                                            lineHeight: '1.72',
                                            background: 'transparent',
                                        }
                                    }}
                                />
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
                        const isGeneratingBlock = isStreaming && normalizedContent.trimEnd().endsWith(normalizedCode.trimEnd())

                        return (
                            <div style={codeFrameStyle} className="markdown-code-block">
                                {renderCodeHeader(getLanguageMeta(), isCopied, isGeneratingBlock, handleCopy)}
                                <pre style={codeBodyStyle}>
                                    <code style={{
                                        color: 'var(--theme-text-primary)',
                                        whiteSpace: 'pre',
                                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                        fontSize: '0.95rem',
                                        lineHeight: '1.72',
                                    }}>
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
                pre: ({ node: _node, children, ...props }: ExtraProps & React.HTMLAttributes<HTMLPreElement>) => {
                    const wrapsCustomCodeBlock = React.Children.toArray(children).some((child) => hasMarkdownCodeBlock(child))

                    if (wrapsCustomCodeBlock) {
                        return <>{children}</>
                    }

                    return <pre {...props}>{children}</pre>
                },
                blockquote: ({ node: _node, ...props }: ExtraProps & React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => <blockquote {...props} />,
                table: ({ node: _node, ...props }: ExtraProps & React.TableHTMLAttributes<HTMLTableElement>) => (
                    <div className="markdown-table">
                        <table {...props} />
                    </div>
                ),
                th: ({ node: _node, ...props }: ExtraProps & React.ThHTMLAttributes<HTMLTableCellElement>) => <th {...props} />,
                td: ({ node: _node, ...props }: ExtraProps & React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...props} />,
                a: ({ href, children, ...props }: React.ClassAttributes<HTMLAnchorElement> & React.AnchorHTMLAttributes<HTMLAnchorElement> & ExtraProps) => {
                    if (!href) return <span {...props}>{children}</span>

                    const safeHref = normalizeSafeHttpUrl(href)
                    if (!safeHref) return <span {...props}>{children}</span>

                    const source = findMatchingWebSource(safeHref, webSources)
                    if (source) {
                        return <WebSourceCitation href={safeHref} source={source}>{children}</WebSourceCitation>
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
                ul: ({ node: _node, ...props }: ExtraProps & React.HTMLAttributes<HTMLUListElement>) => <ul {...props} />,
                ol: ({ node: _node, ...props }: ExtraProps & React.OlHTMLAttributes<HTMLOListElement>) => <ol {...props} />,
                h1: ({ node: _node, ...props }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h1 {...props} />,
                h2: ({ node: _node, ...props }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props} />,
                h3: ({ node: _node, ...props }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h3 {...props} />,
                h4: ({ node: _node, ...props }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h4 {...props} />,
                h5: ({ node: _node, ...props }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h5 {...props} />,
                h6: ({ node: _node, ...props }: ExtraProps & React.HTMLAttributes<HTMLHeadingElement>) => <h6 {...props} />,
                p: ({ node: _node, ...props }: ExtraProps & React.HTMLAttributes<HTMLParagraphElement>) => <p {...props} />
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [copiedCode, isStreaming, normalizedContent, SyntaxHighlighter, prismStyle, webSources])

    if (!loadAttempted) return <MarkdownSkeleton />

    return (
        <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={components}
        >
            {normalizedContent}
        </ReactMarkdown>
    )
})

export default function LazyMarkdown({ content, className, webSources, isStreaming = false }: LazyMarkdownProps) {
    return (
        <Suspense fallback={<MarkdownSkeleton className={className} />}>
            <MarkdownContent content={content} webSources={webSources} isStreaming={isStreaming} />
        </Suspense>
    )
}
