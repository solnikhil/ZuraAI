/**
 * Unit Tests for Chunk Manager Service
 * 
 * This file contains unit tests for the ChunkManager class,
 * testing specific examples and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChunkManager } from './chunkManager';
import type { TextBlock, BoundingBox } from '../../src/types/pdf';

describe('ChunkManager', () => {
  let chunkManager: ChunkManager;

  beforeEach(() => {
    chunkManager = new ChunkManager();
  });

  afterEach(() => {
    chunkManager.clearAll();
  });

  /**
   * Helper to create a text block
   */
  function createTextBlock(
    text: string,
    pageNumber: number,
    blockType: 'paragraph' | 'heading' | 'list' | 'caption' = 'paragraph'
  ): TextBlock {
    return {
      id: `block_${Math.random().toString(36).substring(2, 10)}`,
      text,
      bbox: {
        x0: 50,
        y0: 100,
        x1: 500,
        y1: 120,
        pageNumber,
      },
      blockType,
      fontSize: 12,
      fontName: 'Arial',
    };
  }

  describe('countTokens', () => {
    it('should return 0 for empty string', () => {
      expect(chunkManager.countTokens('')).toBe(0);
    });

    it('should return 0 for whitespace-only string', () => {
      expect(chunkManager.countTokens('   ')).toBe(0);
    });

    it('should count tokens for simple text', () => {
      const tokens = chunkManager.countTokens('Hello world');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should count tokens for longer text', () => {
      const text = 'This is a longer sentence with multiple words that should produce more tokens.';
      const tokens = chunkManager.countTokens(text);
      expect(tokens).toBeGreaterThan(10);
    });
  });

  describe('createChunks', () => {
    it('should return empty array for empty text blocks', () => {
      const chunks = chunkManager.createChunks('doc1', [], {
        chunkSize: 512,
        chunkOverlap: 128,
        strategy: 'fixed',
        preserveSections: true,
      });
      expect(chunks).toEqual([]);
    });

    it('should create a single chunk for small content', () => {
      const blocks = [
        createTextBlock('Hello world', 1),
      ];
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 512,
        chunkOverlap: 128,
        strategy: 'fixed',
        preserveSections: true,
      });
      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toContain('Hello world');
    });

    it('should create multiple chunks for large content', () => {
      const blocks = Array.from({ length: 50 }, (_, i) =>
        createTextBlock(`This is paragraph ${i + 1} with some content that takes up space.`, 1)
      );
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 100,
        chunkOverlap: 20,
        strategy: 'fixed',
        preserveSections: true,
      });
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should preserve page numbers in chunk metadata', () => {
      const blocks = [
        createTextBlock('Page 1 content', 1),
        createTextBlock('Page 2 content', 2),
        createTextBlock('Page 3 content', 3),
      ];
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'fixed',
        preserveSections: true,
      });
      
      // All page numbers should be present
      const allPages = new Set<number>();
      for (const chunk of chunks) {
        for (const page of chunk.metadata.pageNumbers) {
          allPages.add(page);
        }
      }
      expect(allPages.has(1)).toBe(true);
      expect(allPages.has(2)).toBe(true);
      expect(allPages.has(3)).toBe(true);
    });

    it('should preserve section headers', () => {
      const blocks = [
        createTextBlock('Introduction', 1, 'heading'),
        createTextBlock('This is the introduction content.', 1),
        createTextBlock('Methods', 1, 'heading'),
        createTextBlock('This is the methods content.', 1),
      ];
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'semantic',
        preserveSections: true,
      });
      
      // At least one chunk should have a section header
      const hasHeader = chunks.some(c => c.metadata.sectionHeader !== undefined);
      expect(hasHeader).toBe(true);
    });

    it('should set correct document ID on all chunks', () => {
      const blocks = [
        createTextBlock('Content 1', 1),
        createTextBlock('Content 2', 1),
      ];
      const chunks = chunkManager.createChunks('my-doc-id', blocks, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'fixed',
        preserveSections: true,
      });
      
      for (const chunk of chunks) {
        expect(chunk.documentId).toBe('my-doc-id');
      }
    });
  });

  describe('getChunk', () => {
    it('should return undefined for non-existent chunk', () => {
      expect(chunkManager.getChunk('non-existent')).toBeUndefined();
    });

    it('should return chunk by ID', () => {
      const blocks = [createTextBlock('Test content', 1)];
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'fixed',
        preserveSections: true,
      });
      
      const retrieved = chunkManager.getChunk(chunks[0].id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(chunks[0].id);
      expect(retrieved?.content).toBe(chunks[0].content);
    });
  });

  describe('getChunksForDocument', () => {
    it('should return empty array for non-existent document', () => {
      expect(chunkManager.getChunksForDocument('non-existent')).toEqual([]);
    });

    it('should return all chunks for a document', () => {
      const blocks = Array.from({ length: 20 }, (_, i) =>
        createTextBlock(`Paragraph ${i + 1}`, 1)
      );
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 50,
        chunkOverlap: 10,
        strategy: 'fixed',
        preserveSections: true,
      });
      
      const retrieved = chunkManager.getChunksForDocument('doc1');
      expect(retrieved.length).toBe(chunks.length);
    });

    it('should return chunks sorted by chunk index', () => {
      const blocks = Array.from({ length: 20 }, (_, i) =>
        createTextBlock(`Paragraph ${i + 1}`, 1)
      );
      chunkManager.createChunks('doc1', blocks, {
        chunkSize: 50,
        chunkOverlap: 10,
        strategy: 'fixed',
        preserveSections: true,
      });
      
      const retrieved = chunkManager.getChunksForDocument('doc1');
      for (let i = 1; i < retrieved.length; i++) {
        expect(retrieved[i].metadata.chunkIndex).toBeGreaterThan(
          retrieved[i - 1].metadata.chunkIndex
        );
      }
    });
  });

  describe('deleteChunksForDocument', () => {
    it('should delete all chunks for a document', () => {
      const blocks = [createTextBlock('Test content', 1)];
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'fixed',
        preserveSections: true,
      });
      
      expect(chunkManager.getChunksForDocument('doc1').length).toBe(1);
      
      chunkManager.deleteChunksForDocument('doc1');
      
      expect(chunkManager.getChunksForDocument('doc1').length).toBe(0);
      expect(chunkManager.getChunk(chunks[0].id)).toBeUndefined();
    });

    it('should not affect other documents', () => {
      const blocks1 = [createTextBlock('Doc 1 content', 1)];
      const blocks2 = [createTextBlock('Doc 2 content', 1)];
      
      chunkManager.createChunks('doc1', blocks1, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'fixed',
        preserveSections: true,
      });
      chunkManager.createChunks('doc2', blocks2, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'fixed',
        preserveSections: true,
      });
      
      chunkManager.deleteChunksForDocument('doc1');
      
      expect(chunkManager.getChunksForDocument('doc1').length).toBe(0);
      expect(chunkManager.getChunksForDocument('doc2').length).toBe(1);
    });
  });

  describe('chunking strategies', () => {
    it('should use fixed strategy by default', () => {
      const blocks = Array.from({ length: 10 }, (_, i) =>
        createTextBlock(`Paragraph ${i + 1} with some content.`, 1)
      );
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 100,
        chunkOverlap: 20,
        strategy: 'fixed',
        preserveSections: true,
      });
      
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should support semantic strategy', () => {
      const blocks = [
        createTextBlock('Introduction', 1, 'heading'),
        createTextBlock('This is the introduction.', 1),
        createTextBlock('Methods', 1, 'heading'),
        createTextBlock('This is the methods section.', 1),
      ];
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'semantic',
        preserveSections: true,
      });
      
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should support paragraph strategy', () => {
      const blocks = [
        createTextBlock('First paragraph.', 1, 'paragraph'),
        createTextBlock('Second paragraph.', 1, 'paragraph'),
        createTextBlock('Third paragraph.', 1, 'paragraph'),
      ];
      const chunks = chunkManager.createChunks('doc1', blocks, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'paragraph',
        preserveSections: true,
      });
      
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all chunks', () => {
      const blocks = [createTextBlock('Test content', 1)];
      chunkManager.createChunks('doc1', blocks, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'fixed',
        preserveSections: true,
      });
      chunkManager.createChunks('doc2', blocks, {
        chunkSize: 512,
        chunkOverlap: 0,
        strategy: 'fixed',
        preserveSections: true,
      });
      
      expect(chunkManager.getTotalChunkCount()).toBe(2);
      expect(chunkManager.getDocumentCount()).toBe(2);
      
      chunkManager.clearAll();
      
      expect(chunkManager.getTotalChunkCount()).toBe(0);
      expect(chunkManager.getDocumentCount()).toBe(0);
    });
  });
});
