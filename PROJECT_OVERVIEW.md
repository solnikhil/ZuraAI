# Zura AI - Project Overview

> A powerful Windows desktop AI assistant with screen understanding, tool calling, and the foundation to become a full Windows agent.

---

## Table of Contents

1. [Project Summary](#project-summary)
2. [Current Features](#current-features)
3. [Technical Architecture](#technical-architecture)
4. [File Structure](#file-structure)
5. [Tech Stack](#tech-stack)
6. [AI Providers](#ai-providers)
7. [Tool System](#tool-system)
8. [User Interface](#user-interface)
9. [Security & Storage](#security--storage)
10. [Future Roadmap: Windows Agent](#future-roadmap-windows-agent)
11. [Getting Started](#getting-started)
12. [Configuration](#configuration)

---

## Project Summary

**Zura AI** is a desktop AI assistant built with Electron + React that provides:

- 🖼️ **Screen capture & analysis** - Capture any part of your screen and ask AI about it
- 💬 **Multi-provider chat** - Use OpenRouter, Gemini, Groq, Perplexity, or local Ollama models
- 🛠️ **Tool calling** - Web search, URL fetching, clipboard access, calculations
- ⚡ **Global hotkeys** - Access anywhere with Ctrl+Shift+Z
- 🔒 **Secure storage** - API keys encrypted with Electron safeStorage
- 🎨 **Modern UI** - Dark/light themes, smooth animations

### Vision

Transform Zura into a full **Windows AI Agent** (like Comet browser) that can:
- Control mouse and keyboard
- Launch and manage applications
- Read and write files
- Execute tasks autonomously
- Understand screen content via OCR/vision

---

## Current Features

### ✅ Completed Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Screen Capture** | Full screen or region selection | ✅ Complete |
| **Overlay Interface** | Transparent, always-on-top chat | ✅ Complete |
| **Dashboard** | Full chat interface with history | ✅ Complete |
| **Multi-Provider AI** | OpenRouter, Gemini, Groq, Perplexity, Ollama | ✅ Complete |
| **Tool Calling** | Function calling with 6 tools | ✅ Complete |
| **Chat History** | Persistent sessions stored locally | ✅ Complete |
| **Secure API Storage** | Encrypted key storage | ✅ Complete |
| **Onboarding Wizard** | First-time setup flow | ✅ Complete |
| **Toast Notifications** | Error/success messages | ✅ Complete |
| **API Key Validation** | Test keys before saving | ✅ Complete |
| **Keyboard Shortcuts** | Customizable hotkeys | ✅ Complete |
| **Chat Management** | Export, rename, clear history | ✅ Complete |
| **Rate Limit Handling** | Friendly error messages | ✅ Complete |
| **Thinking Mode** | Show AI reasoning process | ✅ Complete |
| **Light/Dark Themes** | CSS variable-based theming | ✅ Complete |
| **Auto-Updates** | electron-updater integration | ✅ Complete |
| **Feedback System** | In-app bug reporting | ✅ Complete |
| **Streaming Support** | OpenRouter & Gemini streaming APIs | ✅ Complete |

### 🛠️ Available Tools

| Tool | Description | Category |
|------|-------------|----------|
| `web_search` | Search the internet via Tavily | Search |
| `fetch_url` | Read webpage content | Search |
| `get_datetime` | Current date/time/timezone | Utility |
| `calculator` | Evaluate math expressions | Utility |
| `read_clipboard` | Read system clipboard | System |
| `write_clipboard` | Write to clipboard | System |

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        ELECTRON                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Main Process                       │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐  │   │
│  │  │  Tray   │ │ Windows │ │ Hotkeys │ │   IPC     │  │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └───────────┘  │   │
│  │  ┌─────────────────────────────────────────────────┐│   │
│  │  │              Tool Handlers                       ││   │
│  │  │  web_search │ clipboard │ calculator │ etc.    ││   │
│  │  └─────────────────────────────────────────────────┘│   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────────────┐  │   │
│  │  │ Chat Store  │ │Secure Store │ │ Auto-Updater  │  │   │
│  │  └─────────────┘ └─────────────┘ └───────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                 │
│                      IPC Bridge                              │
│                            │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Renderer Process                     │   │
│  │  ┌─────────────────────────────────────────────────┐│   │
│  │  │                 React App                        ││   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐││   │
│  │  │  │ Overlay  │ │Dashboard │ │    Settings      │││   │
│  │  │  └──────────┘ └──────────┘ └──────────────────┘││   │
│  │  │  ┌──────────────────────────────────────────────┐│   │
│  │  │  │              AI Services                      ││   │
│  │  │  │ OpenRouter│Gemini│Groq│Perplexity│Ollama    ││   │
│  │  │  └──────────────────────────────────────────────┘│   │
│  │  │  ┌──────────────────────────────────────────────┐│   │
│  │  │  │              Contexts                         ││   │
│  │  │  │    Settings │ ChatHistory │ Toast            ││   │
│  │  │  └──────────────────────────────────────────────┘│   │
│  │  └─────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
ZuraAI/
├── electron/                      # Electron main process
│   ├── main.ts                   # App entry, windows, IPC
│   ├── preload.ts                # Context bridge APIs
│   ├── chatStore.ts              # Chat persistence
│   ├── secureStorage.ts          # Encrypted API keys
│   └── tools/                    # Tool implementations
│       ├── index.ts              # Handler registry
│       ├── webSearch.ts          # Tavily search
│       ├── urlFetcher.ts         # Web scraping
│       ├── calculator.ts         # Math evaluation
│       ├── datetime.ts           # Date/time info
│       └── clipboard.ts          # Clipboard R/W
│
├── src/                          # React renderer
│   ├── main.tsx                  # React entry
│   ├── App.tsx                   # Router setup
│   ├── index.css                 # Global styles + theme vars
│   ├── electron.d.ts             # TypeScript types
│   │
│   ├── components/               # UI Components
│   │   ├── Overlay.tsx           # Main overlay chat
│   │   ├── Overlay.css
│   │   ├── Settings.tsx          # Settings page (1700+ lines)
│   │   ├── Settings.css
│   │   ├── Onboarding.tsx        # First-run wizard
│   │   ├── Toast.tsx             # Notification system
│   │   ├── Feedback.tsx          # Bug report modal
│   │   ├── KeyboardShortcuts.tsx # Shortcuts panel
│   │   ├── ThinkingBlock.tsx     # AI reasoning display
│   │   ├── AgentBar.tsx          # Overlay input bar
│   │   ├── GradientText.tsx      # Animated text
│   │   ├── ShinyText.tsx         # Shimmer effects
│   │   └── Dashboard/            # Dashboard views
│   │       ├── Layout.tsx        # Dashboard layout
│   │       ├── Sidebar.tsx       # Navigation sidebar
│   │       ├── ChatArea.tsx      # Chat interface
│   │       └── ModelSelector.tsx # Model dropdown
│   │
│   ├── contexts/                 # React contexts
│   │   ├── SettingsContext.tsx   # App settings state
│   │   └── ChatHistoryContext.tsx# Chat sessions
│   │
│   ├── services/                 # AI provider APIs
│   │   ├── openrouter.ts         # OpenRouter + streaming
│   │   ├── gemini.ts             # Gemini + streaming
│   │   ├── groq.ts               # Groq API
│   │   ├── perplexity.ts         # Perplexity API
│   │   ├── ollama.ts             # Local Ollama
│   │   └── titleGenerator.ts     # Chat title AI
│   │
│   ├── tools/                    # Tool system (renderer)
│   │   ├── index.ts              # Exports
│   │   ├── definitions.ts        # Tool schemas
│   │   ├── executor.ts           # IPC execution
│   │   ├── toolManager.ts        # Tool orchestration
│   │   ├── adapters/             # Provider formatters
│   │   │   ├── openrouter.ts
│   │   │   └── gemini.ts
│   │   └── ui/                   # Tool UI components
│   │       ├── ToolCallIndicator.tsx
│   │       └── ToolResultDisplay.tsx
│   │
│   ├── hooks/                    # Custom hooks
│   │   └── useToolCalling.ts     # Tool integration hook
│   │
│   └── utils/                    # Utilities
│       ├── secureApiKeys.ts      # Secure storage helpers
│       ├── chatExport.ts         # Export to JSON/MD
│       └── tokenUtils.ts         # Token counting
│
├── public/                       # Static assets
│   ├── icon.png                  # App icon
│   └── tray-icon.png            # System tray icon
│
├── package.json                  # Dependencies & build config
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript config
├── AGENT_ROADMAP.md             # Future agent plans
└── README.md                    # Project documentation
```

---

## Tech Stack

### Core

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | 25.x | Desktop framework |
| React | 18.x | UI library |
| TypeScript | 5.x | Type safety |
| Vite | 4.x | Build tool |

### UI & Styling

| Technology | Purpose |
|------------|---------|
| Framer Motion | Animations |
| Lucide React | Icons |
| React Markdown | Markdown rendering |
| React Syntax Highlighter | Code blocks |
| Custom CSS | Theming & styles |

### Electron Specific

| Package | Purpose |
|---------|---------|
| electron-builder | App packaging |
| electron-updater | Auto-updates |
| electron-overlay-window | Overlay support |

### AI & Tools

| Service | Purpose |
|---------|---------|
| OpenRouter API | Multi-model access |
| Google Gemini | Direct Gemini access |
| Groq API | Fast inference |
| Perplexity API | Search-focused AI |
| Ollama | Local model inference |
| Tavily API | Web search |

---

## AI Providers

### OpenRouter (Default)
- Access to 100+ models
- Function calling support
- Streaming support
- Models: GPT-4o, Claude 3.5, Grok, Llama, etc.

### Google Gemini
- Direct API access
- Vision support (Gemini Pro Vision)
- Streaming support
- Models: Gemini 2.5 Pro/Flash

### Groq
- Ultra-fast inference
- Open source models
- Models: Llama 3.3, Mixtral

### Perplexity
- Search-augmented responses
- Real-time information
- Models: Sonar, Sonar Pro

### Ollama (Local)
- Fully offline operation
- No API key needed
- Any pulled model

---

## Tool System

### Architecture

```
User Request
     │
     ▼
┌─────────────┐     ┌──────────────┐
│   AI Model  │────▶│ Tool Decision │
└─────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Tool Adapter  │ (Format for provider)
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Executor    │ (IPC to main process)
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │Tool Handler  │ (Actual execution)
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Result     │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   AI Model   │ (Interpret result)
                    └──────────────┘
                           │
                           ▼
                    Final Response
```

### Adding New Tools

1. **Define schema** in `src/tools/definitions.ts`:
```typescript
{
    name: 'my_tool',
    description: 'What this tool does',
    parameters: {
        type: 'object',
        properties: {
            arg1: { type: 'string', description: '...' }
        },
        required: ['arg1']
    },
    category: 'utility'
}
```

2. **Implement handler** in `electron/tools/myTool.ts`:
```typescript
export async function executeMyTool(args: any): Promise<ToolResult> {
    // Implementation
    return { success: true, data: result }
}
```

3. **Register handler** in `electron/tools/index.ts`:
```typescript
const toolHandlers = {
    my_tool: executeMyTool,
    // ...existing tools
}
```

---

## User Interface

### Overlay Mode
- Triggered by `Ctrl+Shift+Z`
- Transparent background
- Region selection for screenshots
- Floating chat interface
- Always on top

### Dashboard Mode
- Full application window
- Sidebar with chat history
- Settings access
- Model selection

### Themes
- **Dark mode** (default): Deep blacks, orange accents
- **Light mode**: Clean whites, purple accents
- **System**: Follow OS preference

CSS variables in `src/index.css`:
```css
:root {
    --bg-primary: #0a0a0a;
    --text-primary: #ffffff;
    --accent-primary: #8b5cf6;
    /* ... */
}
```

---

## Security & Storage

### API Key Storage
- Keys stored via Electron's `safeStorage` API
- Encrypted using OS keychain (Windows Credential Manager)
- Never stored in localStorage or plain files
- Migration from localStorage on first run

### Chat Storage
- Stored in `%APPDATA%/zura/chats.json`
- JSON format for easy backup
- Per-session message history

### Security Practices
- Context isolation enabled
- Node integration disabled
- Preload scripts for IPC
- No eval() usage
- CSP headers (when packaged)

---

## Future Roadmap: Windows Agent

### Phase 1: Computer Control (4-6 weeks)
- [ ] Mouse control (click, move, drag, scroll)
- [ ] Keyboard control (type, hotkeys)
- [ ] Screen OCR (text extraction)
- [ ] Element detection via vision

### Phase 2: System Control (4-6 weeks)
- [ ] App launch/close
- [ ] Window management
- [ ] File operations
- [ ] Shell commands

### Phase 3: Agent Intelligence (6-8 weeks)
- [ ] Task planning & decomposition
- [ ] Multi-step execution
- [ ] Error recovery
- [ ] Memory & learning

### Phase 4: Safety & UX (3-4 weeks)
- [ ] Action confirmation dialogs
- [ ] Emergency stop
- [ ] Audit logging
- [ ] Visual action feedback

### Target Capabilities
```
"Open Chrome and search for Python tutorials"
"Create a folder called Projects on Desktop"
"Take a screenshot and save it to Documents"
"Close all browser windows"
"Find and open the file I downloaded yesterday"
```

See [AGENT_ROADMAP.md](./AGENT_ROADMAP.md) for detailed plans.

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Windows 10/11

### Installation

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/ZuraAI.git
cd ZuraAI

# Install dependencies
npm install

# Run in development
npm run dev
```

### Building

```bash
# Build installer
npm run build

# Output: dist/Zura Setup.exe
```

---

## Configuration

### Settings Location
- **App settings**: `%APPDATA%/zura/settings.json`
- **Chat history**: `%APPDATA%/zura/chats.json`
- **Secure storage**: `%APPDATA%/zura/secure-storage.json` (encrypted)

### Environment Variables
```env
VITE_OPENROUTER_API_KEY=sk-or-...  # Optional fallback
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Z` | Toggle overlay |
| `Ctrl+Shift+X` | Screenshot mode |
| `Escape` | Close overlay/cancel |
| `Enter` | Send message |
| `Shift+Enter` | New line |

---

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing`
5. Open Pull Request

---

## License

MIT License - see [LICENSE](./LICENSE)

---

## Acknowledgments

- [Electron](https://electronjs.org/)
- [React](https://react.dev/)
- [OpenRouter](https://openrouter.ai/)
- [Tavily](https://tavily.com/)

---

*Last Updated: December 2024*

