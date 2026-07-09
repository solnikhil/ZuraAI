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
let cachedSyntaxHighlighter: SyntaxHighlighterComponent | null = null
let cachedPrismStyle: Record<string, React.CSSProperties> | null = null
let preloadDone = false
let preloadPromise: Promise<void> | null = null

// ── Custom Prism style (mirrors the overrides from LazyMarkdown) ──────────

function buildPrismStyle(
  base: Record<string, React.CSSProperties>
): Record<string, React.CSSProperties> {
  return {
    ...base,
    'code[class*="language-"]': {
      ...(base['code[class*="language-"]'] || {}),
      color: '#E6ECF8',
      background: 'transparent',
      textShadow: 'none',
      fontFamily: 'var(--font-mono)',
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
/** Core languages registered at first markdown preload (covers most chat code blocks). */
const CORE_LANG_LOADERS: Array<{
  name: string
  load: () => Promise<{ default: unknown }>
  aliases?: string[]
}> = [
  {
    name: 'typescript',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
  },
  {
    name: 'javascript',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
  },
  {
    name: 'python',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/python'),
  },
  {
    name: 'bash',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
  },
  {
    name: 'json',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/json'),
  },
  {
    name: 'yaml',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/yaml'),
  },
  {
    name: 'markup',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/markup'),
    aliases: ['html', 'xml'],
  },
  {
    name: 'css',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/css'),
  },
  {
    name: 'markdown',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/markdown'),
  },
  {
    name: 'jsx',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/jsx'),
  },
  {
    name: 'tsx',
    load: () => import('react-syntax-highlighter/dist/esm/languages/prism/tsx'),
  },
]

/** Extra languages registered on demand (first use of that fence). */
const EXTRA_LANG_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  java: () => import('react-syntax-highlighter/dist/esm/languages/prism/java'),
  cpp: () => import('react-syntax-highlighter/dist/esm/languages/prism/cpp'),
  csharp: () => import('react-syntax-highlighter/dist/esm/languages/prism/csharp'),
  go: () => import('react-syntax-highlighter/dist/esm/languages/prism/go'),
  rust: () => import('react-syntax-highlighter/dist/esm/languages/prism/rust'),
  ruby: () => import('react-syntax-highlighter/dist/esm/languages/prism/ruby'),
  php: () => import('react-syntax-highlighter/dist/esm/languages/prism/php'),
  swift: () => import('react-syntax-highlighter/dist/esm/languages/prism/swift'),
  kotlin: () => import('react-syntax-highlighter/dist/esm/languages/prism/kotlin'),
  sql: () => import('react-syntax-highlighter/dist/esm/languages/prism/sql'),
  diff: () => import('react-syntax-highlighter/dist/esm/languages/prism/diff'),
  docker: () => import('react-syntax-highlighter/dist/esm/languages/prism/docker'),
  graphql: () => import('react-syntax-highlighter/dist/esm/languages/prism/graphql'),
  toml: () => import('react-syntax-highlighter/dist/esm/languages/prism/toml'),
}

const registeredLanguages = new Set<string>()
let highlighterRef: {
  registerLanguage: (name: string, lang: unknown) => void
  alias: (name: string, aliases: string | string[]) => void
} | null = null

async function registerLanguages(SyntaxHighlighter: {
  registerLanguage: (name: string, lang: unknown) => void
  alias: (name: string, aliases: string | string[]) => void
}) {
  highlighterRef = SyntaxHighlighter
  const modules = await Promise.all(CORE_LANG_LOADERS.map((entry) => entry.load()))
  for (let i = 0; i < CORE_LANG_LOADERS.length; i++) {
    const entry = CORE_LANG_LOADERS[i]
    SyntaxHighlighter.registerLanguage(entry.name, modules[i].default)
    registeredLanguages.add(entry.name)
    if (entry.aliases?.length) {
      SyntaxHighlighter.alias(entry.name, entry.aliases)
      for (const alias of entry.aliases) registeredLanguages.add(alias)
    }
  }
}

/** Lazily register a Prism language the first time a code fence needs it. */
export async function ensurePrismLanguage(language: string): Promise<void> {
  const key = language.trim().toLowerCase()
  if (!key || registeredLanguages.has(key)) return
  if (!highlighterRef) {
    await preloadMarkdown()
  }
  if (!highlighterRef || registeredLanguages.has(key)) return

  const loader = EXTRA_LANG_LOADERS[key]
  if (!loader) return
  try {
    const mod = await loader()
    highlighterRef.registerLanguage(key, mod.default)
    registeredLanguages.add(key)
  } catch {
    // Unknown / failed language — leave unregistered; highlighter falls back to plain text.
  }
}

// ── Preload function ──────────────────────────────────────────────────────

export function preloadMarkdown(): Promise<void> {
  if (preloadPromise) return preloadPromise

  preloadPromise = (async () => {
    const results = await Promise.allSettled([
      import('remark-gfm').then((m) => m.default),
      import('react-syntax-highlighter/dist/esm/prism-light').then((m) => m.default),
      import('react-syntax-highlighter/dist/esm/styles/prism').then((m) =>
        buildPrismStyle(m.vscDarkPlus)
      ),
    ])

    const [gfm, highlighter, style] = results

    if (gfm.status === 'fulfilled') cachedRemarkGfm = gfm.value
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

export function getPreloadedMarkdown() {
  return {
    remarkGfm: cachedRemarkGfm,
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
