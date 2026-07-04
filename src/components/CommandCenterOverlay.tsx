import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Brain,
  Check,
  Command,
  CornerDownLeft,
  MessageSquare,
  Monitor,
  Sparkles,
  X,
} from 'lucide-react'

import { useChatHistory } from '../contexts/ChatHistoryContext'
import { useSettings } from '../contexts/SettingsContext'
import { useStreamingState } from '../contexts/StreamingContext'
import { MessageRenderer } from './Dashboard/ChatArea/MessageRenderer'
import { StreamingMessage } from './Dashboard/ChatArea/StreamingMessage'
import { useStreamingChat } from './Dashboard/ChatArea/hooks'
import { scoreAppSearch, scoreGenericSearch, scoreWindowSearch } from '../commandCenter/search'
import type { CommandCenterIndex, CommandCenterIndexItem } from '../electron/types'

type Mode = 'search' | 'ask'

const motionEase = [0.22, 1, 0.36, 1] as const

const EMPTY_INDEX: CommandCenterIndex = {
  workflows: [],
  apps: [],
  windows: [],
  actions: [],
  chats: [],
}

function flattenIndex(
  index: CommandCenterIndex
): Array<{ group: string; item: CommandCenterIndexItem }> {
  return [
    ...index.workflows.map((item) => ({ group: 'Saved Workflows', item })),
    ...index.apps.map((item) => ({ group: 'Apps', item })),
    ...index.windows.map((item) => ({ group: 'Windows', item })),
    ...index.actions.map((item) => ({ group: 'Actions', item })),
    ...index.chats.map((item) => ({ group: 'Chats', item })),
  ]
}

function searchScore(item: CommandCenterIndexItem, query: string): number {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return item.type === 'app' && typeof item.rank === 'number' ? item.rank : 1
  }
  switch (item.type) {
    case 'app': {
      const appScore = scoreAppSearch(item.title, item.aliases, trimmedQuery)
      if (appScore === 0) return 0
      return appScore + Math.min(item.rank ?? 0, 10)
    }
    case 'window':
      return scoreWindowSearch(item.title, item.subtitle ?? '', trimmedQuery)
    case 'workflow':
    case 'action':
    case 'chat':
      return scoreGenericSearch([item.title, ...item.aliases, item.hint], trimmedQuery)
    default:
      return 0
  }
}

function matchesItem(item: CommandCenterIndexItem, query: string): boolean {
  if (!query.trim()) return true
  return searchScore(item, query) > 0
}

function iconForItem(item: CommandCenterIndexItem) {
  if (item.type === 'workflow') return <Sparkles size={22} />
  if (item.type === 'app' && item.iconDataUrl) {
    return <img src={item.iconDataUrl} alt="" className="command-center-result__app-icon" />
  }
  if (item.type === 'app') return <Monitor size={22} />
  if (item.type === 'window') return <Monitor size={22} />
  if (item.type === 'chat') return <MessageSquare size={22} />
  return <Command size={22} />
}

