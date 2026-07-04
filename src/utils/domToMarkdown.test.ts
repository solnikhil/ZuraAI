import { describe, it, expect } from 'vitest'
import { serializeDomToMarkdown } from './domToMarkdown'

function fragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

describe('serializeDomToMarkdown', () => {
  it('converts headings back to # markers', () => {
    const frag = fragmentFromHtml('<h2>Bugs / Broken Behavior</h2>')
    expect(serializeDomToMarkdown(frag)).toBe('## Bugs / Broken Behavior')
  })

  it('preserves bold and italic emphasis', () => {
    const frag = fragmentFromHtml('<p><strong>Plan</strong> and <em>execution</em></p>')
    expect(serializeDomToMarkdown(frag)).toBe('**Plan** and *execution*')
  })

  it('serializes unordered lists with markers', () => {
    const frag = fragmentFromHtml(
      '<ul><li><strong>Plan</strong> hides messages</li><li>Attachments disappear</li></ul>'
    )
    expect(serializeDomToMarkdown(frag)).toBe('- **Plan** hides messages\n- Attachments disappear')
  })

  it('serializes ordered lists with numbers and start offset', () => {
    const frag = fragmentFromHtml('<ol start="3"><li>third</li><li>fourth</li></ol>')
    expect(serializeDomToMarkdown(frag)).toBe('3. third\n4. fourth')
  })

  it('handles nested lists with indentation', () => {
    const frag = fragmentFromHtml('<ul><li>parent<ul><li>child</li></ul></li></ul>')
    expect(serializeDomToMarkdown(frag)).toBe('- parent\n  - child')
  })

  it('serializes inline code and fenced code blocks', () => {
    const inline = fragmentFromHtml('<p>use <code>npm test</code></p>')
    expect(serializeDomToMarkdown(inline)).toBe('use `npm test`')

    const block = fragmentFromHtml('<pre><code class="language-ts">const a = 1\n</code></pre>')
    expect(serializeDomToMarkdown(block)).toBe('```ts\nconst a = 1\n```')
  })

  it('serializes links', () => {
    const frag = fragmentFromHtml('<p>See <a href="https://example.com">docs</a></p>')
    expect(serializeDomToMarkdown(frag)).toBe('See [docs](https://example.com)')
  })

  it('serializes blockquotes', () => {
    const frag = fragmentFromHtml('<blockquote><p>note here</p></blockquote>')
    expect(serializeDomToMarkdown(frag)).toBe('> note here')
  })

  it('serializes a full mixed section like the reported example', () => {
    const frag = fragmentFromHtml(
      '<h2>Bugs / Broken Behavior</h2><ul>' +
        '<li><strong>Plan → Execution mode switch hides model messages</strong> — you can only see the thinking block.</li>' +
        '<li><strong>Attachments disappear after adding</strong> — leaves blank space.</li>' +
        '</ul>'
    )
    expect(serializeDomToMarkdown(frag)).toBe(
      '## Bugs / Broken Behavior\n\n' +
        '- **Plan → Execution mode switch hides model messages** — you can only see the thinking block.\n' +
        '- **Attachments disappear after adding** — leaves blank space.'
    )
  })
})
