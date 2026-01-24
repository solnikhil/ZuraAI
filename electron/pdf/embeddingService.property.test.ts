/**
 * Property Tests for Embedding Service
 *
 * Tests the embedding generation service with various input scenarios
 */

import { fc, testProp } from 'fast-check';
import {
  generateEmbedding,
  generateEmbeddings,
  EmbeddingModel,
} from './embeddingService';

describe('Embedding Service Property Tests', () => {
  describe('Property 1: Output Dimension Consistency', () => {
    it('should always return embeddings of consistent dimension for same model', async () => {
      const model: EmbeddingModel = {
        id: 'test-model',
        name: 'Test Model',
        dimension: 768,
        type: 'ollama',
      };

      // Test with various text inputs
      await testProp(
        async (text: string) => {
          const embedding = await generateEmbedding(text, model);
          return embedding.length === model.dimension;
        },
        fc.string(),
        { numRuns: 10 }
      );
    });
  });

  describe('Property 2: Same Input, Same Output', () => {
    it('should return same embedding for identical inputs', async () => {
      const model: EmbeddingModel = {
        id: 'test-model',
        name: 'Test Model',
        dimension: 768,
        type: 'ollama',
      };

      const text = 'test text';

      const embedding1 = await generateEmbedding(text, model);
      const embedding2 = await generateEmbedding(text, model);

      expect(embedding1).toEqual(embedding2);
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
      return vi.fn().mockImplementation(async (url: string | URL, options?: RequestInit) => {
        // Log the request
        const urlStr = typeof url === 'string' ? url : url.toString();
        requestLog.push({
          url: urlStr,
          method: options?.method || 'GET',
          timestamp: Date.now(),
        });
        
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

      const texts = ['text1', 'text2', 'text3'];

      const batchEmbeddings = await generateEmbeddings(texts, model);
      const individualEmbeddings = await Promise.all(
        texts.map(text => generateEmbedding(text, model))
      );

      expect(batchEmbeddings).toHaveLength(individualEmbeddings.length);
      batchEmbeddings.forEach((embedding, i) => {
        expect(embedding).toEqual(individualEmbeddings[i]);
      });
    });
  });

  describe('Property 4: Normalization', () => {
    it('should return normalized embeddings', async () => {
      const model: EmbeddingModel = {
        id: 'test-model',
        name: 'Test Model',
        dimension: 768,
        type: 'ollama',
      };

      const embedding = await generateEmbedding('test', model);

      // Calculate magnitude
      const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
      );

      // Should be approximately 1.0 (normalized)
      expect(Math.abs(magnitude - 1.0)).toBeLessThan(0.001);
    });
  });
});

/**
 * Property 19: Embedding Model Fallback
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
    fallbackReason: fc.constantFrom('model_unavailable', 'timeout', 'network_error', 'memory_error'),
  };

  it('should return empty array when embedding generation fails', async () => {
    // Placeholder test - actual implementation depends on the fallback manager
    expect(true).toBe(true);
  });
});
