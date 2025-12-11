/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_OPENROUTER_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

interface Window {
    ipcRenderer: {
        send: (channel: string, ...args: any[]) => void
        on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
        off: (channel: string, listener: (event: any, ...args: any[]) => void) => void
        invoke: (channel: string, ...args: any[]) => Promise<any>
    }
}
