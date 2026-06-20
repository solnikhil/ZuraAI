import { FileText, X, Copy, Check, Send } from 'lucide-react'
import { useMemo, useState } from 'react'

import LazyMarkdown from '@/components/LazyMarkdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { writeTextToClipboard } from '@/utils/clipboard'
import type { Message } from '@/chat/types'

export type WorkspaceArtifact = {
  id: string
  messageId: string
  title: string
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

export function extractWorkspaceArtifacts(messages: Message[]): WorkspaceArtifact[] {
  const artifacts: WorkspaceArtifact[] = []

  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const content = message.content?.trim()
    if (!content) continue

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
        content,
        createdAt: message.timestamp,
      })
    }
  }

  return artifacts
}

interface WorkspaceArtifactsPanelProps {
  messages: Message[]
  onClose: () => void
  onRequestEdit: (artifact: WorkspaceArtifact, instruction: string) => void | Promise<void>
  isRequestingEdit?: boolean
}

export function WorkspaceArtifactsPanel({
  messages,
  onClose,
  onRequestEdit,
  isRequestingEdit = false,
}: WorkspaceArtifactsPanelProps) {
  const artifacts = useMemo(() => extractWorkspaceArtifacts(messages), [messages])
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null)
  const [editInstruction, setEditInstruction] = useState('')
  const selectedArtifact =
    artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0]

  const copyArtifact = async (artifact: WorkspaceArtifact) => {
    const ok = await writeTextToClipboard(artifact.content)
    if (!ok) return
    setCopiedArtifactId(artifact.id)
    window.setTimeout(() => setCopiedArtifactId(null), 1600)
  }

  const requestEdit = async () => {
    const instruction = editInstruction.trim()
    if (!selectedArtifact || !instruction || isRequestingEdit) return
    await onRequestEdit(selectedArtifact, instruction)
    setEditInstruction('')
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
          <p>Markdown reports, notes, plans, and tables from this chat will appear here.</p>
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
                  <FileText size={14} />
                </span>
                <span className="workspace-artifact-row__text">
                  <span>{artifact.title}</span>
                  <small>{artifact.content.length.toLocaleString()} chars</small>
                </span>
              </button>
            ))}
          </div>

          {selectedArtifact && (
            <section className="workspace-artifact-preview" aria-label="Artifact preview">
              <div className="workspace-artifact-preview__bar">
                <div>
                  <h3>{selectedArtifact.title}</h3>
                  <span>Markdown artifact</span>
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

              <div className="workspace-artifact-edit">
                <Textarea
                  value={editInstruction}
                  onChange={(event) => setEditInstruction(event.target.value)}
                  placeholder="Ask for an edit, e.g. make this shorter, add a launch checklist, rewrite for users..."
                  rows={3}
                  disabled={isRequestingEdit}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      void requestEdit()
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void requestEdit()}
                  disabled={!editInstruction.trim() || isRequestingEdit}
                >
                  <Send size={14} />
                  Request edit
                </Button>
              </div>

              <div className="workspace-artifact-preview__body">
                <div className="markdown-content">
                  <LazyMarkdown content={selectedArtifact.content} />
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </aside>
  )
}

export default WorkspaceArtifactsPanel
