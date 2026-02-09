// Lazy-loaded Markdown component for memory optimization
// Only loads when markdown content is actually displayed
import * as React from 'react'
const { Suspense, useState, useEffect } = React
import { lazy } from 'react'
import { Check, Copy } from 'lucide-react'
import WebSourceCitation from './Dashboard/ChatArea/WebSourceCitation'
import type { WebSource } from './Dashboard/ChatArea/WebSourceCitation'
import MarkdownFileTree from './MarkdownFileTree'
const MermaidDiagram = lazy(() => import('./MermaidDiagram'))

// Lazy load markdown dependencies
const ReactMarkdown = lazy(() => import('react-markdown'))
const remarkGfmPromise = import('remark-gfm')
const remarkMathPromise = import('remark-math')
const rehypeKatexPromise = import('rehype-katex')
const PrismSyntaxHighlighter = lazy(() => import('react-syntax-highlighter').then(m => ({ default: m.Prism })))
const prismStylesPromise = import('react-syntax-highlighter/dist/esm/styles/prism')

interface LazyMarkdownProps {
    content: string
    className?: string
    webSources?: Map<string, WebSource>
}

// Remark plugin wrapper
async function getRemarkGfm() {
    const mod = await remarkGfmPromise
    return mod.default
}

async function getRemarkMath() {
    const mod = await remarkMathPromise
    return mod.default
}

async function getRehypeKatex() {
    const mod = await rehypeKatexPromise
    return mod.default
}

// Syntax highlighter wrapper
async function getPrismStyles() {
    const mod = await prismStylesPromise
    return mod.vscDarkPlus
}

