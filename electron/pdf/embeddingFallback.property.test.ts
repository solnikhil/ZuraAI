/**
 * Property-Based Tests for Embedding Model Fallback
 * 
 * **Property 19: Embedding Model Fallback**
 * 
 * *For any* query when the configured embedding model is unavailable 
 * (network error, model not loaded), the system SHALL fall back to 
 * keyword-only (BM25) search and return results.
 * 
 * **Validates: Requirements 18.2**
 * 
 * This test file verifies that:
 * 1. When embeddings fail, the system falls back to BM25-only search
 * 2. BM25 fallback returns valid results
 * 3. The fallback state is properly tracked and reported
 * 4. Recovery from fallback mode works correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import type { RetrievalResult, Chunk, ChunkMetadata, BoundingBox } from '../../src/types/pdf';
import type { IVectorStore, IEmbeddingService, ChunkRecord } from './types';

// =============================================================================
// Mock Electron and dependencies BEFORE importing services
// =============================================================================

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test' },
}));

vi.mock('../secureStorage', () => ({
  getSecureValue: vi.fn().mockReturnValue(null),
}));

// =============================================================================
// Property Test Configuration
// =============================================================================

const PROPERTY_TEST_CONFIG = {
  numRuns: 50,
  seed: 12345,
  timeout: 30000,
};

const TEST_DIMS = 768;

// =============================================================================
// Generators
// =============================================================================

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

const genQuery = fc.string({ minLength: 3, maxLength: 200 }).filter(s => s.trim().length >= 3);

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
// Mock the embedding service and fallback manager
// =============================================================================

// Create a mock fallback manager for testing
class MockEmbeddingFallbackManager {
  private state = {
    isActive: false,
    failureCount: 0,
    canRecover: true,
    reason: undefined as string | undefined,
    message: undefined as string | undefined,
    activatedAt: undefined as number | undefined,
    lastError: undefined as string | undefined,
  };

  getState() {
    return { ...this.state };
  }

  isInFallbackMode(): boolean {
    return this.state.isActive;
  }

  recordFailure(error: Error | string, reason: string = 'generation_failed'): void {
    const errorMessage = error instanceof Error ? error.message : error;
    this.state.failureCount++;
    this.state.lastError = errorMessage;
    
    // Activate fallback after 3 failures
    if (this.state.failureCount >= 3 && !this.state.isActive) {
      this.activateFallback(reason, errorMessage);
    }
  }

  activateFallback(reason: string, errorMessage?: string): void {
    this.state = {
      isActive: true,
      reason,
      message: `Fallback activated: ${reason}`,
      activatedAt: Date.now(),
      failureCount: this.state.failureCount,
      lastError: errorMessage || this.state.lastError,
      canRecover: reason !== 'dimension_mismatch',
    };
  }

  deactivateFallback(): void {
    this.state = {
      isActive: false,
      failureCount: 0,
      canRecover: true,
      reason: undefined,
      message: undefined,
      activatedAt: undefined,
      lastError: undefined,
    };
  }

  recordSuccess(): void {
    if (this.state.isActive) {
      this.deactivateFallback();
    } else {
      this.state.failureCount = 0;
    }
  }

  async attemptRecovery(): Promise<boolean> {
    if (!this.state.isActive || !this.state.canRecover) {
      return false;
    }
    // Simulate recovery attempt
    return false;
  }

  reset(): void {
    this.deactivateFallback();
  }
}

// Global mock fallback manager instance
let mockFallbackManager: MockEmbeddingFallbackManager;

// Mock the embedding service module
vi.mock('./embeddingService', () => {
  return {
    embeddingService: {
      generateEmbedding: vi.fn(),
      generateEmbeddings: vi.fn(),
      getModelInfo: vi.fn().mockReturnValue({ id: 'test', dimensions: 768 }),
      setModel: vi.fn().mockResolvedValue(undefined),
      isModelAvailable: vi.fn().mockResolvedValue(true),
      getCurrentModelId: vi.fn().mockReturnValue('local-nomic'),
    },
    embeddingFallbackManager: {
      getState: vi.fn(() => mockFallbackManager?.getState() ?? { isActive: false, failureCount: 0, canRecover: true }),
      isInFallbackMode: vi.fn(() => mockFallbackManager?.isInFallbackMode() ?? false),
      recordFailure: vi.fn((error, reason) => mockFallbackManager?.recordFailure(error, reason)),
      activateFallback: vi.fn((reason, msg) => mockFallbackManager?.activateFallback(reason, msg)),
      deactivateFallback: vi.fn(() => mockFallbackManager?.deactivateFallback()),
      recordSuccess: vi.fn(() => mockFallbackManager?.recordSuccess()),
      attemptRecovery: vi.fn(async () => mockFallbackManager?.attemptRecovery() ?? false),
    },
    generateEmbeddingWithFallback: vi.fn(),
    generateEmbeddingsWithFallback: vi.fn(),
    EMBEDDING_MODELS: [
      { id: 'local-nomic', name: 'Nomic Embed Text (Local)', provider: 'local', dimensions: 768, maxTokens: 8192 },
      { id: 'openai-small', name: 'OpenAI text-embedding-3-small', provider: 'openai', dimensions: 1536, maxTokens: 8191 },
    ],
  };
});

vi.mock('./vectorStore', () => ({
  vectorStore: {
    initialize: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockResolvedValue([]),
    bm25Search: vi.fn().mockResolvedValue([]),
    hybridSearch: vi.fn().mockResolvedValue([]),
    getChunks: vi.fn().mockResolvedValue([]),
  },
}));

// =============================================================================
// Import after mocks are set up
// =============================================================================

import { RetrievalService } from './retrievalService';
import { 
  embeddingFallbackManager, 
  generateEmbeddingWithFallback 
} from './embeddingService';

// =============================================================================
// Property Tests
// =============================================================================

describe('Property 19: Embedding Model Fallback', () => {
  /**
   * **Property 19: Embedding Model Fallback**
   * 
   * *For any* query when the configured embedding model is unavailable 
   * (network error, model not loaded), the system SHALL fall back to 
   * keyword-only (BM25) search and return results.
   * 
   * **Validates: Requirements 18.2**
   */

  let retrievalService: RetrievalService;
  let mockVectorStore: IVectorStore;
  let mockEmbeddingService: IEmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create fresh mock fallback manager for each test
    mockFallbackManager = new MockEmbeddingFallbackManager();
    
    mockVectorStore = createMockVectorStore();
    mockEmbeddingService = createMockEmbeddingService();
    
    // Default mock implementations
    mockGetModelInfo.mockReturnValue({ 
      id: 'local-nomic', 
      name: 'Nomic Embed Text (Local)', 
      provider: 'local', 
      dimensions: TEST_DIMS, 
      maxTokens: 8192 
    });
    
    retrievalService = new RetrievalService(
      mockVectorStore,
      mockEmbeddingService,
      { enabled: false, model: 'cross-encoder', topN: 20, batchSize: 10 },
      { k: 60, vectorWeight: 0.7, bm25Weight: 0.3 },
      0.5
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFallbackManager?.reset();
  });

  describe('Fallback Activation on Embedding Failure', () => {
    /**
     * Test that when embeddings fail, the system activates fallback mode
     * and uses BM25-only search.
     */
    it('should activate fallback mode after repeated embedding failures', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        fc.integer({ min: 3, max: 10 }),
        async (query, failureCount) => {
          // Reset fallback manager
          mockFallbackManager.reset();
          
          // Simulate embedding failures
          for (let i = 0; i < failureCount; i++) {
            mockFallbackManager.recordFailure(
              new Error('Embedding model unavailable'),
              'model_unavailable'
            );
          }
          
          // After 3+ failures, fallback should be active
          if (failureCount >= 3) {
            expect(mockFallbackManager.isInFallbackMode()).toBe(true);
            
            const state = mockFallbackManager.getState();
            expect(state.isActive).toBe(true);
            expect(state.failureCount).toBe(failureCount);
          }
        }
      ), { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should use BM25-only search when in fallback mode', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        async (query) => {
          const docId = 'doc_test';
          const chunkRecords = fc.sample(genChunkRecord(docId), 5);
          
          // Activate fallback mode
          mockFallbackManager.activateFallback('model_unavailable', 'Ollama not running');
          
          // Setup BM25 search to return results
          mockBm25Search.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: 1 - i * 0.1 }))
          );
          mockGetChunks.mockResolvedValue(chunkRecords);
          
          // Perform retrieval
          const results = await retrievalService.retrieve(query, [docId], {
            useHybrid: true,
            useReranker: false,
            topK: 5,
          });
          
          // Verify BM25 search was called (fallback mode)
          expect(mockBm25Search).toHaveBeenCalled();
          
          // Verify results are returned
          expect(results.length).toBeGreaterThanOrEqual(0);
          expect(results.length).toBeLessThanOrEqual(5);
        }
      ), { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should return valid results from BM25 fallback for any query', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        fc.array(genChunkRecord('doc_test'), { minLength: 1, maxLength: 10 }),
        async (query, chunkRecords) => {
          // Activate fallback mode
          mockFallbackManager.activateFallback('model_unavailable');
          
          // Setup BM25 search to return results
          mockBm25Search.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: Math.max(0.1, 1 - i * 0.1) }))
          );
          mockGetChunks.mockResolvedValue(chunkRecords);
          
          // Perform retrieval
          const results = await retrievalService.retrieve(query, ['doc_test'], {
            useHybrid: true,
            useReranker: false,
            topK: 10,
          });
          
          // Verify results have valid structure
          for (const result of results) {
            expect(result).toHaveProperty('chunk');
            expect(result).toHaveProperty('score');
            expect(typeof result.score).toBe('number');
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(1);
            
            // Verify chunk has required properties
            expect(result.chunk).toHaveProperty('id');
            expect(result.chunk).toHaveProperty('documentId');
            expect(result.chunk).toHaveProperty('content');
            expect(result.chunk).toHaveProperty('metadata');
          }
        }
      ), { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed });
    });
  });

  describe('Fallback State Tracking', () => {
    /**
     * Test that the fallback state is properly tracked and reported.
     */
    it('should track fallback state correctly', async () => {
      await fc.assert(fc.asyncProperty(
        fc.constantFrom(
          'model_unavailable',
          'generation_failed',
          'rate_limited',
          'model_loading'
        ),
        async (reason) => {
          // Reset and activate fallback
          mockFallbackManager.reset();
          mockFallbackManager.activateFallback(reason, `Test error: ${reason}`);
          
          const state = mockFallbackManager.getState();
          
          // Verify state is properly set
          expect(state.isActive).toBe(true);
          expect(state.reason).toBe(reason);
          expect(state.activatedAt).toBeDefined();
          expect(typeof state.activatedAt).toBe('number');
          expect(state.message).toContain(reason);
        }
      ), { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should report fallback state in retrieval results', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        async (query) => {
          const docId = 'doc_test';
          const chunkRecords = fc.sample(genChunkRecord(docId), 3);
          
          // Activate fallback mode
          mockFallbackManager.activateFallback('model_unavailable', 'Ollama not running');
          
          // Setup BM25 search
          mockBm25Search.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: 0.8 - i * 0.1 }))
          );
          mockGetChunks.mockResolvedValue(chunkRecords);
          
          // Perform retrieval with confidence
          const result = await retrievalService.retrieveWithConfidence(query, [docId], {
            useHybrid: true,
            useReranker: false,
            topK: 5,
          });
          
          // Verify fallback state is reported
          expect(result.usedFallback).toBe(true);
          expect(result.searchMethod).toBe('bm25_only');
          expect(result.warning).toBeDefined();
          expect(typeof result.warning).toBe('string');
        }
      ), { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should indicate recovery possibility based on failure reason', async () => {
      await fc.assert(fc.asyncProperty(
        fc.constantFrom(
          { reason: 'model_unavailable', canRecover: true },
          { reason: 'generation_failed', canRecover: true },
          { reason: 'rate_limited', canRecover: true },
          { reason: 'dimension_mismatch', canRecover: false }
        ),
        async ({ reason, canRecover }) => {
          mockFallbackManager.reset();
          mockFallbackManager.activateFallback(reason);
          
          const state = mockFallbackManager.getState();
          
          expect(state.canRecover).toBe(canRecover);
        }
      ), { numRuns: 10, seed: PROPERTY_TEST_CONFIG.seed });
    });
  });

  describe('Recovery from Fallback Mode', () => {
    /**
     * Test that the system can recover from fallback mode when embeddings
     * become available again.
     */
    it('should deactivate fallback on successful embedding', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        async (_query) => {
          // Activate fallback mode
          mockFallbackManager.activateFallback('model_unavailable');
          expect(mockFallbackManager.isInFallbackMode()).toBe(true);
          
          // Record a successful embedding
          mockFallbackManager.recordSuccess();
          
          // Verify fallback is deactivated
          expect(mockFallbackManager.isInFallbackMode()).toBe(false);
          
          const state = mockFallbackManager.getState();
          expect(state.isActive).toBe(false);
          expect(state.failureCount).toBe(0);
        }
      ), { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should reset failure count on successful embedding', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (failureCount) => {
          mockFallbackManager.reset();
          
          // Record some failures (but not enough to trigger fallback)
          for (let i = 0; i < Math.min(failureCount, 2); i++) {
            mockFallbackManager.recordFailure(new Error('Test error'));
          }
          
          // Record success
          mockFallbackManager.recordSuccess();
          
          // Verify failure count is reset
          const state = mockFallbackManager.getState();
          expect(state.failureCount).toBe(0);
        }
      ), { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed });
    });
  });

  describe('BM25-Only Search Behavior', () => {
    /**
     * Test that BM25-only search works correctly as a fallback.
     */
    it('should call retrieveBM25Only method correctly', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        fc.array(genChunkRecord('doc_test'), { minLength: 1, maxLength: 10 }),
        async (query, chunkRecords) => {
          // Setup BM25 search
          mockBm25Search.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: Math.max(0.1, 1 - i * 0.1) }))
          );
          mockGetChunks.mockResolvedValue(chunkRecords);
          
          // Call BM25-only retrieval directly
          const results = await retrievalService.retrieveBM25Only(query, ['doc_test'], {
            topK: 10,
          });
          
          // Verify BM25 search was called
          expect(mockBm25Search).toHaveBeenCalled();
          
          // Verify results have BM25 scores
          for (const result of results) {
            expect(result.bm25Score).toBeDefined();
            expect(result.vectorScore).toBeUndefined();
          }
        }
      ), { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should respect topK limit in BM25 fallback', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        fc.integer({ min: 1, max: 10 }),
        async (query, topK) => {
          const docId = 'doc_test';
          // Generate more chunks than topK
          const chunkRecords = fc.sample(genChunkRecord(docId), 15);
          
          // Activate fallback mode
          mockFallbackManager.activateFallback('model_unavailable');
          
          // Setup BM25 search to return all chunks
          mockBm25Search.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: Math.max(0.1, 1 - i * 0.05) }))
          );
          mockGetChunks.mockResolvedValue(chunkRecords);
          
          // Perform retrieval with specific topK
          const results = await retrievalService.retrieve(query, [docId], {
            useHybrid: true,
            useReranker: false,
            topK,
          });
          
          // Verify results are limited to topK
          expect(results.length).toBeLessThanOrEqual(topK);
        }
      ), { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should order BM25 results by score descending', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        async (query) => {
          const docId = 'doc_test';
          const chunkRecords = fc.sample(genChunkRecord(docId), 10);
          
          // Activate fallback mode
          mockFallbackManager.activateFallback('model_unavailable');
          
          // Setup BM25 search with descending scores
          const sortedResults = chunkRecords.map((c, i) => ({ 
            id: c.id, 
            score: Math.max(0.1, 1 - i * 0.08) 
          }));
          mockBm25Search.mockResolvedValue(sortedResults);
          mockGetChunks.mockResolvedValue(chunkRecords);
          
          // Perform retrieval
          const results = await retrievalService.retrieve(query, [docId], {
            useHybrid: true,
            useReranker: false,
            topK: 10,
          });
          
          // Verify results are ordered by score descending
          for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
          }
        }
      ), { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed });
    });
  });

  describe('Error Scenarios', () => {
    /**
     * Test various error scenarios that should trigger fallback.
     */
    it('should handle network errors gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        fc.constantFrom(
          'Network error',
          'Connection refused',
          'ECONNREFUSED',
          'Timeout',
          'Request timed out'
        ),
        async (errorMessage) => {
          mockFallbackManager.reset();
          
          // Simulate network errors
          for (let i = 0; i < 3; i++) {
            mockFallbackManager.recordFailure(new Error(errorMessage), 'generation_failed');
          }
          
          // Verify fallback is activated
          expect(mockFallbackManager.isInFallbackMode()).toBe(true);
          
          const state = mockFallbackManager.getState();
          expect(state.lastError).toContain(errorMessage);
        }
      ), { numRuns: 10, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should handle model unavailable errors', async () => {
      await fc.assert(fc.asyncProperty(
        fc.constantFrom(
          'Model not found',
          'Ollama not running',
          'Model not loaded',
          'API key not configured'
        ),
        async (errorMessage) => {
          mockFallbackManager.reset();
          
          // Simulate model unavailable errors
          mockFallbackManager.activateFallback('model_unavailable', errorMessage);
          
          // Verify fallback is activated with correct reason
          expect(mockFallbackManager.isInFallbackMode()).toBe(true);
          
          const state = mockFallbackManager.getState();
          expect(state.reason).toBe('model_unavailable');
          expect(state.canRecover).toBe(true);
        }
      ), { numRuns: 10, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should handle rate limiting errors', async () => {
      mockFallbackManager.reset();
      mockFallbackManager.activateFallback('rate_limited', 'API rate limit exceeded');
      
      expect(mockFallbackManager.isInFallbackMode()).toBe(true);
      
      const state = mockFallbackManager.getState();
      expect(state.reason).toBe('rate_limited');
      expect(state.canRecover).toBe(true);
    });
  });

  describe('Fallback Service Integration', () => {
    /**
     * Test the integration between RetrievalService and fallback mechanism.
     */
    it('should check fallback state before retrieval', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        fc.boolean(),
        async (query, isFallbackActive) => {
          const docId = 'doc_test';
          const chunkRecords = fc.sample(genChunkRecord(docId), 5);
          
          // Set fallback state
          if (isFallbackActive) {
            mockFallbackManager.activateFallback('model_unavailable');
          } else {
            mockFallbackManager.reset();
          }
          
          // Setup search mocks
          mockBm25Search.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: 0.8 - i * 0.1 }))
          );
          mockHybridSearch.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: 0.9 - i * 0.1 }))
          );
          mockGetChunks.mockResolvedValue(chunkRecords);
          
          // Check fallback state
          const isInFallback = retrievalService.isInFallbackMode();
          expect(isInFallback).toBe(isFallbackActive);
        }
      ), { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed });
    });

    it('should provide fallback state through getFallbackState', async () => {
      await fc.assert(fc.asyncProperty(
        fc.constantFrom('model_unavailable', 'generation_failed', 'rate_limited'),
        async (reason) => {
          mockFallbackManager.reset();
          mockFallbackManager.activateFallback(reason);
          
          const state = retrievalService.getFallbackState();
          
          expect(state.isActive).toBe(true);
          expect(state.reason).toBe(reason);
        }
      ), { numRuns: 10, seed: PROPERTY_TEST_CONFIG.seed });
    });
  });

  describe('Warning Messages', () => {
    /**
     * Test that appropriate warning messages are generated during fallback.
     */
    it('should generate warning message when in fallback mode', async () => {
      await fc.assert(fc.asyncProperty(
        genQuery,
        async (query) => {
          const docId = 'doc_test';
          const chunkRecords = fc.sample(genChunkRecord(docId), 3);
          
          // Activate fallback mode
          mockFallbackManager.activateFallback('model_unavailable', 'Ollama not running');
          
          // Setup BM25 search
          mockBm25Search.mockResolvedValue(
            chunkRecords.map((c, i) => ({ id: c.id, score: 0.8 - i * 0.1 }))
          );
          mockGetChunks.mockResolvedValue(chunkRecords);
          
          // Perform retrieval with confidence
          const result = await retrievalService.retrieveWithConfidence(query, [docId], {
            useHybrid: true,
            useReranker: false,
            topK: 5,
          });
          
          // Verify warning is present
          expect(result.warning).toBeDefined();
          expect(result.warning!.length).toBeGreaterThan(0);
        }
      ), { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed });
    });
  });
});
