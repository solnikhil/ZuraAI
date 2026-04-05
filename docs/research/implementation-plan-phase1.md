# Technical Implementation Plan - Phase 1

## Critical Features Implementation Guide

### Feature 1: Global Hotkey System (Fix AGENTS.md TODO)

**Current Issue:** Global shortcuts imported but not wired to user settings

#### Step 1: Add IPC Handlers (electron/ipc/shortcutHandlers.ts)
```typescript
import { ipcMain, globalShortcut, BrowserWindow } from 'electron'
import { getMainWindow } from '../windows'

interface ShortcutConfig {
  quickOpen: string      // Default: 'CommandOrControl+Space'
  quickCapture: string   // Default: 'CommandOrControl+Shift+C'
  screenshot: string     // Default: 'CommandOrControl+Shift+S'
  voiceToggle: string    // Default: 'CommandOrControl+Shift+V'
}

const DEFAULT_SHORTCUTS: ShortcutConfig = {
  quickOpen: 'CommandOrControl+Space',
  quickCapture: 'CommandOrControl+Shift+C',
  screenshot: 'CommandOrControl+Shift+S',
  voiceToggle: 'CommandOrControl+Shift+V',
}

let registeredShortcuts: Map<string, string> = new Map()

export function registerShortcutHandlers(): void {
  // Register all shortcuts from config
  ipcMain.handle('shortcuts:register-all', async (_event, config: ShortcutConfig) => {
    // Unregister existing
    globalShortcut.unregisterAll()
    registeredShortcuts.clear()

    // Register each shortcut
    for (const [action, accelerator] of Object.entries(config)) {
      if (!accelerator) continue

      const success = globalShortcut.register(accelerator, () => {
        handleShortcutAction(action as keyof ShortcutConfig)
      })

      if (success) {
        registeredShortcuts.set(action, accelerator)
      } else {
        console.warn(`[Shortcuts] Failed to register ${action}: ${accelerator}`)
      }
    }

    return { success: true, registered: Array.from(registeredShortcuts.entries()) }
  })

  // Check if shortcut is available
  ipcMain.handle('shortcuts:is-available', async (_event, accelerator: string) => {
    return !globalShortcut.isRegistered(accelerator)
  })

  // Unregister all
  ipcMain.handle('shortcuts:unregister-all', async () => {
    globalShortcut.unregisterAll()
    registeredShortcuts.clear()
    return { success: true }
  })
}

function handleShortcutAction(action: keyof ShortcutConfig) {
  const mainWindow = getMainWindow()
  if (!mainWindow) return

  switch (action) {
    case 'quickOpen':
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
      break

    case 'quickCapture':
      // Show mini capture window
      showQuickCaptureWindow()
      break

    case 'screenshot':
      // Trigger screenshot capture
      mainWindow.webContents.send('shortcut:screenshot')
      break

    case 'voiceToggle':
      // Toggle voice recording
      mainWindow.webContents.send('shortcut:voice')
      break
  }
}

function showQuickCaptureWindow() {
  // Implementation for quick capture window
  // See Feature 2 below
}
```

#### Step 2: Update Preload (electron/preload.ts)
```typescript
// Add to INVOKE_CHANNELS:
const INVOKE_CHANNELS = [
  // ... existing channels
  'shortcuts:register-all',
  'shortcuts:is-available',
  'shortcuts:unregister-all',
] as const

// Add to ON_CHANNELS:
const ON_CHANNELS = [
  // ... existing channels
  'shortcut:screenshot',
  'shortcut:voice',
] as const

// Expose shortcuts API
contextBridge.exposeInMainWorld('shortcuts', {
  registerAll: (config: ShortcutConfig) => 
    ipcRenderer.invoke('shortcuts:register-all', config),
  isAvailable: (accelerator: string) => 
    ipcRenderer.invoke('shortcuts:is-available', accelerator),
  unregisterAll: () => 
    ipcRenderer.invoke('shortcuts:unregister-all'),
  onScreenshot: (callback: () => void) => 
    ipcRenderer.on('shortcut:screenshot', callback),
  onVoice: (callback: () => void) => 
    ipcRenderer.on('shortcut:voice', callback),
})
```

#### Step 3: Add Types (src/electron.d.ts)
```typescript
interface ShortcutConfig {
  quickOpen: string
  quickCapture: string
  screenshot: string
  voiceToggle: string
}

interface Window {
  // ... existing APIs
  shortcuts: {
    registerAll: (config: ShortcutConfig) => Promise<{ success: boolean; registered: [string, string][] }>
    isAvailable: (accelerator: string) => Promise<boolean>
    unregisterAll: () => Promise<{ success: boolean }>
    onScreenshot: (callback: () => void) => void
    onVoice: (callback: () => void) => void
  }
}
```

