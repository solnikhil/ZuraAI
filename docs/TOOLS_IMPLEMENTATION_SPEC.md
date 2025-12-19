# Zura AI - Tools Implementation Specification

## Overview

This document outlines the plan for implementing AI tools (function calling) in Zura AI. Tools allow the AI to perform actions like searching the web, reading files, executing code, and more.

---

## Phase 1: Core Tools (MVP)

### Tools to Implement

| Tool | Description | Priority | Security |
|------|-------------|----------|----------|
| `web_search` | Search the internet for real-time information | High | Safe |
| `fetch_url` | Read and extract content from a URL | High | Safe |
| `get_datetime` | Get current date, time, timezone | High | Safe |
| `calculator` | Evaluate mathematical expressions | High | Safe |
| `read_clipboard` | Read current clipboard contents | Medium | Needs approval |
| `write_clipboard` | Write text to clipboard | Medium | Safe |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      RENDERER PROCESS                        │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │  ChatArea   │───▶│ Tool Manager │───▶│ Provider      │   │
│  │  /Overlay   │    │              │    │ Adapters      │   │
│  └─────────────┘    └──────────────┘    └───────────────┘   │
│         │                  │                    │            │
│         │                  │                    │            │
│         ▼                  ▼                    ▼            │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │ Tool Result │◀───│ IPC Bridge   │◀───│ Tool Executor │   │
│  │ Display     │    │              │    │               │   │
│  └─────────────┘    └──────────────┘    └───────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │ IPC
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       MAIN PROCESS                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Tool Handlers                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │   │
│  │  │ Web      │ │ URL      │ │ DateTime │ │ Calc     │ │   │
│  │  │ Search   │ │ Fetcher  │ │          │ │          │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── tools/
│   ├── index.ts              # Tool registry, types, exports
│   ├── definitions.ts        # Tool JSON schema definitions
│   ├── executor.ts           # Executes tools via IPC
│   ├── toolManager.ts        # Manages tool calls in chat flow
│   ├── adapters/
│   │   ├── index.ts          # Adapter exports
│   │   ├── openrouter.ts     # OpenRouter/OpenAI format
│   │   ├── gemini.ts         # Google Gemini format
│   │   └── groq.ts           # Groq format (OpenAI-compatible)
│   └── ui/
│       ├── ToolCallIndicator.tsx   # "Using tool..." indicator
│       ├── ToolResultDisplay.tsx   # Display tool results
│       └── ToolApprovalDialog.tsx  # Approval for sensitive tools
│
electron/
├── tools/
│   ├── index.ts              # Tool handler registry
│   ├── webSearch.ts          # Web search implementation
│   ├── urlFetcher.ts         # URL content extraction
│   ├── calculator.ts         # Math evaluation
│   ├── datetime.ts           # Date/time utilities
│   └── clipboard.ts          # Clipboard operations
```

---

## Tool Definition Format

Each tool is defined with a JSON schema that works across providers:

```typescript
// src/tools/definitions.ts

export interface ToolDefinition {
    name: string
    description: string
    parameters: {
        type: 'object'
        properties: Record<string, {
            type: string
            description: string
            enum?: string[]
        }>
        required: string[]
    }
    requiresApproval?: boolean  // If true, ask user before executing
    category: 'search' | 'utility' | 'file' | 'system'
}

export const tools: ToolDefinition[] = [
    {
        name: 'web_search',
        description: 'Search the internet for real-time information. Use this when you need current information, news, or facts that might have changed after your knowledge cutoff.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query to look up'
                },
                num_results: {
                    type: 'number',
                    description: 'Number of results to return (default: 5, max: 10)'
                }
            },
            required: ['query']
        },
        category: 'search'
    },
    {
        name: 'fetch_url',
        description: 'Fetch and read the content of a webpage. Returns the main text content of the page.',
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'The URL to fetch content from'
                }
            },
            required: ['url']
        },
        category: 'search'
    },
    {
        name: 'get_datetime',
        description: 'Get the current date, time, and timezone information.',
        parameters: {
            type: 'object',
            properties: {
                timezone: {
                    type: 'string',
                    description: 'Optional timezone (e.g., "America/New_York"). Defaults to local timezone.'
                }
            },
            required: []
        },
        category: 'utility'
    },
    {
        name: 'calculator',
        description: 'Evaluate a mathematical expression. Supports basic arithmetic, exponents, parentheses, and common math functions.',
        parameters: {
            type: 'object',
            properties: {
                expression: {
                    type: 'string',
                    description: 'The mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(45 * pi / 180)")'
                }
            },
            required: ['expression']
        },
        category: 'utility'
    },
    {
        name: 'read_clipboard',
        description: 'Read the current contents of the system clipboard.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        requiresApproval: true,
        category: 'system'
    },
    {
        name: 'write_clipboard',
        description: 'Write text to the system clipboard.',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to copy to clipboard'
                }
            },
            required: ['text']
        },
        category: 'system'
    }
]
```

---

## Provider Adapters

### OpenRouter/OpenAI Format

```typescript
// src/tools/adapters/openrouter.ts

