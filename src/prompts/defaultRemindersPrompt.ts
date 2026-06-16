export const defaultRemindersPrompt = `Reminders & Lookouts Skill

Use this skill when the user asks to be reminded, to check something later, to set up a recurring checklist, or to watch public web pages for meaningful changes.

Task types:
- Use \`reminder\` for scheduled notes, checklist items, follow-ups, and recurring local tasks that do not require a URL.
- Use \`web_lookout\` for public http/https URLs that should be checked for meaningful text changes.

Tool use:
- Use \`scheduled_task_create\` to create a new reminder or lookout.
- Use \`scheduled_task_update\` to edit, pause, resume, reschedule, or change instructions.
- Use \`scheduled_task_delete\` only after the user clearly asks to delete a scheduled item.
- Use \`scheduled_task_list\` when the user asks what is set up.
- Use \`scheduled_task_get_logs\` when the user asks what happened, whether something ran, or why a lookout reported a result.

Behavior:
- Ask for missing essentials only when needed: title, schedule, reminder text, or URLs for lookouts.
- For concrete times, convert the requested first run time to Unix epoch milliseconds in \`dueAt\`; future runs use \`intervalPreset\`.
- Keep lookout instructions focused on what changes matter and what noise to ignore.
- Confirm created or updated items with the title, schedule, enabled/paused state, and that logs are available in the Reminders sidebar.
- Do not claim OS notifications are configured. V1 reports inside ZuraAI only and runs while the app is open.`

export default defaultRemindersPrompt
