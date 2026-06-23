import path from 'path'
import fs from 'fs'
import { defineConfig } from 'vite'
import electron, { startup as electronStartup } from 'vite-plugin-electron'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execFileSync, execSync, spawn, type ChildProcess } from 'child_process'
import { createRequire } from 'module'
import crypto from 'crypto'

const require = createRequire(import.meta.url)
const IS_MACOS = process.platform === 'darwin'
const DEV_APP_NAME = 'ZuraAI Dev'
const DEV_BUNDLE_ID = 'in.zuraai.desktop.dev'
const DEV_APP_CACHE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'zura-dev-app')
const DEV_APP_BUNDLE_PATH = path.join(DEV_APP_CACHE_DIR, `${DEV_APP_NAME}.app`)
const DEV_APP_EXECUTABLE_PATH = path.join(DEV_APP_BUNDLE_PATH, 'Contents', 'MacOS', 'Electron')
const DEV_APP_MARKER_PATH = path.join(DEV_APP_CACHE_DIR, 'bundle-meta.json')
const processWithElectronApp = process as typeof process & { electronApp?: ChildProcess }
let devElectronApp: ChildProcess | undefined
let lastPreloadBundleHash: string | undefined

const hashFileIfExists = (filePath: string) => {
    try {
        const buf = fs.readFileSync(filePath)
        return crypto.createHash('sha256').update(buf).digest('hex')
    } catch {
        return undefined
    }
}

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

const readElectronPackageVersion = () => {
    const electronPackageJsonPath = require.resolve('electron/package.json')
    const electronPackageJson = JSON.parse(fs.readFileSync(electronPackageJsonPath, 'utf8')) as { version?: string }
    return electronPackageJson.version ?? 'unknown'
}

const syncMacDevAppBundle = () => {
    const electronBinaryPath = require('electron') as string
    const sourceAppPath = path.resolve(electronBinaryPath, '../../..')
    const marker = JSON.stringify({
        electronVersion: readElectronPackageVersion(),
        appName: DEV_APP_NAME,
        bundleId: DEV_BUNDLE_ID,
    })

    if (
        fs.existsSync(DEV_APP_EXECUTABLE_PATH) &&
        fs.existsSync(DEV_APP_MARKER_PATH) &&
        fs.readFileSync(DEV_APP_MARKER_PATH, 'utf8') === marker
    ) {
        return DEV_APP_EXECUTABLE_PATH
    }

    fs.rmSync(DEV_APP_CACHE_DIR, { recursive: true, force: true })
    fs.mkdirSync(DEV_APP_CACHE_DIR, { recursive: true })
    fs.cpSync(sourceAppPath, DEV_APP_BUNDLE_PATH, { recursive: true })

    const infoPlistPath = path.join(DEV_APP_BUNDLE_PATH, 'Contents', 'Info.plist')
    const setPlistValue = (key: string, value: string) => {
        execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, infoPlistPath])
    }

    setPlistValue('CFBundleDisplayName', DEV_APP_NAME)
    setPlistValue('CFBundleName', DEV_APP_NAME)
    setPlistValue('CFBundleIdentifier', DEV_BUNDLE_ID)
    setPlistValue('CFBundleIconFile', 'electron.icns')

    fs.writeFileSync(DEV_APP_MARKER_PATH, marker)

    return DEV_APP_EXECUTABLE_PATH
}

const spawnMacDevElectron = async () => {
    const executablePath = syncMacDevAppBundle()

    await electronStartup.exit()

    devElectronApp = spawn(executablePath, ['.', '--no-sandbox'], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    })

    processWithElectronApp.electronApp = devElectronApp
    devElectronApp.once('exit', process.exit)
}

export default defineConfig({
    plugins: [
        tailwindcss(),
        react(),
        electron([
            {
                // Main-Process entry file of the Electron App.
                entry: 'electron/main.ts',
                onstart: async ({ startup }) => {
                    if (!IS_MACOS) {
                        await startup()
                        return
                    }

                    await spawnMacDevElectron()
                },
                vite: {
                    build: {
                        rollupOptions: {
                            external: ['bufferutil', 'utf-8-validate', 'koffi', '@koromix/koffi-win32-x64', '@nut-tree-fork/nut-js', '@nut-tree-fork/libnut', '@nut-tree-fork/shared', '@nut-tree-fork/provider-interfaces', '@nut-tree-fork/default-clipboard-provider'],
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
                    // Preload code is only evaluated on page load; we need a reload for runtime changes.
                    // However, Vite rebuilds can be triggered by type-only churn. Only full-reload when
                    // the emitted preload bundle actually changed.
                    const forceReload = process.env.ZURA_PRELOAD_FULL_RELOAD === '1'
                    const disableReload = process.env.ZURA_PRELOAD_RELOAD === '0'
                    if (disableReload) return

                    const preloadOutPath = path.join(process.cwd(), 'dist-electron', 'preload.js')
                    const nextHash = hashFileIfExists(preloadOutPath)

                    const prevHash = lastPreloadBundleHash
                    lastPreloadBundleHash = nextHash

                    if (forceReload || (nextHash && nextHash !== prevHash)) {
                        options.reload()
                    }
                },
            },
        ]),
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
