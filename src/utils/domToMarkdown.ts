/**
 * domToMarkdown - Convert a rendered DOM fragment (as produced by react-markdown)
 * back into a best-effort Markdown string.
 *
 * This is used when the user selects rendered assistant content and copies it,
 * so the clipboard receives the "rough" Markdown source (e.g. `## Heading`,
 * `**bold**`, list markers, fenced code) instead of the flattened plain text
 * the browser would otherwise produce.
 *
 * It is intentionally a pragmatic serializer covering the elements
 * react-markdown + remark-gfm emit (headings, emphasis, code, links, lists,
 * blockquotes, tables, rules). It is not a full HTML→Markdown engine.
 */

const ELEMENT_NODE = 1
const TEXT_NODE = 3

interface SerializeContext {
  /** Nesting depth for lists, used for indentation. */
  listDepth: number
}

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === ELEMENT_NODE
}

function isText(node: Node): boolean {
  return node.nodeType === TEXT_NODE
}

function serializeChildren(node: Node, ctx: SerializeContext): string {
  let out = ''
  node.childNodes.forEach((child) => {
    out += serializeNode(child, ctx)
  })
  return out
}

function collapseInlineWhitespace(text: string): string {
  // Rendered text nodes carry layout whitespace/newlines; collapse runs of
  // whitespace to a single space for inline content.
  return text.replace(/\s+/g, ' ')
}

function getCodeLanguage(preOrCode: HTMLElement): string {
  const codeEl =
    preOrCode.tagName.toLowerCase() === 'code' ? preOrCode : preOrCode.querySelector('code')
  const className = codeEl?.getAttribute('class') ?? ''
  const match = className.match(/language-([\w+-]+)/)
  return match ? match[1] : ''
}

function serializeList(listEl: HTMLElement, ordered: boolean, ctx: SerializeContext): string {
  const indent = '  '.repeat(ctx.listDepth)
  const startAttr = listEl.getAttribute('start')
  let index = ordered ? Number.parseInt(startAttr ?? '1', 10) || 1 : 1

  const lines: string[] = []
  Array.from(listEl.children).forEach((child) => {
    if (!isElement(child) || child.tagName.toLowerCase() !== 'li') {
      return
    }

    const childCtx: SerializeContext = { listDepth: ctx.listDepth + 1 }

    // Split nested lists from the item's own inline content so they render on
    // their own indented lines.
    let inline = ''
    let nested = ''
    child.childNodes.forEach((liChild) => {
      if (isElement(liChild)) {
        const tag = liChild.tagName.toLowerCase()
        if (tag === 'ul' || tag === 'ol') {
          nested += serializeList(liChild, tag === 'ol', childCtx)
          return
        }
      }
      inline += serializeNode(liChild, childCtx)
    })

    const marker = ordered ? `${index}.` : '-'
    const inlineText = inline.replace(/\s+/g, ' ').trim()
    lines.push(`${indent}${marker} ${inlineText}`)
    if (nested.trim().length > 0) {
      lines.push(nested.replace(/^\n+/g, '').replace(/\n+$/g, ''))
    }
    index += 1
  })

  return `\n${lines.join('\n')}\n`
}

function serializeTable(tableEl: HTMLElement, ctx: SerializeContext): string {
  const rows = Array.from(tableEl.querySelectorAll('tr'))
  if (rows.length === 0) {
    return ''
  }

  const renderRow = (cells: Element[]): string =>
    `| ${cells
      .map((cell) => serializeChildren(cell, ctx).replace(/\s+/g, ' ').trim())
      .join(' | ')} |`

  const lines: string[] = []
  let headerRendered = false

  rows.forEach((row) => {
    const cells = Array.from(row.children).filter(
      (c) => c.tagName.toLowerCase() === 'th' || c.tagName.toLowerCase() === 'td'
    )
    if (cells.length === 0) {
      return
    }
    lines.push(renderRow(cells))
    if (!headerRendered) {
      lines.push(`| ${cells.map(() => '---').join(' | ')} |`)
      headerRendered = true
    }
  })

  return `\n${lines.join('\n')}\n\n`
}

function serializeNode(node: Node, ctx: SerializeContext): string {
  if (isText(node)) {
    return collapseInlineWhitespace(node.textContent ?? '')
  }

  if (!isElement(node)) {
    return ''
  }

  const el = node
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    case 'h1':
      return `\n# ${serializeChildren(el, ctx).trim()}\n\n`
    case 'h2':
      return `\n## ${serializeChildren(el, ctx).trim()}\n\n`
    case 'h3':
      return `\n### ${serializeChildren(el, ctx).trim()}\n\n`
    case 'h4':
      return `\n#### ${serializeChildren(el, ctx).trim()}\n\n`
    case 'h5':
      return `\n##### ${serializeChildren(el, ctx).trim()}\n\n`
    case 'h6':
      return `\n###### ${serializeChildren(el, ctx).trim()}\n\n`
    case 'strong':
    case 'b': {
      const inner = serializeChildren(el, ctx)
      return inner.trim().length > 0 ? `**${inner}**` : inner
    }
    case 'em':
    case 'i': {
      const inner = serializeChildren(el, ctx)
      return inner.trim().length > 0 ? `*${inner}*` : inner
    }
    case 'del':
    case 's':
    case 'strike': {
      const inner = serializeChildren(el, ctx)
      return inner.trim().length > 0 ? `~~${inner}~~` : inner
    }
    case 'code': {
      // Inline code only; fenced code is handled by the <pre> branch.
      if (el.closest('pre')) {
        return el.textContent ?? ''
      }
      return `\`${el.textContent ?? ''}\``
    }
    case 'pre': {
      const lang = getCodeLanguage(el)
      const codeEl = el.querySelector('code')
      const text = (codeEl?.textContent ?? el.textContent ?? '').replace(/\n$/, '')
      return `\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`
    }
    case 'a': {
      const href = el.getAttribute('href') ?? ''
      const text = serializeChildren(el, ctx)
      return href ? `[${text}](${href})` : text
    }
    case 'img': {
      const src = el.getAttribute('src') ?? ''
      const alt = el.getAttribute('alt') ?? ''
      return src ? `![${alt}](${src})` : ''
    }
    case 'blockquote': {
      const inner = serializeChildren(el, ctx).trim()
      const quoted = inner
        .split('\n')
        .map((line) => (line.length > 0 ? `> ${line}` : '>'))
        .join('\n')
      return `\n${quoted}\n\n`
    }
    case 'ul':
      return serializeList(el, false, ctx)
    case 'ol':
      return serializeList(el, true, ctx)
    case 'li':
      // Standalone <li> outside a recognized list wrapper.
      return `- ${serializeChildren(el, ctx).trim()}\n`
    case 'table':
      return serializeTable(el, ctx)
    case 'br':
      return '\n'
    case 'hr':
      return `\n---\n\n`
    case 'p':
      return `${serializeChildren(el, ctx).trim()}\n\n`
    case 'div':
    case 'span':
    default:
      return serializeChildren(el, ctx)
  }
}

/**
 * Convert a DOM node (typically a cloned selection fragment) into Markdown.
 */
export function serializeDomToMarkdown(node: Node): string {
  // A selection fragment (DocumentFragment) or document node is not an element
  // itself, so serialize its children directly.
  const raw = isElement(node)
    ? serializeNode(node, { listDepth: 0 })
    : serializeChildren(node, { listDepth: 0 })
  // Normalize excessive blank lines and trailing whitespace.
  return raw
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
