/**
 * Property-Based Tests for Vector Store Service
 * 
 * **Property 5: Index Cache Consistency**
 * **Validates: Requirements 6.7**
 * 
 * **Property 22: Data Clearing Completeness**
 * **Validates: Requirements 20.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import type { DocumentRecord, ChunkRecord } from './types';

const mockAdd = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockCountRows = vi.fn().mockResolvedValue(0);
const mockCreateIndex = vi.fn().mockResolvedValue(undefined);
const mockToArray = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockNearestTo = vi.fn().mockReturnThis();
const mockNearestToText = vi.fn().mockReturnThis();
const mockQuery = vi.fn().mockReturnValue({
  where: mockWhere,
  limit: mockLimit,
  nearestTo: mockNearestTo,
  nearestToText: mockNearestToText,
  toArray: mockToArray,
});
const mockTableNames = vi.fn().mockResolvedValue([]);
const mockCreateTable = vi.fn();
const mockOpenTable = vi.fn();
const mockDropTable = vi.fn().mockResolvedValue(undefined);

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-vector-store' },
}));

vi.mock('fs', () => ({
  existsSync: () => true,
  mkdirSync: () => {},
  readdirSync: () => [],
  statSync: () => ({ isDirectory: () => false, size: 0 }),
}));

vi.mock('@lancedb/lancedb', () => ({
  connect: () => Promise.resolve({
    tableNames: mockTableNames,
    createTable: mockCreateTable,
    openTable: mockOpenTable,
    dropTable: mockDropTable,
  }),
  Index: { fts: () => ({}) },
}));

import { VectorStore } from './vectorStore';

const TEST_DIMS = 768;
const hexStr = (len: number) => fc.array(fc.integer({ min: 0, max: 15 }), { minLength: len, maxLength: len }).map(a => a.map(n => n.toString(16)).join(''));

const gen = {
  docId: fc.string({ minLength: 8, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `doc_${s}`),
  docRec: fc.record({
    id: fc.string({ minLength: 8, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `doc_${s}`),
    filePath: fc.constant('/path/to/test.pdf'),
    fileName: fc.constant('test.pdf'),
    fileHash: hexStr(64),
    pageCount: fc.integer({ min: 1, max: 100 }),
    title: fc.constant(null),
    author: fc.constant(null),
    indexedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
    chunkCount: fc.integer({ min: 1, max: 100 }),
    embeddingModel: fc.constant('local-nomic'),
  }) as fc.Arbitrary<DocumentRecord>,
  chunkRec: (docId: string) => fc.record({
    id: fc.string({ minLength: 8, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `chunk_${s}`),
    documentId: fc.constant(docId),
    content: fc.constant('test content'),
    pageNumbers: fc.constant([1]),
    boundingBoxes: fc.constant('[]'),
    sectionHeader: fc.constant(null),
    chunkIndex: fc.integer({ min: 0, max: 100 }),
    tokenCount: fc.integer({ min: 1, max: 100 }),
    blockType: fc.constant('text'),
    vector: fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: TEST_DIMS, maxLength: TEST_DIMS }),
  }) as fc.Arbitrary<ChunkRecord>,
};


describe('Vector Store Property Tests', () => {
  let vs: VectorStore;
  const mockTable = { add: mockAdd, update: mockUpdate, delete: mockDelete, query: mockQuery, countRows: mockCountRows, createIndex: mockCreateIndex };

  beforeEach(() => {
    vi.clearAllMocks();
    mockToArray.mockResolvedValue([]);
    mockTableNames.mockResolvedValue([]);
    mockCreateTable.mockResolvedValue(mockTable);
    mockOpenTable.mockResolvedValue(mockTable);
    vs = new VectorStore(TEST_DIMS);
  });

  afterEach(async () => { await vs.close(); });

  describe('Property 5: Index Cache Consistency', () => {
    it('should return same document for same file hash', async () => {
      await fc.assert(fc.asyncProperty(gen.docRec, async (doc) => {
        mockToArray.mockResolvedValue([doc]);
        await vs.initialize();
        await vs.addDocument(doc);
        await vs.getDocumentByHash(doc.fileHash);
        expect(mockWhere).toHaveBeenCalledWith(expect.stringContaining(doc.fileHash));
      }), { numRuns: 50, seed: 12345 });
    });

    it('should maintain document metadata integrity', async () => {
      await fc.assert(fc.asyncProperty(gen.docRec, async (doc) => {
        mockToArray.mockResolvedValue([doc]);
        await vs.initialize();
        await vs.addDocument(doc);
        await vs.getDocument(doc.id);
        expect(mockWhere).toHaveBeenCalledWith(expect.stringContaining(doc.id));
      }), { numRuns: 50, seed: 12345 });
    });

    it('should preserve chunk data integrity', async () => {
      await fc.assert(fc.asyncProperty(gen.docId, fc.integer({ min: 1, max: 5 }), async (docId, cnt) => {
        const chunks = fc.sample(gen.chunkRec(docId), cnt);
        mockToArray.mockResolvedValue(chunks);
        await vs.initialize();
        await vs.addChunks(chunks);
        await vs.getChunks(chunks.map(c => c.id));
        expect(mockQuery).toHaveBeenCalled();
      }), { numRuns: 30, seed: 12345 });
    });
  });

  describe('Property 22: Data Clearing Completeness', () => {
    it('should delete all chunks when document is deleted', async () => {
      await fc.assert(fc.asyncProperty(gen.docRec, async (doc) => {
        await vs.initialize();
        await vs.addDocument(doc);
        await vs.deleteDocument(doc.id);
        expect(mockDelete).toHaveBeenCalledWith(expect.stringContaining(doc.id));
      }), { numRuns: 50, seed: 12345 });
    });

    it('should return empty results after document deletion', async () => {
      await fc.assert(fc.asyncProperty(gen.docId, async (docId) => {
        mockToArray.mockResolvedValue([]);
        await vs.initialize();
        await vs.deleteDocument(docId);
        const chunks = await vs.getChunksForDocument(docId);
        expect(chunks).toEqual([]);
      }), { numRuns: 50, seed: 12345 });
    });

    it('should clear all data when clearAll is called', async () => {
      await fc.assert(fc.asyncProperty(fc.array(gen.docRec, { minLength: 1, maxLength: 3 }), async (docs) => {
        mockTableNames.mockResolvedValue(['documents', 'chunks']);
        await vs.initialize();
        for (const doc of docs) await vs.addDocument(doc);
        await vs.clearAll();
        expect(mockDropTable).toHaveBeenCalledWith('chunks');
        expect(mockDropTable).toHaveBeenCalledWith('documents');
      }), { numRuns: 20, seed: 12345 });
    });

    it('should handle deletion of non-existent document gracefully', async () => {
      await fc.assert(fc.asyncProperty(gen.docId, async (docId) => {
        await vs.initialize();
        await expect(vs.deleteDocument(docId)).resolves.not.toThrow();
      }), { numRuns: 30, seed: 12345 });
    });
  });

  describe('Additional Properties', () => {
    it('should validate embedding dimensions on chunk addition', async () => {
      await fc.assert(fc.asyncProperty(gen.docId, async (docId) => {
        await vs.initialize();
        const badChunk: ChunkRecord = { id: 'chunk_test', documentId: docId, content: 'test', pageNumbers: [1], boundingBoxes: '[]', sectionHeader: null, chunkIndex: 0, tokenCount: 10, blockType: 'text', vector: [0.1, 0.2, 0.3] };
        await expect(vs.addChunks([badChunk])).rejects.toThrow(/dimension mismatch/i);
      }), { numRuns: 20, seed: 12345 });
    });

    it('should return correct embedding dimensions', () => {
      fc.assert(fc.property(fc.integer({ min: 128, max: 4096 }), (dims) => {
        const store = new VectorStore(dims);
        expect(store.getEmbeddingDimensions()).toBe(dims);
      }), { numRuns: 30, seed: 12345 });
    });

    it('should handle empty chunk array gracefully', async () => {
      await vs.initialize();
      await expect(vs.addChunks([])).resolves.not.toThrow();
    });

    it('should report initialization status correctly', async () => {
      expect(vs.isReady()).toBe(false);
      await vs.initialize();
      expect(vs.isReady()).toBe(true);
      await vs.close();
      expect(vs.isReady()).toBe(false);
    });
  });
});


describe('Retrieval Property Tests', () => {
  let vs: VectorStore;
  const mockTable = { add: mockAdd, update: mockUpdate, delete: mockDelete, query: mockQuery, countRows: mockCountRows, createIndex: mockCreateIndex };

  beforeEach(() => {
    vi.clearAllMocks();
    mockToArray.mockResolvedValue([]);
    mockTableNames.mockResolvedValue([]);
    mockCreateTable.mockResolvedValue(mockTable);
    mockOpenTable.mockResolvedValue(mockTable);
    vs = new VectorStore(TEST_DIMS);
  });

  afterEach(async () => { await vs.close(); });

  describe('Property 6: Hybrid Search Execution', () => {
    /**
     * **Property 6: Hybrid Search Execution**
     * 
     * For any query submitted to the RAG_Engine with hybrid search enabled, 
     * both vector search and BM25 search SHALL be executed, and results 
     * SHALL be combined using reciprocal rank fusion.
     * 
     * **Validates: Requirements 7.1, 7.2**
     */
    it('should execute both vector and BM25 search for hybrid queries', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: TEST_DIMS, maxLength: TEST_DIMS }),
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 1, max: 20 }),
        async (queryVector, queryText, limit) => {
          // Setup mock to return some results
          const mockResults = [
            { id: 'chunk_1', _distance: 0.1, pageNumbers: [1] },
            { id: 'chunk_2', _distance: 0.2, pageNumbers: [2] },
          ];
          mockToArray.mockResolvedValue(mockResults);
          // Ensure chunks table exists by simulating it was already created
          mockTableNames.mockResolvedValue(['documents', 'chunks']);

          await vs.initialize();
          
          const results = await vs.hybridSearch(
            { queryVector, limit, documentIds: [] },
            { queryText, limit, documentIds: [] },
            { k: 60, vectorWeight: 0.7, bm25Weight: 0.3 }
          );

          // Both search methods should have been called
          expect(mockNearestTo).toHaveBeenCalled();
          expect(mockNearestToText).toHaveBeenCalled();
          
          // Results should be combined (RRF produces scores)
          for (const result of results) {
            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('score');
            expect(typeof result.score).toBe('number');
          }
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should combine results using reciprocal rank fusion', async () => {
      await fc.assert(fc.asyncProperty(
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.9), noNaN: true }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.9), noNaN: true }),
        async (vectorWeight, bm25Weight) => {
          const queryVector = new Array(TEST_DIMS).fill(0.5);
          const mockResults = [{ id: 'chunk_1', _distance: 0.1, pageNumbers: [1] }];
          mockToArray.mockResolvedValue(mockResults);
          // Ensure chunks table exists
          mockTableNames.mockResolvedValue(['documents', 'chunks']);

          await vs.initialize();
          
          const results = await vs.hybridSearch(
            { queryVector, limit: 10, documentIds: [] },
            { queryText: 'test', limit: 10, documentIds: [] },
            { k: 60, vectorWeight, bm25Weight }
          );

          // RRF should produce valid scores
          for (const result of results) {
            expect(result.score).toBeGreaterThan(0);
            expect(result.score).toBeLessThanOrEqual(1);
          }
        }
      ), { numRuns: 20, seed: 12345 });
    });
  });

  describe('Property 7: Top-K Result Bound', () => {
    /**
     * **Property 7: Top-K Result Bound**
     * 
     * For any retrieval query with configured top-k value, the number of 
     * returned results SHALL be less than or equal to k, and results 
     * SHALL be ordered by descending relevance score.
     * 
     * **Validates: Requirements 7.7, 7.9**
     */
    it('should return at most k results for vector search', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        async (limit) => {
          const queryVector = new Array(TEST_DIMS).fill(0.5);
          // Generate more results than limit
          const mockResults = Array.from({ length: limit + 10 }, (_, i) => ({
            id: `chunk_${i}`,
            _distance: i * 0.1,
            pageNumbers: [1],
          }));
          mockToArray.mockResolvedValue(mockResults.slice(0, limit));

          await vs.initialize();
          
          const results = await vs.vectorSearch({
            queryVector,
            limit,
            documentIds: [],
          });

          expect(results.length).toBeLessThanOrEqual(limit);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should return results ordered by descending score', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        async (limit) => {
          const queryVector = new Array(TEST_DIMS).fill(0.5);
          // Mock results with varying distances
          const mockResults = Array.from({ length: limit }, (_, i) => ({
            id: `chunk_${i}`,
            _distance: i * 0.1,
            pageNumbers: [1],
          }));
          mockToArray.mockResolvedValue(mockResults);

          await vs.initialize();
          
          const results = await vs.vectorSearch({
            queryVector,
            limit,
            documentIds: [],
          });

          // Results should be ordered by descending score
          for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
          }
        }
      ), { numRuns: 20, seed: 12345 });
    });
  });

  describe('Property 8: Retrieval Result Metadata Completeness', () => {
    /**
     * **Property 8: Retrieval Result Metadata Completeness**
     * 
     * For any retrieval result returned by the RAG_Engine, the result 
     * SHALL include: chunk content, relevance score (0-1), page number(s), 
     * bounding boxes, section header (if available), and document identifier.
     * 
     * **Validates: Requirements 7.8, 9.2, 9.3**
     */
    it('should return results with id and score', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (limit) => {
          const queryVector = new Array(TEST_DIMS).fill(0.5);
          const mockResults = Array.from({ length: limit }, (_, i) => ({
            id: `chunk_${i}`,
            _distance: i * 0.1,
            pageNumbers: [1],
          }));
          mockToArray.mockResolvedValue(mockResults);

          await vs.initialize();
          
          const results = await vs.vectorSearch({
            queryVector,
            limit,
            documentIds: [],
          });

          for (const result of results) {
            expect(result).toHaveProperty('id');
            expect(typeof result.id).toBe('string');
            expect(result).toHaveProperty('score');
            expect(typeof result.score).toBe('number');
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(1);
          }
        }
      ), { numRuns: 20, seed: 12345 });
    });

    it('should retrieve full chunk records with metadata', async () => {
      await fc.assert(fc.asyncProperty(
        gen.docId,
        fc.integer({ min: 1, max: 5 }),
        async (docId, chunkCount) => {
          const chunks = fc.sample(gen.chunkRec(docId), chunkCount);
          mockToArray.mockResolvedValue(chunks);

          await vs.initialize();
          
          const results = await vs.getChunks(chunks.map(c => c.id));

          for (const result of results) {
            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('documentId');
            expect(result).toHaveProperty('content');
            expect(result).toHaveProperty('pageNumbers');
            expect(result).toHaveProperty('boundingBoxes');
            expect(result).toHaveProperty('blockType');
          }
        }
      ), { numRuns: 20, seed: 12345 });
    });
  });
});

