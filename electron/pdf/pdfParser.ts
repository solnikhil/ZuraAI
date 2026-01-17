/**
 * PDF Parser Service
 * 
 * This service handles PDF loading, parsing, and text extraction in the Electron main process.
 * It uses pdf.js for PDF parsing and provides methods for:
 * - Loading PDF documents with metadata extraction
 * - Extracting text with bounding box coordinates
 * - Searching text within documents
 * - Managing loaded documents in memory
 * 
 * Requirements: 3.1, 5.1, 5.2, 5.3, 5.6, 5.7, 6.7, 18.1, 18.5
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  PDFDocument,
  PDFMetadata,
  PDFPage,
  TextBlock,
  BoundingBox,
  ImageBlock,
  TableBlock,
  OutlineItem,
  TextSearchResult,
} from '../../src/types/pdf';
import type {
  LoadedPDF,
  IPDFParserService,
  TextExtractionOptions,
  LayoutAnalysisResult,
  ColumnRegion,
} from './types';

// pdf.js types - using any for PDFDocumentProxy since types may vary
type PDFDocumentProxy = any;
type PDFPageProxy = any;

/**
 * Default text extraction options
 */
const DEFAULT_EXTRACTION_OPTIONS: TextExtractionOptions = {
  preserveLayout: true,
  extractTables: true,
  extractFigures: true,
  headingFontSizeThreshold: 14,
};

/**
 * Configuration for multi-column layout detection
 */
const LAYOUT_DETECTION_CONFIG = {
  /** Minimum gap between columns (as percentage of page width) */
  minColumnGapPercent: 0.03,
  /** Minimum column width (as percentage of page width) */
  minColumnWidthPercent: 0.15,
  /** Maximum number of columns to detect */
  maxColumns: 4,
  /** Vertical tolerance for grouping items into lines (in points) */
  lineGroupingTolerance: 3,
  /** Horizontal gap threshold for word separation (in points) */
  wordGapThreshold: 5,
};

/**
 * Represents a text item from pdf.js with position information
 */
interface PDFTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
  hasEOL?: boolean;
}

/**
 * Represents a line of text items grouped by vertical position
 */
interface TextLine {
  y: number;
  items: Array<{
    text: string;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    fontSize: number;
    fontName?: string;
  }>;
}

/**
 * Represents a paragraph or text block built from lines
 */
interface TextParagraph {
  lines: TextLine[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
  fontSize: number;
  fontName?: string;
  isHeading: boolean;
  columnIndex: number;
}

/**
 * PDF Parser Service implementation
 * 
 * Manages PDF document loading, parsing, and text extraction.
 * Documents are stored in memory for quick access.
 */
export class PDFParserService implements IPDFParserService {
  /** Map of loaded documents by ID */
  private loadedDocuments: Map<string, LoadedPDF> = new Map();
  
  /** pdf.js library reference (lazy loaded) */
  private pdfjs: any = null;
  
  /** Whether pdf.js has been initialized */
  private initialized: boolean = false;

  /**
   * Initialize pdf.js library
   * This is done lazily to avoid loading the library until needed
   */
  private async initializePdfJs(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Add Node.js polyfills for browser APIs that pdf.js requires
      // These are needed because pdf.js expects browser environment
      // IMPORTANT: These must be set before importing pdf.js
      
      // Polyfill for Promise.withResolvers (added in Node.js 22, but Electron 25 uses Node 18)
      // pdf.js v5 uses this feature
      if (typeof (Promise as any).withResolvers === 'undefined') {
        (Promise as any).withResolvers = function<T>(): {
          promise: Promise<T>;
          resolve: (value: T | PromiseLike<T>) => void;
          reject: (reason?: any) => void;
        } {
          let resolve!: (value: T | PromiseLike<T>) => void;
          let reject!: (reason?: any) => void;
          const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
          });
          return { promise, resolve, reject };
        };
      }
      
      // Polyfill for URL.parse (added in Node.js 22.1.0)
      // Returns URL object if valid, null if invalid
      if (typeof (URL as any).parse === 'undefined') {
        (URL as any).parse = function(url: string, base?: string): URL | null {
          try {
            return new URL(url, base);
          } catch {
            return null;
          }
        };
      }
      
      if (typeof (globalThis as any).DOMMatrix === 'undefined') {
        // Simple DOMMatrix polyfill for Node.js
        (globalThis as any).DOMMatrix = class DOMMatrix {
          a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
          m11 = 1; m12 = 0; m13 = 0; m14 = 0;
          m21 = 0; m22 = 1; m23 = 0; m24 = 0;
          m31 = 0; m32 = 0; m33 = 1; m34 = 0;
          m41 = 0; m42 = 0; m43 = 0; m44 = 1;
          is2D = true;
          isIdentity = true;
          
          constructor(init?: number[] | string) {
            if (Array.isArray(init) && init.length === 6) {
              [this.a, this.b, this.c, this.d, this.e, this.f] = init;
              this.m11 = this.a; this.m12 = this.b;
              this.m21 = this.c; this.m22 = this.d;
              this.m41 = this.e; this.m42 = this.f;
            }
          }
          
          static fromMatrix(other?: any): any {
            return new (globalThis as any).DOMMatrix();
          }
          
          static fromFloat32Array(array: Float32Array): any {
            return new (globalThis as any).DOMMatrix(Array.from(array));
          }
          
          static fromFloat64Array(array: Float64Array): any {
            return new (globalThis as any).DOMMatrix(Array.from(array));
          }
          
          multiply(): any { return new (globalThis as any).DOMMatrix(); }
          translate(): any { return new (globalThis as any).DOMMatrix(); }
          scale(): any { return new (globalThis as any).DOMMatrix(); }
          rotate(): any { return new (globalThis as any).DOMMatrix(); }
          inverse(): any { return new (globalThis as any).DOMMatrix(); }
          transformPoint(point?: any): any { return { x: 0, y: 0, z: 0, w: 1 }; }
          toFloat32Array(): Float32Array { return new Float32Array(16); }
          toFloat64Array(): Float64Array { return new Float64Array(16); }
        };
      }
      
      if (typeof (globalThis as any).Path2D === 'undefined') {
        // Simple Path2D polyfill for Node.js
        (globalThis as any).Path2D = class Path2D {
          private _commands: string[] = [];
          
          constructor(path?: Path2D | string) {}
          
          addPath(path: Path2D): void {}
          closePath(): void {}
          moveTo(x: number, y: number): void {}
          lineTo(x: number, y: number): void {}
          bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {}
          quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {}
          arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {}
          arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {}
          ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {}
          rect(x: number, y: number, w: number, h: number): void {}
        };
      }
      
