import { generateGeminiCompletion } from './gemini'
import { generateGroqCompletion } from './groq'
import { generateOllamaCompletion } from './ollama'
import { generatePerplexityCompletion } from './perplexity'
import { getOpenRouterApiKey } from '../utils/openRouterKey'

/**
 * Generates a short, descriptive title for a chat session based on the user's first message.
 * Uses the currently configured AI provider.
 */

// Helper function to enforce exactly 3 words
const enforceThreeWords = (title: string): string => {
    const words = title.trim().split(/\s+/).filter(w => w.length > 0)
    if (words.length === 0) return 'New Chat Session'
    if (words.length === 3) return words.join(' ')
    if (words.length > 3) return words.slice(0, 3).join(' ')
    // If less than 3 words, just return what we have (still valid)
    return words.join(' ')
}

export const generateChatTitle = async (
    userMessage: string,
    settings: any // Using any to accept the full settings object structure
): Promise<string> => {
    const prompt = `Generate a concise 2-3-word title for this chat. Format should be descriptive like these examples:
- "UI/UX improvement tips"
- "Real-time systems explained"  
- "Repo maintenance guide"

IMPORTANT rules:
1. Return ONLY the 2-3-word title.
2. Do NOT say "Here is the title" or any other conversational text.
3. Do NOT use quotes.
4. Do NOT use markdown.

User message: "${userMessage.slice(0, 200)}"`

    try {
        let title = ''
        const titleModel = settings.titleModel || 'gemini-2.0-flash'

        // Determine Provider
        const isGemini = titleModel.startsWith('gemini-') && settings.geminiApiKey

        // Check if it's a known Groq model or if we are forced to use Groq
        const knownGroqModels = [
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
            'llama-guard-3-8b',
            'mixtral-8x7b-32768',
            'gemma2-9b-it'
        ]
        // Also check against configured groqModels if passed
        const configuredGroqModels = settings.groqModels?.map((m: any) => m.code) || []
        const isGroq = (knownGroqModels.includes(titleModel) || configuredGroqModels.includes(titleModel)) && settings.groqApiKey

        // Check for Ollama (usually no API key needed, but needs URL)
        // We assume if the model is NOT gemini/groq/openrouter/perplexity, it might be Ollama if configured
        const isOllama = settings.modelProvider === 'ollama' && !settings.titleModel // If no specific title model set, and main is ollama
            || (settings.ollamaModels?.some((m: any) => m.code === titleModel)) // Or if title model is in ollama list

        const isPerplexity = titleModel.startsWith('sonar') && settings.perplexityApiKey

        if (isGemini) {
            const res = await generateGeminiCompletion(
                settings.geminiApiKey,
                titleModel,
                [{ role: 'user', content: prompt }],
                { temperature: 0.3 }
            )
            title = res.candidates?.[0]?.content?.parts?.[0]?.text || ''
        } else if (isGroq) {
            const res = await generateGroqCompletion(
                settings.groqApiKey,
                titleModel,
                [{ role: 'user', content: prompt }],
                { temperature: 0.3 }
            )
            title = res.choices?.[0]?.message?.content || ''
        } else if (isPerplexity) {
            const res = await generatePerplexityCompletion(
                settings.perplexityApiKey,
                titleModel,
                [{ role: 'user', content: prompt }],
                // Perplexity usually expects messages
            )
            title = res.choices?.[0]?.message?.content || ''
        } else if (isOllama && settings.ollamaUrl) {
            const res = await generateOllamaCompletion(
                settings.ollamaUrl,
                titleModel || settings.aiModel, // Use title model or fall back to main model
                [{ role: 'user', content: prompt }],
                { temperature: 0.3 }
            )
            title = res.message?.content || ''
        } else if (getOpenRouterApiKey(settings.openRouterApiKey)) {
            // Fallback to OpenRouter for everything else
            const openRouterKey = getOpenRouterApiKey(settings.openRouterApiKey)
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${openRouterKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: titleModel.includes('openrouter') ? titleModel.replace('openrouter/', '') : titleModel,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 20
                })
            })
            const data = await res.json()
            title = data.choices?.[0]?.message?.content || ''
        }

        // Clean up the title and enforce 3 words
        title = title.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/g, '')

        // Final sanity check before enforcing
        if (!title && getOpenRouterApiKey(settings.openRouterApiKey)) {
            // Try OpenRouter fallback if primary failed silently empty
            throw new Error('Empty title from primary provider')
        }

        title = enforceThreeWords(title)
        if (title.length < 2) throw new Error('Generated title too short')
        return title
    } catch (error) {
        console.error('Primary title generation failed:', error)

        // Fallback to free OpenRouter model
        const openRouterKey = getOpenRouterApiKey(settings.openRouterApiKey)
        if (openRouterKey && !settings.titleModel?.includes('openrouter')) {
            try {
                const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${openRouterKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://zura.ai",
                        "X-Title": "Zura"
                    },
                    body: JSON.stringify({
                        model: "google/gemini-2.0-flash-exp:free",
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 20
                    })
                })
                const data = await res.json()
                const fallbackTitle = data.choices?.[0]?.message?.content || ''
                if (fallbackTitle) {
                    let cleaned = fallbackTitle.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/g, '')
                    return enforceThreeWords(cleaned)
                }
            } catch (fallbackError) {
                console.error('Fallback title generation failed:', fallbackError)
            }
        }

        // Final fallback to truncated message
        const words = userMessage.trim().split(/\s+/).slice(0, 3)
        return words.join(' ') + (userMessage.split(/\s+/).length > 3 ? '...' : '')
    }
}
