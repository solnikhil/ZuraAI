import { useMemo, useState } from 'react'
import { ArrowUpRight, Puzzle, ShieldCheck, Sparkles } from 'lucide-react'

import {
  ZURA_STORE_CATEGORIES,
  ZURA_STORE_EXTENSIONS,
  type ZuraStoreCategory,
  type ZuraStoreExtension,
} from '../commandCenter/storeCatalog'

interface CommandCenterStoreProps {
  query: string
}

function StoreIcon({
  extension,
  large = false,
}: {
  extension: ZuraStoreExtension
  large?: boolean
}) {
  if (extension.id === 'spotify') {
    return (
      <span
        className={`zura-store-icon zura-store-icon--spotify ${large ? 'is-large' : ''}`}
        style={{ '--store-accent': extension.accent } as React.CSSProperties}
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 32" role="img">
          <path d="M7 11.4c6.8-2 13.8-1.3 18.2.9" />
          <path d="M8.3 16c5.7-1.5 11.7-.9 15.7.8" />
          <path d="M9.3 20.4c4.8-1 9.7-.5 13.2.9" />
        </svg>
      </span>
    )
  }

  return (
    <span
      className={`zura-store-icon ${large ? 'is-large' : ''}`}
      style={{ '--store-accent': extension.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      {extension.glyph}
    </span>
  )
}

export default function CommandCenterStore({ query }: CommandCenterStoreProps) {
  const [category, setCategory] = useState<ZuraStoreCategory>('All')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const featured = ZURA_STORE_EXTENSIONS.find((extension) => extension.featured)

  const filteredExtensions = useMemo(
    () =>
      ZURA_STORE_EXTENSIONS.filter((extension) => {
        const matchesCategory = category === 'All' || extension.category === category
        const searchText = [
          extension.name,
          extension.description,
          extension.category,
          ...extension.capabilities,
        ]
          .join(' ')
          .toLocaleLowerCase()
        return matchesCategory && (!normalizedQuery || searchText.includes(normalizedQuery))
      }),
    [category, normalizedQuery]
  )

  const listedExtensions = normalizedQuery
    ? filteredExtensions
    : filteredExtensions.filter((extension) => !extension.featured)

  return (
    <div className="zura-store" aria-label="Zura Store">
      <header className="zura-store-heading">
        <div>
          <span className="zura-store-eyebrow">
            <Sparkles size={12} /> Curated for Command Center
          </span>
          <h1>Zura Store</h1>
          <p>Add small superpowers to the place where your work already starts.</p>
        </div>
        <span className="zura-store-preview-badge">Preview</span>
      </header>

      {!normalizedQuery && category === 'All' && featured ? (
        <section className="zura-store-featured" aria-label="Featured extension">
          <div className="zura-store-featured__wash" aria-hidden="true" />
          <div className="zura-store-featured__copy">
            <span className="zura-store-featured__label">Featured extension</span>
            <h2>Music, without breaking your flow.</h2>
            <p>Play, pause, search, and move between playlists directly from Zura.</p>
            <div className="zura-store-capabilities" aria-label="Spotify capabilities">
              {featured.capabilities.map((capability) => (
                <span key={capability}>{capability}</span>
              ))}
            </div>
          </div>
          <div className="zura-store-featured__action">
            <StoreIcon extension={featured} large />
            <strong>{featured.name}</strong>
            <button type="button" disabled aria-label="Extension installation is coming soon">
              Coming soon
            </button>
          </div>
        </section>
      ) : null}

      <div className="zura-store-filterbar">
        <div className="zura-store-categories" role="group" aria-label="Extension categories">
          {ZURA_STORE_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? 'is-active' : ''}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="zura-store-count">
          {filteredExtensions.length} {filteredExtensions.length === 1 ? 'extension' : 'extensions'}
        </span>
      </div>

      {listedExtensions.length > 0 ? (
        <section className="zura-store-list" aria-label="Available extensions">
          {listedExtensions.map((extension) => (
            <article key={extension.id} className="zura-store-row">
              <StoreIcon extension={extension} />
              <div className="zura-store-row__copy">
                <div className="zura-store-row__title">
                  <h2>{extension.name}</h2>
                  <span>{extension.category}</span>
                </div>
                <p>{extension.description}</p>
              </div>
              <button type="button" disabled aria-label="Extension installation is coming soon">
                Soon
              </button>
            </article>
          ))}
        </section>
      ) : (
        <div className="zura-store-empty">
          <Puzzle size={24} />
          <strong>No extensions found</strong>
          <span>Try another search or category.</span>
        </div>
      )}

      <footer className="zura-store-note">
        <span>
          <ShieldCheck size={14} /> Extensions will show permissions before installation.
        </span>
        <span>
          Developer submissions <ArrowUpRight size={13} />
        </span>
      </footer>
    </div>
  )
}
