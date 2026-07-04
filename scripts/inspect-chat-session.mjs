#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const sessionReference = args.find((arg) => !arg.startsWith('--'))
const outputJson = args.includes('--json')

function usage() {
  console.error('Usage: bun scripts/inspect-chat-session.mjs <sessionId-or-zura-chat-url> [--json]')
}

function decodeBase64Url(value) {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64').toString('utf8')
}

function parseSessionReference(value) {
  if (!value?.startsWith('zura-chat://')) {
    return { sessionId: value, userDataDir: null }
  }

  const body = value.slice('zura-chat://'.length)
  const queryIndex = body.indexOf('?')
  const encodedSessionId = queryIndex >= 0 ? body.slice(0, queryIndex) : body
  const query = queryIndex >= 0 ? body.slice(queryIndex + 1) : ''
  const encodedUserData = new URLSearchParams(query).get('userData')
  return {
    sessionId: decodeURIComponent(encodedSessionId),
    userDataDir: encodedUserData ? decodeBase64Url(encodedUserData) : null,
  }
}

function getDefaultUserDataDir(appName = 'ZuraAI') {
  const home = os.homedir()
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', appName)
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName)
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), appName)
  }
}

function hasSessionFile(userDataDir, sessionId) {
  return existsSync(
    path.join(userDataDir, 'chat-sessions', `${encodeURIComponent(sessionId)}.json`)
  )
}

function resolveUserDataDir(sessionId, referenceUserDataDir) {
  const candidates = [
    referenceUserDataDir ? path.resolve(referenceUserDataDir) : null,
    process.env.ZURA_USER_DATA_DIR ? path.resolve(process.env.ZURA_USER_DATA_DIR) : null,
    getDefaultUserDataDir('ZuraAI'),
    getDefaultUserDataDir('Zura'),
  ].filter(Boolean)

  const withSession = candidates.find((candidate) => hasSessionFile(candidate, sessionId))
  if (withSession) return withSession

  const existing = candidates.find((candidate) => existsSync(candidate))
  return existing || getDefaultUserDataDir('ZuraAI')
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

async function readJsonl(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8')
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return { phase: 'parse-error', error: line.slice(0, 240) }
        }
      })
  } catch {
    return []
  }
}

function formatDate(value) {
  return typeof value === 'number' ? new Date(value).toISOString() : 'unknown'
}

function truncate(text, limit = 280) {
  const normalized = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.length > limit ? `${normalized.slice(0, limit)}...[truncated]` : normalized
}

function formatUsage(usage) {
  if (!usage) return 'none'
  const parts = [
    `input=${usage.inputTokens ?? 0}`,
    `output=${usage.outputTokens ?? 0}`,
    `total=${usage.totalTokens ?? 0}`,
  ]
  if (usage.thinkingTokens != null) parts.push(`thinking=${usage.thinkingTokens}`)
  if (usage.cachedInputTokens != null) parts.push(`cacheHit=${usage.cachedInputTokens}`)
  if (usage.cacheMissInputTokens != null) parts.push(`cacheMiss=${usage.cacheMissInputTokens}`)
  if (usage.cacheWriteInputTokens != null) parts.push(`cacheWrite=${usage.cacheWriteInputTokens}`)
  if (usage.ttft != null) parts.push(`ttft=${Math.round(usage.ttft)}ms`)
  if (usage.tps != null) parts.push(`tps=${Number(usage.tps).toFixed(1)}`)
  return parts.join(', ')
}

function formatObjectPreview(value, limit = 900) {
  if (!value) return 'none'
  return truncate(JSON.stringify(value, null, 2), limit)
}

function formatPartTypes(partTypes) {
  if (!Array.isArray(partTypes) || partTypes.length === 0) return 'none'
  return partTypes
    .map((types) => {
      if (Array.isArray(types)) return `[${types.join(',')}]`
      if (typeof types === 'string') return types
      if (types == null) return '[]'
      return String(types)
    })
    .join(' ')
}

function latestEvent(diagnostics, phase) {
  for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
    if (diagnostics[index]?.phase === phase) return diagnostics[index]
  }
  return null
}

