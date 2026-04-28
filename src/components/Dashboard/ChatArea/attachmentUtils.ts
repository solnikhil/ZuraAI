/**
 * Shared attachment helpers for the chat composer and send pipeline.
 */

import { getCapabilitiesFromModel } from '@/utils/modelUtils'
import type { ChatMessage, MessageContent } from '@/services/types'
import {
  DEFAULT_ATTACHMENT_MAX_SIZE_BYTES,
  getProviderModels,
  providerSupportsVisionUploads as providerSupportsVisionUploadsFromRegistry,
  type ProviderId,
} from '@/providers'
export type AttachmentProvider = ProviderId

export interface AttachedFile {
  id: string
  name: string
  type: 'image' | 'file'
  size: number
  data: string
  mimeType: string
}

interface ProcessFilesOptions {
  maxSizeBytes?: number
  onError?: (message: string) => void
}

interface ModelLike {
  code: string
  displayName: string
  supportsVision?: boolean
  supportsToolCall?: boolean
  supportsDeepThinking?: boolean
  supportsWebSearch?: boolean
  supportsImageGeneration?: boolean
  supportsVideoRecognition?: boolean
}

interface AttachmentSettingsLike {
  aiModel: string
  modelProvider: AttachmentProvider
  alibabaModels?: ModelLike[]
  configuredModels?: ModelLike[]
  fireworksModels?: ModelLike[]
  groqModels?: ModelLike[]
  ollamaModels?: ModelLike[]
  perplexityModels?: ModelLike[]
}

export type ComposerMessage = ChatMessage & {
  files?: AttachedFile[]
  images?: string[]
}

export interface ConversationMessage {
  role: string
  content: string
  files?: AttachedFile[]
}

function getFileFingerprint(file: Pick<AttachedFile, 'name' | 'size' | 'mimeType'>) {
  return `${file.name}::${file.size}::${file.mimeType}`
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function isImageAttachment(file: Pick<AttachedFile, 'type' | 'mimeType'>) {
  return file.type === 'image' || file.mimeType.startsWith('image/')
}

export function splitAttachedFiles(files: AttachedFile[]) {
  const images: AttachedFile[] = []
  const documents: AttachedFile[] = []

  for (const file of files) {
    if (isImageAttachment(file)) {
      images.push(file)
    } else {
      documents.push(file)
    }
  }

  return { images, documents }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function mergeAttachedFiles(existing: AttachedFile[], incoming: AttachedFile[]) {
  const merged = [...existing]
  const seen = new Set(existing.map((file) => getFileFingerprint(file)))

  for (const file of incoming) {
    const fingerprint = getFileFingerprint(file)
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    merged.push(file)
  }

  return merged
}

export async function processFiles(
  files: FileList | File[],
  options?: ProcessFilesOptions
): Promise<AttachedFile[]> {
  const fileArray = Array.from(files)
  const maxSize = options?.maxSizeBytes || DEFAULT_ATTACHMENT_MAX_SIZE_BYTES
  const processedFiles: AttachedFile[] = []

  for (const [index, file] of fileArray.entries()) {
    if (file.size > maxSize) {
      options?.onError?.(
        `File "${file.name}" is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`
      )
      continue
    }

    try {
      const data = await readFileAsDataUrl(file)
      processedFiles.push({
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        size: file.size,
        data,
        mimeType: file.type,
      })
    } catch (error) {
      console.error('Error reading file:', error)
      options?.onError?.(`Error reading file "${file.name}"`)
    }
  }

  return processedFiles
}

export function providerSupportsVisionUploads(provider: AttachmentProvider) {
  return providerSupportsVisionUploadsFromRegistry(provider)
}

function currentModelSupportsVision(settings: AttachmentSettingsLike) {
  const models = getProviderModels(settings, settings.modelProvider)
  const matchedModel =
    models.find((model) => model.code === settings.aiModel) || {
      code: settings.aiModel,
      displayName: settings.aiModel,
    }

  return getCapabilitiesFromModel(matchedModel).includes('vision')
}

export function canAnalyzeImageAttachments(settings: AttachmentSettingsLike) {
  return providerSupportsVisionUploads(settings.modelProvider) && currentModelSupportsVision(settings)
}

function stripDataUrlPrefix(dataUrl: string) {
  const parts = dataUrl.split(',', 2)
  return parts.length === 2 ? parts[1] : dataUrl
}

function buildOpenAIImageParts(content: string, files?: AttachedFile[]): MessageContent[] | null {
  const imageFiles = (files || []).filter(isImageAttachment)
  if (imageFiles.length === 0) return null

  const parts: MessageContent[] = []
  if (content.trim()) {
    parts.push({ type: 'text', text: content })
  }

  for (const file of imageFiles) {
    parts.push({
      type: 'image_url',
      image_url: { url: file.data },
    })
  }

  return parts
}

function toProviderMessage(message: ConversationMessage, provider: AttachmentProvider): ComposerMessage {
  const imageFiles = (message.files || []).filter(isImageAttachment)
  if (imageFiles.length === 0) {
    return { role: message.role, content: message.content }
  }

  if (provider === 'ollama') {
    return {
      role: message.role,
      content: message.content,
      images: imageFiles.map((file) => stripDataUrlPrefix(file.data)),
    }
  }

  const contentParts = buildOpenAIImageParts(message.content as string, imageFiles)
  if (!contentParts) {
    return { role: message.role, content: message.content }
  }

  return {
    role: message.role,
    content: contentParts,
  }
}

export function buildProviderMessages(
  messages: ConversationMessage[],
  provider: AttachmentProvider
): ComposerMessage[] {
  if (provider === 'ollama' && !providerSupportsVisionUploadsFromRegistry(provider)) {
    return messages.map((message) => ({ role: message.role, content: message.content }))
  }
  return messages.map((message) => toProviderMessage(message, provider))
}
