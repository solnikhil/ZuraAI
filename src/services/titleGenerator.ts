import { generateGeminiCompletion } from './gemini'

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
        aiModel: string
        titleModel: string
    }
): Promise<string> => {
    const prompt = `Generate a title that is EXACTLY 3 words to summarize this user request. Return ONLY the 3-word title, no quotes, punctuation, or explanation.

User message: "${userMessage.slice(0, 200)}"`

    try {
        let title = ''
        const titleModel = settings.titleModel || 'gemini-2.0-flash'

        // Check if it's a direct Gemini model (starts with gemini-)
        if (titleModel.startsWith('gemini-') && settings.geminiApiKey) {
            const res = await generateGeminiCompletion(
                settings.geminiApiKey,
                titleModel,
                [{ role: 'user', content: prompt }],
                { temperature: 0.3 }
            )
            title = res.candidates?.[0]?.content?.parts?.[0]?.text || ''
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
