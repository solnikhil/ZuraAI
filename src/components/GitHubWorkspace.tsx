import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ChevronDown,
  Cloud,
  Code,
  ExternalLink,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  XCircle,
} from 'lucide-react'
import { ActionsMenu, type ActionsMenuGroup } from '@/components/ui/actions-menu'
import type {
  GitHubWorkspaceOpenRequest,
  GitHubWorkspaceRepositorySummary,
  GitHubWorkspaceState,
} from '../electron/types'

function GitHubMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  )
}

function statusGlyph(status: string): string {
  const code = status.trim()
  if (!code) return 'M'
  if (code.includes('?')) return 'U'
  if (code.includes('A')) return 'A'
  if (code.includes('D')) return 'D'
  if (code.includes('R')) return 'R'
  return code.slice(-1) || 'M'
}

function pathBasename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

const SIDEBAR_WIDTH_KEY = 'zura-github-workspace:sidebar-width'
const SIDEBAR_WIDTH_DEFAULT = 300
const SIDEBAR_WIDTH_MIN = 200
const SIDEBAR_WIDTH_MAX = 520

function readStoredSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    const value = raw ? Number(raw) : SIDEBAR_WIDTH_DEFAULT
    if (!Number.isFinite(value)) return SIDEBAR_WIDTH_DEFAULT
    return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(value)))
  } catch {
    return SIDEBAR_WIDTH_DEFAULT
  }
}

type DiffLineKind = 'meta' | 'hunk' | 'add' | 'del' | 'ctx' | 'empty'

function classifyDiffLine(line: string): DiffLineKind {
  if (!line) return 'empty'
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('similarity ') || line.startsWith('rename ')) {
    return 'meta'
  }
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'ctx'
}

function summarizeDiff(diffText: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diffText.split(/\r?\n/)) {
    const kind = classifyDiffLine(line)
    if (kind === 'add') added += 1
    if (kind === 'del') removed += 1
  }
  return { added, removed }
}

function DiffView({ text }: { text: string }) {
  const lines = useMemo(() => {
    if (!text.trim()) return [] as { kind: DiffLineKind; text: string; n: number }[]
    return text.split(/\r?\n/).map((line, index) => ({
      kind: classifyDiffLine(line),
      text: line.length ? line : ' ',
      n: index + 1,
    }))
  }, [text])

  if (!lines.length) {
    return (
      <div className="github-workspace__diff-empty">
        <span>No textual diff for this file</span>
        <small>Binary files, empty diffs, or renames without content changes show up here.</small>
      </div>
    )
  }

  return (
    <div className="github-workspace__diff" role="region" aria-label="File diff">
      {lines.map((line) => (
        <div key={line.n} className={`github-workspace__diff-line is-${line.kind}`}>
          <span className="github-workspace__diff-gutter" aria-hidden="true">
            {line.n}
          </span>
          <span className="github-workspace__diff-code">{line.text}</span>
        </div>
      ))}
    </div>
  )
}

function groupRepositories(repositories: GitHubWorkspaceRepositorySummary[], filter: string) {
  const q = filter.trim().toLowerCase()
  const filtered = q
    ? repositories.filter((repo) => {
        const hay = `${repo.alias || ''} ${repo.name} ${repo.owner || ''} ${repo.path} ${repo.branch || ''}`.toLowerCase()
        return hay.includes(q)
      })
    : repositories

  const recent = [...filtered]
    .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
    .slice(0, 6)

  const byOwner = new Map<string, GitHubWorkspaceRepositorySummary[]>()
  for (const repo of filtered) {
    const owner = repo.owner || 'Local repositories'
    const list = byOwner.get(owner) ?? []
    list.push(repo)
    byOwner.set(owner, list)
  }
  for (const list of byOwner.values()) {
    list.sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name))
  }

  return { recent, byOwner: [...byOwner.entries()].sort(([a], [b]) => a.localeCompare(b)) }
}

export type GitHubCommitBarMeta = {
  hasRepository: boolean
  selectedCount: number
  changeCount: number
  /** True while a commit is in flight (top-bar button busy state). */
  committing: boolean
}

