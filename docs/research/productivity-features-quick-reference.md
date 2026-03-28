# ZuraAI Productivity Features - Quick Reference

## 🎯 Top 5 Critical Features to Implement

### 1. **Global Hotkey System** 🔥
**Status:** Infrastructure exists, needs wiring  
**Effort:** 1-2 days  
**Impact:** HIGH
- Wire `globalShortcut` to user settings (fixes AGENTS.md TODO #406)
- Implement: Quick Open (Ctrl+Space) ✅, Quick Capture (Ctrl+Shift+C), Screenshot (Ctrl+Shift+S)
- Files: `electron/main.ts`, `electron/preload.ts`, `src/electron.d.ts`

### 2. **Screenshot → AI Analysis** 📸
**Status:** Not implemented  
**Effort:** 1 week  
**Impact:** HIGH
- Use `desktopCapturer` API for screen/window capture
- Build region selection overlay (transparent BrowserWindow)
- Add OCR for text extraction (Tesseract.js)
- Pipeline: Capture → OCR/Visual Analysis → AI Context

### 3. **Voice Input (Whisper)** 🎤
**Status:** Not implemented  
**Effort:** 2 weeks  
**Impact:** HIGH
- Implement push-to-talk (Ctrl+Shift+V)
- Integrate Whisper via Ollama (local) or OpenAI API (cloud)
- Audio capture via Web Audio API in renderer
- Add voice activity detection for continuous mode

### 4. **Clipboard Intelligence** 📋
**Status:** Basic read/write only  
**Effort:** 3-4 days  
**Impact:** MEDIUM-HIGH
- History storage (last 50 items) with search
- Smart paste with AI formatting
- Clipboard monitoring for URLs/code
- IPC: `clipboard:get-history`, `clipboard:search`

### 5. **File System Tools** 📁
**Status:** Via MCP only  
**Effort:** 1 week  
**Impact:** MEDIUM
- Built-in tools: `search_files`, `read_file`, `list_directory`
- Fast file search (like Everything on Windows)
- Drag & drop file support in chat
- Directory watching for smart suggestions

---

## 📊 Feature Priority Matrix

| Feature | Effort | Impact | Priority | Complexity |
|---------|--------|--------|----------|------------|
| Global Hotkeys | Low | High | **P0** | Low |
| Screenshot → AI | Medium | High | **P0** | Medium |
| Voice Input | Medium | High | **P0** | Medium |
| Clipboard History | Low | Medium | **P1** | Low |
| File System Tools | Medium | Medium | **P1** | Medium |
| Native Notifications | Low | Medium | **P1** | Low |
| Compact/PiP Mode | Medium | Medium | **P1** | Medium |
| Tray Enhancements | Low | Low | **P2** | Low |
| Voice Commands | Medium | Medium | **P2** | High |
| Workflows/Automation | High | High | **P2** | High |
| Screen Recording | Medium | Low | **P3** | Medium |
| TTS Output | Low | Low | **P3** | Low |
| Browser Extension | High | Medium | **P3** | High |

---

## 🔧 Implementation Roadmap

### Week 1-2: Foundation
```
□ Fix globalShortcut wiring (AGENTS.md TODO)
□ Implement Quick Capture (Ctrl+Shift+C) → floating input
□ Add native notifications for response completion
□ Enhance tray with recent conversations
```

### Week 3-4: Visual Context
```
□ Implement desktopCapturer integration
□ Build region selection overlay UI
□ Create screenshot → AI pipeline
□ Add basic OCR (Tesseract.js)
□ Implement Ctrl+Shift+S shortcut
```

### Week 5-6: Voice Interface
```
□ Add audio capture infrastructure
□ Integrate Whisper via Ollama
□ Create voice input UI (push-to-talk)
□ Implement voice transcription
□ Add voice command detection (optional)
```

### Week 7-8: Productivity Suite
```
□ Clipboard history with search (Ctrl+Shift+H)
□ File system search tools
□ Drag & drop file support
□ Compact/PiP mode window
□ In-app search (Ctrl+K) for chats
```

### Week 9-10: Advanced
```
□ Workflow automation builder
□ Custom shortcuts configuration UI
□ Window context detection (active-win)
□ Smart folder watching
□ Plugin browser for MCP servers
```

---

## 🔌 Key Electron APIs to Use

```typescript
// Global Hotkeys (main process)
import { globalShortcut } from 'electron';
globalShortcut.register('CommandOrControl+Shift+C', () => {
  // Open quick capture
});

// Clipboard (main process, expose via IPC)
import { clipboard } from 'electron';
clipboard.readText(); // Get clipboard content
clipboard.writeText('text'); // Set clipboard

// Screen Capture (main process)
import { desktopCapturer } from 'electron';
const sources = await desktopCapturer.getSources({
  types: ['screen', 'window'],
  thumbnailSize: { width: 1920, height: 1080 }
});

// Notifications (main process)
import { Notification } from 'electron';
new Notification({ title: 'ZuraAI', body: 'Response ready' }).show();

// Window Management
const miniWindow = new BrowserWindow({
  width: 400,
  height: 600,
  alwaysOnTop: true,
  skipTaskbar: true,
  // ... other options
});
```

---

## 📦 Required Dependencies

```json
{
  "dependencies": {
    "active-win": "^8.2.1",
    "chokidar": "^3.6.0",
    "node-cron": "^3.0.3",
    "tesseract.js": "^5.0.5",
    "fuse.js": "^7.0.0"
  }
}
```

---

## 🏗️ Architecture Notes

### Security Boundaries
```
Renderer (Untrusted)
  ↕ contextBridge (IPC)
Preload (Security Layer)
  ↕ IPC Handlers
Main Process (Trusted)
  ↓
System APIs (clipboard, desktopCapturer, globalShortcut)
```

### New IPC Channels Needed
```typescript
// Preload allowlists (electron/preload.ts)
INVOKE_CHANNELS: [
  // Existing...
  'clipboard:get-history',
  'clipboard:clear-history',
  'screenshot:capture',
  'screenshot:capture-region',
  'voice:start-recording',
  'voice:stop-recording',
  'files:search',
  'files:read',
  'window:show-compact',
  'shortcuts:register',
  'shortcuts:unregister',
]

ON_CHANNELS: [
  // Existing...
  'voice:transcription',
  'screenshot:captured',
  'clipboard:changed',
]
```

---

## 🎨 UX Considerations

### Quick Capture Flow
1. User presses Ctrl+Shift+C (anywhere)
2. Small floating window appears (always on top)
3. User types/voices input
4. Auto-saves to "Quick Notes" session
5. Can immediately ask AI about it

### Screenshot Flow
1. User presses Ctrl+Shift+S
2. Screen dims, cursor changes to crosshair
3. User drags to select region
4. Screenshot captured + OCR'd
5. Automatically attached to current chat or new "Analysis" session

### Voice Input Flow
1. User holds Ctrl+Shift+V (push-to-talk)
2. Audio indicator shows recording
3. User speaks, releases key
4. Whisper transcribes locally or via API
5. Text appears in input field (editable before send)

---

## 📈 Success Metrics

- **Hotkey Usage:** Track which shortcuts are used most
- **Screenshot Analysis:** Count of screenshots → AI queries
- **Voice Adoption:** % of messages sent via voice
- **Clipboard Saves:** Number of items in history
- **Feature Discovery:** User onboarding completion rate

---

## 🐛 Known Issues to Address

1. **AGENTS.md:406** - User-configured global shortcuts not wired to `globalShortcut.register()`
2. **SettingsContext.tsx:425-427** - Notifications were removed, need to reimplement
3. **Voice Implementation** - No existing audio infrastructure
4. **Screenshot** - No desktopCapturer usage currently

---

## 📚 Reference Documentation

- **Electron Global Shortcuts:** https://www.electronjs.org/docs/latest/api/global-shortcut
- **Electron Clipboard:** https://www.electronjs.org/docs/latest/api/clipboard
- **Electron Desktop Capturer:** https://www.electronjs.org/docs/latest/api/desktop-capturer
- **Whisper Models:** https://github.com/openai/whisper
- **Active Window Detection:** https://github.com/sindresorhus/active-win
- **OCR:** https://github.com/naptha/tesseract.js

---

## 💡 Quick Wins (1-2 Days Each)

1. ✅ **Fix Global Shortcuts** - Just wire existing infrastructure
2. ✅ **Native Notifications** - Add Notification module usage
3. ✅ **Tray Recent Chats** - Add menu items dynamically
4. ✅ **In-App Search (Ctrl+K)** - Search through chat history
5. ✅ **New Chat Shortcut (Ctrl+N)** - Keyboard shortcut

---

*Last Updated: March 28, 2026*  
*For: ZuraAI Development Team*
