import { app, globalShortcut, protocol, BrowserWindow } from 'electron'
import path from 'path'
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer'

// Import window management
import {
    createMainWindow,
    getMainWindow,
    createTray,
    destroyTray,
    setQuitting
} from './windows'

// Import IPC handlers
import { registerAllHandlers } from './ipc'

// Import auto-updater
import {
    initializeAutoUpdater,
    registerUpdaterHandlers,
    cleanupAutoUpdater
} from './updater'

// Import deferred initialization system
import { deferredInitializer } from './startup/deferredInit'

// Import child_process for terminal spawning
import { exec } from 'child_process'

// Fix for process.env.DIST type issue
const DIST_PATH = process.env.DIST || path.join(__dirname, '../dist')
process.env.DIST = DIST_PATH
process.env.PUBLIC = app.isPackaged ? DIST_PATH : path.join(__dirname, '../public')

// Fix cursor flickering during window resize on Windows
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// Disable window animations
app.commandLine.appendSwitch('wm-window-animations-disabled')

// Add process identifier for Task Manager (visible in "Command line" column)
app.commandLine.appendSwitch('process-name', 'Zura-Main')

// Set App Name explicitly for Windows Task Manager
if (process.platform === 'win32') {
    app.setAppUserModelId('Zura AI')
}
app.setName('Zura AI')

// Set process title for main process (shows in Task Manager)
process.title = 'Zura AI - Main'

// ==================== APP LIFECYCLE ====================

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    setQuitting(true)
    globalShortcut.unregisterAll()
})

app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    cleanupAutoUpdater()
    destroyTray()
})

app.whenReady().then(async () => {
    deferredInitializer.markAppReady()

    // Defer DevTools installation in development mode (2000ms after window visible)
    // Skip entirely in production builds (Requirement 1.4)
    if (!app.isPackaged) {
        deferredInitializer.registerTask({
            name: 'devtools-install',
            priority: 'low',
            delayMs: 2000,
            execute: async () => {
                try {
                    const name = await installExtension(REACT_DEVELOPER_TOOLS)
                    console.log(`[MAIN] Added Extension: ${name}`)
                } catch (err) {
                    console.log('[MAIN] DevTools installation error:', err)
                }
            },
        });
    }

    // Defer protocol registration (500ms after window visible)
    // This ensures window creation is not blocked (Requirement 1.3)
    deferredInitializer.registerTask({
        name: 'protocol-registration',
        priority: 'high',
        delayMs: 500,
        execute: async () => {
            // Register a custom protocol to handle terminal spawning
            // This bypasses contextBridge issues by using a URL scheme
            protocol.registerStringProtocol('zura-terminal', (request, callback) => {
                const url = request.url.replace('zura-terminal://', '')
                const [command, ...args] = decodeURIComponent(url).split(' ')

                console.log('[ZURA-TERMINAL] Protocol handler called:', { command, args })

                if (process.platform === 'win32') {
                    const cmd = `start cmd.exe /K "${command} ${args.join(' ')} & pause"`
                    exec(cmd, (error) => {
                        if (error) {
                            console.error('[ZURA-TERMINAL] exec error:', error.message)
                        } else {
                            console.log('[ZURA-TERMINAL] Terminal spawned successfully')
                        }
                    })
                    callback('success')
                } else {
                    callback('unsupported platform')
                }
            });
            console.log('[MAIN] Protocol registered')
        },
    });

    // Defer tool handler loading (100ms after window creation)
    // This ensures window creation is not blocked (Requirement 1.2)
    deferredInitializer.registerTask({
        name: 'tool-handlers',
        priority: 'high',
        delayMs: 100,
        execute: async () => {
            try {
                // Use require for deferred loading to avoid TypeScript dynamic import issues
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const toolsModule = require('./tools/index')
                if (typeof toolsModule.registerToolHandlers === 'function') {
                    toolsModule.registerToolHandlers()
                    console.log('[MAIN] Tool handlers registered')
                }
            } catch (error) {
                console.error('[MAIN] Failed to load tool handlers:', error)
            }
        },
    });

    // Initialize Tavily API key from settings on startup
    (global as any).tavilyApiKey = undefined

    // Register all IPC handlers
    registerAllHandlers()
    registerUpdaterHandlers()
    deferredInitializer.markIPCReady()

    // Defer auto-updater initialization (only in production)
    // The updater itself adds an additional 5-second delay before checking (Requirement 1.5)
    deferredInitializer.registerTask({
        name: 'auto-updater',
        priority: 'low',
        delayMs: 0, // Start immediately after window visible, updater adds its own 5s delay
        execute: async () => {
            initializeAutoUpdater(getMainWindow)
            console.log('[MAIN] Auto-updater initialized')
        },
    });

    // Create system tray
    createTray()

    // Open main window on start
    createMainWindow()

    // Register Shift+Esc to log process metrics to console
    globalShortcut.register('Shift+Escape', () => {
        const metrics = app.getAppMetrics()
        console.log('\n╔══════════════════════════════════════════════════════════╗')
        console.log('║              ELECTRON PROCESS METRICS                     ║')
        console.log('╠══════════════════════════════════════════════════════════╣')
        metrics.forEach((metric) => {
            const memMB = (metric.memory.workingSetSize / 1024).toFixed(1)
            const cpuPercent = metric.cpu.percentCPUUsage.toFixed(1)
            console.log(`║  PID ${String(metric.pid).padEnd(6)} │ ${metric.type.padEnd(16)} │ ${cpuPercent.padStart(5)}% │ ${memMB.padStart(7)} MB  ║`)
        })
        console.log('╚══════════════════════════════════════════════════════════╝\n')
    })

    // Overlay is now lazy-loaded - only created when first needed
    // This saves ~100-200MB RAM when overlay is not being used
})
