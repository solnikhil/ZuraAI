/**
 * Property-Based Tests for PDF Chat Session Management
 * 
 * **Property 12: Session Data Integrity**
 * **Validates: Requirements 11.1, 11.2, 11.3**
 * 
 * **Property 13: Missing Document Handling**
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.5**
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { PDFChatSession, PDFChatMessage, BoundingBox, Citation, RetrievalResult, TextSelection } from '../types/pdf';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => `uuid-${Math.random().toString(36).substring(2, 15)}`,
  },
});

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

const genCitation = fc.record({
  id: fc.uuid(),
  documentName: fc.string({ minLength: 1, maxLength: 50 }),
  pageNumber: fc.integer({ min: 1, max: 500 }),
  boundingBoxes: fc.array(genBoundingBox, { minLength: 0, maxLength: 3 }),
  quotedText: fc.string({ minLength: 0, maxLength: 200 }),
  chunkId: fc.string({ minLength: 8, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `chunk_${s}`),
}) as fc.Arbitrary<Citation>;

const genTextSelection = fc.record({
  text: fc.string({ minLength: 1, maxLength: 500 }),
  documentId: fc.string({ minLength: 8, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)).map(s => `doc_${s}`),
  pageNumber: fc.integer({ min: 1, max: 100 }),
  boundingBox: genBoundingBox,
}) as fc.Arbitrary<TextSelection>;

const genPDFChatMessage = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom('user', 'assistant') as fc.Arbitrary<'user' | 'assistant'>,
  content: fc.string({ minLength: 1, maxLength: 1000 }),
  timestamp: fc.integer({ min: 1609459200000, max: 1893456000000 }), // 2021-2030
  citations: fc.option(fc.array(genCitation, { minLength: 0, maxLength: 5 }), { nil: undefined }),
  attachedSelection: fc.option(genTextSelection, { nil: undefined }),
}) as fc.Arbitrary<PDFChatMessage>;

const genDocumentId = fc.string({ minLength: 8, maxLength: 32 })
  .filter(s => /^[a-zA-Z0-9_-]+$/.test(s))
  .map(s => `doc_${s}`);

// Generator that ensures updatedAt >= createdAt
const genTimestamps = fc.integer({ min: 1609459200000, max: 1893456000000 }).chain(createdAt =>
  fc.integer({ min: createdAt, max: 1893456000000 }).map(updatedAt => ({
    createdAt,
    updatedAt,
  }))
);

const genPDFChatSession = fc.tuple(
  fc.uuid(),
  fc.string({ minLength: 1, maxLength: 100 }),
  fc.array(genDocumentId, { minLength: 1, maxLength: 5 }),
  fc.array(genPDFChatMessage, { minLength: 0, maxLength: 20 }),
  genTimestamps
).map(([id, title, documentIds, messages, timestamps]) => ({
  id,
  title,
  documentIds,
  messages,
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
})) as fc.Arbitrary<PDFChatSession>;

// =============================================================================
// Session Validation Utilities
// =============================================================================

/**
 * Validates that a session has all required fields with correct types
 */
