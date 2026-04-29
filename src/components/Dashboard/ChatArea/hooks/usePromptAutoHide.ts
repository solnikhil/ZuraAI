/**
 * usePromptAutoHide - Hook to auto-hide the chat prompt area after inactivity
 *
 * Slides the prompt area down after a configurable timeout and brings it back
 * on hover over a trigger zone or any keyboard input.
 *
 * Suppressed when:
 * - AI is streaming
 * - Textarea has focus
 * - Input contains text
 * - Files are attached
 *
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const OPEN_BLOCKING_SURFACE_SELECTOR = [
  '[data-slot="popover-content"][data-state="open"]',
  '[data-slot="dropdown-menu-content"][data-state="open"]',
  '[data-slot="dropdown-menu-sub-content"][data-state="open"]',
  '[data-slot="select-content"][data-state="open"]',
  '[data-slot="context-menu-content"][data-state="open"]',
  '[data-slot="context-menu-sub-content"][data-state="open"]',
  '[data-slot="dialog-content"][data-state="open"]',
  '[data-slot="alert-dialog-content"][data-state="open"]',
  '[data-slot="sheet-content"][data-state="open"]',
].join(', ')

function getOpenBlockingSurface(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>(OPEN_BLOCKING_SURFACE_SELECTOR)
}

export interface UsePromptAutoHideOptions {
  /** Whether the feature is enabled (from settings) */
  enabled: boolean
  /** AI is currently streaming a response */
  isLoading: boolean
  /** Textarea currently has keyboard focus */
  isFocused: boolean
  /** Input field contains text */
  hasInput: boolean
  /** Files are attached to the prompt */
  hasFiles: boolean
  /** Inactivity timeout in seconds (default 120) */
  timeoutSeconds: number
  /** Ref to the textarea element for keyboard reactivation focus */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
}

export interface UsePromptAutoHideReturn {
  /** Whether the prompt is currently hidden */
  isPromptHidden: boolean
  /** Manually reveal the prompt (e.g. from hover trigger) */
  showPrompt: () => void
  /** Reset the inactivity timer (call on any user activity in the prompt area) */
  resetTimer: () => void
  /** Props to spread onto the hover trigger zone */
  triggerZoneProps: {
    onMouseEnter: () => void
    onPointerDown: () => void
    onClick: () => void
  }
}

/**
 * Non-printable keys that should NOT reactivate the prompt
 */
const IGNORED_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Escape',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  'Delete',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'ContextMenu',
  'PrintScreen',
  'Pause',
])

export function usePromptAutoHide({
  enabled,
  isLoading,
  isFocused,
  hasInput,
  hasFiles,
  timeoutSeconds,
  textareaRef,
}: UsePromptAutoHideOptions): UsePromptAutoHideReturn {
  const [isPromptHidden, setIsPromptHidden] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFocusRestoreRef = useRef(false)

  // Track suppress conditions in refs so the timer callback always sees current values
  const suppressRef = useRef(false)
  suppressRef.current = isLoading || isFocused || hasInput || hasFiles

  const timeoutMs = Math.max(30, timeoutSeconds) * 1000

  // -- Timer management --

  const clearHideTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startHideTimer = useCallback(() => {
    clearHideTimer()

    const scheduleHideCheck = () => {
      timerRef.current = setTimeout(() => {
        const openSurface = getOpenBlockingSurface()
        if (openSurface) {
          const activeElement = document.activeElement
          if (
            activeElement instanceof HTMLElement &&
            openSurface.contains(activeElement) &&
            Boolean(textareaRef?.current)
          ) {
            pendingFocusRestoreRef.current = true
          }

          scheduleHideCheck()
          return
        }

        if (pendingFocusRestoreRef.current) {
          pendingFocusRestoreRef.current = false
          requestAnimationFrame(() => {
            textareaRef?.current?.focus()
          })
          scheduleHideCheck()
          return
        }

        if (suppressRef.current) {
          scheduleHideCheck()
          return
        }

        setIsPromptHidden(true)
        timerRef.current = null
      }, timeoutMs)
    }

    scheduleHideCheck()
  }, [clearHideTimer, timeoutMs, textareaRef])

  // -- Public API --

  const showPrompt = useCallback(() => {
    setIsPromptHidden(false)
    startHideTimer()
  }, [startHideTimer])

  const resetTimer = useCallback(() => {
    if (isPromptHidden) return // Don't reset timer if already hidden; use showPrompt to reveal
    startHideTimer()
  }, [isPromptHidden, startHideTimer])

  const triggerZoneProps = {
    onMouseEnter: showPrompt,
    onPointerDown: showPrompt,
    onClick: showPrompt,
  }

  // -- Effects --

  // Start/stop timer based on enabled state
  useEffect(() => {
    if (!enabled) {
      clearHideTimer()
      setIsPromptHidden(false)
      return
    }
    startHideTimer()
    return clearHideTimer
  }, [enabled, startHideTimer, clearHideTimer])

  // When suppress conditions change and prompt is not hidden, restart the timer
  // so the countdown begins fresh after the user finishes their activity
  useEffect(() => {
    if (!enabled || isPromptHidden) return
    // Any change in suppress conditions resets the timer
    startHideTimer()
  }, [enabled, isLoading, isFocused, hasInput, hasFiles, isPromptHidden, startHideTimer])

  // Keyboard reactivation: when prompt is hidden, listen for printable key presses
  useEffect(() => {
    if (!enabled || !isPromptHidden) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier-only and navigation keys
      if (IGNORED_KEYS.has(e.key)) return
      // Ignore if user is typing in another input/textarea elsewhere
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return

      // Show prompt and focus textarea so the keystroke lands there
      setIsPromptHidden(false)
      startHideTimer()

      // Focus the textarea after a microtask so the component has re-rendered
      requestAnimationFrame(() => {
        textareaRef?.current?.focus()
      })
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [enabled, isPromptHidden, startHideTimer, textareaRef])

  // Cleanup on unmount
  useEffect(() => {
    return clearHideTimer
  }, [clearHideTimer])

  return {
    isPromptHidden: enabled ? isPromptHidden : false,
    showPrompt,
    resetTimer,
    triggerZoneProps,
  }
}
