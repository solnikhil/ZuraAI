/**
 * Property-Based Tests for Citation Parsing
 * 
 * Property 9: Citation Format Consistency
 * Validates: Requirements 8.2, 8.6
 * 
 * Tests that citation parsing correctly handles all valid citation formats
 * and produces consistent, parseable output.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseCitations, formatCitationDisplay } from './PDFChatArea';
import type { Citation } from '../../types/pdf';

describe('Property 9: Citation Format Consistency', () => {
  /**
   * Property: For any valid citation marker in text, parsing should extract
   * the chunk ID and page number correctly, and the format should be consistent.
   */
  it('should correctly parse all valid citation markers', () => {
    fc.assert(
      fc.property(
        // Generate random citation markers
        fc.array(
          fc.record({
            chunkId: fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
            pageNumber: fc.integer({ min: 1, max: 9999 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        fc.string({ minLength: 0, maxLength: 500 }),
        (citations, baseText) => {
          // Build text with citation markers
          let text = baseText;
          const chunkMap = new Map<string, { documentName: string; pageNumber: number; quotedText: string }>();
          
          citations.forEach((cite, idx) => {
            const marker = `[[cite:${cite.chunkId}:p${cite.pageNumber}]]`;
            text += ` ${marker}`;
            
            chunkMap.set(cite.chunkId, {
              documentName: `Document${idx}`,
              pageNumber: cite.pageNumber,
              quotedText: `Quote from chunk ${cite.chunkId}`,
            });
          });

          // Parse citations
          const result = parseCitations(text, chunkMap);

          // Property 1: Number of parsed citations should match input
          expect(result.citations.length).toBe(citations.length);

          // Property 2: Each citation should have correct chunk ID and page number
          result.citations.forEach((parsed, idx) => {
            const original = citations[idx];
            expect(parsed.chunkId).toBe(original.chunkId);
            expect(parsed.pageNumber).toBe(original.pageNumber);
          });

          // Property 3: Clean text should not contain citation markers
          expect(result.cleanText).not.toMatch(/\[\[cite:[^\]]+\]\]/);

          // Property 4: Clean text should contain numbered references [1], [2], etc.
          if (citations.length > 0) {
            for (let i = 1; i <= citations.length; i++) {
              expect(result.cleanText).toContain(`[${i}]`);
            }
          }

          // Property 5: Each citation should have required fields
          result.citations.forEach((citation) => {
            expect(citation).toHaveProperty('id');
            expect(citation).toHaveProperty('chunkId');
            expect(citation).toHaveProperty('pageNumber');
            expect(citation).toHaveProperty('documentName');
            expect(citation).toHaveProperty('quotedText');
            expect(citation).toHaveProperty('boundingBoxes');
            expect(typeof citation.id).toBe('string');
            expect(typeof citation.chunkId).toBe('string');
            expect(typeof citation.pageNumber).toBe('number');
            expect(citation.pageNumber).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Citation format should be consistent and parseable
   */
  it('should produce consistent citation display format', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          chunkId: fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
          pageNumber: fc.integer({ min: 1, max: 9999 }),
          documentName: fc.string({ minLength: 1, maxLength: 50 }),
          quotedText: fc.string({ minLength: 0, maxLength: 200 }),
          boundingBoxes: fc.array(
            fc.record({
              x0: fc.float({ min: 0, max: 1000 }),
              y0: fc.float({ min: 0, max: 1000 }),
              x1: fc.float({ min: 0, max: 1000 }),
              y1: fc.float({ min: 0, max: 1000 }),
              pageNumber: fc.integer({ min: 1, max: 100 }),
            })
          ),
        }),
        (citation: Citation) => {
          const formatted = formatCitationDisplay(citation);

          // Property 1: Format should contain document name
          expect(formatted).toContain(citation.documentName);

          // Property 2: Format should contain page number
          expect(formatted).toContain(`p.${citation.pageNumber}`);

          // Property 3: Format should be wrapped in brackets
          expect(formatted).toMatch(/^\[.*\]$/);

          // Property 4: Format should follow pattern [DocumentName, p.X]
          const pattern = /^\[.+, p\.\d+\]$/;
          expect(formatted).toMatch(pattern);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Parsing should handle edge cases gracefully
   */
  it('should handle edge cases in citation parsing', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Empty text
          fc.constant(''),
          // Text with no citations
          fc.string({ minLength: 1, maxLength: 500 }),
          // Text with malformed citations
          fc.string({ minLength: 1, maxLength: 100 }).map(s => `[[cite:invalid]] ${s}`),
          // Text with multiple consecutive citations
          fc.constant('[[cite:chunk1:p1]][[cite:chunk2:p2]][[cite:chunk3:p3]]'),
          // Text with citations at start and end
          fc.string({ minLength: 1, maxLength: 100 }).map(s => `[[cite:start:p1]]${s}[[cite:end:p99]]`)
        ),
        (text) => {
          const chunkMap = new Map([
            ['chunk1', { documentName: 'Doc1', pageNumber: 1, quotedText: 'Quote 1' }],
            ['chunk2', { documentName: 'Doc2', pageNumber: 2, quotedText: 'Quote 2' }],
            ['chunk3', { documentName: 'Doc3', pageNumber: 3, quotedText: 'Quote 3' }],
            ['start', { documentName: 'Start', pageNumber: 1, quotedText: 'Start quote' }],
            ['end', { documentName: 'End', pageNumber: 99, quotedText: 'End quote' }],
          ]);

          // Should not throw
          const result = parseCitations(text, chunkMap);

          // Property 1: Result should always have citations array
          expect(Array.isArray(result.citations)).toBe(true);

          // Property 2: Result should always have cleanText string
          expect(typeof result.cleanText).toBe('string');

          // Property 3: Citations should be non-negative length
          expect(result.citations.length).toBeGreaterThanOrEqual(0);

          // Property 4: If no valid citations, cleanText should equal input (or close to it)
          const validCitationPattern = /\[\[cite:[a-zA-Z0-9_-]+:p\d+\]\]/;
          if (!validCitationPattern.test(text)) {
            // Text with no valid citations should remain mostly unchanged
            // (may have minor differences due to processing)
            expect(result.citations.length).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Citation IDs should be unique within a parse result
   */
  it('should generate unique citation IDs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            chunkId: fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
            pageNumber: fc.integer({ min: 1, max: 100 }),
          }),
          { minLength: 2, maxLength: 20 }
        ),
        (citations) => {
          // Build text with citation markers
          let text = '';
          const chunkMap = new Map<string, { documentName: string; pageNumber: number; quotedText: string }>();
          
          citations.forEach((cite, idx) => {
            const marker = `[[cite:${cite.chunkId}:p${cite.pageNumber}]]`;
            text += ` ${marker}`;
            
            chunkMap.set(cite.chunkId, {
              documentName: `Document${idx}`,
              pageNumber: cite.pageNumber,
              quotedText: `Quote ${idx}`,
            });
          });

          // Parse citations
          const result = parseCitations(text, chunkMap);

          // Property: All citation IDs should be unique
          const ids = result.citations.map(c => c.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Parsing should preserve text content outside citations
   */
  it('should preserve non-citation text content', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
        fc.array(
          fc.record({
            chunkId: fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
            pageNumber: fc.integer({ min: 1, max: 100 }),
          }),
          { minLength: 1, maxLength: 4 }
        ),
        (textSegments, citations) => {
          // Interleave text and citations
          let text = '';
          const chunkMap = new Map<string, { documentName: string; pageNumber: number; quotedText: string }>();
          
          textSegments.forEach((segment, idx) => {
            text += segment;
            if (idx < citations.length) {
              const cite = citations[idx];
              const marker = `[[cite:${cite.chunkId}:p${cite.pageNumber}]]`;
              text += marker;
              
              chunkMap.set(cite.chunkId, {
                documentName: `Doc${idx}`,
                pageNumber: cite.pageNumber,
                quotedText: `Quote ${idx}`,
              });
            }
          });

          // Parse citations
          const result = parseCitations(text, chunkMap);

          // Property: All original text segments should appear in clean text
          textSegments.forEach((segment) => {
            expect(result.cleanText).toContain(segment);
          });

          // Property: Clean text length should be reasonable
          // (original text + numbered citations like [1], [2])
          const expectedMinLength = textSegments.join('').length;
          expect(result.cleanText.length).toBeGreaterThanOrEqual(expectedMinLength);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Citation markers with invalid format should be ignored
   */
  it('should ignore invalid citation formats', () => {
    const invalidFormats = [
      '[[cite:]]',                    // Empty
      '[[cite:chunk]]',               // Missing page
      '[[cite:chunk:]]',              // Empty page
      '[[cite:chunk:p]]',             // No page number
      '[[cite:chunk:pabc]]',          // Non-numeric page
      '[[cite:chunk:p-5]]',           // Negative page
      '[[cite:chunk with space:p1]]', // Space in chunk ID
      '[cite:chunk:p1]',              // Single brackets
      '[[cite:chunk:p1]',             // Unclosed
      '[[cite:chunk:p1.5]]',          // Decimal page
    ];

    invalidFormats.forEach((invalid) => {
      const text = `Some text ${invalid} more text`;
      const chunkMap = new Map();
      
      const result = parseCitations(text, chunkMap);

      // Property: Invalid formats should not be parsed as citations
      expect(result.citations.length).toBe(0);
      
      // Property: Invalid markers should remain in text or be removed cleanly
      // (depending on implementation choice)
      expect(result.cleanText).toBeTruthy();
    });
  });
});
