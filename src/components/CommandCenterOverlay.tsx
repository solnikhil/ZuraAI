import { useEffect, useMemo, useRef, useState } from 'react'
import { Command, CornerDownLeft, Monitor, X } from 'lucide-react'
import type { CommandCenterAction, CommandCenterActionId } from '../electron/types'

interface ActiveWindowContext {
  hwnd?: number
  title?: string
  processName?: string
}

function parseActiveWindow(data: unknown): ActiveWindowContext | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  return {
    hwnd: typeof record.hwnd === 'number' ? record.hwnd : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
    processName: typeof record.processName === 'string' ? record.processName : undefined,
  }
}

function formatBytes(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return ''
  const gib = value / 1024 / 1024 / 1024
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GB`
}

function formatSystemStatus(data: unknown): string {
  if (!data || typeof data !== 'object') return 'System status read.'
  const record = data as Record<string, unknown>
  const battery = record.battery && typeof record.battery === 'object'
    ? record.battery as Record<string, unknown>
    : null
  const disks = Array.isArray(record.disks) ? record.disks : []
  const networks = Array.isArray(record.networks) ? record.networks : []

  const parts: string[] = []
  if (typeof battery?.estimatedChargeRemaining === 'number') {
    parts.push(`Battery ${battery.estimatedChargeRemaining}%`)
  }

  const primaryDisk = disks.find((disk): disk is Record<string, unknown> => (
    Boolean(disk) &&
    typeof disk === 'object' &&
    typeof (disk as Record<string, unknown>).name === 'string'
  ))
  if (primaryDisk) {
    const free = formatBytes(primaryDisk.freeBytes)
    const size = formatBytes(primaryDisk.sizeBytes)
    parts.push(`${primaryDisk.name}: ${free || '?'} free${size ? ` of ${size}` : ''}`)
  }

  if (networks.length > 0) {
    parts.push(`${networks.length} active network${networks.length === 1 ? '' : 's'}`)
  }

  return parts.length > 0 ? parts.join(' - ') : 'System status read.'
}

function formatThemeStatus(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Theme updated.'
  const theme = (data as Record<string, unknown>).appTheme
  return theme === 'dark' || theme === 'light' ? `Theme set to ${theme}.` : 'Theme updated.'
}

function groupActions(actions: CommandCenterAction[]): Array<{ kind: string; label: string; actions: CommandCenterAction[] }> {
  const labels: Record<string, string> = {
    window: 'Window',
    audio: 'Audio',
    system: 'System',
    clipboard: 'Clipboard',
    app: 'App',
    settings: 'Settings',
    filesystem: 'Files',
  }
  const groups = new Map<string, CommandCenterAction[]>()
  for (const action of actions) {
    groups.set(action.kind, [...(groups.get(action.kind) ?? []), action])
  }
  return Array.from(groups.entries()).map(([kind, groupedActions]) => ({
    kind,
    label: labels[kind] ?? kind,
    actions: groupedActions,
  }))
}

export default function CommandCenterOverlay() {
  const [input, setInput] = useState('')
  const [context, setContext] = useState<ActiveWindowContext | null>(null)
  const [actions, setActions] = useState<CommandCenterAction[]>([])
  const [runningAction, setRunningAction] = useState<CommandCenterActionId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const visibleActions = useMemo(() => {
    const query = input.trim().toLowerCase()
    if (!query) return actions
    return actions.filter((action) => (
      action.label.toLowerCase().includes(query) ||
      action.kind.toLowerCase().includes(query) ||
      action.id.toLowerCase().includes(query) ||
      (action.aliases ?? []).some((alias) => alias.toLowerCase().includes(query))
    ))
  }, [actions, input])
  const groupedActions = useMemo(() => groupActions(visibleActions), [visibleActions])
  const actionShortcutIndex = useMemo(
    () => new Map(actions.map((action, index) => [action.id, index + 1])),
    [actions]
  )

  const contextLabel = useMemo(() => {
    if (!context) return 'Desktop context unavailable'
    const title = context.title?.trim()
    const processName = context.processName?.trim()
    if (title && processName) return `${processName} - ${title}`
    return title || processName || 'Current desktop'
  }, [context])

  const refreshContext = async () => {
    const result = await window.commandCenter.getContext()
    if (result.success) {
      setContext(parseActiveWindow(result.data))
      setError(null)
    } else {
      setContext(null)
      setError(result.error || 'Unable to read desktop context.')
    }
  }

  const refreshActions = async () => {
    setActions(await window.commandCenter.listActions())
  }

  useEffect(() => {
    void refreshContext()
    void refreshActions()
    inputRef.current?.focus()
    return window.commandCenter.onShown(() => {
      setInput('')
      setError(null)
      setStatus(null)
      inputRef.current?.focus()
      void refreshContext()
      void refreshActions()
    })
  }, [])

  const submit = async () => {
    const text = input.trim()
    if (!text) return
    const result = await window.commandCenter.submitCommand(text)
    if (!result.accepted) {
      setError(result.reason || 'Command was not accepted.')
    }
  }

  const runAction = async (action: CommandCenterAction) => {
    setRunningAction(action.id)
    setError(null)
    setStatus(null)
    const result = await window.commandCenter.executeAction(action.id)
    setRunningAction(null)
    if (result.success) {
      setStatus(
        action.id === 'system-status'
          ? formatSystemStatus(result.data)
          : action.id === 'toggle-theme'
            ? formatThemeStatus(result.data)
            : `${action.label} complete.`
      )
      void refreshContext()
    } else {
      setError(result.error || `${action.label} failed.`)
    }
  }

  return (
    <div className="command-center-root">
      <div className="command-center-panel">
        <div className="command-center-context">
          <span className="command-center-context__icon">
            <Monitor size={14} />
          </span>
          <span className="command-center-context__label">{contextLabel}</span>
          <button
            type="button"
            className="command-center-close"
            onClick={() => window.commandCenter.hide()}
            aria-label="Close Command Center"
          >
            <X size={15} />
          </button>
        </div>

        <div className="command-center-input-row">
          <Command size={22} className="command-center-command-icon" />
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                void window.commandCenter.hide()
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
              if (event.altKey && /^[1-9]$/.test(event.key)) {
                const action = visibleActions[Number(event.key) - 1]
                if (action) {
                  event.preventDefault()
                  void runAction(action)
                }
              }
            }}
            placeholder="Ask ZuraAI to act on this desktop..."
            aria-label="Command"
          />
          <button
            type="button"
            className="command-center-submit"
            onClick={() => void submit()}
            aria-label="Send command"
          >
            <CornerDownLeft size={17} />
          </button>
        </div>

        <div className="command-center-footer">
          <span>{error || status || 'Commands open in chat when they need reasoning or multi-step work.'}</span>
        </div>

        {groupedActions.length > 0 ? (
          <div className="command-center-actions" aria-label="Quick OS actions">
            {groupedActions.map((group) => (
              <div key={group.kind} className="command-center-action-group">
                <div className="command-center-action-group__label">{group.label}</div>
                <div className="command-center-action-group__items">
                  {group.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className="command-center-action"
                      disabled={runningAction !== null}
                      onClick={() => void runAction(action)}
                    >
                      <span className="command-center-action__label">
                        {runningAction === action.id ? 'Running...' : action.label}
                      </span>
                      <span className="command-center-action__hint">
                        Alt+{actionShortcutIndex.get(action.id)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : actions.length > 0 ? (
          <div className="command-center-empty-actions">
            No quick actions match. Press Enter to send as a command.
          </div>
        ) : null}
      </div>

      <style>{`
        html, body, #root {
          margin: 0;
          width: 100%;
          height: 100%;
          background: transparent;
          overflow: hidden;
        }
        .command-center-root {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .command-center-panel {
          width: calc(100% - 24px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          background: rgba(20, 20, 22, 0.94);
          color: #f8fafc;
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.44);
          backdrop-filter: blur(22px);
          overflow: hidden;
        }
        .command-center-context {
          height: 36px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 10px 0 14px;
          color: #a7f3d0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .command-center-context__icon {
          display: inline-flex;
          color: #38bdf8;
        }
        .command-center-context__label {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
        }
        .command-center-close,
        .command-center-submit {
          border: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #cbd5e1;
          background: transparent;
          cursor: pointer;
        }
        .command-center-close {
          width: 28px;
          height: 28px;
          border-radius: 8px;
        }
        .command-center-close:hover,
        .command-center-submit:hover {
          background: rgba(255, 255, 255, 0.09);
        }
        .command-center-input-row {
          height: 72px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 16px;
        }
        .command-center-command-icon {
          color: #22d3ee;
          flex: 0 0 auto;
        }
        .command-center-input-row input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: none;
          background: transparent;
          color: #f8fafc;
          font-size: 20px;
          line-height: 1.2;
        }
        .command-center-input-row input::placeholder {
          color: #64748b;
        }
        .command-center-submit {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(34, 211, 238, 0.11);
          color: #67e8f9;
        }
        .command-center-footer {
          min-height: 32px;
          display: flex;
          align-items: center;
          padding: 0 16px 8px 50px;
          color: #94a3b8;
          font-size: 12px;
        }
        .command-center-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 12px;
          padding: 0 14px 14px 50px;
          max-height: 94px;
          overflow: auto;
        }
        .command-center-action-group {
          min-width: 0;
        }
        .command-center-action-group__label {
          margin-bottom: 5px;
          color: #64748b;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .command-center-action-group__items {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .command-center-empty-actions {
          padding: 0 16px 14px 50px;
          color: #64748b;
          font-size: 12px;
        }
        .command-center-action {
          height: 30px;
          flex: 0 1 auto;
          min-width: 0;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 8px;
          padding: 0 10px;
          background: rgba(255, 255, 255, 0.06);
          color: #dbeafe;
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .command-center-action:hover:not(:disabled) {
          background: rgba(34, 211, 238, 0.16);
          border-color: rgba(34, 211, 238, 0.34);
        }
        .command-center-action:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .command-center-action__label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .command-center-action__hint {
          flex: 0 0 auto;
          color: #7dd3fc;
          opacity: 0.72;
          font-size: 11px;
        }
      `}</style>
    </div>
  )
}
