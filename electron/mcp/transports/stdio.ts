import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'

import type { McpJsonRpcMessage } from '../../../src/mcp/types'

import { BaseMcpTransport, splitMcpMessageLines } from './base'

const DEFAULT_STARTUP_TIMEOUT_MS = 10000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2000
const DEFAULT_DIAGNOSTIC_BUFFER_SIZE = 8192

export interface StdioMcpTransportOptions {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  startupTimeoutMs?: number
  shutdownTimeoutMs?: number
  maxDiagnosticBufferSize?: number
}

export interface StdioMcpTransportDiagnostics {
  pid: number | null
  command: string
  args: string[]
  cwd?: string
  stdout: string
  stderr: string
  stdoutRemainder: string
  lastExitCode: number | null
  lastExitSignal: NodeJS.Signals | null
}

export class StdioMcpTransport extends BaseMcpTransport {
  private readonly command: string
  private readonly args: string[]
  private readonly cwd?: string
  private readonly env?: Record<string, string>
  private readonly startupTimeoutMs: number
  private readonly shutdownTimeoutMs: number
  private readonly maxDiagnosticBufferSize: number

  private child: ChildProcessWithoutNullStreams | null = null
  private stdoutRemainder = ''
  private stdoutDiagnostics = ''
  private stderrDiagnostics = ''
  private lastExitCode: number | null = null
  private lastExitSignal: NodeJS.Signals | null = null
  private expectedChildExit = false

  constructor(options: StdioMcpTransportOptions) {
    super('stdio')

    this.command = normalizeCommand(options.command)
    this.args = normalizeArgs(options.args)
    this.cwd = typeof options.cwd === 'string' && options.cwd.trim() ? options.cwd.trim() : undefined
    this.env = normalizeEnv(options.env)
    this.startupTimeoutMs = normalizeTimeout(options.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS)
    this.shutdownTimeoutMs = normalizeTimeout(options.shutdownTimeoutMs, DEFAULT_SHUTDOWN_TIMEOUT_MS)
    this.maxDiagnosticBufferSize = normalizeTimeout(
      options.maxDiagnosticBufferSize,
      DEFAULT_DIAGNOSTIC_BUFFER_SIZE
    )
  }

  getDiagnostics(): StdioMcpTransportDiagnostics {
    return {
      pid: this.child?.pid ?? null,
      command: this.command,
      args: [...this.args],
      cwd: this.cwd,
      stdout: this.stdoutDiagnostics,
      stderr: this.stderrDiagnostics,
      stdoutRemainder: this.stdoutRemainder,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
    }
  }