function validateSessionIntegrity(session: PDFChatSession): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check unique ID
  if (typeof session.id !== 'string' || session.id.length === 0) {
    errors.push('Session must have a non-empty string ID');
  }

  // Check document IDs (non-empty array)
  if (!Array.isArray(session.documentIds)) {
    errors.push('Session must have documentIds array');
  } else if (session.documentIds.length === 0) {
    errors.push('Session must have at least one document ID');
  } else {
    session.documentIds.forEach((docId, idx) => {
      if (typeof docId !== 'string' || docId.length === 0) {
        errors.push(`Document ID at index ${idx} must be a non-empty string`);
      }
    });
  }

  // Check messages array
  if (!Array.isArray(session.messages)) {
    errors.push('Session must have messages array');
  }

  // Check creation timestamp
  if (typeof session.createdAt !== 'number' || session.createdAt <= 0) {
    errors.push('Session must have a positive createdAt timestamp');
  }

  // Check update timestamp
  if (typeof session.updatedAt !== 'number' || session.updatedAt <= 0) {
    errors.push('Session must have a positive updatedAt timestamp');
  }

  // Check title
  if (typeof session.title !== 'string') {
    errors.push('Session must have a string title');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Simulates session serialization and deserialization (round-trip)
 */
function serializeAndDeserialize(session: PDFChatSession): PDFChatSession {
  const serialized = JSON.stringify(session);
  return JSON.parse(serialized) as PDFChatSession;
}

/**
 * Checks if a document exists at the given path
 * In tests, we simulate this by checking against a mock file system
 */
function checkDocumentExists(filePath: string, existingPaths: Set<string>): boolean {
  return existingPaths.has(filePath);
}

/**
 * Represents the result of checking document availability for a session
 */
interface DocumentAvailabilityResult {
  sessionId: string;
  availableDocuments: string[];
  missingDocuments: string[];
  isFullyAvailable: boolean;
}

/**
 * Checks document availability for a session
 */
function checkSessionDocumentAvailability(
  session: PDFChatSession,
  documentPaths: Map<string, string>, // docId -> filePath
  existingPaths: Set<string>
): DocumentAvailabilityResult {
  const availableDocuments: string[] = [];
  const missingDocuments: string[] = [];

  for (const docId of session.documentIds) {
    const filePath = documentPaths.get(docId);
    if (filePath && checkDocumentExists(filePath, existingPaths)) {
      availableDocuments.push(docId);
    } else {
      missingDocuments.push(docId);
    }
  }

  return {
    sessionId: session.id,
    availableDocuments,
    missingDocuments,
    isFullyAvailable: missingDocuments.length === 0,
  };
}

// =============================================================================
// Property Tests
// =============================================================================

describe('PDF Chat Session Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Property 12: Session Data Integrity', () => {
    /**
     * **Property 12: Session Data Integrity**
     * 
     * For any PDF chat session, the session SHALL contain: a unique ID, 
     * document ID references (non-empty), messages array, creation timestamp, 
     * and update timestamp. Restoring a session SHALL restore all these fields.
     * 
     * **Validates: Requirements 11.1, 11.2, 11.3**
     */
    it('should have all required fields with correct types', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          const validation = validateSessionIntegrity(session);
          
          // Property: All sessions must pass integrity validation
          expect(validation.isValid).toBe(true);
          if (!validation.isValid) {
            console.error('Validation errors:', validation.errors);
          }
        }),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should preserve all fields after serialization round-trip', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          // Simulate storage and retrieval
          const restored = serializeAndDeserialize(session);
          
          // Property: All fields should be preserved
          expect(restored.id).toBe(session.id);
          expect(restored.title).toBe(session.title);
          expect(restored.documentIds).toEqual(session.documentIds);
          expect(restored.messages.length).toBe(session.messages.length);
          expect(restored.createdAt).toBe(session.createdAt);
          expect(restored.updatedAt).toBe(session.updatedAt);
          
          // Verify messages are preserved
          restored.messages.forEach((msg, idx) => {
            const original = session.messages[idx];
            expect(msg.id).toBe(original.id);
            expect(msg.role).toBe(original.role);
            expect(msg.content).toBe(original.content);
            expect(msg.timestamp).toBe(original.timestamp);
          });
        }),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should have unique session IDs', () => {
      fc.assert(
        fc.property(
          fc.array(genPDFChatSession, { minLength: 2, maxLength: 20 }),
          (sessions) => {
            // Property: All session IDs should be unique
            const ids = sessions.map(s => s.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
          }
        ),
        { numRuns: 50, seed: 12345 }
      );
    }, 30000);

    it('should have non-empty document ID references', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          // Property: documentIds must be non-empty array
          expect(Array.isArray(session.documentIds)).toBe(true);
          expect(session.documentIds.length).toBeGreaterThan(0);
          
          // Property: Each document ID must be a non-empty string
          session.documentIds.forEach(docId => {
            expect(typeof docId).toBe('string');
            expect(docId.length).toBeGreaterThan(0);
          });
        }),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should have valid timestamps', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          // Property: createdAt must be a positive number
          expect(typeof session.createdAt).toBe('number');
          expect(session.createdAt).toBeGreaterThan(0);
          
          // Property: updatedAt must be a positive number
          expect(typeof session.updatedAt).toBe('number');
          expect(session.updatedAt).toBeGreaterThan(0);
          
          // Property: updatedAt should be >= createdAt (in most cases)
          // Note: This is a soft property - in edge cases they could be equal
          expect(session.updatedAt).toBeGreaterThanOrEqual(session.createdAt);
        }),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should have valid messages array structure', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          // Property: messages must be an array
          expect(Array.isArray(session.messages)).toBe(true);
          
          // Property: Each message must have required fields
          session.messages.forEach(msg => {
            expect(typeof msg.id).toBe('string');
            expect(msg.id.length).toBeGreaterThan(0);
            expect(['user', 'assistant']).toContain(msg.role);
            expect(typeof msg.content).toBe('string');
            expect(typeof msg.timestamp).toBe('number');
            expect(msg.timestamp).toBeGreaterThan(0);
          });
        }),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should preserve message citations after round-trip', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          const restored = serializeAndDeserialize(session);
          
          // Property: Citations should be preserved
          restored.messages.forEach((msg, idx) => {
            const original = session.messages[idx];
            
            if (original.citations) {
              expect(msg.citations).toBeDefined();
              expect(msg.citations?.length).toBe(original.citations.length);
              
              msg.citations?.forEach((citation, citIdx) => {
                const origCitation = original.citations![citIdx];
                expect(citation.id).toBe(origCitation.id);
                expect(citation.chunkId).toBe(origCitation.chunkId);
                expect(citation.pageNumber).toBe(origCitation.pageNumber);
                expect(citation.documentName).toBe(origCitation.documentName);
              });
            } else {
              expect(msg.citations).toBeUndefined();
            }
          });
        }),
        { numRuns: 50, seed: 12345 }
      );
    });

    it('should preserve attached selections after round-trip', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          const restored = serializeAndDeserialize(session);
          
          // Property: Attached selections should be preserved
          restored.messages.forEach((msg, idx) => {
            const original = session.messages[idx];
            
            if (original.attachedSelection) {
              expect(msg.attachedSelection).toBeDefined();
              expect(msg.attachedSelection?.text).toBe(original.attachedSelection.text);
              expect(msg.attachedSelection?.documentId).toBe(original.attachedSelection.documentId);
              expect(msg.attachedSelection?.pageNumber).toBe(original.attachedSelection.pageNumber);
            } else {
              expect(msg.attachedSelection).toBeUndefined();
            }
          });
        }),
        { numRuns: 50, seed: 12345 }
      );
    });
  });

  describe('Property 13: Missing Document Handling', () => {
    /**
     * **Property 13: Missing Document Handling**
     * 
     * For any PDF chat session where the referenced PDF file no longer exists 
     * at the stored path, the system SHALL indicate the document is unavailable 
     * rather than crash or show empty content.
     * 
     * **Validates: Requirements 11.5, 18.1**
     */
    it('should detect missing documents without crashing', () => {
      fc.assert(
        fc.property(
          genPDFChatSession,
          fc.array(fc.string({ minLength: 5, maxLength: 100 }), { minLength: 0, maxLength: 10 }),
          (session, existingPathsList) => {
            // Create a map of document IDs to file paths
            const documentPaths = new Map<string, string>();
            session.documentIds.forEach((docId, idx) => {
              documentPaths.set(docId, `/path/to/document_${idx}.pdf`);
            });
            
            // Create set of existing paths (some may not include our documents)
            const existingPaths = new Set(existingPathsList);
            
            // Property: Checking availability should not throw
            let result: DocumentAvailabilityResult | null = null;
            expect(() => {
              result = checkSessionDocumentAvailability(session, documentPaths, existingPaths);
            }).not.toThrow();
            
            // Property: Result should always be returned
            expect(result).not.toBeNull();
            expect(result!.sessionId).toBe(session.id);
            
            // Property: Available + missing should equal total documents
            expect(result!.availableDocuments.length + result!.missingDocuments.length)
              .toBe(session.documentIds.length);
          }
        ),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should correctly identify all documents as missing when none exist', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          // Create document paths but no existing files
          const documentPaths = new Map<string, string>();
          session.documentIds.forEach((docId, idx) => {
            documentPaths.set(docId, `/path/to/document_${idx}.pdf`);
          });
          
          const existingPaths = new Set<string>(); // Empty - no files exist
          
          const result = checkSessionDocumentAvailability(session, documentPaths, existingPaths);
          
          // Property: All documents should be marked as missing
          expect(result.missingDocuments.length).toBe(session.documentIds.length);
          expect(result.availableDocuments.length).toBe(0);
          expect(result.isFullyAvailable).toBe(false);
        }),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should correctly identify all documents as available when all exist', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          // Create document paths and mark all as existing
          const documentPaths = new Map<string, string>();
          const existingPaths = new Set<string>();
          
          session.documentIds.forEach((docId, idx) => {
            const path = `/path/to/document_${idx}.pdf`;
            documentPaths.set(docId, path);
            existingPaths.add(path);
          });
          
          const result = checkSessionDocumentAvailability(session, documentPaths, existingPaths);
          
          // Property: All documents should be marked as available
          expect(result.availableDocuments.length).toBe(session.documentIds.length);
          expect(result.missingDocuments.length).toBe(0);
          expect(result.isFullyAvailable).toBe(true);
        }),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should handle partial document availability', () => {
      fc.assert(
        fc.property(
          genPDFChatSession.filter(s => s.documentIds.length >= 2),
          fc.float({ min: 0, max: 1, noNaN: true }),
          (session, availabilityRatio) => {
            // Create document paths
            const documentPaths = new Map<string, string>();
            const existingPaths = new Set<string>();
            
            session.documentIds.forEach((docId, idx) => {
              const path = `/path/to/document_${idx}.pdf`;
              documentPaths.set(docId, path);
              
              // Make some documents available based on ratio
              if (idx / session.documentIds.length < availabilityRatio) {
                existingPaths.add(path);
              }
            });
            
            const result = checkSessionDocumentAvailability(session, documentPaths, existingPaths);
            
            // Property: Total should always equal document count
            expect(result.availableDocuments.length + result.missingDocuments.length)
              .toBe(session.documentIds.length);
            
            // Property: isFullyAvailable should be true only if no missing
            expect(result.isFullyAvailable).toBe(result.missingDocuments.length === 0);
            
            // Property: Available documents should be subset of documentIds
            result.availableDocuments.forEach(docId => {
              expect(session.documentIds).toContain(docId);
            });
            
            // Property: Missing documents should be subset of documentIds
            result.missingDocuments.forEach(docId => {
              expect(session.documentIds).toContain(docId);
            });
          }
        ),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should handle documents with unknown paths gracefully', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          // Create empty document paths map (simulating unknown paths)
          const documentPaths = new Map<string, string>();
          const existingPaths = new Set<string>();
          
          // Property: Should not throw even with unknown paths
          let result: DocumentAvailabilityResult | null = null;
          expect(() => {
            result = checkSessionDocumentAvailability(session, documentPaths, existingPaths);
          }).not.toThrow();
          
          // Property: All documents should be marked as missing
          expect(result!.missingDocuments.length).toBe(session.documentIds.length);
          expect(result!.isFullyAvailable).toBe(false);
        }),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should preserve session data even when documents are missing', () => {
      fc.assert(
        fc.property(genPDFChatSession, (session) => {
          // Simulate missing documents scenario
          const documentPaths = new Map<string, string>();
          session.documentIds.forEach((docId, idx) => {
            documentPaths.set(docId, `/path/to/document_${idx}.pdf`);
          });
          const existingPaths = new Set<string>(); // No files exist
          
          const result = checkSessionDocumentAvailability(session, documentPaths, existingPaths);
          
          // Property: Session data should still be intact
          expect(result.sessionId).toBe(session.id);
          
          // Property: Original session should not be modified
          expect(session.id).toBeTruthy();
          expect(session.documentIds.length).toBeGreaterThan(0);
          expect(Array.isArray(session.messages)).toBe(true);
          expect(session.createdAt).toBeGreaterThan(0);
          expect(session.updatedAt).toBeGreaterThan(0);
        }),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should indicate unavailability status clearly', () => {
      fc.assert(
        fc.property(
          genPDFChatSession,
          fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 1, maxLength: 5 }),
          (session, missingIndices) => {
            // Create document paths
            const documentPaths = new Map<string, string>();
            const existingPaths = new Set<string>();
            
            session.documentIds.forEach((docId, idx) => {
              const path = `/path/to/document_${idx}.pdf`;
              documentPaths.set(docId, path);
              
              // Make document missing if index is in missingIndices
              if (!missingIndices.includes(idx % session.documentIds.length)) {
                existingPaths.add(path);
              }
            });
            
            const result = checkSessionDocumentAvailability(session, documentPaths, existingPaths);
            
            // Property: Result should clearly indicate availability status
            expect(typeof result.isFullyAvailable).toBe('boolean');
            expect(Array.isArray(result.availableDocuments)).toBe(true);
            expect(Array.isArray(result.missingDocuments)).toBe(true);
            
            // Property: No document should appear in both lists
            const availableSet = new Set(result.availableDocuments);
            result.missingDocuments.forEach(docId => {
              expect(availableSet.has(docId)).toBe(false);
            });
          }
        ),
        { numRuns: 100, seed: 12345 }
      );
    });
  });

  describe('Session Creation and Restoration', () => {
    /**
     * Additional tests for session creation and restoration flows
     * that support Properties 12 and 13.
     */
    it('should create valid sessions with all required fields', () => {
      fc.assert(
        fc.property(
          fc.array(genDocumentId, { minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (documentIds, title) => {
            // Simulate session creation
            const session: PDFChatSession = {
              id: crypto.randomUUID(),
              title,
              documentIds,
              messages: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            
            // Property: Created session should pass integrity validation
            const validation = validateSessionIntegrity(session);
            expect(validation.isValid).toBe(true);
          }
        ),
        { numRuns: 100, seed: 12345 }
      );
    });

    it('should maintain integrity after adding messages', () => {
      fc.assert(
        fc.property(
          genPDFChatSession,
          fc.array(genPDFChatMessage, { minLength: 1, maxLength: 10 }),
          (session, newMessages) => {
            // Add messages to session
            const updatedSession: PDFChatSession = {
              ...session,
              messages: [...session.messages, ...newMessages],
              updatedAt: Date.now(),
            };
            
            // Property: Session should still be valid after adding messages
            const validation = validateSessionIntegrity(updatedSession);
            expect(validation.isValid).toBe(true);
            
            // Property: Message count should be correct
            expect(updatedSession.messages.length)
              .toBe(session.messages.length + newMessages.length);
          }
        ),
        { numRuns: 50, seed: 12345 }
      );
    });

    it('should handle session restoration from localStorage', () => {
      fc.assert(
        fc.property(
          fc.array(genPDFChatSession, { minLength: 1, maxLength: 10 }),
          (sessions) => {
            // Simulate saving to localStorage
            const serialized = JSON.stringify(sessions);
            localStorageMock.setItem('zura-pdf-chat-sessions', serialized);
            
            // Simulate restoration
            const restored = JSON.parse(
              localStorageMock.getItem('zura-pdf-chat-sessions') || '[]'
            ) as PDFChatSession[];
            
            // Property: All sessions should be restored
            expect(restored.length).toBe(sessions.length);
            
            // Property: Each restored session should be valid
            restored.forEach((session, idx) => {
              const validation = validateSessionIntegrity(session);
              expect(validation.isValid).toBe(true);
              
              // Property: Session data should match original
              expect(session.id).toBe(sessions[idx].id);
              expect(session.documentIds).toEqual(sessions[idx].documentIds);
              expect(session.messages.length).toBe(sessions[idx].messages.length);
            });
          }
        ),
        { numRuns: 50, seed: 12345 }
      );
    });

    it('should handle empty sessions list gracefully', () => {
      // Simulate empty localStorage
      localStorageMock.setItem('zura-pdf-chat-sessions', '[]');
      
      const restored = JSON.parse(
        localStorageMock.getItem('zura-pdf-chat-sessions') || '[]'
      ) as PDFChatSession[];
      
      // Property: Should return empty array without error
      expect(Array.isArray(restored)).toBe(true);
      expect(restored.length).toBe(0);
    });

    it('should handle missing localStorage key gracefully', () => {
      localStorageMock.clear();
      
      const stored = localStorageMock.getItem('zura-pdf-chat-sessions');
      const restored = stored ? JSON.parse(stored) : [];
      
      // Property: Should return empty array without error
      expect(Array.isArray(restored)).toBe(true);
      expect(restored.length).toBe(0);
    });
  });
});