export default function CommandCenterOverlay() {
  const [mode, setMode] = useState<Mode>('search')
  const [input, setInput] = useState('')
  const [index, setIndex] = useState<CommandCenterIndex>(EMPTY_INDEX)
  const [browseApps, setBrowseApps] = useState<CommandCenterIndexItem[]>([])
  const [indexLoading, setIndexLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectionVisible, setSelectionVisible] = useState(false)
  const [confirmingWorkflow, setConfirmingWorkflow] = useState<CommandCenterIndexItem | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [promoted, setPromoted] = useState(false)
  const [optimisticText, setOptimisticText] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const indexRequestRef = useRef(0)
  const activeSearchQueryRef = useRef('')
  const reduceMotion = useReducedMotion()

  const {
    sessions,
    currentSessionId,
    createSession,
    switchSession,
    clearCurrentSession,
    deleteSession,
  } = useChatHistory()
  const { settings } = useSettings()
  const streamingState = useStreamingState()
  const { isLoading, sendMessage, stopStreaming, regenerateMessage, toolState } = useStreamingChat()

  const chatSession = sessions.find((session) => session.id === chatSessionId)
  const chatMessages = chatSession?.messages ?? []
  const isChatMode = Boolean(chatSessionId)

  useEffect(() => {
    void window.commandCenter.setLayout(isChatMode ? 'chat' : 'search')
  }, [isChatMode])

  const searchIndex = useMemo(() => {
    const query = input.trim()
    if (!query) return index
    const appMatches = index.apps
      .filter((item) => matchesItem(item, query))
      .sort(
        (a, b) => searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
      )
    const cachedMatches = browseApps
      .filter((item) => matchesItem(item, query))
      .sort(
        (a, b) => searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
      )
    return { ...index, apps: appMatches.length > 0 ? appMatches : cachedMatches }
  }, [browseApps, index, input])

  const filteredRows = useMemo(() => {
    const query = input.trim()
    return flattenIndex(searchIndex).filter(({ item }) => matchesItem(item, query))
  }, [searchIndex, input])

  const groupedRows = useMemo(() => {
    const query = input.trim()
    const groups = new Map<string, CommandCenterIndexItem[]>()
    for (const row of filteredRows) {
      groups.set(row.group, [...(groups.get(row.group) ?? []), row.item])
    }
    return Array.from(groups.entries()).map(
      ([group, items]) =>
        [
          group,
          query
            ? [...items].sort(
                (a, b) =>
                  searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
              )
            : items,
        ] as const
    )
  }, [filteredRows, input])

  const selectedItem = filteredRows[selectedIndex]?.item
  const switchMode = useCallback(() => {
    if (isChatMode) return
    setMode((current) => (current === 'search' ? 'ask' : 'search'))
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [isChatMode])

  const refreshIndex = useCallback(async (query = '', showLoading = true) => {
    const requestId = indexRequestRef.current + 1
    indexRequestRef.current = requestId
    const requestedQuery = query.trim()
    if (showLoading) {
      setIndexLoading(true)
    }
    try {
      const nextIndex = await window.commandCenter.getIndex(query)
      if (requestId !== indexRequestRef.current) return
      if (requestedQuery !== activeSearchQueryRef.current) return
      if (!requestedQuery) {
        setBrowseApps(nextIndex.apps)
        setIndex(nextIndex)
      } else {
        setIndex(nextIndex)
        if (nextIndex.apps.length > 0) {
          setBrowseApps((current) => {
            const merged = new Map(current.map((app) => [app.id, app]))
            for (const app of nextIndex.apps) {
              merged.set(app.id, app)
            }
            return Array.from(merged.values())
          })
        }
      }
      setError(null)
    } catch (err) {
      if (requestId === indexRequestRef.current) {
        setError(err instanceof Error ? err.message : 'Unable to load Command Center index.')
      }
    } finally {
      if (requestId === indexRequestRef.current) {
        setIndexLoading(false)
      }
    }
  }, [])

  const appIndexWarning =
    index.diagnostics?.apps && !index.diagnostics.apps.ok
      ? index.diagnostics.apps.error || 'App index is partially unavailable.'
      : null

  const resetOverlay = useCallback(() => {
    setMode('search')
    setInput('')
    activeSearchQueryRef.current = ''
    setBrowseApps([])
    setSelectedIndex(0)
    setSelectionVisible(false)
    setConfirmingWorkflow(null)
    setStatus(null)
    setError(null)
    setPendingPrompt(null)
    setOptimisticText(null)
    setPromoted(false)
    setChatSessionId(null)
    clearCurrentSession()
    void refreshIndex()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [clearCurrentSession, refreshIndex])

  useEffect(() => {
    resetOverlay()
    return window.commandCenter.onShown(resetOverlay)
  }, [resetOverlay])

  useEffect(() => {
    activeSearchQueryRef.current = input.trim()
    if (isChatMode || mode !== 'search') return undefined
    const query = input.trim()
    const delay = query ? 90 : 0
    const timer = window.setTimeout(() => {
      void refreshIndex(query, false)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [input, isChatMode, mode, refreshIndex])

  useEffect(() => {
    if (isChatMode || mode !== 'search') return undefined
    const needsIconRefresh = index.apps.some(
      (app) => app.type === 'app' && app.iconKey && !app.iconDataUrl
    )
    if (!needsIconRefresh) return undefined
    const timer = window.setTimeout(() => {
      void refreshIndex(input.trim(), false)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [index.apps, input, isChatMode, mode, refreshIndex])

  useEffect(() => {
    setSelectedIndex(0)
    setSelectionVisible(false)
  }, [input, mode])

  useEffect(() => {
    if (!pendingPrompt || !chatSessionId || currentSessionId !== chatSessionId || isLoading) return
    const prompt = pendingPrompt
    setPendingPrompt(null)
    void sendMessage(prompt, [])
  }, [chatSessionId, currentSessionId, isLoading, pendingPrompt, sendMessage])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
    // Clear optimistic text once a real user message appears in the session
    if (optimisticText && chatMessages.some((m) => m.role === 'user')) {
      setOptimisticText(null)
    }
  }, [chatMessages.length, streamingState?.content, optimisticText])

  const hideOverlay = useCallback(() => {
    if (
      chatSessionId &&
      settings.commandCenterChatPersistence === 'temporary' &&
      !promoted &&
      !isLoading
    ) {
      deleteSession(chatSessionId)
    }
    void window.commandCenter.hide()
  }, [chatSessionId, deleteSession, isLoading, promoted, settings.commandCenterChatPersistence])

  const startChat = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim()
      if (!trimmed) return
      const sessionId = createSession()
      setChatSessionId(sessionId)
      switchSession(sessionId)
      setOptimisticText(trimmed)
      setPendingPrompt(trimmed)
      setMode('ask')
      setInput('')
    },
    [createSession, switchSession]
  )

  const executeItem = useCallback(
    async (item: CommandCenterIndexItem) => {
      if (item.type === 'workflow') {
        setConfirmingWorkflow(item)
        return
      }
      setError(null)
      setStatus(null)
      const query = mode === 'search' ? input.trim() : ''
      const result = await window.commandCenter.executeIndexItem(item.id, query)
      if (!result.success) {
        setError(result.error || 'Command failed.')
        return
      }
      if (result.aiPrompt) {
        startChat(result.aiPrompt)
        return
      }
      if (item.type !== 'chat') {
        setStatus(`${item.title} complete.`)
        void refreshIndex(query, false)
      }
    },
    [input, mode, refreshIndex, startChat]
  )

  const runConfirmedWorkflow = useCallback(async () => {
    if (!confirmingWorkflow || confirmingWorkflow.type !== 'workflow') return
    const workflow = confirmingWorkflow.workflow
    setConfirmingWorkflow(null)
    setError(null)
    setStatus(null)
    const result = await window.commandCenter.executeWorkflow(workflow.id)
    if (!result.success) {
      setError(result.error || 'Workflow failed.')
      return
    }
    if (result.aiPrompt) {
      startChat(result.aiPrompt)
      return
    }
    setStatus(`${workflow.name} complete.`)
    void refreshIndex()
  }, [confirmingWorkflow, refreshIndex, startChat])

  const submit = useCallback(() => {
    if (isChatMode) {
      if (input.trim()) {
        const prompt = input.trim()
        setOptimisticText(prompt)
        setInput('')
        void sendMessage(prompt, [])
      }
      return
    }

    if (mode === 'ask') {
      startChat(input)
      return
    }

    if (selectedItem) {
      void executeItem(selectedItem)
      return
    }

    if (input.trim()) {
      setMode('ask')
      startChat(input)
    }
  }, [executeItem, input, isChatMode, mode, selectedItem, sendMessage, startChat])

  const openInFullChat = useCallback(async () => {
    if (!chatSessionId) return
    setPromoted(true)
    await window.commandCenter.openChatSession(chatSessionId)
  }, [chatSessionId])

  const handlePanelKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      switchMode()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (confirmingWorkflow) {
        setConfirmingWorkflow(null)
        return
      }
      hideOverlay()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
      return
    }
    if (!isChatMode && mode === 'search' && event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectionVisible(true)
      setSelectedIndex((current) => Math.min(current + 1, Math.max(filteredRows.length - 1, 0)))
    }
    if (!isChatMode && mode === 'search' && event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectionVisible(true)
      setSelectedIndex((current) => Math.max(current - 1, 0))
    }
  }

  return (
    <div className="command-center-root">
      <motion.div
        className={`command-center-panel ${isChatMode ? 'is-chat' : ''}`}
        onKeyDownCapture={handlePanelKeyDownCapture}
        initial={false}
      >
        <motion.div className="command-center-topbar" initial={false}>
          <div className="command-center-brand">
            <img className="command-center-logo" src="icon-mark.png" alt="" />
          </div>
          <motion.div
            className="command-center-input-shell"
            animate={reduceMotion ? { x: 0 } : { x: mode === 'ask' ? 4 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: motionEase }}
          >
            <input
              ref={(node) => {
                inputRef.current = node
              }}
              autoFocus
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isChatMode
                  ? 'Ask a follow-up...'
                  : mode === 'search'
                    ? 'Search workflows, apps, windows, chats...'
                    : 'Ask Zura to help with this screen...'
              }
              aria-label={
                isChatMode
                  ? 'Ask a follow-up'
                  : mode === 'search'
                    ? 'Search Command Center'
                    : 'Ask Zura'
              }
            />
            {isChatMode && (
              <button
                type="button"
                onClick={isLoading ? stopStreaming : submit}
                aria-label={isLoading ? 'Stop' : 'Send'}
              >
                {isLoading ? <X size={16} /> : <CornerDownLeft size={16} />}
              </button>
            )}
          </motion.div>
          {!isChatMode && (
            <div className="command-center-tab-hint">
              <kbd>Tab</kbd>
              <span>to switch</span>
            </div>
          )}
          <div className="command-center-segment" aria-label="Command Center mode">
            <button
              type="button"
              className={mode === 'search' && !isChatMode ? 'active' : ''}
              onClick={() => setMode('search')}
            >
              Search
            </button>
            <button
              type="button"
              className={mode === 'ask' || isChatMode ? 'active' : ''}
              onClick={() => setMode('ask')}
            >
              Ask AI
            </button>
          </div>
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          {!isChatMode ? (
            <motion.div
              key={mode}
              className="command-center-body"
              initial={reduceMotion ? false : { x: mode === 'ask' ? 6 : -6 }}
              animate={reduceMotion ? undefined : { x: 0 }}
              exit={reduceMotion ? undefined : { x: mode === 'ask' ? 6 : -6 }}
              transition={{
                duration: reduceMotion ? 0 : 0.13,
                delay: reduceMotion ? 0 : 0.025,
                ease: motionEase,
              }}
            >
              {mode === 'search' ? (
                <div
                  className="command-center-results"
                  role="listbox"
                  aria-label="Command Center results"
                >
                  {appIndexWarning && (
                    <div className="command-center-index-warning">
                      Apps may be incomplete: {appIndexWarning}
                    </div>
                  )}
                  {groupedRows.length > 0 ? (
                    groupedRows.map(([group, items]) => (
                      <section key={group} className="command-center-group">
                        <h2>{group}</h2>
                        {items.map((item) => {
                          const rowIndex = filteredRows.findIndex((row) => row.item.id === item.id)
                          const selected = selectionVisible && rowIndex === selectedIndex
                          return (
                            <motion.button
                              key={item.id}
                              type="button"
                              className={`command-center-result ${selected ? 'selected' : ''}`}
                              onMouseEnter={() => {
                                setSelectionVisible(true)
                                setSelectedIndex(rowIndex)
                              }}
                              onMouseLeave={() => setSelectionVisible(false)}
                              onClick={() => void executeItem(item)}
                              initial={false}
                            >
                              <span className="command-center-result__icon">
                                {iconForItem(item)}
                              </span>
                              <span className="command-center-result__text">
                                <span>{item.title}</span>
                                {item.subtitle && <small>{item.subtitle}</small>}
                              </span>
                              <span className="command-center-result__hint">{item.hint}</span>
                            </motion.button>
                          )
                        })}
                      </section>
                    ))
                  ) : indexLoading && filteredRows.length === 0 ? (
                    <div className="command-center-empty">Loading Command Center...</div>
                  ) : input.trim() ? (
                    <div className="command-center-empty">
                      No matching results. Press Enter to ask Zura instead.
                    </div>
                  ) : (
                    <div className="command-center-empty">No Command Center items found.</div>
                  )}
                </div>
              ) : (
                <div className="command-center-ask-empty">
                  <Brain size={26} />
                  <p>Waiting for your first message.</p>
                  <div>
                    <button type="button" onClick={() => setInput('Summarize this window')}>
                      Summarize this window
                    </button>
                    <button type="button" onClick={() => setInput('Find the next step')}>
                      Find the next step
                    </button>
                    <button type="button" onClick={() => setInput('Turn clipboard into a message')}>
                      Use clipboard
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              className="command-center-chat"
              initial={reduceMotion ? false : { y: 6 }}
              animate={reduceMotion ? undefined : { y: 0 }}
              exit={reduceMotion ? undefined : { y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.15, ease: motionEase }}
            >
              <div className="command-center-chat-actions">
                <span className="command-center-model-badge">
                  {settings.aiModel || 'assistant'}
                </span>
                <button type="button" onClick={openInFullChat}>
                  Open in Chat
                </button>
              </div>
              <div ref={bodyRef} className="command-center-chat-scroll">
                {/* Optimistic user message — shown instantly on submit before session syncs */}
                {optimisticText && (
                  <div
                    key="optimistic-msg"
                    className="command-center-chat-message command-center-chat-message--user"
                  >
                    <div className="command-center-user-bubble">{optimisticText}</div>
                  </div>
                )}
                {/* Thinking indicator — only for first message: no assistant messages in session, waiting for response */}
                {optimisticText &&
                chatMessages.filter((m) => m.role === 'assistant').length === 0 ? (
                  <div key="thinking-indicator" className="command-center-thinking">
                    <span className="command-center-thinking-dot" />
                    <span className="command-center-thinking-dot" />
                    <span className="command-center-thinking-dot" />
                  </div>
                ) : null}
                {chatMessages.map((message, index) => {
                  const isLastAssistant =
                    message.role === 'assistant' && index === chatMessages.length - 1
                  const streaming = isLoading && isLastAssistant
                  return (
                    <div key={message.id} className="command-center-chat-message">
                      {streaming ? (
                        <StreamingMessage
                          message={message}
                          sessionId={chatSessionId!}
                          activeToolCalls={toolState.activeToolCalls}
                          onRegenerate={(instruction) => regenerateMessage(message, instruction)}
                        />
                      ) : (
                        <MessageRenderer
                          message={message}
                          sessionId={chatSessionId!}
                          isStreaming={false}
                          onRegenerate={(instruction) => regenerateMessage(message, instruction)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(error || status) && (
          <div className={`command-center-status ${error ? 'error' : ''}`}>{error || status}</div>
        )}
      </motion.div>

      {confirmingWorkflow && confirmingWorkflow.type === 'workflow' && (
        <div className="command-center-confirm">
          <div>
            <Sparkles size={18} />
            <strong>Run {confirmingWorkflow.workflow.name}?</strong>
            <span>{confirmingWorkflow.workflow.steps.length} step workflow</span>
          </div>
          <button type="button" onClick={() => setConfirmingWorkflow(null)}>
            Cancel
          </button>
          <button type="button" onClick={() => void runConfirmedWorkflow()}>
            <Check size={15} />
            Run
          </button>
        </div>
      )}

      <style>{`
        html, body, #root {
          width: 100%;
          height: 100%;
          margin: 0;
          overflow: hidden;
        }

        html, body {
          background: transparent;
        }

        #root {
          background: rgba(0, 0, 0, 0.32);
          backdrop-filter: blur(26px) saturate(118%);
          -webkit-backdrop-filter: blur(26px) saturate(118%);
        }

        .command-center-root {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: rgba(255, 244, 248, 0.92);
        }

        .command-center-panel {
          position: relative;
          width: 100vw;
          height: 100vh;
          border-radius: 0;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: transparent;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.18),
            inset 0 -1px 0 rgba(0, 0, 0, 0.48),
            0 28px 90px rgba(0, 0, 0, 0.52);
          transition: height 180ms ease, width 180ms ease;
        }

        .command-center-panel.is-chat {
          height: 100vh;
        }

        .command-center-topbar {
          position: relative;
          z-index: 1;
          height: 52px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 8px 0 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.10);
        }

        .command-center-brand {
          flex: 0 0 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          color: rgba(255, 231, 238, 0.72);
          font-size: 14px;
          font-weight: 600;
        }

        .command-center-logo {
          width: 21px;
          height: 21px;
          object-fit: contain;
          display: block;
          transform: translateY(1px);
        }

        .command-center-tab-hint {
          display: flex;
          align-items: center;
          gap: 4px;
          color: rgba(255, 231, 238, 0.34);
          font-size: 11px;
          white-space: nowrap;
        }

        .command-center-tab-hint kbd {
          min-width: 0;
          height: auto;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: rgba(255, 241, 246, 0.58);
          font: inherit;
          font-size: 11px;
          font-weight: 700;
        }

        .command-center-segment {
          height: 30px;
          display: flex;
          align-items: center;
          padding: 2px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.10);
        }

        .command-center-segment button,
        .command-center-input-shell button,
        .command-center-chat-actions button,
        .command-center-ask-empty button,
        .command-center-confirm button {
          border: 0;
          color: inherit;
          font: inherit;
          cursor: pointer;
        }

        .command-center-segment button {
          height: 24px;
          padding: 0 9px;
          border-radius: 4px;
          background: transparent;
          color: rgba(255, 235, 240, 0.56);
          font-size: 13px;
        }

        .command-center-segment button.active {
          background: rgba(255, 255, 255, 0.22);
          color: rgba(255, 247, 250, 0.90);
        }

        .command-center-body,
        .command-center-chat {
          position: relative;
          z-index: 1;
          height: calc(100% - 52px);
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .command-center-input-shell {
          flex: 1;
          min-width: 180px;
          height: 34px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 4px 0 10px;
          border-radius: 7px;
          background: transparent;
          border: 1px solid transparent;
          box-shadow: none;
          color: rgba(255, 231, 238, 0.64);
        }

        .command-center-panel.is-chat .command-center-input-shell {
          background: rgba(255, 255, 255, 0.10);
          border-color: rgba(255, 255, 255, 0.13);
        }

        .command-center-input-shell input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: rgba(255, 245, 248, 0.94);
          font-size: 14px;
        }

        .command-center-input-shell input::placeholder {
          color: rgba(255, 231, 238, 0.42);
        }

        .command-center-input-shell button {
          width: 30px;
          height: 30px;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.14);
        }

        .command-center-results {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 18px 20px 24px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.34) transparent;
        }

        .command-center-results::-webkit-scrollbar,
        .command-center-chat-scroll::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }

        .command-center-results::-webkit-scrollbar-track,
        .command-center-chat-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .command-center-results::-webkit-scrollbar-thumb,
        .command-center-chat-scroll::-webkit-scrollbar-thumb {
          min-height: 28px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.28);
        }

        .command-center-results::-webkit-scrollbar-thumb:hover,
        .command-center-chat-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.42);
        }

        .command-center-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 24px;
        }

        .command-center-group h2 {
          margin: 0 0 6px;
          color: rgba(255, 231, 238, 0.52);
          font-size: 14px;
          font-weight: 500;
        }

        .command-center-result {
          width: 100%;
          min-height: 45px;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) 86px;
          align-items: center;
          column-gap: 12px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: rgba(255, 241, 246, 0.74);
          text-align: left;
          padding: 0 9px;
          font: inherit;
          cursor: pointer;
          transition: background-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
        }

        .command-center-result.selected,
        .command-center-result:hover {
          background: rgba(255, 255, 255, 0.085);
          color: rgba(255, 249, 251, 0.96);
        }

        .command-center-result__icon {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 221, 231, 0.58);
          overflow: hidden;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
        }

        .command-center-result__icon svg,
        .command-center-result__app-icon {
          width: 28px;
          height: 28px;
          display: block;
          flex: 0 0 auto;
        }

        .command-center-result__app-icon {
          object-fit: contain;
          border-radius: 7px;
        }

        .command-center-result__text {
          min-width: 0;
          display: flex;
          flex-direction: column;
          line-height: 1.1;
        }

        .command-center-result__text span,
        .command-center-result__text small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .command-center-result__text span {
          font-size: 14px;
        }

        .command-center-result__text small {
          margin-top: 3px;
          color: rgba(255, 231, 238, 0.46);
          font-size: 11px;
        }

        .command-center-result__hint {
          justify-self: end;
          color: rgba(255, 231, 238, 0.48);
          font-size: 12px;
        }

        .command-center-empty,
        .command-center-ask-empty {
          color: rgba(255, 231, 238, 0.56);
        }

        .command-center-empty {
          padding: 32px 10px;
          font-size: 14px;
        }

        .command-center-index-warning {
          margin: 0 0 14px;
          padding: 8px 10px;
          border-radius: 7px;
          background: rgba(255, 194, 205, 0.10);
          color: rgba(255, 210, 220, 0.86);
          font-size: 12px;
          line-height: 1.35;
        }

        .command-center-ask-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 28px;
          text-align: center;
        }

        .command-center-ask-empty p {
          margin: 0;
          font-size: 15px;
        }

        .command-center-ask-empty div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
        }

        .command-center-ask-empty button,
        .command-center-chat-actions button,
        .command-center-confirm button {
          min-height: 30px;
          border-radius: 7px;
          padding: 0 11px;
          background: rgba(255, 255, 255, 0.13);
          color: rgba(255, 241, 246, 0.78);
        }

        .command-center-chat-actions {
          height: 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 18px;
        }

        .command-center-chat-scroll {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 10px 20px 22px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.34) transparent;
        }

        .command-center-chat-message {
          max-width: 690px;
          margin: 0 auto;
        }

        .command-center-chat-message--user {
          max-width: 690px;
          margin: 0 auto 8px;
          display: flex;
          justify-content: flex-end;
        }

        .command-center-user-bubble {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 8px 14px;
          max-width: min(74%, 520px);
          font-size: 14px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .command-center-model-badge {
          font-size: 11px;
          color: rgba(255, 231, 238, 0.48);
          padding: 3px 8px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.08);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }

        .command-center-thinking {
          display: flex;
          align-items: center;
          gap: 4px;
          max-width: 690px;
          margin: 0 auto;
          padding: 14px 0;
        }

        .command-center-thinking-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255, 231, 238, 0.48);
          animation: thinkingPulse 0.8s ease-in-out infinite;
        }

        .command-center-thinking-dot:nth-child(2) {
          animation-delay: 0.16s;
        }

        .command-center-thinking-dot:nth-child(3) {
          animation-delay: 0.32s;
        }

        @keyframes thinkingPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }

        .command-center-status {
          position: absolute;
          z-index: 2;
          left: 18px;
          right: 18px;
          bottom: 12px;
          color: rgba(211, 255, 225, 0.82);
          font-size: 12px;
          pointer-events: none;
        }

        .command-center-status.error {
          color: rgba(255, 194, 205, 0.94);
        }

        .command-center-confirm {
          position: absolute;
          z-index: 5;
          left: 50%;
          bottom: 28px;
          transform: translateX(-50%);
          width: min(520px, calc(100vw - 44px));
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 10px;
          align-items: center;
          padding: 12px;
          border-radius: 8px;
          background: rgba(38, 18, 30, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.38);
        }

        .command-center-confirm div {
          min-width: 0;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 3px 9px;
          align-items: center;
        }

        .command-center-confirm strong,
        .command-center-confirm span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .command-center-confirm span {
          grid-column: 2;
          color: rgba(255, 231, 238, 0.54);
          font-size: 12px;
        }

        @media (prefers-reduced-motion: reduce) {
          .command-center-panel {
            transition: none;
          }
        }
      `}</style>
    </div>
  )
}
