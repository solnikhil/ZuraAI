import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { AlertCircle, CheckCircle2, ChevronLeft, Loader2, MoreHorizontal, Search } from 'lucide-react'

import { ActionsMenu, type ActionsMenuGroup } from '@/components/ui/actions-menu'
import type { ZuraExtensionAction, ZuraExtensionFormField, ZuraExtensionView } from '@/extensions/types'

export default function CommandCenterExtensionHost({ extensionId, commandId }: { extensionId: string; commandId: string }) {
  const [view, setView] = useState<ZuraExtensionView>()
  const [history, setHistory] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const loadView = async (viewId?: string, push = false) => {
    setBusy(true)
    setError(undefined)
    try {
      const next = await window.extensions.getView(extensionId, commandId, viewId)
      if (push && view) setHistory((current) => [...current, view.id])
      setView(next)
      setQuery('')
      setValues({})
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load extension view.') }
    finally { setBusy(false) }
  }

  useEffect(() => { void loadView() }, [extensionId, commandId])

  const execute = async (action: ZuraExtensionAction, formValues = values) => {
    if (!view || busy) return
    setBusy(true)
    setError(undefined)
    const result = await window.extensions.executeAction(extensionId, commandId, view.id, action.id, formValues)
    setBusy(false)
    if (!result.ok) { setError(result.error || 'Extension action failed.'); return }
    if (result.view) {
      if (result.view.id !== view.id) setHistory((current) => [...current, view.id])
      setView(result.view)
      setQuery('')
      setValues({})
    }
  }

  const goBack = async () => {
    const target = history[history.length - 1]
    if (!target) return
    setHistory((current) => current.slice(0, -1))
    await loadView(target)
  }

  if (error && !view) return <State kind="error" title="Extension unavailable" description={error} onRetry={() => void loadView()} />
  if (!view) return <State kind="loading" title="Loading extension…" />

  return (
    <section className="zura-extension-host" aria-label={view.title} onKeyDown={(event) => { if (event.key === 'Escape' && history.length) { event.preventDefault(); event.stopPropagation(); void goBack() } }}>
      <header className="zura-extension-host__header">
        {history.length > 0 && <button type="button" onClick={() => void goBack()} aria-label="Back"><ChevronLeft size={15} /></button>}
        <strong>{view.title}</strong>
        {busy && <Loader2 size={13} className="is-spinning" aria-label="Working" />}
      </header>
      {error && <div className="zura-extension-host__error" role="alert"><AlertCircle size={13} /> {error}</div>}
      {view.kind === 'list' && <ListView view={view} query={query} setQuery={setQuery} execute={execute} />}
      {view.kind === 'detail' && <DetailView view={view} execute={execute} />}
      {view.kind === 'form' && <FormView view={view} values={values} setValues={setValues} execute={execute} busy={busy} />}
      {view.kind === 'empty' && <State kind="empty" title={view.title} description={view.description} actions={view.actions} execute={execute} />}
      {view.kind === 'loading' && <State kind="loading" title={view.title} description={view.description} />}
      {view.kind === 'progress' && <State kind="progress" title={view.title} description={view.description} progress={view.value} />}
      {view.kind === 'error' && <State kind="error" title={view.title} description={view.description} actions={view.actions} execute={execute} />}
      <style>{extensionStyles}</style>
    </section>
  )
}

function actionGroups(actions: ZuraExtensionAction[], execute: (action: ZuraExtensionAction) => void): ActionsMenuGroup[] {
  return [{ id: 'actions', items: actions.map((action) => ({ id: action.id, label: action.title, destructive: action.destructive, onSelect: () => execute(action) })) }]
}

function ListView({ view, query, setQuery, execute }: { view: Extract<ZuraExtensionView, { kind: 'list' }>; query: string; setQuery: (value: string) => void; execute: (action: ZuraExtensionAction) => void }) {
  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return view.sections
    return view.sections.map((section) => ({ ...section, items: section.items.filter((item) => `${item.title} ${item.subtitle ?? ''} ${(item.keywords ?? []).join(' ')}`.toLowerCase().includes(needle)) })).filter((section) => section.items.length)
  }, [query, view.sections])
  const count = sections.reduce((total, section) => total + section.items.length, 0)
  return <div className="zura-extension-list">
    <label className="zura-extension-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view.searchPlaceholder || 'Search'} aria-label={view.searchPlaceholder || 'Search extension'} /></label>
    <div className="zura-extension-list__scroll" role="listbox">
      {sections.map((section) => <section key={section.id}>{section.title && <h2>{section.title}</h2>}{section.items.map((item) => {
        const primary = item.actions?.[0]
        return <div key={item.id} className="zura-extension-item" role="option" aria-selected="false">
          <button type="button" onClick={() => primary && execute(primary)} disabled={!primary}><span><strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}</span>{item.detail && <em>{item.detail}</em>}</button>
          {item.actions && item.actions.length > 1 && <ActionsMenu side="left" align="start" groups={actionGroups(item.actions, execute)} trigger={<button type="button" className="zura-extension-item__more" aria-label={`Actions for ${item.title}`}><MoreHorizontal size={14} /></button>} />}
        </div>
      })}</section>)}
      {!count && <State kind="empty" title={view.empty?.title || 'No results'} description={view.empty?.description} />}
    </div>
  </div>
}

