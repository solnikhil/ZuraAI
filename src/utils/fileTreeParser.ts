export type FileTreeNode = {
  id: string
  name: string
  description?: string
  type?: 'file' | 'folder'
  children?: FileTreeNode[]
}

function safeString(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function joinPath(parent: string, name: string): string {
  const clean = name.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!parent) return clean
  return `${parent}/${clean}`
}

function reserveUniqueId(baseId: string, usedIds: Map<string, number>): string {
  const seenCount = usedIds.get(baseId) ?? 0
  usedIds.set(baseId, seenCount + 1)
  return seenCount === 0 ? baseId : `${baseId}__${seenCount + 1}`
}

function normalizeChildren(input: unknown, parentId: string): FileTreeNode[] {
  if (!Array.isArray(input)) return []

  const usedIds = new Map<string, number>()

  return input
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null
      const name = safeString(raw.name || raw.label || raw.title)
      if (!name) return null
      const description = safeString(raw.description || raw.comment || raw.desc)
      const id = reserveUniqueId(safeString(raw.id) || joinPath(parentId, name), usedIds)
      const children = normalizeChildren(raw.children, id)
      const explicitType = raw.type === 'file' || raw.type === 'folder' ? raw.type : undefined
      const inferredType: FileTreeNode['type'] =
        explicitType || (children.length > 0 ? 'folder' : 'file')

      const node: FileTreeNode = {
        id,
        name,
        ...(description ? { description } : {}),
        type: inferredType,
        ...(children.length > 0 ? { children } : {}),
      }
      return node
    })
    .filter(Boolean) as FileTreeNode[]
}

export function parseZuraTreeJson(content: string): FileTreeNode[] {
  const trimmed = content.trim()
  if (!trimmed) return []

  const parsed = JSON.parse(trimmed)
  if (Array.isArray(parsed)) return normalizeChildren(parsed, '')
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray((parsed as Record<string, unknown>).nodes))
      return normalizeChildren((parsed as Record<string, unknown>).nodes, '')
    const name =
      safeString(
        (parsed as Record<string, unknown>).name ||
          (parsed as Record<string, unknown>).label ||
          (parsed as Record<string, unknown>).title
      ) || 'root'
    const rootId = safeString((parsed as Record<string, unknown>).id) || name
    const children = normalizeChildren((parsed as Record<string, unknown>).children, rootId)
    if (children.length > 0) {
      return [{ id: rootId, name, type: 'folder', children }]
    }
    return [{ id: rootId, name, type: 'file' }]
  }

  return []
}

type ParsedLine = { depth: number; name: string; description?: string; folderHint?: boolean }

