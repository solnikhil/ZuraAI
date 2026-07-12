'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createChatUrl, createOpenUrl, createExtensionProject, getDefaultUserDataPath, parseArgs, validateExtensionDirectory } = require('./zuraai.cjs')

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

test('joins chat command arguments into one message', () => {
  const parsed = parseArgs(['chat', 'hello', 'world'])

  assert.equal(parsed.type, 'chat')
  assert.match(parsed.url, /zura-chat:\/\//)
  assert.match(parsed.url, /messageBase64=aGVsbG8gd29ybGQ/)
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

test('creates and validates an agent-friendly extension package', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zura-cli-extension-')), 'sample')
  createExtensionProject(root, 'com.example.sample')
  const validation = validateExtensionDirectory(root)
  assert.equal(validation.ok, true)
  assert.equal(validation.manifest.id, 'com.example.sample')
  assert.equal(fs.existsSync(path.join(root, 'ui', 'home.json')), true)
})

test('rejects extension entries that escape the package', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zura-cli-extension-')), 'unsafe')
  createExtensionProject(root, 'com.example.unsafe')
  const manifestPath = path.join(root, 'zura-extension.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  manifest.commands[0].entry = 'ui/../../secret.json'
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  assert.equal(validateExtensionDirectory(root).ok, false)
})
