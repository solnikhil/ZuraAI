import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Check, Puzzle, ShieldCheck, Sparkles } from 'lucide-react'

import type { ZuraExtensionMutationReview, ZuraExtensionSummary } from '@/extensions/types'

interface CommandCenterStoreProps {
  query: string
  onOpenExtension: (extensionId: string, commandId: string, hostCapability?: string) => void
}

const permissionLabels: Record<string, string> = {
  'github.account': 'Connect your GitHub account',
  'git.repositories': 'Read and update repositories you add',
  'filesystem.repository-selection': 'Choose repository folders',
  'network.github.com': 'Connect to GitHub',
  'storage.local': 'Store extension data locally',
}

export default function CommandCenterStore({ query, onOpenExtension }: CommandCenterStoreProps) {
  const [extensions, setExtensions] = useState<ZuraExtensionSummary[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [review, setReview] = useState<ZuraExtensionMutationReview>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [developmentAvailable, setDevelopmentAvailable] = useState(false)
  const normalizedQuery = query.trim().toLowerCase()

  const refresh = async () => {
    try { setExtensions(await window.extensions.list()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load extensions.') }
  }
  useEffect(() => {
    void refresh()
    void window.appInfo.get().then((info) => setDevelopmentAvailable(!info.isPackaged))
    return window.extensions.onChanged(() => void refresh())
  }, [])

  const filtered = useMemo(() => extensions.filter(({ manifest }) => !normalizedQuery || [manifest.name, manifest.publisher, manifest.description, ...manifest.categories, ...manifest.commands.flatMap((command) => [command.title, ...command.keywords])].join(' ').toLowerCase().includes(normalizedQuery)), [extensions, normalizedQuery])

  const prepare = async (extension: ZuraExtensionSummary, action: 'install' | 'update' | 'uninstall') => {
    setBusy(true); setError(undefined)
    try { setReview(await window.extensions.prepareMutation(extension.manifest.id, action)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to prepare extension change.') }
    finally { setBusy(false) }
  }

  const confirm = async () => {
    if (!review) return
    setBusy(true); setError(undefined)
    try { setExtensions(await window.extensions.applyMutation(review.confirmationId)); setReview(undefined) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update extension.') }
    finally { setBusy(false) }
  }

  const toggleEnabled = async (extension: ZuraExtensionSummary) => {
    setBusy(true)
    try { setExtensions(await window.extensions.setEnabled(extension.manifest.id, !extension.enabled)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to change extension state.') }
    finally { setBusy(false) }
  }

  return <div className="zura-store" aria-label="Zura Store">
    <header className="zura-store-heading"><div><span className="zura-store-eyebrow"><Sparkles size={12} /> Curated for Command Center</span><h1>Zura Store</h1><p>Install small, permissioned products without leaving your flow.</p></div><span className="zura-store-preview-badge">Preview</span></header>
    {error && <div className="zura-store-runtime-error" role="alert"><AlertTriangle size={13} /> {error}</div>}
    {review && <section className="zura-store-review" aria-label="Confirm extension change">
      <div><span>{review.action === 'uninstall' ? 'Confirm uninstall' : 'Review permissions'}</span><strong>{review.extension.manifest.name}</strong><small>{review.extension.manifest.publisher} · v{review.extension.manifest.version}</small></div>
      <ul>{review.action === 'uninstall' ? <li>Extension-owned settings and authorization will be removed. External user data will not be deleted.</li> : review.extension.manifest.permissions.map((permission) => <li key={permission}><Check size={12} /> {permissionLabels[permission] || permission}</li>)}</ul>
      <div className="zura-store-review__actions"><button type="button" onClick={() => setReview(undefined)}>Cancel</button><button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? 'Working…' : review.action === 'uninstall' ? 'Uninstall' : review.action === 'update' ? 'Confirm Update' : 'Confirm Install'}</button></div>
    </section>}
    <div className="zura-store-filterbar"><span className="zura-store-count">{filtered.length} {filtered.length === 1 ? 'extension' : 'extensions'}</span>{developmentAvailable && <button type="button" className="zura-store-dev-import" onClick={() => void window.extensions.importDevelopment().then(setExtensions).catch((cause) => setError(cause instanceof Error ? cause.message : 'Import failed.'))}>Import Development Extension</button>}</div>
    {filtered.length ? <section className="zura-store-list" aria-label="Available extensions">{filtered.map((extension) => {
      const manifest = extension.manifest
      const expanded = selectedId === manifest.id
      const command = manifest.commands[0]
      const hostCapability = command.entry.startsWith('host:') ? command.entry.slice(5) : undefined
      return <article key={manifest.id} className={`zura-store-row ${manifest.id === 'com.zuraai.github' ? 'zura-store-row--github' : ''} ${expanded ? 'is-expanded' : ''}`}>
        <button type="button" className="zura-store-row__summary" onClick={() => setSelectedId(expanded ? undefined : manifest.id)} aria-expanded={expanded}>
          <span className="zura-store-icon" aria-hidden="true">{extension.iconDataUrl ? <img src={extension.iconDataUrl} alt="" /> : manifest.name.slice(0, 2)}</span>
          <span className="zura-store-row__copy"><span className="zura-store-row__title"><strong>{manifest.name}</strong><em>{manifest.publisher}</em></span><small>{manifest.description}</small></span>
          <span className={`zura-store-trust is-${extension.trust}`}>{extension.trust}</span>
        </button>
        <div className="zura-store-row__actions">
          {extension.installed && extension.enabled && <button type="button" onClick={() => onOpenExtension(manifest.id, command.id, hostCapability)}>Open</button>}
          {!extension.installed ? <button type="button" disabled={busy || extension.validationErrors.length > 0} onClick={() => void prepare(extension, 'install')}>Install</button> : <>{extension.updateAvailable && <button type="button" disabled={busy || extension.validationErrors.length > 0} onClick={() => void prepare(extension, 'update')}>Update</button>}<button type="button" disabled={busy} onClick={() => void toggleEnabled(extension)}>{extension.enabled ? 'Disable' : 'Enable'}</button><button type="button" disabled={busy} onClick={() => void prepare(extension, 'uninstall')}>Uninstall</button></>}
        </div>
        {expanded && <div className="zura-store-row__details">
          <dl><div><dt>Version</dt><dd>{extension.updateAvailable ? `${extension.installedVersion} installed · ${manifest.version} available` : manifest.version}</dd></div><div><dt>Commands</dt><dd>{manifest.commands.map((item) => `${item.title} (${item.mode})`).join(', ')}</dd></div><div><dt>Privacy</dt><dd>{manifest.privacy?.dataLeavesDevice ? 'Connects to declared services' : 'Data stays on this device'}</dd></div>{manifest.networkDomains?.length ? <div><dt>Network</dt><dd>{manifest.networkDomains.join(', ')}</dd></div> : null}</dl>
          <div><strong>Permissions</strong><ul>{manifest.permissions.map((permission) => <li key={permission}>{permissionLabels[permission] || permission}</li>)}</ul></div>
          <div><strong>Version history</strong><p>{extension.changelogText?.trim() || 'No version notes provided.'}</p></div>
          {extension.validationErrors.length > 0 && <div className="zura-store-validation"><AlertTriangle size={12} /> {extension.validationErrors.join(' ')}</div>}
          {extension.source === 'development' && !extension.installed && <button type="button" onClick={() => void window.extensions.removeDevelopment(manifest.id).then(setExtensions)}>Remove Development Import</button>}
        </div>}
      </article>
    })}</section> : <div className="zura-store-empty"><Puzzle size={24} /><strong>No extensions found</strong><span>Try another search.</span></div>}
    <footer className="zura-store-note"><span><ShieldCheck size={14} /> Permission changes require a new confirmation.</span><span>Developer documentation <ArrowUpRight size={13} /></span></footer>
  </div>
}
