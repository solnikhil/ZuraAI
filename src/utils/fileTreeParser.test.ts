import { describe, expect, it } from 'vitest'

import { parseTreeText, parseZuraTreeJson } from './fileTreeParser'

describe('fileTreeParser', () => {
  it('parses ASCII tree output with branch characters', () => {
    const input = `
src
├── components
│   ├── ui
│   │   └── button.tsx
│   └── App.tsx
└── package.json
`.trim()

    const nodes = parseTreeText(input)
    expect(nodes.map((n) => n.name)).toEqual(['src'])
    expect(nodes[0]!.children?.map((n) => n.name)).toEqual(['components', 'package.json'])
  })

  it('extracts inline comments using #', () => {
    const input = `
root/
└── src/
    └── bot.js  # Main bot logic
`.trim()

    const nodes = parseTreeText(input)
    expect(nodes[0]!.name).toBe('root')
    expect(nodes[0]!.type).toBe('folder')
    expect(nodes[0]!.children?.[0]!.name).toBe('src')
    expect(nodes[0]!.children?.[0]!.children?.[0]!.name).toBe('bot.js')
    expect(nodes[0]!.children?.[0]!.children?.[0]!.description).toBe('Main bot logic')
  })

  it('parses pipe + box-drawing dash style (|──)', () => {
    const input = `
discord-bot/
|── src/
|   |── bot.js
|   |── commands/
|   |   |── command1.js
|   |   └── command2.js
|   └── events/
|       |── message.js
|       └── ready.js
└── package.json
`.trim()

    const nodes = parseTreeText(input)
    expect(nodes[0]!.name).toBe('discord-bot')
    expect(nodes[0]!.type).toBe('folder')
    expect(nodes[0]!.children?.[0]!.name).toBe('src')
    expect(nodes[0]!.children?.[1]!.name).toBe('package.json')
  })

  it('parses 2-space-indented trees', () => {
    const input = `
root
  folder
    file.txt
  other.txt
`.trim()

    const nodes = parseTreeText(input)
    expect(nodes[0]!.name).toBe('root')
    expect(nodes[0]!.children?.[0]!.name).toBe('folder')
    expect(nodes[0]!.children?.[0]!.children?.[0]!.name).toBe('file.txt')
  })

  it('parses zura-tree JSON', () => {
    const input = JSON.stringify([
      { name: 'src', children: [{ name: 'main.tsx' }] },
      { name: 'package.json' },
    ])

    const nodes = parseZuraTreeJson(input)
    expect(nodes.map((n) => n.name)).toEqual(['src', 'package.json'])
    expect(nodes[0]!.children?.[0]!.name).toBe('main.tsx')
  })
})
