import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                // Main-Process entry file of the Electron App.
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        rollupOptions: {
                            external: [
                                // Externalize native modules that can't be bundled
                                'canvas',
                                // LanceDB native modules (expected to fail in dev)
                                '@lancedb/lancedb',
                                'apache-arrow',
                            ],
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
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'react-vendor': ['react', 'react-dom'],
                    'markdown': ['react-markdown', 'remark-gfm', 'react-syntax-highlighter'],
                    'ui': ['framer-motion', 'lucide-react'],
                }
            }
        },
        sourcemap: false,
        reportCompressedSize: false,
    }
})
