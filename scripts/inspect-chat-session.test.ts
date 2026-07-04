// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const scriptPath = path.resolve('scripts/inspect-chat-session.mjs')
let userDataDir = ''

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function runInspector(
  args: string[],
  env: Record<string, string | undefined> = { ZURA_USER_DATA_DIR: userDataDir }
) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  })
}

describe('inspect-chat-session script', () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(path.join(os.tmpdir(), 'zura-inspect-chat-'))
    await mkdir(path.join(userDataDir, 'chat-sessions'), { recursive: true })
    await mkdir(path.join(userDataDir, 'debug-sessions'), { recursive: true })

    await writeFile(
      path.join(userDataDir, 'chat-index.json'),
      JSON.stringify({
        version: 3,
        folders: [],
        sessions: [
          {
            id: 'session-1',
            title: 'Debug target',
            createdAt: 1,
            updatedAt: 2,
            pinned: false,
            folderId: null,
            tags: [],
            messageCount: 2,
          },
        ],
      })
    )

    await writeFile(
      path.join(userDataDir, 'chat-sessions', 'session-1.json'),
      JSON.stringify({
        id: 'session-1',
        title: 'Debug target',
        createdAt: 1,
        updatedAt: 2,
        messages: [
          { id: 'm1', role: 'user', content: 'hello', timestamp: 1 },
          {
            id: 'm2',
            role: 'assistant',
            content: 'hi',
            timestamp: 2,
            model: 'deepseek/deepseek-v4-pro',
            usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: 4 },
          },
        ],
      })
    )

    await writeFile(
      path.join(userDataDir, 'debug-sessions', 'session-1.jsonl'),
      [
        {
          sessionId: 'session-1',
          messageId: 'm2',
          timestamp: 2,
          phase: 'context-optimized',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          context: {
            model: 'deepseek-v4-pro',
            maxTokens: 100,
            reserveForResponse: 20,
            availableTokens: 80,
            originalTokens: 60,
            finalTokens: 60,
            wasTruncated: false,
            insertedSummary: false,
            originalMessageCount: 1,
            finalMessageCount: 2,
            keptMessageIds: ['m1'],
          },
        },
        {
          sessionId: 'session-1',
          messageId: 'm2',
          timestamp: 3,
          phase: 'request-shape',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          round: 0,
          roundType: 'tool-enabled',
          requestShape: {
            roleOrder: ['system', 'user'],
            textLengths: [10, 5],
            contentTypes: ['text', 'text'],
            partTypes: [[], []],
            hasReasoning: [false, false],
            hasThinking: [false, false],
            toolCount: 1,
            toolChoice: 'auto',
            cacheMarkerCount: 1,
          },
        },
        {
          sessionId: 'session-1',
          messageId: 'm2',
          timestamp: 4,
          phase: 'round-start',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          round: 0,
          roundType: 'tool-enabled',
        },
        {
          sessionId: 'session-1',
          messageId: 'm2',
          timestamp: 5,
          phase: 'usage',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          round: 0,
          usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: 4 },
          rawUsage: { prompt_tokens: 10, completion_tokens: 2, cache_hit_input_tokens: 4 },
        },
        {
          sessionId: 'session-1',
          messageId: 'm2',
          timestamp: 6,
          phase: 'finish',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: 4 },
        },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n') + '\n'
    )
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
  })

  it('prints a markdown report for an existing session', () => {
    const result = runInspector(['session-1'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('# ZuraAI Chat Session Diagnostics')
    expect(result.stdout).toContain('Debug target')
    expect(result.stdout).toContain('cacheHit=4')
    expect(result.stdout).toContain('## Context Optimization')
    expect(result.stdout).toContain('## Request Shape')
    expect(result.stdout).toContain('## Round Trace')
    expect(result.stdout).toContain('## Raw Usage Snapshots')
  })

  it('prints parseable json with --json', () => {
    const result = runInspector(['session-1', '--json'])

    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.session.id).toBe('session-1')
    expect(parsed.diagnostics).toHaveLength(5)
  })

  it('prints request-shape reports when partTypes entries are strings', async () => {
    await writeFile(
      path.join(userDataDir, 'debug-sessions', 'session-1.jsonl'),
      JSON.stringify({
        sessionId: 'session-1',
        messageId: 'm2',
        timestamp: 3,
        phase: 'request-shape',
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        round: 0,
        roundType: 'tool-enabled',
        requestShape: {
          roleOrder: ['system', 'user'],
          textLengths: [10, 5],
          contentTypes: ['text', 'text'],
          partTypes: ['[array:0]', '[array:0]'],
          hasReasoning: [false, false],
          hasThinking: [false, false],
          toolCount: 1,
          toolChoice: 'auto',
          cacheMarkerCount: 1,
        },
      }) + '\n'
    )

    const result = runInspector(['session-1'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('- Part types: [array:0] [array:0]')
  })

  it('resolves zura-chat debug references before environment overrides', () => {
    const reference = `zura-chat://session-1?userData=${encodeBase64Url(userDataDir)}`
    const result = runInspector([reference], {
      ZURA_USER_DATA_DIR: path.join(os.tmpdir(), 'wrong-zura-dir'),
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`- User data: \`${userDataDir}\``)
  })

  it('exits non-zero for a missing session', () => {
    const result = runInspector(['missing-session'])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Chat session not found')
  })
})
