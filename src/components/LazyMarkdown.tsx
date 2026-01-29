// Lazy-loaded Markdown component for memory optimization
// Only loads when markdown content is actually displayed
import React, { Suspense, useState, useEffect } from 'react'
import { lazy } from 'react'
import WebSourceCitation from './Dashboard/ChatArea/WebSourceCitation'
import type { WebSource } from './Dashboard/ChatArea/WebSourceCitation'

// Lazy load markdown dependencies
const ReactMarkdown = lazy(() => import('react-markdown'))
const remarkGfmPromise = import('remark-gfm')
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

// Syntax highlighter wrapper
async function getPrismStyles() {
    const mod = await prismStylesPromise
    return mod.vscDarkPlus
}

function MarkdownContent({ content, webSources }: { content: string; webSources?: Map<string, WebSource> }) {
    const [remarkPlugin, setRemarkPlugin] = React.useState<any>(null)
    const [syntaxHighlighter, setSyntaxHighlighter] = React.useState<any>(null)
    const [prismStyle, setPrismStyle] = React.useState<any>(null)

    React.useEffect(() => {
        let mounted = true
        Promise.all([
            getRemarkGfm(),
            import('react-syntax-highlighter').then(m => m.Prism),
            getPrismStyles()
        ]).then(([plugin, highlighter, style]) => {
            if (mounted) {
                setRemarkPlugin(() => plugin)
                setSyntaxHighlighter(() => highlighter)
                setPrismStyle(style)
            }
        })
        return () => { mounted = false }
    }, [])

    if (!remarkPlugin || !syntaxHighlighter || !prismStyle) {
        return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
    }

    const SyntaxHighlighter = syntaxHighlighter

    return (
        <ReactMarkdown
            remarkPlugins={[remarkPlugin]}
            components={{
                code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '')
                    const codeString = String(children)
                    // Determine if this is truly a code block: has language OR has newlines OR inline is explicitly false
                    const isCodeBlock = match || (inline === false && codeString.includes('\n'))
                    
                    if (isCodeBlock && match) {
                        // Code block with language - syntax highlighted
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
                                        onClick={() => navigator.clipboard.writeText(codeString)}
                                        style={{ background: 'none', border: 'none', color: 'var(--theme-text-tertiary)', cursor: 'pointer', fontSize: '0.75rem' }}
                                    >
                                        Copy
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
                        return (
                            <div style={{
                                margin: '12px 0',
                                borderRadius: '8px',
                                background: 'var(--theme-surface)',
                                border: '1px solid var(--theme-border)',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    padding: '12px 16px',
                                    overflowX: 'auto',
                                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                    fontSize: '0.9em',
                                    lineHeight: '1.6',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    color: 'var(--theme-text-secondary)'
                                }}>
                                    {children}
                                </div>
                            </div>
                        )
                    } else {
                        // Inline code
                        return (
                            <code {...props} style={{ background: 'var(--theme-surface-hover)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.9em', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                                {children}
                            </code>
                        )
                    }
                },
                blockquote: ({ node, ...props }) => (
                    <blockquote style={{
                        borderLeft: '4px solid var(--theme-accent)',
                        background: 'var(--theme-surface-hover)',
                        padding: '12px 16px',
                        borderRadius: '0 8px 8px 0'
                    }} {...props} />
                ),
                table: ({ node, ...props }) => (
                    <div style={{ overflowX: 'auto', margin: '16px 0', borderRadius: '8px', border: '1px solid var(--theme-border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em', background: 'var(--theme-surface)' }} {...props} />
                    </div>
                ),
                th: ({ node, ...props }) => (
                    <th style={{
                        borderBottom: '1px solid var(--theme-border)',
                        padding: '12px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: 'var(--theme-text-primary)',
                        background: 'var(--theme-surface-hover)'
                    }} {...props} />
                ),
                td: ({ node, ...props }) => (
                    <td style={{
                        borderBottom: '1px solid var(--theme-border)',
                        padding: '12px',
                        color: 'var(--theme-text-secondary)'
                    }} {...props} />
                ),
                a: ({ node, href, children, ...props }: any) => {
                    if (href && webSources && webSources.size > 0) {
                        const source = webSources.get(href) || webSources.get(href.replace(/\/+$/, ''))
                        if (source) {
                            return <WebSourceCitation href={href} source={source}>{children}</WebSourceCitation>
                        }
                    }
                    return (
                        <a style={{ color: 'var(--theme-accent)', textDecoration: 'none', borderBottom: '1px dotted var(--theme-accent)', transition: 'all 0.2s' }} target="_blank" rel="noopener noreferrer" href={href} {...props}>{children}</a>
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
            {content}
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
