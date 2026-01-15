/**
 * PDF Navigation Utilities
 * 
 * Pure utility functions for PDF navigation that can be tested
 * without DOM dependencies.
 */

// Constants for zoom bounds (Requirements 3.8)
export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const DEFAULT_ZOOM = 100;
export const ZOOM_STEP = 25;
export const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

/**
 * Clamp zoom level to valid bounds
 * 
 * Property 25: Zoom Level Bounds
 * For any zoom operation, zoom levels within the range [25%, 400%] SHALL be 
 * accepted and applied, while values outside this range SHALL be clamped 
 * to the nearest bound.
 * 
 * @param zoom - The zoom level to clamp
 * @returns Clamped zoom level between MIN_ZOOM and MAX_ZOOM
 */
export function clampZoom(zoom: number): number {
  if (typeof zoom !== 'number' || isNaN(zoom)) {
    return DEFAULT_ZOOM;
  }
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/**
 * Clamp page number to valid bounds
 * 
 * Property 26: Page Navigation Bounds
 * For any page navigation request (by number, thumbnail click, or keyboard), 
 * the target page SHALL be clamped to valid range [1, pageCount], and the 
 * viewer SHALL navigate to the clamped value.
 * 
 * @param page - The page number to clamp
 * @param totalPages - Total number of pages in the document
 * @returns Clamped page number between 1 and totalPages
 */
export function clampPage(page: number, totalPages: number): number {
  if (typeof page !== 'number' || isNaN(page)) {
    return 1;
  }
  if (typeof totalPages !== 'number' || isNaN(totalPages) || totalPages <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(totalPages, Math.round(page)));
}

/**
 * Calculate the next zoom level when zooming in
 * 
 * @param currentZoom - Current zoom level
 * @param step - Zoom step (default: ZOOM_STEP)
 * @returns New zoom level, clamped to bounds
 */
export function zoomIn(currentZoom: number, step: number = ZOOM_STEP): number {
  return clampZoom(currentZoom + step);
}

/**
 * Calculate the next zoom level when zooming out
 * 
 * @param currentZoom - Current zoom level
 * @param step - Zoom step (default: ZOOM_STEP)
 * @returns New zoom level, clamped to bounds
 */
export function zoomOut(currentZoom: number, step: number = ZOOM_STEP): number {
  return clampZoom(currentZoom - step);
}

/**
 * Calculate the next page when navigating forward
 * 
 * @param currentPage - Current page number
 * @param totalPages - Total number of pages
 * @returns Next page number, clamped to bounds
 */
export function nextPage(currentPage: number, totalPages: number): number {
  return clampPage(currentPage + 1, totalPages);
}

/**
 * Calculate the previous page when navigating backward
 * 
 * @param currentPage - Current page number
 * @param totalPages - Total number of pages
 * @returns Previous page number, clamped to bounds
 */
export function previousPage(currentPage: number, totalPages: number): number {
  return clampPage(currentPage - 1, totalPages);
}

/**
 * Check if zoom level is at minimum
 * 
 * @param zoom - Current zoom level
 * @returns True if at minimum zoom
 */
export function isMinZoom(zoom: number): boolean {
  return clampZoom(zoom) <= MIN_ZOOM;
}

/**
 * Check if zoom level is at maximum
 * 
 * @param zoom - Current zoom level
 * @returns True if at maximum zoom
 */
export function isMaxZoom(zoom: number): boolean {
  return clampZoom(zoom) >= MAX_ZOOM;
}

/**
 * Check if at first page
 * 
 * @param page - Current page number
 * @returns True if at first page
 */
export function isFirstPage(page: number): boolean {
  return page <= 1;
}

/**
 * Check if at last page
 * 
 * @param page - Current page number
 * @param totalPages - Total number of pages
 * @returns True if at last page
 */
export function isLastPage(page: number, totalPages: number): boolean {
  return page >= totalPages;
}