function DetailView({ view, execute }: { view: Extract<ZuraExtensionView, { kind: 'detail' }>; execute: (action: ZuraExtensionAction) => void }) {
  return <div className="zura-extension-detail"><div className="zura-extension-detail__markdown"><ReactMarkdown>{view.markdown}</ReactMarkdown></div>{view.actions?.length ? <div className="zura-extension-actions">{view.actions.map((action) => <button type="button" key={action.id} onClick={() => execute(action)}>{action.title}</button>)}</div> : null}</div>
}

function FormField({ field, value, onChange }: { field: ZuraExtensionFormField; value: string | boolean | undefined; onChange: (value: string | boolean) => void }) {
  if (field.type === 'checkbox') return <label className="zura-extension-checkbox"><input type="checkbox" checked={value === true || (value === undefined && field.defaultValue === true)} onChange={(event) => onChange(event.target.checked)} /> {field.title}</label>
  if (field.type === 'select') return <label><span>{field.title}</span><select value={typeof value === 'string' ? value : ''} required={field.required} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.title}</option>)}</select></label>
  if (field.type === 'textarea') return <label><span>{field.title}</span><textarea value={typeof value === 'string' ? value : ''} required={field.required} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} /></label>
  return <label><span>{field.title}</span><input type={field.type === 'password' ? 'password' : 'text'} value={typeof value === 'string' ? value : ''} required={field.required} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} /></label>
}

function FormView({ view, values, setValues, execute, busy }: { view: Extract<ZuraExtensionView, { kind: 'form' }>; values: Record<string, string | boolean>; setValues: React.Dispatch<React.SetStateAction<Record<string, string | boolean>>>; execute: (action: ZuraExtensionAction, values: Record<string, string | boolean>) => void; busy: boolean }) {
  const primary = view.actions[0]
  return <form className="zura-extension-form" onSubmit={(event) => { event.preventDefault(); if (primary) execute(primary, values) }}>{view.fields.map((field) => <FormField key={field.id} field={field} value={values[field.id]} onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))} />)}<div className="zura-extension-actions">{view.actions.map((action, index) => <button key={action.id} type={index === 0 ? 'submit' : 'button'} disabled={busy} onClick={index === 0 ? undefined : () => execute(action, values)}>{action.title}</button>)}</div></form>
}

