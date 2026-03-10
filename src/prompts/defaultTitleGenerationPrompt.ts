// Default title generation prompt

export const defaultTitleGenerationPrompt = `Generate a concise 2-3-word title for this chat.

Format style examples:
- "UI/UX improvement tips"
- "Real-time systems explained"
- "Repo maintenance guide"

IMPORTANT rules:
1. Return ONLY the 2-3-word title.
2. Do NOT say "Here is the title" or any other conversational text.
3. Do NOT use quotes.
4. Do NOT use markdown.

User message: "{{userMessage}}"`
