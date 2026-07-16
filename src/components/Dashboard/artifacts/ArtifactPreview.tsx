import LazyMarkdown from '@/components/LazyMarkdown'
import MermaidDiagram from '@/components/MermaidDiagram'
import type { ArtifactKind } from '@/artifacts/artifactTypes'

interface ArtifactPreviewProps {
  kind: ArtifactKind
  language?: string
  content: string
  mode: 'preview' | 'source'
}

function SourceView({ content, language }: { content: string; language?: string }) {
  return (
    <div className="artifact-preview__source-shell">
      <div className="artifact-preview__source-label">{language || 'plain text'}</div>
      <pre className="artifact-preview__source">
        <code>{content}</code>
      </pre>
    </div>
  )
}

function sandboxDocument(content: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'"><style>html,body{min-height:100%;margin:0}body{box-sizing:border-box;padding:24px;font:14px/1.55 ui-sans-serif,system-ui,sans-serif;color:#24211f;background:#fbfaf8}*{box-sizing:border-box}img,svg{max-width:100%;height:auto}</style></head><body>${content}</body></html>`
}

export default function ArtifactPreview({ kind, language, content, mode }: ArtifactPreviewProps) {
  if (mode === 'source') return <SourceView content={content} language={language || kind} />

  if (kind === 'markdown') {
    return <LazyMarkdown content={content} className="markdown-body artifact-preview__markdown" />
  }

  if (kind === 'mermaid') return <MermaidDiagram code={content} />

  if (kind === 'html' || kind === 'svg') {
    return (
      <iframe
        className="artifact-preview__frame"
        title={`${kind.toUpperCase()} artifact preview`}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={sandboxDocument(content)}
      />
    )
  }

  if (kind === 'json') {
    let formatted = content
    let invalid = false
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2)
    } catch {
      invalid = true
    }
    return (
      <div>
        {invalid && <div className="artifact-preview__notice">This JSON is not valid yet.</div>}
        <SourceView content={formatted} language="json" />
      </div>
    )
  }

  if (kind === 'text') return <div className="artifact-preview__text">{content}</div>

  return <SourceView content={content} language={language || 'code'} />
}
