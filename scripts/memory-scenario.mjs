#!/usr/bin/env node

/**
 * Repeatable manual memory scenario for ZuraAI development builds.
 *
 * Run `bun run dev`, open DevTools in the renderer, and call:
 *   await window.appInfo.getMemoryReport()
 * after each checkpoint below. The IPC is development-only and returns null in
 * packaged builds.
 */

const checkpoints = [
  'cold-start dashboard visible',
  'open the remembered chat or create a new chat',
  'switch through 20 sidebar chats',
  'send one streamed response and wait for completion',
  'open settings, visit Provider Hub and MCP sections, then return to dashboard',
  'open overlay, send or receive one prompt, then hide overlay',
  'connect then disconnect one configured MCP server if available',
]

console.log('ZuraAI memory scenario')
console.log('')
console.log('Collect a baseline and then one report after each checkpoint:')
console.log("  await window.appInfo.getMemoryReport()")
console.log('')
for (const [index, checkpoint] of checkpoints.entries()) {
  console.log(`${index + 1}. ${checkpoint}`)
}