function renderMarkdown(report) {
  const lines = []
  const { userDataDir, session, metadata, diagnostics } = report

  lines.push(`# ZuraAI Chat Session Diagnostics`)
  lines.push('')
  lines.push(`- Session ID: \`${report.sessionId}\``)
  lines.push(`- User data: \`${userDataDir}\``)
  lines.push(`- Title: ${session?.title ?? metadata?.title ?? 'unknown'}`)
  lines.push(`- Created: ${formatDate(session?.createdAt ?? metadata?.createdAt)}`)
  lines.push(`- Updated: ${formatDate(session?.updatedAt ?? metadata?.updatedAt)}`)
  lines.push(`- Messages: ${session?.messages?.length ?? metadata?.messageCount ?? 0}`)
  lines.push(`- Diagnostic events: ${diagnostics.length}`)
  lines.push('')

  lines.push(`## Messages`)
  const messages = session?.messages || []
  if (messages.length === 0) {
    lines.push('')
    lines.push('_No stored messages found for this session._')
  } else {
    for (const message of messages) {
      lines.push('')
      lines.push(`### ${message.role} · ${message.id}`)
      lines.push(`- Time: ${formatDate(message.timestamp)}`)
      if (message.model) lines.push(`- Model: ${message.model}`)
      if (message.latency != null) lines.push(`- Latency: ${Math.round(message.latency)}ms`)
      if (message.finishReason) lines.push(`- Finish: ${message.finishReason}`)
      if (message.usage) lines.push(`- Usage: ${formatUsage(message.usage)}`)
      if (message.toolResults?.length) {
        lines.push(
          `- Tool results: ${message.toolResults.map((result) => `${result.toolCall?.name}:${result.result?.success ? 'ok' : 'error'}`).join(', ')}`
        )
      }
      lines.push('')
      lines.push(truncate(message.content || '', 1_200) || '_empty_')
    }
  }

  const contextEvent = latestEvent(diagnostics, 'context-optimized')
  lines.push('')
  lines.push(`## Context Optimization`)
  if (!contextEvent?.context) {
    lines.push('')
    lines.push('_No context optimization trace found._')
  } else {
    const context = contextEvent.context
    lines.push(`- Model: ${context.model ?? 'unknown'}`)
    lines.push(
      `- Window: max=${context.maxTokens ?? 'unknown'}, reserve=${context.reserveForResponse ?? 'unknown'}, available=${context.availableTokens ?? 'unknown'}`
    )
    lines.push(
      `- Tokens: original=${context.originalTokens ?? 'unknown'}, final=${context.finalTokens ?? 'unknown'}`
    )
    lines.push(
      `- Messages: original=${context.originalMessageCount ?? 'unknown'}, final=${context.finalMessageCount ?? 'unknown'}`
    )
    lines.push(`- Truncated: ${context.wasTruncated ? 'yes' : 'no'}`)
    lines.push(`- Synthetic summary inserted: ${context.insertedSummary ? 'yes' : 'no'}`)
    if (context.keptMessageIds?.length)
      lines.push(`- Kept IDs: ${context.keptMessageIds.join(', ')}`)
    if (context.droppedMessageIds?.length)
      lines.push(`- Dropped IDs: ${context.droppedMessageIds.join(', ')}`)
  }

  const requestEvent = latestEvent(diagnostics, 'request-shape')
  lines.push('')
  lines.push(`## Request Shape`)
  if (!requestEvent?.requestShape) {
    lines.push('')
    lines.push('_No request-shape trace found._')
  } else {
    const shape = requestEvent.requestShape
    lines.push(
      `- Round: ${requestEvent.round ?? 'unknown'} (${requestEvent.roundType ?? 'unknown'})`
    )
    lines.push(`- Roles: ${(shape.roleOrder || []).join(' -> ')}`)
    lines.push(`- Text lengths: ${(shape.textLengths || []).join(', ')}`)
    lines.push(`- Content types: ${(shape.contentTypes || []).join(', ')}`)
    lines.push(`- Part types: ${formatPartTypes(shape.partTypes)}`)
    lines.push(`- Reasoning fields: ${(shape.hasReasoning || []).filter(Boolean).length}`)
    lines.push(`- Thinking fields: ${(shape.hasThinking || []).filter(Boolean).length}`)
    lines.push(
      `- Tools: ${shape.toolCount ?? 0}; choice=${shape.toolChoice ?? 'default'}; cache markers=${shape.cacheMarkerCount ?? 0}`
    )
  }

  const roundEvents = diagnostics.filter(
    (event) => event.phase === 'round-start' || event.phase === 'round-finish'
  )
  lines.push('')
  lines.push(`## Round Trace`)
  if (roundEvents.length === 0) {
    lines.push('')
    lines.push('_No round trace found._')
  } else {
    for (const event of roundEvents.slice(-20)) {
      lines.push(
        `- ${formatDate(event.timestamp)} \`${event.phase}\` round=${event.round ?? 'unknown'} type=${event.roundType ?? 'unknown'}${event.finishReason ? ` finish=${event.finishReason}` : ''}${event.usage ? ` usage=[${formatUsage(event.usage)}]` : ''}`
      )
    }
  }

  const rawUsageEvents = diagnostics.filter((event) => event.rawUsage)
  lines.push('')
  lines.push(`## Raw Usage Snapshots`)
  if (rawUsageEvents.length === 0) {
    lines.push('')
    lines.push('_No raw provider usage snapshots found._')
  } else {
    for (const event of rawUsageEvents.slice(-8)) {
      lines.push('')
      lines.push(`### ${formatDate(event.timestamp)} · round ${event.round ?? 'unknown'}`)
      lines.push('')
      lines.push('```json')
      lines.push(formatObjectPreview(event.rawUsage, 1_200))
      lines.push('```')
    }
  }

  lines.push('')
  lines.push(`## Diagnostic Trace`)
  if (diagnostics.length === 0) {
    lines.push('')
    lines.push(
      '_No diagnostics found. Run a new chat in development mode after this feature is enabled._'
    )
  } else {
    for (const event of diagnostics.slice(-80)) {
      const parts = [
        `- ${formatDate(event.timestamp)} \`${event.phase}\``,
        event.provider || event.model
          ? `(${[event.provider, event.model].filter(Boolean).join('/')})`
          : '',
        event.finishReason ? `finish=${event.finishReason}` : '',
        event.latency != null ? `latency=${Math.round(event.latency)}ms` : '',
        event.usage ? `usage=[${formatUsage(event.usage)}]` : '',
        event.tool
          ? `tool=${event.tool.name}:${event.tool.success === false ? 'error' : event.tool.success === true ? 'ok' : 'start'}`
          : '',
        event.error ? `error=${truncate(event.error, 180)}` : '',
      ].filter(Boolean)
      lines.push(parts.join(' '))
    }
  }

  return `${lines.join('\n')}\n`
}

