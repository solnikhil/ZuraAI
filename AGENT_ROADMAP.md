# Zura AI → Windows Agent Roadmap

## Vision Statement

Transform Zura AI from a chat assistant into a full-fledged **Windows AI Agent** capable of understanding your screen, controlling your computer, and executing complex multi-step tasks autonomously - similar to Comet browser, Claude Computer Use, or Open Interpreter.

---

## Current State Analysis ✅

### What Zura Already Has

| Feature | Status | Notes |
|---------|--------|-------|
| Screen Capture | ✅ Complete | Full screen + region selection |
| Overlay Interface | ✅ Complete | Global hotkey (Ctrl+Shift+Z) |
| Tool Calling | ✅ Complete | OpenRouter/Gemini compatible |
| Web Search | ✅ Complete | Tavily API integration |
| URL Fetching | ✅ Complete | Webpage content extraction |
| Clipboard R/W | ✅ Complete | System clipboard access |
| Calculator | ✅ Complete | Math expression evaluation |
| Date/Time | ✅ Complete | Timezone aware |
| Multi-Provider AI | ✅ Complete | OpenRouter, Gemini, Groq, Perplexity, Ollama |
| Chat History | ✅ Complete | Persistent sessions |
| Secure API Storage | ✅ Complete | Electron safeStorage |

---

## Phase 1: Core Computer Control (4-6 weeks)

### 1.1 Mouse Control 🖱️
**Priority: HIGH**

```typescript
// Tools to implement:
- move_mouse(x, y)           // Move cursor to coordinates
- click(x, y, button?)       // Click at position (left/right/middle)
- double_click(x, y)         // Double click
- drag(startX, startY, endX, endY)  // Drag operation
- scroll(direction, amount)   // Scroll up/down/left/right
```

**Implementation:**
- Use `robotjs` or `nut.js` (nuttree) for native mouse control
- Add coordinate system overlay for visual debugging
- Implement click animation feedback

### 1.2 Keyboard Control ⌨️
**Priority: HIGH**

```typescript
// Tools to implement:
- type_text(text)            // Type string character by character
- press_key(key)             // Single key press (Enter, Tab, etc.)
- hotkey(modifiers, key)     // Combo like Ctrl+C, Alt+Tab
- hold_key(key, duration)    // Hold key for duration
```

**Implementation:**
- Support all special keys (Function keys, media keys)
- Handle modifier keys properly (Ctrl, Alt, Shift, Win)
- Add typing delay for realistic input

### 1.3 Screen Understanding 👁️
**Priority: HIGH**

```typescript
// Tools to implement:
- capture_screen()                    // Full screen capture
- capture_region(x, y, w, h)         // Region capture
- capture_window(title)               // Specific window
- find_element(description)           // AI-powered element finding
- get_screen_text()                   // OCR full screen
- get_text_at(x, y, w, h)            // OCR region
```

**Implementation:**
- Integrate Tesseract.js for OCR
- Use vision models (GPT-4V, Gemini Vision) for element detection
- Build UI element bounding box detection
- Consider Microsoft's UI Automation API for native elements

---

## Phase 2: Application & System Control (4-6 weeks)

### 2.1 Application Management 📱
**Priority: HIGH**

```typescript
// Tools to implement:
- launch_app(name_or_path)            // Open application
- close_app(name)                     // Close application
- list_running_apps()                 // Get open applications
- focus_window(title)                 // Bring window to front
- minimize_window(title)              // Minimize
- maximize_window(title)              // Maximize
- resize_window(title, w, h)          // Resize window
- move_window(title, x, y)            // Move window
- list_windows()                      // Get all windows
- take_window_screenshot(title)       // Screenshot specific window
```

**Implementation:**
- Use `node-ffi-napi` for Windows API calls
- Integrate `active-win` package
- Use PowerShell scripts for complex operations

### 2.2 File System Operations 📁
**Priority: MEDIUM**

```typescript
// Tools to implement:
- read_file(path)                     // Read file contents
- write_file(path, content)           // Write to file
- create_file(path)                   // Create new file
- delete_file(path)                   // Delete file
- list_directory(path)                // List folder contents
- create_directory(path)              // Create folder
- copy_file(src, dest)                // Copy file
- move_file(src, dest)                // Move/rename file
- file_exists(path)                   // Check existence
- get_file_info(path)                 // Get metadata
- search_files(dir, pattern)          // Search files
- open_file(path)                     // Open with default app
- open_folder(path)                   // Open in Explorer
```

**Implementation:**
- Use Node.js `fs` module with proper sandboxing
- Implement path validation and security checks
- Add file size limits
- Support common file formats

### 2.3 System Operations 🖥️
**Priority: MEDIUM**

