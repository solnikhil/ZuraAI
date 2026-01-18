/// <reference types="vite/client" />

// Needed so we can use import.meta.url with new URL(...) in TS.
interface ImportMeta {
    readonly url: string
    readonly env: ImportMetaEnv
}

interface ImportMetaEnv {
    readonly VITE_OPENROUTER_API_KEY: string
}
