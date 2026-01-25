/**
 * Property-Based Tests for Retrieval Service
 * 
 * **Property 28: Reranker Application**
 * **Validates: Requirements 7.3**
 * 
 * **Property 29: Metadata Filter Correctness**
 * **Validates: Requirements 7.5**
 * 
 * **Property 11: Low Confidence Warning Trigger**
 * **Validates: Requirements 7.6, 10.2, 10.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import type { RetrievalResult, Chunk, ChunkMetadata, BoundingBox } from '../../src/types/pdf';
import type { IVectorStore, IEmbeddingService, ChunkRecord } from './types';

// =============================================================================
// Mock Electron and dependencies BEFORE importing RetrievalService
// =============================================================================

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test' },
}));

vi.mock('../secureStorage', () => ({
  getSecureValue: vi.fn().mockReturnValue(null),
}));

vi.mock('./vectorStore', () => ({
  vectorStore: {
    initialize: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockResolvedValue([]),
    bm25Search: vi.fn().mockResolvedValue([]),
    hybridSearch: vi.fn().mockResolvedValue([]),
    getChunks: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('./embeddingService', () => ({
  embeddingService: {
    generateEmbedding: vi.fn().mockResolvedValue(new Array(768).fill(0.5)),
    generateEmbeddings: vi.fn().mockResolvedValue([]),
    getModelInfo: vi.fn().mockReturnValue({ id: 'test', dimensions: 768 }),
    setModel: vi.fn().mockResolvedValue(undefined),
    isModelAvailable: vi.fn().mockResolvedValue(true),
  },
  embeddingFallbackManager: {
    isInFallbackMode: vi.fn().mockReturnValue(false),
    getState: vi.fn().mockReturnValue({ isActive: false, reason: null, activatedAt: null }),
    attemptRecovery: vi.fn().mockResolvedValue(false),
  },
}));


// =============================================================================
// Mock Setup Functions
// =============================================================================

const mockVectorSearch = vi.fn();
const mockBm25Search = vi.fn();
const mockHybridSearch = vi.fn();
const mockGetChunks = vi.fn();
const mockGenerateEmbedding = vi.fn();
const mockGenerateEmbeddings = vi.fn();
const mockGetModelInfo = vi.fn();
const mockSetModel = vi.fn();
const mockIsModelAvailable = vi.fn();

const createMockVectorStore = (): IVectorStore => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  addDocument: vi.fn().mockResolvedValue(undefined),
  addChunks: vi.fn().mockResolvedValue(undefined),
  vectorSearch: mockVectorSearch,
  bm25Search: mockBm25Search,
  hybridSearch: mockHybridSearch,
  getDocument: vi.fn().mockResolvedValue(null),
  getChunk: vi.fn().mockResolvedValue(null),
  getChunks: mockGetChunks,
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  deleteChunksForDocument: vi.fn().mockResolvedValue(0),
  getCollectionStats: vi.fn().mockResolvedValue({ documentCount: 0, chunkCount: 0, sizeBytes: 0 }),
  getStoragePath: vi.fn().mockReturnValue('/mock/path'),
  getAllDocuments: vi.fn().mockResolvedValue([]),
});

const createMockEmbeddingService = (): IEmbeddingService => ({
  generateEmbedding: mockGenerateEmbedding,
  generateEmbeddings: mockGenerateEmbeddings,
  getModelInfo: mockGetModelInfo,
  setModel: mockSetModel,
  isModelAvailable: mockIsModelAvailable,
  getCurrentModelId: vi.fn().mockReturnValue('local-gemma'),
  setOllamaBaseUrl: vi.fn(),
});

// =============================================================================
// Generators
// =============================================================================

const TEST_DIMS = 768;

const genBoundingBox = fc.record({
  x0: fc.float({ min: 0, max: 500, noNaN: true }),
  y0: fc.float({ min: 0, max: 700, noNaN: true }),
  x1: fc.float({ min: 500, max: 1000, noNaN: true }),
  y1: fc.float({ min: 700, max: 1400, noNaN: true }),
  pageNumber: fc.integer({ min: 1, max: 100 }),
}) as fc.Arbitrary<BoundingBox>;

const genChunkMetadata = fc.record({
  pageNumbers: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }),
  boundingBoxes: fc.array(genBoundingBox, { minLength: 1, maxLength: 3 }),
  sectionHeader: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  chunkIndex: fc.integer({ min: 0, max: 1000 }),
  tokenCount: fc.integer({ min: 1, max: 512 }),
  blockType: fc.constantFrom('text', 'table', 'figure') as fc.Arbitrary<'text' | 'table' | 'figure'>,
}) as fc.Arbitrary<ChunkMetadata>;


const genChunk = fc.record({
  id: fc.string({ minLength: 8, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `chunk_${s}`),
  documentId: fc.string({ minLength: 8, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `doc_${s}`),
  content: fc.string({ minLength: 10, maxLength: 500 }),
  metadata: genChunkMetadata,
  embedding: fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: TEST_DIMS, maxLength: TEST_DIMS }),
}) as fc.Arbitrary<Chunk>;

const genRetrievalResult = fc.record({
  chunk: genChunk,
  score: fc.float({ min: 0, max: 1, noNaN: true }),
  vectorScore: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
  bm25Score: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
  rerankerScore: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
}) as fc.Arbitrary<RetrievalResult>;

const genChunkRecord = (docId: string) => fc.record({
  id: fc.string({ minLength: 8, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `chunk_${s}`),
  documentId: fc.constant(docId),
  content: fc.string({ minLength: 10, maxLength: 500 }),
  pageNumbers: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }),
  boundingBoxes: fc.constant('[]'),
  sectionHeader: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  chunkIndex: fc.integer({ min: 0, max: 1000 }),
  tokenCount: fc.integer({ min: 1, max: 512 }),
  blockType: fc.constantFrom('text', 'table', 'figure'),
  vector: fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: TEST_DIMS, maxLength: TEST_DIMS }),
}) as fc.Arbitrary<ChunkRecord>;

// =============================================================================
// Import after mocks are set up
// =============================================================================

import { RetrievalService } from './retrievalService';


// =============================================================================
// Property Tests
// =============================================================================

describe('Retrieval Service Property Tests', () => {
  let retrievalService: RetrievalService;
  let mockVectorStore: IVectorStore;
  let mockEmbeddingService: IEmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVectorStore = createMockVectorStore();
    mockEmbeddingService = createMockEmbeddingService();
    
    // Default mock implementations
    mockGenerateEmbedding.mockResolvedValue(new Array(TEST_DIMS).fill(0.5));
    mockGetModelInfo.mockReturnValue({ id: 'test', name: 'Test', provider: 'local', dimensions: TEST_DIMS, maxTokens: 8192 });
    
    retrievalService = new RetrievalService(
      mockVectorStore,
      mockEmbeddingService,
      { enabled: true, model: 'cross-encoder', topN: 20, batchSize: 10 },
      { k: 60, vectorWeight: 0.7, bm25Weight: 0.3 },
      0.5
    );
  });

  describe('Property 28: Reranker Application', () => {
    /**
     * **Property 28: Reranker Application**
     * 
     * For any retrieval query with reranking enabled, the initial retrieval 
     * results SHALL be passed through the reranker, and final results SHALL 
     * be ordered by reranker scores (not initial scores).
     * 
     * **Validates: Requirements 7.3**
     */
    it('should apply reranking when enabled and reorder results', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(genRetrievalResult, { minLength: 2, maxLength: 10 }),
        async (results) => {
          const reranked = await retrievalService.rerank('test query', results);
          
          for (const result of reranked) {
            expect(result).toHaveProperty('score');
            expect(typeof result.score).toBe('number');
          }
          
          for (let i = 1; i < reranked.length; i++) {
            expect(reranked[i - 1].score).toBeGreaterThanOrEqual(reranked[i].score);
          }
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should set rerankerScore on reranked results', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(genRetrievalResult, { minLength: 1, maxLength: 5 }),
        async (results) => {
          const reranked = await retrievalService.rerank('test query', results);
          const hasRerankerScores = reranked.some(r => r.rerankerScore !== undefined);
          
          if (results.every(r => r.chunk.embedding && r.chunk.embedding.length > 0)) {
            expect(hasRerankerScores).toBe(true);
          }
        }
      ), { numRuns: 20, seed: 12345 });
    });

    it('should return original results when reranking is disabled', async () => {
      const disabledService = new RetrievalService(
        mockVectorStore,
        mockEmbeddingService,
        { enabled: false, model: 'cross-encoder', topN: 20, batchSize: 10 },
        { k: 60, vectorWeight: 0.7, bm25Weight: 0.3 },
        0.5
      );

      await fc.assert(fc.asyncProperty(
        fc.array(genRetrievalResult, { minLength: 1, maxLength: 5 }),
        async (results) => {
          const reranked = await disabledService.rerank('test query', results);
          
          expect(reranked.length).toBe(results.length);
          for (let i = 0; i < results.length; i++) {
            expect(reranked[i].chunk.id).toBe(results[i].chunk.id);
          }
        }
      ), { numRuns: 20, seed: 12345 });
    });

    it('should handle empty results gracefully', async () => {
      const reranked = await retrievalService.rerank('test query', []);
      expect(reranked).toEqual([]);
    });
  });


  describe('Property 29: Metadata Filter Correctness', () => {
    /**
     * **Property 29: Metadata Filter Correctness**
     * 
     * For any retrieval query with page range filter [start, end], all 
     * returned chunks SHALL have at least one page number within the 
     * specified range.
     * 
     * **Validates: Requirements 7.5**
     */
    it('should filter results by page range correctly', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 51, max: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (startPage, endPage, query) => {
          const docId = 'doc_test';
          const chunkRecords = fc.sample(genChunkRecord(docId), 10);
          
          mockHybridSearch.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: 1 - i * 0.1 }))
          );
          mockGetChunks.mockResolvedValue(chunkRecords);

          const results = await retrievalService.retrieve(query, [docId], {
            pageFilter: { start: startPage, end: endPage },
            useHybrid: true,
            useReranker: false,
            topK: 10,
          });

          for (const result of results) {
            const pageNumbers = result.chunk.metadata.pageNumbers;
            const hasPageInRange = pageNumbers.some(p => p >= startPage && p <= endPage);
            expect(hasPageInRange).toBe(true);
          }
        }
      ), { numRuns: 20, seed: 12345 });
    });

    it('should filter results by section correctly', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (sectionFilters, query) => {
          const docId = 'doc_test';
          const chunkRecords = fc.sample(genChunkRecord(docId), 10);
          
          mockHybridSearch.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: 1 - i * 0.1 }))
          );
          mockGetChunks.mockResolvedValue(chunkRecords);

          const results = await retrievalService.retrieve(query, [docId], {
            sectionFilter: sectionFilters,
            useHybrid: true,
            useReranker: false,
            topK: 10,
          });

          const sectionSet = new Set(sectionFilters.map(s => s.toLowerCase()));
          for (const result of results) {
            const sectionHeader = result.chunk.metadata.sectionHeader;
            if (sectionHeader) {
              expect(sectionSet.has(sectionHeader.toLowerCase())).toBe(true);
            }
          }
        }
      ), { numRuns: 20, seed: 12345 });
    });

    it('should return empty results when no chunks match filters', async () => {
      const docId = 'doc_test';
      const chunkRecords = fc.sample(genChunkRecord(docId), 5).map(c => ({
        ...c,
        pageNumbers: [1, 2, 3],
      }));
      
      mockHybridSearch.mockResolvedValue(
        chunkRecords.map((c, i) => ({ id: c.id, score: 1 - i * 0.1 }))
      );
      mockGetChunks.mockResolvedValue(chunkRecords);

      const results = await retrievalService.retrieve('test', [docId], {
        pageFilter: { start: 100, end: 200 },
        useHybrid: true,
        useReranker: false,
        topK: 10,
      });

      expect(results.length).toBe(0);
    });
  });


  describe('Property 11: Low Confidence Warning Trigger', () => {
    /**
     * **Property 11: Low Confidence Warning Trigger**
     * 
     * For any retrieval result set where the maximum relevance score is 
     * below the configured threshold (default 0.5), the system SHALL 
     * display a low-confidence warning to the user.
     * 
     * **Validates: Requirements 7.6, 10.2, 10.5**
     */
    it('should trigger low confidence warning when scores are below threshold', async () => {
      await fc.assert(fc.asyncProperty(
        fc.float({ min: 0, max: Math.fround(0.49), noNaN: true }),
        async (maxScore) => {
          const results: RetrievalResult[] = [
            {
              chunk: fc.sample(genChunk, 1)[0],
              score: maxScore,
              vectorScore: maxScore,
            },
          ];

          const isLow = retrievalService.isLowConfidence(results);
          expect(isLow).toBe(true);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should not trigger warning when scores are above threshold', async () => {
      await fc.assert(fc.asyncProperty(
        fc.float({ min: Math.fround(0.51), max: 1, noNaN: true }),
        async (maxScore) => {
          const results: RetrievalResult[] = [
            {
              chunk: fc.sample(genChunk, 1)[0],
              score: maxScore,
              vectorScore: maxScore,
            },
          ];

          const isLow = retrievalService.isLowConfidence(results);
          expect(isLow).toBe(false);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should calculate confidence score correctly', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(genRetrievalResult, { minLength: 1, maxLength: 10 }),
        async (results) => {
          const confidence = retrievalService.calculateConfidenceScore(results);
          
          expect(confidence).toBeGreaterThanOrEqual(0);
          expect(confidence).toBeLessThanOrEqual(1);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should return zero confidence for empty results', () => {
      const confidence = retrievalService.calculateConfidenceScore([]);
      expect(confidence).toBe(0);
    });

    it('should return warning message for low confidence results', async () => {
      const docId = 'doc_test';
      const chunkRecords = fc.sample(genChunkRecord(docId), 3);
      
      mockHybridSearch.mockResolvedValue(
        chunkRecords.map((c, i) => ({ id: c.id, score: 0.2 - i * 0.05 }))
      );
      mockGetChunks.mockResolvedValue(chunkRecords);

      const result = await retrievalService.retrieveWithConfidence('test', [docId], {
        useHybrid: true,
        useReranker: false,
        topK: 5,
      });

      expect(result.isLowConfidence).toBe(true);
      expect(result.warning).toBeDefined();
      expect(typeof result.warning).toBe('string');
    });

    it('should respect custom confidence threshold', () => {
      const customService = new RetrievalService(
        mockVectorStore,
        mockEmbeddingService,
        { enabled: false, model: 'cross-encoder', topN: 20, batchSize: 10 },
        { k: 60, vectorWeight: 0.7, bm25Weight: 0.3 },
        0.8
      );

      const results: RetrievalResult[] = [
        {
          chunk: fc.sample(genChunk, 1)[0],
          score: 0.7,
          vectorScore: 0.7,
        },
      ];

      expect(customService.isLowConfidence(results)).toBe(true);
    });
  });


  describe('Query Processing', () => {
    it('should extract keywords from queries', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 200 }),
        async (query) => {
          const processed = await retrievalService.processQuery(query);
          
          expect(processed).toHaveProperty('original');
          expect(processed).toHaveProperty('expanded');
          expect(processed).toHaveProperty('keywords');
          expect(processed).toHaveProperty('hasViewReference');
          
          expect(processed.original).toBe(query.trim());
          expect(Array.isArray(processed.keywords)).toBe(true);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should detect view-relative references', async () => {
      const viewRefQueries = [
        'What is on this page?',
        'Explain the table above',
        'What does the figure above show?',
        'Summarize the current page',
      ];

      for (const query of viewRefQueries) {
        const processed = await retrievalService.processQuery(query);
        expect(processed.hasViewReference).toBe(true);
      }
    });

    it('should expand query with conversation context', async () => {
      const context = {
        messages: [
          { role: 'user' as const, content: 'Tell me about machine learning algorithms' },
          { role: 'assistant' as const, content: 'Machine learning includes supervised and unsupervised learning...' },
        ],
        documentIds: ['doc_1'],
      };

      const processed = await retrievalService.processQuery('What about it?', context);
      expect(processed.expanded.length).toBeGreaterThanOrEqual(processed.original.length);
    });
  });

  describe('Configuration', () => {
    it('should allow updating reranker config', () => {
      retrievalService.setRerankerConfig({ enabled: false });
      const config = retrievalService.getConfig();
      expect(config.rerankerConfig.enabled).toBe(false);
    });

    it('should allow updating RRF params', () => {
      retrievalService.setRRFParams({ vectorWeight: 0.5, bm25Weight: 0.5 });
      const config = retrievalService.getConfig();
      expect(config.rrfParams.vectorWeight).toBe(0.5);
      expect(config.rrfParams.bm25Weight).toBe(0.5);
    });

    it('should clamp confidence threshold to valid range', () => {
      retrievalService.setLowConfidenceThreshold(1.5);
      expect(retrievalService.getConfig().lowConfidenceThreshold).toBe(1);
      
      retrievalService.setLowConfidenceThreshold(-0.5);
      expect(retrievalService.getConfig().lowConfidenceThreshold).toBe(0);
    });
  });
});
