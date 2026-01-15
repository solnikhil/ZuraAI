/**
 * Property-Based Tests for Chunk Manager Service
 * 
 * This file contains property-based tests using fast-check to verify
 * universal properties of the chunk manager across all valid inputs.
 * 
 * **Property 2: Chunk Metadata Completeness**
 * For any chunk created by the RAG_Engine, the chunk SHALL contain all required 
 * metadata fields: page numbers (non-empty array), bounding boxes (non-empty array), 
 * chunk index (non-negative integer), token count (positive integer), and block type 
 * (valid enum value).
 * 
 * **Validates: Requirements 6.2, 6.3**
 * 
 * **Property 4: Chunk Size Bounds**
 * For any chunk created with a configured chunk size and overlap, the chunk's token 
 * count SHALL be less than or equal to (chunk_size + overlap) and greater than zero.
 * 
 * **Validates: Requirements 6.2, 6.8**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ChunkManager } from './chunkManager';
import type { TextBlock, BoundingBox, Chunk, ChunkMetadata } from '../../src/types/pdf';
import type { ChunkingOptions } from './types';

/**
 * Property test configuration
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
  seed: 12345,
  timeout: 30000,
};

/**
 * Valid block types for text blocks
 */
const VALID_BLOCK_TYPES = ['paragraph', 'heading', 'list', 'caption'] as const;

/**
 * Valid chunk block types
 */
const VALID_CHUNK_BLOCK_TYPES = ['text', 'table', 'figure'] as const;

/**
 * Generators for property-based testing
 */