function MarkdownContent({ content, webSources }: { content: string; webSources?: Map<string, WebSource> }) {
    const [remarkPlugin, setRemarkPlugin] = useState<any>(null)
    const [remarkMath, setRemarkMath] = useState<any>(null)
    const [rehypeKatex, setRehypeKatex] = useState<any>(null)
    const [syntaxHighlighter, setSyntaxHighlighter] = useState<any>(null)
    const [prismStyle, setPrismStyle] = useState<any>(null)
    const [copiedCode, setCopiedCode] = useState<string | null>(null)
    const [loadAttempted, setLoadAttempted] = useState(false)

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
        let mounted = true
        ;(async () => {
            const results = await Promise.allSettled([
                getRemarkGfm(),
                getRemarkMath(),
                getRehypeKatex(),
                import('react-syntax-highlighter').then(m => m.Prism),
                getPrismStyles()
            ])

            if (!mounted) return

            const [gfm, math, katex, highlighter, style] = results

            if (gfm.status === 'fulfilled') setRemarkPlugin(() => gfm.value)
            if (math.status === 'fulfilled') setRemarkMath(() => math.value)
            if (katex.status === 'fulfilled') setRehypeKatex(() => katex.value)
            if (highlighter.status === 'fulfilled') setSyntaxHighlighter(() => highlighter.value)
            if (style.status === 'fulfilled') setPrismStyle(style.value)

            setLoadAttempted(true)
        })()
        return () => { mounted = false }
    }, [])

    if (!loadAttempted) return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>

    const SyntaxHighlighter = syntaxHighlighter
    const normalizedContent = normalizeMathDelimiters(content)
    const remarkPlugins = [remarkPlugin, remarkMath].filter(Boolean)
    const rehypePlugins = [rehypeKatex].filter(Boolean)

    return (
        <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={{
                code({ node, inline, className, children, ...props }: any) {
                    const match = /language-([\w-]+)/.exec(className || '')
                    const codeString = Array.isArray(children) ? children.join('') : String(children ?? '')
                    const isInline = inline === true
                    // Determine if this is a code block: not inline and has language OR has newlines
                    const isCodeBlock = !isInline && (!!match || codeString.includes('\n'))

                    const language = match?.[1]?.toLowerCase()
                    
                    // Mermaid diagrams
                    const isMermaid = language === 'mermaid'
                    if (!isInline && isCodeBlock && isMermaid) {
                        return (
                            <Suspense fallback={
                                <div style={{
                                    margin: '12px 0',
                                    padding: '16px',
                                    borderRadius: '8px',
                                    background: 'var(--theme-surface)',
                                    border: '1px solid var(--theme-border)',
                                    textAlign: 'center',
                                    color: 'var(--theme-text-tertiary)'
                                }}>
                                    Loading diagram...
                                </div>
                            }>
                                <MermaidDiagram code={codeString.replace(/\n$/, '')} />
                            </Suspense>
                        )
                    }
                    
                    const isTreeLanguage = !!language && ['tree', 'dir', 'filetree', 'file-tree', 'zura-tree', 'zura_tree'].includes(language)
                    // Match tree-style markers: ├──, └──, ├─, └─, |--, +--, etc.
                    // Also match simple indented trees with branch characters
                    const treeMarkerRegex = /[├└│┌┐┤┴┼].*[─-]|^\s*[|+][-─—]|^\s+\S+\s*#/gm
                    const markerCount = Array.from(codeString.matchAll(treeMarkerRegex)).length
                    // Also check for folder/file patterns with comments (like "folder/  # comment")
                    const hasFolderComments = /^\s*\S+\/\s*#\s+/m.test(codeString)
                    // Check for tree markers at line starts
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
                    
                    if (isCodeBlock && match && SyntaxHighlighter && prismStyle) {
                        // Code block with language - syntax highlighted
                        const isCopied = copiedCode === codeString
                        const handleCopy = () => {
                            navigator.clipboard.writeText(codeString)
                            setCopiedCode(codeString)
                            setTimeout(() => setCopiedCode(null), 2000)
                        }
                        return (
                            <div style={{ position: 'relative', margin: '12px 0' }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '8px 12px',
                                    backgroundColor: 'var(--theme-surface)',
                                    borderTopLeftRadius: '8px',
                                    borderTopRightRadius: '8px',
                                    fontSize: '0.75rem',
                                    color: 'var(--theme-text-tertiary)'
                                }}>
                                    <span>{match[1]}</span>
                                    <button
                                        onClick={handleCopy}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: isCopied ? 'var(--theme-success)' : 'var(--theme-text-tertiary)',
                                            cursor: 'pointer',
                                            padding: '4px',
                                            borderRadius: '4px',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            lineHeight: 1
                                        }}
                                        title={isCopied ? 'Copied!' : 'Copy'}
                                    >
                                        {isCopied ? <Check size={14} style={{ display: 'block' }} /> : <Copy size={14} style={{ display: 'block' }} />}
                                    </button>
                                </div>
                                <SyntaxHighlighter
                                    {...props}
                                    children={codeString.replace(/\n$/, '')}
                                    style={prismStyle}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', background: 'var(--theme-surface)' }}
                                />
                            </div>
                        )
                    } else if (isCodeBlock) {
                        // Code block without language - plain block
                        const codeContent = String(children)
                        const isCopied = copiedCode === codeContent
                        const handleCopy = () => {
                            navigator.clipboard.writeText(codeContent)
                            setCopiedCode(codeContent)
                            setTimeout(() => setCopiedCode(null), 2000)
                        }
                        return (
                            <div style={{
                                margin: '12px 0',
                                borderRadius: '8px',
                                background: 'var(--theme-surface)',
                                border: '1px solid var(--theme-border)',
                                overflow: 'hidden',
                                position: 'relative'
                            }}>
                                <button
                                    onClick={handleCopy}
                                    style={{
                                        position: 'absolute',
                                        top: '8px',
                                        right: '12px',
                                        background: 'none',
                                        border: 'none',
                                        color: isCopied ? 'var(--theme-success)' : 'var(--theme-text-tertiary)',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        borderRadius: '4px',
                                        transition: 'all 0.2s ease',
                                        zIndex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        lineHeight: 1
                                    }}
                                    title={isCopied ? 'Copied!' : 'Copy'}
                                >
                                    {isCopied ? <Check size={14} style={{ display: 'block' }} /> : <Copy size={14} style={{ display: 'block' }} />}
                                </button>
                                <div style={{
                                    padding: '12px 16px',
                                    overflowX: 'auto',
                                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                    fontSize: '0.9em',
                                    lineHeight: '1.6',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    color: 'var(--theme-text-secondary)',
                                    paddingTop: '36px'
                                }}>
                                    {children}
                                </div>
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
                a: ({ node, href, children, ...props }: any) => {
                    if (href && webSources && webSources.size > 0) {
                        const source = webSources.get(href) || webSources.get(href.replace(/\/+$/, ''))
                        if (source) {
                            return <WebSourceCitation href={href} source={source}>{children}</WebSourceCitation>
                        }
                    }
                    return (
                        <a target="_blank" rel="noopener noreferrer" href={href} {...props}>{children}</a>
                    )
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

export default function LazyMarkdown({ content, className, webSources }: LazyMarkdownProps) {
    return (
        <Suspense fallback={<div className={className} style={{ whiteSpace: 'pre-wrap' }}>{content}</div>}>
            <MarkdownContent content={content} webSources={webSources} />
        </Suspense>
    )
}
