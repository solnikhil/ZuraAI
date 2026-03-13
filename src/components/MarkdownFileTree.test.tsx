import { describe, expect, it } from 'vitest'

import { sortNodesForDisplay } from './MarkdownFileTree'

describe('sortNodesForDisplay', () => {
  it('shows folders before files at every level without mutating input', () => {
    const input = [
      { id: 'env', name: '.env', type: 'file' as const },
      {
        id: 'src',
        name: 'src',
        type: 'folder' as const,
        children: [
          { id: 'src/bot', name: 'bot.py', type: 'file' as const },
          { id: 'src/cogs', name: 'cogs', type: 'folder' as const, children: [] },
          { id: 'src/events', name: 'events', type: 'folder' as const, children: [] },
        ],
      },
      { id: 'readme', name: 'README.md', type: 'file' as const },
      { id: 'config', name: 'config', type: 'folder' as const, children: [] },
    ]

    const sorted = sortNodesForDisplay(input)

    expect(sorted.map((node) => node.name)).toEqual(['src', 'config', '.env', 'README.md'])
    expect(sorted[0]!.children?.map((node) => node.name)).toEqual(['cogs', 'events', 'bot.py'])

    expect(input.map((node) => node.name)).toEqual(['.env', 'src', 'README.md', 'config'])
    expect(input[1]!.children?.map((node) => node.name)).toEqual(['bot.py', 'cogs', 'events'])
  })
})
