/**
 * Markdown Preloader
 * 
 * Eagerly loads the markdown rendering pipeline (react-markdown, remark/rehype
 * plugins, syntax highlighter) so that when a chat message first renders, the
 * formatting is already available and there is no flash of unstyled content.
 *
 * Usage: import this module early (e.g. in main.tsx) — the top-level call to
 * `preloadMarkdown()` kicks off the downloads immediately.  LazyMarkdown.tsx
 * then calls `getPreloadedMarkdown()` to obtain the cached modules.
 */

import type React from 'react'

export type SyntaxHighlighterComponent = React.ComponentType<{
    children?: React.ReactNode
    [key: string]: unknown
}>

// ── Cached resolved modules ────────────────────────────────────────────────

let cachedRemarkGfm: (() => void) | null = null
let cachedRemarkMath: (() => void) | null = null
let cachedRehypeKatex: (() => void) | null = null
let cachedSyntaxHighlighter: SyntaxHighlighterComponent | null = null
let cachedPrismStyle: Record<string, React.CSSProperties> | null = null
let preloadDone = false
let preloadPromise: Promise<void> | null = null

// ── Custom Prism style (mirrors the overrides from LazyMarkdown) ──────────

function buildPrismStyle(base: Record<string, React.CSSProperties>): Record<string, React.CSSProperties> {
    return {
        ...base,
        'code[class*="language-"]': {
            ...(base['code[class*="language-"]'] || {}),
            color: '#E6ECF8',
            textShadow: 'none',
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            fontSize: '0.95rem',
            lineHeight: '1.72',
        },
        'pre[class*="language-"]': {
            ...(base['pre[class*="language-"]'] || {}),
            margin: 0,
            background: 'transparent',
            textShadow: 'none',
        },
        comment: { ...(base.comment || {}), color: '#7E879B', fontStyle: 'italic' },
        keyword: { ...(base.keyword || {}), color: '#FF7CCB' },
        operator: { ...(base.operator || {}), color: '#D7DEF0' },
        string: { ...(base.string || {}), color: '#FFC27A' },
        number: { ...(base.number || {}), color: '#C8A0FF' },
        function: { ...(base.function || {}), color: '#8EDDF7' },
        'class-name': { ...(base['class-name'] || {}), color: '#7CE9A7' },
        builtin: { ...(base.builtin || {}), color: '#9CD7F7' },
        property: { ...(base.property || {}), color: '#C7D2E8' },
        punctuation: { ...(base.punctuation || {}), color: '#AEB8CF' },
    }
}

// ── Language registration for Prism Light build ──────────────────────────

/**
 * Registers commonly-used languages with the Prism Light syntax highlighter.
 * This replaces the full Prism build (~300 grammars) with only ~25 languages
 * that cover the vast majority of real-world code blocks.
 */
async function registerLanguages(SyntaxHighlighter: {
    registerLanguage: (name: string, lang: unknown) => void
    alias: (name: string, aliases: string | string[]) => void
}) {
    const langModules = await Promise.all([
        import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
        import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
        import('react-syntax-highlighter/dist/esm/languages/prism/python'),
        import('react-syntax-highlighter/dist/esm/languages/prism/java'),
        import('react-syntax-highlighter/dist/esm/languages/prism/cpp'),
        import('react-syntax-highlighter/dist/esm/languages/prism/csharp'),
        import('react-syntax-highlighter/dist/esm/languages/prism/go'),
        import('react-syntax-highlighter/dist/esm/languages/prism/rust'),
        import('react-syntax-highlighter/dist/esm/languages/prism/ruby'),
        import('react-syntax-highlighter/dist/esm/languages/prism/php'),
        import('react-syntax-highlighter/dist/esm/languages/prism/swift'),
        import('react-syntax-highlighter/dist/esm/languages/prism/kotlin'),
        import('react-syntax-highlighter/dist/esm/languages/prism/sql'),
        import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
        import('react-syntax-highlighter/dist/esm/languages/prism/json'),
        import('react-syntax-highlighter/dist/esm/languages/prism/yaml'),
        import('react-syntax-highlighter/dist/esm/languages/prism/markup'),  // handles html + xml
        import('react-syntax-highlighter/dist/esm/languages/prism/css'),
        import('react-syntax-highlighter/dist/esm/languages/prism/markdown'),
        import('react-syntax-highlighter/dist/esm/languages/prism/diff'),
        import('react-syntax-highlighter/dist/esm/languages/prism/docker'),
        import('react-syntax-highlighter/dist/esm/languages/prism/graphql'),
        import('react-syntax-highlighter/dist/esm/languages/prism/toml'),
        import('react-syntax-highlighter/dist/esm/languages/prism/jsx'),
        import('react-syntax-highlighter/dist/esm/languages/prism/tsx'),
    ])

    const langNames = [
        'typescript', 'javascript', 'python', 'java', 'cpp', 'csharp',
        'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'sql', 'bash',
        'json', 'yaml', 'markup', 'css', 'markdown', 'diff', 'docker',
        'graphql', 'toml', 'jsx', 'tsx',
    ]

    for (let i = 0; i < langNames.length; i++) {
        SyntaxHighlighter.registerLanguage(langNames[i], langModules[i].default)
    }

    // Alias markup to html and xml (Prism uses "markup" for both)
    SyntaxHighlighter.alias('markup', ['html', 'xml'])
}

// ── Preload function ──────────────────────────────────────────────────────

export function preloadMarkdown(): Promise<void> {
    if (preloadPromise) return preloadPromise

    preloadPromise = (async () => {
        const results = await Promise.allSettled([
            import('remark-gfm').then(m => m.default),
            import('remark-math').then(m => m.default),
            import('rehype-katex').then(m => m.default),
            import('react-syntax-highlighter/dist/esm/prism-light').then(m => m.default),
            import('react-syntax-highlighter/dist/esm/styles/prism').then(m => buildPrismStyle(m.vscDarkPlus)),
        ])

        const [gfm, math, katex, highlighter, style] = results

        if (gfm.status === 'fulfilled') cachedRemarkGfm = gfm.value
        if (math.status === 'fulfilled') cachedRemarkMath = math.value
        if (katex.status === 'fulfilled') cachedRehypeKatex = katex.value
        if (highlighter.status === 'fulfilled') {
            const SyntaxHighlighter = highlighter.value as unknown as SyntaxHighlighterComponent & {
                registerLanguage: (name: string, lang: unknown) => void
                alias: (name: string, aliases: string | string[]) => void
            }
            await registerLanguages(SyntaxHighlighter)
            cachedSyntaxHighlighter = SyntaxHighlighter
        }
        if (style.status === 'fulfilled') cachedPrismStyle = style.value

        preloadDone = true
    })()

    return preloadPromise
}

// ── Query helpers (used by LazyMarkdown) ──────────────────────────────────

export function isMarkdownPreloaded(): boolean {
    return preloadDone
}

export function getPreloadedMarkdown() {
    return {
        remarkGfm: cachedRemarkGfm,
        remarkMath: cachedRemarkMath,
        rehypeKatex: cachedRehypeKatex,
        syntaxHighlighter: cachedSyntaxHighlighter,
        prismStyle: cachedPrismStyle,
        ready: preloadDone,
    }
}

/**
 * Returns a promise that resolves once preloading is complete.
 * If preloadMarkdown() was never called, it kicks it off.
 */
export function waitForMarkdownPreload(): Promise<void> {
    if (preloadDone) return Promise.resolve()
    if (!preloadPromise) return preloadMarkdown()
    return preloadPromise
}
