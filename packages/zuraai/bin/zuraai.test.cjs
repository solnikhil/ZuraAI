'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  createChatUrl,
  createOpenUrl,
  downloadVerifiedAsset,
  getDefaultUserDataPath,
  getExpectedChecksum,
  getInstalledAppPath,
  getReleaseAssetName,
  parseArgs,
  parseWindowsProtocolExecutable,
  selectReleaseAsset,
} = require('./zuraai.cjs')

test('creates the app-open protocol URL', () => {
  assert.equal(createOpenUrl(), 'zuraai://open')
  assert.deepEqual(parseArgs([]), { type: 'open', url: 'zuraai://open' })
  assert.deepEqual(parseArgs(['open']), { type: 'open', url: 'zuraai://open' })
})

test('creates chat deep links with local userData validation and createIfMissing', () => {
  const url = createChatUrl('hello from terminal', {
    sessionId: 'cli-test',
    userDataPath: 'C:\\Users\\Nikhil\\AppData\\Roaming\\ZuraAI',
  })

  assert.match(url, /^zura-chat:\/\/cli-test\?/)
  assert.match(url, /userData=/)
  assert.match(url, /createIfMissing=1/)
  assert.match(url, /messageBase64=aGVsbG8gZnJvbSB0ZXJtaW5hbA/)
})

// `parseArgs(['chat', ...])` resolves the default userData path, which only
// exists on the two platforms the launcher supports. Gate the assertion rather
// than letting the suite fail on Linux CI runners.
const LAUNCHER_SUPPORTED = process.platform === 'darwin' || process.platform === 'win32'

test(
  'joins chat command arguments into one message',
  { skip: LAUNCHER_SUPPORTED ? false : 'launcher supports macOS and Windows only' },
  () => {
    const parsed = parseArgs(['chat', 'hello', 'world'])

    assert.equal(parsed.type, 'chat')
    assert.match(parsed.url, /zura-chat:\/\//)
    assert.match(parsed.url, /messageBase64=aGVsbG8gd29ybGQ/)
  }
)

test('rejects unsupported platforms with the documented error', () => {
  assert.throws(
    () => getDefaultUserDataPath('linux', {}, '/home/nikhil'),
    /currently supports macOS and Windows/
  )
})

test('exposes an explicit desktop installation command', () => {
  assert.deepEqual(parseArgs(['install']), { type: 'install', url: 'zuraai://open' })
})

test('reports missing chat messages as parse errors', () => {
  assert.throws(() => parseArgs(['chat']), /Missing message/)
})

test('resolves default userData paths for macOS and Windows', () => {
  assert.equal(
    getDefaultUserDataPath('darwin', {}, '/Users/nikhil'),
    '/Users/nikhil/Library/Application Support/ZuraAI'
  )
  assert.equal(
    getDefaultUserDataPath(
      'win32',
      { APPDATA: 'C:\\Users\\Nikhil\\AppData\\Roaming' },
      'C:\\Users\\Nikhil'
    ),
    'C:\\Users\\Nikhil\\AppData\\Roaming\\ZuraAI'
  )
})

test('selects platform release assets and verifies published checksums', () => {
  const checksum = 'a'.repeat(64)
  const release = {
    tag_name: 'v0.0.8',
    draft: false,
    prerelease: false,
    body: `## SHA-256 Checksums\n\n${checksum}  ZuraAI-Setup-0.0.8.exe`,
    assets: [
      {
        name: 'ZuraAI-Setup-0.0.8.exe',
        browser_download_url:
          'https://github.com/solnikhil/ZuraAI/releases/download/v0.0.8/ZuraAI-Setup-0.0.8.exe',
      },
    ],
  }

  assert.equal(getReleaseAssetName('win32', '0.0.8'), 'ZuraAI-Setup-0.0.8.exe')
  assert.equal(getReleaseAssetName('darwin', '0.0.8'), 'ZuraAI-0.0.8-mac-universal.zip')
  assert.equal(getExpectedChecksum(release.body, 'ZuraAI-Setup-0.0.8.exe'), checksum)
  assert.deepEqual(selectReleaseAsset(release, 'win32', '0.0.8'), {
    name: 'ZuraAI-Setup-0.0.8.exe',
    url: release.assets[0].browser_download_url,
    sha256: checksum,
  })
})

test('rejects release assets without a published checksum', () => {
  assert.throws(
    () =>
      selectReleaseAsset(
        {
          tag_name: 'v0.0.8',
          draft: false,
          prerelease: false,
          body: '',
          assets: [
            {
              name: 'ZuraAI-Setup-0.0.8.exe',
              browser_download_url:
                'https://github.com/solnikhil/ZuraAI/releases/download/v0.0.8/ZuraAI-Setup-0.0.8.exe',
            },
          ],
        },
        'win32',
        '0.0.8'
      ),
    /does not publish a checksum/
  )
})

test('rejects release assets outside the fixed GitHub download path', () => {
  const name = 'ZuraAI-Setup-0.0.8.exe'
  assert.throws(
    () =>
      selectReleaseAsset(
        {
          tag_name: 'v0.0.8',
          draft: false,
          prerelease: false,
          body: `${'a'.repeat(64)}  ${name}`,
          assets: [{ name, browser_download_url: `https://example.com/${name}` }],
        },
        'win32',
        '0.0.8'
      ),
    /untrusted URL/
  )
})

test('streams verified release data to disk and removes checksum failures', async () => {
  const bytes = Buffer.from('verified installer bytes')
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zuraai-launcher-test-'))
  const validPath = path.join(tempDir, 'valid.exe')
  const invalidPath = path.join(tempDir, 'invalid.exe')
  const fetchImpl = async () => new globalThis.Response(bytes, { status: 200 })

  try {
    await downloadVerifiedAsset(
      { name: 'valid.exe', url: 'https://github.com/example', sha256 },
      validPath,
      fetchImpl
    )
    assert.deepEqual(fs.readFileSync(validPath), bytes)

    await assert.rejects(
      downloadVerifiedAsset(
        { name: 'invalid.exe', url: 'https://github.com/example', sha256: '0'.repeat(64) },
        invalidPath,
        fetchImpl
      ),
      /SHA-256 verification failed/
    )
    assert.equal(fs.existsSync(invalidPath), false)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('detects only packaged Windows protocol executables', () => {
  assert.equal(
    parseWindowsProtocolExecutable(
      '    (Default)    REG_SZ    "C:\\Program Files\\ZuraAI\\ZuraAI.exe" "%1"\n'
    ),
    'C:\\Program Files\\ZuraAI\\ZuraAI.exe'
  )

  assert.equal(
    getInstalledAppPath('win32', {
      queryRegistry: () =>
        '    (Default)    REG_SZ    "C:\\repo\\node_modules\\electron\\electron.exe" "C:\\repo" "%1"',
      existsSync: () => true,
    }),
    null
  )

  assert.equal(
    getInstalledAppPath('win32', {
      queryRegistry: () =>
        '    (Default)    REG_SZ    "C:\\Users\\Nikhil\\AppData\\Local\\Programs\\ZuraAI\\ZuraAI.exe" "%1"',
      existsSync: () => true,
    }),
    'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\ZuraAI\\ZuraAI.exe'
  )
})

test('detects system and per-user macOS installations', () => {
  assert.equal(
    getInstalledAppPath('darwin', {
      homeDir: '/Users/nikhil',
      existsSync: (candidate) => candidate === '/Users/nikhil/Applications/ZuraAI.app',
    }),
    '/Users/nikhil/Applications/ZuraAI.app'
  )
})
