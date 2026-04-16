import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Copy, ExternalLink, Link2, Scissors, Clipboard, RotateCcw, RotateCw, Code, CheckSquare } from 'lucide-react'

interface ContextInfo {
  hasSelection: boolean
  selectionText: string
  isEditable: boolean
  isContentEditable: boolean
  hasLink: boolean
  linkUrl: string
  linkText: string
  mouseX: number
  mouseY: number
  targetElement: HTMLElement | null
}

function isElementEditable(element: HTMLElement): boolean {
  if (element.tagName === 'INPUT') {
    const inputType = (element as HTMLInputElement).type?.toLowerCase()
    return !inputType || inputType === 'text' || inputType === 'search' || inputType === 'email' || inputType === 'password' || inputType === 'url' || inputType === 'tel' || inputType === 'number'
  }
  if (element.tagName === 'TEXTAREA') {
    return true
  }
  if (element.isContentEditable) {
    return true
  }
  const closestEditable = element.closest('[contenteditable="true"]')
  return closestEditable !== null
}

function findAncestorLink(element: HTMLElement): { hasLink: boolean; linkUrl: string; linkText: string } {
  let current: HTMLElement | null = element
  while (current) {
    if (current.tagName === 'A') {
      const anchor = current as HTMLAnchorElement
      return {
        hasLink: true,
        linkUrl: anchor.href || '',
        linkText: anchor.textContent || '',
      }
    }
    current = current.parentElement
  }
  return { hasLink: false, linkUrl: '', linkText: '' }
}