if (!sessionReference) {
  usage()
  process.exit(2)
}

const { sessionId, userDataDir: referenceUserDataDir } = parseSessionReference(sessionReference)
const userDataDir = resolveUserDataDir(sessionId, referenceUserDataDir)
const indexPath = path.join(userDataDir, 'chat-index.json')
const sessionPath = path.join(userDataDir, 'chat-sessions', `${encodeURIComponent(sessionId)}.json`)
const diagnosticsPath = path.join(
  userDataDir,
  'debug-sessions',
  `${encodeURIComponent(sessionId)}.jsonl`
)

if (!existsSync(sessionPath)) {
  console.error(`Chat session not found: ${sessionId}`)
  console.error(`Expected: ${sessionPath}`)
  process.exit(1)
}

const index = await readJson(indexPath, { sessions: [], folders: [], version: 0 })
const session = await readJson(sessionPath)
const diagnostics = await readJsonl(diagnosticsPath)
const metadata = Array.isArray(index?.sessions)
  ? index.sessions.find((entry) => entry.id === sessionId) || null
  : null

const report = {
  sessionId,
  userDataDir,
  paths: { indexPath, sessionPath, diagnosticsPath },
  metadata,
  session,
  diagnostics,
}

if (outputJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(renderMarkdown(report))
}
