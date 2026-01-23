/**
 * PDF Viewer - Minimal Test Version
 */

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import 'react-pdf/dist/Page/TextLayer.css';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

import type { PDFViewerProps } from './types';
import { Star, ZoomIn, ZoomOut } from '../icons';
import './PDFViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const DEFAULT_ZOOM = 100;
export const ZOOM_STEP = 25;
const PAGE_RENDER_WINDOW = 1;

export function PDFViewer({
  documentId,
  onPageChange,
  currentPage = 1,
  zoomLevel = DEFAULT_ZOOM,
  onZoomChange,
  isStarred,
  onToggleStar,
  onTextSelect,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [documentFile, setDocumentFile] = useState<Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageAspectRatio, setPageAspectRatio] = useState(1.3);
  const [isScrolling, setIsScrolling] = useState(false);
  const documentWrapperRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visiblePagesRef = useRef<Map<number, number>>(new Map());
  const rafRef = useRef<number | null>(null);
  const pageChangeTimeoutRef = useRef<number | null>(null);
  const pendingPageRef = useRef<number | null>(null);
  const currentPageRef = useRef(currentPage);
  const lastScrollPageRef = useRef<number | null>(null);
  const scrollIdleTimeoutRef = useRef<number | null>(null);
  
  // Middle mouse button panning state
  const [isPanning, setIsPanning] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Zoom center preservation
  const zoomCenterRef = useRef<{ scrollRatioX: number; scrollRatioY: number; prevZoom: number } | null>(null);

  // Zoom animation state
  const [isZooming, setIsZooming] = useState(false);
  const [visualScale, setVisualScale] = useState(1);
  const [renderZoom, setRenderZoom] = useState(zoomLevel);
  const zoomAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Handle zoom animation
  useEffect(() => {
    if (zoomLevel === renderZoom) {
      return;
    }

    // Clear any pending animation
    if (zoomAnimationRef.current) {
      clearTimeout(zoomAnimationRef.current);
    }

    // Calculate scale factor for visual transition
    const scale = zoomLevel / renderZoom;
    setVisualScale(scale);
    setIsZooming(true);

    // After animation completes, update the actual render zoom
    zoomAnimationRef.current = window.setTimeout(() => {
      setRenderZoom(zoomLevel);
      setVisualScale(1);
      setIsZooming(false);
      zoomAnimationRef.current = null;
    }, 200); // Match the CSS transition duration

    return () => {
      if (zoomAnimationRef.current) {
        clearTimeout(zoomAnimationRef.current);
      }
    };
  }, [zoomLevel, renderZoom]);

  useEffect(() => {
    pageRefs.current = [];
    visiblePagesRef.current.clear();
    lastScrollPageRef.current = null;
    pendingPageRef.current = null;
    setPageAspectRatio(1.3);
    setIsScrolling(false);
    if (scrollIdleTimeoutRef.current) {
      window.clearTimeout(scrollIdleTimeoutRef.current);
      scrollIdleTimeoutRef.current = null;
    }
    if (pageChangeTimeoutRef.current) {
      window.clearTimeout(pageChangeTimeoutRef.current);
      pageChangeTimeoutRef.current = null;
    }
    observerRef.current?.disconnect();
  }, [documentId]);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (pageChangeTimeoutRef.current) {
        window.clearTimeout(pageChangeTimeoutRef.current);
      }
      if (scrollIdleTimeoutRef.current) {
        window.clearTimeout(scrollIdleTimeoutRef.current);
      }
    };
  }, []);

  const schedulePageCommit = useCallback(() => {
    if (pageChangeTimeoutRef.current) {
      window.clearTimeout(pageChangeTimeoutRef.current);
    }

    pageChangeTimeoutRef.current = window.setTimeout(() => {
      pageChangeTimeoutRef.current = null;
      if (!onPageChange) {
        return;
      }

      const nextPage = pendingPageRef.current;
      if (!nextPage || nextPage === currentPageRef.current) {
        return;
      }

      lastScrollPageRef.current = nextPage;
      onPageChange(nextPage);
    }, 120);
  }, [onPageChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      event.preventDefault();
      setIsPanMode(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsPanMode(false);
      }
    };

    const handleBlur = () => {
      setIsPanMode(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const schedulePageUpdate = useCallback(() => {
    if (rafRef.current !== null) {
      return;
    }

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      let bestPage = currentPageRef.current;
      let bestRatio = 0;

      visiblePagesRef.current.forEach((ratio, pageNumber) => {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestPage = pageNumber;
        }
      });

      if (bestRatio === 0 || bestPage === pendingPageRef.current) {
        return;
      }

      pendingPageRef.current = bestPage;
      schedulePageCommit();
    });
  }, [schedulePageCommit]);

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    entries.forEach((entry) => {
      const target = entry.target as HTMLElement;
      const pageNumber = Number(target.dataset.pageNumber);
      if (!pageNumber) {
        return;
      }

      if (entry.isIntersecting) {
        visiblePagesRef.current.set(pageNumber, entry.intersectionRatio);
      } else {
        visiblePagesRef.current.delete(pageNumber);
      }
    });

    schedulePageUpdate();
  }, [schedulePageUpdate]);

  useEffect(() => {
    const wrapper = documentWrapperRef.current;
    if (!wrapper || numPages === 0) {
      return;
    }

    visiblePagesRef.current.clear();
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: wrapper,
      threshold: [0.5],
    });

    pageRefs.current.forEach((page) => {
      if (page) {
        observerRef.current?.observe(page);
      }
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [handleIntersection, numPages, documentId]);

  // Load PDF
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      setIsLoading(true);
      setError(null);
      setNumPages(0);
      setDocumentFile(null);

      try {
        const result = await window.ipcRenderer.invoke('pdf:get-file-data', documentId);
        if (cancelled || !result) return;

        const rawData = result?.data ?? result;
        const data = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData);

        setDocumentFile(data);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
          setIsLoading(false);
        }
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const handleDocumentLoadSuccess = useCallback((pdf: PDFDocumentProxy) => {
    setNumPages(pdf.numPages);
    pdf
      .getPage(1)
      .then((firstPage) => {
        const viewport = firstPage.getViewport({ scale: 1 });
        if (viewport.width > 0) {
          setPageAspectRatio(viewport.height / viewport.width);
        }
        if (typeof firstPage.cleanup === 'function') {
          firstPage.cleanup();
        }
      })
      .catch((pageError) => {
        console.warn('[PDFViewer] Failed to read page size:', pageError);
      });
  }, []);

  const handleDocumentLoadError = useCallback((err: Error) => {
    console.error('[PDFViewer] Document error:', err);
    setError(err.message || 'Failed to load');
  }, []);

  const captureZoomCenter = useCallback(() => {
    const wrapper = documentWrapperRef.current;
    if (!wrapper) return;

    const scrollWidth = wrapper.scrollWidth;
    const scrollHeight = wrapper.scrollHeight;
    const viewportCenterX = wrapper.scrollLeft + wrapper.clientWidth / 2;
    const viewportCenterY = wrapper.scrollTop + wrapper.clientHeight / 2;

    zoomCenterRef.current = {
      scrollRatioX: scrollWidth > 0 ? viewportCenterX / scrollWidth : 0.5,
      scrollRatioY: scrollHeight > 0 ? viewportCenterY / scrollHeight : 0.5,
      prevZoom: renderZoom,
    };
  }, [renderZoom]);

  const handleZoomIn = useCallback(() => {
    captureZoomCenter();
    onZoomChange?.(Math.min(zoomLevel + ZOOM_STEP, MAX_ZOOM));
  }, [zoomLevel, onZoomChange, captureZoomCenter]);

  const handleZoomOut = useCallback(() => {
    captureZoomCenter();
    onZoomChange?.(Math.max(zoomLevel - ZOOM_STEP, MIN_ZOOM));
  }, [zoomLevel, onZoomChange, captureZoomCenter]);

  useEffect(() => {
    if (!documentWrapperRef.current || numPages === 0) {
      return;
    }

    if (currentPage < 1 || currentPage > numPages) {
      return;
    }

    if (lastScrollPageRef.current === currentPage) {
      lastScrollPageRef.current = null;
      return;
    }

    const target = pageRefs.current[currentPage - 1];
    if (!target) {
      return;
    }

    const wrapper = documentWrapperRef.current;
    const wrapperRect = wrapper.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const padding = 12;
    const isVisible =
      targetRect.top >= wrapperRect.top + padding &&
      targetRect.bottom <= wrapperRect.bottom - padding;

    if (isVisible) {
      return;
    }

    target.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
  }, [currentPage, numPages]);

  // Restore scroll position after zoom animation completes (when renderZoom updates)
  useLayoutEffect(() => {
    const wrapper = documentWrapperRef.current;
    const zoomInfo = zoomCenterRef.current;

    if (!wrapper || !zoomInfo || zoomInfo.prevZoom === renderZoom) {
      return;
    }

    // Calculate new scroll position to keep the same center point
    const newScrollWidth = wrapper.scrollWidth;
    const newScrollHeight = wrapper.scrollHeight;
    const newCenterX = zoomInfo.scrollRatioX * newScrollWidth;
    const newCenterY = zoomInfo.scrollRatioY * newScrollHeight;

    wrapper.scrollLeft = newCenterX - wrapper.clientWidth / 2;
    wrapper.scrollTop = newCenterY - wrapper.clientHeight / 2;

    zoomCenterRef.current = null;
  }, [renderZoom]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const wrapper = documentWrapperRef.current;
      if (!wrapper) return;

      if (event.ctrlKey) {
        event.preventDefault();
        captureZoomCenter();
        const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel + delta));
        if (nextZoom !== zoomLevel) {
          onZoomChange?.(nextZoom);
        }
        return;
      }

      if (event.altKey) {
        event.preventDefault();
        // Use deltaY for horizontal scrolling (Alt+scroll converts vertical to horizontal)
        wrapper.scrollLeft += event.deltaY;
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        // On Windows/some browsers, Shift+scroll may already set deltaX
        // Use whichever delta is non-zero, preferring deltaY for consistency
        // Note: deltaY > 0 = scroll down = pan right, deltaY < 0 = scroll up = pan left
        const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
        wrapper.scrollLeft += delta;
      }
    },
    [zoomLevel, onZoomChange, captureZoomCenter]
  );

  const endPanning = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Middle mouse button panning handlers
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const isMiddleClick = event.button === 1;
    const isPanClick = event.button === 0 && isPanMode;

    if (!isMiddleClick && !isPanClick) {
      return;
    }

    event.preventDefault();
    const wrapper = documentWrapperRef.current;
    if (!wrapper) return;

    setIsPanning(true);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: wrapper.scrollLeft,
      scrollTop: wrapper.scrollTop,
    };
  }, [isPanMode]);

  useEffect(() => {
    if (!isPanning) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!panStartRef.current) {
        return;
      }

      const wrapper = documentWrapperRef.current;
      if (!wrapper) return;

      event.preventDefault();
      const deltaX = event.clientX - panStartRef.current.x;
      const deltaY = event.clientY - panStartRef.current.y;

      wrapper.scrollLeft = panStartRef.current.scrollLeft - deltaX;
      wrapper.scrollTop = panStartRef.current.scrollTop - deltaY;

      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: wrapper.scrollLeft,
        scrollTop: wrapper.scrollTop,
      };
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 0 || event.button === 1) {
        endPanning();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, endPanning]);

  const handleScroll = useCallback(() => {
    setIsScrolling((prev) => (prev ? prev : true));
    if (scrollIdleTimeoutRef.current) {
      window.clearTimeout(scrollIdleTimeoutRef.current);
    }
    scrollIdleTimeoutRef.current = window.setTimeout(() => {
      setIsScrolling(false);
      scrollIdleTimeoutRef.current = null;
    }, 140);
  }, []);

  const documentSource = useMemo(
    () => (documentFile ? { data: documentFile } : null),
    [documentFile]
  );

  if (isLoading) {
    return (
      <div className="pdf-viewer-container">
        <div className="pdf-viewer-loading">
          <div className="pdf-viewer-loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !documentFile) {
    return (
      <div className="pdf-viewer-container">
        <div className="pdf-viewer-error">
          <p>{error || 'No document'}</p>
        </div>
      </div>
    );
  }

  const pageWidth = Math.round(700 * (renderZoom / 100));
  const pageHeight = Math.round(pageWidth * pageAspectRatio);
  const renderStart = Math.max(1, currentPage - PAGE_RENDER_WINDOW);
  const renderEnd = Math.min(numPages, currentPage + PAGE_RENDER_WINDOW);
  const devicePixelRatio = typeof window !== 'undefined'
    ? (isScrolling ? 1 : Math.min(window.devicePixelRatio || 1, 1.25))
    : 1;

  return (
    <div className="pdf-viewer-container">
      {/* Controls */}
      <div className="pdf-viewer-controls">
        <button
          className="pdf-viewer-star-button"
          onClick={onToggleStar}
          aria-pressed={isStarred}
          type="button"
        >
          <Star fill={isStarred ? 'currentColor' : 'none'} size={20} />
        </button>

        <div className="pdf-viewer-zoom">
          <button className="pdf-viewer-zoom-button" onClick={handleZoomOut} disabled={zoomLevel <= MIN_ZOOM} type="button">
            <ZoomOut size={18} />
          </button>
          <span className="pdf-viewer-zoom-level">{zoomLevel}%</span>
          <button className="pdf-viewer-zoom-button" onClick={handleZoomIn} disabled={zoomLevel >= MAX_ZOOM} type="button">
            <ZoomIn size={18} />
          </button>
        </div>

        <div className="pdf-viewer-page-info">
          Page {currentPage} of {numPages}
        </div>
      </div>

      {/* Single Document with all pages - like how react-pdf is designed */}
      <div
        className={[
          'pdf-viewer-document-wrapper',
          isPanMode ? 'is-pan-mode' : '',
          isPanning ? 'is-panning' : '',
          isZooming ? 'is-zooming' : '',
          isScrolling ? 'is-scrolling' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        ref={documentWrapperRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onScroll={handleScroll}
      >
        <Document
          file={documentSource ?? undefined}
          className="pdf-viewer-document"
          style={{ transform: `scale(${visualScale})` }}
          onLoadSuccess={handleDocumentLoadSuccess}
          onLoadError={handleDocumentLoadError}
          loading={<div>Loading document...</div>}
          error={<div>Error loading document</div>}
        >
          {Array.from({ length: numPages }, (_, i) => {
            const pageNumber = i + 1;
            const isInRange = pageNumber >= renderStart && pageNumber <= renderEnd;
            return (
              <div
                key={pageNumber}
                className="pdf-viewer-page-container"
                data-page-number={pageNumber}
                ref={(node) => {
                  pageRefs.current[i] = node;
                }}
                style={{ marginBottom: 16, width: pageWidth }}
              >
                {isInRange ? (
                  <Page
                    pageNumber={pageNumber}
                    width={pageWidth}
                    renderTextLayer={!isScrolling && pageNumber === currentPage}
                    renderAnnotationLayer={false}
                    renderMode="none"
                    devicePixelRatio={devicePixelRatio}
                    loading={<div style={{ width: pageWidth, height: pageHeight, background: '#eee' }}>Loading page {pageNumber}...</div>}
                    error={<div style={{ width: pageWidth, height: pageHeight, background: '#fee' }}>Error page {pageNumber}</div>}
                  >
                    {(pageProps: any) => (
                      <OffscreenPageCanvas
                        page={pageProps.page}
                        scale={pageProps.scale}
                        rotate={pageProps.rotate}
                        renderForms={pageProps.renderForms}
                        canvasBackground={pageProps.canvasBackground}
                        devicePixelRatio={pageProps.devicePixelRatio ?? devicePixelRatio}
                        className={`${pageProps._className ?? 'react-pdf__Page'}__canvas`}
                      />
                    )}
                  </Page>
                ) : (
                  <div
                    className="pdf-viewer-page-placeholder"
                    style={{ width: pageWidth, height: pageHeight }}
                  >
                    <span className="pdf-viewer-page-placeholder-text">Page {pageNumber}</span>
                  </div>
                )}
              </div>
            );
          })}
        </Document>
      </div>
    </div>
  );
}

interface OffscreenPageCanvasProps {
  page: import('pdfjs-dist').PDFPageProxy;
  scale: number;
  rotate: number;
  renderForms: boolean;
  canvasBackground?: string;
  devicePixelRatio: number;
  className: string;
}

function OffscreenPageCanvas({
  page,
  scale,
  rotate,
  renderForms,
  canvasBackground,
  devicePixelRatio,
  className,
}: OffscreenPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<ReturnType<import('pdfjs-dist').PDFPageProxy['render']> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) {
      return;
    }

    const viewport = page.getViewport({ scale, rotation: rotate });
    const renderViewport = page.getViewport({ scale: scale * devicePixelRatio, rotation: rotate });

    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    canvas.style.visibility = 'hidden';

    const backgroundColor = canvasBackground ?? '#ffffff';
    const annotationMode = renderForms
      ? pdfjs.AnnotationMode.ENABLE_FORMS
      : pdfjs.AnnotationMode.ENABLE;

    const contextOptions = { alpha: false, desynchronized: true } as const;

    page.cleanup();

    canvas.style.backgroundColor = backgroundColor;

    const renderToCanvas = async () => {
      if (typeof OffscreenCanvas === 'undefined') {
        const fallbackContext = canvas.getContext('2d', contextOptions as any);
        if (!fallbackContext) {
          return;
        }

        renderTaskRef.current = page.render({
          annotationMode,
          canvas,
          canvasContext: fallbackContext,
          viewport: renderViewport,
          background: backgroundColor,
        });

        await renderTaskRef.current.promise;
        canvas.style.visibility = '';
        return;
      }

      const offscreen = new OffscreenCanvas(
        Math.floor(renderViewport.width),
        Math.floor(renderViewport.height)
      );
      const offscreenContext = offscreen.getContext('2d', contextOptions as any);
      if (!offscreenContext) {
        return;
      }

      renderTaskRef.current = page.render({
        annotationMode,
        canvas: offscreen,
        canvasContext: offscreenContext,
        viewport: renderViewport,
        background: backgroundColor,
      });

      await renderTaskRef.current.promise;

      const bitmap = offscreen.transferToImageBitmap();
      const bitmapContext = canvas.getContext('bitmaprenderer');
      if (bitmapContext) {
        bitmapContext.transferFromImageBitmap(bitmap);
      } else {
        const fallbackContext = canvas.getContext('2d', contextOptions as any);
        fallbackContext?.drawImage(bitmap, 0, 0);
      }
      bitmap.close?.();
      canvas.style.visibility = '';
    };

    renderToCanvas().catch((error) => {
      if (error?.name === 'RenderingCancelledException') {
        return;
      }
      console.error('[PDFViewer] Offscreen render failed:', error);
    });

    return () => {
      renderTaskRef.current?.cancel();
    };
  }, [page, scale, rotate, devicePixelRatio, renderForms, canvasBackground]);

  useEffect(() => {
    return () => {
      renderTaskRef.current?.cancel();
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      dir="ltr"
      style={{
        display: 'block',
        userSelect: 'none',
      }}
    />
  );
}

export default PDFViewer;
