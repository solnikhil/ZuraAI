import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight } from '@/components/icons'
import { getWebImageSourceLabel } from '@/tools/ui/webToolDisplay'

/**
 * Web Search Image Carousel Component
 * Renders inline with the message flow—no card container, minimal chrome.
 * Uses smooth scroll animation when navigating between pages.
 */
export function WebSearchImageCarousel({
  images,
  mode,
}: {
  images: Array<{ url: string; description?: string }>
  mode: 'search' | 'extract' | 'mixed'
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const imagesPerPage = 4
  const totalPages = Math.ceil(images.length / imagesPerPage)
  const sourceLabel = getWebImageSourceLabel(mode)

  const scrollToPage = (page: number) => {
    const el = scrollRef.current
    if (!el) return
    const pageWidth = el.offsetWidth
    el.scrollTo({ left: page * pageWidth, behavior: 'smooth' })
    setCurrentPage(page)
  }

  const handlePrev = () => {
    const nextPage = currentPage <= 0 ? totalPages - 1 : currentPage - 1
    scrollToPage(nextPage)
  }

  const handleNext = () => {
    const nextPage = currentPage >= totalPages - 1 ? 0 : currentPage + 1
    scrollToPage(nextPage)
  }

  if (images.length === 0) return null

  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
          gap: '8px',
        }}
      >
        <span
          style={{
            color: 'var(--theme-text-muted)',
            fontSize: '0.8rem',
            fontWeight: 500,
          }}
        >
          {images.length} {images.length === 1 ? 'image' : 'images'} from {sourceLabel}
        </span>
        {images.length > imagesPerPage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <button
              onClick={handlePrev}
              type="button"
              aria-label="Previous images"
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 4px',
                cursor: 'pointer',
                color: 'var(--theme-text-muted)',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-secondary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-muted)'
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <span
              style={{
                color: 'var(--theme-text-muted)',
                fontSize: '0.7rem',
                minWidth: '32px',
                textAlign: 'center',
              }}
            >
              {currentPage + 1}/{totalPages}
            </span>
            <button
              onClick={handleNext}
              type="button"
              aria-label="Next images"
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 4px',
                cursor: 'pointer',
                color: 'var(--theme-text-muted)',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-secondary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-muted)'
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollBehavior: 'smooth',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          display: 'flex',
          gap: '6px',
          scrollSnapType: 'x mandatory',
        }}
        className="scrollbar-hide"
      >
        {images.map((img, idx) => (
          <a
            key={`${idx}-${img.url}`}
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: '0 0 calc((100% - 18px) / 4)',
              minWidth: 'calc((100% - 18px) / 4)',
              aspectRatio: '16/10',
              overflow: 'hidden',
              borderRadius: '6px',
              display: 'block',
              transition: 'opacity 0.15s',
              cursor: 'pointer',
              scrollSnapAlign: 'start',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
          >
            <img
              src={img.url}
              alt={img.description || `Search result image ${idx + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                borderRadius: 'inherit',
              }}
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </a>
        ))}
      </div>
    </div>
  )
}
