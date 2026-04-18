import path from 'path'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'

// Get git commit info at build time
const getGitInfo = () => {
    try {
        const commitHash = execSync('git rev-parse HEAD').toString().trim()
        const commitDate = execSync('git log -1 --format=%ci').toString().trim()
        return { commitHash, commitDate }
    } catch {
        return { commitHash: 'unknown', commitDate: 'unknown' }
    }
}

const gitInfo = getGitInfo()

export default defineConfig({
    esbuild: {
        drop: ['console', 'debugger'],
    },
    plugins: [
        tailwindcss(),
        react(),
        electron([
            {
                // Main-Process entry file of the Electron App.
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        rollupOptions: {
                            external: ['bufferutil', 'utf-8-validate', 'duck-duck-scrape', '@nut-tree-fork/nut-js', '@nut-tree-fork/libnut', '@nut-tree-fork/shared', '@nut-tree-fork/provider-interfaces', '@nut-tree-fork/default-clipboard-provider'],
                        },
                    },
                    define: {
                        'process.env.VITE_GIT_COMMIT_HASH': JSON.stringify(gitInfo.commitHash),
                        'process.env.VITE_GIT_COMMIT_DATE': JSON.stringify(gitInfo.commitDate),
                    },
                },
            },
            {
                entry: 'electron/preload.ts',
                onstart(options) {
                    options.reload()
                },
            },
        ]),
        renderer(),
    ],
    define: {
        'import.meta.env.VITE_GIT_COMMIT_HASH': JSON.stringify(gitInfo.commitHash),
        'import.meta.env.VITE_GIT_COMMIT_DATE': JSON.stringify(gitInfo.commitDate),
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "lucide-react": path.resolve(__dirname, "./src/lib/lucide-react.tsx"),
        },
    },
    build: {
        rollupOptions: {
            output: {
                // Enhanced code splitting configuration for bundle optimization.
                manualChunks(id) {
                    if (id.includes('node_modules/react-virtuoso')) return 'virtualization'
                    if (id.includes('node_modules/mermaid')) return 'mermaid'
                    if (id.includes('node_modules/recharts')) return 'charts'
                    if (id.includes('node_modules/framer-motion')) return 'ui-motion'
                    if (
                        id.includes('node_modules/react-markdown') ||
                        id.includes('node_modules/remark-gfm') ||
                        id.includes('node_modules/remark-math') ||
                        id.includes('node_modules/rehype-katex') ||
                        id.includes('node_modules/react-syntax-highlighter')
                    ) {
                        return 'markdown'
                    }
                    if (
                        id.includes('node_modules/@radix-ui/react-collapsible') ||
                        id.includes('node_modules/@radix-ui/react-dialog') ||
                        id.includes('node_modules/@radix-ui/react-label') ||
                        id.includes('node_modules/@radix-ui/react-popover') ||
                        id.includes('node_modules/@radix-ui/react-scroll-area') ||
                        id.includes('node_modules/@radix-ui/react-separator') ||
                        id.includes('node_modules/@radix-ui/react-slot') ||
                        id.includes('node_modules/@radix-ui/react-switch') ||
                        id.includes('node_modules/@radix-ui/react-tooltip')
                    ) {
                        return 'radix'
                    }
                    if (
                        id.includes('node_modules/react/') ||
                        id.includes('node_modules/react-dom/') ||
                        id.includes('node_modules/react-router-dom/')
                    ) {
                        return 'react-vendor'
                    }

                    return undefined
                },
            },
        },
        // Chunk size warning threshold (in KB)
        chunkSizeWarningLimit: 500,
        sourcemap: false,
        reportCompressedSize: true, // Enable to verify bundle sizes
    }
})