import { ToolDefinition, tools } from '../definitions'

export function convertToOpenRouterFormat(toolDefs: ToolDefinition[]) {
    return toolDefs.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }
    }))
}

export function parseOpenRouterToolCalls(response: any): ToolCall[] {
    const toolCalls = response.choices?.[0]?.message?.tool_calls || []
    return toolCalls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
    }))
}
```

### Gemini Format

```typescript
// src/tools/adapters/gemini.ts

import { ToolDefinition, tools } from '../definitions'

export function convertToGeminiFormat(toolDefs: ToolDefinition[]) {
    return {
        function_declarations: toolDefs.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }))
    }
}

export function parseGeminiFunctionCalls(response: any): ToolCall[] {
    const parts = response.candidates?.[0]?.content?.parts || []
    return parts
        .filter((p: any) => p.functionCall)
        .map((p: any) => ({
            id: `gemini_${Date.now()}`,
            name: p.functionCall.name,
            arguments: p.functionCall.args
        }))
}
```

---

## Tool Execution (Main Process)

### IPC Handlers

```typescript
// electron/tools/index.ts

import { ipcMain } from 'electron'
import { executeWebSearch } from './webSearch'
import { executeFetchUrl } from './urlFetcher'
import { executeCalculator } from './calculator'
import { executeDatetime } from './datetime'
import { executeReadClipboard, executeWriteClipboard } from './clipboard'

export interface ToolResult {
    success: boolean
    data?: any
    error?: string
}

const toolHandlers: Record<string, (args: any) => Promise<ToolResult>> = {
    web_search: executeWebSearch,
    fetch_url: executeFetchUrl,
    get_datetime: executeDatetime,
    calculator: executeCalculator,
    read_clipboard: executeReadClipboard,
    write_clipboard: executeWriteClipboard,
}

export function registerToolHandlers() {
    ipcMain.handle('execute-tool', async (_event, toolName: string, args: any) => {
        const handler = toolHandlers[toolName]
        if (!handler) {
            return { success: false, error: `Unknown tool: ${toolName}` }
        }
        
        try {
            return await handler(args)
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })
}
```

### Web Search Implementation

```typescript
// electron/tools/webSearch.ts

import { ToolResult } from './index'

// Option 1: Tavily API (recommended - designed for AI)
// Option 2: SerpAPI
// Option 3: Brave Search API
// Option 4: DuckDuckGo (no API key needed, but less reliable)

const TAVILY_API_KEY = process.env.TAVILY_API_KEY

export async function executeWebSearch(args: { query: string; num_results?: number }): Promise<ToolResult> {
    const { query, num_results = 5 } = args
    
    try {
        // Using Tavily API (best for AI applications)
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query,
                search_depth: 'basic',
                max_results: Math.min(num_results, 10),
                include_answer: true,
                include_raw_content: false
            })
        })
        
        if (!response.ok) {
            throw new Error(`Search API error: ${response.status}`)
        }
        
        const data = await response.json()
        
        return {
            success: true,
            data: {
                answer: data.answer,
                results: data.results.map((r: any) => ({
                    title: r.title,
                    url: r.url,
                    snippet: r.content
                }))
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
```

### URL Fetcher Implementation

```typescript
// electron/tools/urlFetcher.ts

import { ToolResult } from './index'

export async function executeFetchUrl(args: { url: string }): Promise<ToolResult> {
    const { url } = args
    
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        })
        
        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status}`)
        }
        
        const html = await response.text()
        
        // Extract main content (simplified - could use readability library)
        const text = extractTextContent(html)
        
        // Truncate to reasonable length
        const truncated = text.slice(0, 10000)
        
        return {
            success: true,
            data: {
                url,
                content: truncated,
                truncated: text.length > 10000
            }
        }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

function extractTextContent(html: string): string {
    // Remove scripts, styles, and HTML tags
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}
```

### Calculator Implementation

