import React from 'react'

/**
 * Trusted skeleton templates for Command Center loading states.
 *
 * Extension authors pick a template on `loading` views via the serializable
 * `skeleton` field (no custom CSS/JS). First-party hosts (GitHub Workspace)
 * may also render these templates directly.
 */
export const COMMAND_CENTER_SKELETON_TEMPLATES = [
  'rows',
  'list',
  'detail',
  'form',
  'workspace',
  'emoji-grid',
] as const

export type CommandCenterSkeletonTemplate = (typeof COMMAND_CENTER_SKELETON_TEMPLATES)[number]

export function isCommandCenterSkeletonTemplate(
  value: unknown
): value is CommandCenterSkeletonTemplate {
  return (
    typeof value === 'string' &&
    (COMMAND_CENTER_SKELETON_TEMPLATES as readonly string[]).includes(value)
  )
}

export interface CommandCenterSkeletonProps {
  /** Template shape. Defaults to result rows. */
  template?: CommandCenterSkeletonTemplate
  /** Accessible label announced while content loads. */
  label?: string
  className?: string
}

function Bone({ className = '' }: { className?: string }): React.ReactElement {
  return <span className={`cc-skeleton__bone ${className}`.trim()} aria-hidden="true" />
}

function ResultRow(): React.ReactElement {
  return (
    <div className="cc-skeleton__row" aria-hidden="true">
      <Bone className="cc-skeleton__icon" />
      <span className="cc-skeleton__row-text">
        <Bone className="cc-skeleton__line cc-skeleton__line--title" />
        <Bone className="cc-skeleton__line cc-skeleton__line--sub" />
      </span>
      <Bone className="cc-skeleton__hint" />
    </div>
  )
}

function Group({
  rows = 3,
  withHeading = true,
}: {
  rows?: number
  withHeading?: boolean
}): React.ReactElement {
  return (
    <section className="cc-skeleton__group" aria-hidden="true">
      {withHeading ? <Bone className="cc-skeleton__heading" /> : null}
      {Array.from({ length: rows }, (_, index) => (
        <ResultRow key={index} />
      ))}
    </section>
  )
}

function RowsSkeleton(): React.ReactElement {
  return (
    <div className="cc-skeleton cc-skeleton--rows">
      <Group rows={3} />
      <Group rows={4} />
      <Group rows={2} />
    </div>
  )
}

function ListSkeleton(): React.ReactElement {
  return (
    <div className="cc-skeleton cc-skeleton--list">
      <div className="cc-skeleton__search" aria-hidden="true">
        <Bone className="cc-skeleton__search-icon" />
        <Bone className="cc-skeleton__search-field" />
      </div>
      <Group rows={5} withHeading={false} />
    </div>
  )
}

function DetailSkeleton(): React.ReactElement {
  return (
    <div className="cc-skeleton cc-skeleton--detail" aria-hidden="true">
      <Bone className="cc-skeleton__line cc-skeleton__line--hero" />
      <Bone className="cc-skeleton__line cc-skeleton__line--body" />
      <Bone className="cc-skeleton__line cc-skeleton__line--body" />
      <Bone className="cc-skeleton__line cc-skeleton__line--body-short" />
      <div className="cc-skeleton__actions">
        <Bone className="cc-skeleton__button" />
        <Bone className="cc-skeleton__button cc-skeleton__button--ghost" />
      </div>
    </div>
  )
}

function FormSkeleton(): React.ReactElement {
  return (
    <div className="cc-skeleton cc-skeleton--form" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="cc-skeleton__field">
          <Bone className="cc-skeleton__line cc-skeleton__line--label" />
          <Bone className="cc-skeleton__input" />
        </div>
      ))}
      <div className="cc-skeleton__actions">
        <Bone className="cc-skeleton__button" />
      </div>
    </div>
  )
}

function WorkspaceSkeleton(): React.ReactElement {
  return (
    <div className="cc-skeleton cc-skeleton--workspace" aria-hidden="true">
      <aside className="cc-skeleton__workspace-sidebar">
        <Bone className="cc-skeleton__line cc-skeleton__line--label" />
        <Bone className="cc-skeleton__tab" />
        <Bone className="cc-skeleton__tab" />
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="cc-skeleton__workspace-file">
            <Bone className="cc-skeleton__icon cc-skeleton__icon--sm" />
            <Bone className="cc-skeleton__line cc-skeleton__line--title" />
          </div>
        ))}
      </aside>
      <div className="cc-skeleton__workspace-main">
        <Bone className="cc-skeleton__line cc-skeleton__line--hero" />
        <Bone className="cc-skeleton__line cc-skeleton__line--body" />
        <Bone className="cc-skeleton__line cc-skeleton__line--body" />
        <Bone className="cc-skeleton__line cc-skeleton__line--body-short" />
        <Bone className="cc-skeleton__diff-block" />
        <Bone className="cc-skeleton__diff-block" />
      </div>
      <footer className="cc-skeleton__workspace-footer">
        <Bone className="cc-skeleton__button" />
        <Bone className="cc-skeleton__button" />
        <Bone className="cc-skeleton__button cc-skeleton__button--wide" />
      </footer>
    </div>
  )
}

