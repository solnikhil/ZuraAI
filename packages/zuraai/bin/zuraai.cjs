#!/usr/bin/env node
'use strict'

const { spawn, execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const MAX_MESSAGE_LENGTH = 20_000
const GITHUB_RELEASES_API = 'https://api.github.com/repos/solnikhil/ZuraAI/releases/tags'
const SUPPORTED_PLATFORMS = new Set(['darwin', 'win32'])

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
  zuraai                  Install ZuraAI when needed, then open it
  zuraai open             Install ZuraAI when needed, then open it
  zuraai install          Install the matching ZuraAI desktop release
  zuraai chat <message>   Install ZuraAI when needed, then open a new chat
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

  if (command === 'install') {
    return { type: 'install', url: createOpenUrl() }
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

function getReleaseAssetName(platform, version) {
  if (platform === 'win32') return `ZuraAI-Setup-${version}.exe`
  if (platform === 'darwin') return `ZuraAI-${version}-mac-universal.zip`
  throw new Error('The ZuraAI launcher currently supports macOS and Windows.')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getExpectedChecksum(releaseBody, assetName) {
  const match = String(releaseBody || '').match(
    new RegExp(`\\b([a-fA-F0-9]{64})\\s+${escapeRegExp(assetName)}(?:\\s|$)`)
  )
  if (!match) {
    throw new Error(
      `Release v${readPackageVersion()} does not publish a checksum for ${assetName}.`
    )
  }
  return match[1].toLowerCase()
}

function selectReleaseAsset(release, platform, version) {
  if (!release || release.tag_name !== `v${version}` || release.draft || release.prerelease) {
    throw new Error(`GitHub release v${version} is unavailable or is not a stable release.`)
  }

  const assetName = getReleaseAssetName(platform, version)
  const asset = Array.isArray(release.assets)
    ? release.assets.find((candidate) => candidate && candidate.name === assetName)
    : undefined
  if (!asset || typeof asset.browser_download_url !== 'string') {
    throw new Error(`GitHub release v${version} is missing ${assetName}.`)
  }

  const downloadUrl = new URL(asset.browser_download_url)
  const expectedPath = `/solnikhil/ZuraAI/releases/download/v${version}/${assetName}`
  if (
    downloadUrl.protocol !== 'https:' ||
    downloadUrl.hostname !== 'github.com' ||
    downloadUrl.pathname !== expectedPath
  ) {
    throw new Error(`GitHub release v${version} returned an untrusted URL for ${assetName}.`)
  }

  return {
    name: assetName,
    url: downloadUrl.toString(),
    sha256: getExpectedChecksum(release.body, assetName),
  }
}

function parseWindowsProtocolExecutable(output) {
  const match = String(output || '').match(/REG_(?:EXPAND_)?SZ\s+(.+)$/m)
  if (!match) return null
  const command = match[1].trim()
  const quoted = command.match(/^"([^"]+)"/)
  return quoted ? quoted[1] : command.split(/\s+/)[0]
}

function getInstalledAppPath(platform = process.platform, options = {}) {
  const existsSync = options.existsSync || fs.existsSync
  const homeDir = options.homeDir || os.homedir()

  if (platform === 'darwin') {
    const candidates = [
      '/Applications/ZuraAI.app',
      path.posix.join(homeDir, 'Applications', 'ZuraAI.app'),
    ]
    return candidates.find((candidate) => existsSync(candidate)) || null
  }

  if (platform === 'win32') {
    const query =
      options.queryRegistry ||
      ((key) =>
        execFileSync('reg.exe', ['query', key, '/ve'], {
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        }))
    for (const root of ['HKCU', 'HKLM']) {
      try {
        const executable = parseWindowsProtocolExecutable(
          query(`${root}\\Software\\Classes\\zuraai\\shell\\open\\command`)
        )
        if (
          executable &&
          path.win32.basename(executable).toLowerCase() === 'zuraai.exe' &&
          existsSync(executable)
        ) {
          return executable
        }
      } catch {
        // Try the next registry hive.
      }
    }
    return null
  }

  throw new Error('The ZuraAI launcher currently supports macOS and Windows.')
}

async function fetchRelease(version, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('ZuraAI installation requires Node.js 18 or newer.')
  }
  const response = await fetchImpl(`${GITHUB_RELEASES_API}/v${encodeURIComponent(version)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `zuraai-npm/${version}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) {
    throw new Error(`Unable to resolve GitHub release v${version} (HTTP ${response.status}).`)
  }
  return response.json()
}

async function downloadVerifiedAsset(asset, destination, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(asset.url, {
    headers: { 'User-Agent': `zuraai-npm/${readPackageVersion()}` },
    redirect: 'follow',
  })
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download ${asset.name} (HTTP ${response.status}).`)
  }

  const hash = crypto.createHash('sha256')
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(
    Readable.fromWeb(response.body),
    verifier,
    fs.createWriteStream(destination, { flags: 'wx' })
  )
  const actual = hash.digest('hex')
  if (actual !== asset.sha256) {
    fs.rmSync(destination, { force: true })
    throw new Error(`SHA-256 verification failed for ${asset.name}.`)
  }
}

function waitForChild(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal ?? 'an unknown error'}.`))
    })
  })
}

