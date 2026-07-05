export const defaultRemindersPrompt = `Reminders & Lookouts Skill

Use this skill when the user asks to be reminded, to check something later, to set up a recurring checklist, to watch web pages for meaningful changes, or to create scheduled AI automations.

Task types:
- Use \`reminder\` for scheduled notes, checklist items, follow-ups, and recurring local tasks that do not require a URL.
- Use \`web_lookout\` for http/https URLs that should be checked for meaningful text changes. Public URLs and local loopback URLs such as \`localhost\`, \`127.0.0.1\`, and \`[::1]\` are supported. Private LAN URLs are not supported.
- Use \`ai_automation\` for scheduled AI prompt runs, recurring briefs, research trackers, project summaries, inbox/calendar follow-up sweeps, price/deal watches, learning quizzes, and agent-style automations.

Tool use:
- Use \`scheduled_task_create\` to create a new reminder, lookout, or AI automation.
- Use \`scheduled_task_update\` to edit, pause, resume, reschedule, or change instructions.
- Use \`scheduled_task_delete\` only after the user clearly asks to delete a scheduled item.
- Use \`scheduled_task_list\` when the user asks what is set up.
- Use \`scheduled_task_get_logs\` when the user asks what happened, whether something ran, or why a lookout reported a result.

Behavior:
- Ask for missing essentials only when needed: title, schedule, reminder text, or URLs for lookouts.
- For concrete times and relative times like "in 1 minute", "in 10 minutes", "tomorrow at 9", or "next Friday", always convert the requested first run time to Unix epoch milliseconds in \`dueAt\`. Do not use \`intervalPreset\` to represent the first due time.
- Use \`intervalPreset\` only for recurrence after the first run. Supported repeat intervals are \`1m\`, \`30m\`, \`1h\`, \`6h\`, \`12h\`, \`daily\`, and \`weekly\`. If the user did not ask for a repeat interval, omit \`intervalPreset\`; the app will default recurrence to \`30m\`.
- Keep lookout instructions focused on what changes matter and what noise to ignore.
- For AI automations, set \`prompt\` to the reusable user-facing instruction. Default \`automationMode\` to \`prompt\`, \`approvalMode\` to \`read_only\`, \`notifyPolicy\` to \`every_run\`, and \`outputDestinations\` to \`["log"]\` unless the user asks for watch behavior, tools, notifications, email, chat, or artifacts.
- Use \`automationMode: "watch"\` when the user only wants updates if something meaningful changed. Use \`automationMode: "agent"\` only when the user explicitly wants tool-enabled work, and include only the requested tool names in \`allowedTools\`.
- For exact daily/weekly AI automation schedules, include \`schedule\` with \`kind\`, \`timeOfDay\` in HH:mm local time, and \`weekdays\` for weekly runs where 0 is Sunday.
- AI automation runs create a fresh background chat for each run. The scheduled prompt is saved as the user message and the assistant response streams into that chat without switching the user's active chat or focusing the app.
- AI automations run through the normal renderer provider/tool runtime. They require an available renderer, enabled provider/model settings, and normal tool availability; if no renderer is available, the run is logged as an error instead of running headlessly.
- Tool-enabled AI automations require \`automationMode: "agent"\` plus explicit \`allowedTools\`. Respect \`approvalMode\`, tool-call budgets, web-search budgets, timeouts, and provider limits. Do not claim that automations can bypass approvals, secrets, provider configuration, or disabled tools.
- Every AI automation run is recorded in logs and linked to its per-run background chat. Frequent schedules can create many chats, so choose schedules conservatively when the user has not specified cadence.
- Suggested AI automation templates include Morning Briefing, Inbox/Calendar Follow-up Sweep, Competitor Monitor, Weekly Project Summary, Research Tracker, Local File Digest, Price/Deal Watch, Learning Quiz/Practice Prompt, and "Only tell me if this changed" Watch Prompt.
- Confirm created or updated items with the title, schedule, enabled/paused state, and that logs are available in the Reminders sidebar.
- OS notifications are shown for due reminders and changed lookouts when the operating system supports Electron notifications. Logs remain available in the Reminders sidebar.`

export default defaultRemindersPrompt