function State({ kind, title, description, progress, actions, execute, onRetry }: { kind: 'empty' | 'loading' | 'progress' | 'error'; title: string; description?: string; progress?: number; actions?: ZuraExtensionAction[]; execute?: (action: ZuraExtensionAction) => void; onRetry?: () => void }) {
  return <div className={`zura-extension-state is-${kind}`}>{kind === 'loading' ? <Loader2 size={22} className="is-spinning" /> : kind === 'error' ? <AlertCircle size={22} /> : <CheckCircle2 size={22} />}<strong>{title}</strong>{description && <span>{description}</span>}{kind === 'progress' && <progress max={100} value={typeof progress === 'number' ? progress : undefined} />}{onRetry && <button type="button" onClick={onRetry}>Try Again</button>}{actions?.map((action) => <button type="button" key={action.id} onClick={() => execute?.(action)}>{action.title}</button>)}</div>
}

const extensionStyles = `
.zura-extension-host{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--theme-text-primary);background:transparent}.zura-extension-host__header{height:36px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.07);font-size:12px}.zura-extension-host__header button{width:25px;height:25px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:inherit}.zura-extension-host__header button:hover{background:rgba(255,255,255,.07)}.zura-extension-host__header .is-spinning{margin-left:auto}.zura-extension-host__error{display:flex;align-items:center;gap:6px;padding:7px 12px;background:rgba(184,73,73,.12);color:#f1aaa4;font-size:10.5px}.zura-extension-list,.zura-extension-detail{flex:1;min-height:0;display:flex;flex-direction:column}.zura-extension-search{height:34px;display:flex;align-items:center;gap:7px;margin:8px 10px 4px;padding:0 9px;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:rgba(255,255,255,.035);color:var(--theme-text-muted)}.zura-extension-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:inherit;font:inherit}.zura-extension-list__scroll{min-height:0;overflow:auto;padding:4px 10px 12px}.zura-extension-list__scroll h2{margin:9px 5px 5px;color:var(--theme-text-muted);font-size:9px;text-transform:uppercase;letter-spacing:.06em}.zura-extension-item{display:flex;align-items:center;border-radius:7px}.zura-extension-item:hover{background:rgba(255,255,255,.055)}.zura-extension-item>button:first-child{min-width:0;flex:1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border:0;background:transparent;color:inherit;text-align:left}.zura-extension-item button span{min-width:0;display:flex;flex-direction:column}.zura-extension-item strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px}.zura-extension-item small,.zura-extension-item em{color:var(--theme-text-muted);font-size:10px;font-style:normal}.zura-extension-item__more{width:28px;height:28px;display:grid;place-items:center;border:0;background:transparent;color:var(--theme-text-muted)}.zura-extension-detail__markdown{min-height:0;overflow:auto;padding:18px 20px;color:var(--theme-text-secondary);font-size:12px;line-height:1.55}.zura-extension-detail__markdown h1{margin:0 0 10px;color:var(--theme-text-primary);font-size:18px}.zura-extension-actions{display:flex;align-items:center;gap:7px;padding:10px 16px;border-top:1px solid rgba(255,255,255,.07)}.zura-extension-actions button,.zura-extension-state button{height:29px;padding:0 10px;border:1px solid rgba(255,255,255,.1);border-radius:6px;background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:10.5px}.zura-extension-form{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:16px}.zura-extension-form>label{display:flex;flex-direction:column;gap:5px;color:var(--theme-text-secondary);font-size:10.5px}.zura-extension-form input,.zura-extension-form textarea,.zura-extension-form select{border:1px solid rgba(255,255,255,.1);border-radius:7px;background:rgba(255,255,255,.045);color:var(--theme-text-primary);padding:8px;font:inherit}.zura-extension-form textarea{min-height:80px;resize:vertical}.zura-extension-checkbox{flex-direction:row!important;align-items:center}.zura-extension-form .zura-extension-actions{margin-top:auto;padding-inline:0}.zura-extension-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:24px;color:var(--theme-text-muted);text-align:center}.zura-extension-state strong{color:var(--theme-text-primary);font-size:13px}.zura-extension-state span{max-width:320px;font-size:10.5px;line-height:1.45}.zura-extension-state progress{width:180px}.is-spinning{animation:zura-extension-spin .85s linear infinite}@keyframes zura-extension-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.is-spinning{animation:none}}
`
