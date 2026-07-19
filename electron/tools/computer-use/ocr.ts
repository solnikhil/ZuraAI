import { createHash, randomUUID } from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { nativeImage } from 'electron'

import { parseJsonOutput, runPowerShell } from '../native-common'

const MAX_OCR_ELEMENTS = 160
const MAX_OCR_DIMENSION = 2_500

export interface OcrVisualElement {
  element_id: string
  source: 'ocr'
  background_safe: false
  role: 'Text'
  text: string
  bounds: { x: number; y: number; width: number; height: number }
}

export type OcrExtraction =
  | { status: 'available'; elements: OcrVisualElement[] }
  | { status: 'unavailable'; error: string; elements: [] }

interface RawOcrLine {
  text?: unknown
  x?: unknown
  y?: unknown
  width?: unknown
  height?: unknown
}

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function ocrScript(imagePath: string): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
function Await-WinRt($Operation, [Type]$ResultType) {
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}
$file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync(${psString(imagePath)})) ([Windows.Storage.StorageFile])
$stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { throw 'Windows OCR is unavailable for the current language profile.' }
$result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$lines = @($result.Lines | Select-Object -First ${MAX_OCR_ELEMENTS} | ForEach-Object {
  $words = @($_.Words)
  if ($words.Count -eq 0) { return }
  $left = ($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
  $top = ($words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
  $right = ($words | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
  $bottom = ($words | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
  [pscustomobject]@{
    text = [string](($words | ForEach-Object { $_.Text }) -join ' ')
    x = [double]$left
    y = [double]$top
    width = [double]($right - $left)
    height = [double]($bottom - $top)
  }
})
@($lines) | ConvertTo-Json -Depth 4 -Compress
`
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function extractOcrElements(
  base64Png: string,
  width: number,
  height: number
): Promise<OcrExtraction> {
  let tempPath = ''
  try {
    if (!base64Png || width <= 0 || height <= 0) {
      return { status: 'unavailable', error: 'Screenshot image is empty.', elements: [] }
    }
    const image = nativeImage.createFromBuffer(Buffer.from(base64Png, 'base64'))
    if (image.isEmpty()) {
      return {
        status: 'unavailable',
        error: 'Screenshot image could not be decoded.',
        elements: [],
      }
    }
    const scale = Math.max(1, Math.min(2, MAX_OCR_DIMENSION / Math.max(width, height)))
    const ocrWidth = Math.max(1, Math.round(width * scale))
    const ocrHeight = Math.max(1, Math.round(height * scale))
    const ocrImage = scale > 1 ? image.resize({ width: ocrWidth, height: ocrHeight }) : image
    tempPath = path.join(os.tmpdir(), `zura-ocr-${randomUUID()}.png`)
    await fs.writeFile(tempPath, ocrImage.toPNG(), { flag: 'wx' })
    const { stdout } = await runPowerShell(ocrScript(tempPath), {
      timeoutMs: 10_000,
      maxOutputLength: 256_000,
    })
    const raw = parseJsonOutput<RawOcrLine[] | RawOcrLine>(stdout)
    const lines = Array.isArray(raw) ? raw : raw ? [raw] : []
    const elements = lines.flatMap((line): OcrVisualElement[] => {
      const text = typeof line.text === 'string' ? line.text.trim().slice(0, 240) : ''
      const x = finiteNumber(line.x)
      const y = finiteNumber(line.y)
      const lineWidth = finiteNumber(line.width)
      const lineHeight = finiteNumber(line.height)
      if (!text || x === null || y === null || lineWidth === null || lineHeight === null) return []
      const bounds = {
        x: Math.max(0, Math.round(x / scale)),
        y: Math.max(0, Math.round(y / scale)),
        width: Math.max(1, Math.round(lineWidth / scale)),
        height: Math.max(1, Math.round(lineHeight / scale)),
      }
      const fingerprint = `${text}|${bounds.x}|${bounds.y}|${bounds.width}|${bounds.height}`
      return [
        {
          element_id: `ocr_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 20)}`,
          source: 'ocr',
          background_safe: false,
          role: 'Text',
          text,
          bounds,
        },
      ]
    })
    return { status: 'available', elements }
  } catch (error) {
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'Windows OCR failed.',
      elements: [],
    }
  } finally {
    if (tempPath) await fs.unlink(tempPath).catch(() => undefined)
  }
}
