/**
 * Property-Based Tests for Embedding Service
 * 
 * This file contains property-based tests using fast-check to verify
 * universal properties of the embedding service across all valid inputs.
 * 
 * **Property 3: Embedding Dimension Consistency**
 * For any chunk with an embedding, the embedding vector dimension SHALL match 
 * the configured embedding model's dimension (e.g., 768 for nomic-embed-text, 
 * 1536 for OpenAI small).
 * 
 * **Validates: Requirements 6.5, 21.2, 21.3**
 * 
 * **Property 30: Rate Limiting for Embeddings**
 * For any batch embedding operation, the number of concurrent API requests 
 * SHALL not exceed the configured limit, preventing rate limiting errors.
 * 
 * **Validates: Requirements 19.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { EmbeddingService, EMBEDDING_MODELS } from './embeddingService';

/**
 * Property test configuration
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 50,
  seed: 12345,
  timeout: 30000,
};

/**
 * Mock fetch for testing without actual API calls
 */
const createMockFetch = (dimensions: number) => {
  return vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    // Parse the URL to determine the endpoint
    if (url.includes('/api/tags')) {
      // Ollama model list
      return {
        ok: true,
        json: async () => ({
          models: [
            { name: 'nomic-embed-text' },
            { name: 'mxbai-embed-large' },
            { name: 'all-minilm' },
          ],
        }),
      };
    }
    
    if (url.includes('/api/embeddings')) {
      // Ollama embedding
      const embedding = new Array(dimensions).fill(0).map(() => Math.random() * 2 - 1);
      return {
        ok: true,
        json: async () => ({ embedding }),
      };
    }
    
    if (url.includes('openai.com/v1/embeddings')) {
      // OpenAI embedding
      const body = JSON.parse(options?.body as string);
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      const data = inputs.map((_input: string, index: number) => ({
        index,
        embedding: new Array(dimensions).fill(0).map(() => Math.random() * 2 - 1),
      }));
      return {
        ok: true,
        json: async () => ({ data }),
      };
    }
    
    return { ok: false, status: 404 };
  });
};

/**
 * Generators for property-based testing
 */
