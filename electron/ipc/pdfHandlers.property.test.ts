/**
 * Property-Based Tests for PDF Handlers - Feedback Persistence
 * 
 * **Property 17: Feedback Persistence**
 * 
 * For any user feedback action (thumbs up/down, wrong citation flag), 
 * the feedback SHALL be persisted locally with context (response ID, 
 * citation ID if applicable, timestamp) and SHALL be retrievable after 
 * application restart.
 * 
 * **Validates: Requirements 17.3, 17.4**
 * 
 * Requirements:
 * - 17.3: Store feedback with context locally
 * - 17.4: Persist feedback across sessions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import type { ResponseFeedback, CitationFeedback } from '../../src/types/pdf';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock electron app
const mockUserDataPath = '/tmp/test-pdf-handlers';
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-pdf-handlers'),
  },
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn().mockReturnValue(null),
  },
}));

// Mock fs module
let mockFileSystem: Record<string, string> = {};

vi.mock('fs', () => ({
  existsSync: vi.fn((filePath: string) => {
    return filePath in mockFileSystem || filePath === mockUserDataPath;
  }),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    if (filePath in mockFileSystem) {
      return mockFileSystem[filePath];
    }
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  }),
  writeFileSync: vi.fn((filePath: string, data: string) => {
    mockFileSystem[filePath] = data;
  }),
}));

// =============================================================================
// Test Data Generators
// =============================================================================

/**
 * Generator for valid session IDs
 */
const sessionIdGen = fc.string({ minLength: 8, maxLength: 36 })
  .filter(s => /^[a-zA-Z0-9_-]+$/.test(s))
  .map(s => `session_${s}`);

/**
 * Generator for valid response IDs
 */
const responseIdGen = fc.string({ minLength: 8, maxLength: 36 })
  .filter(s => /^[a-zA-Z0-9_-]+$/.test(s))
  .map(s => `response_${s}`);

/**
 * Generator for valid citation IDs
 */
const citationIdGen = fc.string({ minLength: 8, maxLength: 36 })
  .filter(s => /^[a-zA-Z0-9_-]+$/.test(s))
  .map(s => `citation_${s}`);

/**
 * Generator for timestamps (realistic range)
 */
const timestampGen = fc.integer({ min: 1700000000000, max: 2000000000000 });

/**
 * Generator for optional comments
 */
const commentGen = fc.option(
  fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
  { nil: undefined }
);

/**
 * Generator for ResponseFeedback objects
 */
const responseFeedbackGen: fc.Arbitrary<ResponseFeedback> = fc.record({
  responseId: responseIdGen,
  sessionId: sessionIdGen,
  type: fc.constantFrom('thumbs_up', 'thumbs_down') as fc.Arbitrary<'thumbs_up' | 'thumbs_down'>,
  timestamp: timestampGen,
  comment: commentGen,
});

/**
 * Generator for CitationFeedback objects
 */
const citationFeedbackGen: fc.Arbitrary<CitationFeedback> = fc.record({
  citationId: citationIdGen,
  responseId: responseIdGen,
  sessionId: sessionIdGen,
  type: fc.constantFrom('wrong_citation', 'missing_citation', 'inaccurate_quote') as fc.Arbitrary<'wrong_citation' | 'missing_citation' | 'inaccurate_quote'>,
  timestamp: timestampGen,
  comment: commentGen,
});

/**
 * Generator for any feedback type
 */
const anyFeedbackGen = fc.oneof(responseFeedbackGen, citationFeedbackGen);

// =============================================================================
// Feedback Store Implementation (Extracted for Testing)
// =============================================================================

interface PDFChatStoreData {
  sessions: any[];
  recentDocuments: any[];
  settings: any;
  feedback: Array<ResponseFeedback | CitationFeedback>;
}

const DEFAULT_SETTINGS = {
  chunkSize: 512,
  chunkOverlap: 128,
  chunkingStrategy: 'semantic',
  embeddingModel: 'local',
  localEmbeddingModel: 'nomic-embed-text',
  embeddingDimensions: 768,
  topK: 5,
  minConfidenceScore: 0.5,
  useHybridSearch: true,
  hybridAlpha: 0.7,
  useReranker: true,
  maxSourcesInContext: 8,
  groundedModeEnabled: false,
  showLowConfidenceWarning: true,
  lowConfidenceThreshold: 0.5,
};