async function installDesktopApp(platform, assetPath, options = {}) {
  if (platform === 'win32') {
    await waitForChild(assetPath, [], { windowsHide: false })
    return
  }

  if (platform === 'darwin') {
    const homeDir = options.homeDir || os.homedir()
    const applicationsDir = path.posix.join(homeDir, 'Applications')
    const target = path.posix.join(applicationsDir, 'ZuraAI.app')
    if (fs.existsSync(target)) return
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zuraai-extract-'))
    try {
      fs.mkdirSync(applicationsDir, { recursive: true })
      await waitForChild('ditto', ['-x', '-k', assetPath, extractDir])
      const extractedApp = path.join(extractDir, 'ZuraAI.app')
      if (!fs.existsSync(extractedApp)) {
        throw new Error('The verified macOS archive did not contain ZuraAI.app.')
      }
      fs.cpSync(extractedApp, target, { recursive: true, errorOnExist: true })
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true })
    }
    return
  }

  throw new Error('The ZuraAI launcher currently supports macOS and Windows.')
}

async function ensureDesktopApp(options = {}) {
  const platform = options.platform || process.platform
  const version = options.version || readPackageVersion()
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error('The ZuraAI launcher currently supports macOS and Windows.')
  }

  const installed = getInstalledAppPath(platform, options)
  if (installed && !options.forceInstall) return installed

  process.stdout.write(`ZuraAI desktop ${version} is not installed.\n`)
  process.stdout.write('Downloading the verified installer from GitHub Releases...\n')
  const release = await fetchRelease(version, options.fetchImpl)
  const asset = selectReleaseAsset(release, platform, version)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zuraai-install-'))
  const assetPath = path.join(tempDir, asset.name)
  try {
    await downloadVerifiedAsset(asset, assetPath, options.fetchImpl)
    process.stdout.write(`Verified ${asset.name}. Starting installation...\n`)
    await installDesktopApp(platform, assetPath, options)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  const result = getInstalledAppPath(platform, options)
  if (!result)
    throw new Error('ZuraAI installation finished, but the installed app was not detected.')
  return result
}

async function run(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv)

  if (parsed.type === 'print') {
    process.stdout.write(parsed.output)
    return 0
  }

  if (parsed.type === 'error') {
    process.stderr.write(`${parsed.message.trimEnd()}\n`)
    return 1
  }

  await ensureDesktopApp({ ...options, forceInstall: parsed.type === 'install' })
  const child = openUrl(parsed.url, options.platform || process.platform)
  child.unref()
  return 0
}

if (require.main === module) {
  run()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}

module.exports = {
  base64Url,
  createChatUrl,
  createOpenUrl,
  createSessionId,
  downloadVerifiedAsset,
  getDefaultUserDataPath,
  getExpectedChecksum,
  getHelpText,
  getInstalledAppPath,
  getReleaseAssetName,
  parseArgs,
  parseWindowsProtocolExecutable,
  selectReleaseAsset,
}
