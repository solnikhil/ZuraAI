import { FileText, X, Copy, Check, Code2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import LazyMarkdown from '@/components/LazyMarkdown'
import { Button } from '@/components/ui/button'
import { writeTextToClipboard } from '@/utils/clipboard'
import type { Message } from '@/chat/types'

export type WorkspaceArtifact = {
  id: string
  messageId: string
  title: string
  kind: 'code' | 'markdown'
  language?: string
  content: string
  createdAt: number
}

const CODE_FENCE_PATTERN = /```([a-zA-Z0-9_+.-]*)\n([\s\S]*?)```/g
const MIN_MARKDOWN_ARTIFACT_LENGTH = 900

function titleFromMarkdown(content: string): string {
  const heading = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line))

  if (heading) {
    return heading.replace(/^#{1,3}\s+/, '').slice(0, 80)
  }

  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine ? firstLine.slice(0, 80) : 'Assistant artifact'
}

function languageLabel(language?: string): string {
  if (!language) return 'Code'
  const normalized = language.toLowerCase()
  if (normalized === 'tsx') return 'React TSX'
  if (normalized === 'ts') return 'TypeScript'
  if (normalized === 'js' || normalized === 'jsx') return 'JavaScript'
  if (normalized === 'py') return 'Python'
  if (normalized === 'sh' || normalized === 'bash') return 'Shell'
  return language.toUpperCase()
}

export function extractWorkspaceArtifacts(messages: Message[]): WorkspaceArtifact[] {
  const artifacts: WorkspaceArtifact[] = []

  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const content = message.content?.trim()
    if (!content) continue

    const codeMatches = Array.from(content.matchAll(CODE_FENCE_PATTERN))
    codeMatches.forEach((match, index) => {
      const language = match[1]?.trim() || undefined
      const code = match[2]?.trim()
      if (!code || code.length < 80) return

      artifacts.push({
        id: `${message.id}:code:${index}`,
        messageId: message.id,
        title: `${languageLabel(language)} snippet`,
        kind: 'code',
        language,
        content: code,
        createdAt: message.timestamp,
      })
    })

    const withoutCode = content.replace(CODE_FENCE_PATTERN, '').trim()
    const looksStructured =
      /^#{1,3}\s+/m.test(withoutCode) ||
      /\n\|.+\|\n\|[-:\s|]+\|/.test(withoutCode) ||
      /\n\d+\.\s+\S/.test(withoutCode)

    if (withoutCode.length >= MIN_MARKDOWN_ARTIFACT_LENGTH && looksStructured) {
      artifacts.push({
        id: `${message.id}:markdown`,
        messageId: message.id,
        title: titleFromMarkdown(withoutCode),
        kind: 'markdown',
        content: withoutCode,
        createdAt: message.timestamp,
      })
    }
  }

  return artifacts
}

interface WorkspaceArtifactsPanelProps {
  messages: Message[]
  onClose: () => void
}

export function WorkspaceArtifactsPanel({ messages, onClose }: WorkspaceArtifactsPanelProps) {
  const artifacts = useMemo(() => extractWorkspaceArtifacts(messages), [messages])
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null)
  const selectedArtifact =
    artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0]

  const copyArtifact = async (artifact: WorkspaceArtifact) => {
    const ok = await writeTextToClipboard(artifact.content)
    if (!ok) return
    setCopiedArtifactId(artifact.id)
    window.setTimeout(() => setCopiedArtifactId(null), 1600)
  }

  return (
    <aside className="workspace-artifacts-panel" aria-label="Workspace artifacts">
      <div className="workspace-artifacts-panel__header">
        <div>
          <div className="workspace-artifacts-panel__eyebrow">Workspace</div>
          <h2>Artifacts</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close artifacts panel"
        >
          <X size={16} />
        </Button>
      </div>

      {artifacts.length === 0 ? (
        <div className="workspace-artifacts-empty">
          <FileText size={18} />
          <p>Substantial code blocks, reports, and tables from this chat will appear here.</p>
        </div>
      ) : (
        <>
          <div className="workspace-artifacts-list" aria-label="Detected artifacts">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                className={
                  artifact.id === selectedArtifact.id
                    ? 'workspace-artifact-row workspace-artifact-row--active'
                    : 'workspace-artifact-row'
                }
                onClick={() => setSelectedArtifactId(artifact.id)}
              >
                <span className="workspace-artifact-row__icon">
                  {artifact.kind === 'code' ? <Code2 size={14} /> : <FileText size={14} />}
                </span>
                <span className="workspace-artifact-row__text">
                  <span>{artifact.title}</span>
                  <small>
                    {artifact.kind === 'code'
                      ? languageLabel(artifact.language)
                      : `${artifact.content.length.toLocaleString()} chars`}
                  </small>
                </span>
              </button>
            ))}
          </div>

          {selectedArtifact && (
            <section className="workspace-artifact-preview" aria-label="Artifact preview">
              <div className="workspace-artifact-preview__bar">
                <div>
                  <h3>{selectedArtifact.title}</h3>
                  <span>{selectedArtifact.kind === 'code' ? 'Code artifact' : 'Markdown artifact'}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyArtifact(selectedArtifact)}
                >
                  {copiedArtifactId === selectedArtifact.id ? <Check size={14} /> : <Copy size={14} />}
                  {copiedArtifactId === selectedArtifact.id ? 'Copied' : 'Copy'}
                </Button>
              </div>

              <div className="workspace-artifact-preview__body">
                {selectedArtifact.kind === 'markdown' ? (
                  <div className="markdown-content">
                    <LazyMarkdown content={selectedArtifact.content} />
                  </div>
                ) : (
                  <pre>
                    <code>{selectedArtifact.content}</code>
                  </pre>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </aside>
  )
}

export default WorkspaceArtifactsPanel