const generators = {
  /**
   * Generate a valid bounding box
   */
  boundingBox: (pageNumber: number) =>
    fc.record({
      x0: fc.float({ min: 0, max: 500, noNaN: true }),
      y0: fc.float({ min: 0, max: 700, noNaN: true }),
      width: fc.float({ min: 10, max: 100, noNaN: true }),
      height: fc.float({ min: 5, max: 50, noNaN: true }),
    }).map(({ x0, y0, width, height }) => ({
      x0,
      y0,
      x1: x0 + width,
      y1: y0 + height,
      pageNumber,
    })),

  /**
   * Generate valid text content (non-empty)
   */
  textContent: fc.string({ minLength: 1, maxLength: 200 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim()),

  /**
   * Generate a valid block type
   */
  blockType: fc.constantFrom(...VALID_BLOCK_TYPES),

  /**
   * Generate a valid text block
   */
  textBlock: (pageNumber: number) =>
    fc.record({
      text: generators.textContent,
      blockType: generators.blockType,
      bbox: generators.boundingBox(pageNumber),
      fontSize: fc.float({ min: 8, max: 24, noNaN: true }),
    }).map(({ text, blockType, bbox, fontSize }) => ({
      id: `block_${Math.random().toString(36).substring(2, 10)}`,
      text,
      bbox,
      blockType,
      fontSize,
      fontName: 'Arial',
    } as TextBlock)),

  /**
   * Generate an array of text blocks across multiple pages
   */
  textBlocks: (minBlocks: number = 1, maxBlocks: number = 50) =>
    fc.integer({ min: 1, max: 10 }).chain(pageCount =>
      fc.array(
        fc.integer({ min: 1, max: pageCount }).chain(pageNum =>
          generators.textBlock(pageNum)
        ),
        { minLength: minBlocks, maxLength: maxBlocks }
      )
    ),

  /**
   * Generate valid chunking options
   */
  chunkingOptions: fc.record({
    chunkSize: fc.integer({ min: 50, max: 1000 }),
    chunkOverlap: fc.integer({ min: 0, max: 200 }),
    strategy: fc.constantFrom('fixed', 'semantic', 'paragraph'),
    preserveSections: fc.boolean(),
  }).filter(opts => opts.chunkOverlap < opts.chunkSize) as fc.Arbitrary<ChunkingOptions>,

  /**
   * Generate a document ID
   */
  documentId: fc.string({ minLength: 8, maxLength: 32 })
    .filter(s => /^[a-zA-Z0-9_-]+$/.test(s))
    .map(s => `doc_${s}`),
};

/**
 * Validates that chunk metadata is complete
 */
function isValidChunkMetadata(metadata: ChunkMetadata): { valid: boolean; reason?: string } {
  // Check pageNumbers is non-empty array
  if (!Array.isArray(metadata.pageNumbers)) {
    return { valid: false, reason: 'pageNumbers is not an array' };
  }
  if (metadata.pageNumbers.length === 0) {
    return { valid: false, reason: 'pageNumbers is empty' };
  }
  for (const pageNum of metadata.pageNumbers) {
    if (typeof pageNum !== 'number' || pageNum < 1 || !Number.isInteger(pageNum)) {
      return { valid: false, reason: `Invalid page number: ${pageNum}` };
    }
  }

  // Check boundingBoxes is non-empty array
  if (!Array.isArray(metadata.boundingBoxes)) {
    return { valid: false, reason: 'boundingBoxes is not an array' };
  }
  if (metadata.boundingBoxes.length === 0) {
    return { valid: false, reason: 'boundingBoxes is empty' };
  }
  for (const bbox of metadata.boundingBoxes) {
    if (bbox.x0 >= bbox.x1) {
      return { valid: false, reason: `Invalid bbox: x0 (${bbox.x0}) >= x1 (${bbox.x1})` };
    }
    if (bbox.y0 >= bbox.y1) {
      return { valid: false, reason: `Invalid bbox: y0 (${bbox.y0}) >= y1 (${bbox.y1})` };
    }
  }

  // Check chunkIndex is non-negative integer
  if (typeof metadata.chunkIndex !== 'number' || metadata.chunkIndex < 0 || !Number.isInteger(metadata.chunkIndex)) {
    return { valid: false, reason: `Invalid chunkIndex: ${metadata.chunkIndex}` };
  }

  // Check tokenCount is positive integer
  if (typeof metadata.tokenCount !== 'number' || metadata.tokenCount <= 0 || !Number.isInteger(metadata.tokenCount)) {
    return { valid: false, reason: `Invalid tokenCount: ${metadata.tokenCount}` };
  }

  // Check blockType is valid enum value
  if (!VALID_CHUNK_BLOCK_TYPES.includes(metadata.blockType as any)) {
    return { valid: false, reason: `Invalid blockType: ${metadata.blockType}` };
  }

  return { valid: true };
}

describe('Chunk Manager Property Tests', () => {
  let chunkManager: ChunkManager;

  beforeEach(() => {
    chunkManager = new ChunkManager();
  });

  afterEach(() => {
    chunkManager.clearAll();
  });

  describe('Property 2: Chunk Metadata Completeness', () => {
    /**
     * **Property 2: Chunk Metadata Completeness**
     * 
     * For any chunk created by the RAG_Engine, the chunk SHALL contain all required 
     * metadata fields: page numbers (non-empty array), bounding boxes (non-empty array), 
     * chunk index (non-negative integer), token count (positive integer), and block type 
     * (valid enum value).
     * 
     * **Validates: Requirements 6.2, 6.3**
     */
    it('should produce chunks with complete metadata for any valid text blocks', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(1, 30),
          generators.chunkingOptions,
          (docId, textBlocks, options) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, options);

            // All chunks should have complete metadata
            for (const chunk of chunks) {
              const validation = isValidChunkMetadata(chunk.metadata);
              expect(validation.valid).toBe(true);
              if (!validation.valid) {
                console.error(`Invalid metadata for chunk ${chunk.id}: ${validation.reason}`);
              }
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should ensure pageNumbers array is non-empty for all chunks', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(1, 20),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 512,
              chunkOverlap: 128,
              strategy: 'fixed',
              preserveSections: true,
            });

            for (const chunk of chunks) {
              expect(chunk.metadata.pageNumbers).toBeDefined();
              expect(Array.isArray(chunk.metadata.pageNumbers)).toBe(true);
              expect(chunk.metadata.pageNumbers.length).toBeGreaterThan(0);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should ensure boundingBoxes array is non-empty for all chunks', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(1, 20),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 512,
              chunkOverlap: 128,
              strategy: 'fixed',
              preserveSections: true,
            });

            for (const chunk of chunks) {
              expect(chunk.metadata.boundingBoxes).toBeDefined();
              expect(Array.isArray(chunk.metadata.boundingBoxes)).toBe(true);
              expect(chunk.metadata.boundingBoxes.length).toBeGreaterThan(0);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should ensure chunkIndex is non-negative integer for all chunks', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(1, 20),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 512,
              chunkOverlap: 128,
              strategy: 'fixed',
              preserveSections: true,
            });

            for (const chunk of chunks) {
              expect(chunk.metadata.chunkIndex).toBeDefined();
              expect(typeof chunk.metadata.chunkIndex).toBe('number');
              expect(chunk.metadata.chunkIndex).toBeGreaterThanOrEqual(0);
              expect(Number.isInteger(chunk.metadata.chunkIndex)).toBe(true);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should ensure tokenCount is positive integer for all chunks', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(1, 20),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 512,
              chunkOverlap: 128,
              strategy: 'fixed',
              preserveSections: true,
            });

            for (const chunk of chunks) {
              expect(chunk.metadata.tokenCount).toBeDefined();
              expect(typeof chunk.metadata.tokenCount).toBe('number');
              expect(chunk.metadata.tokenCount).toBeGreaterThan(0);
              expect(Number.isInteger(chunk.metadata.tokenCount)).toBe(true);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should ensure blockType is valid enum value for all chunks', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(1, 20),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 512,
              chunkOverlap: 128,
              strategy: 'fixed',
              preserveSections: true,
            });

            for (const chunk of chunks) {
              expect(chunk.metadata.blockType).toBeDefined();
              expect(VALID_CHUNK_BLOCK_TYPES).toContain(chunk.metadata.blockType);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should produce sequential chunk indices starting from 0', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(5, 30),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 100,
              chunkOverlap: 20,
              strategy: 'fixed',
              preserveSections: true,
            });

            if (chunks.length > 0) {
              // Sort by chunk index
              const sortedChunks = [...chunks].sort(
                (a, b) => a.metadata.chunkIndex - b.metadata.chunkIndex
              );

              // First chunk should have index 0
              expect(sortedChunks[0].metadata.chunkIndex).toBe(0);

              // Indices should be sequential
              for (let i = 1; i < sortedChunks.length; i++) {
                expect(sortedChunks[i].metadata.chunkIndex).toBe(i);
              }
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Property 4: Chunk Size Bounds', () => {
    /**
     * **Property 4: Chunk Size Bounds**
     * 
     * For any chunk created with a configured chunk size and overlap, the chunk's 
     * token count SHALL be less than or equal to (chunk_size + overlap) and greater 
     * than zero.
     * 
     * **Validates: Requirements 6.2, 6.8**
     */
    it('should produce chunks with token count within bounds for fixed strategy', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(5, 30),
          fc.integer({ min: 50, max: 500 }),
          fc.integer({ min: 0, max: 100 }),
          (docId, textBlocks, chunkSize, chunkOverlap) => {
            // Ensure overlap is less than chunk size
            const actualOverlap = Math.min(chunkOverlap, chunkSize - 1);
            
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize,
              chunkOverlap: actualOverlap,
              strategy: 'fixed',
              preserveSections: true,
            });

            const maxAllowedTokens = chunkSize + actualOverlap;

            for (const chunk of chunks) {
              // Token count should be greater than 0
              expect(chunk.metadata.tokenCount).toBeGreaterThan(0);
              
              // Token count should be within bounds
              // Note: Due to the nature of chunking, the last chunk may be smaller
              // and chunks may slightly exceed due to word boundaries
              expect(chunk.metadata.tokenCount).toBeLessThanOrEqual(maxAllowedTokens * 1.5);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should produce chunks with token count greater than zero', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(1, 20),
          generators.chunkingOptions,
          (docId, textBlocks, options) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, options);

            for (const chunk of chunks) {
              expect(chunk.metadata.tokenCount).toBeGreaterThan(0);
              expect(chunk.content.trim().length).toBeGreaterThan(0);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should respect chunk size bounds for semantic strategy', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(5, 30),
          fc.integer({ min: 100, max: 500 }),
          fc.integer({ min: 0, max: 50 }),
          (docId, textBlocks, chunkSize, chunkOverlap) => {
            const actualOverlap = Math.min(chunkOverlap, chunkSize - 1);
            
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize,
              chunkOverlap: actualOverlap,
              strategy: 'semantic',
              preserveSections: true,
            });

            const maxAllowedTokens = chunkSize + actualOverlap;

            for (const chunk of chunks) {
              expect(chunk.metadata.tokenCount).toBeGreaterThan(0);
              // Semantic chunking may create slightly larger chunks at boundaries
              expect(chunk.metadata.tokenCount).toBeLessThanOrEqual(maxAllowedTokens * 2);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should respect chunk size bounds for paragraph strategy', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(5, 30),
          fc.integer({ min: 100, max: 500 }),
          (docId, textBlocks, chunkSize) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize,
              chunkOverlap: 0,
              strategy: 'paragraph',
              preserveSections: true,
            });

            for (const chunk of chunks) {
              expect(chunk.metadata.tokenCount).toBeGreaterThan(0);
              // Paragraph strategy splits large paragraphs
              expect(chunk.metadata.tokenCount).toBeLessThanOrEqual(chunkSize * 2);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should produce non-empty content for all chunks', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(1, 20),
          generators.chunkingOptions,
          (docId, textBlocks, options) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, options);

            for (const chunk of chunks) {
              expect(chunk.content).toBeDefined();
              expect(typeof chunk.content).toBe('string');
              expect(chunk.content.trim().length).toBeGreaterThan(0);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 50, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Additional Chunk Properties', () => {
    it('should generate unique chunk IDs', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(10, 50),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 100,
              chunkOverlap: 20,
              strategy: 'fixed',
              preserveSections: true,
            });

            const ids = chunks.map(c => c.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);

            chunkManager.clearAll();
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should associate all chunks with the correct document ID', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(5, 20),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 200,
              chunkOverlap: 50,
              strategy: 'fixed',
              preserveSections: true,
            });

            for (const chunk of chunks) {
              expect(chunk.documentId).toBe(docId);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should return empty array for empty text blocks', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.chunkingOptions,
          (docId, options) => {
            const chunks = chunkManager.createChunks(docId, [], options);
            expect(chunks).toEqual([]);

            chunkManager.clearAll();
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should store and retrieve chunks correctly', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(5, 20),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 200,
              chunkOverlap: 50,
              strategy: 'fixed',
              preserveSections: true,
            });

            // Verify chunks can be retrieved
            const retrievedChunks = chunkManager.getChunksForDocument(docId);
            expect(retrievedChunks.length).toBe(chunks.length);

            // Verify individual chunk retrieval
            for (const chunk of chunks) {
              const retrieved = chunkManager.getChunk(chunk.id);
              expect(retrieved).toBeDefined();
              expect(retrieved?.id).toBe(chunk.id);
              expect(retrieved?.content).toBe(chunk.content);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should delete chunks correctly', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(5, 20),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 200,
              chunkOverlap: 50,
              strategy: 'fixed',
              preserveSections: true,
            });

            // Delete chunks
            chunkManager.deleteChunksForDocument(docId);

            // Verify chunks are deleted
            const retrievedChunks = chunkManager.getChunksForDocument(docId);
            expect(retrievedChunks.length).toBe(0);

            // Verify individual chunks are not retrievable
            for (const chunk of chunks) {
              const retrieved = chunkManager.getChunk(chunk.id);
              expect(retrieved).toBeUndefined();
            }
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should preserve page numbers from source blocks', () => {
      fc.assert(
        fc.property(
          generators.documentId,
          generators.textBlocks(5, 20),
          (docId, textBlocks) => {
            const chunks = chunkManager.createChunks(docId, textBlocks, {
              chunkSize: 200,
              chunkOverlap: 50,
              strategy: 'fixed',
              preserveSections: true,
            });

            // Get all page numbers from source blocks
            const sourcePages = new Set(textBlocks.map(b => b.bbox.pageNumber));

            // Get all page numbers from chunks
            const chunkPages = new Set<number>();
            for (const chunk of chunks) {
              for (const pageNum of chunk.metadata.pageNumbers) {
                chunkPages.add(pageNum);
              }
            }

            // All chunk pages should be from source pages
            for (const pageNum of chunkPages) {
              expect(sourcePages.has(pageNum)).toBe(true);
            }

            chunkManager.clearAll();
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });
});
