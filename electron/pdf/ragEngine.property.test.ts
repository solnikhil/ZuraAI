/**
 * Property-Based Tests for RAG Engine
 * 
 * **Property 23: Conversation Context Window**
 * **Validates: Requirements 22.1, 22.4**
 * 
 * **Property 24: View Context Resolution**
 * **Validates: Requirements 22.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import type { RetrievalResult, Chunk, ChunkMetadata, BoundingBox } from '../../src/types/pdf';
import type { ConversationContext, ContextBuildOptions } from './types';

// =============================================================================
// Mock Electron and dependencies BEFORE importing RAGEngine
// =============================================================================

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test' },
}));

vi.mock('../secureStorage', () => ({
  getSecureValue: vi.fn().mockReturnValue(null),
}));

vi.mock('./pdfParser', () => ({
  pdfParserService: {
    loadDocument: vi.fn().mockResolvedValue({ id: 'doc_test', pageCount: 10 }),
    extractAllText: vi.fn().mockResolvedValue([]),
    getPage: vi.fn().mockResolvedValue({ pageNumber: 1, textContent: [] }),
    isDocumentLoaded: vi.fn().mockReturnValue(true),
    loadedDocuments: new Map(),
  },
}));

vi.mock('./chunkManager', () => ({
  chunkManager: {
    createChunks: vi.fn().mockReturnValue([]),
    getChunk: vi.fn().mockReturnValue(undefined),
    getChunksForDocument: vi.fn().mockReturnValue([]),
    deleteChunksForDocument: vi.fn(),
    countTokens: vi.fn().mockImplementation((text: string) => Math.ceil(text.split(/\s+/).length * 1.3)),
  },
}));

vi.mock('./embeddingService', () => ({
  embeddingService: {
    generateEmbedding: vi.fn().mockResolvedValue(new Array(768).fill(0.5)),
    generateEmbeddings: vi.fn().mockResolvedValue([]),
    getModelInfo: vi.fn().mockReturnValue({ id: 'test', name: 'Test', provider: 'local', dimensions: 768, maxTokens: 8192 }),
    setModel: vi.fn().mockResolvedValue(undefined),
    isModelAvailable: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('./vectorStore', () => ({
  vectorStore: {
    initialize: vi.fn().mockResolvedValue(undefined),
    addDocument: vi.fn().mockResolvedValue(undefined),
    addChunks: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockResolvedValue([]),
    bm25Search: vi.fn().mockResolvedValue([]),
    hybridSearch: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn().mockResolvedValue(null),
    getChunk: vi.fn().mockResolvedValue(null),
    getChunks: vi.fn().mockResolvedValue([]),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    getCollectionStats: vi.fn().mockResolvedValue({ documentCount: 0, chunkCount: 0, sizeBytes: 0 }),
  },
}));

vi.mock('./retrievalService', () => ({
  retrievalService: {
    retrieve: vi.fn().mockResolvedValue([]),
    rerank: vi.fn().mockImplementation((_, results) => Promise.resolve(results)),
    processQuery: vi.fn().mockImplementation((query) => Promise.resolve({
      original: query,
      expanded: query,
      keywords: [],
      hasViewReference: false,
    })),
    retrieveWithConfidence: vi.fn().mockResolvedValue({
      results: [],
      confidence: 0.8,
      isLowConfidence: false,
    }),
  },
}));

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

const genMessage = fc.record({
  role: fc.constantFrom('user', 'assistant') as fc.Arbitrary<'user' | 'assistant'>,
  content: fc.string({ minLength: 5, maxLength: 200 }),
});

const genConversationContext = fc.record({
  messages: fc.array(genMessage, { minLength: 0, maxLength: 10 }),
  documentIds: fc.array(
    fc.string({ minLength: 8, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `doc_${s}`),
    { minLength: 1, maxLength: 3 }
  ),
  viewState: fc.option(fc.record({
    currentPage: fc.integer({ min: 1, max: 100 }),
    visibleText: fc.string({ minLength: 0, maxLength: 500 }),
  }), { nil: undefined }),
}) as fc.Arbitrary<ConversationContext>;

// =============================================================================
// Import after mocks are set up
// =============================================================================

import { RAGEngine } from './ragEngine';


// =============================================================================
// Property Tests
// =============================================================================

describe('RAG Engine Property Tests', () => {
  let ragEngine: RAGEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    ragEngine = new RAGEngine();
  });

  describe('Property 23: Conversation Context Window', () => {
    /**
     * **Property 23: Conversation Context Window**
     * 
     * For any follow-up query in a conversation, the RAG_Engine SHALL include 
     * context from the previous N messages (where N is the configured window size) 
     * to resolve references and improve retrieval.
     * 
     * **Validates: Requirements 22.1, 22.4**
     */
    it('should expand follow-up queries with conversation context', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(genMessage, { minLength: 1, maxLength: 5 }),
        fc.constantFrom(
          'What about it?',
          'And then?',
          'Tell me more',
          'Can you explain?',
          'Why is that?'
        ),
        async (messages, followUpQuery) => {
          const context: ConversationContext = {
            messages,
            documentIds: ['doc_test'],
          };

          const rewritten = ragEngine.rewriteQuery(followUpQuery, context);
          
          // Follow-up queries should be expanded with context
          // The rewritten query should be at least as long as the original
          expect(rewritten.length).toBeGreaterThanOrEqual(followUpQuery.length);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should resolve pronouns using conversation history', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(genMessage, { minLength: 2, maxLength: 5 }),
        fc.constantFrom(
          'What is it?',
          'Tell me about this',
          'Why did they do that?',
          'How does it work?'
        ),
        async (messages, pronounQuery) => {
          const context: ConversationContext = {
            messages,
            documentIds: ['doc_test'],
          };

          const rewritten = ragEngine.rewriteQuery(pronounQuery, context);
          
          // Queries with pronouns should be expanded
          expect(typeof rewritten).toBe('string');
          expect(rewritten.length).toBeGreaterThan(0);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should not modify queries without pronouns or follow-up indicators', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(genMessage, { minLength: 0, maxLength: 3 }),
        fc.constantFrom(
          'What is machine learning?',
          'Explain neural networks',
          'Define artificial intelligence',
          'List the main algorithms'
        ),
        async (messages, standaloneQuery) => {
          const context: ConversationContext = {
            messages,
            documentIds: ['doc_test'],
          };

          const rewritten = ragEngine.rewriteQuery(standaloneQuery, context);
          
          // Standalone queries should remain mostly unchanged
          // (may have minor expansions but should contain original)
          expect(rewritten).toContain(standaloneQuery.split(' ')[0]);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should handle empty conversation context gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 100 }),
        async (query) => {
          const context: ConversationContext = {
            messages: [],
            documentIds: ['doc_test'],
          };

          const rewritten = ragEngine.rewriteQuery(query, context);
          
          // With no context, query should be returned as-is
          expect(rewritten).toBe(query);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should handle undefined context gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 100 }),
        async (query) => {
          const rewritten = ragEngine.rewriteQuery(query, undefined);
          
          // Without context, query should be returned as-is
          expect(rewritten).toBe(query);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should limit context window to configured maximum', async () => {
      // Create a context with many messages
      const manyMessages = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i} about topic ${i % 5}`,
      }));

      const context: ConversationContext = {
        messages: manyMessages,
        documentIds: ['doc_test'],
      };

      const rewritten = ragEngine.rewriteQuery('What about it?', context);
      
      // Should still produce a reasonable query (not infinitely long)
      expect(rewritten.length).toBeLessThan(1000);
    });
  });


  describe('Property 24: View Context Resolution', () => {
    /**
     * **Property 24: View Context Resolution**
     * 
     * For any query containing view-relative references ("this page", "the table above"), 
     * the system SHALL resolve these references using the current PDF viewer state 
     * (current page, visible elements).
     * 
     * **Validates: Requirements 22.5**
     */
    it('should resolve "this page" references to current page number', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        async (currentPage, visibleText) => {
          const context: ConversationContext = {
            messages: [],
            documentIds: ['doc_test'],
            viewState: {
              currentPage,
              visibleText,
            },
          };

          const query = 'What is on this page?';
          const rewritten = ragEngine.rewriteQuery(query, context);
          
          // Should replace "this page" with actual page number
          expect(rewritten).toContain(`page ${currentPage}`);
          expect(rewritten).not.toContain('this page');
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should resolve "current page" references', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (currentPage) => {
          const context: ConversationContext = {
            messages: [],
            documentIds: ['doc_test'],
            viewState: {
              currentPage,
              visibleText: '',
            },
          };

          const query = 'Summarize the current page';
          const rewritten = ragEngine.rewriteQuery(query, context);
          
          // Should replace "current page" with actual page number
          expect(rewritten).toContain(`page ${currentPage}`);
          expect(rewritten.toLowerCase()).not.toContain('current page');
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should handle queries without view references unchanged', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom(
          'What is machine learning?',
          'Explain the introduction',
          'Summarize chapter 3'
        ),
        async (currentPage, query) => {
          const context: ConversationContext = {
            messages: [],
            documentIds: ['doc_test'],
            viewState: {
              currentPage,
              visibleText: 'Some visible text',
            },
          };

          const rewritten = ragEngine.rewriteQuery(query, context);
          
          // Queries without view references should not be modified
          expect(rewritten).toBe(query);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should handle missing view state gracefully', async () => {
      const context: ConversationContext = {
        messages: [],
        documentIds: ['doc_test'],
        viewState: undefined,
      };

      const query = 'What is on this page?';
      const rewritten = ragEngine.rewriteQuery(query, context);
      
      // Without view state, query should remain unchanged
      expect(rewritten).toBe(query);
    });

    it('should detect various view-relative patterns', async () => {
      const viewRefQueries = [
        'What is on this page?',
        'Explain the table above',
        'What does the figure above show?',
        'Summarize the current page',
        'What is the image above about?',
      ];

      for (const query of viewRefQueries) {
        const context: ConversationContext = {
          messages: [],
          documentIds: ['doc_test'],
          viewState: {
            currentPage: 5,
            visibleText: 'Test content',
          },
        };

        const rewritten = ragEngine.rewriteQuery(query, context);
        
        // View-relative queries should be modified when view state is available
        // At minimum, page references should be resolved
        if (query.includes('page')) {
          expect(rewritten).toContain('page 5');
        }
      }
    });
  });


  describe('Context Building', () => {
    it('should respect maxSources limit', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.array(genRetrievalResult, { minLength: 1, maxLength: 20 }),
        async (maxSources, results) => {
          const options: ContextBuildOptions = {
            maxTokens: 10000,
            maxSources,
            includeCitationMarkers: true,
            format: 'markdown',
          };

          const built = ragEngine.buildContext(results, options);
          
          // Should not include more sources than maxSources
          expect(built.includedSources.length).toBeLessThanOrEqual(maxSources);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should respect maxTokens limit', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 100, max: 2000 }),
        fc.array(genRetrievalResult, { minLength: 1, maxLength: 10 }),
        async (maxTokens, results) => {
          const options: ContextBuildOptions = {
            maxTokens,
            maxSources: 100,
            includeCitationMarkers: true,
            format: 'markdown',
          };

          const built = ragEngine.buildContext(results, options);
          
          // Token count should not exceed maxTokens
          expect(built.tokenCount).toBeLessThanOrEqual(maxTokens);
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should include citation markers when enabled', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(genRetrievalResult, { minLength: 1, maxLength: 5 }),
        async (results) => {
          const options: ContextBuildOptions = {
            maxTokens: 10000,
            maxSources: 10,
            includeCitationMarkers: true,
            format: 'markdown',
          };

          const built = ragEngine.buildContext(results, options);
          
          if (built.includedSources.length > 0) {
            // Should have citation markers in the context string
            expect(built.contextString).toContain('[[cite:');
            
            // Citation map should have entries
            expect(built.citationMap.size).toBeGreaterThan(0);
          }
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should not include citation markers when disabled', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(genRetrievalResult, { minLength: 1, maxLength: 5 }),
        async (results) => {
          const options: ContextBuildOptions = {
            maxTokens: 10000,
            maxSources: 10,
            includeCitationMarkers: false,
            format: 'markdown',
          };

          const built = ragEngine.buildContext(results, options);
          
          // Should not have citation markers
          expect(built.contextString).not.toContain('[[cite:');
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should sort results by score descending', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(genRetrievalResult, { minLength: 2, maxLength: 10 }),
        async (results) => {
          const options: ContextBuildOptions = {
            maxTokens: 10000,
            maxSources: 100,
            includeCitationMarkers: true,
            format: 'markdown',
          };

          const built = ragEngine.buildContext(results, options);
          
          // Included sources should be sorted by score descending
          for (let i = 1; i < built.includedSources.length; i++) {
            expect(built.includedSources[i - 1].score).toBeGreaterThanOrEqual(
              built.includedSources[i].score
            );
          }
        }
      ), { numRuns: 30, seed: 12345 });
    });

    it('should handle empty results gracefully', () => {
      const options: ContextBuildOptions = {
        maxTokens: 10000,
        maxSources: 10,
        includeCitationMarkers: true,
        format: 'markdown',
      };

      const built = ragEngine.buildContext([], options);
      
      expect(built.contextString).toBe('');
      expect(built.includedSources).toEqual([]);
      expect(built.tokenCount).toBe(0);
      expect(built.citationMap.size).toBe(0);
    });

    it('should support different output formats', async () => {
      const results = fc.sample(genRetrievalResult, 3);
      
      const formats: Array<'plain' | 'markdown' | 'structured'> = ['plain', 'markdown', 'structured'];
      
      for (const format of formats) {
        const options: ContextBuildOptions = {
          maxTokens: 10000,
          maxSources: 10,
          includeCitationMarkers: true,
          format,
        };

        const built = ragEngine.buildContext(results, options);
        
        expect(typeof built.contextString).toBe('string');
        expect(built.contextString.length).toBeGreaterThan(0);
      }
    });
  });


  describe('Settings Management', () => {
    it('should allow updating settings', () => {
      ragEngine.updateSettings({ topK: 10, useHybridSearch: false });
      const settings = ragEngine.getSettings();
      
      expect(settings.topK).toBe(10);
      expect(settings.useHybridSearch).toBe(false);
    });

    it('should preserve unmodified settings', () => {
      const originalSettings = ragEngine.getSettings();
      ragEngine.updateSettings({ topK: 15 });
      const newSettings = ragEngine.getSettings();
      
      expect(newSettings.topK).toBe(15);
      expect(newSettings.chunkSize).toBe(originalSettings.chunkSize);
      expect(newSettings.embeddingModel).toBe(originalSettings.embeddingModel);
    });

    it('should return a copy of settings (not reference)', () => {
      const settings1 = ragEngine.getSettings();
      const settings2 = ragEngine.getSettings();
      
      settings1.topK = 999;
      
      expect(settings2.topK).not.toBe(999);
    });
  });


  describe('Index Status', () => {
    it('should return not indexed status for unknown documents', () => {
      const status = ragEngine.getIndexStatus('unknown_doc');
      
      expect(status.isIndexed).toBe(false);
      expect(status.isIndexing).toBe(false);
      expect(status.chunkCount).toBe(0);
    });
  });
});
