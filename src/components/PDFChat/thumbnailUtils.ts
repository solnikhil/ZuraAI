/**
 * PDF Thumbnail Utilities
 * 
 * Pure utility functions for thumbnail generation that can be tested
 * without DOM dependencies.
 */

/**
 * Generate an array of page numbers for thumbnails
 * 
 * Property 27: Thumbnail Count Consistency
 * For any loaded PDF document, the number of generated thumbnails 
 * SHALL equal the document's page count.
 * 
 * @param pageCount - Total number of pages in the document
 * @returns Array of page numbers from 1 to pageCount
 */
export function generateThumbnailPages(pageCount: number): number[] {
  if (pageCount <= 0) return [];
  return Array.from({ length: pageCount }, (_, i) => i + 1);
}