```typescript
// electron/tools/calculator.ts

import { ToolResult } from './index'

export async function executeCalculator(args: { expression: string }): Promise<ToolResult> {
    const { expression } = args
    
    try {
        // Safe math evaluation (no eval!)
        const result = evaluateMath(expression)
        
        return {
            success: true,
            data: {
                expression,
                result
            }
        }
    } catch (error: any) {
        return { success: false, error: `Invalid expression: ${error.message}` }
    }
}

function evaluateMath(expr: string): number {
    // Use a safe math parser (mathjs library recommended)
    // For MVP, implement basic parsing
    
    // Replace common functions
    let sanitized = expr
        .replace(/sqrt/g, 'Math.sqrt')
        .replace(/sin/g, 'Math.sin')
        .replace(/cos/g, 'Math.cos')
        .replace(/tan/g, 'Math.tan')
        .replace(/log/g, 'Math.log10')
        .replace(/ln/g, 'Math.log')
        .replace(/pi/g, 'Math.PI')
        .replace(/e(?![a-z])/g, 'Math.E')
        .replace(/\^/g, '**')
    
    // Validate only allowed characters
    if (!/^[0-9+\-*/().Math\s,sqrt sin cos tan log ln pi e]+$/i.test(sanitized)) {
        throw new Error('Invalid characters in expression')
    }
    
    // Use Function constructor (safer than eval, but still be careful)
    const fn = new Function(`return ${sanitized}`)
    return fn()
}
```

---

## UI Components

### Tool Call Indicator

```typescript
// src/tools/ui/ToolCallIndicator.tsx

import React from 'react'
import { Search, Globe, Calculator, Clock, Clipboard } from 'lucide-react'
import './ToolCallIndicator.css'

const toolIcons: Record<string, React.ReactNode> = {
    web_search: <Search size={16} />,
    fetch_url: <Globe size={16} />,
    calculator: <Calculator size={16} />,
    get_datetime: <Clock size={16} />,
    read_clipboard: <Clipboard size={16} />,
    write_clipboard: <Clipboard size={16} />,
}

interface ToolCallIndicatorProps {
    toolName: string
    status: 'pending' | 'executing' | 'complete' | 'error'
}

export default function ToolCallIndicator({ toolName, status }: ToolCallIndicatorProps) {
    const icon = toolIcons[toolName] || <Search size={16} />
    const displayName = toolName.replace(/_/g, ' ')
    
    return (
        <div className={`tool-call-indicator ${status}`}>
            <div className="tool-icon">{icon}</div>
            <span className="tool-name">
                {status === 'executing' ? `Using ${displayName}...` : 
                 status === 'complete' ? `Used ${displayName}` :
                 status === 'error' ? `Failed: ${displayName}` :
                 `Will use ${displayName}`}
            </span>
            {status === 'executing' && (
                <div className="tool-spinner" />
            )}
        </div>
    )
}
```

### Tool Result Display

```typescript
// src/tools/ui/ToolResultDisplay.tsx

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import './ToolResultDisplay.css'

interface SearchResult {
    title: string
    url: string
    snippet: string
}

interface ToolResultDisplayProps {
    toolName: string
    result: any
}

export default function ToolResultDisplay({ toolName, result }: ToolResultDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    
    if (toolName === 'web_search') {
        return (
            <div className="tool-result web-search-result">
                <div 
                    className="tool-result-header"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <span>🔍 Web Search Results</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                
                {isExpanded && (
                    <div className="search-results-list">
                        {result.results?.map((r: SearchResult, i: number) => (
                            <div key={i} className="search-result-item">
                                <a href={r.url} target="_blank" rel="noopener noreferrer">
                                    {r.title} <ExternalLink size={12} />
                                </a>
                                <p>{r.snippet}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }
    
    if (toolName === 'calculator') {
        return (
            <div className="tool-result calculator-result">
                <span className="calc-expression">{result.expression}</span>
                <span className="calc-equals">=</span>
                <span className="calc-result">{result.result}</span>
            </div>
        )
    }
    
    // Generic result display
    return (
        <div className="tool-result generic-result">
            <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
    )
}
```

---

## Chat Flow with Tools

```typescript
// src/tools/toolManager.ts

import { tools, ToolDefinition } from './definitions'
import { convertToOpenRouterFormat, parseOpenRouterToolCalls } from './adapters/openrouter'

export interface ToolCall {
    id: string
    name: string
    arguments: Record<string, any>
}

export interface ToolCallResult {
    toolCall: ToolCall
    result: any
    error?: string
}

export async function executeToolCall(toolCall: ToolCall): Promise<ToolCallResult> {
    try {
        const result = await window.ipcRenderer.invoke('execute-tool', toolCall.name, toolCall.arguments)
        
        if (!result.success) {
            return { toolCall, result: null, error: result.error }
        }
        
        return { toolCall, result: result.data }
    } catch (error: any) {
        return { toolCall, result: null, error: error.message }
    }
}

export function formatToolResultForAI(result: ToolCallResult): string {
    if (result.error) {
        return `Tool "${result.toolCall.name}" failed: ${result.error}`
    }
    
    return `Tool "${result.toolCall.name}" returned:\n${JSON.stringify(result.result, null, 2)}`
}
```

