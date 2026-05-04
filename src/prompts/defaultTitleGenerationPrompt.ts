export const defaultTitleGenerationPrompt = `Give this conversation a short descriptive title (2-6 words).

Rules:
- Return ONLY the title text. No quotes, no prefix, no explanation.
- Do NOT repeat the instruction back.
- Do NOT use markdown or punctuation at the end.

Good: "Python web scraping guide"
Good: "Fixing React hydration error"
Good: "Deploying to AWS"
Bad: "Here is a title: Python web scraping guide"
Bad: "Title: Fixing React hydration error"
Bad: "Generate a short descriptive title"

User message: "{{userMessage}}"`
