// Lazy-loaded Markdown component for memory optimization
// Only loads when markdown content is actually displayed
import * as React from 'react'
const { Suspense, useState, useEffect } = React
import { lazy } from 'react'
import { Check, Code2, Copy, LoaderCircle } from 'lucide-react'
import WebSourceCitation from './Dashboard/ChatArea/WebSourceCitation'
import type { WebSource } from './Dashboard/ChatArea/WebSourceCitation'
import MarkdownFileTree from './MarkdownFileTree'
import type { ExtraProps } from 'react-markdown'
import { getPreloadedMarkdown, waitForMarkdownPreload } from '../utils/markdownPreloader'
const MermaidDiagram = lazy(() => import('./MermaidDiagram'))

// Lazy load react-markdown component (plugins are handled by markdownPreloader)
const ReactMarkdown = lazy(() => import('react-markdown'))

interface LazyMarkdownProps {
    content: string
    className?: string
    webSources?: Map<string, WebSource>
    isStreaming?: boolean
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

function MarkdownContent({ content, webSources, isStreaming = false }: { content: string; webSources?: Map<string, WebSource>; isStreaming?: boolean }) {
    // Initialize from preloaded cache if available (avoids flash of unstyled content)
    const preloaded = getPreloadedMarkdown()
    // Wrap function/component values in arrow functions so React doesn't
    // call them as lazy initialisers (useState treats bare functions as initialisers).
    const [remarkPlugin, setRemarkPlugin] = useState<(() => void) | null>(() => preloaded.remarkGfm)
    const [remarkMath, setRemarkMath] = useState<(() => void) | null>(() => preloaded.remarkMath)
    const [rehypeKatex, setRehypeKatex] = useState<(() => void) | null>(() => preloaded.rehypeKatex)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [syntaxHighlighter, setSyntaxHighlighter] = useState<React.ComponentType<any> | null>(() => preloaded.syntaxHighlighter)
    const [prismStyle, setPrismStyle] = useState<Record<string, React.CSSProperties> | null>(preloaded.prismStyle)
    const [copiedCode, setCopiedCode] = useState<string | null>(null)
    const [loadAttempted, setLoadAttempted] = useState(preloaded.ready)

    const injectTreeCodeFences = (markdown: string) => {
        const lines = markdown.split('\n')
        const out: string[] = []

        const markerRe = /^(?:\s*(?:\|   )*|\s*(?:│   )*)?(?:├──|└──|\|--|\+--|\|[-─—]{2,}|\+[-─—]{2,}|├[-─—]{2,}|└[-─—]{2,})\s*/
        const allowedCharsRe = /^[\s\w.\-_/\\'"@(){}\[\]:,#+=<>|│├└─—]+$/

        const isTreeCandidateLine = (line: string) => {
            if (!line.trim()) return false
            if (!allowedCharsRe.test(line)) return false
            if (markerRe.test(line)) return true
            // Root lines often look like "foo/" or "foo" (top label)
            if (line.trim().endsWith('/')) return true
            return false
        }

        let i = 0
        while (i < lines.length) {
            const line = lines[i] ?? ''

            // Try to detect a contiguous tree block.
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

            // Not confident; emit the original line and continue.
            out.push(line)
            i += 1
        }

        return out.join('\n')
    }

    const normalizeMathDelimiters = (markdown: string) => {
        const parts = markdown.split(/```/)
        return parts.map((part, index) => {
            if (index % 2 !== 0) return part
            // LLM responses often double-escape backslashes (e.g. "\\[" or "\\frac").
            // Outside of code fences, reduce double backslashes to single so remark-math/MathJax can parse.
            const unescaped = part.replace(/\\\\/g, '\\')

            const normalized = unescaped
                .replace(/\\\[/g, '$$')
                .replace(/\\\]/g, '$$')
                .replace(/\\\(/g, '$')
                .replace(/\\\)/g, '$')

            // Convert inline code that looks like math formulas to proper math syntax
            // Match backtick-wrapped content that contains math-like characters
            const withMathInline = normalized.replace(/`([^`]+)`/g, (match, content) => {
                const trimmedContent = content.trim()

                // Skip code-like content - do not convert to math (e.g. `const x = 1`)
                const isCodeLike = /\b(const|let|var|function|return|=>|;\s*$|[{}])\b/.test(content) ||
                    /^\s*\w+\s*[=\(]\s*/.test(content) // e.g. "const " or "fn("
                if (isCodeLike) return match

                // Skip content containing URLs - URLs have slashes that false-positive as math
                if (/https?:\/\//.test(content)) return match

                // Skip content that looks like shell commands or file paths
                if (/^(git|npm|yarn|pnpm|npx|pip|curl|wget|docker|cd|ls|cat|mkdir|rm|cp|mv|chmod|chown|ssh|scp)\s/.test(content)) return match
                if (/^[.~]?\//.test(content) || /\w\/\w.*\/\w/.test(content)) return match

                // Skip common hyphenated identifiers/package names (e.g. electron-builder)
                // so they stay as inline code instead of being interpreted as math subtraction.
                const hyphenSegments = trimmedContent.split('-').filter(Boolean)
                const looksLikeHyphenatedIdentifier =
                    !/\s/.test(trimmedContent) &&
                    hyphenSegments.length >= 2 &&
                    hyphenSegments.every((segment) => /^[A-Za-z0-9@._/]+$/.test(segment)) &&
                    hyphenSegments.filter((segment) => segment.length > 1).length >= 2
                if (looksLikeHyphenatedIdentifier) return match

                // Check if content looks like a math formula
                const hasMathChars = /[\\^_={}\[\]()*/+\-]/.test(content)
                const hasMathPattern = /[a-zA-Z]\s*[+\-*/=]\s*[a-zA-Z0-9]/.test(content)
                // Extended Greek letters including Δ (Delta), Σ (Sigma), π (pi), ∞ (infinity)
                const hasGreekOrSubscript = /[α-ωΑ-ΩΔΣΠπ∞]|_[a-zA-Z0-9]/.test(content)
                // Variables with subscripts like x_i, f(x), Δx
                const hasVariablePattern = /[a-zA-Z][(_][a-zA-Z0-9]/.test(content) || /Δ[a-zA-Z]/.test(content)
                
                if ((hasMathChars && hasMathPattern) || hasGreekOrSubscript || hasVariablePattern) {
                    // Check if it's already wrapped in $ or $$
                    if (content.startsWith('$') || content.endsWith('$')) {
                        return `$${content}$`
                    }
                    // Single letter variables like `ρ`, `H`, `U`, `Δ` should be inline math
                    if (/^[a-zA-Zα-ωΑ-ΩΔΣΠπ∞_]+$/.test(content.trim())) {
                        return `$${content}$`
                    }
                    // Multi-character formulas
                    return `$${content}$`
                }
                return match
            })

            const withMathLines = withMathInline.split('\n').map(line => {
                const match = line.match(/^(\s*(?:[-*+]\s+)?)\[(.+)\]\s*$/)
                if (!match) return line
                const prefix = match[1] || ''
                const inner = match[2].trim()
                const formulaLike = /[\\^_={}]/.test(inner) || /[a-zA-Z]\s*[+\-*/=]\s*[a-zA-Z0-9]/.test(inner)
                if (!formulaLike) return line
                return `${prefix}$$${inner}$$`
            }).join('\n')

            return injectTreeCodeFences(withMathLines)
        }).join('```')
    }

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

    if (!loadAttempted) return <MarkdownSkeleton />

    const SyntaxHighlighter = syntaxHighlighter
    const normalizedContent = normalizeMathDelimiters(content)
    const remarkPlugins = [remarkPlugin, remarkMath].filter(Boolean) as (() => void)[]
    const rehypePlugins = [rehypeKatex].filter(Boolean) as (() => void)[]

    return (
        <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={{
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
                                <MermaidDiagram code={codeString.replace(/\n$/, '')} />
                            </Suspense>
                        )
                    }
                    
                    const isTreeLanguage = !!language && ['tree', 'dir', 'filetree', 'file-tree', 'zura-tree', 'zura_tree'].includes(language)
                    // Match tree-style markers: ├──, └──, ├─, └─, |--, +--, etc.
                    const treeMarkerRegex = /[├└│┌┐┤┴┼].*[─-]|^\s*[|+][-─—]|^\s+\S+\s*#/gm
                    const markerCount = Array.from(codeString.matchAll(treeMarkerRegex)).length
                    const hasFolderComments = /^\s*\S+\/\s*#\s+/m.test(codeString)
                    const hasTreeMarkers = /^\s*[├└│]\s*[─-]/m.test(codeString)
                    const looksLikeTree = (markerCount > 0 || hasFolderComments || hasTreeMarkers) && codeString.includes('\n')

                    if (!isInline && isCodeBlock && (isTreeLanguage || looksLikeTree)) {
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
                        border: '1px solid #3A3C40',
                        background: '#202226',
                        boxShadow: 'none'
                    }
                    const codeHeaderStyle: React.CSSProperties = {
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '13px 56px 9px 16px',
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
                        color: '#B5C2DC',
                        display: 'block'
                    }
                    const codeHeaderLabelStyle: React.CSSProperties = {
                        color: '#D9E2F3',
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
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#B5C2DC',
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
                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
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
                        color: '#B5C2DC',
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
                                    event.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                                    event.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)'
                                }}
                                onMouseLeave={(event) => {
                                    if (isGenerating) return
                                    event.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
                                    event.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                                }}
                            >
                                {isGenerating ? (
                                    <LoaderCircle size={16} style={loadingSpinnerStyle} />
                                ) : (
                                    <span style={iconSlotStyle}>
                                        <span style={getIconStateStyle(!isCopied)}>
                                            <Copy size={16} style={{ display: 'block', color: '#B5C2DC' }} />
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
                                    codeTagProps={{
                                        style: {
                                            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                            fontSize: '0.95rem',
                                            lineHeight: '1.72',
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
                                        color: '#E6ECF8',
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
                blockquote: ({ node, ...props }) => <blockquote {...props} />,
                table: ({ node, ...props }) => (
                    <div className="markdown-table">
                        <table {...props} />
                    </div>
                ),
                th: ({ node, ...props }) => <th {...props} />,
                td: ({ node, ...props }) => <td {...props} />,
                a: ({ href, children, ...props }: React.ClassAttributes<HTMLAnchorElement> & React.AnchorHTMLAttributes<HTMLAnchorElement> & ExtraProps) => {
                    if (!href) return <span {...props}>{children}</span>
                    let source = webSources?.get(href) || webSources?.get(href.replace(/\/+$/, ''))
                    if (!source) {
                        try {
                            const hostname = new URL(href, 'https://x').hostname
                            source = { title: hostname || 'Link', url: href }
                        } catch {
                            source = { title: 'Link', url: href }
                        }
                    }
                    return <WebSourceCitation href={href} source={source}>{children}</WebSourceCitation>
                },
                ul: ({ node, ...props }) => <ul {...props} />,
                ol: ({ node, ...props }) => <ol {...props} />,
                h1: ({ node, ...props }) => <h1 {...props} />,
                h2: ({ node, ...props }) => <h2 {...props} />,
                h3: ({ node, ...props }) => <h3 {...props} />,
                h4: ({ node, ...props }) => <h4 {...props} />,
                h5: ({ node, ...props }) => <h5 {...props} />,
                h6: ({ node, ...props }) => <h6 {...props} />,
                p: ({ node, ...props }) => <p {...props} />
            }}
        >
            {normalizedContent}
        </ReactMarkdown>
    )
}

export default function LazyMarkdown({ content, className, webSources, isStreaming = false }: LazyMarkdownProps) {
    return (
        <Suspense fallback={<MarkdownSkeleton className={className} />}>
            <MarkdownContent content={content} webSources={webSources} isStreaming={isStreaming} />
        </Suspense>
    )
}