```typescript
// Tools to implement:
- run_command(cmd)                    // Execute shell command
- get_system_info()                   // CPU, RAM, OS info
- get_running_processes()             // List processes
- kill_process(name_or_pid)           // End process
- set_volume(level)                   // Audio volume
- get_volume()                        // Current volume
- set_brightness(level)               // Screen brightness
- lock_screen()                       // Lock workstation
- take_screenshot()                   // Full screenshot to file
- get_notifications()                 // Read notifications
- show_notification(title, body)      // Display notification
```

---

## Phase 3: Intelligent Agent Capabilities (6-8 weeks)

### 3.1 Task Planning & Execution 🧠
**Priority: HIGH**

```typescript
// Agent loop implementation:
1. User gives high-level task
2. AI breaks into subtasks
3. For each subtask:
   - Analyze current screen state
   - Decide next action
   - Execute action
   - Verify result
   - Handle errors/retry
4. Report completion or failure
```

**Features:**
- Multi-step task decomposition
- State tracking between actions
- Error recovery and retry logic
- Progress reporting to user
- Ability to ask clarifying questions
- Cancel/pause capability

### 3.2 Memory & Context 💾
**Priority: HIGH**

```typescript
// Memory systems:
- Short-term: Current task context
- Medium-term: Recent tasks and learnings
- Long-term: User preferences, common workflows
```

**Implementation:**
- Vector database for semantic search (e.g., sqlite-vec)
- Store successful task sequences
- Remember user preferences
- Learn from corrections

### 3.3 Visual Understanding 👀
**Priority: HIGH**

```typescript
// Advanced vision features:
- Element detection and labeling
- UI state understanding
- Change detection between screenshots
- Text extraction with layout
- Icon/button recognition
```

**Implementation:**
- Use GPT-4V, Gemini Vision, or Claude Vision
- Implement Set-of-Mark (SoM) prompting
- Build screenshot annotation system
- Cache element positions for performance

---

## Phase 4: Safety & User Experience (3-4 weeks)

### 4.1 Safety Guardrails 🛡️
**Priority: CRITICAL**

```typescript
// Safety features:
- Action confirmation for sensitive operations
- Restricted paths/applications list
- Rate limiting for automated actions
- Pause button / emergency stop
- Audit log of all actions
- Undo capability where possible
- Sandbox mode for testing
```

**Rules:**
- Never delete system files
- Require confirmation for:
  - File deletion
  - Running commands
  - Sending emails/messages
  - Making purchases
  - Installing software
- Block access to:
  - Password managers
  - Banking apps
  - Private folders

### 4.2 User Experience 🎨
**Priority: HIGH**

```typescript
// UX improvements:
- Real-time action visualization
- Step-by-step progress indicator
- Transparent reasoning display
- Easy task interruption
- Voice input/output (optional)
- Task templates for common workflows
```

---

## Phase 5: Advanced Features (Ongoing)

### 5.1 Browser Automation 🌐
**Priority: MEDIUM**

```typescript
// Browser-specific tools:
- open_url(url)                       // Open in browser
- navigate_to(url)                    // Navigate current tab
- click_element(selector)             // Click by CSS selector
- type_in_element(selector, text)     // Type in input
- get_page_content()                  // Get page HTML/text
- wait_for_element(selector)          // Wait for element
- extract_data(selectors)             // Scrape data
```

**Implementation:**
- Use Playwright or Puppeteer
- Support Chrome, Edge, Firefox
- Handle authentication flows
- Manage multiple tabs

### 5.2 Workflow Automation 🔄
**Priority: MEDIUM**

```typescript
// Workflow features:
- Record and replay workflows
- Schedule tasks
- Trigger on events (time, file change, etc.)
- Chain multiple workflows
- Share workflow templates
```

### 5.3 Integration APIs 🔌
**Priority: LOW**

```typescript
// Third-party integrations:
- Email (Outlook, Gmail)
- Calendar (Google, Outlook)
- Messaging (Slack, Discord, Teams)
- Cloud storage (OneDrive, Google Drive)
- Note-taking (Notion, Obsidian)
```

---

## Technical Architecture

### Proposed Tool Categories

```
electron/tools/
├── index.ts                 # Handler registry
├── computer/
│   ├── mouse.ts            # Mouse control
│   ├── keyboard.ts         # Keyboard control
│   └── screen.ts           # Screen capture & OCR
├── apps/
│   ├── launcher.ts         # App launch/close
│   ├── windows.ts          # Window management
│   └── processes.ts        # Process control
├── files/
│   ├── read.ts             # Read operations
│   ├── write.ts            # Write operations
│   ├── manage.ts           # Copy/move/delete
│   └── search.ts           # File search
├── system/
│   ├── shell.ts            # Command execution
│   ├── info.ts             # System information
│   └── settings.ts         # System settings
├── browser/
│   ├── navigation.ts       # URL handling
│   ├── interaction.ts      # Page interaction
│   └── extraction.ts       # Data extraction
└── search/                  # (existing)
    ├── webSearch.ts
    └── urlFetcher.ts
```