function isInputOrTextarea(el: HTMLElement | null): el is HTMLInputElement | HTMLTextAreaElement {
  return el !== null && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

function getNativeValueSetter(element: HTMLInputElement | HTMLTextAreaElement) {
  const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  return Object.getOwnPropertyDescriptor(proto, 'value')?.set
}

function getContextInfo(target: HTMLElement, mouseX: number, mouseY: number): ContextInfo {
  const selection = window.getSelection()
  const selectionText = selection?.toString().trim() || ''
  const linkInfo = findAncestorLink(target)
  const editable = isElementEditable(target)

  return {
    hasSelection: selectionText.length > 0,
    selectionText,
    isEditable: editable,
    isContentEditable: target.isContentEditable || target.closest('[contenteditable="true"]') !== null,
    hasLink: linkInfo.hasLink,
    linkUrl: linkInfo.linkUrl,
    linkText: linkInfo.linkText,
    mouseX,
    mouseY,
    targetElement: target,
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Clipboard API failed; fall back to execCommand-based copy.
  }

  // Fallback: use a temporary textarea that IS in the document to copy.
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    textarea.setAttribute('readonly', '')
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch {
    return false
  }
}

async function readTextFromClipboard(): Promise<string> {
  try {
    if (navigator.clipboard?.readText) {
      return await navigator.clipboard.readText()
    }
  } catch {
    // Fall through to the main-process clipboard bridge.
  }

  try {
    if (window.shell?.readClipboardText) {
      return await window.shell.readClipboardText()
    }
  } catch {
    // Return empty string when all clipboard paths fail.
  }

  return ''
}

async function openExternal(url: string): Promise<void> {
  if (window.shell?.openExternal) {
    await window.shell.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

const defaultContextInfo: ContextInfo = {
  hasSelection: false,
  selectionText: '',
  isEditable: false,
  isContentEditable: false,
  hasLink: false,
  linkUrl: '',
  linkText: '',
  mouseX: 0,
  mouseY: 0,
  targetElement: null,
}

export default function AppContextMenu({ children }: { children: React.ReactNode }) {
  const [contextInfo, setContextInfo] = useState<ContextInfo>(defaultContextInfo)
  const targetElementRef = useRef<HTMLElement | null>(null)
  const isDev = import.meta.env.DEV

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    const info = getContextInfo(event.target as HTMLElement, event.clientX, event.clientY)
    targetElementRef.current = info.targetElement
    flushSync(() => {
      setContextInfo(info)
    })
  }, [])

  const handleCopy = useCallback(() => {
    if (contextInfo.selectionText) {
      void copyTextToClipboard(contextInfo.selectionText)
    }
  }, [contextInfo.selectionText])

  const handleCut = useCallback(() => {
    if (!contextInfo.selectionText) return
    
    void copyTextToClipboard(contextInfo.selectionText)
    
    const target = targetElementRef.current
    if (isInputOrTextarea(target)) {
      target.focus()
      document.execCommand('cut')
    }
  }, [contextInfo.selectionText])

  const handlePaste = useCallback(async () => {
    const target = targetElementRef.current

    const contentEditableTarget =
      target?.isContentEditable === true
        ? target
        : ((target?.closest('[contenteditable="true"]') as HTMLElement | null) ?? null)

    if (!isInputOrTextarea(target) && !contentEditableTarget) return

    try {
      const text = await readTextFromClipboard()
      if (!text) return

      if (isInputOrTextarea(target)) {
        target.focus()

        const start = target.selectionStart || 0
        const end = target.selectionEnd || 0
        const currentValue = target.value
        const newValue = currentValue.slice(0, start) + text + currentValue.slice(end)

        const nativeValueSetter = getNativeValueSetter(target)
        if (nativeValueSetter) {
          nativeValueSetter.call(target, newValue)
        } else {
          target.value = newValue
        }

        target.dispatchEvent(new Event('input', { bubbles: true }))
        target.selectionStart = target.selectionEnd = start + text.length
      } else {
        contentEditableTarget?.focus()
        const inserted = document.execCommand('insertText', false, text)
        if (!inserted && contentEditableTarget) {
          contentEditableTarget.textContent = `${contentEditableTarget.textContent || ''}${text}`
          contentEditableTarget.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[AppContextMenu] Clipboard paste failed:', error)
      }
    }
  }, [])

  const handleSelectAll = useCallback(() => {
    const target = targetElementRef.current
    if (isInputOrTextarea(target)) {
      target.focus()
      target.select()
    } else {
      document.execCommand('selectAll')
    }
  }, [])

  const handleUndo = useCallback(() => {
    const target = targetElementRef.current
    if (isInputOrTextarea(target)) {
      target.focus()
    }
    document.execCommand('undo')
  }, [])

  const handleRedo = useCallback(() => {
    const target = targetElementRef.current
    if (isInputOrTextarea(target)) {
      target.focus()
    }
    document.execCommand('redo')
  }, [])

  const handleOpenLink = useCallback(() => {
    if (contextInfo.linkUrl) {
      void openExternal(contextInfo.linkUrl)
    }
  }, [contextInfo.linkUrl])

  const handleCopyLink = useCallback(() => {
    if (contextInfo.linkUrl) {
      void copyTextToClipboard(contextInfo.linkUrl)
    }
  }, [contextInfo.linkUrl])

  const handleInspectElement = useCallback(() => {
    if (window.devTools?.inspectElement) {
      window.devTools.inspectElement(contextInfo.mouseX, contextInfo.mouseY)
    }
  }, [contextInfo.mouseX, contextInfo.mouseY])

  const showEditActions = contextInfo.isEditable || contextInfo.isContentEditable
  const showLinkActions = contextInfo.hasLink
  const showSelectionActions = contextInfo.hasSelection

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="app-context-wrapper w-full h-full" onContextMenu={handleContextMenu}>
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {showLinkActions && (
          <>
            <ContextMenuItem onSelect={handleOpenLink}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Link in Browser
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleCopyLink}>
              <Link2 className="w-4 h-4 mr-2" />
              Copy Link Address
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {showEditActions ? (
          <>
            <ContextMenuItem onSelect={handleUndo}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Undo
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+Z</span>
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleRedo}>
              <RotateCw className="w-4 h-4 mr-2" />
              Redo
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+Y</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleCut} disabled={!showSelectionActions}>
              <Scissors className="w-4 h-4 mr-2" />
              Cut
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+X</span>
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleCopy} disabled={!showSelectionActions}>
              <Copy className="w-4 h-4 mr-2" />
              Copy
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+C</span>
            </ContextMenuItem>
            <ContextMenuItem onSelect={handlePaste}>
              <Clipboard className="w-4 h-4 mr-2" />
              Paste
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+V</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleSelectAll}>
              <CheckSquare className="w-4 h-4 mr-2" />
              Select All
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+A</span>
            </ContextMenuItem>
          </>
        ) : showSelectionActions ? (
          <>
            <ContextMenuItem onSelect={handleCopy}>
              <Copy className="w-4 h-4 mr-2" />
              Copy
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+C</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleSelectAll}>
              <CheckSquare className="w-4 h-4 mr-2" />
              Select All
            </ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem onSelect={handleSelectAll}>
            <CheckSquare className="w-4 h-4 mr-2" />
            Select All
          </ContextMenuItem>
        )}

        {isDev && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleInspectElement}>
              <Code className="w-4 h-4 mr-2" />
              Inspect Element
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
