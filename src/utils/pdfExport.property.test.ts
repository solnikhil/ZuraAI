/**
 * Property-Based Tests for PDF Export Functionality
 * 
 * **Property 15: Export Content Completeness**
 * - For any response with N citations, export contains N reference entries
 * - All citation markers in text have corresponding reference entries
 * - Export format is valid markdown
 * 
 * **Validates: Requirements 14.2, 14.3, 14.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  exportMessageToMarkdown,
  exportConversationToMarkdown,
  exportBriefToMarkdown,
  DEFAULT_EXPORT_OPTIONS,
} from './pdfExport';
import type {
  Citation,
  PDFChatMessage,
  RetrievalResult,
  Chunk,
  ChunkMetadata,
  BoundingBox,
} from '../types/pdf';

// =============================================================================
// Generators (Arbitraries) for Property-Based Testing
// =============================================================================

/**
 * Generator for valid bounding boxes
 */
const boundingBoxArb: fc.Arbitrary<BoundingBox> = fc.record({
  x0: fc.float({ min: 0, max: 500, noNaN: true }),
  y0: fc.float({ min: 0, max: 700, noNaN: true }),
  x1: fc.float({ min: 100, max: 600, noNaN: true }),
  y1: fc.float({ min: 100, max: 800, noNaN: true }),
  pageNumber: fc.integer({ min: 1, max: 500 }),
});

/**
 * Generator for chunk IDs (matching the expected format)
 */
const chunkIdArb: fc.Arbitrary<string> = fc.stringMatching(/^chunk_[a-z0-9]{8,16}$/);

/**
 * Generator for document names
 */
const documentNameArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('Document.pdf', 'Report.pdf', 'Paper.pdf', 'Manual.pdf'),
  fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .map(s => `${s.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`)
);

/**
 * Generator for quoted text (non-empty strings)
 */
const quotedTextArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 300 })
  .filter(s => s.trim().length > 0);

/**
 * Generator for valid citations
 */
const citationArb: fc.Arbitrary<Citation> = fc.record({
  id: fc.uuid(),
  documentName: documentNameArb,
  pageNumber: fc.integer({ min: 1, max: 500 }),
  boundingBoxes: fc.array(boundingBoxArb, { minLength: 1, maxLength: 3 }),
  quotedText: quotedTextArb,
  chunkId: chunkIdArb,
  documentId: fc.option(fc.uuid(), { nil: undefined }),
});

/**
 * Generator for chunk metadata
 */
const chunkMetadataArb: fc.Arbitrary<ChunkMetadata> = fc.record({
  pageNumbers: fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 5 }),
  boundingBoxes: fc.array(boundingBoxArb, { minLength: 1, maxLength: 3 }),
  sectionHeader: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  chunkIndex: fc.integer({ min: 0, max: 1000 }),
  tokenCount: fc.integer({ min: 1, max: 1000 }),
  blockType: fc.constantFrom('text', 'table', 'figure'),
});

/**
 * Generator for chunks
 */
const chunkArb: fc.Arbitrary<Chunk> = fc.record({
  id: chunkIdArb,
  documentId: fc.uuid(),
  content: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length > 0),
  metadata: chunkMetadataArb,
  embedding: fc.option(fc.array(fc.float({ noNaN: true }), { minLength: 768, maxLength: 768 }), { nil: undefined }),
});

/**
 * Generator for retrieval results
 */
const retrievalResultArb: fc.Arbitrary<RetrievalResult> = fc.record({
  chunk: chunkArb,
  score: fc.float({ min: 0, max: 1, noNaN: true }),
  vectorScore: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
  bm25Score: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
  rerankerScore: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
});

/**
 * Generator for message content with citation markers
 * Creates content with [N] style citation markers
 */
const contentWithCitationsArb = (citationCount: number): fc.Arbitrary<string> => {
  if (citationCount === 0) {
    return fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length > 0);
  }
  
  return fc.array(
    fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0),
    { minLength: citationCount, maxLength: citationCount + 3 }
  ).map(parts => {
    // Insert citation markers between parts
    let result = parts[0];
    for (let i = 1; i < parts.length && i <= citationCount; i++) {
      result += ` [${i}] ${parts[i]}`;
    }
    return result;
  });
};

/**
 * Generator for assistant messages with citations
 */
const assistantMessageWithCitationsArb = (
  citationCount: number
): fc.Arbitrary<PDFChatMessage> => {
  return fc.record({
    id: fc.uuid(),
    role: fc.constant('assistant' as const),
    content: contentWithCitationsArb(citationCount),
    timestamp: fc.integer({ min: 1600000000000, max: 1800000000000 }),
    citations: fc.array(citationArb, { minLength: citationCount, maxLength: citationCount }),
    sources: fc.array(retrievalResultArb, { minLength: 0, maxLength: 5 }),
    attachedSelection: fc.constant(undefined),
  });
};

/**
 * Generator for user messages
 */
