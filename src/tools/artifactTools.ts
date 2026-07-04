import type { ArtifactDocument, ArtifactKind } from '@/artifacts/artifactTypes'
import { isArtifactKind } from '@/artifacts/artifactStore'
import type { ToolDescriptor, ToolResult } from './types'

interface ArtifactToolContext {
  sessionId?: string
  messageId?: string
}

interface ArtifactToolHost {
  createArtifact: (
    sessionId: string,
    input: {
      title: string
      kind: ArtifactKind
      language?: string
      content: string
      sourceMessageId?: string
    }
  ) => ArtifactDocument | null
  updateArtifact: (
    sessionId: string,
    artifactId: string,
    input: {
      content: string
      title?: string
      language?: string
      sourceMessageId?: string
      changeSummary?: string
    }
  ) => ArtifactDocument | null
}

let host: ArtifactToolHost | null = null

export function registerArtifactToolHost(nextHost: ArtifactToolHost): () => void {
  host = nextHost
  return () => {
    if (host === nextHost) host = null
  }
}

export const artifactToolDefinitions: ToolDescriptor[] = [
  {
    name: 'artifact_create',
    description:
      'Create a durable chat artifact for substantial text, markdown, code, HTML, JSON, SVG, or Mermaid content. Use this when the user will likely edit, preview, reuse, or export the output.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short user-visible artifact title.' },
        kind: {
          type: 'string',
          description: 'Artifact content kind.',
          enum: ['text', 'markdown', 'code', 'html', 'json', 'svg', 'mermaid'],
        },
        language: {
          type: 'string',
          description: 'Optional programming or markup language for code artifacts.',
        },
        content: { type: 'string', description: 'Full artifact content.' },
      },
      required: ['title', 'kind', 'content'],
    },
    category: 'utility',
    origin: 'builtin-renderer',
  },
  {
    name: 'artifact_update',
    description:
      'Update an existing artifact by adding a new version. Use this for revisions instead of creating duplicate artifacts.',
    parameters: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', description: 'ID of the artifact to update.' },
        title: { type: 'string', description: 'Optional new artifact title.' },
        language: { type: 'string', description: 'Optional updated language label.' },
        content: {
          type: 'string',
          description: 'Full replacement content for the new artifact version.',
        },
        changeSummary: { type: 'string', description: 'Short summary of what changed.' },
      },
      required: ['artifactId', 'content'],
    },
    category: 'utility',
    origin: 'builtin-renderer',
  },
]

export function isArtifactToolName(
  toolName: string
): toolName is 'artifact_create' | 'artifact_update' {
  return toolName === 'artifact_create' || toolName === 'artifact_update'
}

export async function executeArtifactTool(
  toolName: string,
  args: Record<string, unknown>,
  context: ArtifactToolContext
): Promise<ToolResult> {
  const startTime = performance.now()
  if (!host) return fail('Artifact tools are unavailable in this view.', startTime)
  if (!context.sessionId)
    return fail('No active chat session is available for artifact storage.', startTime)

  if (toolName === 'artifact_create') {
    const title = typeof args.title === 'string' ? args.title : ''
    const content = typeof args.content === 'string' ? args.content : ''
    const kind = args.kind
    if (!title.trim()) return fail('Artifact title is required.', startTime)
    if (!content.trim()) return fail('Artifact content is required.', startTime)
    if (!isArtifactKind(kind)) return fail('Artifact kind is invalid.', startTime)

    const artifact = host.createArtifact(context.sessionId, {
      title,
      kind,
      language: typeof args.language === 'string' ? args.language : undefined,
      content,
      sourceMessageId: context.messageId,
    })
    if (!artifact) return fail('Artifact could not be created.', startTime)
    return success(artifact, startTime)
  }

  if (toolName === 'artifact_update') {
    const artifactId = typeof args.artifactId === 'string' ? args.artifactId : ''
    const content = typeof args.content === 'string' ? args.content : ''
    if (!artifactId.trim()) return fail('Artifact id is required.', startTime)
    if (!content.trim()) return fail('Artifact content is required.', startTime)
    const artifact = host.updateArtifact(context.sessionId, artifactId, {
      title: typeof args.title === 'string' ? args.title : undefined,
      language: typeof args.language === 'string' ? args.language : undefined,
      content,
      changeSummary: typeof args.changeSummary === 'string' ? args.changeSummary : undefined,
      sourceMessageId: context.messageId,
    })
    if (!artifact) return fail(`Artifact "${artifactId}" was not found.`, startTime)
    return success(artifact, startTime)
  }

  return fail(`Unknown artifact tool "${toolName}".`, startTime)
}

function success(artifact: ArtifactDocument, startTime: number): ToolResult {
  return {
    success: true,
    data: {
      artifactId: artifact.id,
      title: artifact.title,
      kind: artifact.kind,
      versionId: artifact.currentVersionId,
    },
    executionTime: Math.round(performance.now() - startTime),
    metadata: { origin: 'builtin-renderer' },
  }
}

function fail(error: string, startTime: number): ToolResult {
  return {
    success: false,
    error,
    executionTime: Math.round(performance.now() - startTime),
    metadata: { origin: 'builtin-renderer' },
  }
}
