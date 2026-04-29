/**
 * Image component with placeholder support and optional deferred loading.
 */

import React, { useState, useCallback, useEffect, useRef, ImgHTMLAttributes } from 'react'
import { useLazyLoad, UseLazyLoadOptions } from '../../hooks/useLazyLoad'

/**
 * Placeholder types for the LazyImage component
 */
export type PlaceholderType = 'blur' | 'skeleton' | 'color' | 'none' | 'custom'

/**
 * Props for the LazyImage component
 */
export interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'placeholder'> {
  /**
   * Image source URL
   */
  src: string

  /**
   * Alt text for the image
   */
  alt: string

  /**
   * Type of placeholder to show while loading
   * @default 'skeleton'
   */
  placeholderType?: PlaceholderType

  /**
   * Custom placeholder element (used when placeholderType is 'custom')
   */
  placeholder?: React.ReactNode

  /**
   * Background color for 'color' placeholder type
   * @default '#e5e5e5'
   */
  placeholderColor?: string

  /**
   * Low-quality image placeholder URL for 'blur' placeholder type
   */
  blurDataURL?: string

  /**
   * Whether to wait for TTI before loading the image
   * Use this for non-critical images that can be deferred
   * @default false
   */
  waitForTTI?: boolean

  /**
   * Root margin for Intersection Observer
   * Positive values start loading before the image enters viewport
   * @default '100px'
   */
  rootMargin?: string

  /**
   * Whether to use native loading="lazy" attribute
   * When true, uses browser's native lazy loading instead of Intersection Observer
   * @default false
   */
  useNativeLazy?: boolean

  /**
   * Whether lazy loading is enabled
   * When false, image loads immediately
   * @default true
   */
  lazy?: boolean

  /**
   * Callback when image starts loading
   */
  onLoadStart?: () => void

  /**
   * Callback when image finishes loading
   */
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void

  /**
   * Callback when image fails to load
   */
  onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void

  /**
   * Fallback element to show when image fails to load
   */
  fallback?: React.ReactNode

  /**
   * Width of the image (helps prevent layout shift)
   */
  width?: number | string

  /**
   * Height of the image (helps prevent layout shift)
   */
  height?: number | string

  /**
   * Aspect ratio for the container (e.g., '16/9', '1/1')
   * Helps prevent layout shift when dimensions are unknown
   */
  aspectRatio?: string

  /**
   * Additional class name for the container
   */
  containerClassName?: string

  /**
   * Additional styles for the container
   */
  containerStyle?: React.CSSProperties
}

/**
 * Loading state for the image
 */
type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

/**
 * Skeleton placeholder component
 */
const SkeletonPlaceholder: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      background: 'linear-gradient(90deg, #e5e5e5 25%, #f0f0f0 50%, #e5e5e5 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      ...style,
    }}
    aria-hidden="true"
  />
)

/**
 * Color placeholder component
 */
const ColorPlaceholder: React.FC<{ color: string; style?: React.CSSProperties }> = ({
  color,
  style,
}) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      backgroundColor: color,
      ...style,
    }}
    aria-hidden="true"
  />
)

/**
 * Blur placeholder component
 */
const BlurPlaceholder: React.FC<{ src: string; style?: React.CSSProperties }> = ({
  src,
  style,
}) => (
  <img
    src={src}
    alt=""
    aria-hidden="true"
    style={{
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      filter: 'blur(20px)',
      transform: 'scale(1.1)',
      ...style,
    }}
  />
)

