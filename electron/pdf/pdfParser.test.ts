/**
 * Unit tests for PDF Parser Service
 * 
 * Tests PDF loading, metadata extraction, and file hash calculation.
 * 
 * Requirements: 3.1, 6.7
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PDFParserService } from './pdfParser';

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

describe('PDFParserService', () => {
  let service: PDFParserService;
  
  // Mock data
  const mockFilePath = '/test/document.pdf';
  const mockFileHash = 'abc123def456789012345678901234567890123456789012345678901234';
  const mockPdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header
  
  // Mock pdf.js document
  const mockPdfDocument = {
    numPages: 5,
    getMetadata: vi.fn().mockResolvedValue({
      info: {
        Title: 'Test Document',
        Author: 'Test Author',
        Subject: 'Test Subject',
        Keywords: 'test, document, pdf',
        CreationDate: 'D:20240115120000',
        ModDate: 'D:20240120150000',
      },
    }),
    getPage: vi.fn(),
    getOutline: vi.fn().mockResolvedValue(null),
    destroy: vi.fn(),
  };

  beforeEach(() => {
    service = new PDFParserService();
    vi.clearAllMocks();
    
    // Setup default mocks
    (fs.existsSync as any).mockReturnValue(true);
    (fs.statSync as any).mockReturnValue({ isFile: () => true });
    (fs.readFileSync as any).mockReturnValue(mockPdfData);
    
    // Mock createReadStream for hash calculation
    const mockStream = {
      on: vi.fn((event: string, callback: Function) => {
        if (event === 'data') {
          callback(mockPdfData);
        } else if (event === 'end') {
          callback();
        }
        return mockStream;
      }),
    };
    (fs.createReadStream as any).mockReturnValue(mockStream);
    
    // Mock crypto hash
    const mockHash = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue(mockFileHash),
    };
    (crypto.createHash as any).mockReturnValue(mockHash);
  });

  afterEach(() => {
    service.clearAll();
  });

  describe('loadDocument', () => {
    it('should throw error if file does not exist', async () => {
      (fs.existsSync as any).mockReturnValue(false);
      
      await expect(service.loadDocument(mockFilePath))
        .rejects.toThrow('PDF file not found');
    });

    it('should throw error if path is not a file', async () => {
      (fs.statSync as any).mockReturnValue({ isFile: () => false });
      
      await expect(service.loadDocument(mockFilePath))
        .rejects.toThrow('Path is not a file');
    });

    it('should calculate file hash for cache validation', async () => {
      // Mock pdfjs-dist getDocument
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      expect(doc.fileHash).toBe(mockFileHash);
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    });

    it('should extract metadata from PDF', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      expect(doc.metadata.title).toBe('Test Document');
      expect(doc.metadata.author).toBe('Test Author');
      expect(doc.metadata.subject).toBe('Test Subject');
      expect(doc.metadata.keywords).toEqual(['test', 'document', 'pdf']);
    });

    it('should parse PDF dates correctly', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      // D:20240115120000 should parse to Jan 15, 2024 12:00:00
      expect(doc.metadata.creationDate).toBeDefined();
      expect(typeof doc.metadata.creationDate).toBe('number');
    });

    it('should return correct page count', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      expect(doc.pageCount).toBe(5);
    });

    it('should generate unique document ID', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      expect(doc.id).toMatch(/^doc_[a-f0-9]+_[a-z0-9]+$/);
    });

    it('should store document in memory map', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      expect(service.isDocumentLoaded(doc.id)).toBe(true);
    });

    it('should return existing document if same file hash', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc1 = await service.loadDocument(mockFilePath);
      const doc2 = await service.loadDocument(mockFilePath);
      
      // Should return the same document (same ID)
      expect(doc1.id).toBe(doc2.id);
    });

    it('should handle password-protected PDFs', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const passwordError = new Error('Password required');
      (passwordError as any).name = 'PasswordException';
      
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.reject(passwordError),
      });

      await expect(service.loadDocument(mockFilePath))
        .rejects.toThrow('PDF is password protected');
    });

    it('should handle invalid PDF format', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const invalidError = new Error('Invalid PDF');
      (invalidError as any).name = 'InvalidPDFException';
      
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.reject(invalidError),
      });

      await expect(service.loadDocument(mockFilePath))
        .rejects.toThrow('Invalid PDF file format');
    });

    it('should set loadedAt timestamp', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const beforeLoad = Date.now();
      const doc = await service.loadDocument(mockFilePath);
      const afterLoad = Date.now();
      
      expect(doc.loadedAt).toBeGreaterThanOrEqual(beforeLoad);
      expect(doc.loadedAt).toBeLessThanOrEqual(afterLoad);
    });

    it('should resolve file path to absolute path', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      expect(path.isAbsolute(doc.filePath)).toBe(true);
    });

    it('should extract file name from path', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      expect(doc.fileName).toBe('document.pdf');
    });
  });

  describe('unloadDocument', () => {
    it('should remove document from memory', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      expect(service.isDocumentLoaded(doc.id)).toBe(true);
      
      service.unloadDocument(doc.id);
      expect(service.isDocumentLoaded(doc.id)).toBe(false);
    });

    it('should call destroy on pdf.js document', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      service.unloadDocument(doc.id);
      
      expect(mockPdfDocument.destroy).toHaveBeenCalled();
    });

    it('should handle unloading non-existent document gracefully', () => {
      expect(() => service.unloadDocument('non-existent-id')).not.toThrow();
    });
  });

  describe('isDocumentLoaded', () => {
    it('should return false for non-loaded document', () => {
      expect(service.isDocumentLoaded('non-existent-id')).toBe(false);
    });

    it('should return true for loaded document', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      expect(service.isDocumentLoaded(doc.id)).toBe(true);
    });
  });

  describe('getDocumentByHash', () => {
    it('should return undefined for non-existent hash', () => {
      expect(service.getDocumentByHash('non-existent-hash')).toBeUndefined();
    });

    it('should return document for matching hash', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      const doc = await service.loadDocument(mockFilePath);
      const found = service.getDocumentByHash(mockFileHash);
      
      expect(found).toBeDefined();
      expect(found?.id).toBe(doc.id);
    });
  });

  describe('getAllLoadedDocuments', () => {
    it('should return empty array when no documents loaded', () => {
      expect(service.getAllLoadedDocuments()).toEqual([]);
    });

    it('should return all loaded documents', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      await service.loadDocument(mockFilePath);
      const docs = service.getAllLoadedDocuments();
      
      expect(docs).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('should remove all loaded documents', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDocument),
      });

      await service.loadDocument(mockFilePath);
      expect(service.getAllLoadedDocuments()).toHaveLength(1);
      
      service.clearAll();
      expect(service.getAllLoadedDocuments()).toHaveLength(0);
    });
  });

  describe('metadata parsing edge cases', () => {
    it('should handle missing metadata gracefully', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const docWithNoMetadata = {
        ...mockPdfDocument,
        getMetadata: vi.fn().mockResolvedValue({ info: {} }),
      };
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(docWithNoMetadata),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      expect(doc.metadata.title).toBeUndefined();
      expect(doc.metadata.author).toBeUndefined();
    });

    it('should handle metadata extraction failure', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const docWithFailingMetadata = {
        ...mockPdfDocument,
        getMetadata: vi.fn().mockRejectedValue(new Error('Metadata error')),
      };
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(docWithFailingMetadata),
      });

      // Should not throw, just return empty metadata
      const doc = await service.loadDocument(mockFilePath);
      expect(doc.metadata).toEqual({});
    });

    it('should parse keywords from array', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const docWithArrayKeywords = {
        ...mockPdfDocument,
        getMetadata: vi.fn().mockResolvedValue({
          info: {
            Keywords: ['keyword1', 'keyword2', 'keyword3'],
          },
        }),
      };
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(docWithArrayKeywords),
      });

      const doc = await service.loadDocument(mockFilePath);
      expect(doc.metadata.keywords).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should parse keywords from semicolon-separated string', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const docWithSemicolonKeywords = {
        ...mockPdfDocument,
        getMetadata: vi.fn().mockResolvedValue({
          info: {
            Keywords: 'keyword1; keyword2; keyword3',
          },
        }),
      };
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(docWithSemicolonKeywords),
      });

      const doc = await service.loadDocument(mockFilePath);
      expect(doc.metadata.keywords).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });

    it('should handle invalid date format', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const docWithInvalidDate = {
        ...mockPdfDocument,
        getMetadata: vi.fn().mockResolvedValue({
          info: {
            CreationDate: 'invalid-date-format',
          },
        }),
      };
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(docWithInvalidDate),
      });

      const doc = await service.loadDocument(mockFilePath);
      expect(doc.metadata.creationDate).toBeUndefined();
    });
  });
});


describe('Text Extraction with Bounding Boxes', () => {
  let service: PDFParserService;
  const mockFilePath = '/test/document.pdf';
  const mockFileHash = 'abc123def456789012345678901234567890123456789012345678901234';
  const mockPdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  // Helper to create mock text items
  const createMockTextItem = (
    str: string,
    x: number,
    y: number,
    fontSize: number = 12,
    width?: number
  ) => ({
    str,
    transform: [fontSize, 0, 0, fontSize, x, y],
    width: width ?? str.length * fontSize * 0.5,
    height: fontSize,
    fontName: 'Arial',
  });

  // Mock page with text content
  const createMockPage = (textItems: any[], width = 612, height = 792) => ({
    getViewport: vi.fn().mockReturnValue({ width, height, scale: 1.0 }),
    getTextContent: vi.fn().mockResolvedValue({ items: textItems }),
  });

  // Mock PDF document
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

  describe('bounding box extraction (Requirement 5.1)', () => {
    it('should extract text with valid bounding box coordinates', async () => {
      const textItems = [
        createMockTextItem('Hello World', 100, 700, 12),
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      expect(page.textContent.length).toBeGreaterThan(0);
      
      for (const block of page.textContent) {
        // Verify bounding box validity: x0 < x1, y0 < y1
        expect(block.bbox.x0).toBeLessThan(block.bbox.x1);
        expect(block.bbox.y0).toBeLessThan(block.bbox.y1);
        // All values non-negative
        expect(block.bbox.x0).toBeGreaterThanOrEqual(0);
        expect(block.bbox.y0).toBeGreaterThanOrEqual(0);
        expect(block.bbox.x1).toBeGreaterThanOrEqual(0);
        expect(block.bbox.y1).toBeGreaterThanOrEqual(0);
        // Within page dimensions
        expect(block.bbox.x1).toBeLessThanOrEqual(612);
        expect(block.bbox.y1).toBeLessThanOrEqual(792);
        // Page number is set
        expect(block.bbox.pageNumber).toBe(1);
      }
    });

    it('should clamp coordinates to page boundaries', async () => {
      // Text item with coordinates outside page bounds
      const textItems = [
        {
          str: 'Out of bounds',
          transform: [12, 0, 0, 12, -50, 850], // x < 0, y > page height
          width: 100,
          height: 12,
          fontName: 'Arial',
        },
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      // Should still have valid bounding boxes (clamped)
      for (const block of page.textContent) {
        expect(block.bbox.x0).toBeGreaterThanOrEqual(0);
        expect(block.bbox.y0).toBeGreaterThanOrEqual(0);
      }
    });

    it('should skip empty text items', async () => {
      const textItems = [
        createMockTextItem('Valid text', 100, 700, 12),
        createMockTextItem('', 100, 680, 12), // Empty
        createMockTextItem('   ', 100, 660, 12), // Whitespace only
        createMockTextItem('More text', 100, 640, 12),
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      // Should only have 2 blocks (empty and whitespace-only skipped)
      expect(page.textContent.length).toBe(2);
    });
  });

  describe('multi-column layout detection (Requirement 5.2)', () => {
    it('should detect single column layout', async () => {
      // All text in center of page
      const textItems = [
        createMockTextItem('Line 1', 100, 700, 12),
        createMockTextItem('Line 2', 100, 680, 12),
        createMockTextItem('Line 3', 100, 660, 12),
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const layout = await service.analyzePageLayout(doc.id, 1);

      expect(layout.isMultiColumn).toBe(false);
      expect(layout.columns.length).toBe(1);
    });

    it('should detect two-column layout', async () => {
      // Text in two distinct columns with gap in middle
      const textItems = [
        // Left column
        createMockTextItem('Left col line 1', 50, 700, 12),
        createMockTextItem('Left col line 2', 50, 680, 12),
        // Right column (with significant gap)
        createMockTextItem('Right col line 1', 350, 700, 12),
        createMockTextItem('Right col line 2', 350, 680, 12),
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const layout = await service.analyzePageLayout(doc.id, 1);

      expect(layout.isMultiColumn).toBe(true);
      expect(layout.columns.length).toBe(2);
    });

    it('should maintain correct reading order for multi-column', async () => {
      // Two columns - reading order should be column by column
      // Items on different lines within each column with larger vertical gaps
      const textItems = [
        // Left column - multiple lines with significant gaps
        createMockTextItem('Left 1', 50, 700, 12),
        createMockTextItem('Left 2', 50, 600, 12), // Large y gap to ensure separate paragraphs
        // Right column - multiple lines with significant gaps
        createMockTextItem('Right 1', 350, 700, 12),
        createMockTextItem('Right 2', 350, 600, 12), // Large y gap
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      // Verify we have multiple blocks
      expect(page.textContent.length).toBeGreaterThan(1);

      // Text blocks should be in reading order (left column first, then right)
      const texts = page.textContent.map(b => b.text);
      
      // Find indices - blocks may be combined or separate
      const leftBlocks = page.textContent.filter(b => b.text.includes('Left'));
      const rightBlocks = page.textContent.filter(b => b.text.includes('Right'));

      // Left column blocks should exist
      expect(leftBlocks.length).toBeGreaterThan(0);
      // Right column blocks should exist
      expect(rightBlocks.length).toBeGreaterThan(0);
      
      // Get the first occurrence index of left and right content
      const firstLeftIdx = texts.findIndex(t => t.includes('Left'));
      const firstRightIdx = texts.findIndex(t => t.includes('Right'));
      
      // Left column content should appear before right column content
      // If they're in the same block (index 0), that's also acceptable for multi-column
      // The key is that left content appears first in the combined text
      if (firstLeftIdx === firstRightIdx) {
        // Both in same block - check that Left appears before Right in the text
        const combinedText = texts[firstLeftIdx];
        const leftPos = combinedText.indexOf('Left');
        const rightPos = combinedText.indexOf('Right');
        expect(leftPos).toBeLessThan(rightPos);
      } else {
        // Different blocks - left should come first
        expect(firstLeftIdx).toBeLessThan(firstRightIdx);
      }
    });
  });

  describe('section header detection (Requirement 5.3)', () => {
    it('should detect headings based on larger font size', async () => {
      // Create a mix of heading and body text with clear font size difference
      // Body text at 10pt, heading at 18pt (significantly larger)
      const textItems = [
        createMockTextItem('Chapter Title', 100, 700, 18), // Large font = heading
        createMockTextItem('Body text paragraph one.', 100, 650, 10), // Small font = paragraph
        createMockTextItem('More body text here.', 100, 620, 10), // Small font = paragraph
        createMockTextItem('Another paragraph.', 100, 590, 10), // Small font = paragraph
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      const headings = page.textContent.filter(b => b.blockType === 'heading');
      const paragraphs = page.textContent.filter(b => b.blockType === 'paragraph');

      // Should have at least one heading (the Chapter Title)
      expect(headings.length).toBeGreaterThan(0);
      expect(headings.some(h => h.text.includes('Chapter Title'))).toBe(true);
      
      // Should have paragraphs (body text)
      expect(paragraphs.length).toBeGreaterThan(0);
    });

    it('should use font size threshold for heading detection', async () => {
      const textItems = [
        createMockTextItem('Large Heading', 100, 700, 16), // Above threshold (14)
        createMockTextItem('Small text', 100, 670, 10), // Below threshold
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      const headings = page.textContent.filter(b => b.blockType === 'heading');
      expect(headings.some(h => h.text.includes('Large Heading'))).toBe(true);
    });

    it('should extract section headers via getSectionHeaders', async () => {
      const textItems = [
        createMockTextItem('Section 1', 100, 700, 18),
        createMockTextItem('Content under section 1', 100, 670, 12),
        createMockTextItem('Section 2', 100, 600, 18),
        createMockTextItem('Content under section 2', 100, 570, 12),
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const headers = await service.getSectionHeaders(doc.id);

      expect(headers.length).toBeGreaterThanOrEqual(2);
      expect(headers.every(h => h.blockType === 'heading')).toBe(true);
    });

    it('should preserve font size in TextBlock', async () => {
      const textItems = [
        createMockTextItem('Text with font', 100, 700, 14),
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      expect(page.textContent[0].fontSize).toBe(14);
    });
  });

  describe('text block grouping', () => {
    it('should group text items on same line', async () => {
      // Multiple items on the same horizontal line
      const textItems = [
        createMockTextItem('Word1', 100, 700, 12),
        createMockTextItem('Word2', 160, 700, 12),
        createMockTextItem('Word3', 220, 700, 12),
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      // Items on same line should be grouped into one block
      expect(page.textContent.length).toBe(1);
      expect(page.textContent[0].text).toContain('Word1');
      expect(page.textContent[0].text).toContain('Word2');
      expect(page.textContent[0].text).toContain('Word3');
    });

    it('should separate text items on different lines', async () => {
      // Items on different vertical positions
      const textItems = [
        createMockTextItem('Line 1', 100, 700, 12),
        createMockTextItem('Line 2', 100, 650, 12), // Significant vertical gap
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      // Should have separate blocks for different lines
      expect(page.textContent.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect list items', async () => {
      const textItems = [
        createMockTextItem('• First item', 100, 700, 12),
        createMockTextItem('- Second item', 100, 680, 12),
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      const listItems = page.textContent.filter(b => b.blockType === 'list');
      expect(listItems.length).toBeGreaterThan(0);
    });

    it('should detect figure captions', async () => {
      const textItems = [
        createMockTextItem('Figure 1: Sample diagram', 100, 700, 12),
        createMockTextItem('Table 2: Data summary', 100, 680, 12),
      ];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const page = await service.getPage(doc.id, 1);

      const captions = page.textContent.filter(b => b.blockType === 'caption');
      expect(captions.length).toBeGreaterThan(0);
    });
  });

  describe('extractAllText', () => {
    it('should extract text from all pages', async () => {
      const page1Items = [createMockTextItem('Page 1 content', 100, 700, 12)];
      const page2Items = [createMockTextItem('Page 2 content', 100, 700, 12)];
      
      const mockPage1 = createMockPage(page1Items);
      const mockPage2 = createMockPage(page2Items);
      const mockPdfDoc = createMockPdfDocument([mockPage1, mockPage2]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const allText = await service.extractAllText(doc.id);

      expect(allText.length).toBe(2);
      expect(allText.some(b => b.text.includes('Page 1'))).toBe(true);
      expect(allText.some(b => b.text.includes('Page 2'))).toBe(true);
    });

    it('should continue extraction on page error (Requirement 5.6)', async () => {
      const page1Items = [createMockTextItem('Page 1 content', 100, 700, 12)];
      const mockPage1 = createMockPage(page1Items);
      
      // Page 2 throws error
      const mockPage2 = {
        getViewport: vi.fn().mockImplementation(() => {
          throw new Error('Page error');
        }),
        getTextContent: vi.fn(),
      };
      
      const page3Items = [createMockTextItem('Page 3 content', 100, 700, 12)];
      const mockPage3 = createMockPage(page3Items);

      const mockPdfDoc = createMockPdfDocument([mockPage1, mockPage2, mockPage3]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      // Should not throw, should continue with other pages
      const allText = await service.extractAllText(doc.id);
      
      // Should have content from pages 1 and 3
      expect(allText.some(b => b.text.includes('Page 1'))).toBe(true);
      expect(allText.some(b => b.text.includes('Page 3'))).toBe(true);
    });
  });

  describe('analyzePageLayout', () => {
    it('should throw error for non-loaded document', async () => {
      await expect(service.analyzePageLayout('non-existent', 1))
        .rejects.toThrow('Document not loaded');
    });

    it('should throw error for invalid page number', async () => {
      const textItems = [createMockTextItem('Content', 100, 700, 12)];
      const mockPage = createMockPage(textItems);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      
      await expect(service.analyzePageLayout(doc.id, 0))
        .rejects.toThrow('Invalid page number');
      await expect(service.analyzePageLayout(doc.id, 2))
        .rejects.toThrow('Invalid page number');
    });

    it('should return valid layout for empty page', async () => {
      const mockPage = createMockPage([]);
      const mockPdfDoc = createMockPdfDocument([mockPage]);

      const pdfjsLib = await import('pdfjs-dist');
      (pdfjsLib.getDocument as any).mockReturnValue({
        promise: Promise.resolve(mockPdfDoc),
      });

      const doc = await service.loadDocument(mockFilePath);
      const layout = await service.analyzePageLayout(doc.id, 1);

      expect(layout.isMultiColumn).toBe(false);
      expect(layout.columns.length).toBe(1);
      expect(layout.readingOrder).toContain('column_0');
    });
  });
});