### Modified Chat Flow

```typescript
// In ChatArea.tsx or a new hook

async function sendMessageWithTools(userMessage: string) {
    // 1. Send initial message with tool definitions
    const response = await callAIWithTools(userMessage, convertToOpenRouterFormat(tools))
    
    // 2. Check if AI wants to use tools
    const toolCalls = parseOpenRouterToolCalls(response)
    
    if (toolCalls.length > 0) {
        // 3. Execute each tool
        const toolResults: ToolCallResult[] = []
        
        for (const toolCall of toolCalls) {
            // Show "Using tool..." indicator
            setCurrentToolCall(toolCall)
            
            // Check if tool requires approval
            const toolDef = tools.find(t => t.name === toolCall.name)
            if (toolDef?.requiresApproval) {
                const approved = await showApprovalDialog(toolCall)
                if (!approved) continue
            }
            
            // Execute tool
            const result = await executeToolCall(toolCall)
            toolResults.push(result)
        }
        
        // 4. Send tool results back to AI for final response
        const finalResponse = await callAIWithToolResults(
            userMessage,
            response,
            toolResults.map(formatToolResultForAI)
        )
        
        return finalResponse
    }
    
    // No tools needed, return original response
    return response
}
```

---

## Settings Integration

Add to Settings for tool configuration:

```typescript
// In SettingsContext.tsx

export interface Settings {
    // ... existing settings ...
    
    // Tool settings
    toolsEnabled: boolean
    tavilyApiKey: string  // For web search
    enabledTools: string[]  // Which tools are active
    toolApprovalMode: 'always' | 'sensitive' | 'never'
}
```

---

## Phase 2: Advanced Tools

After MVP, consider adding:

| Tool | Description | Complexity |
|------|-------------|------------|
| `read_file` | Read local file contents | Medium |
| `write_file` | Write to local file | Medium |
| `list_directory` | List files in a directory | Medium |
| `run_python` | Execute Python code in sandbox | High |
| `run_shell` | Execute shell commands | High |
| `take_screenshot` | Capture screen (already exists) | Low |
| `generate_image` | Generate images via API | Medium |
| `send_notification` | System notifications | Low |

---

## Implementation Order

### Week 1: Foundation
1. [ ] Create tool definitions (`src/tools/definitions.ts`)
2. [ ] Create tool registry and types (`src/tools/index.ts`)
3. [ ] Implement IPC handlers in main process
4. [ ] Create OpenRouter adapter

### Week 2: Core Tools
5. [ ] Implement `get_datetime` tool
6. [ ] Implement `calculator` tool
7. [ ] Implement `read_clipboard` / `write_clipboard`
8. [ ] Create ToolCallIndicator component

### Week 3: Web Search
9. [ ] Set up Tavily/SerpAPI integration
10. [ ] Implement `web_search` tool
11. [ ] Implement `fetch_url` tool
12. [ ] Create ToolResultDisplay component

### Week 4: Integration
13. [ ] Modify ChatArea to support tool calling
14. [ ] Modify Overlay to support tool calling
15. [ ] Add Gemini adapter
16. [ ] Add tool settings to Settings page

### Week 5: Polish
17. [ ] Add ToolApprovalDialog for sensitive tools
18. [ ] Error handling and edge cases
19. [ ] Documentation
20. [ ] Testing

---

## API Key Requirements

| Service | Purpose | Free Tier | Link |
|---------|---------|-----------|------|
| Tavily | Web Search | 1000 searches/month | https://tavily.com |
| SerpAPI | Web Search (alternative) | 100 searches/month | https://serpapi.com |
| Brave Search | Web Search (alternative) | 2000 queries/month | https://brave.com/search/api |

---

## Security Considerations

1. **File Access**: Sandbox to specific directories, require confirmation
2. **Code Execution**: Use isolated sandbox (vm2 for Node, subprocess for Python)
3. **Clipboard**: Read requires approval, write is safe
4. **Network**: Validate URLs, block local network access
5. **Rate Limiting**: Prevent abuse of external APIs
6. **Data Privacy**: Don't send sensitive data to search APIs

---

## Success Metrics

- Tool call latency < 2 seconds average
- Web search provides relevant results 90%+ of time
- Users enable tools for 70%+ of conversations
- Zero security incidents

---

*Document Version: 1.0*
*Last Updated: December 2024*