/**
 * FeedbackStore class for testing feedback persistence
 * This mirrors the implementation in pdfHandlers.ts
 */
class FeedbackStore {
  private storePath: string;
  private store: PDFChatStoreData | null = null;

  constructor(userDataPath: string) {
    const pdfChatDir = path.join(userDataPath, 'pdf-chat');
    this.storePath = path.join(pdfChatDir, 'sessions.json');
  }

  private loadStore(): PDFChatStoreData {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf-8');
        const parsed = JSON.parse(data);
        return {
          sessions: parsed.sessions || [],
          recentDocuments: parsed.recentDocuments || [],
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
          feedback: parsed.feedback || [],
        };
      }
    } catch (error) {
      // Return default on error
    }
    return {
      sessions: [],
      recentDocuments: [],
      settings: DEFAULT_SETTINGS,
      feedback: [],
    };
  }

  private saveStore(data: PDFChatStoreData): void {
    fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private getStore(): PDFChatStoreData {
    if (!this.store) {
      this.store = this.loadStore();
    }
    return this.store;
  }

  private persistStore(): void {
    if (this.store) {
      this.saveStore(this.store);
    }
  }

  /**
   * Save feedback with validation
   * Implements Requirements 17.3, 17.4
   */
  saveFeedback(feedback: ResponseFeedback | CitationFeedback): void {
    if (!feedback) {
      throw new Error('Invalid feedback');
    }

    // Validate required fields
    if (!feedback.sessionId || !feedback.responseId || !feedback.type || !feedback.timestamp) {
      throw new Error('Feedback missing required fields: sessionId, responseId, type, timestamp');
    }

    // For citation feedback, validate citationId
    if ('citationId' in feedback && !feedback.citationId) {
      throw new Error('Citation feedback missing required field: citationId');
    }

    const store = this.getStore();

    // Add the feedback with a unique ID
    const feedbackWithId = {
      ...feedback,
      id: feedback.responseId + '_' + feedback.timestamp,
    };

    store.feedback.push(feedbackWithId);

    // Keep only last 1000 feedback entries
    if (store.feedback.length > 1000) {
      store.feedback = store.feedback.slice(-1000);
    }

    this.persistStore();
  }

  /**
   * Get feedback with optional filtering
   * Implements Requirements 17.3, 17.4
   */
  getFeedback(options?: {
    sessionId?: string;
    responseId?: string;
    limit?: number;
  }): Array<ResponseFeedback | CitationFeedback> {
    const store = this.getStore();
    let feedback = [...store.feedback];

    // Filter by session ID if provided
    if (options?.sessionId) {
      feedback = feedback.filter(f => f.sessionId === options.sessionId);
    }

    // Filter by response ID if provided
    if (options?.responseId) {
      feedback = feedback.filter(f => f.responseId === options.responseId);
    }

    // Apply limit if provided (return most recent)
    if (options?.limit && options.limit > 0) {
      feedback = feedback.slice(-options.limit);
    }

    return feedback;
  }

  /**
   * Clear the in-memory store (simulates app restart)
   */
  clearMemory(): void {
    this.store = null;
  }

  /**
   * Get all feedback (for testing)
   */
  getAllFeedback(): Array<ResponseFeedback | CitationFeedback> {
    return this.getStore().feedback;
  }
}

// =============================================================================
// Property Tests
// =============================================================================

