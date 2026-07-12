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
  zuraai extension create <folder> [id]  Create a safe manifest extension
  zuraai extension validate [folder]     Validate an extension package
  zuraai --version        Print the CLI version
  zuraai --help           Show this help
`
}

function validateExtensionDirectory(directory) {
  const root = path.resolve(directory || process.cwd())
  const manifestPath = path.join(root, 'zura-extension.json')
  const errors = []
  let manifest
  try {
    const stat = fs.statSync(manifestPath)
    if (stat.size > 64 * 1024) errors.push('Manifest exceeds 64 KB.')
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    return { ok: false, root, errors: [`Unable to read zura-extension.json: ${error.message}`] }
  }
  if (manifest.schemaVersion !== 1) errors.push('Unsupported schemaVersion.')
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(manifest.id || '')) errors.push('id must be a reverse-domain identifier.')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version || '')) errors.push('version must use semantic versioning.')
  if (!Array.isArray(manifest.commands) || manifest.commands.length < 1 || manifest.commands.length > 32) errors.push('commands must contain between 1 and 32 commands.')
  for (const command of manifest.commands || []) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(command.id || '')) errors.push('Command id is invalid.')
    if (!/^(?:ui\/[a-zA-Z0-9._/-]+\.json|host:[a-z0-9-]+)$/.test(command.entry || '') || String(command.entry).includes('..')) errors.push(`Command ${command.id || '?'} has an invalid entry.`)
    if (String(command.entry).startsWith('ui/')) {
      const entry = path.resolve(root, command.entry)
      const prefix = `${root}${path.sep}`
      if (!entry.startsWith(prefix) || !fs.existsSync(entry)) errors.push(`Command ${command.id || '?'} entry does not exist inside the package.`)
    }
  }
  return { ok: errors.length === 0, root, manifest, errors }
}

function createExtensionProject(directory, requestedId) {
  if (!directory) throw new Error('Missing folder. Usage: zuraai extension create <folder> [id]')
  const root = path.resolve(directory)
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) throw new Error('Target folder must be empty.')
  const folderName = path.basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const id = requestedId || `com.example.${folderName}`
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(id)) throw new Error('Extension id must be a reverse-domain identifier.')
  fs.mkdirSync(path.join(root, 'ui'), { recursive: true })
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, 'zura-extension.json'), `${JSON.stringify({ schemaVersion: 1, id, name: path.basename(root), publisher: '@developer', version: '0.1.0', description: 'A trusted ZuraAI Command Center extension.', icon: 'assets/icon.svg', platforms: ['windows'], categories: ['Productivity'], commands: [{ id: 'home', title: path.basename(root), mode: 'view', entry: 'ui/home.json', keywords: [folderName] }], permissions: [], privacy: { dataLeavesDevice: false }, changelog: 'CHANGELOG.md' }, null, 2)}\n`)
  fs.writeFileSync(path.join(root, 'ui', 'home.json'), `${JSON.stringify({ schemaVersion: 1, rootViewId: 'home', views: { home: { id: 'home', kind: 'detail', title: path.basename(root), markdown: '# Ready to build\n\nThis view is rendered by ZuraAI.' } } }, null, 2)}\n`)
  fs.writeFileSync(path.join(root, 'assets', 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#9b6271"/><path d="M20 32h24M32 20v24" stroke="#fff4f1" stroke-width="5" stroke-linecap="round"/></svg>\n')
  fs.writeFileSync(path.join(root, 'README.md'), `# ${path.basename(root)}\n\nCreated with \`zuraai extension create\`.\n`)
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '## [Initial Development] - Unreleased\n')
  return root
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

  if (command === 'extension') {
    const subcommand = args.shift()
    if (subcommand === 'create') return { type: 'extension-create', directory: args[0], id: args[1] }
    if (subcommand === 'validate' || subcommand === 'build' || subcommand === 'test') return { type: 'extension-validate', directory: args[0] }
    return { type: 'error', message: `Unknown extension command: ${subcommand || '(missing)'}\n\n${getHelpText()}` }
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

  if (parsed.type === 'extension-create') {
    const root = createExtensionProject(parsed.directory, parsed.id)
    process.stdout.write(`Created Zura extension at ${root}\nRun: zuraai extension validate "${root}"\n`)
    return 0
  }

  if (parsed.type === 'extension-validate') {
    const result = validateExtensionDirectory(parsed.directory)
    if (!result.ok) {
      result.errors.forEach((error) => process.stderr.write(`- ${error}\n`))
      return 1
    }
    process.stdout.write(`Valid Zura extension: ${result.manifest.id} v${result.manifest.version}\n`)
    return 0
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
  createExtensionProject,
  validateExtensionDirectory,
}