#### Step 4: Register in Main (electron/main.ts)
```typescript
import { registerShortcutHandlers } from './ipc/shortcutHandlers'

app.whenReady().then(async () => {
  // ... existing initialization
  registerShortcutHandlers()
  
  // Load shortcuts from settings and register
  const settings = await loadSettings() // You'll need to implement this
  await window.shortcuts.registerAll(settings.shortcuts || DEFAULT_SHORTCUTS)
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll() // Already exists, keep this
})
```

#### Step 5: Settings UI (src/components/Settings/sections/ShortcutsSection.tsx)
```typescript
// New settings section for keyboard shortcuts
// - Display current shortcuts
// - Allow editing with validation
// - Show conflict warnings
// - Test shortcuts button
```

**Testing:**
```bash
# Test 1: Quick open works from any app
# Test 2: Shortcuts persist after restart
# Test 3: Conflict detection works
# Test 4: Unregister on app quit works
```

---

### Feature 2: Quick Capture Window

#### Implementation (electron/windows/quickCaptureWindow.ts)
```typescript
import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'

let quickCaptureWindow: BrowserWindow | null = null

export function createQuickCaptureWindow(): BrowserWindow {
  if (quickCaptureWindow) {
    quickCaptureWindow.focus()
    return quickCaptureWindow
  }

  quickCaptureWindow = new BrowserWindow({
    width: 500,
    height: 200,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load the quick capture route
  const captureUrl = process.env.VITE_DEV_SERVER_URL 
    ? `${process.env.VITE_DEV_SERVER_URL}#/capture`
    : `file://${path.join(process.env.DIST!, 'index.html')}#/capture`
  
  quickCaptureWindow.loadURL(captureUrl)

  // Center on screen
  quickCaptureWindow.center()

  // Show when ready
  quickCaptureWindow.once('ready-to-show', () => {
    quickCaptureWindow?.show()
    quickCaptureWindow?.focus()
  })

  // Handle submission
  ipcMain.handle('capture:submit', async (_event, content: string) => {
    // Save to "Quick Notes" session
    await saveToQuickNotes(content)
    closeQuickCaptureWindow()
    return { success: true }
  })

  // Handle cancel
  ipcMain.handle('capture:cancel', async () => {
    closeQuickCaptureWindow()
    return { success: true }
  })

  // Cleanup on close
  quickCaptureWindow.on('closed', () => {
    quickCaptureWindow = null
  })

  return quickCaptureWindow
}

export function closeQuickCaptureWindow() {
  quickCaptureWindow?.close()
  quickCaptureWindow = null
}

export function isQuickCaptureOpen(): boolean {
  return quickCaptureWindow !== null && !quickCaptureWindow.isDestroyed()
}

async function saveToQuickNotes(content: string) {
  // Implementation: Add message to "Quick Notes" chat session
  // Or create new session if doesn't exist
}
```

#### Quick Capture UI (src/components/QuickCapture/QuickCaptureWindow.tsx)
```typescript
import React, { useState, useEffect, useRef } from 'react'

export function QuickCaptureWindow() {
  const [content, setContent] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async () => {
    if (!content.trim()) return
    await window.capture.submit(content)
  }

  const handleCancel = async () => {
    await window.capture.cancel()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <div className="quick-capture-container">
      <textarea
        ref={inputRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Quick note... (Enter to save, Esc to cancel)"
        className="quick-capture-input"
        rows={4}
      />
      <div className="quick-capture-actions">
        <button onClick={handleCancel}>Cancel</button>
        <button onClick={handleSubmit}>Save</button>
      </div>
    </div>
  )
}
```

---

### Feature 3: Screenshot + AI Analysis

#### Step 1: Screen Capture Tool (electron/tools/screenshot.ts)
```typescript
import { desktopCapturer, nativeImage, ipcMain } from 'electron'
import { getMainWindow } from '../windows'

export interface ScreenshotResult {
  success: boolean
  imageData?: string // Base64 encoded
  error?: string
  sourceName?: string
}

export async function captureScreen(): Promise<ScreenshotResult> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })

    if (sources.length === 0) {
      return { success: false, error: 'No screen sources found' }
    }

    const primarySource = sources[0]
    const image = primarySource.thumbnail.toPNG()
    const base64 = `data:image/png;base64,${image.toString('base64')}`

    return {
      success: true,
      imageData: base64,
      sourceName: primarySource.name,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function captureWindow(): Promise<ScreenshotResult> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1920, height: 1080 },
      fetchWindowIcons: true,
    })

    // Show window picker (renderer-side) or return list
    return {
      success: true,
      // Return sources list for user to pick
      sources: sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
      })),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Register IPC handlers