### Required Dependencies

```json
{
  "dependencies": {
    "@nuttree/nut-js": "^4.x",       // Mouse & keyboard
    "tesseract.js": "^5.x",          // OCR
    "active-win": "^8.x",            // Window detection
    "node-ffi-napi": "^4.x",         // Windows API
    "playwright": "^1.x",            // Browser automation (optional)
    "better-sqlite3": "^9.x",        // Local storage
    "@anthropic-ai/sdk": "^0.x"      // Claude API (computer use)
  }
}
```

---

## Implementation Priority Matrix

| Phase | Feature | Effort | Impact | Priority |
|-------|---------|--------|--------|----------|
| 1 | Mouse Control | Medium | High | 🔴 P0 |
| 1 | Keyboard Control | Medium | High | 🔴 P0 |
| 1 | Screen OCR | Medium | High | 🔴 P0 |
| 2 | App Launcher | Low | High | 🔴 P0 |
| 2 | Window Management | Medium | High | 🟠 P1 |
| 2 | File Operations | Medium | High | 🟠 P1 |
| 3 | Task Planning | High | Critical | 🔴 P0 |
| 3 | Visual Understanding | High | Critical | 🔴 P0 |
| 3 | Memory System | Medium | High | 🟠 P1 |
| 4 | Safety Guardrails | Medium | Critical | 🔴 P0 |
| 4 | UX Polish | Medium | High | 🟠 P1 |
| 5 | Browser Automation | High | Medium | 🟡 P2 |
| 5 | Workflows | High | Medium | 🟡 P2 |

---

## MVP Definition (v2.0)

The minimum viable Windows Agent should include:

1. ✅ **Screen Understanding**
   - Full screen capture
   - OCR text extraction
   - Basic element detection

2. ✅ **Computer Control**
   - Mouse clicks and movement
   - Keyboard typing and shortcuts
   - Scroll support

3. ✅ **Application Control**
   - Launch applications
   - Switch between windows
   - Close applications

4. ✅ **Basic File Operations**
   - Read/write text files
   - List directories
   - Open files with default app

5. ✅ **Safety**
   - Action confirmation dialogs
   - Sensitive operation warnings
   - Emergency stop

6. ✅ **Agent Loop**
   - Task decomposition
   - Action execution
   - Result verification
   - Error handling

---

## Competitive Analysis

| Feature | Zura (Current) | Zura (Target) | Comet | Claude CU | Open Interpreter |
|---------|---------------|---------------|-------|-----------|------------------|
| Chat Interface | ✅ | ✅ | ✅ | ✅ | ✅ |
| Screen Capture | ✅ | ✅ | ✅ | ✅ | ❌ |
| Mouse Control | ❌ | ✅ | ✅ | ✅ | ✅ |
| Keyboard Control | ❌ | ✅ | ✅ | ✅ | ✅ |
| OCR | ❌ | ✅ | ✅ | ✅ | ❌ |
| App Launch | ❌ | ✅ | ✅ | ✅ | ✅ |
| File Ops | ❌ | ✅ | ✅ | ✅ | ✅ |
| Shell Commands | ❌ | ✅ | ✅ | ✅ | ✅ |
| Browser Auto | ❌ | ✅ | ✅ | ✅ | ❌ |
| Local Models | ✅ | ✅ | ❌ | ❌ | ✅ |
| Open Source | ✅ | ✅ | ❌ | ❌ | ✅ |
| Windows Native | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## Timeline Estimate

```
Month 1-2:  Phase 1 - Core Computer Control
Month 2-3:  Phase 2 - Application & System Control  
Month 3-4:  Phase 3 - Intelligent Agent Capabilities
Month 4-5:  Phase 4 - Safety & UX
Month 5+:   Phase 5 - Advanced Features

Total: ~5-6 months to feature parity with Comet
```

---

## Success Metrics

1. **Task Completion Rate**: % of tasks completed successfully
2. **Actions per Task**: Average steps needed (lower = smarter)
3. **Error Rate**: % of actions that fail
4. **User Intervention Rate**: How often user needs to help
5. **Task Time**: Time to complete common workflows
6. **Safety Incidents**: Number of unwanted actions

---

## Next Steps

1. [ ] Install `@nuttree/nut-js` for mouse/keyboard control
2. [ ] Implement basic mouse tools (click, move, scroll)
3. [ ] Implement basic keyboard tools (type, hotkey)
4. [ ] Add OCR with Tesseract.js
5. [ ] Create agent loop infrastructure
6. [ ] Build safety confirmation dialogs
7. [ ] Test with simple workflows (e.g., "open notepad and type hello")

---

*This roadmap is a living document. Update as progress is made.*

**Last Updated**: December 2024
**Author**: Zura AI Team

