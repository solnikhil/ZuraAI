/**
 * OpenAI Codex CLI Provider Service
 * 
 * Integrates with Codex backend for chat completions using ChatGPT OAuth authentication.
 * Follows the same patterns as other providers (OpenRouter, Gemini, etc.)
 */

import { ChatMessage, StreamingToolCall } from './types'

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Authentication state for Codex provider
 */
export interface CodexAuthState {
    isAuthenticated: boolean
    userEmail?: string
    expiresAt?: number
    error?: string
}

/**
 * Token data stored securely
 */
export interface CodexTokenData {
    accessToken: string
    refreshToken?: string
    expiresAt: number  // Unix timestamp in milliseconds
    userEmail: string
    organization?: string
}

/**
 * Streaming response chunk from Codex
 */
export interface CodexStreamChunk {
    id: string
    choices: Array<{
        delta?: {
            content?: string
            role?: string
            tool_calls?: StreamingToolCall[]
        }
        finish_reason?: string | null
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

/**
 * Complete response from Codex
 */
export interface CodexResponse {
    id: string
    choices: Array<{
        message: {
            role: string
            content: string
        }
        finish_reason: string | null
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

/**
 * Options for Codex API requests
 */
export interface CodexOptions {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    reasoningSummary?: 'auto' | 'concise' | 'detailed' | 'none'
    tools?: any[]
}

/**
 * Available Codex models with reasoning level support
 * Based on official Codex CLI - GPT-5.2 with reasoning levels as separate entries
 * Reference: https://github.com/openai/codex
 */
export interface CodexModelInfo {
    code: string
    displayName: string
    description: string
    baseModel: string
    reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    isDefault?: boolean
}

/**
 * Official Codex CLI models with reasoning effort levels
 * Reference: research-codex/codex/codex-rs/core/src/models_manager/model_presets.rs
 * 
 * Models shown in picker: gpt-5.2-codex (default), gpt-5.1-codex-max, gpt-5.1-codex-mini, gpt-5.2
 * Reasoning efforts: minimal, low, medium, high, xhigh (varies by model)
 * 
 * NOTE: Deprecated models (gpt-5-codex, gpt-5.1-codex, etc.) are NOT included
 */
export const CODEX_MODELS: CodexModelInfo[] = [
    // =========================================================================
    // GPT-5.2 Codex (default, latest frontier agentic coding model)
    // =========================================================================
    {
        code: 'gpt-5.2-codex-low',
        displayName: 'GPT-5.2 Codex (Low)',
        description: 'Fast responses with lighter reasoning',
        baseModel: 'gpt-5.2-codex',
        reasoningEffort: 'low'
    },
    {
        code: 'gpt-5.2-codex-medium',
        displayName: 'GPT-5.2 Codex',
        description: 'Latest frontier agentic coding model (default)',
        baseModel: 'gpt-5.2-codex',
        reasoningEffort: 'medium',
        isDefault: true
    },
    {
        code: 'gpt-5.2-codex-high',
        displayName: 'GPT-5.2 Codex (High)',
        description: 'Greater reasoning depth for complex problems',
        baseModel: 'gpt-5.2-codex',
        reasoningEffort: 'high'
    },
    {
        code: 'gpt-5.2-codex-xhigh',
        displayName: 'GPT-5.2 Codex (XHigh)',
        description: 'Extra high reasoning for hardest tasks',
        baseModel: 'gpt-5.2-codex',
        reasoningEffort: 'xhigh'
    },
    // =========================================================================
    // GPT-5.1 Codex Max (flagship for deep and fast reasoning)
    // =========================================================================
    {
        code: 'gpt-5.1-codex-max-low',
        displayName: 'GPT-5.1 Codex Max (Low)',
        description: 'Fast responses with lighter reasoning',
        baseModel: 'gpt-5.1-codex-max',
        reasoningEffort: 'low'
    },
    {
        code: 'gpt-5.1-codex-max-medium',
        displayName: 'GPT-5.1 Codex Max',
        description: 'Codex-optimized flagship for deep and fast reasoning',
        baseModel: 'gpt-5.1-codex-max',
        reasoningEffort: 'medium'
    },
    {
        code: 'gpt-5.1-codex-max-high',
        displayName: 'GPT-5.1 Codex Max (High)',
        description: 'Greater reasoning depth',
        baseModel: 'gpt-5.1-codex-max',
        reasoningEffort: 'high'
    },
    {
        code: 'gpt-5.1-codex-max-xhigh',
        displayName: 'GPT-5.1 Codex Max (XHigh)',
        description: 'Maximum reasoning for hardest tasks',
        baseModel: 'gpt-5.1-codex-max',
        reasoningEffort: 'xhigh'
    },
    // =========================================================================
    // GPT-5.1 Codex Mini (cheaper, faster, but less capable)
    // =========================================================================
    {
        code: 'gpt-5.1-codex-mini-medium',
        displayName: 'GPT-5.1 Codex Mini',
        description: 'Cheaper, faster, but less capable',
        baseModel: 'gpt-5.1-codex-mini',
        reasoningEffort: 'medium'
    },
    {
        code: 'gpt-5.1-codex-mini-high',
        displayName: 'GPT-5.1 Codex Mini (High)',
        description: 'Maximizes reasoning for complex problems',
        baseModel: 'gpt-5.1-codex-mini',
        reasoningEffort: 'high'
    },
    // =========================================================================
    // GPT-5.2 (non-Codex, general purpose with reasoning)
    // =========================================================================
    {
        code: 'gpt-5.2-low',
        displayName: 'GPT-5.2 (Low)',
        description: 'Balances speed with some reasoning',
        baseModel: 'gpt-5.2',
        reasoningEffort: 'low'
    },
    {
        code: 'gpt-5.2-medium',
        displayName: 'GPT-5.2',
        description: 'Latest frontier model with improvements across knowledge, reasoning and coding',
        baseModel: 'gpt-5.2',
        reasoningEffort: 'medium'
    },
    {
        code: 'gpt-5.2-high',
        displayName: 'GPT-5.2 (High)',
        description: 'Maximizes reasoning depth for complex problems',
        baseModel: 'gpt-5.2',
        reasoningEffort: 'high'
    },
    {
        code: 'gpt-5.2-xhigh',
        displayName: 'GPT-5.2 (XHigh)',
        description: 'Extra high reasoning for complex problems',
        baseModel: 'gpt-5.2',
        reasoningEffort: 'xhigh'
    },
]


/**
 * Parse model code to extract base model and reasoning effort
 * e.g., 'gpt-5.2-codex-high' -> { baseModel: 'gpt-5.2-codex', reasoningEffort: 'high' }
 */
export function parseCodexModelCode(modelCode: string): { baseModel: string; reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' } {
    // #region agent log
    console.log('[Codex:parseCodexModelCode] ========== FUNCTION ENTRY ==========')
    console.log('[Codex:parseCodexModelCode] Input modelCode:', modelCode)
    // #endregion

    const efforts = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const
    for (const effort of efforts) {
        if (modelCode.endsWith(`-${effort}`)) {
            const result = {
                baseModel: modelCode.replace(`-${effort}`, ''),
                reasoningEffort: effort
            }
            // #region agent log
            console.log('[Codex:parseCodexModelCode] Matched effort:', effort)
            console.log('[Codex:parseCodexModelCode] Result:', JSON.stringify(result))
            // #endregion
            return result
        }
    }
    // Default fallback
    const result = { baseModel: modelCode, reasoningEffort: 'medium' as const }
    // #region agent log
    console.log('[Codex:parseCodexModelCode] No effort suffix found, using default')
    console.log('[Codex:parseCodexModelCode] Result:', JSON.stringify(result))
    // #endregion
    return result
}

/**
 * Default instructions when no system message is provided
 * Reference: research-codex/codex/codex-rs/core/gpt-5.2-codex_prompt.md
 */
export const DEFAULT_CODEX_INSTRUCTIONS = `You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI on a user's computer.

## General

- When searching for text or files, prefer using \`rg\` or \`rg --files\` respectively because \`rg\` is much faster than alternatives like \`grep\`. (If the \`rg\` command is not found, then use alternatives.)

## Personality

Your default personality and tone is concise, direct, and friendly. You communicate efficiently, always keeping the user clearly informed about ongoing actions without unnecessary detail.`

/**
 * Official Codex base instructions for gpt-5.2-codex model
 * CRITICAL: The ChatGPT backend API validates the instructions field and expects
 * this exact format. Custom system prompts are NOT valid as instructions.
 * 
 * Reference: research-codex/codex/codex-rs/core/models.json (gpt-5.1-codex-max base_instructions)
 * Note: gpt-5.2-codex upgrades to gpt-5.1-codex-max, so we use those instructions
 */
export const OFFICIAL_CODEX_BASE_INSTRUCTIONS = "You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI on a user's computer.\n\n## General\n\n- When searching for text or files, prefer using `rg` or `rg --files` respectively because `rg` is much faster than alternatives like `grep`. (If the `rg` command is not found, then use alternatives.)\n\n## Editing constraints\n\n- Default to ASCII when editing or creating files. Only introduce non-ASCII or other Unicode characters when there is a clear justification and the file already uses them.\n- Add succinct code comments that explain what is going on if code is not self-explanatory. You should not add comments like \"Assigns the value to the variable\", but a brief comment might be useful ahead of a complex code block that the user would otherwise have to spend time parsing out. Usage of these comments should be rare.\n- Try to use apply_patch for single file edits, but it is fine to explore other options to make the edit if it does not work well. Do not use apply_patch for changes that are auto-generated (i.e. generating package.json or running a lint or format command like gofmt) or when scripting is more efficient (such as search and replacing a string across a codebase).\n- You may be in a dirty git worktree.\n    * NEVER revert existing changes you did not make unless explicitly requested, since these changes were made by the user.\n    * If asked to make a commit or code edits and there are unrelated changes to your work or changes that you didn't make in those files, don't revert those changes.\n    * If the changes are in files you've touched recently, you should read carefully and understand how you can work with the changes rather than reverting them.\n    * If the changes are in unrelated files, just ignore them and don't revert them.\n- Do not amend a commit unless explicitly requested to do so.\n- While you are working, you might notice unexpected changes that you didn't make. If this happens, STOP IMMEDIATELY and ask the user how they would like to proceed.\n- **NEVER** use destructive commands like `git reset --hard` or `git checkout --` unless specifically requested or approved by the user.\n\n## Plan tool\n\nWhen using the planning tool:\n- Skip using the planning tool for straightforward tasks (roughly the easiest 25%).\n- Do not make single-step plans.\n- When you made a plan, update it after having performed one of the sub-tasks that you shared on the plan.\n\n## Codex CLI harness, sandboxing, and approvals\n\nThe Codex CLI harness supports several different configurations for sandboxing and escalation approvals that the user can choose from.\n\nFilesystem sandboxing defines which files can be read or written. The options for `sandbox_mode` are:\n- **read-only**: The sandbox only permits reading files.\n- **workspace-write**: The sandbox permits reading files, and editing files in `cwd` and `writable_roots`. Editing files in other directories requires approval.\n- **danger-full-access**: No filesystem sandboxing - all commands are permitted.\n\nNetwork sandboxing defines whether network can be accessed without approval. Options for `network_access` are:\n- **restricted**: Requires approval\n- **enabled**: No approval needed\n\nApprovals are your mechanism to get user consent to run shell commands without the sandbox. Possible configuration options for `approval_policy` are\n- **untrusted**: The harness will escalate most commands for user approval, apart from a limited allowlist of safe \"read\" commands.\n- **on-failure**: The harness will allow all commands to run in the sandbox (if enabled), and failures will be escalated to the user for approval to run again without the sandbox.\n- **on-request**: Commands will be run in the sandbox by default, and you can specify in your tool call if you want to escalate a command to run without sandboxing. (Note that this mode is not always available. If it is, you'll see parameters for it in the `shell` command description.)\n- **never**: This is a non-interactive mode where you may NEVER ask the user for approval to run commands. Instead, you must always persist and work around constraints to solve the task for the user. You MUST do your utmost best to finish the task and validate your work before yielding. If this mode is paired with `danger-full-access`, take advantage of it to deliver the best outcome for the user. Further, in this mode, your default testing philosophy is overridden: Even if you don't see local patterns for testing, you may add tests and scripts to validate your work. Just remove them before yielding.\n\nWhen you are running with `approval_policy == on-request`, and sandboxing enabled, here are scenarios where you'll need to request approval:\n- You need to run a command that writes to a directory that requires it (e.g. running tests that write to /var)\n- You need to run a GUI app (e.g., open/xdg-open/osascript) to open browsers or files.\n- You are running sandboxed and need to run a command that requires network access (e.g. installing packages)\n- If you run a command that is important to solving the user's query, but it fails because of sandboxing, rerun the command with approval. ALWAYS proceed to use the `sandbox_permissions` and `justification` parameters - do not message the user before requesting approval for the command.\n- You are about to take a potentially destructive action such as an `rm` or `git reset` that the user did not explicitly ask for\n- (for all of these, you should weigh alternative paths that do not require approval)\n\nWhen `sandbox_mode` is set to read-only, you'll need to request approval for any command that isn't a read.\n\nYou will be told what filesystem sandboxing, network sandboxing, and approval mode are active in a developer or user message. If you are not told about this, assume that you are running with workspace-write, network sandboxing enabled, and approval on-failure.\n\nAlthough they introduce friction to the user because your work is paused until the user responds, you should leverage them when necessary to accomplish important work. If the completing the task requires escalated permissions, Do not let these settings or the sandbox deter you from attempting to accomplish the user's task unless it is set to \"never\", in which case never ask for approvals.\n\nWhen requesting approval to execute a command that will require escalated privileges:\n  - Provide the `sandbox_permissions` parameter with the value `\"require_escalated\"`\n  - Include a short, 1 sentence explanation for why you need escalated permissions in the justification parameter\n\n## Special user requests\n\n- If the user makes a simple request (such as asking for the time) which you can fulfill by running a terminal command (such as `date`), you should do so.\n- If the user asks for a \"review\", default to a code review mindset: prioritise identifying bugs, risks, behavioural regressions, and missing tests. Findings must be the primary focus of the response - keep summaries or overviews brief and only after enumerating the issues. Present findings first (ordered by severity with file/line references), follow with open questions or assumptions, and offer a change-summary only as a secondary detail. If no findings are discovered, state that explicitly and mention any residual risks or testing gaps.\n\n## Frontend tasks\nWhen doing frontend design tasks, avoid collapsing into \"AI slop\" or safe, average-looking layouts.\nAim for interfaces that feel intentional, bold, and a bit surprising.\n- Typography: Use expressive, purposeful fonts and avoid default stacks (Inter, Roboto, Arial, system).\n- Color & Look: Choose a clear visual direction; define CSS variables; avoid purple-on-white defaults. No purple bias or dark mode bias.\n- Motion: Use a few meaningful animations (page-load, staggered reveals) instead of generic micro-motions.\n- Background: Don't rely on flat, single-color backgrounds; use gradients, shapes, or subtle patterns to build atmosphere.\n- Overall: Avoid boilerplate layouts and interchangeable UI patterns. Vary themes, type families, and visual languages across outputs.\n- Ensure the page loads properly on both desktop and mobile\n\nException: If working within an existing website or design system, preserve the established patterns, structure, and visual language.\n\n## Presenting your work and final message\n\nYou are producing plain text that will later be styled by the CLI. Follow these rules exactly. Formatting should make results easy to scan, but not feel mechanical. Use judgment to decide how much structure adds value.\n\n- Default: be very concise; friendly coding teammate tone.\n- Ask only when needed; suggest ideas; mirror the user's style.\n- For substantial work, summarize clearly; follow final‑answer formatting.\n- Skip heavy formatting for simple confirmations.\n- Don't dump large files you've written; reference paths only.\n- No \"save/copy this file\" - User is on the same machine.\n- Offer logical next steps (tests, commits, build) briefly; add verify steps if you couldn't do something.\n- For code changes:\n  * Lead with a quick explanation of the change, and then give more details on the context covering where and why a change was made. Do not start this explanation with \"summary\", just jump right in.\n  * If there are natural next steps the user may want to take, suggest them at the end of your response. Do not make suggestions if there are no natural next steps.\n  * When suggesting multiple options, use numeric lists for the suggestions so the user can quickly respond with a single number.\n- The user does not command execution outputs. When asked to show the output of a command (e.g. `git show`), relay the important details in your answer or summarize the key lines so the user understands the result.\n\n### Final answer structure and style guidelines\n\n- Plain text; CLI handles styling. Use structure only when it helps scanability.\n- Headers: optional; short Title Case (1-3 words) wrapped in **…**; no blank line before the first bullet; add only if they truly help.\n- Bullets: use - ; merge related points; keep to one line when possible; 4–6 per list ordered by importance; keep phrasing consistent.\n- Monospace: backticks for commands/paths/env vars/code ids and inline examples; use for literal keyword bullets; never combine with **.\n- Code samples or multi-line snippets should be wrapped in fenced code blocks; include an info string as often as possible.\n- Structure: group related bullets; order sections general → specific → supporting; for subsections, start with a bolded keyword bullet, then items; match complexity to the task.\n- Tone: collaborative, concise, factual; present tense, active voice; self‑contained; no \"above/below\"; parallel wording.\n- Don'ts: no nested bullets/hierarchies; no ANSI codes; don't cram unrelated keywords; keep keyword lists short—wrap/reformat if long; avoid naming formatting styles in answers.\n- Adaptation: code explanations → precise, structured with code refs; simple tasks → lead with outcome; big changes → logical walkthrough + rationale + next actions; casual one-offs → plain sentences, no headers/bullets.\n- File References: When referencing files in your response follow the below rules:\n  * Use inline code to make file paths clickable.\n  * Each reference should have a stand alone path. Even if it's the same file.\n  * Accepted: absolute, workspace‑relative, a/ or b/ diff prefixes, or bare filename/suffix.\n  * Optionally include line/column (1‑based): :line[:column] or #Lline[Ccolumn] (column defaults to 1).\n  * Do not use URIs like file://, vscode://, or https://.\n  * Do not provide range of lines\n  * Examples: src/app.ts, src/app.ts:42, b/server/index.js#L10, C:\\repo\\project\\main.rs:12:5\n"

/**
 * Return the official Codex base instructions.
 * Keeps the large template string centralized for reuse.
 */
export function getOfficialCodexInstructions(): string {
    return OFFICIAL_CODEX_BASE_INSTRUCTIONS
}

/**
 * Extract system messages and prepare them as user instructions
 * CRITICAL: ChatGPT backend API validates the 'instructions' field and expects
 * the official Codex base instructions. Custom system prompts must be sent
 * as user messages with the <user_instructions> format.
 * 
 * Reference: research-codex/codex/codex-rs/core/src/user_instructions.rs
 * 
 * Requirements:
 * - The 'instructions' field must contain official base_instructions from the API
 * - Convert custom system messages to user_instructions format
 * - Prepend user_instructions to the input messages array
 * 
 * @param messages - Array of chat messages
 * @param baseInstructions - Official base_instructions fetched from API (or fallback)
 */
export function extractInstructionsFromMessages(messages: ChatMessage[], baseInstructions?: string | null): { instructions: string; inputMessages: ChatMessage[] } {
    // #region agent log - HYPOTHESIS B
    fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/codex.ts:414',message:'extractInstructionsFromMessages ENTRY',data:{messageCount:messages.length,hasBaseInstructions:!!baseInstructions,baseInstructionsLength:baseInstructions?.length||0,hypothesisId:'B'},timestamp:Date.now(),sessionId:'debug-session'})}).catch(()=>{});
    // #endregion

    // #region agent log
    console.log('[Codex:extractInstructionsFromMessages] ========== FUNCTION ENTRY ==========')
    console.log('[Codex:extractInstructionsFromMessages] Input messages count:', messages.length)
    console.log('[Codex:extractInstructionsFromMessages] baseInstructions provided:', !!baseInstructions, 'length:', baseInstructions?.length || 0)
    messages.forEach((msg, idx) => {
        console.log(`[Codex:extractInstructionsFromMessages] Message[${idx}]: role=${msg.role}, content length=${typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length}`)
    })
    // #endregion

    const systemMessages: string[] = []
    const inputMessages: ChatMessage[] = []

    for (const msg of messages) {
        if (msg.role === 'system') {
            // Extract system message content
            let systemContent: string
            if (typeof msg.content === 'string') {
                systemContent = msg.content
            } else if (Array.isArray(msg.content)) {
                systemContent = msg.content
                    .filter(part => part.type === 'text' && part.text)
                    .map(part => part.text)
                    .join('\n')
            } else {
                systemContent = ''
            }

            if (systemContent.trim()) {
                systemMessages.push(systemContent)
            }

            // #region agent log
            console.log('[Codex:extractInstructionsFromMessages] Extracted system message:', systemContent.substring(0, 100))
            // #endregion
        } else {
            inputMessages.push(msg)
        }
    }

    // Use provided base_instructions from API, or fall back to hardcoded constant
    // CRITICAL: The API validates this field - must match server's copy exactly!
    const instructions = baseInstructions || getOfficialCodexInstructions()

    // #region agent log
    console.log('[Codex:extractInstructionsFromMessages] Using instructions source:', baseInstructions ? 'API (dynamic)' : 'FALLBACK (hardcoded)')
    // #endregion

    // #region agent log - HYPOTHESIS B
    fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/codex.ts:458',message:'Instructions selection',data:{source:baseInstructions?'API':'FALLBACK',instructionsLength:instructions.length,instructionsPreview:instructions.substring(0,200),OFFICIAL_LENGTH:OFFICIAL_CODEX_BASE_INSTRUCTIONS.length,hypothesisId:'B'},timestamp:Date.now(),sessionId:'debug-session'})}).catch(()=>{});
    // #endregion

    // If there are custom system messages, prepend them as a user_instructions message
    // Reference: research-codex/codex/codex-rs/core/src/user_instructions.rs
    if (systemMessages.length > 0) {
        const customInstructions = systemMessages.join('\n\n')
        const userInstructionsMessage: ChatMessage = {
            role: 'user',
            content: `<user_instructions>\n${customInstructions}\n</user_instructions>`
        }
        // Prepend the user_instructions message to the input
        inputMessages.unshift(userInstructionsMessage)

        // #region agent log
        console.log('[Codex:extractInstructionsFromMessages] Converted system messages to user_instructions format')
        console.log('[Codex:extractInstructionsFromMessages] user_instructions content preview:', customInstructions.substring(0, 100))
        // #endregion
    }

    // #region agent log
    console.log('[Codex:extractInstructionsFromMessages] ========== OUTPUT ==========')
    console.log('[Codex:extractInstructionsFromMessages] Instructions source:', baseInstructions ? 'API' : 'FALLBACK')
    console.log('[Codex:extractInstructionsFromMessages] Instructions length:', instructions.length)
    console.log('[Codex:extractInstructionsFromMessages] Output messages count:', inputMessages.length)
    console.log('[Codex:extractInstructionsFromMessages] System messages converted to user_instructions:', systemMessages.length)
    // #endregion

    return { instructions, inputMessages }
}

/**
 * Reasoning effort levels matching official Codex CLI
 * Reference: https://github.com/openai/codex/blob/main/docs/config.md
 */
export const REASONING_EFFORTS = {
    minimal: { label: 'Minimal', description: 'Fastest responses, best for simple tasks' },
    low: { label: 'Low', description: 'Fast responses with lighter reasoning' },
    medium: { label: 'Medium', description: 'Balanced speed and reasoning depth' },
    high: { label: 'High', description: 'Greater reasoning depth for complex problems' },
    xhigh: { label: 'XHigh', description: 'Maximum reasoning depth for hardest tasks' },
} as const

/**
 * Reasoning summary options matching official Codex CLI
 * Reference: https://github.com/openai/codex/blob/main/docs/config.md
 */
export const REASONING_SUMMARIES = {
    auto: { label: 'Auto', description: 'Automatic (default)' },
    concise: { label: 'Concise', description: 'Brief summary' },
    detailed: { label: 'Detailed', description: 'Comprehensive summary' },
    none: { label: 'None', description: 'Disabled' },
} as const

export type ReasoningSummary = keyof typeof REASONING_SUMMARIES

// ============================================================================
// Request Building
// ============================================================================

/**
 * Required fields for Codex API request body
 * Reference: research-codex/codex/codex-rs/codex-api/src/common.rs
 */
export const REQUIRED_REQUEST_FIELDS = [
    'model',
    'instructions', 
    'input',
    'tools',
    'tool_choice',
    'parallel_tool_calls',
    'stream',
    'store',
    'include'
] as const

/**
 * Fields that are NOT supported by the ChatGPT backend API
 * These should NEVER be included in requests
 */
export const UNSUPPORTED_REQUEST_FIELDS = [
    'temperature',
    'max_tokens',
    'top_p',
    'frequency_penalty',
    'presence_penalty',
    'stop'
] as const

/**
 * Build request body for Codex Responses API
 * CRITICAL: This function ensures the request body matches the official Codex CLI format exactly
 * 
 * Reference: research-codex/codex/codex-rs/codex-api/src/requests/responses.rs
 * 
 * The ChatGPT backend API REQUIRES the 'instructions' field with the official
 * base_instructions from the model definition. Custom system prompts must be
 * converted to <user_instructions> format and prepended to the input messages.
 * 
 * @param model - The model code (e.g., 'gpt-5.2-codex-high')
 * @param messages - Array of chat messages
 * @param options - Optional configuration
 * @param baseInstructions - Official base_instructions fetched from API (optional, falls back to hardcoded)
 * @returns Request body matching ResponsesApiRequest format
 */
export function buildCodexRequest(
    model: string,
    messages: ChatMessage[],
    options?: CodexOptions,
    baseInstructions?: string | null
): Record<string, any> {
    // Parse model code to extract base model and reasoning effort
    const { baseModel, reasoningEffort } = parseCodexModelCode(model)
    
    // Extract system messages - they will be converted to user_instructions format
    // Pass baseInstructions from API if available, otherwise falls back to hardcoded constant
    const { instructions, inputMessages } = extractInstructionsFromMessages(messages, baseInstructions)
    
    // Build request body matching official Codex CLI format
    // CRITICAL: The 'instructions' field is REQUIRED and must contain the official
    // base_instructions from the model definition. The API validates this field.
    const requestBody: Record<string, any> = {
        // Required fields
        model: baseModel,
        instructions: instructions,  // REQUIRED: Official Codex base instructions
        input: formatMessagesForCodex(inputMessages),
        tools: Array.isArray(options?.tools) ? options?.tools : [],
        tool_choice: 'auto',
        parallel_tool_calls: false,
        stream: true,  // CRITICAL: Always true for official Codex CLI behavior
        store: false,  // CRITICAL: Always false
        include: ['reasoning.encrypted_content'],
        // Reasoning object
        reasoning: {
            effort: reasoningEffort,
            summary: options?.reasoningSummary || 'auto'
        }
    }
    
    // NOTE: temperature, max_tokens, and other fields are NOT supported
    // by the ChatGPT backend API. The official Codex CLI does not send these.
    
    return requestBody
}

/**
 * Fetch base_instructions for a model from the API
 * This is CRITICAL because the API validates instructions against the server's copy
 */
export async function fetchBaseInstructions(modelSlug: string): Promise<string | null> {
    if (!window.codexAuth) {
        console.log('[Codex:fetchBaseInstructions] codexAuth not available')
        return null
    }

    try {
        // #region agent log
        console.log('[Codex:fetchBaseInstructions] Fetching instructions for model:', modelSlug)
        // #endregion
        
        const result = await window.codexAuth.getBaseInstructions(modelSlug)
        
        // #region agent log
        console.log('[Codex:fetchBaseInstructions] Result:', result.success, 'instructions length:', result.instructions?.length || 0)
        // #endregion
        
        if (result.success && result.instructions) {
            return result.instructions
        }
        return null
    } catch (error) {
        console.error('[Codex:fetchBaseInstructions] Error:', error)
        return null
    }
}

/**
 * Get the default Codex model
 */
export function getDefaultCodexModel(): CodexModelInfo {
    return CODEX_MODELS.find(m => m.isDefault) || CODEX_MODELS[0]
}

/**
 * Check Codex usage/subscription info
 */
export async function checkCodexUsage(): Promise<{ success: boolean; usage?: any; error?: string }> {
    if (!window.codexAuth) {
        return { success: false, error: 'Codex auth not available' }
    }

    try {
        return await window.codexAuth.checkUsage()
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}


// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Sanitize a string to remove sensitive data (tokens, keys)
 * 
 * Removes:
 * - Bearer tokens (Bearer xxx...)
 * - API keys (sk-xxx, sk-or-v1-xxx)
 * - JWT tokens (eyJ...)
 * 
 * Requirements: 7.5
 */
export function sanitizeString(str: string): string {
    if (typeof str !== 'string') return str
    
    return str
        // Bearer tokens - match "Bearer " followed by any token-like string
        .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer [REDACTED]')
        // OpenRouter API keys (sk-or-v1-xxx)
        .replace(/sk-or-v1-[A-Za-z0-9\-_]+/gi, '[REDACTED_KEY]')
        // OpenAI API keys (sk-xxx)
        .replace(/sk-[A-Za-z0-9\-_]+/gi, '[REDACTED_KEY]')
        // JWT tokens (eyJ... with three parts separated by dots)
        .replace(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/gi, '[REDACTED_TOKEN]')
        // Generic long alphanumeric tokens that look like API keys (40+ chars)
        .replace(/\b[A-Za-z0-9\-_]{40,}\b/g, '[REDACTED_LONG_TOKEN]')
}

/**
 * Sanitize error to remove sensitive data (tokens, keys)
 * 
 * Handles:
 * - error.message
 * - error.stack
 * - error.body
 * - error.headers (removes authorization headers)
 * - Nested error objects
 * 
 * Requirements: 7.5
 */
export function sanitizeError(error: any): any {
    if (!error) return error
    
    // Handle string errors
    if (typeof error === 'string') {
        return sanitizeString(error)
    }

    const sanitized = { ...error }

    // Sanitize message field
    if (typeof sanitized.message === 'string') {
        sanitized.message = sanitizeString(sanitized.message)
    }

    // Sanitize stack trace
    if (typeof sanitized.stack === 'string') {
        sanitized.stack = sanitizeString(sanitized.stack)
    }

    // Sanitize body field (common in HTTP errors)
    if (typeof sanitized.body === 'string') {
        sanitized.body = sanitizeString(sanitized.body)
    } else if (sanitized.body && typeof sanitized.body === 'object') {
        sanitized.body = sanitizeError(sanitized.body)
    }

    // Sanitize response field (common in fetch errors)
    if (sanitized.response && typeof sanitized.response === 'object') {
        sanitized.response = sanitizeError(sanitized.response)
    }

    // Sanitize cause field (Error.cause)
    if (sanitized.cause && typeof sanitized.cause === 'object') {
        sanitized.cause = sanitizeError(sanitized.cause)
    }

    // Remove sensitive headers
    if (sanitized.headers) {
        const { authorization, Authorization, ...safeHeaders } = sanitized.headers
        sanitized.headers = safeHeaders
    }

    return sanitized
}

/**
 * Parse Codex error response into user-friendly message
 */
export function parseCodexError(error: any, status?: number): string {
    // Handle rate limiting
    if (status === 429) {
        const retryAfter = error?.headers?.get?.('retry-after') || error?.retryAfter
        if (retryAfter) {
            return `Rate limit reached. Please wait ${retryAfter} seconds before trying again.`
        }
        return 'Rate limit reached. Please wait before trying again.'
    }

    // Handle authentication errors
    if (status === 401) {
        return 'Your session has expired. Please sign in again.'
    }

    // Handle service unavailable
    if (status === 503 || status === 502) {
        return 'Codex service is temporarily unavailable. Try another provider?'
    }

    // Handle 400 validation errors with field info
    // Requirements: 7.1
    if (status === 400) {
        // Check for specific field validation errors
        if (error?.error?.message) {
            const fieldName = extractFieldNameFromError(error.error.message)
            if (fieldName) {
                return `Invalid request: ${fieldName} is invalid or missing.`
            }
            return `Invalid request: ${sanitizeString(error.error.message)}`
        }
        if (error?.message?.includes('model')) {
            return 'Selected model is not available. Please choose another.'
        }
        if (error?.message) {
            const fieldName = extractFieldNameFromError(error.message)
            if (fieldName) {
                return `Invalid request: ${fieldName} is invalid or missing.`
            }
            return `Invalid request: ${sanitizeString(error.message)}`
        }
        return 'Invalid request. Please check your input and try again.'
    }

    // Generic error with message
    if (error?.message) {
        return sanitizeString(error.message)
    }

    return 'An unexpected error occurred. Please try again.'
}

/**
 * Extract field name from error message
 * Handles patterns like:
 * - "invalid field: model"
 * - "missing required parameter: instructions"
 * - "required value: input is missing"
 * - "field 'model' is invalid"
 */
function extractFieldNameFromError(message: string): string | null {
    if (!message) return null
    
    // Pattern 1: "invalid/missing/required field/parameter/value: fieldName"
    // e.g., "invalid field: model", "missing required parameter: instructions"
    const colonPattern = /(?:invalid|missing|required)\s+(?:required\s+)?(?:field|parameter|value)?:?\s*['"]?(\w+)['"]?/i
    const colonMatch = message.match(colonPattern)
    if (colonMatch && colonMatch[1] && !['field', 'parameter', 'value', 'required'].includes(colonMatch[1].toLowerCase())) {
        return colonMatch[1]
    }
    
    // Pattern 2: "field/parameter 'fieldName' is invalid/missing"
    // e.g., "field 'model' is invalid"
    const quotedPattern = /(?:field|parameter)\s+['"](\w+)['"]\s+(?:is\s+)?(?:invalid|missing|required)/i
    const quotedMatch = message.match(quotedPattern)
    if (quotedMatch && quotedMatch[1]) {
        return quotedMatch[1]
    }
    
    // Pattern 3: Look for word after colon that's not a common keyword
    const afterColonPattern = /:\s*['"]?(\w+)['"]?/
    const afterColonMatch = message.match(afterColonPattern)
    if (afterColonMatch && afterColonMatch[1] && !['is', 'the', 'a', 'an', 'invalid', 'missing', 'required'].includes(afterColonMatch[1].toLowerCase())) {
        return afterColonMatch[1]
    }
    
    return null
}

/**
 * Parse error response and return structured error info
 * Used for detailed error handling in UI
 * 
 * Requirements: 7.1, 7.2, 7.3
 */
export interface ParsedCodexError {
    message: string
    status?: number
    shouldReauth?: boolean
    retryAfter?: number
    invalidFields?: string[]
}

export function parseCodexErrorDetailed(error: any, status?: number): ParsedCodexError {
    const result: ParsedCodexError = {
        message: 'An unexpected error occurred. Please try again.'
    }
    
    if (status) {
        result.status = status
    }

    // Handle rate limiting (429)
    // Requirements: 7.3
    if (status === 429) {
        const retryAfter = error?.headers?.get?.('retry-after') || 
                          error?.retryAfter || 
                          error?.error?.retry_after
        result.message = retryAfter 
            ? `Rate limit reached. Please wait ${retryAfter} seconds before trying again.`
            : 'Rate limit reached. Please wait before trying again.'
        if (retryAfter) {
            result.retryAfter = parseInt(retryAfter, 10)
        }
        return result
    }

    // Handle authentication errors (401)
    // Requirements: 7.2
    if (status === 401) {
        result.message = 'Your session has expired. Please sign in again.'
        result.shouldReauth = true
        return result
    }

    // Handle service unavailable
    if (status === 503 || status === 502) {
        result.message = 'Codex service is temporarily unavailable. Try another provider?'
        return result
    }

    // Handle 400 validation errors with field info
    // Requirements: 7.1
    if (status === 400) {
        const invalidFields: string[] = []
        
        // Try to extract field names from error
        const errorMessage = error?.error?.message || error?.message || ''
        
        // Extract all field names from the error message
        const fieldNames = extractAllFieldNamesFromError(errorMessage)
        invalidFields.push(...fieldNames)
        
        if (invalidFields.length > 0) {
            result.invalidFields = invalidFields
            result.message = `Invalid request: ${invalidFields.join(', ')} ${invalidFields.length === 1 ? 'is' : 'are'} invalid.`
        } else if (errorMessage.includes('model')) {
            result.message = 'Selected model is not available. Please choose another.'
        } else if (errorMessage) {
            result.message = `Invalid request: ${sanitizeString(errorMessage)}`
        } else {
            result.message = 'Invalid request. Please check your input and try again.'
        }
        return result
    }

    // Generic error with message
    if (error?.message) {
        result.message = sanitizeString(error.message)
    }

    return result
}

/**
 * Extract all field names from error message
 * Handles multiple fields in a single message
 */
function extractAllFieldNamesFromError(message: string): string[] {
    if (!message) return []
    
    const fields: string[] = []
    const commonKeywords = new Set(['field', 'parameter', 'value', 'required', 'invalid', 'missing', 'is', 'the', 'a', 'an'])
    
    // Pattern: Look for words after colons that aren't common keywords
    // Split by comma to handle multiple fields
    const parts = message.split(/[,;]/)
    
    for (const part of parts) {
        // Pattern 1: "keyword: fieldName" or "keyword parameter: fieldName"
        const colonMatch = part.match(/:\s*['"]?(\w+)['"]?/)
        if (colonMatch && colonMatch[1] && !commonKeywords.has(colonMatch[1].toLowerCase())) {
            fields.push(colonMatch[1])
            continue
        }
        
        // Pattern 2: "field/parameter 'fieldName'"
        const quotedMatch = part.match(/(?:field|parameter)\s+['"](\w+)['"]/)
        if (quotedMatch && quotedMatch[1]) {
            fields.push(quotedMatch[1])
        }
    }
    
    return fields
}

// ============================================================================
// Authentication Functions
// ============================================================================

/**
 * Initiate Codex OAuth authentication flow
 * Opens browser for ChatGPT login
 */
export async function initiateCodexAuth(): Promise<{ success: boolean; error?: string }> {
    if (!window.codexAuth) {
        return { success: false, error: 'Codex authentication not available' }
    }

    try {
        return await window.codexAuth.initiateAuth()
    } catch (error: any) {
        console.error('[Codex] Auth initiation failed:', sanitizeError(error))
        return { success: false, error: parseCodexError(error) }
    }
}

/**
 * Get current Codex authentication state
 */
export async function getCodexAuthState(): Promise<CodexAuthState> {
    if (!window.codexAuth) {
        return { isAuthenticated: false, error: 'Codex authentication not available' }
    }

    try {
        return await window.codexAuth.getAuthState()
    } catch (error: any) {
        console.error('[Codex] Failed to get auth state:', sanitizeError(error))
        return { isAuthenticated: false, error: parseCodexError(error) }
    }
}

/**
 * Logout from Codex (clear stored credentials)
 */
export async function logoutCodex(): Promise<void> {
    if (!window.codexAuth) {
        throw new Error('Codex authentication not available')
    }

    try {
        await window.codexAuth.logout()
    } catch (error: any) {
        console.error('[Codex] Logout failed:', sanitizeError(error))
        throw new Error(parseCodexError(error))
    }
}

/**
 * Validate stored Codex token
 */
export async function validateCodexToken(): Promise<boolean> {
    if (!window.codexAuth) {
        return false
    }

    try {
        return await window.codexAuth.validateToken()
    } catch (error: any) {
        console.error('[Codex] Token validation failed:', sanitizeError(error))
        return false
    }
}

// ============================================================================
// Chat Completion Functions
// ============================================================================

/**
 * Generate a chat completion using Codex
 */
export async function generateCodexCompletion(
    model: string,
    messages: ChatMessage[],
    options?: CodexOptions
): Promise<CodexResponse> {
    // #region agent log - Entry point
    console.log('[Codex:generateCodexCompletion] ========== FUNCTION ENTRY ==========')
    console.log('[Codex:generateCodexCompletion] model:', model)
    console.log('[Codex:generateCodexCompletion] messages count:', messages.length)
    console.log('[Codex:generateCodexCompletion] options:', JSON.stringify(options))
    // #endregion

    // Validate authentication first
    const isValid = await validateCodexToken()
    // #region agent log
    console.log('[Codex:generateCodexCompletion] Token valid:', isValid)
    // #endregion
    if (!isValid) {
        throw new Error('Not authenticated with Codex. Please sign in first.')
    }

    // Get token for API request
    const authState = await getCodexAuthState()
    // #region agent log
    console.log('[Codex:generateCodexCompletion] Auth state:', JSON.stringify(authState))
    // #endregion
    if (!authState.isAuthenticated) {
        throw new Error('Not authenticated with Codex. Please sign in first.')
    }

    // Parse model code to extract base model and reasoning effort
    // e.g., 'gpt-5.2-codex-high' -> baseModel: 'gpt-5.2-codex', reasoningEffort: 'high'
    const { baseModel, reasoningEffort } = parseCodexModelCode(model)
    // #region agent log
    console.log('[Codex:generateCodexCompletion] Parsed model:')
    console.log('[Codex:generateCodexCompletion]   baseModel:', baseModel)
    console.log('[Codex:generateCodexCompletion]   reasoningEffort:', reasoningEffort)
    // #endregion

    // CRITICAL: Fetch base_instructions from API for this model
    // The API validates instructions against the server's copy - must match exactly!
    const baseInstructions = await fetchBaseInstructions(baseModel)
    // #region agent log
    console.log('[Codex:generateCodexCompletion] Fetched base_instructions:', !!baseInstructions, 'length:', baseInstructions?.length || 0)
    // #endregion

    // Build request body using centralized function
    // This ensures all required fields are present and unsupported fields are excluded
    const requestBody = buildCodexRequest(model, messages, options, baseInstructions)

    // #region agent log - Request body before sending
    console.log('[Codex:generateCodexCompletion] ========== REQUEST BODY ==========')
    console.log('[Codex:generateCodexCompletion] Request body keys:', Object.keys(requestBody))
    console.log('[Codex:generateCodexCompletion] model:', requestBody.model)
    console.log('[Codex:generateCodexCompletion] instructions length:', requestBody.instructions?.length)
    console.log('[Codex:generateCodexCompletion] instructions preview:', requestBody.instructions?.substring(0, 150))
    console.log('[Codex:generateCodexCompletion] instructions source:', baseInstructions ? 'API (dynamic)' : 'FALLBACK (hardcoded)')
    console.log('[Codex:generateCodexCompletion] input count:', requestBody.input?.length)
    console.log('[Codex:generateCodexCompletion] input[0]:', JSON.stringify(requestBody.input?.[0], null, 2))
    console.log('[Codex:generateCodexCompletion] tools:', JSON.stringify(requestBody.tools))
    console.log('[Codex:generateCodexCompletion] tool_choice:', requestBody.tool_choice)
    console.log('[Codex:generateCodexCompletion] parallel_tool_calls:', requestBody.parallel_tool_calls)
    console.log('[Codex:generateCodexCompletion] stream:', requestBody.stream)
    console.log('[Codex:generateCodexCompletion] store:', requestBody.store)
    console.log('[Codex:generateCodexCompletion] include:', JSON.stringify(requestBody.include))
    console.log('[Codex:generateCodexCompletion] reasoning:', JSON.stringify(requestBody.reasoning))
    console.log('[Codex:generateCodexCompletion] HAS temperature?:', 'temperature' in requestBody)
    console.log('[Codex:generateCodexCompletion] HAS max_tokens?:', 'max_tokens' in requestBody)
    console.log('[Codex:generateCodexCompletion] FULL REQUEST BODY:', JSON.stringify(requestBody, null, 2))
    // #endregion

    try {
        // Make API request via IPC using Responses API endpoint
        // CRITICAL: For ChatGPT OAuth, endpoint is /responses (not /v1/responses)
        const response = await window.codexAuth.sendRequest({
            endpoint: '/responses',
            method: 'POST',
            body: requestBody
        })

        if (!response.ok) {
            let errorData: any = {}
            try {
                errorData = JSON.parse(response.body)
            } catch {
                errorData = { message: response.body }
            }
            throw new Error(parseCodexError(errorData, response.status))
        }

        return JSON.parse(response.body)
    } catch (error: any) {
        console.error('[Codex] Completion failed:', sanitizeError(error))
        throw new Error(parseCodexError(error))
    }
}

/**
 * Stream a chat completion using Codex
 * Note: Streaming is handled via non-streaming request with chunked response simulation
 * since IPC doesn't support true streaming. For real streaming, use direct fetch in renderer.
 */
export async function* streamCodexCompletion(
    model: string,
    messages: ChatMessage[],
    options?: CodexOptions & { onChunk?: (chunk: CodexStreamChunk) => void }
): AsyncGenerator<CodexStreamChunk, void, unknown> {
    // Validate authentication first
    const isValid = await validateCodexToken()
    if (!isValid) {
        throw new Error('Not authenticated with Codex. Please sign in first.')
    }

    // Parse model code to extract base model and reasoning effort
    // e.g., 'gpt-5.2-high' -> baseModel: 'gpt-5.2', reasoningEffort: 'high'
    const { baseModel, reasoningEffort } = parseCodexModelCode(model)

    // CRITICAL: Fetch base_instructions from API for this model
    // The API validates instructions against the server's copy - must match exactly!
    const baseInstructions = await fetchBaseInstructions(baseModel)
    // #region agent log
    console.log('[Codex:streamCodexCompletion] Fetched base_instructions:', !!baseInstructions, 'length:', baseInstructions?.length || 0)
    // #endregion

    // Build request body using centralized function
    // This ensures all required fields are present and unsupported fields are excluded
    const requestBody = buildCodexRequest(model, messages, options, baseInstructions)

    try {
        // Get response via IPC using Responses API
        // CRITICAL: For ChatGPT OAuth, endpoint is /responses (not /v1/responses)
        const response = await window.codexAuth.sendRequest({
            endpoint: '/responses',
            method: 'POST',
            body: requestBody
        })

        // #region agent log - Response received
        console.log('[Codex:streamCodexCompletion] ========== IPC RESPONSE RECEIVED ==========')
        console.log('[Codex:streamCodexCompletion] response object keys:', Object.keys(response || {}))
        console.log('[Codex:streamCodexCompletion] response.ok:', response?.ok)
        console.log('[Codex:streamCodexCompletion] response.status:', response?.status)
        console.log('[Codex:streamCodexCompletion] response.statusText:', response?.statusText)
        console.log('[Codex:streamCodexCompletion] response.body length:', response?.body?.length)
        console.log('[Codex:streamCodexCompletion] response.body preview:', response?.body?.substring(0, 500))
        console.log('[Codex:streamCodexCompletion] instructions source:', baseInstructions ? 'API (dynamic)' : 'FALLBACK (hardcoded)')
        // #endregion

        if (!response.ok) {
            // #region agent log - Error response details
            console.error('[Codex:streamCodexCompletion] ========== API ERROR ==========')
            console.error('[Codex:streamCodexCompletion] Full response.body:', response.body)
            // #endregion
            
            let errorData: any = {}
            try {
                errorData = JSON.parse(response.body)
                console.error('[Codex:streamCodexCompletion] Parsed error:', JSON.stringify(errorData, null, 2))
            } catch {
                errorData = { message: response.body }
                console.error('[Codex:streamCodexCompletion] Raw error (not JSON):', response.body)
            }
            throw new Error(parseCodexError(errorData, response.status))
        }

        const bodyText = response.body || ''
        const trimmedBody = bodyText.trim()

        // If the backend returned JSON, parse it directly.
        if (trimmedBody.startsWith('{') || trimmedBody.startsWith('[')) {
            const fullResponse: CodexResponse = JSON.parse(trimmedBody)
            const toolCalls = (fullResponse as any)?.choices?.[0]?.message?.tool_calls
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                const chunk: CodexStreamChunk = {
                    id: fullResponse.id,
                    choices: [{
                        delta: {
                            role: 'assistant',
                            tool_calls: toolCalls
                        },
                        finish_reason: 'tool_calls'
                    }],
                    usage: fullResponse.usage
                }

                if (options?.onChunk) {
                    options.onChunk(chunk)
                }
                yield chunk
                return
            }
            const content = fullResponse.choices?.[0]?.message?.content || ''

            // Simulate streaming by yielding the full content as a single chunk
            const chunk: CodexStreamChunk = {
                id: fullResponse.id,
                choices: [{
                    delta: {
                        content: content,
                        role: 'assistant'
                    },
                    finish_reason: fullResponse.choices?.[0]?.finish_reason || 'stop'
                }],
                usage: fullResponse.usage
            }

            if (options?.onChunk) {
                options.onChunk(chunk)
            }
            yield chunk
            return
        }

        // Otherwise, parse the SSE payload and simulate streaming.
        const sseEvents = parseSseEvents(bodyText)
        let hasDelta = false
        let sawToolCall = false
        let lastResponsePayload: any = null

        for (const event of sseEvents) {
            if (!event.data) continue
            if (event.data === '[DONE]') break

            let parsed: any = null
            try {
                parsed = JSON.parse(event.data)
            } catch {
                continue
            }

            if (parsed?.response) {
                lastResponsePayload = parsed.response
            }

            const toolCalls = extractToolCallsFromEvent(parsed)
            if (toolCalls && toolCalls.length > 0) {
                sawToolCall = true
                const chunk: CodexStreamChunk = {
                    id: parsed?.response?.id || parsed?.id || lastResponsePayload?.id || 'codex',
                    choices: [{
                        delta: {
                            role: 'assistant',
                            tool_calls: toolCalls
                        },
                        finish_reason: null
                    }],
                    usage: parsed?.response?.usage || parsed?.usage
                }

                if (options?.onChunk) {
                    options.onChunk(chunk)
                }
                yield chunk
                continue
            }

            const deltaText = extractDeltaText(parsed)
            if (deltaText) {
                hasDelta = true
                const chunk: CodexStreamChunk = {
                    id: parsed?.response?.id || parsed?.id || lastResponsePayload?.id || 'codex',
                    choices: [{
                        delta: {
                            content: deltaText,
                            role: 'assistant'
                        },
                        finish_reason: null
                    }],
                    usage: parsed?.response?.usage || parsed?.usage
                }

                if (options?.onChunk) {
                    options.onChunk(chunk)
                }
                yield chunk
            }
        }

        if (!sawToolCall && lastResponsePayload) {
            const toolCalls = extractToolCallsFromResponse(lastResponsePayload)
            if (toolCalls.length > 0) {
                sawToolCall = true
                const chunk: CodexStreamChunk = {
                    id: lastResponsePayload?.id || 'codex',
                    choices: [{
                        delta: {
                            role: 'assistant',
                            tool_calls: toolCalls
                        },
                        finish_reason: null
                    }],
                    usage: lastResponsePayload?.usage
                }

                if (options?.onChunk) {
                    options.onChunk(chunk)
                }
                yield chunk
            }
        }

        if (!hasDelta) {
            const fallbackText = extractResponseText(lastResponsePayload)
            if (fallbackText) {
                const chunk: CodexStreamChunk = {
                    id: lastResponsePayload?.id || 'codex',
                    choices: [{
                        delta: {
                            content: fallbackText,
                            role: 'assistant'
                        },
                        finish_reason: 'stop'
                    }],
                    usage: lastResponsePayload?.usage
                }

                if (options?.onChunk) {
                    options.onChunk(chunk)
                }
                yield chunk
            }
        }

        if (sawToolCall) {
            const chunk: CodexStreamChunk = {
                id: lastResponsePayload?.id || 'codex',
                choices: [{
                    delta: {
                        role: 'assistant'
                    },
                    finish_reason: 'tool_calls'
                }],
                usage: lastResponsePayload?.usage
            }

            if (options?.onChunk) {
                options.onChunk(chunk)
            }
            yield chunk
        }

    } catch (error: any) {
        // #region agent log - Detailed error capture
        console.error('[Codex] Streaming failed - FULL ERROR DETAILS:')
        console.error('[Codex]   error type:', typeof error)
        console.error('[Codex]   error name:', error?.name)
        console.error('[Codex]   error message:', error?.message)
        console.error('[Codex]   error stack:', error?.stack)
        console.error('[Codex]   error.response:', error?.response)
        console.error('[Codex]   error.status:', error?.status)
        console.error('[Codex]   error.body:', error?.body)
        console.error('[Codex]   JSON.stringify(error):', JSON.stringify(error, null, 2))
        console.error('[Codex]   sanitized:', sanitizeError(error))
        // #endregion
        throw new Error(parseCodexError(error))
    }
}

function parseSseEvents(payload: string): Array<{ event?: string; data?: string }> {
    const events: Array<{ event?: string; data?: string }> = []
    const blocks = payload.split(/\n\n+/)

    for (const block of blocks) {
        const lines = block.split(/\r?\n/)
        let eventName: string | undefined
        const dataLines: string[] = []

        for (const line of lines) {
            if (line.startsWith('event:')) {
                eventName = line.slice(6).trim()
            } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart())
            }
        }

        if (dataLines.length > 0) {
            events.push({ event: eventName, data: dataLines.join('\n') })
        }
    }

    return events
}

function normalizeToolCallFromItem(item: any): StreamingToolCall | null {
    if (!item || typeof item !== 'object') return null
    const itemType = item.type || item?.kind

    if (itemType !== 'function_call' && itemType !== 'tool_call') {
        return null
    }

    const name = item.name || item.function?.name
    if (!name) return null

    const callId = item.call_id || item.callId || item.id || ''
    const rawArgs = item.arguments ?? item.function?.arguments ?? ''
    const args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs)

    return {
        id: callId,
        type: 'function',
        function: {
            name,
            arguments: args
        }
    }
}

function extractToolCallsFromEvent(event: any): StreamingToolCall[] | null {
    if (!event || typeof event !== 'object') return null
    const eventType = typeof event.type === 'string' ? event.type : ''

    if (eventType === 'response.output_item.added' || eventType === 'response.output_item.done') {
        const call = normalizeToolCallFromItem(event.item)
        return call ? [call] : null
    }

    return null
}

function extractToolCallsFromResponse(response: any): StreamingToolCall[] {
    const toolCalls: StreamingToolCall[] = []
    const output = response?.output
    if (!Array.isArray(output)) return toolCalls

    for (const item of output) {
        const call = normalizeToolCallFromItem(item)
        if (call) toolCalls.push(call)
    }

    return toolCalls
}

function extractDeltaText(event: any): string | null {
    if (!event) return null
    const eventType = typeof event.type === 'string' ? event.type : ''

    // Only treat explicit delta events as streamable content.
    if (eventType.endsWith('.delta')) {
        if (typeof event.delta === 'string') return event.delta
        if (typeof event?.output_text?.delta === 'string') return event.output_text.delta
    }

    return null
}

function extractResponseText(response: any): string {
    if (!response) return ''
    const output = response.output
    if (Array.isArray(output)) {
        const parts: string[] = []
        for (const item of output) {
            if (item?.type === 'message' && Array.isArray(item.content)) {
                for (const part of item.content) {
                    if (part?.type === 'output_text' && typeof part.text === 'string') {
                        parts.push(part.text)
                    }
                }
            } else if (typeof item?.text === 'string') {
                parts.push(item.text)
            }
        }
        if (parts.length > 0) return parts.join('')
    }
    if (typeof response.output_text === 'string') return response.output_text
    if (typeof response.text === 'string') return response.text
    return ''
}

// ============================================================================
// Message Formatting
// ============================================================================

/**
 * Format messages for Codex API (Responses API format)
 * CRITICAL: The ChatGPT backend API requires specific ResponseItem format:
 * - Each message must have "type": "message"
 * - Content must be an array of ContentItem objects with "type": "input_text" or "input_image"
 * Reference: research-codex/codex/codex-rs/protocol/src/models.rs
 */
export function formatMessagesForCodex(messages: ChatMessage[]): any[] {
    // #region agent log
    console.log('[Codex:formatMessagesForCodex] ========== FUNCTION ENTRY ==========')
    console.log('[Codex:formatMessagesForCodex] Input messages count:', messages.length)
    // #endregion

    const formatted = messages.map((msg, idx) => {
        if (msg.role === 'tool' && msg.tool_call_id) {
            const toolContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            const isError = typeof msg.content === 'string' && msg.content.trim().toLowerCase().startsWith('error:')
            const formatted = {
                type: 'function_call_output',
                call_id: msg.tool_call_id,
                output: {
                    content: toolContent,
                    success: !isError
                }
            }

            // #region agent log
            console.log(`[Codex:formatMessagesForCodex] Message[${idx}]:`)
            console.log(`[Codex:formatMessagesForCodex]   original role: ${msg.role}`)
            console.log(`[Codex:formatMessagesForCodex]   original content type: ${typeof msg.content}`)
            console.log(`[Codex:formatMessagesForCodex]   formatted: ${JSON.stringify(formatted)}`)
            // #endregion

            return formatted
        }

        // Build content array in ResponseItem format
        const contentItems: any[] = []
        
        if (Array.isArray(msg.content)) {
            // Handle multimodal content (text + images)
            for (const part of msg.content) {
                if (part.type === 'image_url' && part.image_url) {
                    contentItems.push({
                        type: 'input_image',
                        image_url: part.image_url.url
                    })
                } else if (part.type === 'text' && part.text) {
                    contentItems.push({
                        type: 'input_text',
                        text: part.text
                    })
                }
            }
        } else if (typeof msg.content === 'string') {
            // Simple text message
            contentItems.push({
                type: 'input_text',
                text: msg.content
            })
        }

        const formatted = {
            type: 'message',
            role: msg.role,
            content: contentItems
        }

        // #region agent log
        console.log(`[Codex:formatMessagesForCodex] Message[${idx}]:`)
        console.log(`[Codex:formatMessagesForCodex]   original role: ${msg.role}`)
        console.log(`[Codex:formatMessagesForCodex]   original content type: ${typeof msg.content}`)
        console.log(`[Codex:formatMessagesForCodex]   formatted: ${JSON.stringify(formatted)}`)
        // #endregion

        return formatted
    })

    // #region agent log
    console.log('[Codex:formatMessagesForCodex] ========== OUTPUT ==========')
    console.log('[Codex:formatMessagesForCodex] Formatted messages count:', formatted.length)
    console.log('[Codex:formatMessagesForCodex] Full formatted output:', JSON.stringify(formatted, null, 2))
    // #endregion

    return formatted
}

/**
 * Format image for Codex vision request
 */
export function formatImageForCodex(base64Data: string, mimeType?: string): any {
    // Extract base64 if it includes data URL prefix
    const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data
    const detectedMimeType = mimeType || base64Data.match(/data:([^;]+)/)?.[1] || 'image/png'

    return {
        type: 'image_url',
        image_url: {
            url: `data:${detectedMimeType};base64,${base64}`
        }
    }
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse Codex response to extract content
 */
export function parseCodexResponse(response: CodexResponse): string {
    return response.choices?.[0]?.message?.content || ''
}

/**
 * Extract usage metadata from Codex response
 */
export function extractCodexUsage(response: CodexResponse | CodexStreamChunk): {
    inputTokens: number
    outputTokens: number
    totalTokens: number
} {
    const usage = response.usage
    return {
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0
    }
}