export function registerScreenshotHandlers(): void {
  ipcMain.handle('screenshot:capture-screen', async () => {
    return captureScreen()
  })

  ipcMain.handle('screenshot:capture-window', async () => {
    return captureWindow()
  })
}
```

#### Step 2: Region Selection Overlay (electron/windows/regionSelector.ts)
```typescript
import { BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'

let regionSelectorWindow: BrowserWindow | null = null

export function showRegionSelector(): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize

    regionSelectorWindow = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // Load region selector UI
    regionSelectorWindow.loadURL(/* ... */)

    regionSelectorWindow.once('ready-to-show', () => {
      regionSelectorWindow?.show()
    })

    // Handle region selection
    ipcMain.once('region:selected', (_event, region) => {
      closeRegionSelector()
      resolve(region)
    })

    // Handle cancellation
    ipcMain.once('region:cancelled', () => {
      closeRegionSelector()
      resolve(null)
    })

    regionSelectorWindow.on('closed', () => {
      regionSelectorWindow = null
      resolve(null)
    })
  })
}

export function closeRegionSelector() {
  regionSelectorWindow?.close()
  regionSelectorWindow = null
}
```

#### Step 3: OCR Integration (electron/tools/ocr.ts)
```typescript
import Tesseract from 'tesseract.js'