const userMessageArb: fc.Arbitrary<PDFChatMessage> = fc.record({
  id: fc.uuid(),
  role: fc.constant('user' as const),
  content: fc.string({ minLength: 5, maxLength: 200 }).filter(s => s.trim().length > 0),
  timestamp: fc.integer({ min: 1600000000000, max: 1800000000000 }),
  citations: fc.constant(undefined),
  sources: fc.constant(undefined),
  attachedSelection: fc.option(
    fc.record({
      text: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      documentId: fc.uuid(),
      pageNumber: fc.integer({ min: 1, max: 500 }),
      boundingBox: boundingBoxArb,
    }),
    { nil: undefined }
  ),
});

// =============================================================================
// Property Tests
// =============================================================================

describe('PDF Export Property Tests', () => {
  /**
   * Property 15: Export Content Completeness
   * **Validates: Requirements 14.2, 14.3, 14.4**
   * 
   * For any response with N citations, export contains N reference entries.
   * All citation markers in text have corresponding reference entries.
   * Export format is valid markdown.
   */
  describe('Property 15: Export Content Completeness', () => {
    
    /**
     * Property 15.1: For any response with N citations, export contains N reference entries
     * **Validates: Requirements 14.2, 14.3**
     */
    it('should include N reference entries for N citations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (citationCount) => {
            return fc.assert(
              fc.property(
                assistantMessageWithCitationsArb(citationCount),
                (message) => {
                  const markdown = exportMessageToMarkdown(message, { includeCitations: true });
                  
                  // Count reference entries in the output
                  // References are formatted as: **[N]** Document Name, Page X
                  const referencePattern = /\*\*\[\d+\]\*\*/g;
                  const referenceMatches = markdown.match(referencePattern) || [];
                  
                  // The number of reference entries should equal the number of unique citations
                  // Note: buildReferenceEntries deduplicates by chunkId-pageNumber
                  const uniqueCitations = new Set(
                    message.citations!.map(c => `${c.chunkId}-${c.pageNumber}`)
                  );
                  
                  expect(referenceMatches.length).toBe(uniqueCitations.size);
                }
              ),
              { numRuns: 20 }
            );
          }
        ),
        { numRuns: 5 }
      );
    });

    /**
     * Property 15.2: All citations have corresponding reference entries with page numbers
     * **Validates: Requirements 14.3**
     */
    it('should include page numbers for all citations in references section', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 8 }).chain(count => 
            assistantMessageWithCitationsArb(count)
          ),
          (message) => {
            const markdown = exportMessageToMarkdown(message, { includeCitations: true });
            
            // Each citation should have its page number in the references section
            const uniqueCitations = new Map<string, Citation>();
            for (const citation of message.citations || []) {
              const key = `${citation.chunkId}-${citation.pageNumber}`;
              if (!uniqueCitations.has(key)) {
                uniqueCitations.set(key, citation);
              }
            }
            
            // Check that each unique citation's page number appears in references
            for (const citation of uniqueCitations.values()) {
              const pagePattern = new RegExp(`Page ${citation.pageNumber}\\b`);
              expect(markdown).toMatch(pagePattern);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property 15.3: Export format is valid markdown (contains expected structure)
     * **Validates: Requirements 14.2, 14.4**
     */
    it('should produce valid markdown structure', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }).chain(count => 
            assistantMessageWithCitationsArb(count)
          ),
          (message) => {
            const markdown = exportMessageToMarkdown(message, { 
              includeCitations: true,
              includeMetadata: true 
            });
            
            // Should contain the message content
            // Note: content may be modified, but key parts should be present
            expect(markdown.length).toBeGreaterThan(0);
            
            // Should have proper markdown structure
            // - Contains role indicator
            expect(markdown).toContain('**Answer:**');
            
            // If there are citations, should have references section
            if (message.citations && message.citations.length > 0) {
              expect(markdown).toContain('## References');
              expect(markdown).toContain('---');
            }
            
            // Should have metadata comment if includeMetadata is true
            expect(markdown).toContain('<!-- Exported from Zura AI PDF Chat -->');
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property 15.4: References section includes document names
     * **Validates: Requirements 14.3**
     */
    it('should include document names in references section', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }).chain(count => 
            assistantMessageWithCitationsArb(count)
          ),
          (message) => {
            const markdown = exportMessageToMarkdown(message, { includeCitations: true });
            
            // Get unique document names from citations
            const uniqueDocNames = new Set(
              (message.citations || []).map(c => c.documentName)
            );
            
            // Each document name should appear in the references
            for (const docName of uniqueDocNames) {
              expect(markdown).toContain(docName);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property 15.5: Quoted text is included in references when available
     * **Validates: Requirements 14.3**
     */
    it('should include quoted text in references when available', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }).chain(count => 
            assistantMessageWithCitationsArb(count)
          ),
          (message) => {
            const markdown = exportMessageToMarkdown(message, { includeCitations: true });
            
            // References with quoted text should have blockquote markers
            const hasQuotedText = (message.citations || []).some(c => c.quotedText && c.quotedText.length > 0);
            
            if (hasQuotedText) {
              // Should contain blockquote marker for quoted text
              expect(markdown).toContain('> "');
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property 15.6: Conversation export includes both question and answer
     * **Validates: Requirements 14.2, 14.4**
     */
    it('should include both question and answer in conversation export', () => {
      fc.assert(
        fc.property(
          userMessageArb,
          fc.integer({ min: 0, max: 3 }).chain(count => 
            assistantMessageWithCitationsArb(count)
          ),
          (userMessage, assistantMessage) => {
            const markdown = exportConversationToMarkdown(
              userMessage,
              assistantMessage,
              { includeCitations: true, includeMetadata: true }
            );
            
            // Should contain question section
            expect(markdown).toContain('## Question');
            
            // Should contain answer section
            expect(markdown).toContain('## Answer');
            
            // Should contain the user's question content
            expect(markdown).toContain(userMessage.content);
            
            // Should contain the assistant's answer content
            expect(markdown).toContain(assistantMessage.content);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property 15.7: Brief export consolidates all citations
     * **Validates: Requirements 14.2, 14.3, 14.4**
     */
    it('should consolidate all citations in brief export', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              userMessageArb,
              fc.integer({ min: 1, max: 3 }).chain(count => 
                assistantMessageWithCitationsArb(count)
              )
            ),
            { minLength: 1, maxLength: 3 }
          ),
          (messagePairs) => {
            // Flatten to array of messages
            const messages: PDFChatMessage[] = [];
            for (const [user, assistant] of messagePairs) {
              messages.push(user);
              messages.push(assistant);
            }
            
            const markdown = exportBriefToMarkdown(messages, 'Test Brief', { includeCitations: true });
            
            // Collect all unique citations from all messages
            const allCitations = new Set<string>();
            for (const msg of messages) {
              if (msg.citations) {
                for (const citation of msg.citations) {
                  allCitations.add(`${citation.chunkId}-${citation.pageNumber}`);
                }
              }
            }
            
            // Should have a references section if there are citations
            if (allCitations.size > 0) {
              expect(markdown).toContain('## References');
              
              // Count reference entries
              const referencePattern = /\*\*\[\d+\]\*\*/g;
              const referenceMatches = markdown.match(referencePattern) || [];
              
              // Should have entries for all unique citations
              expect(referenceMatches.length).toBe(allCitations.size);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property 15.8: Export without citations option excludes references section
     * **Validates: Requirements 14.4**
     */
    it('should exclude references section when includeCitations is false', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }).chain(count => 
            assistantMessageWithCitationsArb(count)
          ),
          (message) => {
            const markdown = exportMessageToMarkdown(message, { includeCitations: false });
            
            // Should NOT contain references section
            expect(markdown).not.toContain('## References');
            
            // Should still contain the answer
            expect(markdown).toContain('**Answer:**');
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property 15.9: Export handles empty citations array gracefully
     * **Validates: Requirements 14.2**
     */
    it('should handle messages with empty citations array', () => {
      fc.assert(
        fc.property(
          assistantMessageWithCitationsArb(0),
          (message) => {
            // Ensure citations is empty array
            message.citations = [];
            
            const markdown = exportMessageToMarkdown(message, { includeCitations: true });
            
            // Should not throw and should produce valid output
            expect(markdown.length).toBeGreaterThan(0);
            expect(markdown).toContain('**Answer:**');
            
            // Should NOT have references section for empty citations
            expect(markdown).not.toContain('## References');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property 15.10: Export handles undefined citations gracefully
     * **Validates: Requirements 14.2**
     */
    it('should handle messages with undefined citations', () => {
      fc.assert(
        fc.property(
          assistantMessageWithCitationsArb(0),
          (message) => {
            // Set citations to undefined
            message.citations = undefined;
            
            const markdown = exportMessageToMarkdown(message, { includeCitations: true });
            
            // Should not throw and should produce valid output
            expect(markdown.length).toBeGreaterThan(0);
            expect(markdown).toContain('**Answer:**');
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property 15.11: Sources section is included when requested
     * **Validates: Requirements 14.4**
     */
    it('should include sources section when includeSources is true', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }).chain(count => 
            assistantMessageWithCitationsArb(count)
          ),
          fc.array(retrievalResultArb, { minLength: 1, maxLength: 3 }),
          (message, sources) => {
            message.sources = sources;
            
            const markdown = exportMessageToMarkdown(message, { 
              includeCitations: true,
              includeSources: true 
            });
            
            // Should contain sources section
            expect(markdown).toContain('### Sources Used');
            
            // Should contain relevance percentages
            expect(markdown).toMatch(/\d+% relevance/);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property 15.12: Long quoted text is truncated appropriately
     * **Validates: Requirements 14.3**
     */
    it('should truncate long quoted text in references', () => {
      fc.assert(
        fc.property(
          citationArb,
          (citation) => {
            // Create a citation with very long quoted text
            const longQuote = 'A'.repeat(300);
            citation.quotedText = longQuote;
            
            const message: PDFChatMessage = {
              id: 'test-id',
              role: 'assistant',
              content: 'Test content [1]',
              timestamp: Date.now(),
              citations: [citation],
            };
            
            const markdown = exportMessageToMarkdown(message, { includeCitations: true });
            
            // The full 300-character quote should not appear
            expect(markdown).not.toContain(longQuote);
            
            // Should contain truncation indicator
            expect(markdown).toContain('...');
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
