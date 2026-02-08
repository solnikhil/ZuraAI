# Zura AI

A powerful desktop AI assistant for Windows with multimodal chat, file analysis, and multiple AI provider support.

![Zura AI](public/icon.png)

## Features

### Multi-Provider AI Support
- **OpenRouter** - Access 100+ AI models including GPT-4, Claude, Gemini, Llama, and more
- **Ollama** - Run local AI models for privacy and offline use
- **Perplexity** - Real-time web search powered AI responses

### Image & File Analysis
- **Drag & Drop Attachments** - Add images and documents directly into chat
- **Paste from Clipboard** - Quickly paste screenshots/images into the input
- **Vision AI** - Send image attachments to vision-capable models for analysis

### Dashboard Interface
- **Chat History** - Persistent conversations saved locally
- **Model Selector** - Quick switch between configured AI models
- **Settings Panel** - Customize everything from API keys to system prompts

### Additional Features
- **System Tray** - Runs quietly in the background
- **Markdown Rendering** - Beautiful code highlighting and formatting
- **Token Usage Tracking** - Monitor API usage per response
- **Response Latency** - See how fast each model responds
- **Custom System Prompts** - Personalize AI behavior
- **Quick Prompts** - Pre-configured prompt shortcuts

---

## Installation on Windows

### Prerequisites

1. **Node.js** (v18 or higher)
   - Download from: https://nodejs.org/
   - Choose the LTS version
   - Run the installer and follow the prompts
   - Verify installation:
     ```cmd
     node --version
     npm --version
     ```

2. **Git** (optional, for cloning)
   - Download from: https://git-scm.com/download/win
   - Or download the project as a ZIP file

### Step-by-Step Installation

#### Option 1: Clone with Git

```cmd
git clone https://github.com/yourusername/zura.git
cd zura
```

#### Option 2: Download ZIP

1. Download the project ZIP file
2. Extract to your desired location
3. Open Command Prompt and navigate to the folder:
   ```cmd
   cd C:\path\to\zura
   ```

#### Install Dependencies

```cmd
npm install
```

This will install all required packages including:
- React 18
- Electron 25
- Vite 4
- TypeScript 5
- And other dependencies

#### Configure Environment (Optional)

Create a `.env` file in the project root for default API keys:

```env
VITE_OPENROUTER_API_KEY=your_openrouter_api_key_here
```

> Note: You can also configure API keys directly in the app's Settings panel.

---

## Running the Application

### Development Mode

```cmd
npm run dev
```

This starts:
- Vite dev server with hot reload
- Electron application in development mode
- DevTools enabled for debugging

### Build for Production

```cmd
npm run build
```

This creates:
- Compiled TypeScript in `dist-electron/`
- Bundled React app in `dist/`
- Windows installer in `dist/` (NSIS installer)

### Build Directory Only (No Installer)

```cmd
npm run build:dir
```

Creates a portable version without an installer.

---

## Configuration

### API Keys Setup

#### OpenRouter (Recommended for beginners)
1. Go to https://openrouter.ai/
2. Create an account and get your API key
3. In Zura, go to Settings → OpenRouter API Key
4. Paste your key and save

#### Ollama (Local AI)
1. Install Ollama from https://ollama.ai/
2. Pull a model: `ollama pull llama3.2`
3. Ollama runs on `http://localhost:11434` by default
4. In Zura Settings, select "Ollama" as provider
5. Your local models will appear automatically

#### Perplexity
1. Go to https://www.perplexity.ai/
2. Get your API key from settings
3. In Zura Settings, add your Perplexity API key
4. Select "Perplexity" as provider

### Available Models

#### OpenRouter Models (Default)
| Model | Description |
|-------|-------------|
| Grok 4.1 Fast | Fast responses, good for general use |
| Claude 3.5 Sonnet | Excellent for coding and analysis |
| GPT-4o | OpenAI's latest multimodal model |
| GPT-4o Mini | Faster, cheaper GPT-4 variant |
| Gemini 2.0 Flash | Google's fast model (free tier) |
| Llama 3.3 70B | Meta's open-source powerhouse |

#### Perplexity Models
| Model | Description |
|-------|-------------|
| Sonar | Standard search-powered responses |
| Sonar Pro | Enhanced accuracy and depth |
| Sonar Reasoning | Step-by-step logical analysis |
| Sonar Deep Research | Comprehensive research mode |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Start new chat |
| `Ctrl+Space` | Toggle command bar |
| `Enter` | Send message |
| `Shift+Enter` | New line in message |

---

## Project Structure

```
zura/
├── electron/              # Electron main process
│   ├── main.ts           # Main window, tray, IPC handlers
│   ├── preload.ts        # Secure bridge to renderer
│   └── chatStore.ts      # Persistent chat storage
├── src/                   # React frontend
│   ├── components/       # UI components
│   │   ├── Dashboard/    # Main dashboard views
│   │   ├── Chat.tsx      # Legacy chat interface
│   │   └── Settings/     # Settings panel
│   ├── contexts/         # React contexts
│   │   ├── SettingsContext.tsx
│   │   └── ChatHistoryContext.tsx
│   ├── services/         # AI provider integrations
│   │   ├── gemini.ts
│   │   ├── ollama.ts
│   │   └── perplexity.ts
│   └── utils/            # Utility functions
├── public/               # Static assets
│   ├── icon.png         # App icon
│   └── tray-icon.png    # System tray icon
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Troubleshooting

### "npm install" fails

1. Delete `node_modules` folder and `package-lock.json`
2. Run `npm cache clean --force`
3. Run `npm install` again

### Electron won't start

1. Make sure no other instance is running (check system tray)
2. Try running as Administrator
3. Check if antivirus is blocking the app

### API Key errors

1. Verify your API key is correct (no extra spaces)
2. Check if you have credits/quota remaining
3. Try a different model

### Image attachment not working

1. Try drag-and-drop or paste directly into the chat input
2. Verify the file type is supported (images, txt, doc/docx, csv, json, xml)
3. Restart the application and retry

### Models not loading (Ollama)

1. Ensure Ollama is running: `ollama serve`
2. Check URL in settings (default: `http://localhost:11434`)
3. Pull at least one model: `ollama pull llama3.2`

---

## Building Installer

To create a Windows installer:

```cmd
npm run build
```

The installer will be created in the `dist/` folder as `Zura Setup.exe`.

### Installer Options

The NSIS installer is configured with:
- One-click installation
- Per-user installation (no admin required)
- Desktop shortcut creation
- Start menu entry

---

## Development

### Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Desktop**: Electron 25
- **Styling**: CSS (custom)
- **Markdown**: react-markdown, remark-gfm
- **Code Highlighting**: react-syntax-highlighter
- **Icons**: Lucide React

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run build:dir` | Build without installer |
| `npm run preview` | Preview production build |

### Adding New AI Providers

1. Create a new service file in `src/services/`
2. Implement the API call function
3. Add provider option to `SettingsContext.tsx`
4. Update the UI in `src/components/Settings/Settings.tsx`
5. Add call logic in `src/components/Dashboard/ChatArea/hooks/useStreamingChat.ts`

---

## License

MIT License - feel free to use and modify.

---

## Credits

Built by Nikhil

---

## Support

If you encounter issues:
1. Check the Troubleshooting section above
2. Open an issue on GitHub
3. Include your Windows version and error messages