export async function extractTextFromImage(imageBase64: string): Promise<string> {
  try {
    const result = await Tesseract.recognize(
      imageBase64,
      'eng', // Language code
      {
        logger: (m) => console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`),
      }
    )

    return result.data.text
  } catch (error) {
    console.error('[OCR] Failed:', error)
    return ''
  }
}
```

#### Step 4: Combine into Tool (electron/tools/index.ts)
```typescript
import { executeScreenshot } from './screenshotTool'

const toolHandlers: Record<string, ToolHandler> = {
  web_search: (args) => executeWebSearch(args as WebSearchArgs),
  screenshot: (args) => executeScreenshot(args),
  capture_and_analyze: (args) => executeCaptureAndAnalyze(args),
}

// screenshot tool definition
export interface ScreenshotArgs {
  mode: 'full' | 'window' | 'region'
  extractText?: boolean
  question?: string // What to ask about the screenshot
}
```

---

### Feature 4: Clipboard History

#### Step 1: Clipboard Monitor (electron/clipboardMonitor.ts)
```typescript
import { clipboard, ipcMain } from 'electron'
import { writeFileAtomic } from './utils/atomicFile'
import path from 'path'
import { app } from 'electron'

interface ClipboardItem {
  id: string
  type: 'text' | 'html' | 'image' | 'rtf'
  content: string
  timestamp: number
  source?: string // Application source (if detectable)
}

const MAX_HISTORY = 50
const CLIPBOARD_FILE = path.join(app.getPath('userData'), 'clipboard-history.json')

let clipboardHistory: ClipboardItem[] = []
let lastClipboardContent: string = ''
let monitorInterval: NodeJS.Timeout | null = null

export function startClipboardMonitoring() {
  // Load existing history
  loadClipboardHistory()

  // Start polling (Electron has no native clipboard change event)
  monitorInterval = setInterval(async () => {
    const currentText = clipboard.readText()
    
    if (currentText && currentText !== lastClipboardContent) {
      lastClipboardContent = currentText
      
      // Don't store passwords (simple heuristic)
      if (!isPasswordLike(currentText)) {
        await addClipboardItem({
          id: generateId(),
          type: 'text',
          content: currentText,
          timestamp: Date.now(),
        })
      }
    }
  }, 1000) // Check every second
}

export function stopClipboardMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
}

async function addClipboardItem(item: ClipboardItem) {
  // Remove duplicates
  clipboardHistory = clipboardHistory.filter(h => h.content !== item.content)
  
  // Add to front
  clipboardHistory.unshift(item)
  
  // Trim to max
  if (clipboardHistory.length > MAX_HISTORY) {
    clipboardHistory = clipboardHistory.slice(0, MAX_HISTORY)
  }
  
  // Save
  await saveClipboardHistory()
  
  // Notify renderer
  broadcastClipboardUpdate(item)
}

async function loadClipboardHistory() {
  try {
    const data = await fs.readFile(CLIPBOARD_FILE, 'utf-8')
    clipboardHistory = JSON.parse(data)
  } catch {
    clipboardHistory = []
  }
}

async function saveClipboardHistory() {
  await writeFileAtomic(CLIPBOARD_FILE, JSON.stringify(clipboardHistory, null, 2))
}

function isPasswordLike(text: string): boolean {
  // Simple heuristics to detect passwords
  const passwordIndicators = [
    /password[:\s=]+/i,
    /passwd[:\s=]+/i,
    /pwd[:\s=]+/i,
    /[a-zA-Z0-9!@#$%^&*]{16,}/, // Long random strings
  ]
  
  return passwordIndicators.some(pattern => pattern.test(text))
}

// IPC Handlers
export function registerClipboardHandlers() {
  ipcMain.handle('clipboard:get-history', async () => {
    return clipboardHistory
  })

  ipcMain.handle('clipboard:search', async (_event, query: string) => {
    const lowerQuery = query.toLowerCase()
    return clipboardHistory.filter(item => 
      item.content.toLowerCase().includes(lowerQuery)
    )
  })

  ipcMain.handle('clipboard:clear-history', async () => {
    clipboardHistory = []
    await saveClipboardHistory()
    return { success: true }
  })

  ipcMain.handle('clipboard:copy-item', async (_event, id: string) => {
    const item = clipboardHistory.find(h => h.id === id)
    if (item) {
      clipboard.writeText(item.content)
      return { success: true }
    }
    return { success: false, error: 'Item not found' }
  })
}

function broadcastClipboardUpdate(item: ClipboardItem) {
  // Broadcast to all windows
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('clipboard:updated', item)
  })
}
```

---

## Testing Checklist

### Global Hotkeys
- [ ] Ctrl+Space opens/closes main window
- [ ] Ctrl+Shift+C opens quick capture
- [ ] Ctrl+Shift+S triggers screenshot mode
- [ ] Shortcuts work when ZuraAI is not focused
- [ ] Custom shortcuts can be set in settings
- [ ] Conflicts are detected and reported
- [ ] Shortcuts persist after app restart

### Quick Capture
- [ ] Window appears on shortcut
- [ ] Typing works immediately
- [ ] Enter saves to Quick Notes
- [ ] Escape closes without saving
- [ ] Content appears in dashboard

### Screenshots
- [ ] Full screen capture works
- [ ] Region selection overlay appears
- [ ] Drag selection captures correct area
- [ ] Image attaches to current chat
- [ ] OCR extracts text (if implemented)
- [ ] Cancel works properly

### Clipboard
- [ ] History captures new copies
- [ ] Search returns relevant results
- [ ] Clicking item copies to clipboard
- [ ] Clear history works
- [ ] Passwords are filtered out

---

## Integration Points

### Settings Persistence
```typescript
// Add to SettingsConfigContext
interface SettingsConfig {
  // ... existing fields
  shortcuts: {
    quickOpen: string
    quickCapture: string
    screenshot: string
    voiceToggle: string
  }
  clipboardHistoryEnabled: boolean
  clipboardHistorySize: number
}
```

### IPC Registration Order (electron/main.ts)
```typescript
app.whenReady().then(async () => {
  // 1. Security handlers
  registerSessionSecurityHandlers()
  
  // 2. Core handlers
  registerShortcutHandlers()
  registerClipboardHandlers()
  registerScreenshotHandlers()
  
  // 3. Feature handlers
  registerToolHandlers()
  registerMcpHandlers()
  
  // 4. Initialize features
  startClipboardMonitoring() // If enabled
  
  // 5. Create window
  createMainWindow()
})
```

---

## Migration Notes

**From Current State:**
1. `globalShortcut` is already imported in main.ts
2. Unregister on `will-quit` already exists
3. IPC infrastructure exists
4. Just need to wire the pieces together

**Breaking Changes:**
- None for existing functionality
- New features are additive

**Backward Compatibility:**
- Default shortcuts should match common patterns
- Allow users to disable shortcuts entirely
- Existing web_search tool unchanged

---

## Dependencies to Add

```bash
npm install tesseract.js
npm install active-win
npm install chokidar
npm install fuse.js  # For fuzzy search in clipboard history
```

---

## Performance Considerations

1. **Clipboard Polling:** 1-second interval is reasonable, reduces to ~0.1% CPU usage
2. **Screenshot Storage:** Clean up temporary files, use compressed formats
3. **OCR:** Run in worker thread to avoid blocking main process
4. **Hotkey Registration:** Only register shortcuts user has configured

---

**Implementation Time Estimate:**
- Global Hotkeys: 1-2 days
- Quick Capture: 2-3 days  
- Screenshots: 3-4 days
- Clipboard History: 2-3 days
- **Total Phase 1:** 1-2 weeks for one developer

---

*This plan addresses the AGENTS.md TODO and implements the top 4 critical features.*
