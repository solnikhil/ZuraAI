/**
 * Persist large tool media (Computer Use / UI automation screenshots) as files
 * under userData so chat session JSON and the chat index stay text-sized.
 *
 * Media refs use the shape `tool-media:{sessionId}/{fileName}` and are resolved
 * only through this module — no renderer-supplied paths.
 */

import { app } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import { writeFileAtomic } from '../utils/atomicFile'

const MEDIA_DIR_NAME = 'tool-media'
const MAX_BASE64_BYTES = 8 * 1024 * 1024 // 8 MB raw base64 budget per image
const MEDIA_REF_PREFIX = 'tool-media:'

export interface ToolMediaRefPayload {
  mediaRef: string
  mediaKind: 'screenshot'
  width?: number
  height?: number
}

function getMediaRoot(): string {
  return path.join(app.getPath('userData'), MEDIA_DIR_NAME)
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'item'
}

function isBase64ImageString(value: string): boolean {
  if (value.length < 200) return false
  if (value.startsWith('data:image/')) return true
  // Raw base64 PNG/JPEG payloads from computer use tools
  return /^[A-Za-z0-9+/=\r\n]+$/.test(value.slice(0, 200)) && value.length > 500
}

function decodeBase64Payload(value: string): Buffer | null {
  try {
    const raw = value.startsWith('data:image/')
      ? value.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '')
      : value
    if (raw.length > MAX_BASE64_BYTES) return null
    const buffer = Buffer.from(raw, 'base64')
    if (buffer.length < 32) return null
    // PNG or JPEG magic
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8
    if (!isPng && !isJpeg) return null
    return buffer
  } catch {
    return null
  }
}

function mediaRefFor(sessionId: string, fileName: string): string {
  return `${MEDIA_REF_PREFIX}${safeSegment(sessionId)}/${fileName}`
}

function resolveMediaRefPath(mediaRef: string): string | null {
  if (!mediaRef.startsWith(MEDIA_REF_PREFIX)) return null
  const relative = mediaRef.slice(MEDIA_REF_PREFIX.length)
  const parts = relative.split(/[/\\]/).filter(Boolean)
  if (parts.length !== 2) return null
  const [sessionSeg, fileName] = parts
  if (!sessionSeg || !fileName || fileName.includes('..')) return null
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionSeg) || !/^[a-zA-Z0-9._-]+$/.test(fileName)) return null
  const root = getMediaRoot()
  const full = path.join(root, sessionSeg, fileName)
  const resolved = path.resolve(full)
  if (!resolved.startsWith(path.resolve(root) + path.sep) && resolved !== path.resolve(root)) {
    return null
  }
  return resolved
}

