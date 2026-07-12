import { describe, expect, it } from 'vitest'
import { parseExtensionManifestText, parseExtensionViewText, validateExtensionManifest } from './validation'

const manifest = {
  schemaVersion: 1,
  id: 'com.example.notes',
  name: 'Notes',
  publisher: '@example',
  version: '1.0.0',
  description: 'Example notes extension',
  icon: 'assets/icon.svg',
  platforms: ['windows'],
  categories: ['Productivity'],
  commands: [{ id: 'notes', title: 'Notes', mode: 'view', entry: 'ui/notes.json', keywords: ['notes'] }],
  permissions: ['storage.local'],
}

describe('extension validation', () => {
  it('accepts a bounded versioned manifest', () => {
    expect(validateExtensionManifest(manifest)).toMatchObject({ errors: [], manifest })
  })

  it.each([
    [{ ...manifest, schemaVersion: 2 }, 'Unsupported schemaVersion'],
    [{ ...manifest, id: 'notes' }, 'reverse-domain'],
    [{ ...manifest, icon: '../secret.png' }, 'package-relative'],
    [{ ...manifest, commands: [{ ...manifest.commands[0], entry: 'ui/../../secret.json' }] }, 'invalid entry'],
    [{ ...manifest, commands: [manifest.commands[0], manifest.commands[0]] }, 'Duplicate command'],
    [{ ...manifest, networkDomains: ['https://example.com/path'] }, 'HTTPS hostnames'],
  ])('rejects unsafe manifest input', (candidate, message) => {
    expect(validateExtensionManifest(candidate).errors.join(' ')).toContain(message)
  })

  it('rejects oversized manifest input', () => {
    expect(parseExtensionManifestText(JSON.stringify({ ...manifest, description: 'x'.repeat(70_000) })).errors[0]).toContain('64 KB')
  })

  it('accepts trusted List, Detail, Form, navigation, and storage actions', () => {
    const document = {
      schemaVersion: 1,
      rootViewId: 'home',
      views: {
        home: { id: 'home', kind: 'list', title: 'Home', sections: [{ id: 'main', items: [{ id: 'one', title: 'One', actions: [{ id: 'open-form', title: 'Open', kind: 'navigate', viewId: 'form' }] }] }] },
        form: { id: 'form', kind: 'form', title: 'Form', fields: [{ id: 'name', type: 'text', title: 'Name' }], actions: [{ id: 'save', title: 'Save', kind: 'storage.set', key: 'name', valueFromField: 'name' }] },
      },
    }
    expect(parseExtensionViewText(JSON.stringify(document)).errors).toEqual([])
  })

  it('rejects arbitrary action kinds and unknown navigation targets', () => {
    const document = { schemaVersion: 1, rootViewId: 'home', views: { home: { id: 'home', kind: 'detail', title: 'Home', markdown: '', actions: [{ id: 'shell', title: 'Shell', kind: 'shell.exec' }, { id: 'missing', title: 'Missing', kind: 'navigate', viewId: 'nope' }] } } }
    const errors = parseExtensionViewText(JSON.stringify(document)).errors.join(' ')
    expect(errors).toContain('unsupported kind')
    expect(errors).toContain('unknown view')
  })

  it('rejects malformed forms before trusted rendering', () => {
    const document = { schemaVersion: 1, rootViewId: 'form', views: { form: { id: 'form', kind: 'form', title: 'Unsafe', fields: [{ id: 'name', type: 'select', title: 'Name', options: [] }, { id: 'name', type: 'text', title: 'Duplicate' }], actions: [{ id: 'save', title: 'Save', kind: 'storage.set', key: 'name', valueFromField: 'missing' }] } } }
    const errors = parseExtensionViewText(JSON.stringify(document)).errors.join(' ')
    expect(errors).toContain('requires 1 to 100 options')
    expect(errors).toContain('duplicate field')
    expect(errors).toContain('unknown field')
  })
})
