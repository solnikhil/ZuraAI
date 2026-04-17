/**
 * Type declarations for react-syntax-highlighter deep imports.
 *
 * The @types/react-syntax-highlighter package only covers the top-level
 * module. These declarations cover the Prism Light build and individual
 * language grammar modules used by markdownPreloader.ts after the switch
 * from the full Prism build to the lighter alternative.
 */

declare module 'react-syntax-highlighter/dist/esm/prism-light' {
    import type { ComponentType } from 'react'

    interface SyntaxHighlighterProps {
        children?: React.ReactNode
        style?: Record<string, React.CSSProperties>
        language?: string
        [key: string]: unknown
    }

    const PrismLight: ComponentType<SyntaxHighlighterProps> & {
        registerLanguage: (name: string, lang: unknown) => void
        alias: (name: string, aliases: string | string[]) => void
    }

    export default PrismLight
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
    import type { CSSProperties } from 'react'
    export const vscDarkPlus: Record<string, CSSProperties>
    export const oneDark: Record<string, CSSProperties>
    export const materialDark: Record<string, CSSProperties>
    export const dracula: Record<string, CSSProperties>
    export const atomDark: Record<string, CSSProperties>
}

// Individual Prism language grammar modules
declare module 'react-syntax-highlighter/dist/esm/languages/prism/typescript' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/javascript' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/python' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/java' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/cpp' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/csharp' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/go' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/rust' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/ruby' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/php' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/swift' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/kotlin' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/sql' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/bash' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/json' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/yaml' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/markup' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/css' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/markdown' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/diff' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/docker' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/graphql' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/toml' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/jsx' {
    const lang: unknown
    export default lang
}
declare module 'react-syntax-highlighter/dist/esm/languages/prism/tsx' {
    const lang: unknown
    export default lang
}