function EmojiGridSkeleton(): React.ReactElement {
  return (
    <div className="cc-skeleton cc-skeleton--emoji" aria-hidden="true">
      <Bone className="cc-skeleton__heading" />
      <div className="cc-skeleton__emoji-grid">
        {Array.from({ length: 24 }, (_, index) => (
          <Bone key={index} className="cc-skeleton__emoji-cell" />
        ))}
      </div>
    </div>
  )
}

export function CommandCenterSkeleton({
  template = 'rows',
  label = 'Loading…',
  className = '',
}: CommandCenterSkeletonProps): React.ReactElement {
  const body = (() => {
    switch (template) {
      case 'list':
        return <ListSkeleton />
      case 'detail':
        return <DetailSkeleton />
      case 'form':
        return <FormSkeleton />
      case 'workspace':
        return <WorkspaceSkeleton />
      case 'emoji-grid':
        return <EmojiGridSkeleton />
      case 'rows':
      default:
        return <RowsSkeleton />
    }
  })()

  return (
    <div
      className={`cc-skeleton-host ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
    >
      <span className="cc-skeleton-sr-only">{label}</span>
      {body}
      <style>{skeletonStyles}</style>
    </div>
  )
}

const skeletonStyles = `
.cc-skeleton-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cc-skeleton-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.cc-skeleton {
  flex: 1;
  min-height: 0;
  padding: 8px 10px 14px;
}
.cc-skeleton__bone {
  display: block;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--theme-surface-hover) 72%, transparent) 0%,
    color-mix(in srgb, var(--theme-surface-active, var(--theme-surface-hover)) 88%, transparent) 45%,
    color-mix(in srgb, var(--theme-surface-hover) 72%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: cc-skeleton-shimmer 1.15s ease-in-out infinite;
}
.cc-skeleton__group + .cc-skeleton__group {
  margin-top: 10px;
}
.cc-skeleton__heading {
  width: 72px;
  height: 9px;
  margin: 8px 6px 8px;
  border-radius: 999px;
}
.cc-skeleton__row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 42px;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 6px 8px;
  border-radius: 8px;
}
.cc-skeleton__icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
}
.cc-skeleton__icon--sm {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}
.cc-skeleton__row-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.cc-skeleton__line {
  height: 8px;
  border-radius: 999px;
}
.cc-skeleton__line--title {
  width: min(58%, 220px);
}
.cc-skeleton__line--sub {
  width: min(38%, 140px);
  opacity: 0.85;
}
.cc-skeleton__line--label {
  width: 64px;
  height: 8px;
}
.cc-skeleton__line--hero {
  width: min(46%, 240px);
  height: 14px;
  margin-bottom: 10px;
}
.cc-skeleton__line--body {
  width: 92%;
  height: 9px;
  margin-bottom: 8px;
}
.cc-skeleton__line--body-short {
  width: 58%;
  height: 9px;
  margin-bottom: 14px;
}
.cc-skeleton__hint {
  width: 36px;
  height: 10px;
  border-radius: 999px;
  opacity: 0.75;
}
.cc-skeleton__search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  margin: 4px 2px 10px;
  padding: 0 9px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--theme-border) 70%, transparent);
  background: color-mix(in srgb, var(--theme-surface-hover) 42%, transparent);
}
.cc-skeleton__search-icon {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  flex: none;
}
.cc-skeleton__search-field {
  flex: 1;
  height: 10px;
  border-radius: 999px;
}
.cc-skeleton--detail,
.cc-skeleton--form {
  padding: 18px 16px;
}
.cc-skeleton__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.cc-skeleton__input {
  width: 100%;
  height: 32px;
  border-radius: 8px;
}
.cc-skeleton__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.cc-skeleton__button {
  width: 84px;
  height: 28px;
  border-radius: 7px;
}
.cc-skeleton__button--ghost {
  width: 72px;
  opacity: 0.75;
}
.cc-skeleton__button--wide {
  width: 110px;
}
.cc-skeleton--workspace {
  display: grid;
  grid-template-columns: minmax(120px, 34%) minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  height: 100%;
  min-height: 220px;
  padding: 0;
  gap: 0;
}
.cc-skeleton__workspace-sidebar {
  grid-row: 1;
  min-height: 0;
  overflow: hidden;
  padding: 12px 10px;
  border-right: 1px solid color-mix(in srgb, var(--theme-border) 70%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cc-skeleton__tab {
  width: 100%;
  height: 26px;
  border-radius: 7px;
}
.cc-skeleton__workspace-file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}
.cc-skeleton__workspace-file .cc-skeleton__line--title {
  width: 72%;
}
.cc-skeleton__workspace-main {
  grid-row: 1;
  min-height: 0;
  overflow: hidden;
  padding: 16px 14px;
}
.cc-skeleton__diff-block {
  width: 100%;
  height: 42px;
  margin-top: 10px;
  border-radius: 8px;
  opacity: 0.9;
}
.cc-skeleton__workspace-footer {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid color-mix(in srgb, var(--theme-border) 70%, transparent);
}
.cc-skeleton--emoji {
  padding: 10px 12px 16px;
}
.cc-skeleton__emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.cc-skeleton__emoji-cell {
  aspect-ratio: 1;
  border-radius: 8px;
}
@keyframes cc-skeleton-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cc-skeleton__bone {
    animation: none;
  }
}
`
