import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Cloud, Code, Clock, Plus, RefreshCcw } from 'lucide-react'
import type { GitHubWorkspaceState } from '../electron/types'

function GitHubMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  )
}

export default function GitHubWorkspace({ onSignedInChange }: { onSignedInChange?: (signedIn: boolean) => void }) {
  const [state, setState] = useState<GitHubWorkspaceState | null>(null)
  const [tab, setTab] = useState<'changes' | 'history'>('changes')
  const [selectedId, setSelectedId] = useState<string>()
  const [diff, setDiff] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState<string>()
  const repository = state?.repositories.find((item) => item.id === state.selectedRepositoryId)
  const selectedChange = state?.changes.find((item) => item.id === selectedId)
  const selectedCommit = state?.history.find((item) => item.id === selectedId)

  useEffect(() => {
    let active = true
    void window.githubWorkspace.getState().then((next) => active && setState(next)).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load GitHub Workspace.'))
    const dispose = window.githubWorkspace.onChanged(setState)
    return () => { active = false; dispose() }
  }, [])

  useEffect(() => {
    onSignedInChange?.(state?.account.status === 'signed_in')
  }, [onSignedInChange, state?.account.status])

  useEffect(() => {
    if (!repository || !selectedChange) { setDiff(''); return }
    void window.githubWorkspace.selectDiff(repository.id, selectedChange.id).then(setDiff).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load diff.'))
  }, [repository?.id, selectedChange?.id])

  const selectedCount = useMemo(() => state?.changes.filter((item) => item.selected).length ?? 0, [state?.changes])
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
    try { setState(await window.githubWorkspace.mutate(mutation)) } catch (e) { setError(e instanceof Error ? e.message : 'Git operation failed.') }
  }

  if (!state) return <div className="github-workspace-empty">Loading repository workspace…</div>

  if (state.account.status !== 'signed_in') {
    const signingAccount = state.account.status === 'signing_in' ? state.account : null
    const signingIn = Boolean(signingAccount)
    const setupRequired = state.account.status === 'signed_out' && state.account.setupRequired
    const setupMessage = state.account.status === 'signed_out'
      ? state.account.error || (setupRequired ? 'GitHub sign-in needs a ZuraAI OAuth client ID.' : undefined)
      : undefined
    return (
      <section className="github-workspace github-workspace--auth" aria-label="GitHub sign in">
        <div className="github-workspace-auth">
          <span className="github-workspace-auth__mark" aria-hidden="true">
            <GitHubMark size={44} />
          </span>
          <strong>{signingIn ? 'Complete sign in in your browser' : 'Sign in to GitHub'}</strong>
          <p>{signingIn ? 'Return here after authorizing ZuraAI on GitHub.' : 'Connect your account to access repositories, changes, history, and sync.'}</p>
          {setupMessage && <span className="github-workspace-auth__error" role="alert">{setupMessage}</span>}
          {signingIn ? (
            <div className="github-workspace-auth__device">
              <button className="github-workspace-auth__code" type="button" title="Copy code" onClick={() => signingAccount && void window.githubWorkspace.copyUserCode(signingAccount.userCode)}>{signingAccount?.userCode}</button>
              <div className="github-workspace-auth__waiting">
                <span><RefreshCcw size={14} /> Waiting for GitHub…</span>
                <button type="button" onClick={() => void window.githubWorkspace.signOut().then((account) => setState({ ...state, account }))}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="github-workspace-auth__continue" type="button" autoFocus disabled={setupRequired} onClick={beginSignIn}>
              <span>{setupRequired ? 'Sign-in setup required' : 'Continue with GitHub'}</span>
            </button>
          )}
          <small>Opens GitHub in your browser. ZuraAI never sees your password.</small>
        </div>
        <style>{`
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
        `}</style>
      </section>
    )
  }

  return (
    <section className="github-workspace" aria-label="GitHub Workspace">
      {error && <div className="github-workspace__error" role="alert">{error}</div>}
      {!repository ? <div className="github-workspace-empty"><Code size={28} /><strong>Add a Git repository</strong><span>Review changes, history, commits, and sync without leaving Command Center.</span><button type="button" onClick={() => void window.githubWorkspace.addRepository().then(setState)}>Choose folder</button></div> : (
        <div className="github-workspace__body">
          <aside className="github-workspace__sidebar">
            <div className="github-workspace__tabs">
              <button className={tab === 'changes' ? 'is-active' : ''} onClick={() => { setTab('changes'); setSelectedId(undefined) }}>Changes <span>{state.changes.length}</span></button>
              <button className={tab === 'history' ? 'is-active' : ''} onClick={() => { setTab('history'); setSelectedId(undefined) }}><Clock size={12} /> History</button>
            </div>
            <div className="github-workspace__list">
              {tab === 'changes' ? state.changes.map((change) => (
                <button key={change.id} className={change.id === selectedId ? 'is-selected' : ''} onClick={() => setSelectedId(change.id)}>
                  <input type="checkbox" checked={change.selected} onClick={(event) => event.stopPropagation()} onChange={(event) => void mutate({ type: 'select-change', repositoryId: repository.id, changeId: change.id, selected: event.target.checked })} />
                  <span title={change.path}>{change.path}</span><em>{change.status.trim() || 'M'}</em>
                </button>
              )) : state.history.map((commit) => (
                <button key={commit.id} className={commit.id === selectedId ? 'is-selected' : ''} onClick={() => setSelectedId(commit.id)}><span>{commit.summary}</span><small>{commit.author} · {new Date(commit.authoredAt).toLocaleDateString()}</small></button>
              ))}
            </div>
          </aside>
          <main className="github-workspace__detail">
            {tab === 'changes' && selectedChange ? <pre>{diff || 'No textual diff available for this file.'}</pre> : tab === 'history' && selectedCommit ? <div className="github-workspace__commit-detail"><strong>{selectedCommit.summary}</strong><code>{selectedCommit.id}</code><span>{selectedCommit.author}</span></div> : <div className="github-workspace-empty"><span>Select a {tab === 'changes' ? 'changed file' : 'commit'} to inspect it.</span></div>}
          </main>
        </div>
      )}

      <footer className="github-workspace__footer">
        <div className="github-workspace__brand"><GitHubMark size={15} /><strong>GitHub Workspace</strong></div>
        {repository && <><input className="github-workspace__message" value={summary} maxLength={10_000} onChange={(event) => setSummary(event.target.value)} placeholder={selectedCount ? `Commit ${selectedCount} selected file${selectedCount === 1 ? '' : 's'}…` : 'Commit message'} /><button className="github-workspace__commit" type="button" disabled={!summary.trim() || !selectedCount} onClick={() => void mutate({ type: 'commit', repositoryId: repository.id, summary }).then(() => setSummary(''))}><Check size={13} /> Commit</button></>}
        <label className="github-workspace__repo-picker">
          <span>{repository?.alias || repository?.name || 'Repository'}</span><ChevronDown size={12} />
          <select value={state.selectedRepositoryId ?? ''} onChange={(event) => void mutate({ type: 'select-repository', repositoryId: event.target.value })}>
            <option value="" disabled>Choose repository</option>
            {state.repositories.map((item) => <option key={item.id} value={item.id}>{item.alias || item.name}</option>)}
          </select>
        </label>
        <button type="button" title="Add local repository" aria-label="Add local repository" onClick={() => void window.githubWorkspace.addRepository().then(setState)}><Plus size={14} /></button>
        <span className="github-workspace__branch"><Code size={12} />{repository?.branch || 'No branch'}</span>
        <button type="button" disabled={!repository} onClick={() => repository && void mutate({ type: 'fetch', repositoryId: repository.id })}><RefreshCcw size={12} /> Fetch</button>
        <button type="button" disabled={!repository} onClick={() => repository && void mutate({ type: repository.behind > 0 ? 'pull' : 'push', repositoryId: repository.id })}><Cloud size={12} />{repository && repository.behind > 0 ? `Pull ${repository.behind}` : repository && repository.ahead > 0 ? `Push ${repository.ahead}` : 'Sync'}</button>
        <div className="github-workspace__footer-spacer" />
        <div className="github-workspace__account-actions">
          <span className="github-workspace__account">{state.account.avatarUrl && <img src={state.account.avatarUrl} alt="" />}@{state.account.login}</span>
          <button type="button" onClick={() => void window.githubWorkspace.disconnect().then((account) => setState({ ...state, account }))}>Disconnect</button>
        </div>
      </footer>
      <style>{`
        .github-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; color: rgba(255,247,244,.92); background: rgba(19,17,18,.58); }
        .github-workspace button, .github-workspace input, .github-workspace select { font: inherit; color: inherit; }
        .github-workspace button { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
        .github-workspace button:hover:not(:disabled), .github-workspace button:focus-visible { background: rgba(255,244,239,.09); outline: none; }
        .github-workspace button:disabled { opacity: .42; cursor: default; }
        .github-workspace__footer { flex: none; display: flex; align-items: center; border-color: rgba(255,239,232,.1); }
        .github-workspace__account { display: flex; align-items: center; gap: 8px; font-size: 12px; }
        .github-workspace__account { color: rgba(255,236,230,.6); }
        .github-workspace__account img { width: 20px; height: 20px; border-radius: 50%; }
        .github-workspace__footer-spacer { flex: 1 1 auto; min-width: 8px; }
        .github-workspace__account-actions { flex: none; min-height: 31px; display: flex; align-items: center; gap: 7px; padding-left: 8px; }
        .github-workspace__account-actions > button { padding: 4px 7px; color: rgba(255,236,230,.42); font-size: 9px; }
        .github-workspace__header button { padding: 5px 8px; font-size: 11px; }
        .github-workspace__repo-picker { position: relative; min-width: 88px; max-width: 120px; display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
        .github-workspace__repo-picker span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .github-workspace__repo-picker select { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .github-workspace__branch { display: flex; align-items: center; gap: 5px; color: rgba(255,236,230,.68); }
        .github-workspace__error { flex: none; padding: 6px 12px; background: rgba(149,52,46,.28); color: #ffd6d0; font-size: 11px; }
        .github-workspace__body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(170px, 36%) minmax(0, 1fr); }
        .github-workspace__sidebar { min-width: 0; display: flex; flex-direction: column; border-right: 1px solid rgba(255,239,232,.11); }
        .github-workspace__tabs { flex: none; display: grid; grid-template-columns: 1fr 1fr; height: 32px; border-bottom: 1px solid rgba(255,239,232,.1); }
        .github-workspace__tabs button { justify-content: center; border-radius: 0; color: rgba(255,236,230,.57); font-size: 11px; }
        .github-workspace__tabs button.is-active { color: rgba(255,247,244,.94); box-shadow: inset 0 -2px #c99283; }
        .github-workspace__tabs span { min-width: 16px; padding: 0 4px; border-radius: 8px; background: rgba(255,240,234,.1); font-size: 9px; }
        .github-workspace__list { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; }
        .github-workspace__list > button { width: 100%; min-height: 34px; display: grid; grid-template-columns: auto minmax(0,1fr) auto; gap: 7px; align-items: center; padding: 6px 9px; border-radius: 0; text-align: left; font-size: 10px; }
        .github-workspace__list > button.is-selected { background: rgba(201,146,131,.17); }
        .github-workspace__list input { accent-color: #c99283; }
        .github-workspace__list span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .github-workspace__list small { grid-column: 1 / -1; padding-left: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,236,230,.46); }
        .github-workspace__list em { color: #d7a18f; font-size: 9px; font-style: normal; }
        .github-workspace__detail { min-width: 0; min-height: 0; overflow: auto; background: rgba(10,9,10,.25); }
        .github-workspace__detail pre { min-width: max-content; margin: 0; padding: 12px; color: #e9ddd9; font: 10px/1.55 'Cascadia Code','SFMono-Regular',Consolas,monospace; white-space: pre; tab-size: 2; }
        .github-workspace__commit-detail { display: flex; flex-direction: column; gap: 10px; padding: 18px; }
        .github-workspace__commit-detail code, .github-workspace__commit-detail span { color: rgba(255,236,230,.55); font-size: 10px; }
        .github-workspace__footer { min-height: 42px; gap: 0; padding: 0 5px; border-top: 1px solid rgba(255,239,232,.11); font-size: 10px; }
        .github-workspace__footer > button, .github-workspace__footer > span, .github-workspace__repo-picker { min-height: 31px; padding: 0 8px; border-right: 1px solid rgba(255,239,232,.09); border-radius: 0; }
        .github-workspace__brand { min-width: 114px; min-height: 31px; display: flex; align-items: center; gap: 6px; padding: 0 9px; border-right: 1px solid rgba(255,239,232,.09); color: rgba(255,244,240,.78); white-space: nowrap; }
        .github-workspace__brand strong { font-size: 9.5px; font-weight: 680; }
        .github-workspace__footer input { flex: 1; min-width: 72px; height: 28px; box-sizing: border-box; padding: 0 8px; border: 0; border-right: 1px solid rgba(255,239,232,.09); border-radius: 0; outline: none; background: transparent; font-size: 10px; }
        .github-workspace__footer input:focus { border-color: rgba(201,146,131,.65); }
        .github-workspace__footer button.github-workspace__commit { padding: 0 8px; background: rgba(168,105,88,.72); color: #fff8f5; font-weight: 650; }
        .github-workspace-empty { flex: 1; min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 16px; color: rgba(255,236,230,.5); text-align: center; font-size: 11px; }
        .github-workspace-empty strong { color: rgba(255,247,244,.9); font-size: 13px; }
        .github-workspace-empty button { margin-top: 3px; padding: 7px 10px; background: rgba(201,146,131,.18); color: #f3d8d0; }
      `}</style>
    </section>
  )
}