async function ensureSessionMediaDir(sessionId: string): Promise<string> {
  const dir = path.join(getMediaRoot(), safeSegment(sessionId))
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/**
 * Store a base64 (or data-URL) PNG/JPEG and return a media ref payload.
 */
export async function storeToolScreenshot(input: {
  sessionId: string
  toolCallId?: string
  base64: string
  width?: number
  height?: number
}): Promise<ToolMediaRefPayload | null> {
  const buffer = decodeBase64Payload(input.base64)
  if (!buffer) return null

  const sessionId = input.sessionId.trim()
  if (!sessionId) return null

  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
  const idPart = safeSegment(input.toolCallId || hash)
  const ext = buffer[0] === 0xff ? 'jpg' : 'png'
  const fileName = `${idPart}-${hash}.${ext}`
  const dir = await ensureSessionMediaDir(sessionId)
  const filePath = path.join(dir, fileName)

  if (!fsSync.existsSync(filePath)) {
    await writeFileAtomic(filePath, buffer)
  }

  return {
    mediaRef: mediaRefFor(sessionId, fileName),
    mediaKind: 'screenshot',
    width: input.width,
    height: input.height,
  }
}

/**
 * Load a stored media ref as a data URL for renderer display.
 */
export async function loadToolMediaDataUrl(mediaRef: string): Promise<string | null> {
  const filePath = resolveMediaRefPath(mediaRef)
  if (!filePath) return null
  try {
    const buffer = await fs.readFile(filePath)
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8
    const mime = isJpeg ? 'image/jpeg' : 'image/png'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function extractDimensions(data: Record<string, unknown>): { width?: number; height?: number } {
  const width =
    typeof data.screenWidth === 'number'
      ? data.screenWidth
      : typeof data.width === 'number'
        ? data.width
        : undefined
  const height =
    typeof data.screenHeight === 'number'
      ? data.screenHeight
      : typeof data.height === 'number'
        ? data.height
        : undefined
  return { width, height }
}

/**
 * Replace base64 image/screenshot fields in tool result data with media refs.
 * Returns the rewritten value and whether any write occurred.
 */
async function externalizeImageFields(
  sessionId: string,
  toolCallId: string | undefined,
  data: unknown
): Promise<unknown> {
  if (!isRecord(data)) return data

  let next: Record<string, unknown> = { ...data }

  // Nested ui_get_app_state shape: { screenshot: { image, screenWidth, ... } }
  if (isRecord(next.screenshot) && typeof next.screenshot.image === 'string') {
    const nested = { ...next.screenshot }
    if (isBase64ImageString(nested.image as string) && typeof nested.mediaRef !== 'string') {
      const dims = extractDimensions(nested)
      const stored = await storeToolScreenshot({
        sessionId,
        toolCallId,
        base64: nested.image as string,
        ...dims,
      })
      delete nested.image
      if (stored) {
        next = { ...next, screenshot: { ...nested, ...stored } }
      } else {
        next = {
          ...next,
          screenshot: { ...nested, mediaKind: 'screenshot', stripped: true },
        }
      }
    }
  }

  // computer_* / ui_* flat shapes: image or screenshot as base64 string
  for (const key of ['image', 'screenshot'] as const) {
    const value = next[key]
    if (typeof value !== 'string' || !isBase64ImageString(value)) continue
    if (typeof next.mediaRef === 'string') {
      delete next[key]
      continue
    }
    const dims = extractDimensions(next)
    const stored = await storeToolScreenshot({
      sessionId,
      toolCallId,
      base64: value,
      ...dims,
    })
    delete next[key]
    if (stored) {
      next = { ...next, ...stored }
    } else {
      next = { ...next, mediaKind: 'screenshot', stripped: true, ...dims }
    }
  }

  return next
}

/**
 * Walk session messages and externalize any embedded tool screenshots.
 * Returns a new message array; does not mutate the input.
 */
export async function sanitizeSessionMessagesForPersist(
  sessionId: string,
  messages: unknown[]
): Promise<unknown[]> {
  if (!Array.isArray(messages) || messages.length === 0) return messages

  const next: unknown[] = []
  for (const rawMessage of messages) {
    if (!isRecord(rawMessage)) {
      next.push(rawMessage)
      continue
    }

    const message: Record<string, unknown> = { ...rawMessage }

    let toolResults = message.toolResults
    if (Array.isArray(toolResults)) {
      const sanitizedResults = []
      for (const entry of toolResults) {
        if (!isRecord(entry) || !isRecord(entry.result)) {
          sanitizedResults.push(entry)
          continue
        }
        const toolCall = isRecord(entry.toolCall) ? entry.toolCall : undefined
        const toolCallId = typeof toolCall?.id === 'string' ? toolCall.id : undefined
        const result = entry.result
        if (result.success && result.data !== undefined) {
          const data = await externalizeImageFields(sessionId, toolCallId, result.data)
          sanitizedResults.push({
            ...entry,
            result: { ...result, data },
          })
        } else {
          sanitizedResults.push(entry)
        }
      }
      toolResults = sanitizedResults
    }

    // Also strip large inline message.image base64 if present (user screenshots / vision)
    let image = message.image
    let imageMediaRef = message.imageMediaRef
    if (typeof image === 'string' && isBase64ImageString(image) && image.length > 50_000) {
      const stored = await storeToolScreenshot({
        sessionId,
        toolCallId: typeof message.id === 'string' ? `msg-${message.id}` : undefined,
        base64: image,
      })
      if (stored) {
        image = undefined
        imageMediaRef = stored.mediaRef
      }
    }

    // Strip file attachment data URLs larger than 200KB — keep metadata only
    let files = message.files
    if (Array.isArray(files)) {
      files = files.map((file) => {
        if (!isRecord(file)) return file
        const data = file.data
        if (typeof data === 'string' && data.length > 200_000) {
          return {
            ...file,
            data: '',
            dataOmitted: true,
            size: typeof file.size === 'number' ? file.size : data.length,
          }
        }
        return file
      })
    }

    next.push({
      ...message,
      toolResults,
      files,
      image,
      imageMediaRef,
    })
  }

  return next
}

/**
 * Remove on-disk tool media for a deleted chat session.
 */
export async function deleteSessionToolMedia(sessionId: string): Promise<void> {
  const dir = path.join(getMediaRoot(), safeSegment(sessionId))
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
}

/** Test helper */
export function __getMediaRootForTests(): string {
  return getMediaRoot()
}
