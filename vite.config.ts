import path from 'path'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
                            external: ['playwright', 'playwright-core'],
                        },
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
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    build: {
        rollupOptions: {
            output: {
                // Enhanced code splitting configuration for bundle optimization
                // Requirements: 2.1, 2.4
                manualChunks: {
                    // Core React vendor chunk - loaded first, cached long-term
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    
                    // Markdown rendering dependencies - separate chunk for lazy loading
                    'markdown': [
                        'react-markdown',
                        'remark-gfm',
                        'remark-math',
                        'rehype-katex',
                        'react-syntax-highlighter'
                    ],
                    
                    // UI animation library - separate for tree-shaking
                    'ui-motion': ['framer-motion'],
                    
                    // Radix UI primitives - grouped for efficient caching
                    'radix': [
                        '@radix-ui/react-checkbox',
                        '@radix-ui/react-collapsible',
                        '@radix-ui/react-dialog',
                        '@radix-ui/react-label',
                        '@radix-ui/react-popover',
                        '@radix-ui/react-progress',
                        '@radix-ui/react-scroll-area',
                        '@radix-ui/react-separator',
                        '@radix-ui/react-slot',
                        '@radix-ui/react-switch',
                        '@radix-ui/react-tooltip'
                    ],
                    
                    // Charts - only needed in settings/usage
                    'charts': ['recharts']
                }
            }
        },
        // Chunk size warning threshold (in KB)
        chunkSizeWarningLimit: 500,
        sourcemap: false,
        reportCompressedSize: true, // Enable to verify bundle sizes
    }
})
