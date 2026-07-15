#!/usr/bin/env node
'use strict'

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MAX_MESSAGE_LENGTH = 20_000

function readPackageVersion() {
  const packagePath = path.join(__dirname, '..', 'package.json')
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function base64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function getDefaultUserDataPath(
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir()
) {
  if (platform === 'darwin') {
    return path.posix.join(homeDir, 'Library', 'Application Support', 'ZuraAI')
  }

  if (platform === 'win32') {
    return path.win32.join(env.APPDATA || path.win32.join(homeDir, 'AppData', 'Roaming'), 'ZuraAI')
  }

  throw new Error('The ZuraAI launcher currently supports macOS and Windows.')
}

function createSessionId(now = Date.now(), random = Math.random()) {
  const randomPart = Math.floor(random * 0xffffffff)
    .toString(36)
    .padStart(6, '0')
  return `cli-${now.toString(36)}-${randomPart}`
}

function createOpenUrl() {
  return 'zuraai://open'
}

function createChatUrl(message, options = {}) {
  const trimmed = String(message || '').trim()
  if (!trimmed) {
    throw new Error('Missing message. Usage: zuraai chat "your message"')
  }

  const sessionId = options.sessionId || createSessionId()
  const userDataPath = options.userDataPath || getDefaultUserDataPath()
  const encodedMessage = base64Url(trimmed.slice(0, MAX_MESSAGE_LENGTH))
  const encodedUserData = base64Url(userDataPath)
  return `zura-chat://${encodeURIComponent(
    sessionId
  )}?userData=${encodedUserData}&createIfMissing=1&messageBase64=${encodedMessage}`
}

function getHelpText(version = readPackageVersion()) {
  return `ZuraAI CLI ${version}

Usage:
  zuraai                  Open the ZuraAI desktop app
  zuraai open             Open the ZuraAI desktop app
  zuraai chat <message>   Open ZuraAI and send a new chat message
  zuraai --version        Print the CLI version
  zuraai --help           Show this help
`
}

function openUrl(url, platform = process.platform) {
  if (platform === 'darwin') {
    return spawn('open', [url], { detached: true, stdio: 'ignore' })
  }

  if (platform === 'win32') {
    const escapedUrl = String(url).replace(/"/g, '\\"')
    return spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${escapedUrl}"`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
  }

  throw new Error('The ZuraAI launcher currently supports macOS and Windows.')
}

function parseArgs(argv) {
  const args = [...argv]
  const command = args.shift()

  if (!command || command === 'open') {
    return { type: 'open', url: createOpenUrl() }
  }

  if (command === 'chat') {
    return { type: 'chat', url: createChatUrl(args.join(' ')) }
  }

  if (command === '--version' || command === '-v') {
    return { type: 'print', output: `${readPackageVersion()}\n` }
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    return { type: 'print', output: getHelpText() }
  }

  return {
    type: 'error',
    message: `Unknown command: ${command}\n\n${getHelpText()}`,
  }
}

function run(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv)

  if (parsed.type === 'print') {
    process.stdout.write(parsed.output)
    return 0
  }

  if (parsed.type === 'error') {
    process.stderr.write(`${parsed.message.trimEnd()}\n`)
    return 1
  }

  const child = openUrl(parsed.url)
  child.unref()
  return 0
}

if (require.main === module) {
  try {
    process.exitCode = run()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  base64Url,
  createChatUrl,
  createOpenUrl,
  createSessionId,
  getDefaultUserDataPath,
  getHelpText,
  parseArgs,
}
