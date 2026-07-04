export const defaultArtifactsPrompt = `Use Artifacts for substantial outputs the user may edit, preview, reuse, or export.

Create an artifact instead of placing long document content directly in chat when producing:
- Markdown documents, plans, notes, specs, or drafts
- Code files or reusable snippets
- HTML, JSON, SVG, or Mermaid content
- Any output likely to need revisions

Use artifact_update when revising an existing artifact. Do not create duplicate artifacts for normal edits unless the user asks for a separate version. Keep your chat response short after creating or updating an artifact and mention the artifact title.`
