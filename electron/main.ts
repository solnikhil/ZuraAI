import { app, globalShortcut } from 'electron'
import path from 'path'
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer'

// Import window management
import {
    createMainWindow,
    getMainWindow,
    createTray,
    destroyTray
} from './windows'

// Import IPC handlers
import { registerAllHandlers } from './ipc'
import { registerToolHandlers } from './tools'

// Import auto-updater
import {
    initializeAutoUpdater,
    registerUpdaterHandlers,
    cleanupAutoUpdater
} from './updater'

// Import deferred initialization system
import { deferredInitializer } from './startup/deferredInit'

// Import memory monitoring
import { initializeMemoryMonitoring, cleanupMemoryMonitoring, memoryMonitor } from './performance/memoryMonitor'

// Import performance monitoring for regression detection
import { performanceMonitor } from './performance/monitor'
import { metricsLogger } from './performance/metricsLog'

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

app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    cleanupAutoUpdater()
    cleanupMemoryMonitoring()
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

    // Register all IPC handlers (including execute-tool for web_search)
    registerAllHandlers()
    registerToolHandlers()
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

    // Defer memory monitoring initialization (Requirements 4.6, 6.6)
    // Start monitoring after window is visible to avoid impacting startup
    deferredInitializer.registerTask({
        name: 'memory-monitoring',
        priority: 'low',
        delayMs: 1000, // Start 1 second after window visible
        execute: async () => {
            initializeMemoryMonitoring(
                // Cleanup callback - triggered when memory exceeds 500MB
                () => {
                    console.log('[MAIN] Memory cleanup triggered by monitor')
                    // Additional cleanup can be added here (e.g., notify renderer to unload sessions)
                },
                // Warning callback - triggered when memory exceeds 800MB
                () => {
                    console.warn('[MAIN] Memory warning - performance regression detected')
                    // Could send notification to renderer or trigger more aggressive cleanup
                }
            )
            console.log('[MAIN] Memory monitoring initialized')
        },
    });

    // Defer startup regression check (Requirement 6.6, Property 26)
    // Check startup time after window is visible and log warning if > 2s
    deferredInitializer.registerTask({
        name: 'startup-regression-check',
        priority: 'low',
        delayMs: 100, // Check shortly after window visible
        execute: async () => {
            // Check startup time regression
            const startupResult = performanceMonitor.checkStartupRegression()
            
            if (startupResult.isRegression) {
                console.warn('[MAIN] Startup regression detected!')
                console.warn(`[MAIN] Startup time: ${startupResult.startupTimeMs}ms (threshold: 2000ms)`)
            } else {
                console.log(`[MAIN] Startup time OK: ${startupResult.startupTimeMs}ms`)
            }
            
            // Log initial metrics to the rolling log
            const metrics = performanceMonitor.getMetrics()
            const { warnings } = performanceMonitor.checkThresholds()
            await metricsLogger.addEntry(metrics, warnings)
            
            console.log('[MAIN] Startup regression check completed')
        },
    });

    // Create system tray
    createTray()

    // Open main window on start
    createMainWindow()

    // Register Shift+Esc to log comprehensive performance metrics to console
    // **Validates: Requirement 6.5**
    // THE Main_Process SHALL provide a debug shortcut (Shift+Escape) to display current performance metrics
    globalShortcut.register('Shift+Escape', () => {
        const processMetrics = app.getAppMetrics()
        const perfMetrics = performanceMonitor.getMetrics()
        const thresholdResults = performanceMonitor.checkThresholds()
        const config = memoryMonitor.getConfig()
        
        // Calculate totals from Electron process metrics
        let totalMemoryMB = 0
        let totalCPU = 0
        processMetrics.forEach((metric) => {
            totalMemoryMB += metric.memory.workingSetSize / 1024
            totalCPU += metric.cpu.percentCPUUsage
        })
        
        // Helper function to format metric values
        const formatMs = (value: number): string => value > 0 ? `${value}ms` : 'N/A'
        const formatMB = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`
        const formatMetricValue = (value: number | null, suffix = 'ms'): string => {
            if (value === null || value === undefined) return 'N/A'
            return suffix === 'ms' ? `${value.toFixed(0)}${suffix}` : value.toFixed(3)
        }
        
        console.log('\n[MAIN] ZURA AI PERFORMANCE METRICS (Shift+Escape Debug Output)')
        console.log('[MAIN] ===========================================================')
        
        // ==================== STARTUP TIMING ====================
        console.log('[MAIN] STARTUP TIMING')
        console.log(`[MAIN]   Window Created: ${formatMs(perfMetrics.startup.windowCreated).padStart(10)}`)
        console.log(`[MAIN]   Window Visible: ${formatMs(perfMetrics.startup.windowVisible).padStart(10)}`)
        console.log(`[MAIN]   IPC Ready:      ${formatMs(perfMetrics.startup.ipcReady).padStart(10)}`)
        console.log(`[MAIN]   Fully Loaded:   ${formatMs(perfMetrics.startup.fullyLoaded).padStart(10)}`)
        
        // ==================== MEMORY USAGE ====================
        console.log('[MAIN] -----------------------------------------------------------')
        console.log('[MAIN] MEMORY USAGE')
        console.log(`[MAIN]   Heap Used:   ${formatMB(perfMetrics.memory.heapUsed).padStart(10)}`)
        console.log(`[MAIN]   Heap Total:  ${formatMB(perfMetrics.memory.heapTotal).padStart(10)}`)
        console.log(`[MAIN]   External:    ${formatMB(perfMetrics.memory.external).padStart(10)}`)
        console.log(`[MAIN]   RSS (Total): ${formatMB(perfMetrics.memory.rss).padStart(10)}`)
        
        // ==================== IPC METRICS ====================
        console.log('[MAIN] -----------------------------------------------------------')
        console.log('[MAIN] IPC METRICS')
        console.log(`[MAIN]   Total Calls:     ${String(perfMetrics.ipc.callCount).padStart(10)}`)
        console.log(`[MAIN]   Average Latency: ${perfMetrics.ipc.averageLatency.toFixed(2).padStart(7)}ms`)
        console.log(`[MAIN]   Batched Calls:   ${String(perfMetrics.ipc.batchedCalls).padStart(10)}`)
        
        // ==================== RENDERER METRICS (Web Vitals) ====================
        console.log('[MAIN] -----------------------------------------------------------')
        console.log('[MAIN] RENDERER METRICS (Web Vitals)')
        if (perfMetrics.renderer) {
            const r = perfMetrics.renderer
            console.log(`[MAIN]   FCP (First Contentful Paint): ${formatMetricValue(r.fcp).padStart(10)}`)
            console.log(`[MAIN]   TTI (Time To Interactive):    ${formatMetricValue(r.tti).padStart(10)}`)
            console.log(`[MAIN]   LCP (Largest Contentful):     ${formatMetricValue(r.lcp).padStart(10)}`)
            console.log(`[MAIN]   FID (First Input Delay):      ${formatMetricValue(r.fid).padStart(10)}`)
            console.log(`[MAIN]   CLS (Cumulative Layout Shift):${formatMetricValue(r.cls, '').padStart(9)}`)
            if (r.domContentLoaded !== null) {
                const domLoaded = r.domContentLoaded - r.navigationStart
                console.log(`[MAIN]   DOM Content Loaded:          ${formatMs(domLoaded).padStart(10)}`)
            }
            if (r.loadComplete !== null) {
                const loadTime = r.loadComplete - r.navigationStart
                console.log(`[MAIN]   Load Complete:               ${formatMs(loadTime).padStart(10)}`)
            }
        } else {
            console.log('[MAIN]   (Renderer metrics not yet reported)')
        }
        
        // ==================== ELECTRON PROCESS BREAKDOWN ====================
        console.log('[MAIN] -----------------------------------------------------------')
        console.log('[MAIN] ELECTRON PROCESS BREAKDOWN')
        processMetrics.forEach((metric) => {
            const memMB = (metric.memory.workingSetSize / 1024).toFixed(1)
            const cpuPercent = metric.cpu.percentCPUUsage.toFixed(1)
            console.log(`[MAIN]   PID ${String(metric.pid).padEnd(6)} | ${metric.type.padEnd(12)} | ${cpuPercent.padStart(5)}% CPU | ${memMB.padStart(7)} MB`)
        })
        console.log('[MAIN]   --------------------------------------------------------')
        console.log(`[MAIN]   TOTAL                     | ${totalCPU.toFixed(1).padStart(5)}% CPU | ${totalMemoryMB.toFixed(1).padStart(7)} MB`)
        
        // ==================== THRESHOLD STATUS ====================
        console.log('[MAIN] -----------------------------------------------------------')
        console.log('[MAIN] THRESHOLD STATUS')
        const startupStatus = perfMetrics.startup.windowVisible > 2000 ? 'EXCEEDED' : 'OK'
        const cleanupStatus = totalMemoryMB > config.thresholds.cleanupThresholdMB ? 'EXCEEDED' : 'OK'
        const warningStatus = totalMemoryMB > config.thresholds.warningThresholdMB ? 'EXCEEDED' : 'OK'
        console.log(`[MAIN]   Startup Time (< 2000ms): ${startupStatus}`)
        console.log(`[MAIN]   Memory Cleanup (< ${config.thresholds.cleanupThresholdMB}MB): ${cleanupStatus}`)
        console.log(`[MAIN]   Memory Warning (< ${config.thresholds.warningThresholdMB}MB): ${warningStatus}`)
        
        // Check renderer-specific thresholds
        if (perfMetrics.renderer) {
            const fcpStatus = perfMetrics.renderer.fcp !== null && perfMetrics.renderer.fcp > 500 ? 'EXCEEDED' : 'OK'
            const lcpStatus = perfMetrics.renderer.lcp !== null && perfMetrics.renderer.lcp > 2500 ? 'EXCEEDED' : 'OK'
            console.log(`[MAIN]   FCP (< 500ms): ${fcpStatus}`)
            console.log(`[MAIN]   LCP (< 2500ms): ${lcpStatus}`)
        }
        
        // ==================== ACTIVE WARNINGS ====================
        if (thresholdResults.warnings.length > 0) {
            console.log('[MAIN] -----------------------------------------------------------')
            console.log('[MAIN] ACTIVE WARNINGS')
            thresholdResults.warnings.forEach((warning) => {
                // Truncate long warnings to fit in the box
                const maxLen = 60
                const truncatedWarning = warning.length > maxLen ? warning.substring(0, maxLen - 3) + '...' : warning
                console.log(`[MAIN]   - ${truncatedWarning}`)
            })
        } else {
            console.log('[MAIN] -----------------------------------------------------------')
            console.log('[MAIN] NO ACTIVE WARNINGS')
        }
        
        // ==================== FOOTER ====================
        console.log('[MAIN] -----------------------------------------------------------')
        const timestamp = new Date().toISOString()
        console.log(`[MAIN] Collected at: ${timestamp}`)
        console.log('[MAIN] ===========================================================\n')
    })

})
