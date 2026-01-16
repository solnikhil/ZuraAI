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
 * **Property 21: Local Processing Guarantee**
 * For any PDF processing operation with local embedding model configured, 
 * no external API calls SHALL be made except for AI chat completion requests.
 * When using local embedding models (Ollama), all processing must happen locally.
 * No external network calls should be made for embedding generation.
 * 
 * **Validates: Requirements 20.1, 21.4**
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

  describe('Property 21: Local Processing Guarantee', () => {
    /**
     * **Property 21: Local Processing Guarantee**
     * 
     * For any PDF processing operation with local embedding model configured, 
     * no external API calls SHALL be made except for AI chat completion requests.
     * When using local embedding models (Ollama), all processing must happen locally.
     * No external network calls should be made for embedding generation.
     * 
     * **Validates: Requirements 20.1, 21.4**
     */

    /**
     * Track all network requests made during embedding operations
     */
    interface NetworkRequest {
      url: string;
      method: string;
      timestamp: number;
    }

    /**
     * External API domains that should NOT be called when using local models
     */
    const EXTERNAL_API_DOMAINS = [
      'api.openai.com',
      'api.anthropic.com',
      'api.cohere.ai',
      'api.voyageai.com',
      'generativelanguage.googleapis.com',
      'api.together.xyz',
      'api.mistral.ai',
      'api.groq.com',
    ];

    /**
     * Local Ollama domains that ARE allowed for local processing
     */
    const LOCAL_OLLAMA_DOMAINS = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
    ];

    /**
     * Check if a URL is an external API call (not local)
     */
    function isExternalApiCall(url: string): boolean {
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        
        // Check if it's a known external API
        if (EXTERNAL_API_DOMAINS.some(domain => hostname.includes(domain))) {
          return true;
        }
        
        // Check if it's NOT a local address
        const isLocal = LOCAL_OLLAMA_DOMAINS.some(local => 
          hostname === local || hostname.endsWith(`.${local}`)
        );
        
        // If it's not local and not a known external API, 
        // check if it looks like an external service
        if (!isLocal) {
          // Allow localhost variants and private IPs
          const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname);
          const isLocalhost = hostname === 'localhost' || hostname.startsWith('localhost:');
          const isLoopback = hostname.startsWith('127.');
          
          return !isPrivateIP && !isLocalhost && !isLoopback;
        }
        
        return false;
      } catch {
        // If URL parsing fails, assume it's not external
        return false;
      }
    }

    /**
     * Create a mock fetch that tracks all requests and validates local processing
     */
    function createLocalProcessingMockFetch(
      dimensions: number,
      requestLog: NetworkRequest[]
    ): typeof fetch {
      return vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        // Log the request
        requestLog.push({
          url: typeof url === 'string' ? url : url.toString(),
          method: options?.method || 'GET',
          timestamp: Date.now(),
        });

        // Parse the URL
        const urlStr = typeof url === 'string' ? url : url.toString();
        
        // Handle Ollama endpoints (local)
        if (urlStr.includes('/api/tags')) {
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
        
        if (urlStr.includes('/api/embeddings')) {
          const embedding = new Array(dimensions).fill(0).map(() => Math.random() * 2 - 1);
          return {
            ok: true,
            json: async () => ({ embedding }),
          };
        }
        
        // If we reach here with an external API call, it's a violation
        if (isExternalApiCall(urlStr)) {
          throw new Error(`Local processing violation: External API call detected to ${urlStr}`);
        }
        
        return { ok: false, status: 404 };
      });
    }

    it('should only make local Ollama calls when using local-nomic model', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.textContent,
          async (text) => {
            const requestLog: NetworkRequest[] = [];
            const expectedDimensions = 768; // nomic-embed-text dimensions
            
            global.fetch = createLocalProcessingMockFetch(expectedDimensions, requestLog);
            
            const service = new EmbeddingService('local-nomic');
            await service.generateEmbedding(text);
            
            // Verify all requests were to local Ollama
            for (const request of requestLog) {
              expect(isExternalApiCall(request.url)).toBe(false);
              
              // Verify it's an Ollama endpoint
              expect(
                request.url.includes('localhost') || 
                request.url.includes('127.0.0.1')
              ).toBe(true);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should only make local Ollama calls when using local-mxbai model', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.textContent,
          async (text) => {
            const requestLog: NetworkRequest[] = [];
            const expectedDimensions = 1024; // mxbai-embed-large dimensions
            
            global.fetch = createLocalProcessingMockFetch(expectedDimensions, requestLog);
            
            const service = new EmbeddingService('local-mxbai');
            await service.generateEmbedding(text);
            
            // Verify all requests were to local Ollama
            for (const request of requestLog) {
              expect(isExternalApiCall(request.url)).toBe(false);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should only make local Ollama calls when using local-all-minilm model', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.textContent,
          async (text) => {
            const requestLog: NetworkRequest[] = [];
            const expectedDimensions = 384; // all-minilm dimensions
            
            global.fetch = createLocalProcessingMockFetch(expectedDimensions, requestLog);
            
            const service = new EmbeddingService('local-all-minilm');
            await service.generateEmbedding(text);
            
            // Verify all requests were to local Ollama
            for (const request of requestLog) {
              expect(isExternalApiCall(request.url)).toBe(false);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should make no external API calls for batch embeddings with local models', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.localModelId,
          generators.textArray(2, 10),
          async (modelId, texts) => {
            const requestLog: NetworkRequest[] = [];
            const expectedDimensions = getExpectedDimensions(modelId);
            
            global.fetch = createLocalProcessingMockFetch(expectedDimensions, requestLog);
            
            const service = new EmbeddingService(modelId);
            await service.generateEmbeddings(texts);
            
            // Verify NO external API calls were made
            const externalCalls = requestLog.filter(r => isExternalApiCall(r.url));
            expect(externalCalls).toHaveLength(0);
            
            // Verify all calls were to local Ollama
            for (const request of requestLog) {
              expect(
                request.url.includes('localhost') || 
                request.url.includes('127.0.0.1')
              ).toBe(true);
            }
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should not call OpenAI API when local model is configured', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.localModelId,
          generators.textContent,
          async (modelId, text) => {
            const requestLog: NetworkRequest[] = [];
            const expectedDimensions = getExpectedDimensions(modelId);
            
            global.fetch = createLocalProcessingMockFetch(expectedDimensions, requestLog);
            
            const service = new EmbeddingService(modelId);
            await service.generateEmbedding(text);
            
            // Verify NO OpenAI calls were made
            const openaiCalls = requestLog.filter(r => 
              r.url.includes('openai.com')
            );
            expect(openaiCalls).toHaveLength(0);
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should not call any cloud embedding APIs when local model is configured', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.localModelId,
          generators.textArray(1, 5),
          async (modelId, texts) => {
            const requestLog: NetworkRequest[] = [];
            const expectedDimensions = getExpectedDimensions(modelId);
            
            global.fetch = createLocalProcessingMockFetch(expectedDimensions, requestLog);
            
            const service = new EmbeddingService(modelId);
            await service.generateEmbeddings(texts);
            
            // Verify NO cloud API calls were made
            for (const domain of EXTERNAL_API_DOMAINS) {
              const cloudCalls = requestLog.filter(r => r.url.includes(domain));
              expect(cloudCalls).toHaveLength(0);
            }
          }
        ),
        { numRuns: 30, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should use correct Ollama endpoint for local embeddings', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.localModelId,
          generators.textContent,
          async (modelId, text) => {
            const requestLog: NetworkRequest[] = [];
            const expectedDimensions = getExpectedDimensions(modelId);
            
            global.fetch = createLocalProcessingMockFetch(expectedDimensions, requestLog);
            
            const service = new EmbeddingService(modelId);
            await service.generateEmbedding(text);
            
            // Find the embedding request
            const embeddingRequests = requestLog.filter(r => 
              r.url.includes('/api/embeddings')
            );
            
            // Should have made at least one embedding request
            expect(embeddingRequests.length).toBeGreaterThanOrEqual(1);
            
            // All embedding requests should be to local Ollama
            for (const request of embeddingRequests) {
              expect(request.url).toMatch(/localhost|127\.0\.0\.1/);
              expect(request.method).toBe('POST');
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should respect custom Ollama URL for local processing', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.localModelId,
          generators.textContent,
          fc.integer({ min: 8000, max: 9999 }),
          async (modelId, text, port) => {
            const requestLog: NetworkRequest[] = [];
            const expectedDimensions = getExpectedDimensions(modelId);
            const customUrl = `http://localhost:${port}`;
            
            global.fetch = createLocalProcessingMockFetch(expectedDimensions, requestLog);
            
            const service = new EmbeddingService(modelId, customUrl);
            await service.generateEmbedding(text);
            
            // Verify requests went to the custom URL
            const embeddingRequests = requestLog.filter(r => 
              r.url.includes('/api/embeddings')
            );
            
            for (const request of embeddingRequests) {
              expect(request.url).toContain(`localhost:${port}`);
            }
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should identify local models correctly by provider', () => {
      fc.assert(
        fc.property(
          generators.localModelId,
          (modelId) => {
            const service = new EmbeddingService(modelId);
            const modelInfo = service.getModelInfo();
            
            // Local models should have provider 'local'
            expect(modelInfo.provider).toBe('local');
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should distinguish between local and API-based models', () => {
      fc.assert(
        fc.property(
          generators.anyModelId,
          (modelId) => {
            const service = new EmbeddingService(modelId);
            const modelInfo = service.getModelInfo();
            
            // Check provider is correctly set
            if (modelId.startsWith('local-')) {
              expect(modelInfo.provider).toBe('local');
            } else if (modelId.startsWith('openai-')) {
              expect(modelInfo.provider).toBe('openai');
            }
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should not leak data to external services during local embedding generation', async () => {
      await fc.assert(
        fc.asyncProperty(
          generators.localModelId,
          // Generate sensitive-looking text to ensure it's not sent externally
          fc.record({
            sensitiveData: fc.string({ minLength: 10, maxLength: 100 }),
            apiKey: fc.stringMatching(/sk-[a-zA-Z0-9]{20}/),
            email: fc.emailAddress(),
          }),
          async (modelId, sensitiveContent) => {
            const requestLog: NetworkRequest[] = [];
            const expectedDimensions = getExpectedDimensions(modelId);
            
            global.fetch = createLocalProcessingMockFetch(expectedDimensions, requestLog);
            
            const service = new EmbeddingService(modelId);
            const textToEmbed = `${sensitiveContent.sensitiveData} ${sensitiveContent.apiKey} ${sensitiveContent.email}`;
            
            await service.generateEmbedding(textToEmbed);
            
            // Verify NO external calls were made with sensitive data
            const externalCalls = requestLog.filter(r => isExternalApiCall(r.url));
            expect(externalCalls).toHaveLength(0);
          }
        ),
        { numRuns: 20, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should maintain local processing guarantee across model switches', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(generators.localModelId, { minLength: 2, maxLength: 4 }),
          generators.textContent,
          async (modelIds, text) => {
            const requestLog: NetworkRequest[] = [];
            
            // Use max dimensions to handle any model
            global.fetch = createLocalProcessingMockFetch(1024, requestLog);
            
            const service = new EmbeddingService(modelIds[0]);
            
            // Switch between local models and generate embeddings
            for (const modelId of modelIds) {
              // Clear log for this iteration
              requestLog.length = 0;
              
              // Note: setModel requires model availability check, so we test with constructor
              const newService = new EmbeddingService(modelId);
              await newService.generateEmbedding(text);
              
              // Verify all requests were local
              const externalCalls = requestLog.filter(r => isExternalApiCall(r.url));
              expect(externalCalls).toHaveLength(0);
            }
          }
        ),
        { numRuns: 15, seed: PROPERTY_TEST_CONFIG.seed }
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


// =============================================================================
// Property 19: Embedding Model Fallback
// =============================================================================

/**
 * Property 19: Embedding Model Fallback
 * 
 * When embedding model is unavailable, the system SHALL fall back to BM25-only search.
 * The fallback should be transparent to the user (results still returned).
 * Recovery should be attempted automatically.
 * 
 * **Validates: Requirements 18.2**
 * 
 * This property tests:
 * 1. When embedding generation fails, the system falls back to BM25-only search
 * 2. Fallback mode is activated after consecutive failures
 * 3. Recovery is attempted when embeddings become available
 * 4. Users are notified when fallback mode is active
 * 5. Search results are still returned (via BM25) even when embeddings fail
 */
describe('Property 19: Embedding Model Fallback', () => {
  /**
   * Import the fallback manager and related functions
   */
  const {
    EmbeddingFallbackManager,
    embeddingFallbackManager,
    generateEmbeddingWithFallback,
    generateEmbeddingsWithFallback,
    checkEmbeddingAvailability,
  } = require('./embeddingService');

  /**
   * Generators for fallback testing
   */
  const fallbackGenerators = {
    /**
     * Generate a valid fallback reason
     */
    fallbackR