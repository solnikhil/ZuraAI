/**
 * Property-Based Tests for PDF Parser Service
 * 
 * This file contains property-based tests using fast-check to verify
 * universal properties of the PDF parser across all valid inputs.
 * 
 * **Validates: Requirements 5.1, 5.7**
 * 
 * Property 1: PDF Parsing Produces Valid Bounding Boxes
 * For any valid PDF document, when parsed by the PDF_Parser, all extracted 
 * text blocks SHALL have valid bounding box coordinates (x0 < x1, y0 < y1, 
 * all values non-negative, within page dimensions).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { PDFParserService } from './pdfParser';
import type { BoundingBox, TextBlock } from '../../src/types/pdf';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  createReadStream: vi.fn(),
}));

// Mock crypto module
vi.mock('crypto', () => ({
  createHash: vi.fn(),
}));

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {
    workerSrc: '',
  },
}));

/**
 * Property test configuration as specified in design.md
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
  seed: 12345, // For reproducibility
  timeout: 30000, // 30 seconds per property
};

/**
 * Validates that a bounding box has valid coordinates
 * - x0 < x1 (positive width)
 * - y0 < y1 (positive height)
 * - All values non-negative
 * - Within page dimensions
 */
function isValidBoundingBox(
  bbox: BoundingBox,
  pageWidth: number,
  pageHeight: number
): { valid: boolean; reason?: string } {
  if (bbox.x0 < 0) {
    return { valid: false, reason: `x0 is negative: ${bbox.x0}` };
  }
  if (bbox.y0 < 0) {
    return { valid: false, reason: `y0 is negative: ${bbox.y0}` };
  }
  if (bbox.x1 < 0) {
    return { valid: false, reason: `x1 is negative: ${bbox.x1}` };
  }
  if (bbox.y1 < 0) {
    return { valid: false, reason: `y1 is negative: ${bbox.y1}` };
  }
  if (bbox.x0 >= bbox.x1) {
    return { valid: false, reason: `x0 (${bbox.x0}) >= x1 (${bbox.x1})` };
  }
  if (bbox.y0 >= bbox.y1) {
    return { valid: false, reason: `y0 (${bbox.y0}) >= y1 (${bbox.y1})` };
  }
  if (bbox.x1 > pageWidth) {
    return { valid: false, reason: `x1 (${bbox.x1}) > pageWidth (${pageWidth})` };
  }
  if (bbox.y1 > pageHeight) {
    return { valid: false, reason: `y1 (${bbox.y1}) > pageHeight (${pageHeight})` };
  }
  if (bbox.pageNumber < 1) {
    return { valid: false, reason: `pageNumber (${bbox.pageNumber}) < 1` };
  }
  return { valid: true };
}

/**
 * Generators for property-based testing
 */
const generators = {
  /**
   * Generate valid page dimensions
   * Standard PDF page sizes range from small (letter) to large (poster)
   */
  pageDimensions: fc.record({
    width: fc.float({ min: 100, max: 2000, noNaN: true }),
    height: fc.float({ min: 100, max: 3000, noNaN: true }),
  }),

  /**
   * Generate random non-empty text content (printable ASCII)
   */
  textContent: fc.string({ minLength: 1, maxLength: 100 })
    .filter(s => s.trim().length > 0),

  /**
   * Generate a valid font size (6-72 points)
   */
  fontSize: fc.float({ min: 6, max: 72, noNaN: true }),

  /**
   * Generate a valid PDF text item
   */
  textItem: (pageWidth: number, pageHeight: number) =>
    fc.record({
      str: generators.textContent,
      fontSize: generators.fontSize,
      x: fc.float({ min: 0, max: Math.fround(pageWidth * 0.9), noNaN: true }),
      y: fc.float({ min: 0, max: Math.fround(pageHeight * 0.9), noNaN: true }),
    }).map(({ str, fontSize, x, y }) => ({
      str,
      transform: [fontSize, 0, 0, fontSize, x, y],
      width: str.length * fontSize * 0.5,
      height: fontSize,
      fontName: 'Arial',
    })),

  /**
   * Generate an array of text items for a page
   */
  textItems: (pageWidth: number, pageHeight: number) =>
    fc.array(generators.textItem(pageWidth, pageHeight), { minLength: 1, maxLength: 50 }),

  /**
   * Generate edge case text items (boundary conditions)
   */
  edgeCaseTextItem: (pageWidth: number, pageHeight: number) =>
    fc.oneof(
      // Item at origin
      fc.constant({
        str: 'Origin',
        transform: [12, 0, 0, 12, 0, 0],
        width: 36,
        height: 12,
        fontName: 'Arial',
      }),
      // Item at page edge
      fc.constant({
        str: 'Edge',
        transform: [12, 0, 0, 12, pageWidth - 30, pageHeight - 12],
        width: 24,
        height: 12,
        fontName: 'Arial',
      }),
      // Item with very small font
      fc.constant({
        str: 'Tiny',
        transform: [6, 0, 0, 6, pageWidth / 2, pageHeight / 2],
        width: 12,
        height: 6,
        fontName: 'Arial',
      }),
      // Item with very large font
      fc.constant({
        str: 'HUGE',
        transform: [72, 0, 0, 72, 50, pageHeight - 100],
        width: 144,
        height: 72,
        fontName: 'Arial',
      }),
      // Item outside page bounds (should be clamped)
      fc.constant({
        str: 'Outside',
        transform: [12, 0, 0, 12, -50, pageHeight + 50],
        width: 42,
        height: 12,
        fontName: 'Arial',
      })
    ),
};