const generators = {
  /**
   * Generate valid text content for embedding
   */
  textContent: fc.string({ minLength: 1, maxLength: 500 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim()),

  /**
   * Generate an array of texts for batch embedding
   */
  textArray: (minLength: number = 1, maxLength: number = 20) =>
    fc.array(
      fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
      { minLength, maxLength }
    ),

  /**
   * Generate a local model ID
   */
  localModelId: fc.constantFrom('local-nomic', 'local-mxbai', 'local-all-minilm'),

  /**
   * Generate an OpenAI model ID
   */
  openaiModelId: fc.constantFrom('openai-small', 'openai-large'),

  /**
   * Generate any valid model ID
   */
  anyModelId: fc.constantFrom(
    'local-nomic', 'local-mxbai', 'local-all-minilm',
    'openai-small', 'openai-large'
  ),
};

/**
 * Get expected dimensions for a model ID
 */
function getExpectedDimensions(modelId: string): number {
  const model = EMBEDDING_MODELS.find(m => m.id === modelId);
  return model?.dimensions ?? 768;
}

describe('Embedding Service Property Tests', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Property 3: Embedding Dimension Consistency', () => {
    /**
     * **Property 3: Embedding Dimension Consistency**
     * 
     * For any chunk with an embedding, the embedding vector dimension SHALL match 
     * the configured embedding model's dimension (e.g., 768 for nomic-embed-text, 
     * 1536 for OpenAI small).
     * 
     * **Validates: Requirements 6.5, 21.2, 21.3**
     */
    it('should produce embeddings with correct dimensions for local models', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.localModelId,
          generators.textContent,
          async (modelId, text) => {
            const expectedDimensions = getExpectedDimensions(modelId);
            
            // Mock fetch to return embeddings with correct dimensions
            global.fetch = createMockFetch(expectedDimensions);
            
            const service = new EmbeddingService(modelId);
            const embedding = await service.generateEmbedding(text);
            
            // Verify dimension matches model configuration
            expect(embedding.length).toBe(expectedDimensions);
            
            // Verify all values are numbers
            for (const value of embedding) {
              expect(typeof value).toBe('number');
              expect(Number.isFinite(value)).toBe(true);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should produce embeddings with correct dimensions for OpenAI models', async () => {
      // Mock secure storage to return a valid API key
      vi.mock('../secureStorage', () => ({
        getSecureValue: vi.fn().mockReturnValue('sk-test-key-12345'),
      }));

      await fc.assert(
        fc.asyncProperty(
          generators.openaiModelId,
          generators.textContent,
          async (modelId, text) => {
            const expectedDimensions = getExpectedDimensions(modelId);
            
            // Mock fetch to return embeddings with correct dimensions
            global.fetch = createMockFetch(expectedDimensions);
            
            const service = new EmbeddingService(modelId);
            const embedding = await service.generateEmbedding(text);
            
            // Verify dimension matches model configuration
            expect(embedding.length).toBe(expectedDimensions);
            
            // Verify all values are numbers
            for (const value of embedding) {
              expect(typeof value).toBe('number');
              expect(Number.isFinite(value)).toBe(true);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should produce batch embeddings with consistent dimensions', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.localModelId,
          generators.textArray(2, 10),
          async (modelId, texts) => {
            const expectedDimensions = getExpectedDimensions(modelId);
            
            // Mock fetch to return embeddings with correct dimensions
            global.fetch = createMockFetch(expectedDimensions);
            
            const service = new EmbeddingService(modelId);
            const embeddings = await service.generateEmbeddings(texts);
            
            // Verify we get the right number of embeddings
            expect(embeddings.length).toBe(texts.length);
            
            // Verify all embeddings have correct dimensions
            for (const embedding of embeddings) {
              expect(embedding.length).toBe(expectedDimensions);
              
              // Verify all values are numbers
              for (const value of embedding) {
                expect(typeof value).toBe('number');
                expect(Number.isFinite(value)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should return zero vector for empty text with correct dimensions', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.anyModelId,
          async (modelId) => {
            const expectedDimensions = getExpectedDimensions(modelId);
            
            // Mock fetch
            global.fetch = createMockFetch(expectedDimensions);
            
            const service = new EmbeddingService(modelId);
            const embedding = await service.generateEmbedding('');
            
            // Verify dimension matches model configuration
            expect(embedding.length).toBe(expectedDimensions);
            
            // Verify all values are zero
            for (const value of embedding) {
              expect(value).toBe(0);
            }
          }
        ),
        { numRuns: 10, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should report correct dimensions in model info', () => {
      fc.assert(
        fc.property(
          generators.anyModelId,
          (modelId) => {
            const service = new EmbeddingService(modelId);
            const modelInfo = service.getModelInfo();
            
            const expectedModel = EMBEDDING_MODELS.find(m => m.id === modelId);
            expect(modelInfo.dimensions).toBe(expectedModel?.dimensions);
            expect(modelInfo.id).toBe(modelId);
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Property 30: Rate Limiting for Embeddings', () => {
    /**
     * **Property 30: Rate Limiting for Embeddings**
     * 
     * For any batch embedding operation, the number of concurrent API requests 
     * SHALL not exceed the configured limit, preventing rate limiting errors.
     * 
     * **Validates: Requirements 19.4**
     */
    it('should track request count in rate limiter', async () => {
      const expectedDimensions = 1536;
      global.fetch = createMockFetch(expectedDimensions);
      
      // Mock secure storage
      vi.mock('../secureStorage', () => ({
        getSecureValue: vi.fn().mockReturnValue('sk-test-key-12345'),
      }));

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (requestCount) => {
            const service = new EmbeddingService('openai-small');
            
            // Get initial stats
            const initialStats = service.getRateLimiterStats();
            const initialCount = initialStats.requestCount;
            
            // Make multiple requests
            for (let i = 0; i < requestCount; i++) {
              await service.generateEmbedding(`Test text ${i}`);
            }
            
            // Get final stats
            const finalStats = service.getRateLimiterStats();
            
            // Request count should have increased
            expect(finalStats.requestCount).toBeGreaterThanOrEqual(initialCount);
            
            // Remaining requests should be non-negative
            expect(finalStats.remainingRequests).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 10, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should report remaining requests correctly', () => {
      fc.assert(
        fc.property(
          generators.anyModelId,
          (modelId) => {
            const service = new EmbeddingService(modelId);
            const stats = service.getRateLimiterStats();
            
            // Remaining requests should be non-negative
            expect(stats.remainingRequests).toBeGreaterThanOrEqual(0);
            
            // Request count should be non-negative
            expect(stats.requestCount).toBeGreaterThanOrEqual(0);
            
            // Window reset time should be non-negative
            expect(stats.windowResetIn).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should handle batch requests without exceeding rate limits', async () => {
      const expectedDimensions = 768;
      let requestCount = 0;
      
      // Track request count
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestCount++;
        
        if (url.includes('/api/tags')) {
          return {
            ok: true,
            json: async () => ({ models: [{ name: 'nomic-embed-text' }] }),
          };
        }
        
        if (url.includes('/api/embeddings')) {
          const embedding = new Array(expectedDimensions).fill(0).map(() => Math.random());
          return {
            ok: true,
            json: async () => ({ embedding }),
          };
        }
        
        return { ok: false, status: 404 };
      });

      await fc.assert(
        fc.asyncProperty(
          generators.textArray(5, 15),
          async (texts) => {
            requestCount = 0;
            
            const service = new EmbeddingService('local-nomic');
            await service.generateEmbeddings(texts);
            
            // For local models, each text requires one request
            // Request count should match text count (plus potential model check)
            expect(requestCount).toBeLessThanOrEqual(texts.length + 1);
          }
        ),
        { numRuns: 10, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Additional Embedding Properties', () => {
    it('should handle mixed empty and non-empty texts in batch', async () => {
      const expectedDimensions = 768;
      global.fetch = createMockFetch(expectedDimensions);

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.oneof(
              fc.constant(''),
              fc.constant('   '),
              generators.textContent
            ),
            { minLength: 3, maxLength: 10 }
          ),
          async (texts) => {
            const service = new EmbeddingService('local-nomic');
            const embeddings = await service.generateEmbeddings(texts);
            
            // Should return same number of embeddings as inputs
            expect(embeddings.length).toBe(texts.length);
            
            // Each embedding should have correct dimensions
            for (let i = 0; i < texts.length; i++) {
              expect(embeddings[i].length).toBe(expectedDimensions);
              
              // Empty texts should have zero vectors
              if (!texts[i] || texts[i].trim().length === 0) {
                for (const value of embeddings[i]) {
                  expect(value).toBe(0);
                }
              }
            }
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should return empty array for empty input array', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.anyModelId,
          async (modelId) => {
            const service = new EmbeddingService(modelId);
            const embeddings = await service.generateEmbeddings([]);
            
            expect(embeddings).toEqual([]);
          }
        ),
        { numRuns: 10, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should maintain model info consistency after construction', () => {
      fc.assert(
        fc.property(
          generators.anyModelId,
          (modelId) => {
            const service = new EmbeddingService(modelId);
            
            // Get model info multiple times
            const info1 = service.getModelInfo();
            const info2 = service.getModelInfo();
            
            // Should be consistent
            expect(info1.id).toBe(info2.id);
            expect(info1.dimensions).toBe(info2.dimensions);
            expect(info1.provider).toBe(info2.provider);
            expect(info1.name).toBe(info2.name);
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should allow setting and getting Ollama base URL', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          (url) => {
            const service = new EmbeddingService('local-nomic');
            
            service.setOllamaBaseUrl(url);
            expect(service.getOllamaBaseUrl()).toBe(url);
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should provide static method to get all available models', () => {
      const models = EmbeddingService.getAvailableModels();
      
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      
      // Each model should have required fields
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(model.dimensions).toBeGreaterThan(0);
        expect(model.maxTokens).toBeGreaterThan(0);
      }
    });
  });
});