function splitInlineComment(text: string): { name: string; description?: string } {
  // Support "name  # comment" while avoiding false positives.
  // Require at least 2 spaces before the # so "file#1" isn't treated as a comment.
  const m = text.match(/^(.*?)(?:\s{2,}#\s+)(.+)$/)
  if (!m) return { name: text.trim() }
  const name = (m[1] || '').trim()
  const description = (m[2] || '').trim()
  return { name, ...(description ? { description } : {}) }
}

function parseTreeLine(line: string): ParsedLine | null {
  const raw = line.replace(/\t/g, '    ')
  if (!raw.trim()) return null

  let depth = 0
  let rest = raw

  const isTreeStyle =
    rest.includes('├') ||
    rest.includes('└') ||
    rest.includes('│') ||
    rest.includes('─') ||
    rest.includes('—') ||
    /^\s*(\||\+)\s*[-─—]{1,}\s+/.test(rest) ||
    rest.trimStart().startsWith('|--') ||
    rest.trimStart().startsWith('+--')

  if (isTreeStyle) {
    // Typical `tree` output uses 4-char indentation blocks like:
    // "│   ", "    ", sometimes "|   "
    while (rest.startsWith('│   ') || rest.startsWith('    ') || rest.startsWith('|   ')) {
      depth += 1
      rest = rest.slice(4)
    }

    // Support both standard tree markers (──) and simple markers (─)
    const marker = rest.match(
      /^(├──\s*|└──\s*|├─\s*|└─\s*|\+--\s*|\|--\s*|\|[-─—]{1,}\s*|\+[-─—]{1,}\s*|├[-─—]{1,}\s*|└[-─—]{1,}\s*)/
    )?.[0]
    if (marker) {
      // Branch marker indicates one level under the current prefix.
      depth += 1
      rest = rest.slice(marker.length)
    }
  } else {
    // Space-indented trees (commonly 2-space indents)
    const leadingSpaces = rest.match(/^\s+/)?.[0] ?? ''
    if (leadingSpaces) {
      depth = Math.floor(leadingSpaces.length / 2)
      rest = rest.slice(depth * 2)
    }
  }

  const { name: rawName, description } = splitInlineComment(rest.trim())
  if (!rawName) return null
  const folderHint = rawName.endsWith('/')
  const name = rawName.replace(/\/+$/, '')
  if (!name) return null

  return {
    depth,
    name,
    ...(description ? { description } : {}),
    ...(folderHint ? { folderHint } : {}),
  }
}

export function parseTreeText(content: string): FileTreeNode[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0)

  if (lines.length === 0) return []

  let rootName: string | null = null
  let startIdx = 0
  const firstLine = lines[0]!
  const firstLineHasTreeMarkers = /[├└│┌┐┤┴┼]/.test(firstLine) || /^\s*[|+]\s*[-─—]/.test(firstLine)

  if (!firstLineHasTreeMarkers && firstLine.includes('/')) {
    // First line looks like a root folder name
    const { name, description: _description } = splitInlineComment(firstLine.trim())
    if (name && (name.endsWith('/') || !firstLineHasTreeMarkers)) {
      rootName = name.replace(/\/$/, '')
      startIdx = 1
    }
  }

  // Some outputs start with "." or a label line
  const parsedLines: ParsedLine[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]!
    const p = parseTreeLine(line)
    if (!p) continue
    if (p.depth === 0 && (p.name === '.' || p.name === './')) continue
    parsedLines.push(p)
  }
  if (parsedLines.length === 0) {
    // If we have a root name but no children, return just the root
    if (rootName) {
      return [{ id: rootName, name: rootName, type: 'folder' }]
    }
    return []
  }

  const root: FileTreeNode[] = []
  const rootUsedIds = new Map<string, number>()
  const stack: Array<{ depth: number; node: FileTreeNode; childIds: Map<string, number> }> = []

  for (let i = 0; i < parsedLines.length; i++) {
    const { depth, name, description, folderHint } = parsedLines[i]

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
      stack.pop()
    }

    const parentEntry = stack[stack.length - 1]
    const parent = parentEntry?.node
    const parentId = parent?.id || ''
    const id = reserveUniqueId(joinPath(parentId, name), parentEntry?.childIds || rootUsedIds)

    const next = parsedLines[i + 1]
    const hasChildren = !!next && next.depth > depth

    const node: FileTreeNode = {
      id,
      name,
      ...(description ? { description } : {}),
      type: hasChildren || folderHint ? 'folder' : 'file',
      ...(hasChildren ? { children: [] as FileTreeNode[] } : {}),
    }

    if (parent) {
      if (!parent.children) parent.children = []
      parent.children.push(node)
    } else {
      root.push(node)
    }

    if (hasChildren) stack.push({ depth, node, childIds: new Map<string, number>() })
  }

  // If we have a root name, wrap all nodes under it
  if (rootName && root.length > 0) {
    return [
      {
        id: rootName,
        name: rootName,
        type: 'folder',
        children: root,
      },
    ]
  }

  return root
}

export function parseFileTreeBlock(language: string | undefined, content: string): FileTreeNode[] {
  const lang = (language || '').toLowerCase()
  if (lang === 'zura-tree' || lang === 'zura_tree' || lang === 'filetree' || lang === 'file-tree') {
    return parseZuraTreeJson(content)
  }
  return parseTreeText(content)
}