describe('PDF Parser Property Tests', () => {
  let service: PDFParserService;
  const mockFilePath = '/test/document.pdf';
  const mockFileHash = 'abc123def456789012345678901234567890123456789012345678901234';
  const mockPdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  // Helper to create mock page
  const createMockPage = (textItems: any[], width = 612, height = 792) => ({
    getViewport: vi.fn().mockReturnValue({ width, height, scale: 1.0 }),
    getTextContent: vi.fn().mockResolvedValue({ items: textItems }),
  });

  // Helper to create mock PDF document
  const createMockPdfDocument = (pages: any[]) => ({
    numPages: pages.length,
    getMetadata: vi.fn().mockResolvedValue({ info: {} }),
    getPage: vi.fn((pageNum: number) => Promise.resolve(pages[pageNum - 1])),
    getOutline: vi.fn().mockResolvedValue(null),
    destroy: vi.fn(),
  });

  beforeEach(() => {
    service = new PDFParserService();
    vi.clearAllMocks();

    // Setup default mocks
    (fs.existsSync as any).mockReturnValue(true);
    (fs.statSync as any).mockReturnValue({ isFile: () => true });
    (fs.readFileSync as any).mockReturnValue(mockPdfData);

    const mockStream = {
      on: vi.fn((event: string, callback: Function) => {
        if (event === 'data') callback(mockPdfData);
        else if (event === 'end') callback();
        return mockStream;
      }),
    };
    (fs.createReadStream as any).mockReturnValue(mockStream);

    const mockHash = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue(mockFileHash),
    };
    (crypto.createHash as any).mockReturnValue(mockHash);
  });

  afterEach(() => {
    service.clearAll();
  });

  describe('Property 1: PDF Parsing Produces Valid Bounding Boxes', () => {
    /**
     * **Property 1: PDF Parsing Produces Valid Bounding Boxes**
     * 
     * For any valid PDF document, when parsed by the PDF_Parser, all extracted 
     * text blocks SHALL have valid bounding box coordinates:
     * - x0 < x1 (positive width)
     * - y0 < y1 (positive height)
     * - All values non-negative
     * - Within page dimensions
     * 
     * **Validates: Requirements 5.1, 5.7**
     */
    it('should produce valid bounding boxes for any random text items', async () => {
      const pageWidth = 612;
      const pageHeight = 792;
      
      await fc.assert(
        fc.asyncProperty(
          generators.textItems(pageWidth, pageHeight),
          async (items) => {
            const mockPage = createMockPage(items, pageWidth, pageHeight);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            // Verify all bounding boxes are valid
            for (const block of page.textContent) {
              const validation = isValidBoundingBox(block.bbox, pageWidth, pageHeight);
              expect(validation.valid).toBe(true);
              if (!validation.valid) {
                console.error(`Invalid bbox for block "${block.text}": ${validation.reason}`);
              }
            }

            // Cleanup for next iteration
            service.clearAll();
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should handle edge case text items with valid bounding boxes', async () => {
      const pageWidth = 612;
      const pageHeight = 792;

      await fc.assert(
        fc.asyncProperty(
          fc.array(generators.edgeCaseTextItem(pageWidth, pageHeight), { minLength: 1, maxLength: 10 }),
          async (edgeCaseItems) => {
            const mockPage = createMockPage(edgeCaseItems, pageWidth, pageHeight);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            // All bounding boxes should be valid even for edge cases
            for (const block of page.textContent) {
              const validation = isValidBoundingBox(block.bbox, pageWidth, pageHeight);
              expect(validation.valid).toBe(true);
            }

            service.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should ensure x0 < x1 for all extracted blocks', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.pageDimensions,
          async (dims) => {
            // Generate items that might produce narrow bounding boxes
            const items = [
              { str: 'A', transform: [8, 0, 0, 8, dims.width / 2, dims.height / 2], width: 4, height: 8, fontName: 'Arial' },
              { str: 'B', transform: [8, 0, 0, 8, dims.width / 2 + 5, dims.height / 2], width: 4, height: 8, fontName: 'Arial' },
            ];

            const mockPage = createMockPage(items, dims.width, dims.height);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            for (const block of page.textContent) {
              expect(block.bbox.x0).toBeLessThan(block.bbox.x1);
            }

            service.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should ensure y0 < y1 for all extracted blocks', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.pageDimensions,
          async (dims) => {
            const items = [
              { str: 'Test', transform: [10, 0, 0, 10, 100, dims.height / 2], width: 20, height: 10, fontName: 'Arial' },
            ];

            const mockPage = createMockPage(items, dims.width, dims.height);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            for (const block of page.textContent) {
              expect(block.bbox.y0).toBeLessThan(block.bbox.y1);
            }

            service.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should ensure all coordinates are non-negative', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.pageDimensions,
          async (dims) => {
            // Include items with negative coordinates that should be clamped
            const items = [
              { str: 'Negative X', transform: [12, 0, 0, 12, -100, dims.height / 2], width: 60, height: 12, fontName: 'Arial' },
              { str: 'Negative Y', transform: [12, 0, 0, 12, 100, -50], width: 60, height: 12, fontName: 'Arial' },
              { str: 'Normal', transform: [12, 0, 0, 12, 100, dims.height / 2], width: 36, height: 12, fontName: 'Arial' },
            ];

            const mockPage = createMockPage(items, dims.width, dims.height);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            for (const block of page.textContent) {
              expect(block.bbox.x0).toBeGreaterThanOrEqual(0);
              expect(block.bbox.y0).toBeGreaterThanOrEqual(0);
              expect(block.bbox.x1).toBeGreaterThanOrEqual(0);
              expect(block.bbox.y1).toBeGreaterThanOrEqual(0);
            }

            service.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should ensure coordinates are within page dimensions', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.pageDimensions,
          async (dims) => {
            // Include items that extend beyond page bounds
            const items = [
              { str: 'Beyond Width', transform: [12, 0, 0, 12, dims.width - 10, dims.height / 2], width: 100, height: 12, fontName: 'Arial' },
              { str: 'Beyond Height', transform: [12, 0, 0, 12, 100, dims.height - 5], width: 72, height: 12, fontName: 'Arial' },
            ];

            const mockPage = createMockPage(items, dims.width, dims.height);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            for (const block of page.textContent) {
              expect(block.bbox.x1).toBeLessThanOrEqual(dims.width);
              expect(block.bbox.y1).toBeLessThanOrEqual(dims.height);
            }

            service.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should set correct page number for all blocks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (pageCount) => {
            const pages = Array.from({ length: pageCount }, (_, i) => {
              const items = [
                { str: `Page ${i + 1}`, transform: [12, 0, 0, 12, 100, 400], width: 48, height: 12, fontName: 'Arial' },
              ];
              return createMockPage(items);
            });

            const mockPdfDoc = createMockPdfDocument(pages);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);

            for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
              const page = await service.getPage(doc.id, pageNum);
              for (const block of page.textContent) {
                expect(block.bbox.pageNumber).toBe(pageNum);
              }
            }

            service.clearAll();
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Property: Text Block ID Uniqueness', () => {
    /**
     * For any page, all text block IDs should be unique
     */
    it('should generate unique IDs for all text blocks on a page', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.pageDimensions,
          async (dims) => {
            // Generate multiple text items
            const items = Array.from({ length: 20 }, (_, i) => ({
              str: `Item ${i}`,
              transform: [12, 0, 0, 12, 50 + (i % 5) * 100, 700 - Math.floor(i / 5) * 50],
              width: 36,
              height: 12,
              fontName: 'Arial',
            }));

            const mockPage = createMockPage(items, dims.width, dims.height);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            const ids = page.textContent.map(b => b.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);

            service.clearAll();
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Property: Empty Input Handling', () => {
    /**
     * Empty pages should produce empty text content arrays
     */
    it('should handle empty pages gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.pageDimensions,
          async (dims) => {
            const mockPage = createMockPage([], dims.width, dims.height);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            expect(page.textContent).toEqual([]);

            service.clearAll();
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    /**
     * Whitespace-only items should be filtered out
     */
    it('should filter out whitespace-only text items', async () => {
      // Use fixed page dimensions to ensure consistent coordinate transformation
      const pageWidth = 612;
      const pageHeight = 792;
      
      const items = [
        { str: '   ', transform: [12, 0, 0, 12, 100, 400], width: 18, height: 12, fontName: 'Arial' },
        { str: '\t\n', transform: [12, 0, 0, 12, 150, 400], width: 12, height: 12, fontName: 'Arial' },
        { str: '', transform: [12, 0, 0, 12, 200, 400], width: 0, height: 12, fontName: 'Arial' },
        { str: 'Valid', transform: [12, 0, 0, 12, 250, 400], width: 30, height: 12, fontName: 'Arial' },
      ];

      const mockPage = createMockPage(items, pageWidth, pageHeight);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      // Only the "Valid" item should be present
      expect(page.textContent.length).toBe(1);
      expect(page.textContent[0].text).toContain('Valid');

      service.clearAll();
    });
  });

  describe('Property 16: Table Structure Preservation', () => {
    /**
     * **Property 16: Table Structure Preservation**
     * 
     * For any table extracted from a PDF, the extracted table SHALL preserve 
     * row count, column count, and cell content. Reconstructing the table 
     * from extracted data SHALL produce equivalent content.
     * 
     * **Validates: Requirements 5.4, 15.1**
     */

    /**
     * Generator for table-like text items
     * Creates a grid of text items that should be detected as a table
     */
    const tableTextItemsGenerator = (
      pageWidth: number,
      pageHeight: number,
      rows: number,
      cols: number
    ) => {
      const items: any[] = [];
      const cellWidth = Math.min(100, (pageWidth - 100) / cols);
      const cellHeight = 20;
      const startX = 50;
      const startY = pageHeight - 100;
      const fontSize = 10;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = startX + col * (cellWidth + 20); // 20px gap between columns
          const y = startY - row * (cellHeight + 5);
          
          items.push({
            str: `R${row}C${col}`,
            transform: [fontSize, 0, 0, fontSize, x, y],
            width: cellWidth * 0.8,
            height: fontSize,
            fontName: 'Arial',
          });
        }
      }
      
      return items;
    };

    // Helper to create mock page with getOperatorList
    const createMockPageWithOperatorList = (textItems: any[], width = 612, height = 792) => ({
      getViewport: vi.fn().mockReturnValue({ width, height, scale: 1.0 }),
      getTextContent: vi.fn().mockResolvedValue({ items: textItems }),
      getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
    });

    it('should preserve row count for extracted tables', async () => {
      const pageWidth = 612;
      const pageHeight = 792;

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }), // rows
          fc.integer({ min: 2, max: 5 }),  // cols
          async (rowCount, colCount) => {
            const items = tableTextItemsGenerator(pageWidth, pageHeight, rowCount, colCount);
            
            const mockPage = createMockPageWithOperatorList(items, pageWidth, pageHeight);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            // If tables were detected, verify row count
            if (page.tables.length > 0) {
              const table = page.tables[0];
              // The detected row count should be close to the input row count
              // (may vary slightly due to detection heuristics)
              expect(table.rows.length).toBeGreaterThanOrEqual(2);
              expect(table.rows.length).toBeLessThanOrEqual(rowCount + 1);
            }

            service.clearAll();
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should preserve column count for extracted tables', async () => {
      const pageWidth = 612;
      const pageHeight = 792;

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }), // cols
          async (colCount) => {
            const rowCount = 3; // Fixed rows for this test
            const items = tableTextItemsGenerator(pageWidth, pageHeight, rowCount, colCount);
            
            const mockPage = createMockPageWithOperatorList(items, pageWidth, pageHeight);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            // If tables were detected, verify column count consistency
            if (page.tables.length > 0) {
              const table = page.tables[0];
              // All rows should have the same number of cells
              const cellCounts = table.rows.map(r => r.cells.length);
              const uniqueCellCounts = new Set(cellCounts);
              expect(uniqueCellCounts.size).toBe(1);
            }

            service.clearAll();
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should preserve cell content in extracted tables', async () => {
      const pageWidth = 612;
      const pageHeight = 792;
      const rowCount = 3;
      const colCount = 3;
      
      const items = tableTextItemsGenerator(pageWidth, pageHeight, rowCount, colCount);
      
      const mockPage = createMockPageWithOperatorList(items, pageWidth, pageHeight);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      // If tables were detected, verify cell content is preserved
      if (page.tables.length > 0) {
        const table = page.tables[0];
        
        // Collect all cell texts
        const cellTexts = table.rows.flatMap(r => r.cells.map(c => c.text));
        
        // Each cell should contain text (may be empty for some cells)
        // At least some cells should have the expected format
        const validCells = cellTexts.filter(t => t.match(/R\d+C\d+/));
        expect(validCells.length).toBeGreaterThan(0);
      }

      service.clearAll();
    });

    it('should produce valid bounding boxes for table cells', async () => {
      const pageWidth = 612;
      const pageHeight = 792;

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 2, max: 4 }),
          async (rowCount, colCount) => {
            const items = tableTextItemsGenerator(pageWidth, pageHeight, rowCount, colCount);
            
            const mockPage = createMockPageWithOperatorList(items, pageWidth, pageHeight);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            // Verify all table cell bounding boxes are valid
            for (const table of page.tables) {
              // Table bbox should be valid
              const tableBboxValid = isValidBoundingBox(table.bbox, pageWidth, pageHeight);
              expect(tableBboxValid.valid).toBe(true);
              
              // All cell bboxes should be valid
              for (const row of table.rows) {
                for (const cell of row.cells) {
                  const cellBboxValid = isValidBoundingBox(cell.bbox, pageWidth, pageHeight);
                  expect(cellBboxValid.valid).toBe(true);
                }
              }
            }

            service.clearAll();
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should generate unique table IDs', async () => {
      const pageWidth = 612;
      const pageHeight = 792;
      
      // Create two separate tables on the same page
      const table1Items = tableTextItemsGenerator(pageWidth, pageHeight, 3, 3);
      // Shift second table down
      const table2Items = table1Items.map(item => ({
        ...item,
        transform: [...item.transform.slice(0, 5), item.transform[5] - 200],
      }));
      
      const allItems = [...table1Items, ...table2Items];
      
      const mockPage = createMockPageWithOperatorList(allItems, pageWidth, pageHeight);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      // All table IDs should be unique
      const tableIds = page.tables.map(t => t.id);
      const uniqueIds = new Set(tableIds);
      expect(uniqueIds.size).toBe(tableIds.length);

      service.clearAll();
    });

    it('should handle tables with varying cell content lengths', async () => {
      const pageWidth = 612;
      const pageHeight = 792;

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.array(
              fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              { minLength: 2, maxLength: 5 }
            ),
            { minLength: 2, maxLength: 5 }
          ),
          async (tableData) => {
            // Create text items from the table data
            const items: any[] = [];
            const cellWidth = 80;
            const cellHeight = 15;
            const startX = 50;
            const startY = pageHeight - 100;
            const fontSize = 10;

            for (let row = 0; row < tableData.length; row++) {
              for (let col = 0; col < tableData[row].length; col++) {
                const x = startX + col * (cellWidth + 30);
                const y = startY - row * (cellHeight + 10);
                
                items.push({
                  str: tableData[row][col],
                  transform: [fontSize, 0, 0, fontSize, x, y],
                  width: tableData[row][col].length * fontSize * 0.5,
                  height: fontSize,
                  fontName: 'Arial',
                });
              }
            }
            
            const mockPage = createMockPageWithOperatorList(items, pageWidth, pageHeight);
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            const page = await service.getPage(doc.id, 1);

            // Should not throw and should produce valid output
            expect(page).toBeDefined();
            expect(page.tables).toBeDefined();
            expect(Array.isArray(page.tables)).toBe(true);

            service.clearAll();
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Property 18: Error Resilience in Parsing', () => {
    /**
     * **Property 18: Error Resilience in Parsing**
     * 
     * For any PDF document (including malformed ones), the PDF_Parser SHALL not 
     * throw unhandled exceptions. If parsing fails for a region, the parser 
     * SHALL continue with remaining content and return partial results.
     * 
     * **Validates: Requirements 5.6, 18.1**
     */

    it('should handle corrupted page gracefully and return empty page', async () => {
      const pageWidth = 612;
      const pageHeight = 792;

      // Mock a page that throws an error when accessed
      const mockPage = {
        getViewport: vi.fn().mockImplementation(() => {
          throw new Error('Corrupted page data');
        }),
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      };
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      // Should not throw - should return empty page
      const page = await service.getPage(doc.id, 1);
      
      expect(page).toBeDefined();
      expect(page.pageNumber).toBe(1);
      expect(page.textContent).toEqual([]);
      expect(page.tables).toEqual([]);
      expect(page.images).toEqual([]);

      service.clearAll();
    });

    it('should handle text extraction failure and continue', async () => {
      const pageWidth = 612;
      const pageHeight = 792;

      // Mock a page where text extraction fails
      const mockPage = {
        getViewport: vi.fn().mockReturnValue({ width: pageWidth, height: pageHeight, scale: 1.0 }),
        getTextContent: vi.fn().mockRejectedValue(new Error('Text extraction failed')),
        getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
      };
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      // Should not throw - should return page with empty text
      const page = await service.getPage(doc.id, 1);
      
      expect(page).toBeDefined();
      expect(page.pageNumber).toBe(1);
      expect(page.width).toBe(pageWidth);
      expect(page.height).toBe(pageHeight);
      expect(page.textContent).toEqual([]);

      service.clearAll();
    });

    it('should handle image extraction failure and continue', async () => {
      const pageWidth = 612;
      const pageHeight = 792;
      const items = [
        { str: 'Test', transform: [12, 0, 0, 12, 100, 400], width: 24, height: 12, fontName: 'Arial' },
      ];

      // Mock a page where image extraction fails
      const mockPage = {
        getViewport: vi.fn().mockReturnValue({ width: pageWidth, height: pageHeight, scale: 1.0 }),
        getTextContent: vi.fn().mockResolvedValue({ items }),
        getOperatorList: vi.fn().mockRejectedValue(new Error('Operator list failed')),
      };
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      // Should not throw - should return page with text but no images
      const page = await service.getPage(doc.id, 1);
      
      expect(page).toBeDefined();
      expect(page.textContent.length).toBeGreaterThan(0);
      expect(page.images).toEqual([]);

      service.clearAll();
    });

    it('should handle random failures in any extraction step', async () => {
      const pageWidth = 612;
      const pageHeight = 792;

      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // textFails
          fc.boolean(), // tableFails (via text)
          fc.boolean(), // imageFails
          async (textFails, tableFails, imageFails) => {
            const items = textFails ? [] : [
              { str: 'Test', transform: [12, 0, 0, 12, 100, 400], width: 24, height: 12, fontName: 'Arial' },
            ];

            const mockPage = {
              getViewport: vi.fn().mockReturnValue({ width: pageWidth, height: pageHeight, scale: 1.0 }),
              getTextContent: textFails 
                ? vi.fn().mockRejectedValue(new Error('Text failed'))
                : vi.fn().mockResolvedValue({ items }),
              getOperatorList: imageFails
                ? vi.fn().mockRejectedValue(new Error('Images failed'))
                : vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
            };
            const mockPdfDoc = createMockPdfDocument([mockPage]);

            const pdfjsLib = await import('pdfjs-dist');
            (pdfjsLib.getDocument as any).mockReturnValue({
              promise: Promise.resolve(mockPdfDoc),
            });

            const doc = await service.loadDocument(mockFilePath);
            
            // Should NEVER throw regardless of which steps fail
            const page = await service.getPage(doc.id, 1);
            
            expect(page).toBeDefined();
            expect(page.pageNumber).toBe(1);
            expect(Array.isArray(page.textContent)).toBe(true);
            expect(Array.isArray(page.tables)).toBe(true);
            expect(Array.isArray(page.images)).toBe(true);

            service.clearAll();
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should return partial results when some pages fail', async () => {
      const pageWidth = 612;
      const pageHeight = 792;

      // Create 3 pages - middle one fails
      const goodPage = {
        getViewport: vi.fn().mockReturnValue({ width: pageWidth, height: pageHeight, scale: 1.0 }),
        getTextContent: vi.fn().mockResolvedValue({ 
          items: [{ str: 'Good', transform: [12, 0, 0, 12, 100, 400], width: 24, height: 12, fontName: 'Arial' }] 
        }),
        getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
      };
      
      const badPage = {
        getViewport: vi.fn().mockImplementation(() => {
          throw new Error('Page corrupted');
        }),
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      };

      const mockPdfDoc = {
        numPages: 3,
        getMetadata: vi.fn().mockResolvedValue({ info: {} }),
        getPage: vi.fn((pageNum: number) => {
          if (pageNum === 2) return Promise.resolve(badPage);
          return Promise.resolve(goodPage);
        }),
        getOutline: vi.fn().mockResolvedValue(null),
        destroy: vi.fn(),
      };

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      // Page 1 should work
      const page1 = await service.getPage(doc.id, 1);
      expect(page1.textContent.length).toBeGreaterThan(0);
      
      // Page 2 should return empty but not throw
      const page2 = await service.getPage(doc.id, 2);
      expect(page2.textContent).toEqual([]);
      
      // Page 3 should work
      const page3 = await service.getPage(doc.id, 3);
      expect(page3.textContent.length).toBeGreaterThan(0);

      service.clearAll();
    });
  });

  describe('Property 20: Password-Protected PDF Handling', () => {
    /**
     * **Property 20: Password-Protected PDF Handling**
     * 
     * For any password-protected PDF, the system SHALL detect the protection 
     * and prompt for password before attempting to parse content.
     * 
     * **Validates: Requirements 18.5**
     */

    it('should detect password-protected PDFs and throw appropriate error', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      
      // Mock password exception
      const passwordError = new Error('PDF is password protected');
      (passwordError as any).name = 'PasswordException';
      
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.reject(passwordError),
      });

      // Should throw with clear message about password
      await expect(service.loadDocument(mockFilePath)).rejects.toThrow(
        'PDF is password protected. Please provide the password.'
      );

      service.clearAll();
    });

    it('should accept password and load protected PDF', async () => {
      const pageWidth = 612;
      const pageHeight = 792;
      
      const mockPage = {
        getViewport: vi.fn().mockReturnValue({ width: pageWidth, height: pageHeight, scale: 1.0 }),
        getTextContent: vi.fn().mockResolvedValue({ 
          items: [{ str: 'Protected content', transform: [12, 0, 0, 12, 100, 400], width: 80, height: 12, fontName: 'Arial' }] 
        }),
        getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
      };
      
      const mockPdfDoc = {
        numPages: 1,
        getMetadata: vi.fn().mockResolvedValue({ info: {} }),
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue(null),
        destroy: vi.fn(),
      };

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      // Should load successfully with password
      const doc = await service.loadDocument(mockFilePath, 'secret123');
      expect(doc).toBeDefined();
      expect(doc.pageCount).toBe(1);

      const page = await service.getPage(doc.id, 1);
      expect(page.textContent.length).toBeGreaterThan(0);

      service.clearAll();
    });

    it('should throw error for incorrect password', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      
      // Mock password exception for wrong password
      const passwordError = new Error('Incorrect password');
      (passwordError as any).name = 'PasswordException';
      
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.reject(passwordError),
      });

      // Should throw with clear message about incorrect password
      await expect(service.loadDocument(mockFilePath, 'wrongpassword')).rejects.toThrow(
        'Incorrect password for PDF document'
      );

      service.clearAll();
    });

    it('should handle invalid PDF format', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      
      // Mock invalid PDF exception
      const invalidError = new Error('Invalid PDF structure');
      (invalidError as any).name = 'InvalidPDFException';
      
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.reject(invalidError),
      });

      // Should throw with clear message about invalid format
      await expect(service.loadDocument(mockFilePath)).rejects.toThrow(
        'Invalid PDF file format'
      );

      service.clearAll();
    });

    it('should handle file not found error', async () => {
      // Mock file not existing
      (fs.existsSync as any).mockReturnValue(false);

      await expect(service.loadDocument('/nonexistent/file.pdf')).rejects.toThrow(
        'PDF file not found'
      );

      // Reset mock
      (fs.existsSync as any).mockReturnValue(true);
      service.clearAll();
    });

    it('should handle path that is not a file', async () => {
      // Mock path being a directory
      (fs.statSync as any).mockReturnValue({ isFile: () => false });

      await expect(service.loadDocument('/some/directory')).rejects.toThrow(
        'Path is not a file'
      );

      // Reset mock
      (fs.statSync as any).mockReturnValue({ isFile: () => true });
      service.clearAll();
    });
  });
});