  protected override async performConnect(): Promise<void> {
    this.expectedChildExit = false
    this.stdoutRemainder = ''
    this.lastExitCode = null
    this.lastExitSignal = null

    const child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env ? { ...process.env, ...this.env } : process.env,
      shell: false,
      stdio: 'pipe',
      windowsHide: true,
    })

    this.child = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk: string | Buffer) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      this.stdoutDiagnostics = appendDiagnosticChunk(
        this.stdoutDiagnostics,
        text,
        this.maxDiagnosticBufferSize
      )

      const { messages, remainder } = splitMcpMessageLines(this.stdoutRemainder + text)
      this.stdoutRemainder = remainder
      for (const message of messages) {
        this.handleIncomingRawMessage(message)
      }
    })

    child.stderr.on('data', (chunk: string | Buffer) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      this.stderrDiagnostics = appendDiagnosticChunk(
        this.stderrDiagnostics,
        text,
        this.maxDiagnosticBufferSize
      )
    })

    child.on('error', (error) => {
      if (this.getState() !== 'connecting') {
        this.emitError(
          this.createError('internal', 'MCP stdio process error', error, {
            details: diagnosticsToRecord(this.getDiagnostics()),
          })
        )
      }
    })

    child.on('exit', (code, signal) => {
      this.lastExitCode = code
      this.lastExitSignal = signal

      if (this.expectedChildExit || this.getState() === 'connecting') {
        return
      }

      this.markDisconnectedFromRemote(
        new Error(
          `MCP stdio process exited unexpectedly (code: ${String(code)}, signal: ${String(signal)})`
        )
      )
    })

    child.on('close', () => {
      if (this.child === child) {
        this.child = null
      }
    })

    await this.withTimeout(
      () =>
        new Promise<void>((resolve, reject) => {
          const handleSpawn = () => {
            cleanup()
            resolve()
          }
          const handleError = (error: Error) => {
            cleanup()
            reject(error)
          }
          const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
            cleanup()
            reject(
              new Error(
                `MCP stdio process exited before startup completed (code: ${String(code)}, signal: ${String(signal)})`
              )
            )
          }
          const cleanup = () => {
            child.off('spawn', handleSpawn)
            child.off('error', handleError)
            child.off('exit', handleExit)
          }

          child.once('spawn', handleSpawn)
          child.once('error', handleError)
          child.once('exit', handleExit)
        }),
      {
        timeoutMs: this.startupTimeoutMs,
        operation: 'connect',
        message: 'Timed out waiting for MCP stdio process startup',
        details: {
          command: this.command,
          args: this.args,
        },
      }
    )
  }

  protected override async performDisconnect(): Promise<void> {
    const child = this.child
    if (!child) {
      return
    }

    this.expectedChildExit = true

    try {
      if (child.exitCode == null && !child.killed) {
        child.kill()
      }

      await waitForChildExit(child, this.shutdownTimeoutMs)
    } catch (error) {
      throw this.createError('disconnect', 'Failed to stop MCP stdio process cleanly', error, {
        timeoutMs: this.shutdownTimeoutMs,
        details: diagnosticsToRecord(this.getDiagnostics()),
      })
    } finally {
      this.child = null
    }
  }

  protected override async performSend(message: McpJsonRpcMessage): Promise<void> {
    const child = this.child
    if (!child) {
      throw new Error('Cannot send to MCP stdio process before it starts')
    }

    const payload = `${JSON.stringify(message)}\n`

    await new Promise<void>((resolve, reject) => {
      child.stdin.write(payload, 'utf8', (error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }
}

function normalizeCommand(command: string): string {
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('MCP stdio transport requires a non-empty command')
  }

  return command.trim()
}

function normalizeArgs(args: string[] | undefined): string[] {
  if (args == null) {
    return []
  }

  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new Error('MCP stdio transport args must be an array of strings')
  }

  return args.map((arg) => arg.trim())
}

function normalizeEnv(env: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!env) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(env)
      .filter(([key, value]) => key.trim() && typeof value === 'string')
      .map(([key, value]) => [key, value])
  )
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.round(value))
}

function appendDiagnosticChunk(current: string, chunk: string, maxLength: number): string {
  const next = current + chunk
  if (next.length <= maxLength) {
    return next
  }

  return next.slice(-maxLength)
}

function diagnosticsToRecord(diagnostics: StdioMcpTransportDiagnostics): Record<string, unknown> {
  return {
    pid: diagnostics.pid,
    command: diagnostics.command,
    args: diagnostics.args,
    cwd: diagnostics.cwd,
    stdout: diagnostics.stdout,
    stderr: diagnostics.stderr,
    stdoutRemainder: diagnostics.stdoutRemainder,
    lastExitCode: diagnostics.lastExitCode,
    lastExitSignal: diagnostics.lastExitSignal,
  }
}

async function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<void> {
  if (child.exitCode != null) {
    return
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null

  await Promise.race([
    new Promise<void>((resolve, reject) => {
      const handleClose = () => {
        cleanup()
        resolve()
      }
      const handleError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        child.off('close', handleClose)
        child.off('error', handleError)
      }

      child.once('close', handleClose)
      child.once('error', handleError)
    }),
    new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => {
        timeoutId = null
        reject(new Error('Timed out waiting for MCP stdio process to exit'))
      }, timeoutMs)
    }),
  ])
}