/**
 * LazyImage Component
 *
 * A performant image component with lazy loading support.
 *
 * @example
 * // Basic usage
 * <LazyImage src="/image.jpg" alt="Description" />
 *
 * @example
 * // With TTI gating for non-critical images
 * <LazyImage
 *   src="/hero-image.jpg"
 *   alt="Hero"
 *   waitForTTI={true}
 *   placeholderType="skeleton"
 * />
 *
 * @example
 * // With blur placeholder
 * <LazyImage
 *   src="/photo.jpg"
 *   alt="Photo"
 *   placeholderType="blur"
 *   blurDataURL="/photo-blur.jpg"
 * />
 *
 * @example
 * // With native lazy loading
 * <LazyImage
 *   src="/image.jpg"
 *   alt="Image"
 *   useNativeLazy={true}
 * />
 *
 * @example
 * // With aspect ratio to prevent layout shift
 * <LazyImage
 *   src="/image.jpg"
 *   alt="Image"
 *   aspectRatio="16/9"
 * />
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholderType = 'skeleton',
  placeholder,
  placeholderColor = '#e5e5e5',
  blurDataURL,
  waitForTTI = false,
  rootMargin = '100px',
  useNativeLazy = false,
  lazy = true,
  onLoadStart,
  onLoad,
  onError,
  fallback,
  width,
  height,
  aspectRatio,
  containerClassName,
  containerStyle,
  className,
  style,
  ...imgProps
}) => {
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const imgRef = useRef<HTMLImageElement>(null)

  // Use lazy load hook for Intersection Observer-based loading
  const lazyLoadOptions: UseLazyLoadOptions = {
    rootMargin,
    waitForTTI,
    enabled: lazy && !useNativeLazy,
    triggerOnce: true,
  }

  const { ref: containerRef, shouldLoad } = useLazyLoad<HTMLDivElement>(lazyLoadOptions)

  // Determine if we should render the actual image
  const shouldRenderImage = !lazy || useNativeLazy || shouldLoad

  const handleLoadStart = useCallback(() => {
    setLoadingState('loading')
    onLoadStart?.()
  }, [onLoadStart])

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      setLoadingState('loaded')
      onLoad?.(event)
    },
    [onLoad]
  )

  const handleError = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      setLoadingState('error')
      onError?.(event)
    },
    [onError]
  )

  // Start loading when shouldRenderImage becomes true
  useEffect(() => {
    if (shouldRenderImage && loadingState === 'idle') {
      handleLoadStart()
    }
  }, [shouldRenderImage, loadingState, handleLoadStart])

  const renderPlaceholder = () => {
    if (loadingState === 'loaded') return null

    switch (placeholderType) {
      case 'skeleton':
        return <SkeletonPlaceholder />
      case 'color':
        return <ColorPlaceholder color={placeholderColor} />
      case 'blur':
        return blurDataURL ? <BlurPlaceholder src={blurDataURL} /> : <SkeletonPlaceholder />
      case 'custom':
        return placeholder || null
      case 'none':
      default:
        return null
    }
  }

  if (loadingState === 'error' && fallback) {
    return <>{fallback}</>
  }

  // Container styles
  const containerStyles: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    width: width ?? '100%',
    height: height ?? (aspectRatio ? 'auto' : '100%'),
    aspectRatio: aspectRatio,
    ...containerStyle,
  }

  // Image styles
  const imageStyles: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: loadingState === 'loaded' ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
    ...style,
  }

  // Placeholder styles
  const placeholderStyles: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: loadingState === 'loaded' ? 0 : 1,
    transition: 'opacity 0.3s ease-in-out',
    pointerEvents: 'none',
  }

  return (
    <div ref={containerRef} className={containerClassName} style={containerStyles}>
      {placeholderType !== 'none' && <div style={placeholderStyles}>{renderPlaceholder()}</div>}

      {shouldRenderImage && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={useNativeLazy ? 'lazy' : undefined}
          onLoad={handleLoad}
          onError={handleError}
          className={className}
          style={imageStyles}
          {...imgProps}
        />
      )}
    </div>
  )
}

/**
 * CSS keyframes for skeleton animation
 * Add this to your global CSS or use a CSS-in-JS solution
 */
export const lazyImageStyles = `
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
`

/**
 * Inject lazy image styles into the document
 * Call this once at app initialization
 */
export function injectLazyImageStyles(): void {
  if (typeof document === 'undefined') return

  const styleId = 'lazy-image-styles'
  if (document.getElementById(styleId)) return

  const styleElement = document.createElement('style')
  styleElement.id = styleId
  styleElement.textContent = lazyImageStyles
  document.head.appendChild(styleElement)
}

export default LazyImage
