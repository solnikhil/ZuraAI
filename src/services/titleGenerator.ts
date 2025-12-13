import { generateGeminiCompletion } from './gemini'
import { generateGroqCompletion } from './groq'

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
    settings: {
        modelProvider: string
        geminiApiKey: string
        openRouterApiKey: string
        perplexityApiKey: string
        groqApiKey: string
        aiModel: string
        titleModel: string
    }
): Promise<string> => {
    const prompt = `Generate a concise 3-word title for this chat. Format should be descriptive like these examples:
- "UI/UX improvement tips"
- "Real-time systems explained"  
- "Repo maintenance guide"

IMPORTANT rules:
1. Return ONLY the 3-word title.
2. Do NOT say "Here is the title" or any other conversational text.
3. Do NOT use quotes.
4. Do NOT use markdown.

User message: "${userMessage.slice(0, 200)}"`

    try {
        let title = ''
        const titleModel = settings.titleModel || 'gemini-2.0-flash'

        // Known Groq models
        const groqModels = [
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
            'llama-guard-3-8b',
            'mixtral-8x7b-32768',
            'gemma2-9b-it'
        ]

        // Check availability
        const isGemini = titleModel.startsWith('gemini-') && settings.geminiApiKey
        const isGroq = groqModels.includes(titleModel) && settings.groqApiKey

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
        } else if (settings.openRouterApiKey) {
            // Fallback to OpenRouter for everything else
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${settings.openRouterApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: titleModel,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 20
                })
            })
            const data = await res.json()
            title = data.choices?.[0]?.message?.content || ''
        }

        // Clean up the title and enforce 3 words
        title = title.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/g, '')
        title = enforceThreeWords(title)
        if (title.length < 2) throw new Error('Generated title too short')
        return title
    } catch (error) {
        console.error('Primary title generation failed:', error)

        // Fallback to free OpenRouter model (if we have a key and didn't try it already)
        if (settings.openRouterApiKey && !settings.titleModel?.includes('openrouter')) {
            try {
                const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${settings.openRouterApiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://zura.ai", // Required for OpenRouter free tier
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

        // Final fallback to truncated message (try to get 3 words)
        const words = userMessage.trim().split(/\s+/).slice(0, 3)
        return words.join(' ') + (userMessage.split(/\s+/).length > 3 ? '...' : '')
    }
}