export default function GitHubWorkspace({
  onSignedInChange,
  summary,
  onSummaryChange,
  onCommitMetaChange,
  commitHandlerRef,
}: {
  onSignedInChange?: (signedIn: boolean) => void
  /** Commit summary owned by Command Center top bar. */
  summary: string
  onSummaryChange: (value: string) => void
  onCommitMetaChange?: (meta: GitHubCommitBarMeta) => void
  /** Parent top-bar Commit invokes this ref’s current function. */
  commitHandlerRef?: MutableRefObject<(() => Promise<void>) | null>
}) {
  const [state, setState] = useState<GitHubWorkspaceState | null>(null)
  const [tab, setTab] = useState<'changes' | 'history'>('changes')
  const [selectedChangeId, setSelectedChangeId] = useState<string>()
  const [selectedCommitId, setSelectedCommitId] = useState<string>()
  const [diff, setDiff] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string | null>(null)
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [branchPickerView, setBranchPickerView] = useState<'branches' | 'worktrees'>('branches')
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const summaryRef = useRef(summary)
  summaryRef.current = summary

  const repository = state?.repositories.find((item) => item.id === state.selectedRepositoryId)
  const selectedChange = state?.changes.find((item) => item.id === selectedChangeId)
  const selectedCommit = state?.history.find((item) => item.id === selectedCommitId)
  const branches = state?.branches ?? []
  const worktrees = state?.worktrees ?? []
  const accountLogin = state?.account.status === 'signed_in' ? state.account.login : 'GitHub'

  useEffect(() => {
    let active = true
    void window.githubWorkspace
      .getState()
      .then((next) => active && setState(next))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load GitHub Workspace.'))
    const dispose = window.githubWorkspace.onChanged(setState)
    return () => {
      active = false
      dispose()
    }
  }, [])

  useEffect(() => {
    onSignedInChange?.(state?.account.status === 'signed_in')
  }, [onSignedInChange, state?.account.status])

  const selectedCount = useMemo(
    () => state?.changes.filter((item) => item.selected).length ?? 0,
    [state?.changes]
  )

  const changeCount = state?.changes.length ?? 0

  useEffect(() => {
    onCommitMetaChange?.({
      hasRepository: Boolean(repository),
      selectedCount,
      changeCount,
      committing: busy === 'Committing…',
    })
  }, [onCommitMetaChange, repository, selectedCount, changeCount, busy])

  useEffect(() => {
    if (!repository || !selectedChange || tab !== 'changes') {
      setDiff('')
      return
    }
    void window.githubWorkspace
      .selectDiff(repository.id, selectedChange.id)
      .then(setDiff)
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load diff.'))
  }, [repository?.id, selectedChange?.id, tab])

  const grouped = useMemo(
    () => groupRepositories(state?.repositories ?? [], ''),
    [state?.repositories]
  )

  const beginSignIn = () => {
    if (state?.account.status === 'signed_out' && state.account.setupRequired) return
    void window.githubWorkspace.startSignIn().then((account) => state && setState({ ...state, account }))
  }

  useEffect(() => {
    const submit = () => beginSignIn()
    window.addEventListener('github-workspace:submit-sign-in', submit)
    return () => window.removeEventListener('github-workspace:submit-sign-in', submit)
  })

  const formatGitError = (e: unknown) => {
    if (!(e instanceof Error)) return 'Git operation failed.'
    // Electron wraps invoke failures as: Error invoking remote method 'x': Error: <msg>
    const wrapped = e.message.match(/Error invoking remote method '[^']+':(?: Error:)?\s*([\s\S]+)$/i)
    return (wrapped?.[1] || e.message).trim() || 'Git operation failed.'
  }

  const mutate = async (
    mutation: Parameters<typeof window.githubWorkspace.mutate>[0],
    busyLabel?: string
  ) => {
    setError(undefined)
    if (busyLabel) setBusy(busyLabel)
    try {
      setState(await window.githubWorkspace.mutate(mutation))
    } catch (e) {
      setError(formatGitError(e))
    } finally {
      if (busyLabel) setBusy(null)
    }
  }

  const performCommit = async () => {
    if (busy) return
    const message = summaryRef.current.trim()
    if (!repository) {
      setError('Add a repository first.')
      return
    }
    if (!message) {
      setError('Enter a commit summary.')
      return
    }
    if (!changeCount) {
      setError('No changes to commit.')
      return
    }
    if (!selectedCount) {
      setError('Select at least one changed file to commit.')
      return
    }
    setError(undefined)
    setBusy('Committing…')
    try {
      setState(
        await window.githubWorkspace.mutate({
          type: 'commit',
          repositoryId: repository.id,
          summary: message,
        })
      )
      onSummaryChange('')
    } catch (e) {
      setError(formatGitError(e))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!commitHandlerRef) return
    commitHandlerRef.current = () => performCommit()
    return () => {
      commitHandlerRef.current = null
    }
  })

  const addRepository = async () => {
    setError(undefined)
    setRepoMenuOpen(false)
    try {
      setState(await window.githubWorkspace.addRepository())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add repository.')
    }
  }

  const selectRepository = async (repositoryId: string) => {
    setRepoMenuOpen(false)
    setBranchMenuOpen(false)
    setSelectedChangeId(undefined)
    setSelectedCommitId(undefined)
    setTab('changes')
    await mutate({ type: 'select-repository', repositoryId })
  }

  const openTarget = async (request: GitHubWorkspaceOpenRequest) => {
    setError(undefined)
    try {
      const result = await window.githubWorkspace.open(request)
      if (!result.ok) setError(result.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open.')
    }
  }

  const branchMenuGroups = useMemo((): ActionsMenuGroup[] => {
    if (!repository) return []
    if (branchPickerView === 'branches') {
      return [{
        id: 'branches',
        label: 'Branches',
        items: branches.map((branch) => ({
          id: `branch-${branch}`,
          label: branch,
          icon: <Code size={14} />,
          checked: branch === repository.branch,
          disabled: Boolean(busy) || branch === repository.branch,
          onSelect: () => {
            void mutate(
              { type: 'checkout-branch', repositoryId: repository.id, branch },
              `Checking out ${branch}…`
            )
          },
        })),
      }]
    }
    return [{
        id: 'worktrees',
        label: 'Worktrees',
        items: worktrees.map((wt) => ({
          id: `wt-${wt.id}`,
          label: wt.branch || pathBasename(wt.path),
          description: wt.path,
          icon: <Folder size={14} />,
          checked: wt.isCurrent,
          disabled: Boolean(busy) || wt.isCurrent,
          onSelect: () => {
            void mutate(
              { type: 'open-worktree', repositoryId: repository.id, worktreeId: wt.id },
              'Opening worktree…'
            )
          },
        })),
      }]
  }, [branchPickerView, branches, busy, repository, worktrees])

  const repoMenuGroups = useMemo((): ActionsMenuGroup[] => {
    if (!state) return []
    const groups: ActionsMenuGroup[] = []
    if (grouped.recent.length) {
      groups.push({
        id: 'recent',
        label: 'Recent',
        items: grouped.recent.map((item) => ({
          id: `recent-${item.id}`,
          label: item.alias || item.name,
          description: `${item.owner ? `${item.owner}/` : ''}${item.name}${item.branch ? ` · ${item.branch}` : ''}`,
          icon: <Code size={14} />,
          checked: item.id === state.selectedRepositoryId,
          onSelect: () => void selectRepository(item.id),
        })),
      })
    }
    for (const [owner, repos] of grouped.byOwner) {
      groups.push({
        id: `owner-${owner}`,
        label: owner,
        items: repos.map((item) => ({
          id: item.id,
          label: item.alias || item.name,
          description: item.path,
          icon: <Code size={14} />,
          checked: item.id === state.selectedRepositoryId,
          onSelect: () => void selectRepository(item.id),
        })),
      })
    }
    return groups
  }, [grouped, state])

  const accountMenuGroups = useMemo((): ActionsMenuGroup[] => [
    {
      id: 'account',
      label: `@${accountLogin}`,
      items: [
        {
          id: 'sign-out',
          label: 'Sign out',
          description: 'Remove this account from ZuraAI',
          icon: <XCircle size={14} />,
          onSelect: () => {
            void window.githubWorkspace
              .signOut()
              .then((account) => setState((current) => current ? { ...current, account } : current))
          },
        },
        {
          id: 'disconnect',
          label: 'Disconnect GitHub',
          description: 'Sign out and open GitHub authorization settings',
          icon: <ExternalLink size={14} />,
          destructive: true,
          onSelect: () => {
            void window.githubWorkspace
              .disconnect()
              .then((account) => setState((current) => current ? { ...current, account } : current))
          },
        },
      ],
    },
  ], [accountLogin])

  const fileActionGroups = useMemo((): ActionsMenuGroup[] => {
    if (!repository || !selectedChange) return []
    return [
      {
        id: 'file',
        items: [
          {
            id: 'open',
            label: 'Open',
            description: 'Open in default application',
            icon: <ExternalLink size={14} />,
            onSelect: () =>
              void openTarget({
                target: 'file',
                repositoryId: repository.id,
                changeId: selectedChange.id,
              }),
          },
          {
            id: 'reveal',
            label: 'Reveal',
            description: 'Show in File Explorer',
            icon: <FolderOpen size={14} />,
            onSelect: () =>
              void openTarget({
                target: 'reveal',
                repositoryId: repository.id,
                changeId: selectedChange.id,
              }),
          },
        ],
      },
    ]
  }, [repository, selectedChange])

  // Must stay above any early returns so hook order is stable across signed-out/in.
  const diffStats = useMemo(() => summarizeDiff(diff), [diff])

  const onSidebarResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const body = bodyRef.current
    if (!body) return
    const startX = event.clientX
    const startWidth = sidebarWidth
    const bodyRect = body.getBoundingClientRect()
    const maxForBody = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, bodyRect.width - 220))

    setIsResizingSidebar(true)
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)

    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.min(
        maxForBody,
        Math.max(SIDEBAR_WIDTH_MIN, Math.round(startWidth + (moveEvent.clientX - startX)))
      )
      setSidebarWidth(next)
    }
    const onUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      setIsResizingSidebar(false)
      setSidebarWidth((width) => {
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width))
        } catch {
          // ignore quota / private mode
        }
        return width
      })
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [sidebarWidth])

  if (!state) {
    return <div className="github-workspace-empty">Loading repository workspace…</div>
  }

  if (state.account.status !== 'signed_in') {
    const signingAccount = state.account.status === 'signing_in' ? state.account : null
    const signingIn = Boolean(signingAccount)
    const setupRequired = state.account.status === 'signed_out' && state.account.setupRequired
    const setupMessage =
      state.account.status === 'signed_out'
        ? state.account.error ||
          (setupRequired ? 'GitHub sign-in needs a ZuraAI OAuth client ID.' : undefined)
        : undefined
    return (
      <section className="github-workspace github-workspace--auth" aria-label="GitHub sign in">
        <div className="github-workspace-auth">
          <span className="github-workspace-auth__mark" aria-hidden="true">
            <GitHubMark size={44} />
          </span>
          <strong>{signingIn ? 'Complete sign in in your browser' : 'Sign in to GitHub'}</strong>
          <p>
            {signingIn
              ? 'Return here after authorizing ZuraAI on GitHub.'
              : 'Connect your account to access repositories, changes, history, and sync.'}
          </p>
          {setupMessage && (
            <span className="github-workspace-auth__error" role="alert">
              {setupMessage}
            </span>
          )}
          {signingIn ? (
            <div className="github-workspace-auth__device">
              <button
                className="github-workspace-auth__code"
                type="button"
                title="Copy code"
                onClick={() =>
                  signingAccount && void window.githubWorkspace.copyUserCode(signingAccount.userCode)
                }
              >
                {signingAccount?.userCode}
              </button>
              <div className="github-workspace-auth__waiting">
                <span>
                  <RefreshCcw size={14} /> Waiting for GitHub…
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void window.githubWorkspace
                      .signOut()
                      .then((account) => setState({ ...state, account }))
                  }
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="github-workspace-auth__continue"
              type="button"
              autoFocus
              disabled={setupRequired}
              onClick={beginSignIn}
            >
              <span>{setupRequired ? 'Sign-in setup required' : 'Continue with GitHub'}</span>
            </button>
          )}
          <small>Opens GitHub in your browser. ZuraAI never sees your password.</small>
        </div>
        <style>{authStyles}</style>
      </section>
    )
  }

  const branchLabel = repository?.branch || 'No branch'
  const syncLabel =
    repository && repository.behind > 0
      ? `Pull ${repository.behind}`
      : repository && repository.ahead > 0
        ? `Push ${repository.ahead}`
        : 'Push / Pull'

  return (
    <section className="github-workspace" aria-label="GitHub Workspace">
      {error && (
        <div className="github-workspace__error" role="alert">
          {error}
        </div>
      )}

      {!repository ? (
        <div className="github-workspace-empty github-workspace-empty--main">
          <Folder size={32} strokeWidth={1.5} />
          <strong>Add a Git repository</strong>
          <span>Review changes, history, commits, and sync without leaving Command Center.</span>
          <button type="button" onClick={() => void addRepository()}>
            Choose folder
          </button>
        </div>
      ) : (
        <div
          ref={bodyRef}
          className={`github-workspace__body ${isResizingSidebar ? 'is-resizing' : ''}`}
          style={{ gridTemplateColumns: `${sidebarWidth}px 5px minmax(0, 1fr)` }}
        >
          <aside className="github-workspace__sidebar">
            <div className="github-workspace__tabs" role="tablist" aria-label="Repository views">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'changes'}
                className={tab === 'changes' ? 'is-active' : ''}
                title="File changes"
                onClick={() => setTab('changes')}
              >
                <span className="github-workspace__tab-label">Changes</span>
                <span className="github-workspace__tab-count">{state.changes.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'history'}
                className={tab === 'history' ? 'is-active' : ''}
                title="Commit history"
                onClick={() => {
                  setTab('history')
                  if (!selectedCommitId && state.history[0]) {
                    setSelectedCommitId(state.history[0].id)
                  }
                }}
              >
                <span className="github-workspace__tab-label">History</span>
              </button>
            </div>
            <div className="github-workspace__list" role="listbox">
              {tab === 'changes' ? (
                state.changes.length === 0 ? (
                  <div className="github-workspace__list-empty">No local changes</div>
                ) : (
                  state.changes.map((change) => (
                    <button
                      key={change.id}
                      type="button"
                      role="option"
                      aria-selected={change.id === selectedChangeId}
                      className={`github-workspace__change-row ${change.id === selectedChangeId ? 'is-selected' : ''}`}
                      onClick={() => setSelectedChangeId(change.id)}
                    >
                      <input
                        type="checkbox"
                        checked={change.selected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          void mutate({
                            type: 'select-change',
                            repositoryId: repository.id,
                            changeId: change.id,
                            selected: event.target.checked,
                          })
                        }
                      />
                      <span title={change.path}>{change.path}</span>
                      <em>{statusGlyph(change.status)}</em>
                    </button>
                  ))
                )
              ) : state.history.length === 0 ? (
                <div className="github-workspace__list-empty">No commits yet</div>
              ) : (
                state.history.map((commit) => (
                  <button
                    key={commit.id}
                    type="button"
                    role="option"
                    aria-selected={commit.id === selectedCommitId}
                    className={`github-workspace__history-row ${commit.id === selectedCommitId ? 'is-selected' : ''}`}
                    onClick={() => setSelectedCommitId(commit.id)}
                  >
                    <span className="github-workspace__history-summary" title={commit.summary}>
                      {commit.summary}
                    </span>
                    <small className="github-workspace__history-meta">
                      {commit.author}
                      {commit.authoredAt
                        ? ` · ${new Date(commit.authoredAt).toLocaleDateString()}`
                        : ''}
                    </small>
                  </button>
                ))
              )}
            </div>
          </aside>
          <div
            className="github-workspace__splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize file list"
            aria-valuemin={SIDEBAR_WIDTH_MIN}
            aria-valuemax={SIDEBAR_WIDTH_MAX}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={onSidebarResizePointerDown}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const delta = event.key === 'ArrowLeft' ? -16 : 16
              setSidebarWidth((width) => {
                const next = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width + delta))
                try {
                  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next))
                } catch {
                  // ignore
                }
                return next
              })
            }}
          />
          <main className="github-workspace__detail">
            {tab === 'changes' && selectedChange ? (
              <div className="github-workspace__detail-panel">
                <div className="github-workspace__detail-toolbar">
                  <div className="github-workspace__detail-identity">
                    <em className="github-workspace__status-pill" data-status={statusGlyph(selectedChange.status)}>
                      {statusGlyph(selectedChange.status)}
                    </em>
                    <div className="github-workspace__detail-titles">
                      <span className="github-workspace__detail-name" title={selectedChange.path}>
                        {pathBasename(selectedChange.path)}
                      </span>
                      <span className="github-workspace__detail-path" title={selectedChange.path}>
                        {selectedChange.path}
                      </span>
                    </div>
                  </div>
                  {diff.trim() ? (
                    <div className="github-workspace__diff-stats" aria-label="Diff stats">
                      <span className="is-add">+{diffStats.added}</span>
                      <span className="is-del">−{diffStats.removed}</span>
                    </div>
                  ) : null}
                  <ActionsMenu
                    side="bottom"
                    align="end"
                    groups={fileActionGroups}
                    trigger={
                      <button
                        type="button"
                        className="zura-menu-trigger github-workspace__actions-trigger"
                        title="File actions"
                        aria-label="File actions"
                      >
                        <MoreHorizontal size={14} />
                        Actions
                      </button>
                    }
                  />
                </div>
                <DiffView text={diff} />
              </div>
            ) : tab === 'history' && selectedCommit ? (
              <div className="github-workspace__commit-detail">
                <div className="github-workspace__commit-hero">
                  <span className="github-workspace__commit-badge">Commit</span>
                  <strong>{selectedCommit.summary}</strong>
                </div>
                <div className="github-workspace__commit-meta">
                  <span>{selectedCommit.author}</span>
                  {selectedCommit.authoredAt > 0 && (
                    <span>{new Date(selectedCommit.authoredAt).toLocaleString()}</span>
                  )}
                </div>
                <code title={selectedCommit.id}>{selectedCommit.id.slice(0, 12)}</code>
              </div>
            ) : (
              <div className="github-workspace-empty github-workspace-empty--detail">
                <span className="github-workspace-empty__mark" aria-hidden="true">
                  <Code size={22} />
                </span>
                <strong>
                  {tab === 'history' ? 'Pick a commit' : 'Pick a file'}
                </strong>
                <span>
                  {tab === 'history'
                    ? 'Select a commit from the list to see its details.'
                    : 'Select a changed file to review its diff.'}
                </span>
                {tab === 'changes' && repository && (
                  <button
                    type="button"
                    onClick={() =>
                      void openTarget({ target: 'repository', repositoryId: repository.id })
                    }
                  >
                    <FolderOpen size={13} /> Open repository folder
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      <footer className="github-workspace__footer">
        <div className="github-workspace__footer-left">
          <ActionsMenu
            side="top"
            align="start"
            groups={accountMenuGroups}
            trigger={
              <button
                type="button"
                className="zura-menu-trigger github-workspace__account-trigger"
                aria-label={`GitHub account @${state.account.login}`}
              >
                {state.account.avatarUrl
                  ? <img src={state.account.avatarUrl} alt="" />
                  : <GitHubMark size={17} />}
                <span>@{state.account.login}</span>
                <ChevronDown size={12} />
              </button>
            }
          />
        </div>

        <div className="github-workspace__footer-right">
          <ActionsMenu
            open={branchMenuOpen}
            onOpenChange={(open) => {
              if (open) setRepoMenuOpen(false)
              setBranchMenuOpen(open)
            }}
            side="top"
            align="end"
            groups={branchMenuGroups}
            emptyLabel={branchPickerView === 'branches' ? 'No branches' : 'No worktrees'}
            header={
              <div className="github-workspace__branch-switch" role="group" aria-label="Branch picker view">
                <button
                  type="button"
                  className={branchPickerView === 'branches' ? 'is-active' : undefined}
                  aria-pressed={branchPickerView === 'branches'}
                  onClick={() => setBranchPickerView('branches')}
                >
                  Branches
                </button>
                <button
                  type="button"
                  className={branchPickerView === 'worktrees' ? 'is-active' : undefined}
                  aria-pressed={branchPickerView === 'worktrees'}
                  onClick={() => setBranchPickerView('worktrees')}
                >
                  Worktrees
                  {worktrees.length > 0 && <span>{worktrees.length}</span>}
                </button>
              </div>
            }
            disabled={!repository || Boolean(busy)}
            trigger={
              <button
                type="button"
                className="zura-menu-trigger github-workspace__branch-btn"
                title="Branches and worktrees"
                disabled={!repository || Boolean(busy)}
              >
                <Code size={12} />
                <span>{branchLabel}</span>
                <ChevronDown size={11} />
              </button>
            }
          />
          <span className="github-workspace__footer-sep" aria-hidden="true" />

          <button
            type="button"
            className={`github-workspace__footer-btn github-workspace__footer-btn--fetch ${busy?.startsWith('Fetch') ? 'is-busy' : ''}`}
            disabled={!repository || Boolean(busy)}
            aria-busy={busy?.startsWith('Fetch') || undefined}
            aria-label={busy?.startsWith('Fetch') ? 'Fetching' : 'Fetch'}
            onClick={() =>
              repository && void mutate({ type: 'fetch', repositoryId: repository.id }, 'Fetching…')
            }
          >
            <RefreshCcw size={12} className={busy?.startsWith('Fetch') ? 'is-spinning' : undefined} />
            {/* Keep label width stable — only the icon spins while busy. */}
            <span className="github-workspace__footer-btn-label">Fetch</span>
          </button>
          <span className="github-workspace__footer-sep" aria-hidden="true" />

          <button
            type="button"
            className={`github-workspace__footer-btn github-workspace__footer-btn--sync ${busy && /Push|Pull/.test(busy) ? 'is-busy' : ''}`}
            disabled={!repository || Boolean(busy)}
            aria-busy={(busy && /Push|Pull/.test(busy)) || undefined}
            aria-label={busy && /Push|Pull/.test(busy) ? busy.replace(/…$/, '') : syncLabel}
            onClick={() => {
              if (!repository) return
              const isPull = repository.behind > 0
              void mutate(
                { type: isPull ? 'pull' : 'push', repositoryId: repository.id },
                isPull ? 'Pulling…' : 'Pushing…'
              )
            }}
          >
            <Cloud size={12} className={busy && /Push|Pull/.test(busy) ? 'is-spinning' : undefined} />
            <span className="github-workspace__footer-btn-label">{syncLabel}</span>
          </button>
          <span className="github-workspace__footer-sep" aria-hidden="true" />

          <ActionsMenu
            open={repoMenuOpen}
            onOpenChange={(open) => {
              if (open) setBranchMenuOpen(false)
              setRepoMenuOpen(open)
            }}
            side="top"
            align="end"
            filterable
            filterPlaceholder="Filter repositories"
            emptyLabel="No matching repositories"
            groups={repoMenuGroups}
            header={
              <button type="button" onClick={() => void addRepository()}>
                <Plus size={14} />
                Add
              </button>
            }
            trigger={
              <button type="button" className="zura-menu-trigger github-workspace__repo-trigger" disabled={Boolean(busy)}>
                <Folder size={12} />
                <span>{repository?.alias || repository?.name || 'Repository'}</span>
                <ChevronDown size={12} />
              </button>
            }
          />
        </div>
      </footer>

      <style>{workspaceStyles}</style>
    </section>
  )
}

const authStyles = `
  .github-workspace--auth { height: 100%; min-height: 0; display: grid; place-items: center; color: rgba(255,247,244,.92); background: transparent; }
  .github-workspace-auth { width: min(380px, calc(100% - 48px)); display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .github-workspace-auth__mark { display: grid; place-items: center; margin-bottom: 4px; color: rgba(255,241,236,.88); }
  .github-workspace-auth strong { font-size: 21px; letter-spacing: -.02em; }
  .github-workspace-auth p { max-width: 330px; margin: 0; color: rgba(255,236,230,.5); font-size: 12px; line-height: 1.55; }
  .github-workspace-auth__error { color: #f2aaa0; font-size: 11px; line-height: 1.4; }
  .github-workspace-auth__continue { position: relative; width: 220px; height: 38px; display: grid; place-items: center; margin-top: 7px; padding: 0 14px; border: 1px solid rgba(255,239,232,.15); border-radius: 7px; background: rgba(255,245,241,.065); color: rgba(255,244,240,.9); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; box-shadow: inset 0 1px rgba(255,255,255,.025); }
  .github-workspace-auth__continue:hover { border-color: rgba(201,146,131,.48); background: rgba(201,146,131,.12); color: rgba(255,248,245,.98); }
  .github-workspace-auth__continue:focus-visible { border-color: rgba(201,146,131,.72); outline: 2px solid rgba(201,146,131,.18); outline-offset: 2px; }
  .github-workspace-auth__continue:disabled { opacity: .48; cursor: default; }
  .github-workspace-auth__device { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .github-workspace-auth__code { padding: 5px 9px; border: 1px solid rgba(255,239,232,.14); border-radius: 6px; background: rgba(255,245,241,.06); color: rgba(255,247,244,.94); font: 700 17px/1.2 'Cascadia Code','SFMono-Regular',Consolas,monospace; letter-spacing: .12em; cursor: pointer; }
  .github-workspace-auth__code:hover, .github-workspace-auth__code:focus-visible { border-color: rgba(201,146,131,.58); background: rgba(201,146,131,.1); outline: none; }
  .github-workspace-auth__waiting { display: flex; align-items: center; gap: 9px; margin-top: 6px; }
  .github-workspace-auth__waiting span { height: 32px; display: inline-flex; align-items: center; gap: 7px; padding: 0 11px; border: 1px solid rgba(255,239,232,.12); border-radius: 7px; color: rgba(255,241,236,.68); font-size: 10px; }
  .github-workspace-auth__waiting svg { animation: github-auth-spin .9s linear infinite; }
  .github-workspace-auth__waiting button { height: 30px; padding: 0 8px; border: 0; background: transparent; color: rgba(255,236,230,.52); font: inherit; font-size: 10px; cursor: pointer; }
  .github-workspace-auth__waiting button:hover, .github-workspace-auth__waiting button:focus-visible { color: rgba(255,244,240,.88); outline: none; }
  .github-workspace-auth small { margin-top: 4px; color: rgba(255,236,230,.34); font-size: 10px; }
  @keyframes github-auth-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .github-workspace-auth__waiting svg { animation: none; } }
`

const workspaceStyles = `
  /* Theme tokens only — same palette as main window menus/controls. */
  .github-workspace {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--theme-text-primary);
    background: transparent;
    font-family: var(--font-sans, inherit);
  }
  .github-workspace button,
  .github-workspace input {
    font: inherit;
    color: inherit;
  }
  .github-workspace button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
  }
  .github-workspace button:hover:not(:disabled):not(.github-workspace__change-row):not(.github-workspace__history-row),
  .github-workspace button:focus-visible:not(.github-workspace__change-row):not(.github-workspace__history-row) {
    background: var(--theme-surface-hover);
    outline: none;
  }
  .github-workspace button:disabled {
    opacity: .48;
    cursor: default;
  }

  .github-workspace__error {
    flex: none;
    padding: 6px 12px;
    background: var(--theme-error-bg);
    color: var(--theme-error);
    font-size: 11px;
  }

  .github-workspace__body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: 300px 5px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  .github-workspace__body.is-resizing {
    cursor: col-resize;
    user-select: none;
  }
  .github-workspace__body.is-resizing * {
    cursor: col-resize !important;
    user-select: none !important;
  }
  .github-workspace__sidebar {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: transparent;
  }
  .github-workspace__splitter {
    position: relative;
    z-index: 2;
    width: 5px;
    min-width: 5px;
    cursor: col-resize;
    touch-action: none;
    background: transparent;
  }
  .github-workspace__splitter::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 1px;
    background: var(--theme-border);
    opacity: 0.9;
    transition: background-color 120ms ease, opacity 120ms ease, width 120ms ease, left 120ms ease, box-shadow 120ms ease;
  }
  .github-workspace__splitter:hover::before,
  .github-workspace__splitter:focus-visible::before,
  .github-workspace__body.is-resizing .github-workspace__splitter::before {
    left: 1px;
    width: 3px;
    background: var(--theme-accent);
    opacity: 1;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }
  .github-workspace__splitter:focus-visible {
    outline: none;
  }
  .github-workspace__tabs {
    flex: none;
    display: flex;
    align-items: stretch;
    min-width: 0;
    height: 34px;
    border-bottom: 1px solid var(--theme-border);
  }
  .github-workspace__tabs button {
    flex: 1 1 0;
    min-width: 0;
    justify-content: center;
    gap: 5px;
    padding: 0 8px;
    border-radius: 0;
    color: var(--theme-text-muted);
    font-size: 12px;
    font-weight: 500;
  }
  .github-workspace__tabs button.is-active {
    color: var(--theme-text-primary);
    font-weight: 600;
    box-shadow: inset 0 -2px var(--theme-accent);
  }
  .github-workspace__tab-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .github-workspace__tab-count {
    flex: none;
    min-width: 16px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--theme-surface-subtle);
    color: var(--theme-text-secondary);
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
  }
  .github-workspace__list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: 4px 4px 6px;
  }
  .github-workspace__list-empty {
    padding: 14px 10px;
    color: var(--theme-text-muted);
    font-size: 12px;
    text-align: center;
  }
  .github-workspace__change-row {
    width: 100%;
    box-sizing: border-box;
    min-height: 28px;
    height: 28px;
    display: grid;
    grid-template-columns: auto minmax(0,1fr) auto;
    gap: 7px;
    align-items: center;
    padding: 0 8px;
    margin: 0;
    border-radius: 6px;
    text-align: left;
    font-size: 12px;
    line-height: 1.2;
  }
  /* Soft inset highlight with room around the row — not flush to the panel edge. */
  .github-workspace__change-row:hover:not(:disabled),
  .github-workspace__history-row:hover:not(:disabled),
  .github-workspace__change-row:focus-visible,
  .github-workspace__history-row:focus-visible {
    background: color-mix(in srgb, var(--theme-text-primary) 7%, transparent);
    outline: none;
  }
  .github-workspace__change-row.is-selected,
  .github-workspace__history-row.is-selected {
    background: var(--theme-selection-bg);
    color: var(--theme-selection-text, var(--theme-text-primary));
  }
  .github-workspace__change-row.is-selected:hover:not(:disabled),
  .github-workspace__history-row.is-selected:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-selection-bg) 88%, var(--theme-text-primary));
  }
  .github-workspace__change-row input {
    width: 13px;
    height: 13px;
    margin: 0;
    accent-color: var(--theme-accent);
  }
  .github-workspace__change-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .github-workspace__change-row em {
    color: var(--theme-accent);
    font-size: 10.5px;
    font-style: normal;
    font-weight: 600;
  }
  .github-workspace__history-row {
    width: 100%;
    box-sizing: border-box;
    min-height: 36px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 1px;
    padding: 5px 8px;
    border-radius: 6px;
    text-align: left;
  }
  .github-workspace__history-summary {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: var(--theme-text-primary);
  }
  .github-workspace__history-meta {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-muted);
    font-size: 10.5px;
    line-height: 1.25;
  }
  .github-workspace__detail {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: transparent;
  }
  .github-workspace__detail-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .github-workspace__detail-toolbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 10px 0 12px;
    border-bottom: 1px solid var(--theme-border);
    background: color-mix(in srgb, var(--theme-surface) 35%, transparent);
  }
  .github-workspace__detail-identity {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .github-workspace__status-pill {
    flex: none;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
    color: var(--theme-accent);
    font-size: 10px;
    font-style: normal;
    font-weight: 600;
  }
  .github-workspace__detail-titles {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .github-workspace__detail-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-primary);
    font-size: 12.5px;
    font-weight: 500;
  }
  .github-workspace__detail-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-muted);
    font-size: 10.5px;
  }
  .github-workspace__diff-stats {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 600 11px/1 'Cascadia Code','SFMono-Regular',Consolas,monospace;
  }
  .github-workspace__diff-stats .is-add {
    color: color-mix(in srgb, var(--theme-success, #3dd68c) 92%, white);
  }
  .github-workspace__diff-stats .is-del {
    color: color-mix(in srgb, var(--theme-error, #ff7b72) 92%, white);
  }
  .github-workspace__actions-trigger.zura-menu-trigger {
    flex: none;
    height: 28px;
    min-height: 28px;
    gap: 5px;
    padding: 0 9px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 500;
    color: var(--theme-text-secondary);
    box-shadow: none;
  }
  .github-workspace__diff {
    flex: 1;
    min-height: 0;
    min-width: 0;
    margin: 0;
    padding: 6px 0 12px;
    overflow: auto;
    font: 11.5px/1.55 'Cascadia Code','SFMono-Regular',Consolas,monospace;
    tab-size: 2;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--theme-background) 55%, transparent), transparent 28px),
      transparent;
  }
  .github-workspace__diff-line {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    min-height: 1.55em;
  }
  .github-workspace__diff-gutter {
    padding: 0 8px 0 10px;
    border-right: 1px solid color-mix(in srgb, var(--theme-border) 70%, transparent);
    color: color-mix(in srgb, var(--theme-text-muted) 70%, transparent);
    text-align: right;
    user-select: none;
    font-size: 10px;
    line-height: inherit;
  }
  .github-workspace__diff-code {
    padding: 0 12px 0 10px;
    white-space: pre;
    overflow-wrap: normal;
    color: var(--theme-text-secondary);
  }
  .github-workspace__diff-line.is-add {
    background: color-mix(in srgb, var(--theme-success, #238636) 14%, transparent);
  }
  .github-workspace__diff-line.is-add .github-workspace__diff-code {
    color: color-mix(in srgb, var(--theme-success, #3dd68c) 88%, var(--theme-text-primary));
  }
  .github-workspace__diff-line.is-add .github-workspace__diff-gutter {
    background: color-mix(in srgb, var(--theme-success, #238636) 12%, transparent);
    color: color-mix(in srgb, var(--theme-success, #3dd68c) 70%, var(--theme-text-muted));
  }
  .github-workspace__diff-line.is-del {
    background: color-mix(in srgb, var(--theme-error, #da3633) 14%, transparent);
  }
  .github-workspace__diff-line.is-del .github-workspace__diff-code {
    color: color-mix(in srgb, var(--theme-error, #ff7b72) 88%, var(--theme-text-primary));
  }
  .github-workspace__diff-line.is-del .github-workspace__diff-gutter {
    background: color-mix(in srgb, var(--theme-error, #da3633) 12%, transparent);
    color: color-mix(in srgb, var(--theme-error, #ff7b72) 70%, var(--theme-text-muted));
  }
  .github-workspace__diff-line.is-hunk {
    background: color-mix(in srgb, var(--theme-info, #388bfd) 10%, transparent);
  }
  .github-workspace__diff-line.is-hunk .github-workspace__diff-code {
    color: color-mix(in srgb, var(--theme-info, #79c0ff) 85%, var(--theme-text-primary));
    font-weight: 600;
  }
  .github-workspace__diff-line.is-meta .github-workspace__diff-code {
    color: var(--theme-text-muted);
  }
  .github-workspace__diff-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 24px;
    color: var(--theme-text-muted);
    text-align: center;
  }
  .github-workspace__diff-empty span {
    color: var(--theme-text-secondary);
    font-size: 12.5px;
    font-weight: 600;
  }
  .github-workspace__diff-empty small {
    max-width: 260px;
    font-size: 11px;
    line-height: 1.45;
  }
  .github-workspace__commit-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 22px 20px;
  }
  .github-workspace__commit-hero {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .github-workspace__commit-badge {
    display: inline-flex;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
    color: var(--theme-accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .github-workspace__commit-detail strong {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--theme-text-primary);
  }
  .github-workspace__commit-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    color: var(--theme-text-muted);
    font-size: 11.5px;
  }
  .github-workspace__commit-detail code {
    width: fit-content;
    max-width: 100%;
    padding: 5px 9px;
    border-radius: 8px;
    border: 1px solid var(--theme-border);
    background: var(--theme-surface-subtle);
    color: var(--theme-text-secondary);
    font: 11px/1.4 'Cascadia Code','SFMono-Regular',Consolas,monospace;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .github-workspace__footer {
    /* Match Command Center footer: same bar, no separate fill. */
    position: relative;
    z-index: 3;
    flex: 0 0 auto;
    height: 42px;
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0;
    padding: 0 8px 0 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    font-size: 12.5px;
  }
  .github-workspace__footer-left,
  .github-workspace__footer-right {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 6px 4px;
  }
  .github-workspace__footer-right {
    margin-left: auto;
  }
  .github-workspace__footer-sep {
    flex: none;
    width: 1px;
    height: 14px;
    margin: 0 2px;
    background: rgba(255, 255, 255, 0.15);
  }
  .github-workspace__branch-switch {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 2px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.045);
  }
  .github-workspace__branch-switch button {
    min-width: 0;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 9px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: rgba(255, 241, 246, 0.5);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .github-workspace__branch-switch button:hover,
  .github-workspace__branch-switch button:focus-visible {
    color: rgba(255, 249, 251, 0.86);
    outline: none;
  }
  .github-workspace__branch-switch button.is-active {
    background: rgba(255, 255, 255, 0.085);
    color: rgba(255, 249, 251, 0.94);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.055);
  }
  .github-workspace__branch-switch button span {
    min-width: 16px;
    padding: 1px 4px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 241, 246, 0.62);
    font-size: 9px;
    line-height: 1.3;
  }

  .github-workspace__branch-btn.zura-menu-trigger,
  .github-workspace__repo-trigger.zura-menu-trigger {
    height: 28px;
    min-height: 28px;
    max-width: 160px;
    gap: 6px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    box-shadow: none;
    color: rgba(255, 241, 246, 0.74);
    font-size: 12.5px;
    font-weight: 500;
  }
  .github-workspace__branch-btn.zura-menu-trigger:hover,
  .github-workspace__branch-btn.zura-menu-trigger:focus-visible,
  .github-workspace__branch-btn.zura-menu-trigger[data-state='open'],
  .github-workspace__repo-trigger.zura-menu-trigger:hover,
  .github-workspace__repo-trigger.zura-menu-trigger:focus-visible,
  .github-workspace__repo-trigger.zura-menu-trigger[data-state='open'] {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 249, 251, 0.92);
    box-shadow: none;
    border-color: transparent;
  }
  .github-workspace__branch-btn span,
  .github-workspace__repo-trigger span {
    min-width: 0;
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .github-workspace__footer-btn {
    flex: none;
    height: 28px;
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: rgba(255, 241, 246, 0.74);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease;
  }
  .github-workspace__footer-btn-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Reserve width for the longest usual sync label so counts don't jump layout. */
  .github-workspace__footer-btn--fetch {
    min-width: 4.75rem;
  }
  .github-workspace__footer-btn--sync {
    min-width: 5.75rem;
  }
  .github-workspace__footer-btn:hover:not(:disabled),
  .github-workspace__footer-btn:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 249, 251, 0.92);
    outline: none;
  }
  .github-workspace__footer-btn.is-busy {
    color: rgba(255, 249, 251, 0.92);
  }
  .github-workspace__footer-btn.is-busy .github-workspace__footer-btn-label {
    opacity: 0.88;
  }
  .github-workspace__footer-btn svg {
    flex: none;
  }
  .github-workspace__footer-btn svg.is-spinning {
    animation: github-auth-spin .85s linear infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .github-workspace__footer-btn svg.is-spinning { animation: none; }
  }
  .github-workspace__account-trigger.zura-menu-trigger {
    height: 28px;
    min-height: 28px;
    max-width: 180px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 5px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    box-shadow: none;
    color: rgba(255, 241, 246, 0.62);
    font-size: 12px;
    font-weight: 500;
  }
  .github-workspace__account-trigger img {
    width: 18px;
    height: 18px;
    flex: none;
    border-radius: 50%;
  }
  .github-workspace__account-trigger span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .github-workspace__account-trigger.zura-menu-trigger:hover,
  .github-workspace__account-trigger.zura-menu-trigger:focus-visible,
  .github-workspace__account-trigger.zura-menu-trigger[data-state='open'] {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 249, 251, 0.92);
    box-shadow: none;
    outline: none;
  }

  .github-workspace-empty {
    flex: 1;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    color: var(--theme-text-muted);
    text-align: center;
    font-size: 11px;
  }
  .github-workspace-empty--main,
  .github-workspace-empty--detail {
    min-height: 0;
  }
  .github-workspace-empty__mark {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    margin-bottom: 2px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    color: var(--theme-accent);
  }
  .github-workspace-empty strong {
    color: var(--theme-text-primary);
    font-size: 13px;
  }
  .github-workspace-empty button {
    margin-top: 3px;
    padding: 7px 12px;
    border-radius: 8px;
    background: var(--theme-accent-muted);
    color: var(--theme-text-primary);
  }
  .github-workspace-empty button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 28%, transparent);
  }
`
