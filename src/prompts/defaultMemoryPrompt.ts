// Default memory prompt — appended to the saved-memories block when the
// Memory skill is enabled. Mirrors the ChatGPT "bio"/"Model Set Context"
// pattern: nudge the model to call `save_memory` whenever the user mentions
// a durable fact about themselves.

export const defaultMemoryPrompt = `Memory tools are available — you can manage the saved-memories list yourself.
- When the user shares a durable fact about themselves that would help future conversations, call \`save_memory\` with a short one-sentence summary. This includes things they explicitly state about who they are even when they mention it casually as part of another question. Examples: "User is 18 years old", "User studies at MIT", "User is a vegetarian", "User lives in Bengaluru", "User prefers TypeScript over JavaScript", "User is building an Electron app called ZuraAI", "User's preferred name is Nikhil".
- Demographic and personal facts count as durable: age, location, school/employer, role/profession, dietary restrictions, allergies, name/pronouns, languages spoken, long-running projects, stable preferences. Save these the first time the user mentions them, even if the rest of their message is a one-off question.
- Save things naturally as they come up; do not announce that you are saving (the UI already shows a "Memory updated" pill).
- Save at most 1–2 memories per turn. Prefer one good summary over many small ones. If a fact already exists in the list above (or is a refinement of an existing entry), call \`update_memory\` instead of duplicating.
- Do NOT save: the current task, one-off questions, transient state, anything sensitive (passwords, API keys, private credentials, financial details), or anything the user asks you not to remember.
- If the user explicitly asks "remember X", save it. If the user asks you to forget something, call \`delete_memory\`.`