      // Additional polyfills that pdf.js may need
      if (typeof (globalThis as any).ImageData === 'undefined') {
        (globalThis as any).ImageData = class ImageData {
          width: number;
          height: number;
          data: Uint8ClampedArray;
          colorSpace: string = 'srgb';
          
          constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
            if (typeof dataOrWidth === 'number') {
              this.width = dataOrWidth;
              this.height = widthOrHeight;
              this.data = new Uint8ClampedArray(this.width * this.height * 4);
            } else {
              this.data = dataOrWidth;
              this.width = widthOrHeight;
              this.height = height || (dataOrWidth.length / 4 / widthOrHeight);
            }
          }
        };
      }
      
      // Use the legacy build of pdf.js which has better Node.js compatibility
      // pdfjs-dist v3.x uses .js files, v5.x uses .mjs files
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
      this.pdfjs = pdfjsLib;
      
      // For Node.js/Electron main process, we need to configure the web worker properly.
      // pdf.js v5 requires GlobalWorkerOptions.workerSrc to be set to a valid path.
      // 
      // On Windows, the path must be a file:// URL for the ESM loader.
      // We use pathToFileURL to convert the resolved path to a proper file URL.
      try {
        const { createRequire } = await import('module');
        const { pathToFileURL } = await import('url');
        const require = createRequire(import.meta.url);
        const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
        
        // Convert the absolute path to a file:// URL for Windows compatibility
        const workerUrl = pathToFileURL(workerPath).href;
        
        if (this.pdfjs.GlobalWorkerOptions) {
          this.pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        }
      } catch (workerError) {
        // If we can't resolve the worker path, try an alternative approach
        console.warn('Failed to resolve pdf.js worker path, trying alternative:', workerError);
        
        // Try using the path relative to this module
        // This is a fallback for bundled environments
        try {
          const { fileURLToPath, pathToFileURL } = await import('url');
          const { dirname, join } = await import('path');
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = dirname(__filename);
          
          // In the bundled Electron app, the worker should be in node_modules
          // relative to the app root. pdfjs-dist v3.x uses .js files
          const possiblePaths = [
            join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.js'),
            join(__dirname, '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.js'),
            join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.js'),
          ];
          
          const { existsSync } = await import('fs');
          for (const workerPath of possiblePaths) {
            if (existsSync(workerPath)) {
              // Convert to file:// URL for Windows compatibility
              const workerUrl = pathToFileURL(workerPath).href;
              if (this.pdfjs.GlobalWorkerOptions) {
                this.pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
              }
              break;
            }
          }
        } catch (fallbackError) {
          console.warn('Failed to set pdf.js worker path:', fallbackError);
          // Continue without worker - pdf.js will attempt to use fake worker
        }
      }
      
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize pdf.js: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate SHA-256 hash of a file for cache validation
   * 
   * @param filePath - Path to the file
   * @returns Promise resolving to the hex-encoded hash
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (error) => reject(error));
    });
  }

  /**
   * Generate a unique document ID
   * Uses a combination of file hash and timestamp for uniqueness
   * 
   * @param fileHash - SHA-256 hash of the file
   * @returns Unique document ID
   */
  private generateDocumentId(fileHash: string): string {
    // Use first 16 characters of hash + timestamp for uniqueness
    const timestamp = Date.now().toString(36);
    return `doc_${fileHash.substring(0, 16)}_${timestamp}`;
  }

  /**
   * Extract metadata from PDF info dictionary
   * 
   * @param pdfDocument - pdf.js document proxy
   * @returns Promise resolving to PDFMetadata
   */
  private async extractMetadata(pdfDocument: PDFDocumentProxy): Promise<PDFMetadata> {
    try {
      const metadata = await pdfDocument.getMetadata();
      const info = metadata?.info || {};
      
      // Parse dates from PDF format (D:YYYYMMDDHHmmSS)
      const parseDate = (dateStr: string | undefined): number | undefined => {
        if (!dateStr) return undefined;
        
        try {
          // Remove 'D:' prefix if present
          const cleaned = dateStr.replace(/^D:/, '');
          
          // Parse PDF date format: YYYYMMDDHHmmSS
          const year = parseInt(cleaned.substring(0, 4), 10);
          const month = parseInt(cleaned.substring(4, 6), 10) - 1; // 0-indexed
          const day = parseInt(cleaned.substring(6, 8), 10);
          const hour = parseInt(cleaned.substring(8, 10), 10) || 0;
          const minute = parseInt(cleaned.substring(10, 12), 10) || 0;
          const second = parseInt(cleaned.substring(12, 14), 10) || 0;
          
          const date = new Date(year, month, day, hour, minute, second);
          return isNaN(date.getTime()) ? undefined : date.getTime();
        } catch {
          return undefined;
        }
      };

      // Parse keywords from string or array
      const parseKeywords = (keywords: string | string[] | undefined): string[] | undefined => {
        if (!keywords) return undefined;
        if (Array.isArray(keywords)) return keywords;
        // Split by comma or semicolon
        return keywords.split(/[,;]/).map(k => k.trim()).filter(k => k.length > 0);
      };

      return {
        title: info.Title || undefined,
        author: info.Author || undefined,
        subject: info.Subject || undefined,
        keywords: parseKeywords(info.Keywords),
        creationDate: parseDate(info.CreationDate),
        modificationDate: parseDate(info.ModDate),
      };
    } catch (error) {
      // Return empty metadata on error - don't fail the whole load
      console.warn('Failed to extract PDF metadata:', error);
      return {};
    }
  }

  /**
   * Check if a PDF is password protected
   * 
   * Implements Requirement 18.5: Password-protected PDF detection
   * 
   * @param filePath - Path to the PDF file
   * @returns Promise resolving to true if password protected
   */
  async isPasswordProtected(filePath: string): Promise<boolean> {
    await this.initializePdfJs();
    
    try {
      const data = new Uint8Array(fs.readFileSync(filePath));
      const loadingTask = this.pdfjs.getDocument({ 
        data,
        disableFontFace: true,
        isEvalSupported: false,
        useSystemFonts: false,
        useWorkerFetch: false,
      });
      
      try {
        await loadingTask.promise;
        return false;
      } catch (error: any) {
        // pdf.js throws PasswordException for protected PDFs
        if (error?.name === 'PasswordException') {
          return true;
        }
        throw error;
      }
    } catch (error: any) {
      if (error?.name === 'PasswordException') {
        return true;
      }
      throw error;
    }
  }

  /**
   * Validate PDF file structure before loading
   * 
   * Implements Requirement 5.6: Handle malformed PDFs gracefully
   * 
   * @param filePath - Path to the PDF file
   * @returns Promise resolving to validation result
   */
  async validatePDF(filePath: string): Promise<{
    valid: boolean;
    error?: string;
    isPasswordProtected?: boolean;
  }> {
    // Check file exists
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'File not found' };
    }

    // Check file is readable
    try {
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return { valid: false, error: 'Path is not a file' };
      }
    } catch (error) {
      return { valid: false, error: 'Cannot read file' };
    }

    // Check PDF header
    try {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(8);
      fs.readSync(fd, buffer, 0, 8, 0);
      fs.closeSync(fd);
      
      const header = buffer.toString('ascii');
      if (!header.startsWith('%PDF-')) {
        return { valid: false, error: 'Invalid PDF header - file may be corrupted' };
      }
    } catch (error) {
      return { valid: false, error: 'Cannot read PDF header' };
    }

    // Try to load the PDF
    try {
      await this.initializePdfJs();
      const data = new Uint8Array(fs.readFileSync(filePath));
      const loadingTask = this.pdfjs.getDocument({ 
        data,
        disableFontFace: true,
        isEvalSupported: false,
        useSystemFonts: false,
        useWorkerFetch: false,
      });
      
      try {
        const doc = await loadingTask.promise;
        doc.destroy();
        return { valid: true };
      } catch (error: any) {
        if (error?.name === 'PasswordException') {
          return { valid: true, isPasswordProtected: true };
        }
        if (error?.name === 'InvalidPDFException') {
          return { valid: false, error: 'Invalid PDF structure' };
        }
        return { valid: false, error: `PDF parsing error: ${error?.message || 'Unknown error'}` };
      }
    } catch (error: any) {
      return { valid: false, error: `Validation error: ${error?.message || 'Unknown error'}` };
    }
  }

  /**
   * Load a PDF document and extract metadata
   * 
   * Implements Requirement 3.1: Load PDF within 3 seconds for files under 10MB
   * Implements Requirement 6.7: Calculate file hash for cache validation
   * 
   * @param filePath - Path to the PDF file
   * @param password - Optional password for protected PDFs
   * @returns Promise resolving to PDFDocument
   * @throws Error if file not found, invalid PDF, or password required
   */
  async loadDocument(filePath: string, password?: string): Promise<PDFDocument> {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    // Get file stats for validation
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    // Initialize pdf.js
    await this.initializePdfJs();

    // Calculate file hash for cache validation (Requirement 6.7)
    const fileHash = await this.calculateFileHash(filePath);

    // Check if document is already loaded with same hash
    for (const [docId, loaded] of this.loadedDocuments) {
      if (loaded.document.fileHash === fileHash) {
        // Return existing document
        return loaded.document;
      }
    }

    // Read file data
    const data = new Uint8Array(fs.readFileSync(filePath));

    // Prepare loading options with Node.js-specific settings
    const loadingOptions: any = { 
      data,
      // Disable features that require browser APIs not available in Node.js
      disableFontFace: true,
      isEvalSupported: false,
      // Use standard fonts which are built into pdf.js
      useSystemFonts: false,
      // Disable worker fetch to avoid network requests for worker
      useWorkerFetch: false,
    };
    if (password) {
      loadingOptions.password = password;
    }

    // Load PDF document
    let pdfDocument: PDFDocumentProxy;
    try {
      const loadingTask = this.pdfjs.getDocument(loadingOptions);
      pdfDocument = await loadingTask.promise;
    } catch (error: any) {
      // Handle password-protected PDFs (Requirement 18.5)
      if (error?.name === 'PasswordException') {
        if (password) {
          throw new Error('Incorrect password for PDF document');
        }
        throw new Error('PDF is password protected. Please provide the password.');
      }
      
      // Handle invalid PDF format
      if (error?.name === 'InvalidPDFException') {
        throw new Error('Invalid PDF file format');
      }
      
      throw new Error(`Failed to load PDF: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Extract metadata
    const metadata = await this.extractMetadata(pdfDocument);

    // Generate document ID
    const docId = this.generateDocumentId(fileHash);

    // Create PDFDocument object
    const document: PDFDocument = {
      id: docId,
      filePath: path.resolve(filePath),
      fileName: path.basename(filePath),
      fileHash,
      pageCount: pdfDocument.numPages,
      metadata,
      loadedAt: Date.now(),
    };

    // Store in memory map
    const loadedPDF: LoadedPDF = {
      document,
      pages: new Map(),
      pdfDocument,
      isFullyLoaded: false,
    };
    this.loadedDocuments.set(docId, loadedPDF);

    return document;
  }

  /**
   * Get a specific page from a loaded document
   * Pages are loaded on-demand and cached
   * 
   * Implements Requirement 5.6: Handle malformed PDFs gracefully
   * Implements Requirement 18.1: Continue parsing on region failures
   * 
   * @param docId - Document ID
   * @param pageNum - Page number (1-indexed)
   * @returns Promise resolving to PDFPage
   */
  async getPage(docId: string, pageNum: number): Promise<PDFPage> {
    const loaded = this.loadedDocuments.get(docId);
    if (!loaded) {
      throw new Error(`Document not loaded: ${docId}`);
    }

    // Validate page number
    if (pageNum < 1 || pageNum > loaded.document.pageCount) {
      throw new Error(`Invalid page number: ${pageNum}. Document has ${loaded.document.pageCount} pages.`);
    }

    // Check cache
    const cachedPage = loaded.pages.get(pageNum);
    if (cachedPage) {
      return cachedPage;
    }

    // Load page from pdf.js with error handling
    let pdfPage: PDFPageProxy;
    let viewport: any;
    
    try {
      pdfPage = await loaded.pdfDocument.getPage(pageNum);
      viewport = pdfPage.getViewport({ scale: 1.0 });
    } catch (error) {
      // Handle corrupted page - return empty page structure (Requirement 5.6)
      console.warn(`Failed to load page ${pageNum}:`, error);
      const emptyPage: PDFPage = {
        pageNumber: pageNum,
        width: 612, // Default letter size
        height: 792,
        textContent: [],
        images: [],
        tables: [],
      };
      loaded.pages.set(pageNum, emptyPage);
      return emptyPage;
    }

    // Extract text content with error handling (Requirement 5.6, 18.1)
    let textBlocks: TextBlock[] = [];
    try {
      const textContent = await pdfPage.getTextContent();
      textBlocks = this.processTextContent(textContent, pageNum, viewport);
    } catch (error) {
      // Continue with empty text content on failure
      console.warn(`Failed to extract text from page ${pageNum}:`, error);
    }

    // Extract tables from text blocks (Requirement 5.4)
    let tables: TableBlock[] = [];
    try {
      tables = this.extractTables(textBlocks, pageNum, viewport);
    } catch (error) {
      // Continue with empty tables on failure
      console.warn(`Failed to extract tables from page ${pageNum}:`, error);
    }

    // Extract images/figures from the page (Requirement 5.5)
    let images: ImageBlock[] = [];
    try {
      images = await this.extractImages(pdfPage, pageNum, viewport, textBlocks);
    } catch (error) {
      // Continue with empty images on failure (already handled in extractImages)
      console.warn(`Failed to extract images from page ${pageNum}:`, error);
    }

    // Create PDFPage object
    const page: PDFPage = {
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
      textContent: textBlocks,
      images,
      tables,
    };

    // Cache the page
    loaded.pages.set(pageNum, page);

    return page;
  }

  /**
   * Process text content from pdf.js into TextBlock array
   * 
   * This method implements:
   * - Bounding box extraction with valid coordinates (Requirement 5.1)
   * - Multi-column layout detection (Requirement 5.2)
   * - Section header detection using font heuristics (Requirement 5.3)
   * 
   * @param textContent - pdf.js text content object
   * @param pageNumber - Page number
   * @param viewport - Page viewport for coordinate transformation
   * @returns Array of TextBlock objects in reading order
   */
  private processTextContent(textContent: any, pageNumber: number, viewport: any): TextBlock[] {
    const items: PDFTextItem[] = textContent.items || [];
    
    if (items.length === 0) {
      return [];
    }

    // Step 1: Convert pdf.js items to normalized format with valid bounding boxes
    const normalizedItems = this.normalizeTextItems(items, pageNumber, viewport);
    
    if (normalizedItems.length === 0) {
      return [];
    }

    // Step 2: Group items into lines based on vertical position
    const lines = this.groupItemsIntoLines(normalizedItems);
    
    // Step 3: Detect multi-column layout
    const layoutAnalysis = this.analyzeLayout(lines, viewport.width, viewport.height, pageNumber);
    
    // Step 4: Group lines into paragraphs within each column
    const paragraphs = this.groupLinesIntoParagraphs(lines, layoutAnalysis, viewport);
    
    // Step 5: Calculate median font size for heading detection
    const medianFontSize = this.calculateMedianFontSize(normalizedItems);
    
    // Step 6: Convert paragraphs to TextBlocks with proper reading order
    const blocks = this.convertParagraphsToBlocks(
      paragraphs, 
      pageNumber, 
      medianFontSize, 
      layoutAnalysis.readingOrder
    );

    return blocks;
  }

  /**
   * Normalize pdf.js text items to a consistent format with valid bounding boxes
   * 
   * Ensures all coordinates are valid:
   * - x0 < x1, y0 < y1
   * - All values non-negative
   * - Within page dimensions
   * 
   * @param items - Raw pdf.js text items
   * @param pageNumber - Page number
   * @param viewport - Page viewport
   * @returns Normalized items with valid bounding boxes
   */
  private normalizeTextItems(
    items: PDFTextItem[], 
    pageNumber: number, 
    viewport: any
  ): Array<{
    text: string;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    fontSize: number;
    fontName?: string;
    hasEOL?: boolean;
  }> {
    const normalized: Array<{
      text: string;
      x0: number;
      x1: number;
      y0: number;
      y1: number;
      fontSize: number;
      fontName?: string;
      hasEOL?: boolean;
    }> = [];

    for (const item of items) {
      // Skip empty items
      if (!item.str || item.str.trim().length === 0) {
        continue;
      }

      // Get transform matrix for position
      // Transform matrix: [scaleX, skewX, skewY, scaleY, translateX, translateY]
      const tx = item.transform;
      if (!tx || tx.length < 6) {
        continue;
      }

      // Calculate font size from transform matrix
      // Font size is typically the scaleY component (tx[3]) or scaleX (tx[0])
      const fontSize = Math.abs(tx[3]) || Math.abs(tx[0]) || 12;
      
      // Calculate position
      // PDF coordinates have origin at bottom-left, we convert to top-left
      const x0 = tx[4];
      const y0PDF = tx[5]; // PDF y-coordinate (from bottom)
      
      // Calculate width and height
      const width = item.width || (item.str.length * fontSize * 0.5); // Estimate if not provided
      const height = item.height || fontSize;
      
      // Convert to top-left origin coordinate system
      const y0 = viewport.height - y0PDF - height;
      const y1 = viewport.height - y0PDF;
      const x1 = x0 + width;

      // Validate and clamp coordinates to ensure they're valid
      const validX0 = Math.max(0, Math.min(x0, viewport.width));
      const validX1 = Math.max(validX0 + 0.1, Math.min(x1, viewport.width)); // Ensure x1 > x0
      const validY0 = Math.max(0, Math.min(y0, viewport.height));
      const validY1 = Math.max(validY0 + 0.1, Math.min(y1, viewport.height)); // Ensure y1 > y0

      // Skip items with invalid dimensions after clamping
      if (validX1 - validX0 < 0.1 || validY1 - validY0 < 0.1) {
        continue;
      }

      normalized.push({
        text: item.str,
        x0: validX0,
        x1: validX1,
        y0: validY0,
        y1: validY1,
        fontSize,
        fontName: item.fontName,
        hasEOL: item.hasEOL,
      });
    }

    return normalized;
  }

  /**
   * Group text items into lines based on vertical position
   * 
   * @param items - Normalized text items
   * @returns Array of TextLine objects
   */
  private groupItemsIntoLines(
    items: Array<{
      text: string;
      x0: number;
      x1: number;
      y0: number;
      y1: number;
      fontSize: number;
      fontName?: string;
      hasEOL?: boolean;
    }>
  ): TextLine[] {
    if (items.length === 0) {
      return [];
    }

    // Sort items by y position (top to bottom), then by x position (left to right)
    const sortedItems = [...items].sort((a, b) => {
      const yDiff = a.y0 - b.y0;
      if (Math.abs(yDiff) > LAYOUT_DETECTION_CONFIG.lineGroupingTolerance) {
        return yDiff;
      }
      return a.x0 - b.x0;
    });

    const lines: TextLine[] = [];
    let currentLine: TextLine | null = null;

    for (const item of sortedItems) {
      const itemCenterY = (item.y0 + item.y1) / 2;

      if (!currentLine) {
        // Start a new line
        currentLine = {
          y: itemCenterY,
          items: [{
            text: item.text,
            x0: item.x0,
            x1: item.x1,
            y0: item.y0,
            y1: item.y1,
            fontSize: item.fontSize,
            fontName: item.fontName,
          }],
        };
      } else {
        // Check if item belongs to current line (within vertical tolerance)
        const tolerance = Math.max(
          LAYOUT_DETECTION_CONFIG.lineGroupingTolerance,
          item.fontSize * 0.5
        );
        
        if (Math.abs(itemCenterY - currentLine.y) <= tolerance) {
          // Add to current line
          currentLine.items.push({
            text: item.text,
            x0: item.x0,
            x1: item.x1,
            y0: item.y0,
            y1: item.y1,
            fontSize: item.fontSize,
            fontName: item.fontName,
          });
          // Update line y to average
          currentLine.y = (currentLine.y + itemCenterY) / 2;
        } else {
          // Start a new line
          lines.push(currentLine);
          currentLine = {
            y: itemCenterY,
            items: [{
              text: item.text,
              x0: item.x0,
              x1: item.x1,
              y0: item.y0,
              y1: item.y1,
              fontSize: item.fontSize,
              fontName: item.fontName,
            }],
          };
        }
      }
    }

    // Don't forget the last line
    if (currentLine) {
      lines.push(currentLine);
    }

    // Sort items within each line by x position
    for (const line of lines) {
      line.items.sort((a, b) => a.x0 - b.x0);
    }

    return lines;
  }

  /**
   * Analyze page layout to detect multi-column structure
   * 
   * Implements Requirement 5.2: Multi-column layout detection
   * 
   * @param lines - Text lines on the page
   * @param pageWidth - Page width
   * @param pageHeight - Page height
   * @param pageNumber - Page number
   * @returns Layout analysis result with column regions and reading order
   */
  private analyzeLayout(
    lines: TextLine[], 
    pageWidth: number, 
    pageHeight: number,
    pageNumber: number
  ): LayoutAnalysisResult {
    if (lines.length === 0) {
      return {
        columns: [],
        readingOrder: [],
        isMultiColumn: false,
      };
    }

    // Collect all x-coordinates to find gaps
    const xCoordinates: Array<{ x: number; type: 'start' | 'end' }> = [];
    
    for (const line of lines) {
      for (const item of line.items) {
        xCoordinates.push({ x: item.x0, type: 'start' });
        xCoordinates.push({ x: item.x1, type: 'end' });
      }
    }

    // Sort by x position
    xCoordinates.sort((a, b) => a.x - b.x);

    // Find significant gaps that might indicate column boundaries
    const minGap = pageWidth * LAYOUT_DETECTION_CONFIG.minColumnGapPercent;
    const minColumnWidth = pageWidth * LAYOUT_DETECTION_CONFIG.minColumnWidthPercent;
    
    const gaps: Array<{ start: number; end: number }> = [];
    let depth = 0;
    let gapStart: number | null = null;

    for (const coord of xCoordinates) {
      if (coord.type === 'start') {
        if (depth === 0 && gapStart !== null) {
          const gapWidth = coord.x - gapStart;
          if (gapWidth >= minGap) {
            gaps.push({ start: gapStart, end: coord.x });
          }
        }
        depth++;
      } else {
        depth--;
        if (depth === 0) {
          gapStart = coord.x;
        }
      }
    }

    // Determine column boundaries from gaps
    const columnBoundaries: number[] = [0];
    for (const gap of gaps) {
      const gapCenter = (gap.start + gap.end) / 2;
      columnBoundaries.push(gapCenter);
    }
    columnBoundaries.push(pageWidth);

    // Filter out columns that are too narrow
    const validColumns: ColumnRegion[] = [];
    for (let i = 0; i < columnBoundaries.length - 1; i++) {
      const x0 = columnBoundaries[i];
      const x1 = columnBoundaries[i + 1];
      const width = x1 - x0;
      
      if (width >= minColumnWidth) {
        validColumns.push({
          bbox: {
            x0,
            y0: 0,
            x1,
            y1: pageHeight,
            pageNumber,
          },
          blockIds: [],
        });
      }
    }

    // Limit to maximum columns
    const columns = validColumns.slice(0, LAYOUT_DETECTION_CONFIG.maxColumns);
    
    // If only one column or no significant gaps, treat as single column
    const isMultiColumn = columns.length > 1;

    // Generate reading order (column by column, top to bottom)
    const readingOrder: string[] = [];
    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      readingOrder.push(`column_${colIdx}`);
    }

    return {
      columns: columns.length > 0 ? columns : [{
        bbox: { x0: 0, y0: 0, x1: pageWidth, y1: pageHeight, pageNumber },
        blockIds: [],
      }],
      readingOrder,
      isMultiColumn,
    };
  }

  /**
   * Determine which column a line belongs to
   * 
   * @param line - Text line
   * @param columns - Column regions
   * @returns Column index
   */
  private getColumnIndex(line: TextLine, columns: ColumnRegion[]): number {
    if (columns.length <= 1) {
      return 0;
    }

    // Calculate line center x
    const lineMinX = Math.min(...line.items.map(i => i.x0));
    const lineMaxX = Math.max(...line.items.map(i => i.x1));
    const lineCenterX = (lineMinX + lineMaxX) / 2;

    // Find the column that contains the line center
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (lineCenterX >= col.bbox.x0 && lineCenterX <= col.bbox.x1) {
        return i;
      }
    }

    // Default to first column if not found
    return 0;
  }

  /**
   * Group lines into paragraphs within columns
   * 
   * @param lines - Text lines
   * @param layout - Layout analysis result
   * @param viewport - Page viewport
   * @returns Array of text paragraphs
   */
  private groupLinesIntoParagraphs(
    lines: TextLine[],
    layout: LayoutAnalysisResult,
    viewport: any
  ): TextParagraph[] {
    if (lines.length === 0) {
      return [];
    }

    // Assign lines to columns
    const linesByColumn: Map<number, TextLine[]> = new Map();
    
    for (const line of lines) {
      const colIdx = this.getColumnIndex(line, layout.columns);
      if (!linesByColumn.has(colIdx)) {
        linesByColumn.set(colIdx, []);
      }
      linesByColumn.get(colIdx)!.push(line);
    }

    const paragraphs: TextParagraph[] = [];

    // Process each column
    for (const [colIdx, columnLines] of linesByColumn) {
      // Sort lines by y position within column
      columnLines.sort((a, b) => a.y - b.y);

      let currentParagraph: TextParagraph | null = null;
      let prevLineBottom = 0;

      for (const line of columnLines) {
        // Calculate line bounding box
        const lineMinX = Math.min(...line.items.map(i => i.x0));
        const lineMaxX = Math.max(...line.items.map(i => i.x1));
        const lineMinY = Math.min(...line.items.map(i => i.y0));
        const lineMaxY = Math.max(...line.items.map(i => i.y1));
        const lineHeight = lineMaxY - lineMinY;
        const avgFontSize = line.items.reduce((sum, i) => sum + i.fontSize, 0) / line.items.length;

        // Determine if this is a new paragraph
        const verticalGap = lineMinY - prevLineBottom;
        const isNewParagraph = !currentParagraph || 
          verticalGap > lineHeight * 1.5 || // Large gap
          verticalGap > avgFontSize * 2; // Gap larger than 2x font size

        if (isNewParagraph) {
          // Save current paragraph
          if (currentParagraph) {
            paragraphs.push(currentParagraph);
          }

          // Start new paragraph
          currentParagraph = {
            lines: [line],
            bbox: {
              x0: lineMinX,
              y0: lineMinY,
              x1: lineMaxX,
              y1: lineMaxY,
            },
            fontSize: avgFontSize,
            fontName: line.items[0]?.fontName,
            isHeading: false, // Will be determined later
            columnIndex: colIdx,
          };
        } else {
          // Add to current paragraph
          currentParagraph!.lines.push(line);
          currentParagraph!.bbox.x0 = Math.min(currentParagraph!.bbox.x0, lineMinX);
          currentParagraph!.bbox.y0 = Math.min(currentParagraph!.bbox.y0, lineMinY);
          currentParagraph!.bbox.x1 = Math.max(currentParagraph!.bbox.x1, lineMaxX);
          currentParagraph!.bbox.y1 = Math.max(currentParagraph!.bbox.y1, lineMaxY);
          // Update average font size
          const totalItems = currentParagraph!.lines.reduce((sum, l) => sum + l.items.length, 0);
          const totalFontSize = currentParagraph!.lines.reduce(
            (sum, l) => sum + l.items.reduce((s, i) => s + i.fontSize, 0), 
            0
          );
          currentParagraph!.fontSize = totalFontSize / totalItems;
        }

        prevLineBottom = lineMaxY;
      }

      // Don't forget the last paragraph
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
      }
    }

    return paragraphs;
  }

  /**
   * Calculate median font size from text items
   * Used for heading detection
   * 
   * @param items - Normalized text items
   * @returns Median font size
   */
  private calculateMedianFontSize(
    items: Array<{ fontSize: number }>
  ): number {
    if (items.length === 0) {
      return 12; // Default font size
    }

    const fontSizes = items.map(i => i.fontSize).sort((a, b) => a - b);
    const mid = Math.floor(fontSizes.length / 2);
    
    if (fontSizes.length % 2 === 0) {
      return (fontSizes[mid - 1] + fontSizes[mid]) / 2;
    }
    return fontSizes[mid];
  }

  /**
   * Convert paragraphs to TextBlock objects with proper reading order
   * 
   * Implements Requirement 5.3: Section header detection using font heuristics
   * 
   * @param paragraphs - Text paragraphs
   * @param pageNumber - Page number
   * @param medianFontSize - Median font size for heading detection
   * @param readingOrder - Column reading order
   * @returns Array of TextBlock objects
   */
  private convertParagraphsToBlocks(
    paragraphs: TextParagraph[],
    pageNumber: number,
    medianFontSize: number,
    readingOrder: string[]
  ): TextBlock[] {
    const blocks: TextBlock[] = [];
    let blockIndex = 0;

    // Sort paragraphs by reading order (column first, then y position)
    const sortedParagraphs = [...paragraphs].sort((a, b) => {
      // First by column index
      if (a.columnIndex !== b.columnIndex) {
        return a.columnIndex - b.columnIndex;
      }
      // Then by y position
      return a.bbox.y0 - b.bbox.y0;
    });

    for (const paragraph of sortedParagraphs) {
      // Combine text from all lines in the paragraph
      const text = paragraph.lines
        .map(line => {
          // Combine items within line, adding spaces between items with gaps
          let lineText = '';
          let prevX1 = 0;
          
          for (const item of line.items) {
            if (lineText.length > 0) {
              const gap = item.x0 - prevX1;
              if (gap > LAYOUT_DETECTION_CONFIG.wordGapThreshold) {
                lineText += ' ';
              }
            }
            lineText += item.text;
            prevX1 = item.x1;
          }
          
          return lineText;
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length === 0) {
        continue;
      }

      // Determine block type based on font size heuristics
      // Headings are typically larger than body text
      const isHeading = paragraph.fontSize >= medianFontSize * 1.2 || 
        paragraph.fontSize >= DEFAULT_EXTRACTION_OPTIONS.headingFontSizeThreshold;
      
      // Additional heading heuristics:
      // - Short text (likely a title)
      // - Single line
      // - Significantly larger font
      const isLikelyHeading = isHeading || (
        paragraph.lines.length === 1 && 
        text.length < 100 &&
        paragraph.fontSize > medianFontSize
      );

      // Determine block type
      let blockType: 'paragraph' | 'heading' | 'list' | 'caption' = 'paragraph';
      
      if (isLikelyHeading) {
        blockType = 'heading';
      } else if (text.match(/^[\s]*[-•●○◦▪▸►]\s/)) {
        // Detect list items
        blockType = 'list';
      } else if (text.match(/^(Figure|Fig\.|Table|Chart|Diagram)\s*\d/i)) {
        // Detect captions
        blockType = 'caption';
      }

      // Create bounding box with validated coordinates
      const bbox: BoundingBox = {
        x0: Math.max(0, paragraph.bbox.x0),
        y0: Math.max(0, paragraph.bbox.y0),
        x1: Math.max(paragraph.bbox.x0 + 0.1, paragraph.bbox.x1),
        y1: Math.max(paragraph.bbox.y0 + 0.1, paragraph.bbox.y1),
        pageNumber,
      };

      const block: TextBlock = {
        id: `block_${pageNumber}_${blockIndex++}`,
        text,
        bbox,
        blockType,
        fontSize: paragraph.fontSize,
        fontName: paragraph.fontName,
      };

      blocks.push(block);
    }

    return blocks;
  }

  /**
   * Extract all text from a document
   * 
   * Implements Requirements 5.1, 5.2, 5.3:
   * - Text extraction with bounding box coordinates
   * - Multi-column layout detection for correct reading order
   * - Section header detection using font heuristics
   * 
   * @param docId - Document ID
   * @param options - Optional extraction options
   * @returns Promise resolving to array of TextBlock
   */
  async extractAllText(docId: string, options?: Partial<TextExtractionOptions>): Promise<TextBlock[]> {
    const loaded = this.loadedDocuments.get(docId);
    if (!loaded) {
      throw new Error(`Document not loaded: ${docId}`);
    }

    const extractionOptions = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
    const allBlocks: TextBlock[] = [];

    // Extract text from each page
    for (let pageNum = 1; pageNum <= loaded.document.pageCount; pageNum++) {
      try {
        const page = await this.getPage(docId, pageNum);
        allBlocks.push(...page.textContent);
      } catch (error) {
        // Log error but continue with other pages (Requirement 5.6)
        console.warn(`Failed to extract text from page ${pageNum}:`, error);
      }
    }

    return allBlocks;
  }

  /**
   * Analyze the layout of a specific page
   * 
   * Returns information about column structure and reading order.
   * Useful for understanding document structure before chunking.
   * 
   * @param docId - Document ID
   * @param pageNum - Page number (1-indexed)
   * @returns Promise resolving to LayoutAnalysisResult
   */
  async analyzePageLayout(docId: string, pageNum: number): Promise<LayoutAnalysisResult> {
    const loaded = this.loadedDocuments.get(docId);
    if (!loaded) {
      throw new Error(`Document not loaded: ${docId}`);
    }

    // Validate page number
    if (pageNum < 1 || pageNum > loaded.document.pageCount) {
      throw new Error(`Invalid page number: ${pageNum}. Document has ${loaded.document.pageCount} pages.`);
    }

    // Load page from pdf.js
    const pdfPage = await loaded.pdfDocument.getPage(pageNum);
    const viewport = pdfPage.getViewport({ scale: 1.0 });

    // Extract text content
    const textContent = await pdfPage.getTextContent();
    const items: PDFTextItem[] = textContent.items || [];

    if (items.length === 0) {
      return {
        columns: [{
          bbox: { x0: 0, y0: 0, x1: viewport.width, y1: viewport.height, pageNumber: pageNum },
          blockIds: [],
        }],
        readingOrder: ['column_0'],
        isMultiColumn: false,
      };
    }

    // Normalize items and group into lines
    const normalizedItems = this.normalizeTextItems(items, pageNum, viewport);
    const lines = this.groupItemsIntoLines(normalizedItems);

    // Analyze layout
    return this.analyzeLayout(lines, viewport.width, viewport.height, pageNum);
  }

  /**
   * Get section headers from a document
   * 
   * Extracts text blocks identified as headings based on font size heuristics.
   * Useful for building document outlines and section-aware chunking.
   * 
   * @param docId - Document ID
   * @returns Promise resolving to array of heading TextBlocks
   */
  async getSectionHeaders(docId: string): Promise<TextBlock[]> {
    const allBlocks = await this.extractAllText(docId);
    return allBlocks.filter(block => block.blockType === 'heading');
  }

  /**
   * Search for text within a document
   * 
   * @param docId - Document ID
   * @param query - Search query
   * @returns Promise resolving to array of TextSearchResult
   */
  async searchText(docId: string, query: string): Promise<TextSearchResult[]> {
    const loaded = this.loadedDocuments.get(docId);
    if (!loaded) {
      throw new Error(`Document not loaded: ${docId}`);
    }

    const results: TextSearchResult[] = [];
    const queryLower = query.toLowerCase();
    let matchIndex = 0;

    // Search through all pages
    for (let pageNum = 1; pageNum <= loaded.document.pageCount; pageNum++) {
      try {
        const page = await this.getPage(docId, pageNum);
        
        for (const block of page.textContent) {
          const textLower = block.text.toLowerCase();
          let searchIndex = 0;
          
          while ((searchIndex = textLower.indexOf(queryLower, searchIndex)) !== -1) {
            results.push({
              text: block.text.substring(searchIndex, searchIndex + query.length),
              pageNumber: pageNum,
              bbox: block.bbox,
              context: block.text,
              matchIndex: matchIndex++,
            });
            searchIndex += query.length;
          }
        }
      } catch (error) {
        // Continue searching other pages on error
        console.warn(`Failed to search page ${pageNum}:`, error);
      }
    }

    return results;
  }

  /**
   * Get document outline (table of contents)
   * 
   * @param docId - Document ID
   * @returns Promise resolving to array of OutlineItem
   */
  async getDocumentOutline(docId: string): Promise<OutlineItem[]> {
    const loaded = this.loadedDocuments.get(docId);
    if (!loaded) {
      throw new Error(`Document not loaded: ${docId}`);
    }

    try {
      const outline = await loaded.pdfDocument.getOutline();
      if (!outline) {
        return [];
      }

      // Convert pdf.js outline to our format
      const convertOutline = async (items: any[], level: number): Promise<OutlineItem[]> => {
        const result: OutlineItem[] = [];
        
        for (const item of items) {
          let pageNumber = 1;
          
          // Get destination page number
          if (item.dest) {
            try {
              const dest = typeof item.dest === 'string' 
                ? await loaded.pdfDocument.getDestination(item.dest)
                : item.dest;
              
              if (dest && dest[0]) {
                const pageRef = dest[0];
                const pageIndex = await loaded.pdfDocument.getPageIndex(pageRef);
                pageNumber = pageIndex + 1;
              }
            } catch {
              // Use default page 1 if destination resolution fails
            }
          }

          const outlineItem: OutlineItem = {
            title: item.title || 'Untitled',
            pageNumber,
            level,
            children: item.items ? await convertOutline(item.items, level + 1) : [],
          };
          
          result.push(outlineItem);
        }
        
        return result;
      };

      return await convertOutline(outline, 0);
    } catch (error) {
      console.warn('Failed to get document outline:', error);
      return [];
    }
  }

  /**
   * Get major sections from the document outline
   * 
   * Identifies top-level sections from the PDF outline/table of contents
   * and calculates their page ranges for section-aware summarization.
   * 
   * Implements Requirement 12.2: Extract document outline/table of contents
   * 
   * @param docId - Document ID
   * @returns Promise resolving to array of MajorSection
   */
  async getMajorSections(docId: string): Promise<import('../../src/types/pdf').MajorSection[]> {
    const loaded = this.loadedDocuments.get(docId);
    if (!loaded) {
      throw new Error(`Document not loaded: ${docId}`);
    }

    // Get the document outline first
    const outline = await this.getDocumentOutline(docId);
    
    if (outline.length === 0) {
      // If no outline, try to identify sections from headings
      return this.identifySectionsFromHeadings(docId);
    }

    // Convert outline to major sections with page ranges
    const totalPages = loaded.document.pageCount;
    return this.convertOutlineToMajorSections(outline, totalPages);
  }

  /**
   * Convert outline items to major sections with calculated page ranges
   * 
   * @param outline - Document outline items
   * @param totalPages - Total number of pages in the document
   * @returns Array of MajorSection with page ranges
   */
  private convertOutlineToMajorSections(
    outline: OutlineItem[],
    totalPages: number
  ): import('../../src/types/pdf').MajorSection[] {
    const sections: import('../../src/types/pdf').MajorSection[] = [];
    
    // Flatten outline to get all page numbers for range calculation
    const allPageNumbers = this.flattenOutlinePageNumbers(outline);
    
    for (let i = 0; i < outline.length; i++) {
      const item = outline[i];
      const startPage = item.pageNumber;
      
      // Calculate end page: next sibling's start page or total pages
      let endPage: number;
      if (i < outline.length - 1) {
        endPage = outline[i + 1].pageNumber;
      } else {
        endPage = totalPages + 1; // Exclusive end
      }
      
      // Convert children to subsections
      const subsections = item.children.length > 0
        ? this.convertOutlineToMajorSections(item.children, endPage - 1)
        : [];
      
      sections.push({
        title: item.title,
        startPage,
        endPage,
        level: item.level,
        subsections,
        isTopLevel: item.level === 0,
      });
    }
    
    return sections;
  }

  /**
   * Flatten outline to get all page numbers
   */
  private flattenOutlinePageNumbers(outline: OutlineItem[]): number[] {
    const pages: number[] = [];
    
    const flatten = (items: OutlineItem[]) => {
      for (const item of items) {
        pages.push(item.pageNumber);
        if (item.children.length > 0) {
          flatten(item.children);
        }
      }
    };
    
    flatten(outline);
    return pages.sort((a, b) => a - b);
  }

  /**
   * Identify sections from headings when no outline is available
   * 
   * Falls back to using font-size heuristics to identify section headers
   * when the PDF doesn't have a built-in outline/table of contents.
   * 
   * @param docId - Document ID
   * @returns Array of MajorSection identified from headings
   */
  private async identifySectionsFromHeadings(
    docId: string
  ): Promise<import('../../src/types/pdf').MajorSection[]> {
    const loaded = this.loadedDocuments.get(docId);
    if (!loaded) {
      return [];
    }

    try {
      // Get all section headers from the document
      const headers = await this.getSectionHeaders(docId);
      
      if (headers.length === 0) {
        return [];
      }

      // Group headers by font size to determine hierarchy
      const fontSizes = headers.map(h => h.fontSize || 12);
      const uniqueFontSizes = [...new Set(fontSizes)].sort((a, b) => b - a);
      
      // Top 2 largest font sizes are considered major sections
      const majorFontSizes = uniqueFontSizes.slice(0, 2);
      
      const sections: import('../../src/types/pdf').MajorSection[] = [];
      const totalPages = loaded.document.pageCount;
      
      // Filter to major headers only
      const majorHeaders = headers.filter(h => 
        majorFontSizes.includes(h.fontSize || 12)
      );
      
      for (let i = 0; i < majorHeaders.length; i++) {
        const header = majorHeaders[i];
        const startPage = header.bbox.pageNumber;
        
        // Calculate end page
        let endPage: number;
        if (i < majorHeaders.length - 1) {
          endPage = majorHeaders[i + 1].bbox.pageNumber;
        } else {
          endPage = totalPages + 1;
        }
        
        // Determine level based on font size
        const level = majorFontSizes.indexOf(header.fontSize || 12);
        
        sections.push({
          title: header.text.trim(),
          startPage,
          endPage,
          level,
          subsections: [],
          isTopLevel: level === 0,
        });
      }
      
      return sections;
    } catch (error) {
      console.warn('Failed to identify sections from headings:', error);
      return [];
    }
  }

  /**
   * Extract tables from text blocks using heuristic detection
   * 
   * Implements Requirement 5.4: Extract tables with row and column structure preserved
   * 
   * Tables are detected by looking for:
   * - Grid-like alignment of text blocks
   * - Consistent column spacing
   * - Multiple rows with similar structure
   * 
   * @param textBlocks - Text blocks from the page
   * @param pageNumber - Page number
   * @param viewport - Page viewport
   * @returns Array of TableBlock objects
   */
  private extractTables(
    textBlocks: TextBlock[],
    pageNumber: number,
    viewport: any
  ): TableBlock[] {
    const tables: TableBlock[] = [];
    
    // Group text blocks by approximate y-position (rows)
    const rowGroups = this.groupBlocksByRows(textBlocks);
    
    // Look for sequences of rows with consistent column structure
    let tableStartIdx = -1;
    let currentTableRows: TextBlock[][] = [];
    let tableId = 0;
    
    for (let i = 0; i < rowGroups.length; i++) {
      const row = rowGroups[i];
      
      // A row is potentially part of a table if it has multiple blocks
      // with consistent horizontal spacing
      if (row.length >= 2 && this.isTableRow(row)) {
        if (tableStartIdx === -1) {
          tableStartIdx = i;
        }
        currentTableRows.push(row);
      } else {
        // End of potential table
        if (currentTableRows.length >= 2) {
          // We have at least 2 rows - this could be a table
          const table = this.buildTableFromRows(
            currentTableRows,
            pageNumber,
            tableId++
          );
          if (table) {
            tables.push(table);
          }
        }
        tableStartIdx = -1;
        currentTableRows = [];
      }
    }
    
    // Check for table at end of page
    if (currentTableRows.length >= 2) {
      const table = this.buildTableFromRows(
        currentTableRows,
        pageNumber,
        tableId++
      );
      if (table) {
        tables.push(table);
      }
    }
    
    // Look for table captions
    this.associateTableCaptions(tables, textBlocks);
    
    return tables;
  }

  /**
   * Group text blocks into rows based on vertical position
   */
  private groupBlocksByRows(textBlocks: TextBlock[]): TextBlock[][] {
    if (textBlocks.length === 0) return [];
    
    // Sort by y position
    const sorted = [...textBlocks].sort((a, b) => a.bbox.y0 - b.bbox.y0);
    
    const rows: TextBlock[][] = [];
    let currentRow: TextBlock[] = [sorted[0]];
    let currentY = sorted[0].bbox.y0;
    
    for (let i = 1; i < sorted.length; i++) {
      const block = sorted[i];
      const blockHeight = block.bbox.y1 - block.bbox.y0;
      const tolerance = blockHeight * 0.5;
      
      if (Math.abs(block.bbox.y0 - currentY) <= tolerance) {
        // Same row
        currentRow.push(block);
      } else {
        // New row
        // Sort current row by x position
        currentRow.sort((a, b) => a.bbox.x0 - b.bbox.x0);
        rows.push(currentRow);
        currentRow = [block];
        currentY = block.bbox.y0;
      }
    }
    
    // Don't forget last row
    if (currentRow.length > 0) {
      currentRow.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      rows.push(currentRow);
    }
    
    return rows;
  }

  /**
   * Check if a row of blocks looks like a table row
   * (consistent spacing, aligned columns)
   */
  private isTableRow(blocks: TextBlock[]): boolean {
    if (blocks.length < 2) return false;
    
    // Check for consistent gaps between blocks
    const gaps: number[] = [];
    for (let i = 1; i < blocks.length; i++) {
      const gap = blocks[i].bbox.x0 - blocks[i - 1].bbox.x1;
      gaps.push(gap);
    }
    
    // If gaps are relatively consistent, it's likely a table row
    if (gaps.length === 0) return false;
    
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const minGap = 10; // Minimum gap to consider as table column separator
    
    // All gaps should be positive and reasonably consistent
    return avgGap >= minGap && gaps.every(g => g >= minGap * 0.3);
  }

  /**
   * Build a TableBlock from detected rows
   */
  private buildTableFromRows(
    rows: TextBlock[][],
    pageNumber: number,
    tableId: number
  ): TableBlock | null {
    if (rows.length < 2) return null;
    
    // Determine column boundaries from all rows
    const columnBoundaries = this.detectColumnBoundaries(rows);
    if (columnBoundaries.length < 2) return null;
    
    // Build table rows
    const tableRows: import('../../src/types/pdf').TableRow[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const row of rows) {
      const cells: import('../../src/types/pdf').TableCell[] = [];
      
      // Assign blocks to columns
      for (let colIdx = 0; colIdx < columnBoundaries.length - 1; colIdx++) {
        const colStart = columnBoundaries[colIdx];
        const colEnd = columnBoundaries[colIdx + 1];
        
        // Find blocks that fall within this column
        const cellBlocks = row.filter(block => {
          const blockCenter = (block.bbox.x0 + block.bbox.x1) / 2;
          return blockCenter >= colStart && blockCenter < colEnd;
        });
        
        // Combine text from blocks in this cell
        const cellText = cellBlocks.map(b => b.text).join(' ').trim();
        
        // Calculate cell bounding box
        let cellBbox: BoundingBox;
        if (cellBlocks.length > 0) {
          cellBbox = {
            x0: Math.min(...cellBlocks.map(b => b.bbox.x0)),
            y0: Math.min(...cellBlocks.map(b => b.bbox.y0)),
            x1: Math.max(...cellBlocks.map(b => b.bbox.x1)),
            y1: Math.max(...cellBlocks.map(b => b.bbox.y1)),
            pageNumber,
          };
        } else {
          // Empty cell - use column boundaries
          const rowBlocks = row.length > 0 ? row : rows[0];
          cellBbox = {
            x0: colStart,
            y0: Math.min(...rowBlocks.map(b => b.bbox.y0)),
            x1: colEnd,
            y1: Math.max(...rowBlocks.map(b => b.bbox.y1)),
            pageNumber,
          };
        }
        
        cells.push({
          text: cellText,
          bbox: cellBbox,
        });
        
        // Update table bounds
        minX = Math.min(minX, cellBbox.x0);
        minY = Math.min(minY, cellBbox.y0);
        maxX = Math.max(maxX, cellBbox.x1);
        maxY = Math.max(maxY, cellBbox.y1);
      }
      
      tableRows.push({ cells });
    }
    
    return {
      id: `table_${pageNumber}_${tableId}`,
      bbox: {
        x0: minX,
        y0: minY,
        x1: maxX,
        y1: maxY,
        pageNumber,
      },
      rows: tableRows,
    };
  }

  /**
   * Detect column boundaries from table rows
   */
  private detectColumnBoundaries(rows: TextBlock[][]): number[] {
    // Collect all x-coordinates from all blocks
    const xCoords: number[] = [];
    
    for (const row of rows) {
      for (const block of row) {
        xCoords.push(block.bbox.x0);
        xCoords.push(block.bbox.x1);
      }
    }
    
    if (xCoords.length === 0) return [];
    
    // Find clusters of x-coordinates (column boundaries)
    xCoords.sort((a, b) => a - b);
    
    const boundaries: number[] = [xCoords[0]];
    const clusterThreshold = 20; // Points within this distance are same boundary
    
    for (let i = 1; i < xCoords.length; i++) {
      const lastBoundary = boundaries[boundaries.length - 1];
      if (xCoords[i] - lastBoundary > clusterThreshold) {
        // New boundary - use midpoint between last and current
        boundaries.push((lastBoundary + xCoords[i]) / 2);
      }
    }
    
    // Add final boundary
    boundaries.push(xCoords[xCoords.length - 1] + 10);
    
    return boundaries;
  }

  /**
   * Associate table captions with tables
   */
  private associateTableCaptions(tables: TableBlock[], textBlocks: TextBlock[]): void {
    // Look for caption blocks near tables
    const captionBlocks = textBlocks.filter(b => b.blockType === 'caption');
    
    for (const table of tables) {
      // Find caption above or below the table
      for (const caption of captionBlocks) {
        const captionText = caption.text.toLowerCase();
        
        // Check if it's a table caption
        if (captionText.startsWith('table') || captionText.match(/^tab\.\s*\d/i)) {
          // Check if caption is near the table (above or below)
          const verticalDistance = Math.min(
            Math.abs(caption.bbox.y1 - table.bbox.y0), // Caption above
            Math.abs(caption.bbox.y0 - table.bbox.y1)  // Caption below
          );
          
          // Check horizontal overlap
          const horizontalOverlap = 
            caption.bbox.x0 < table.bbox.x1 && caption.bbox.x1 > table.bbox.x0;
          
          if (verticalDistance < 50 && horizontalOverlap) {
            table.caption = caption.text;
            break;
          }
        }
      }
    }
  }

  /**
   * Extract images/figures from a PDF page
   * 
   * Implements Requirement 5.5: Extract figure captions and associate with bounding boxes
   * 
   * @param pdfPage - pdf.js page object
   * @param pageNumber - Page number
   * @param viewport - Page viewport
   * @param textBlocks - Text blocks for caption association
   * @returns Array of ImageBlock objects
   */
  private async extractImages(
    pdfPage: PDFPageProxy,
    pageNumber: number,
    viewport: any,
    textBlocks: TextBlock[]
  ): Promise<ImageBlock[]> {
    const images: ImageBlock[] = [];
    
    try {
      // Get operator list to find image operations
      const operatorList = await pdfPage.getOperatorList();
      const OPS = this.pdfjs.OPS;
      
      let imageId = 0;
      
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const fn = operatorList.fnArray[i];
        
        // Check for image painting operations
        if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
          const args = operatorList.argsArray[i];
          
          // Try to get image info
          try {
            // Get the current transformation matrix to determine position
            // This is a simplified approach - actual position calculation is complex
            const imageBbox: BoundingBox = {
              x0: 0,
              y0: 0,
              x1: viewport.width,
              y1: viewport.height,
              pageNumber,
            };
            
            // Try to get more accurate bounds from the image object
            if (args && args[0]) {
              const imgName = args[0];
              try {
                const img = await pdfPage.objs.get(imgName);
                if (img && img.width && img.height) {
                  // Use image dimensions as a hint
                  // Note: Actual positioning requires matrix transformation
                  imageBbox.x1 = Math.min(img.width, viewport.width);
                  imageBbox.y1 = Math.min(img.height, viewport.height);
                }
              } catch {
                // Ignore errors getting image object
              }
            }
            
            const imageBlock: ImageBlock = {
              id: `image_${pageNumber}_${imageId++}`,
              bbox: imageBbox,
            };
            
            images.push(imageBlock);
          } catch {
            // Skip images that can't be processed
          }
        }
      }
      
      // Associate figure captions with images
      this.associateFigureCaptions(images, textBlocks);
      
    } catch (error) {
      // Log error but continue - image extraction is optional
      console.warn(`Failed to extract images from page ${pageNumber}:`, error);
    }
    
    return images;
  }

  /**
   * Associate figure captions with images
   */
  private associateFigureCaptions(images: ImageBlock[], textBlocks: TextBlock[]): void {
    // Look for caption blocks
    const captionBlocks = textBlocks.filter(b => b.blockType === 'caption');
    
    for (const image of images) {
      // Find figure caption near the image
      for (const caption of captionBlocks) {
        const captionText = caption.text.toLowerCase();
        
        // Check if it's a figure caption
        if (captionText.startsWith('figure') || 
            captionText.startsWith('fig.') || 
            captionText.match(/^fig\s*\d/i)) {
          // Check if caption is near the image (typically below)
          const verticalDistance = Math.abs(caption.bbox.y0 - image.bbox.y1);
          
          // Check horizontal overlap
          const horizontalOverlap = 
            caption.bbox.x0 < image.bbox.x1 && caption.bbox.x1 > image.bbox.x0;
          
          if (verticalDistance < 100 && horizontalOverlap) {
            image.caption = caption.text;
            break;
          }
        }
      }
    }
  }

  /**
   * Unload a document from memory
   * 
   * @param docId - Document ID
   */
  unloadDocument(docId: string): void {
    const loaded = this.loadedDocuments.get(docId);
    if (loaded) {
      // Destroy pdf.js document to free resources
      if (loaded.pdfDocument && typeof loaded.pdfDocument.destroy === 'function') {
        loaded.pdfDocument.destroy();
      }
      this.loadedDocuments.delete(docId);
    }
  }

  /**
   * Check if a document is loaded
   * 
   * @param docId - Document ID
   * @returns True if document is loaded
   */
  isDocumentLoaded(docId: string): boolean {
    return this.loadedDocuments.has(docId);
  }

  /**
   * Get a loaded document by ID
   * 
   * @param docId - Document ID
   * @returns LoadedPDF or undefined
   */
  getLoadedDocument(docId: string): LoadedPDF | undefined {
    return this.loadedDocuments.get(docId);
  }

  /**
   * Get document by file hash (for cache validation)
   * 
   * @param fileHash - SHA-256 hash of the file
   * @returns PDFDocument or undefined
   */
  getDocumentByHash(fileHash: string): PDFDocument | undefined {
    for (const loaded of this.loadedDocuments.values()) {
      if (loaded.document.fileHash === fileHash) {
        return loaded.document;
      }
    }
    return undefined;
  }

  /**
   * Get all loaded documents
   * 
   * @returns Array of PDFDocument
   */
  getAllLoadedDocuments(): PDFDocument[] {
    return Array.from(this.loadedDocuments.values()).map(l => l.document);
  }

  /**
   * Clear all loaded documents from memory
   */
  clearAll(): void {
    for (const docId of this.loadedDocuments.keys()) {
      this.unloadDocument(docId);
    }
  }
}

// Export singleton instance
export const pdfParserService = new PDFParserService();
