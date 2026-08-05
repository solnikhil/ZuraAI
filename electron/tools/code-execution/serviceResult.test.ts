// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async () => 'test-api-key'),
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
}))

type CompilerPayload = Record<string, unknown>

function respond(payload: CompilerPayload | string, status = 200): Response {
  return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function run(payload: CompilerPayload | string, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => respond(payload, status))
  )
  const { executeCode } = await import('./service')
  return executeCode({ code: 'print(1)', language: 'python', autoApprove: true })
}

describe('code execution result reporting', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports a clean run as successful', async () => {
    const result = await run({
      output: '1\n',
      error: '',
      status: 'success',
      exit_code: 0,
      signal: null,
      time: '0.03',
      total: '0.05',
      memory: '12',
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ stdout: '1\n', exitCode: 0 })
  })

  it('reports a compile error as a failed tool result', async () => {
    const result = await run({
      output: '',
      error: 'SyntaxError: invalid syntax',
      status: 'error',
      exit_code: 1,
      signal: null,
      time: '0.01',
      total: '0.02',
      memory: '10',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('SyntaxError: invalid syntax')
    // Diagnostics must survive so the model can act on them.
    expect(result.data).toMatchObject({
      stderr: 'SyntaxError: invalid syntax',
      exitCode: 1,
    })
  })

  it('reports a non-zero exit as failure even when status says success', async () => {
    const result = await run({
      output: 'partial output',
      error: 'Traceback (most recent call last): RuntimeError',
      status: 'success',
      exit_code: 3,
      signal: null,
      time: '0.04',
      total: '0.06',
      memory: '14',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('exited with status 3')
    expect(result.data).toMatchObject({
      stdout: 'partial output',
      stderr: 'Traceback (most recent call last): RuntimeError',
      exitCode: 3,
    })
  })

  it('reports termination by signal as failure', async () => {
    const result = await run({
      output: '',
      error: '',
      status: 'success',
      exit_code: 0,
      signal: 9,
      time: '5.00',
      total: '5.10',
      memory: '99',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('signal 9')
  })

  it('accepts a success with an absent exit code', async () => {
    const result = await run({
      output: 'done',
      error: '',
      status: 'success',
      exit_code: null,
      signal: null,
      time: '0.02',
      total: '0.03',
      memory: '11',
    })

    expect(result.success).toBe(true)
  })

  it('preserves warnings on stderr for an otherwise clean run', async () => {
    const result = await run({
      output: 'ok',
      error: 'DeprecationWarning: something',
      status: 'success',
      exit_code: 0,
      signal: null,
      time: '0.02',
      total: '0.03',
      memory: '11',
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ stderr: 'DeprecationWarning: something' })
  })

  it('rejects a malformed payload rather than reading it as an empty success', async () => {
    for (const payload of [
      'not json',
      JSON.stringify(['array', 'root']),
      JSON.stringify({ output: 5, error: '', status: 'success', exit_code: 0 }),
      JSON.stringify({ output: '', error: '', status: 'weird', exit_code: 0 }),
      JSON.stringify({ output: '', error: '', status: 'success', exit_code: 'zero' }),
    ]) {
      vi.resetModules()
      const result = await run(payload)
      expect(result.success, `payload should be rejected: ${payload}`).toBe(false)
      expect(result.error).toBeTruthy()
    }
  })

  it('reports a failure status with no message instead of claiming success', async () => {
    const result = await run({
      output: '',
      error: '',
      status: 'error',
      exit_code: null,
      signal: null,
      time: '0.01',
      total: '0.01',
      memory: '9',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('without a reported error message')
  })
})