describe('Property 17: Feedback Persistence', () => {
  let feedbackStore: FeedbackStore;

  beforeEach(() => {
    // Reset mock file system
    mockFileSystem = {};
    feedbackStore = new FeedbackStore(mockUserDataPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockFileSystem = {};
  });

  describe('17.3: Store feedback with context locally', () => {
    /**
     * **Validates: Requirement 17.3**
     * 
     * For any feedback submitted, it SHALL be stored with all required context:
     * - sessionId
     * - responseId
     * - type
     * - timestamp
     * - citationId (for citation feedback)
     */
    it('should store ResponseFeedback with all required context', async () => {
      await fc.assert(
        fc.asyncProperty(responseFeedbackGen, async (feedback) => {
          feedbackStore.saveFeedback(feedback);
          
          const stored = feedbackStore.getAllFeedback();
          const found = stored.find(f => 
            f.responseId === feedback.responseId && 
            f.timestamp === feedback.timestamp
          );

          expect(found).toBeDefined();
          expect(found?.sessionId).toBe(feedback.sessionId);
          expect(found?.responseId).toBe(feedback.responseId);
          expect(found?.type).toBe(feedback.type);
          expect(found?.timestamp).toBe(feedback.timestamp);
          if (feedback.comment) {
            expect(found?.comment).toBe(feedback.comment);
          }
        }),
        { numRuns: 50, seed: 12345 }
      );
    });

    it('should store CitationFeedback with all required context including citationId', async () => {
      await fc.assert(
        fc.asyncProperty(citationFeedbackGen, async (feedback) => {
          feedbackStore.saveFeedback(feedback);
          
          const stored = feedbackStore.getAllFeedback();
          const found = stored.find(f => 
            f.responseId === feedback.responseId && 
            f.timestamp === feedback.timestamp
          ) as CitationFeedback | undefined;

          expect(found).toBeDefined();
          expect(found?.sessionId).toBe(feedback.sessionId);
          expect(found?.responseId).toBe(feedback.responseId);
          expect(found?.citationId).toBe(feedback.citationId);
          expect(found?.type).toBe(feedback.type);
          expect(found?.timestamp).toBe(feedback.timestamp);
        }),
        { numRuns: 50, seed: 12345 }
      );
    });

    it('should reject feedback missing required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            responseId: fc.option(responseIdGen, { nil: undefined }),
            sessionId: fc.option(sessionIdGen, { nil: undefined }),
            type: fc.option(fc.constantFrom('thumbs_up', 'thumbs_down'), { nil: undefined }),
            timestamp: fc.option(timestampGen, { nil: undefined }),
          }),
          async (partialFeedback) => {
            // At least one required field must be missing
            const hasMissingField = 
              !partialFeedback.responseId ||
              !partialFeedback.sessionId ||
              !partialFeedback.type ||
              !partialFeedback.timestamp;

            if (hasMissingField) {
              expect(() => {
                feedbackStore.saveFeedback(partialFeedback as any);
              }).toThrow(/missing required fields/i);
            }
          }
        ),
        { numRuns: 30, seed: 12345 }
      );
    });

    it('should generate unique IDs for each feedback entry', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(anyFeedbackGen, { minLength: 2, maxLength: 10 }),
          async (feedbackList) => {
            // Make timestamps unique to ensure unique IDs
            const uniqueFeedback = feedbackList.map((f, i) => ({
              ...f,
              timestamp: f.timestamp + i,
            }));

            for (const feedback of uniqueFeedback) {
              feedbackStore.saveFeedback(feedback);
            }

            const stored = feedbackStore.getAllFeedback();
            const ids = stored.map((f: any) => f.id);
            const uniqueIds = new Set(ids);

            // All IDs should be unique
            expect(uniqueIds.size).toBe(ids.length);
          }
        ),
        { numRuns: 20, seed: 12345 }
      );
    });
  });

  describe('17.4: Persist feedback across sessions', () => {
    /**
     * **Validates: Requirement 17.4**
     * 
     * Feedback SHALL persist and be retrievable after application restart
     * (simulated by clearing in-memory store and reloading from disk)
     */
    it('should persist feedback to disk and retrieve after simulated restart', async () => {
      await fc.assert(
        fc.asyncProperty(responseFeedbackGen, async (feedback) => {
          // Save feedback
          feedbackStore.saveFeedback(feedback);

          // Simulate app restart by clearing memory and creating new store
          feedbackStore.clearMemory();

          // Retrieve feedback (should load from disk)
          const retrieved = feedbackStore.getFeedback({
            responseId: feedback.responseId,
          });

          expect(retrieved.length).toBeGreaterThan(0);
          const found = retrieved.find(f => f.timestamp === feedback.timestamp);
          expect(found).toBeDefined();
          expect(found?.sessionId).toBe(feedback.sessionId);
          expect(found?.type).toBe(feedback.type);
        }),
        { numRuns: 50, seed: 12345 }
      );
    });

    it('should persist multiple feedback entries across restart', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(anyFeedbackGen, { minLength: 1, maxLength: 10 }),
          async (feedbackList) => {
            // Make timestamps unique
            const uniqueFeedback = feedbackList.map((f, i) => ({
              ...f,
              timestamp: f.timestamp + i,
            }));

            // Save all feedback
            for (const feedback of uniqueFeedback) {
              feedbackStore.saveFeedback(feedback);
            }

            const countBefore = feedbackStore.getAllFeedback().length;

            // Simulate restart
            feedbackStore.clearMemory();

            // Verify all feedback persisted
            const countAfter = feedbackStore.getAllFeedback().length;
            expect(countAfter).toBe(countBefore);
          }
        ),
        { numRuns: 20, seed: 12345 }
      );
    });

    it('should maintain feedback data integrity across restart', async () => {
      await fc.assert(
        fc.asyncProperty(citationFeedbackGen, async (feedback) => {
          feedbackStore.saveFeedback(feedback);

          // Simulate restart
          feedbackStore.clearMemory();

          // Retrieve and verify all fields
          const retrieved = feedbackStore.getFeedback({
            sessionId: feedback.sessionId,
          });

          const found = retrieved.find(f => 
            f.responseId === feedback.responseId && 
            f.timestamp === feedback.timestamp
          ) as CitationFeedback | undefined;

          expect(found).toBeDefined();
          expect(found?.citationId).toBe(feedback.citationId);
          expect(found?.type).toBe(feedback.type);
          expect(found?.comment).toBe(feedback.comment);
        }),
        { numRuns: 50, seed: 12345 }
      );
    });
  });

  describe('Feedback Filtering', () => {
    /**
     * Additional property tests for feedback filtering functionality
     * which supports Requirements 17.3, 17.4 by enabling retrieval
     */
    it('should filter feedback by sessionId correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdGen,
          fc.array(anyFeedbackGen, { minLength: 2, maxLength: 10 }),
          async (targetSessionId, feedbackList) => {
            // Reset state for each iteration
            mockFileSystem = {};
            const localStore = new FeedbackStore(mockUserDataPath);
            
            // Create feedback with mixed session IDs
            const mixedFeedback = feedbackList.map((f, i) => ({
              ...f,
              sessionId: i % 2 === 0 ? targetSessionId : `other_session_${i}`,
              timestamp: f.timestamp + i,
            }));

            for (const feedback of mixedFeedback) {
              localStore.saveFeedback(feedback);
            }

            // Filter by target session
            const filtered = localStore.getFeedback({ sessionId: targetSessionId });

            // All results should have the target session ID
            for (const f of filtered) {
              expect(f.sessionId).toBe(targetSessionId);
            }

            // Count should match expected
            const expectedCount = mixedFeedback.filter(f => f.sessionId === targetSessionId).length;
            expect(filtered.length).toBe(expectedCount);
          }
        ),
        { numRuns: 20, seed: 12345 }
      );
    });

    it('should filter feedback by responseId correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          responseIdGen,
          fc.array(anyFeedbackGen, { minLength: 2, maxLength: 10 }),
          async (targetResponseId, feedbackList) => {
            // Reset state for each iteration
            mockFileSystem = {};
            const localStore = new FeedbackStore(mockUserDataPath);
            
            // Create feedback with mixed response IDs
            const mixedFeedback = feedbackList.map((f, i) => ({
              ...f,
              responseId: i % 2 === 0 ? targetResponseId : `other_response_${i}`,
              timestamp: f.timestamp + i,
            }));

            for (const feedback of mixedFeedback) {
              localStore.saveFeedback(feedback);
            }

            // Filter by target response
            const filtered = localStore.getFeedback({ responseId: targetResponseId });

            // All results should have the target response ID
            for (const f of filtered) {
              expect(f.responseId).toBe(targetResponseId);
            }
          }
        ),
        { numRuns: 20, seed: 12345 }
      );
    });

    it('should respect limit parameter', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 20 }),
          fc.array(anyFeedbackGen, { minLength: 5, maxLength: 30 }),
          async (limit, feedbackList) => {
            // Reset state for each iteration
            mockFileSystem = {};
            const localStore = new FeedbackStore(mockUserDataPath);
            
            // Make timestamps unique
            const uniqueFeedback = feedbackList.map((f, i) => ({
              ...f,
              timestamp: f.timestamp + i,
            }));

            for (const feedback of uniqueFeedback) {
              localStore.saveFeedback(feedback);
            }

            const limited = localStore.getFeedback({ limit });

            expect(limited.length).toBeLessThanOrEqual(limit);
          }
        ),
        { numRuns: 20, seed: 12345 }
      );
    });

    it('should return most recent feedback when limit is applied', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (limit) => {
            // Create feedback with sequential timestamps
            const feedbackList: ResponseFeedback[] = [];
            for (let i = 0; i < 10; i++) {
              feedbackList.push({
                responseId: `response_${i}`,
                sessionId: 'test_session',
                type: 'thumbs_up',
                timestamp: 1700000000000 + i * 1000,
              });
            }

            for (const feedback of feedbackList) {
              feedbackStore.saveFeedback(feedback);
            }

            const limited = feedbackStore.getFeedback({ limit });

            // Should return the most recent entries
            expect(limited.length).toBe(limit);
            
            // Verify they are the most recent (highest timestamps)
            const allFeedback = feedbackStore.getAllFeedback();
            const expectedRecent = allFeedback.slice(-limit);
            
            for (let i = 0; i < limited.length; i++) {
              expect(limited[i].timestamp).toBe(expectedRecent[i].timestamp);
            }
          }
        ),
        { numRuns: 10, seed: 12345 }
      );
    });
  });

  describe('Edge Cases and Bounds', () => {
    it('should handle empty feedback store gracefully', async () => {
      const feedback = feedbackStore.getFeedback();
      expect(feedback).toEqual([]);
    });

    it('should handle feedback store with 1000+ entries (limit enforcement)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1001, max: 1050 }),
          async (count) => {
            // Add more than 1000 entries
            for (let i = 0; i < count; i++) {
              feedbackStore.saveFeedback({
                responseId: `response_${i}`,
                sessionId: 'test_session',
                type: 'thumbs_up',
                timestamp: 1700000000000 + i,
              });
            }

            const allFeedback = feedbackStore.getAllFeedback();
            
            // Should be capped at 1000
            expect(allFeedback.length).toBeLessThanOrEqual(1000);
          }
        ),
        { numRuns: 5, seed: 12345 }
      );
    }, 30000);

    it('should preserve most recent feedback when limit is exceeded', async () => {
      // Add 1005 entries
      for (let i = 0; i < 1005; i++) {
        feedbackStore.saveFeedback({
          responseId: `response_${i}`,
          sessionId: 'test_session',
          type: 'thumbs_up',
          timestamp: 1700000000000 + i,
        });
      }

      const allFeedback = feedbackStore.getAllFeedback();
      
      // Should have exactly 1000 entries
      expect(allFeedback.length).toBe(1000);
      
      // The oldest 5 entries should be removed (entries 0-4)
      // The newest entry should be present (entry 1004)
      const hasNewest = allFeedback.some(f => f.responseId === 'response_1004');
      const hasOldest = allFeedback.some(f => f.responseId === 'response_0');
      
      expect(hasNewest).toBe(true);
      expect(hasOldest).toBe(false);
    });

    it('should handle special characters in comments', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          async (comment) => {
            const feedback: ResponseFeedback = {
              responseId: 'test_response',
              sessionId: 'test_session',
              type: 'thumbs_down',
              timestamp: Date.now(),
              comment,
            };

            feedbackStore.saveFeedback(feedback);
            
            // Simulate restart
            feedbackStore.clearMemory();
            
            const retrieved = feedbackStore.getFeedback({ responseId: 'test_response' });
            const found = retrieved.find(f => f.comment === comment);
            
            expect(found?.comment).toBe(comment);
          }
        ),
        { numRuns: 30, seed: 12345 }
      );
    });
  });
});
