import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  Check,
  ChevronDown,
  Cloud,
  Code,
  Clock,
  ExternalLink,
  Folder,
  FolderOpen,
  Plus,
  RefreshCcw,
  Search,
} from 'lucide-react'
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
  const [selectedId, setSelectedId] = useState<string>()
  const [diff, setDiff] = useState('')
  const [error, setError] = useState<string>()
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [repoFilter, setRepoFilter] = useState('')
  const repoMenuRef = useRef<HTMLDivElement | null>(null)
  const repoFilterRef = useRef<HTMLInputElement | null>(null)
  const summaryRef = useRef(summary)
  summaryRef.current = summary

  const repository = state?.repositories.find((item) => item.id === state.selectedRepositoryId)
  const selectedChange = state?.changes.find((item) => item.id === selectedId)
  const selectedCommit = state?.history.find((item) => item.id === selectedId)

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
    })
  }, [onCommitMetaChange, repository, selectedCount, changeCount])

  useEffect(() => {
    if (!repository || !selectedChange) {
      setDiff('')
      return
    }
    void window.githubWorkspace
      .selectDiff(repository.id, selectedChange.id)
      .then(setDiff)
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load diff.'))
  }, [repository?.id, selectedChange?.id])

  useEffect(() => {
    if (!repoMenuOpen) return
    const onPointer = (event: MouseEvent) => {
      if (!repoMenuRef.current?.contains(event.target as Node)) {
        setRepoMenuOpen(false)
        setRepoFilter('')
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRepoMenuOpen(false)
        setRepoFilter('')
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => repoFilterRef.current?.focus())
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [repoMenuOpen])

  const grouped = useMemo(
    () => groupRepositories(state?.repositories ?? [], repoFilter),
    [state?.repositories, repoFilter]
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

  const mutate = async (mutation: Parameters<typeof window.githubWorkspace.mutate>[0]) => {
    setError(undefined)
    try {
      setState(await window.githubWorkspace.mutate(mutation))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Git operation failed.')
    }
  }

  const performCommit = async () => {
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
    setError(undefined)
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
      setError(e instanceof Error ? e.message : 'Git operation failed.')
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
    setRepoFilter('')
    setSelectedId(undefined)
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
        <div className="github-workspace__body">
          <aside className="github-workspace__sidebar">
            <div className="github-workspace__tabs" role="tablist" aria-label="Repository views">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'changes'}
                className={tab === 'changes' ? 'is-active' : ''}
                onClick={() => {
                  setTab('changes')
                  setSelectedId(undefined)
                }}
              >
                File Changes
                <span>{state.changes.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'history'}
                className={tab === 'history' ? 'is-active' : ''}
                onClick={() => {
                  setTab('history')
                  setSelectedId(undefined)
                }}
              >
                <Clock size={12} /> History
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
                      aria-selected={change.id === selectedId}
                      className={change.id === selectedId ? 'is-selected' : ''}
                      onClick={() => setSelectedId(change.id)}
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
                    aria-selected={commit.id === selectedId}
                    className={commit.id === selectedId ? 'is-selected' : ''}
                    onClick={() => setSelectedId(commit.id)}
                  >
                    <span>{commit.summary}</span>
                    <small>
                      {commit.author} · {new Date(commit.authoredAt).toLocaleDateString()}
                    </small>
                  </button>
                ))
              )}
            </div>
          </aside>
          <main className="github-workspace__detail">
            {tab === 'changes' && selectedChange ? (
              <div className="github-workspace__detail-panel">
                <div className="github-workspace__detail-toolbar">
                  <span className="github-workspace__detail-path" title={selectedChange.path}>
                    {selectedChange.path}
                  </span>
                  <div className="github-workspace__detail-actions">
                    <button
                      type="button"
                      title="Open file in default application"
                      onClick={() =>
                        void openTarget({
                          target: 'file',
                          repositoryId: repository.id,
                          changeId: selectedChange.id,
                        })
                      }
                    >
                      <ExternalLink size={12} /> Open
                    </button>
                    <button
                      type="button"
                      title="Reveal in File Explorer"
                      onClick={() =>
                        void openTarget({
                          target: 'reveal',
                          repositoryId: repository.id,
                          changeId: selectedChange.id,
                        })
                      }
                    >
                      <FolderOpen size={12} /> Reveal
                    </button>
                  </div>
                </div>
                <pre className="github-workspace__diff">{diff || 'No textual diff available for this file.'}</pre>
              </div>
            ) : tab === 'history' && selectedCommit ? (
              <div className="github-workspace__commit-detail">
                <strong>{selectedCommit.summary}</strong>
                <code>{selectedCommit.id}</code>
                <span>{selectedCommit.author}</span>
                <span>{new Date(selectedCommit.authoredAt).toLocaleString()}</span>
              </div>
            ) : (
              <div className="github-workspace-empty">
                <span>
                  Select a {tab === 'changes' ? 'changed file' : 'commit'} to inspect it.
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
          <div className="github-workspace__brand" title="GitHub Workspace">
            <GitHubMark size={15} />
          </div>

          <button
            type="button"
            className="github-workspace__footer-btn github-workspace__branch-btn"
            title={branchLabel}
            disabled={!repository}
            onClick={() =>
              repository && void openTarget({ target: 'repository', repositoryId: repository.id })
            }
          >
            <Code size={12} />
            <span>{branchLabel}</span>
          </button>

          <button
            type="button"
            className="github-workspace__footer-btn"
            disabled={!repository}
            onClick={() => repository && void mutate({ type: 'fetch', repositoryId: repository.id })}
          >
            <RefreshCcw size={12} /> Fetch
          </button>
          <button
            type="button"
            className="github-workspace__footer-btn"
            disabled={!repository}
            onClick={() =>
              repository &&
              void mutate({
                type: repository.behind > 0 ? 'pull' : 'push',
                repositoryId: repository.id,
              })
            }
          >
            <Cloud size={12} />
            {syncLabel}
          </button>
        </div>

        <div className="github-workspace__footer-right">
          <div className="github-workspace__repo-picker" ref={repoMenuRef}>
            <button
              type="button"
              className="github-workspace__repo-trigger"
              aria-haspopup="listbox"
              aria-expanded={repoMenuOpen}
              onClick={() => setRepoMenuOpen((open) => !open)}
            >
              <Folder size={12} />
              <span>{repository?.alias || repository?.name || 'Repository'}</span>
              <ChevronDown size={12} />
            </button>
            {repoMenuOpen && (
              <div className="github-workspace__repo-menu" role="listbox" aria-label="Repositories">
                <div className="github-workspace__repo-menu-head">
                  <div className="github-workspace__repo-menu-search">
                    <Search size={12} />
                    <input
                      ref={repoFilterRef}
                      value={repoFilter}
                      onChange={(event) => setRepoFilter(event.target.value)}
                      placeholder="Filter"
                      aria-label="Filter repositories"
                    />
                  </div>
                  <button type="button" className="github-workspace__repo-add" onClick={() => void addRepository()}>
                    <Plus size={12} /> Add
                  </button>
                </div>
                <div className="github-workspace__repo-menu-scroll">
                  {grouped.recent.length > 0 && (
                    <div className="github-workspace__repo-group">
                      <h3>Recent</h3>
                      {grouped.recent.map((item) => (
                        <button
                          key={`recent-${item.id}`}
                          type="button"
                          role="option"
                          aria-selected={item.id === state.selectedRepositoryId}
                          className={item.id === state.selectedRepositoryId ? 'is-current' : ''}
                          onClick={() => void selectRepository(item.id)}
                        >
                          <Code size={13} />
                          <span>
                            <strong>{item.alias || item.name}</strong>
                            <small>
                              {item.owner ? `${item.owner}/` : ''}
                              {item.name}
                              {item.branch ? ` · ${item.branch}` : ''}
                            </small>
                          </span>
                          {item.id === state.selectedRepositoryId && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                  {grouped.byOwner.map(([owner, repos]) => (
                    <div key={owner} className="github-workspace__repo-group">
                      <h3>{owner}</h3>
                      {repos.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={item.id === state.selectedRepositoryId}
                          className={item.id === state.selectedRepositoryId ? 'is-current' : ''}
                          onClick={() => void selectRepository(item.id)}
                        >
                          <Code size={13} />
                          <span>
                            <strong>{item.alias || item.name}</strong>
                            <small title={item.path}>{item.path}</small>
                          </span>
                          {item.id === state.selectedRepositoryId && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  ))}
                  {state.repositories.length === 0 && (
                    <div className="github-workspace__repo-empty">
                      No repositories yet. Click Add to choose a local folder.
                    </div>
                  )}
                  {state.repositories.length > 0 &&
                    grouped.recent.length === 0 &&
                    grouped.byOwner.length === 0 && (
                      <div className="github-workspace__repo-empty">No matching repositories.</div>
                    )}
                </div>
              </div>
            )}
          </div>

          <div className="github-workspace__account-actions">
            <span className="github-workspace__account">
              {state.account.avatarUrl && <img src={state.account.avatarUrl} alt="" />}@
              {state.account.login}
            </span>
            <button
              type="button"
              onClick={() =>
                void window.githubWorkspace
                  .disconnect()
                  .then((account) => setState({ ...state, account }))
              }
            >
              Disconnect
            </button>
          </div>
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
  .github-workspace-auth__continue { position: relative; width: 220px; height: 38px; display: grid; place-items: center; margin-top: 7px; padding: 0 14px; border: 1px solid rgba(255,239,232,.15); border-radius: 7px; background: rgba(255,245,241,.065); color: rgba(255,244,240,.9); font: inherit; font-size: 11.5px; font-weight: 680; cursor: pointer; box-shadow: inset 0 1px rgba(255,255,255,.025); }
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
  .github-workspace {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: rgba(255,247,244,.92);
    background: transparent;
  }
  .github-workspace button, .github-workspace input {
    font: inherit;
    color: inherit;
  }
  .github-workspace button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
  }
  .github-workspace button:hover:not(:disabled),
  .github-workspace button:focus-visible {
    background: rgba(255,244,239,.09);
    outline: none;
  }
  .github-workspace button:disabled {
    opacity: .42;
    cursor: default;
  }

  .github-workspace__error {
    flex: none;
    padding: 6px 12px;
    background: rgba(149,52,46,.28);
    color: #ffd6d0;
    font-size: 11px;
  }

  .github-workspace__body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(280px, 46%) minmax(0, 1fr);
  }
  .github-workspace__sidebar {
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid rgba(255,239,232,.11);
    background: transparent;
  }
  .github-workspace__tabs {
    flex: none;
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 38px;
    border-bottom: 1px solid rgba(255,239,232,.1);
  }
  .github-workspace__tabs button {
    justify-content: center;
    border-radius: 0;
    color: rgba(255,236,230,.57);
    font-size: 12.5px;
    font-weight: 600;
  }
  .github-workspace__tabs button.is-active {
    color: rgba(255,247,244,.94);
    box-shadow: inset 0 -2px #c99283;
  }
  .github-workspace__tabs span {
    min-width: 18px;
    padding: 0 5px;
    border-radius: 8px;
    background: rgba(255,240,234,.1);
    font-size: 10.5px;
  }
  .github-workspace__list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    scrollbar-width: thin;
  }
  .github-workspace__list-empty {
    padding: 18px 12px;
    color: rgba(255,236,230,.42);
    font-size: 12px;
    text-align: center;
  }
  .github-workspace__list > button {
    width: 100%;
    min-height: 40px;
    display: grid;
    grid-template-columns: auto minmax(0,1fr) auto;
    gap: 9px;
    align-items: center;
    padding: 8px 12px;
    border-radius: 0;
    text-align: left;
    font-size: 12.5px;
  }
  .github-workspace__list > button.is-selected {
    background: rgba(201,146,131,.17);
  }
  .github-workspace__list input {
    width: 14px;
    height: 14px;
    accent-color: #c99283;
  }
  .github-workspace__list span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .github-workspace__list small {
    grid-column: 1 / -1;
    padding-left: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255,236,230,.46);
    font-size: 11px;
  }
  .github-workspace__list em {
    color: #d7a18f;
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
  }
  .github-workspace__detail {
    min-width: 0;
    min-height: 0;
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
    gap: 8px;
    min-height: 34px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid rgba(255,239,232,.1);
  }
  .github-workspace__detail-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255,236,230,.62);
    font-size: 11px;
  }
  .github-workspace__detail-actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .github-workspace__detail-actions button {
    height: 26px;
    padding: 0 8px;
    color: rgba(255,236,230,.72);
    font-size: 10.5px;
    font-weight: 600;
  }
  .github-workspace__diff {
    flex: 1;
    min-height: 0;
    min-width: 0;
    margin: 0;
    padding: 12px;
    overflow: auto;
    color: #e9ddd9;
    font: 11px/1.55 'Cascadia Code','SFMono-Regular',Consolas,monospace;
    white-space: pre;
    tab-size: 2;
    background: transparent;
  }
  .github-workspace__commit-detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px;
  }
  .github-workspace__commit-detail code,
  .github-workspace__commit-detail span {
    color: rgba(255,236,230,.55);
    font-size: 10px;
  }

  .github-workspace__footer {
    flex: none;
    min-height: 44px;
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 0;
    padding: 0;
    border-top: 1px solid rgba(255,239,232,.11);
    background: transparent;
    font-size: 10px;
  }
  .github-workspace__footer-left,
  .github-workspace__footer-right {
    display: flex;
    align-items: stretch;
    min-width: 0;
  }
  .github-workspace__footer-right {
    margin-left: auto;
  }
  .github-workspace__brand {
    flex: none;
    min-width: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid rgba(255,239,232,.09);
    color: rgba(255,244,240,.78);
  }

  .github-workspace__repo-picker {
    position: relative;
    flex: none;
    max-width: 160px;
  }
  .github-workspace__repo-trigger {
    width: 100%;
    height: 100%;
    min-height: 43px;
    min-width: 100px;
    max-width: 160px;
    justify-content: flex-start;
    gap: 6px;
    padding: 0 10px;
    border-left: 1px solid rgba(255,239,232,.09);
    border-right: 1px solid rgba(255,239,232,.09);
    border-radius: 0;
    font-weight: 600;
  }
  .github-workspace__branch-btn span {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .github-workspace__repo-trigger span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .github-workspace__repo-menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 6px);
    z-index: 40;
    width: min(340px, 72vw);
    max-height: min(420px, 58vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(255,239,232,.14);
    border-radius: 10px;
    /* Solid enough to stay readable over the acrylic shell; not a full-panel tint. */
    background: rgba(22,19,20,.94);
    box-shadow: 0 18px 48px rgba(0,0,0,.45);
  }
  .github-workspace__repo-menu-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-bottom: 1px solid rgba(255,239,232,.1);
  }
  .github-workspace__repo-menu-search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px;
    border: 1px solid rgba(255,239,232,.12);
    border-radius: 7px;
    background: rgba(255,245,241,.05);
    color: rgba(255,236,230,.55);
  }
  .github-workspace__repo-menu-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 11px;
  }
  .github-workspace__repo-add {
    flex: none;
    height: 30px;
    padding: 0 9px;
    border: 1px solid rgba(255,239,232,.12);
    border-radius: 7px;
    background: rgba(255,245,241,.05);
    font-size: 10.5px;
    font-weight: 650;
  }
  .github-workspace__repo-menu-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    scrollbar-width: thin;
  }
  .github-workspace__repo-group {
    padding: 6px 0 8px;
  }
  .github-workspace__repo-group h3 {
    margin: 0;
    padding: 6px 12px 4px;
    color: rgba(255,236,230,.42);
    font-size: 9.5px;
    font-weight: 650;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .github-workspace__repo-group > button {
    width: 100%;
    min-height: 40px;
    display: grid;
    grid-template-columns: auto minmax(0,1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 6px 12px;
    border-radius: 0;
    text-align: left;
  }
  .github-workspace__repo-group > button.is-current {
    background: rgba(201,146,131,.16);
  }
  .github-workspace__repo-group > button span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .github-workspace__repo-group > button strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 600;
  }
  .github-workspace__repo-group > button small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255,236,230,.42);
    font-size: 9.5px;
  }
  .github-workspace__repo-empty {
    padding: 18px 14px;
    color: rgba(255,236,230,.45);
    font-size: 11px;
    text-align: center;
  }

  .github-workspace__footer-btn {
    flex: none;
    min-height: 43px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border-right: 1px solid rgba(255,239,232,.09);
    border-radius: 0;
    color: rgba(255,236,230,.72);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .github-workspace__account-actions {
    flex: none;
    min-height: 43px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
  }
  .github-workspace__account {
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgba(255,236,230,.6);
    font-size: 11px;
  }
  .github-workspace__account img {
    width: 18px;
    height: 18px;
    border-radius: 50%;
  }
  .github-workspace__account-actions > button {
    padding: 4px 7px;
    color: rgba(255,236,230,.42);
    font-size: 9px;
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
    color: rgba(255,236,230,.5);
    text-align: center;
    font-size: 11px;
  }
  .github-workspace-empty--main {
    min-height: 0;
  }
  .github-workspace-empty strong {
    color: rgba(255,247,244,.9);
    font-size: 13px;
  }
  .github-workspace-empty button {
    margin-top: 3px;
    padding: 7px 12px;
    background: rgba(201,146,131,.18);
    color: #f3d8d0;
  }
`
