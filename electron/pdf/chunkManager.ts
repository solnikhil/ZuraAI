/**
 * Chunk Manager Service
 * 
 * This service handles document chunking for the RAG pipeline.
 * It provides methods for:
 * - Fixed-size chunking with configurable parameters
 * - Semantic chunking that respects paragraph/section boundaries
 * - Token counting for chunk size management
 * - Chunk storage and retrieval
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.8
 */

import type {
  TextBlock,
  Chunk,
  ChunkMetadata,
  BoundingBox,
} from '../../src/types/pdf';
import type {
  IChunkManager,
  ChunkingOptions,
  ChunkBuilderState,
} from './types';

/**
 * Default chunking options
 */
const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 512,
  chunkOverlap: 128,
  strategy: 'fixed',
  preserveSections: true,
};

/**
 * Simple token counting approximation
 * Uses whitespace-based word counting with a multiplier
 * More accurate than character counting for most text
 */
function countTokensSimple(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }
  
  // Split by whitespace and filter empty strings
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  // Approximate tokens: ~1.3 tokens per word on average for English text
  // This is a reasonable approximation without a full tokenizer
  return Math.ceil(words.length * 1.3);
}

/**
 * Generate a unique chunk ID
 */
function generateChunkId(documentId: string, chunkIndex: number): string {
  const timestamp = Date.now().toString(36);
  return `chunk_${documentId.substring(0, 8)}_${chunkIndex}_${timestamp}`;
}

/**
 * Merge bounding boxes from multiple text blocks
 * Returns an array of bounding boxes, one per page
 */
function mergeBoundingBoxes(blocks: TextBlock[]): BoundingBox[] {
  if (blocks.length === 0) {
    return [];
  }

  // Group blocks by page
  const pageGroups = new Map<number, TextBlock[]>();
  for (const block of blocks) {
    const pageNum = block.bbox.pageNumber;
    if (!pageGroups.has(pageNum)) {
      pageGroups.set(pageNum, []);
    }
    pageGroups.get(pageNum)!.push(block);
  }

  // Create merged bounding box for each page
  const mergedBoxes: BoundingBox[] = [];
  for (const [pageNumber, pageBlocks] of pageGroups) {
    const x0 = Math.min(...pageBlocks.map(b => b.bbox.x0));
    const y0 = Math.min(...pageBlocks.map(b => b.bbox.y0));
    const x1 = Math.max(...pageBlocks.map(b => b.bbox.x1));
    const y1 = Math.max(...pageBlocks.map(b => b.bbox.y1));

    mergedBoxes.push({ x0, y0, x1, y1, pageNumber });
  }

  // Sort by page number
  mergedBoxes.sort((a, b) => a.pageNumber - b.pageNumber);

  return mergedBoxes;
}

/**
 * Extract unique page numbers from text blocks
 */
function extractPageNumbers(blocks: TextBlock[]): number[] {
  const pages = new Set<number>();
  for (const block of blocks) {
    pages.add(block.bbox.pageNumber);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Determine the primary block type from a set of blocks
 */
function determineBlockType(blocks: TextBlock[]): 'text' | 'table' | 'figure' {
  // Count block types
  const typeCounts = { text: 0, table: 0, figure: 0 };
  
  for (const block of blocks) {
    if (block.blockType === 'caption') {
      typeCounts.figure++;
    } else if (block.blockType === 'heading' || block.blockType === 'paragraph' || block.blockType === 'list') {
      typeCounts.text++;
    }
  }

  // Return the most common type
  if (typeCounts.table > typeCounts.text && typeCounts.table > typeCounts.figure) {
    return 'table';
  }
  if (typeCounts.figure > typeCounts.text) {
    return 'figure';
  }
  return 'text';
}

/**
 * Find the current section header for a block
 */
function findSectionHeader(blocks: TextBlock[], currentIndex: number): string | undefined {
  // Look backwards for the most recent heading
  for (let i = currentIndex; i >= 0; i--) {
    if (blocks[i].blockType === 'heading') {
      return blocks[i].text.trim();
    }
  }
  return undefined;
}

/**
 * Check if text ends with a sentence boundary
 */
function endsWithSentence(text: string): boolean {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) || /[.!?]["']$/.test(trimmed);
}

/**
 * Check if text starts a new paragraph (heuristic)
 */
function startsNewParagraph(text: string): boolean {
  // Check for common paragraph indicators
  return /^[A-Z]/.test(text.trim()) || /^\d+\./.test(text.trim());
}

/**
 * Chunk Manager Service implementation
 * 
 * Manages document chunking for RAG retrieval.
 * Supports fixed-size and semantic chunking strategies.
 */
export class ChunkManager implements IChunkManager {
  /** Map of chunks by ID */
  private chunks: Map<string, Chunk> = new Map();
  
  /** Map of document ID to chunk IDs */
  private documentChunks: Map<string, string[]> = new Map();

  /**
   * Count tokens in a text string
   * 
   * @param text - Text to count tokens for
   * @returns Number of tokens
   */
  countTokens(text: string): number {
    return countTokensSimple(text);
  }

  /**
   * Create chunks from text blocks using the specified strategy
   * 
   * Implements Requirements 6.1, 6.2, 6.3
   * 
   * @param docId - Document ID
   * @param textBlocks - Array of text blocks from the document
   * @param options - Chunking options
   * @returns Array of created chunks
   */
  createChunks(
    docId: string,
    textBlocks: TextBlock[],
    options: ChunkingOptions = DEFAULT_CHUNKING_OPTIONS
  ): Chunk[] {
    const mergedOptions = { ...DEFAULT_CHUNKING_OPTIONS, ...options };
    
    // Clear any existing chunks for this document
    this.deleteChunksForDocument(docId);

    if (textBlocks.length === 0) {
      return [];
    }

    let chunks: Chunk[];
    
    switch (mergedOptions.strategy) {
      case 'semantic':
        chunks = this.createSemanticChunks(docId, textBlocks, mergedOptions);
        break;
      case 'paragraph':
        chunks = this.createParagraphChunks(docId, textBlocks, mergedOptions);
        break;
      case 'fixed':
      default:
        chunks = this.createFixedSizeChunks(docId, textBlocks, mergedOptions);
        break;
    }

    // Store chunks
    const chunkIds: string[] = [];
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
      chunkIds.push(chunk.id);
    }
    this.documentChunks.set(docId, chunkIds);

    return chunks;
  }

  /**
   * Create fixed-size chunks with overlap
   * 
   * Implements Requirements 6.1, 6.2, 6.3
   * 
   * @param docId - Document ID
   * @param textBlocks - Array of text blocks
   * @param options - Chunking options
   * @returns Array of chunks
   */
  private createFixedSizeChunks(
    docId: string,
    textBlocks: TextBlock[],
    options: ChunkingOptions
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const { chunkSize, chunkOverlap, preserveSections } = options;

    // Combine all text blocks into a single stream with metadata
    const textStream: Array<{
      text: string;
      block: TextBlock;
      blockIndex: number;
    }> = [];

    for (let i = 0; i < textBlocks.length; i++) {
      const block = textBlocks[i];
      if (block.text.trim().length > 0) {
        textStream.push({
          text: block.text,
          block,
          blockIndex: i,
        });
      }
    }

    if (textStream.length === 0) {
      return [];
    }

    // Build chunks
    let currentContent = '';
    let currentBlocks: TextBlock[] = [];
    let currentTokenCount = 0;
    let chunkIndex = 0;
    let currentSectionHeader: string | undefined;

    for (let i = 0; i < textStream.length; i++) {
      const { text, block, blockIndex } = textStream[i];
      const textTokens = this.countTokens(text);

      // Update section header if this is a heading
      if (block.blockType === 'heading' && preserveSections) {
        currentSectionHeader = block.text.trim();
      }

      // Check if adding this text would exceed chunk size
      if (currentTokenCount + textTokens > chunkSize && currentContent.length > 0) {
        // Create chunk from current content
        const chunk = this.buildChunk(
          docId,
          chunkIndex,
          currentContent.trim(),
          currentBlocks,
          currentSectionHeader
        );
        chunks.push(chunk);
        chunkIndex++;

        // Handle overlap: keep some content for the next chunk
        if (chunkOverlap > 0) {
          const overlapResult = this.calculateOverlap(
            currentContent,
            currentBlocks,
            chunkOverlap
          );
          currentContent = overlapResult.content;
          currentBlocks = overlapResult.blocks;
          currentTokenCount = this.countTokens(currentContent);
        } else {
          currentContent = '';
          currentBlocks = [];
          currentTokenCount = 0;
        }
      }

      // Add text to current chunk
      if (currentContent.length > 0) {
        currentContent += ' ';
      }
      currentContent += text;
      currentBlocks.push(block);
      currentTokenCount += textTokens;
    }

    // Create final chunk if there's remaining content
    if (currentContent.trim().length > 0) {
      const chunk = this.buildChunk(
        docId,
        chunkIndex,
        currentContent.trim(),
        currentBlocks,
        currentSectionHeader
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Create semantic chunks that respect paragraph and section boundaries
   * 
   * Implements Requirement 6.8
   * 
   * @param docId - Document ID
   * @param textBlocks - Array of text blocks
   * @param options - Chunking options
   * @returns Array of chunks
   */
  private createSemanticChunks(
    docId: string,
    textBlocks: TextBlock[],
    options: ChunkingOptions
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const { chunkSize, chunkOverlap, preserveSections } = options;

    let currentContent = '';
    let currentBlocks: TextBlock[] = [];
    let currentTokenCount = 0;
    let chunkIndex = 0;
    let currentSectionHeader: string | undefined;
    let lastBlockWasHeading = false;

    for (let i = 0; i < textBlocks.length; i++) {
      const block = textBlocks[i];
      const text = block.text.trim();
      
      if (text.length === 0) {
        continue;
      }

      const textTokens = this.countTokens(text);
      const isHeading = block.blockType === 'heading';

      // Update section header
      if (isHeading && preserveSections) {
        currentSectionHeader = text;
      }

      // Determine if we should start a new chunk
      const shouldStartNewChunk = 
        // Exceeded chunk size
        (currentTokenCount + textTokens > chunkSize && currentContent.length > 0) ||
        // New section (heading) and we have content
        (isHeading && currentContent.length > 0 && !lastBlockWasHeading) ||
        // Previous content ends with sentence and we're at a good break point
        (currentTokenCount > chunkSize * 0.7 && 
         endsWithSentence(currentContent) && 
         startsNewParagraph(text));

      if (shouldStartNewChunk) {
        // Create chunk from current content
        const chunk = this.buildChunk(
          docId,
          chunkIndex,
          currentContent.trim(),
          currentBlocks,
          currentSectionHeader
        );
        chunks.push(chunk);
        chunkIndex++;

        // Handle overlap
        if (chunkOverlap > 0 && !isHeading) {
          const overlapResult = this.calculateOverlap(
            currentContent,
            currentBlocks,
            chunkOverlap
          );
          currentContent = overlapResult.content;
          currentBlocks = overlapResult.blocks;
          currentTokenCount = this.countTokens(currentContent);
        } else {
          currentContent = '';
          currentBlocks = [];
          currentTokenCount = 0;
        }
      }

      // Add text to current chunk
      if (currentContent.length > 0 && !isHeading) {
        currentContent += ' ';
      } else if (currentContent.length > 0 && isHeading) {
        currentContent += '\n\n';
      }
      currentContent += text;
      currentBlocks.push(block);
      currentTokenCount += textTokens;
      lastBlockWasHeading = isHeading;
    }

    // Create final chunk
    if (currentContent.trim().length > 0) {
      const chunk = this.buildChunk(
        docId,
        chunkIndex,
        currentContent.trim(),
        currentBlocks,
        currentSectionHeader
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Create paragraph-based chunks
   * Each paragraph becomes its own chunk (up to size limit)
   * 
   * @param docId - Document ID
   * @param textBlocks - Array of text blocks
   * @param options - Chunking options
   * @returns Array of chunks
   */
  private createParagraphChunks(
    docId: string,
    textBlocks: TextBlock[],
    options: ChunkingOptions
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const { chunkSize, preserveSections } = options;

    let currentContent = '';
    let currentBlocks: TextBlock[] = [];
    let currentTokenCount = 0;
    let chunkIndex = 0;
    let currentSectionHeader: string | undefined;

    for (let i = 0; i < textBlocks.length; i++) {
      const block = textBlocks[i];
      const text = block.text.trim();
      
      if (text.length === 0) {
        continue;
      }

      const textTokens = this.countTokens(text);
      const isHeading = block.blockType === 'heading';
      const isParagraph = block.blockType === 'paragraph';

      // Update section header
      if (isHeading && preserveSections) {
        currentSectionHeader = text;
      }

      // Start new chunk on paragraph boundary if we have content
      if (isParagraph && currentContent.length > 0 && currentTokenCount > 0) {
        // Create chunk from current content
        const chunk = this.buildChunk(
          docId,
          chunkIndex,
          currentContent.trim(),
          currentBlocks,
          currentSectionHeader
        );
        chunks.push(chunk);
        chunkIndex++;

        currentContent = '';
        currentBlocks = [];
        currentTokenCount = 0;
      }

      // Handle oversized paragraphs by splitting
      if (textTokens > chunkSize) {
        // If we have pending content, flush it first
        if (currentContent.length > 0) {
          const chunk = this.buildChunk(
            docId,
            chunkIndex,
            currentContent.trim(),
            currentBlocks,
            currentSectionHeader
          );
          chunks.push(chunk);
          chunkIndex++;
          currentContent = '';
          currentBlocks = [];
          currentTokenCount = 0;
        }

        // Split the large paragraph
        const splitChunks = this.splitLargeParagraph(
          docId,
          chunkIndex,
          text,
          block,
          chunkSize,
          currentSectionHeader
        );
        chunks.push(...splitChunks);
        chunkIndex += splitChunks.length;
        continue;
      }

      // Check if adding would exceed size
      if (currentTokenCount + textTokens > chunkSize && currentContent.length > 0) {
        const chunk = this.buildChunk(
          docId,
          chunkIndex,
          currentContent.trim(),
          currentBlocks,
          currentSectionHeader
        );
        chunks.push(chunk);
        chunkIndex++;

        currentContent = '';
        currentBlocks = [];
        currentTokenCount = 0;
      }

      // Add to current chunk
      if (currentContent.length > 0) {
        currentContent += ' ';
      }
      currentContent += text;
      currentBlocks.push(block);
      currentTokenCount += textTokens;
    }

    // Final chunk
    if (currentContent.trim().length > 0) {
      const chunk = this.buildChunk(
        docId,
        chunkIndex,
        currentContent.trim(),
        currentBlocks,
        currentSectionHeader
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Split a large paragraph into multiple chunks
   */
  private splitLargeParagraph(
    docId: string,
    startIndex: number,
    text: string,
    block: TextBlock,
    chunkSize: number,
    sectionHeader?: string
  ): Chunk[] {
    const chunks: Chunk[] = [];
    
    // Split by sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    let currentContent = '';
    let currentTokenCount = 0;
    let chunkIndex = startIndex;

    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);

      if (currentTokenCount + sentenceTokens > chunkSize && currentContent.length > 0) {
        // Create chunk
        const chunk: Chunk = {
          id: generateChunkId(docId, chunkIndex),
          documentId: docId,
          content: currentContent.trim(),
          metadata: {
            pageNumbers: [block.bbox.pageNumber],
            boundingBoxes: [block.bbox],
            sectionHeader,
            chunkIndex,
            tokenCount: currentTokenCount,
            blockType: 'text',
          },
        };
        chunks.push(chunk);
        chunkIndex++;

        currentContent = '';
        currentTokenCount = 0;
      }

      currentContent += sentence;
      currentTokenCount += sentenceTokens;
    }

    // Final chunk
    if (currentContent.trim().length > 0) {
      const chunk: Chunk = {
        id: generateChunkId(docId, chunkIndex),
        documentId: docId,
        content: currentContent.trim(),
        metadata: {
          pageNumbers: [block.bbox.pageNumber],
          boundingBoxes: [block.bbox],
          sectionHeader,
          chunkIndex,
          tokenCount: currentTokenCount,
          blockType: 'text',
        },
      };
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Calculate overlap content for the next chunk
   */
  private calculateOverlap(
    content: string,
    blocks: TextBlock[],
    overlapTokens: number
  ): { content: string; blocks: TextBlock[] } {
    // Split content into words
    const words = content.split(/\s+/);
    
    // Calculate how many words to keep (approximate)
    const wordsToKeep = Math.ceil(overlapTokens / 1.3);
    
    if (wordsToKeep >= words.length) {
      return { content, blocks };
    }

    // Keep the last N words
    const overlapWords = words.slice(-wordsToKeep);
    const overlapContent = overlapWords.join(' ');

    // Keep blocks that might contain the overlap content
    // This is an approximation - we keep the last few blocks
    const blocksToKeep = Math.min(blocks.length, Math.ceil(wordsToKeep / 10));
    const overlapBlocks = blocks.slice(-blocksToKeep);

    return {
      content: overlapContent,
      blocks: overlapBlocks,
    };
  }

  /**
   * Build a chunk from accumulated content and blocks
   */
  private buildChunk(
    docId: string,
    chunkIndex: number,
    content: string,
    blocks: TextBlock[],
    sectionHeader?: string
  ): Chunk {
    const pageNumbers = extractPageNumbers(blocks);
    const boundingBoxes = mergeBoundingBoxes(blocks);
    const blockType = determineBlockType(blocks);
    const tokenCount = this.countTokens(content);

    const metadata: ChunkMetadata = {
      pageNumbers,
      boundingBoxes,
      sectionHeader,
      chunkIndex,
      tokenCount,
      blockType,
    };

    return {
      id: generateChunkId(docId, chunkIndex),
      documentId: docId,
      content,
      metadata,
    };
  }

  /**
   * Get a chunk by ID
   * 
   * @param chunkId - Chunk ID
   * @returns Chunk or undefined if not found
   */
  getChunk(chunkId: string): Chunk | undefined {
    return this.chunks.get(chunkId);
  }

  /**
   * Get all chunks for a document
   * 
   * Implements Requirement 6.3
   * 
   * @param docId - Document ID
   * @returns Array of chunks for the document
   */
  getChunksForDocument(docId: string): Chunk[] {
    const chunkIds = this.documentChunks.get(docId);
    if (!chunkIds) {
      return [];
    }

    const chunks: Chunk[] = [];
    for (const id of chunkIds) {
      const chunk = this.chunks.get(id);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    // Sort by chunk index
    chunks.sort((a, b) => a.metadata.chunkIndex - b.metadata.chunkIndex);

    return chunks;
  }

  /**
   * Delete all chunks for a document
   * 
   * Implements Requirement 6.3
   * 
   * @param docId - Document ID
   */
  deleteChunksForDocument(docId: string): void {
    const chunkIds = this.documentChunks.get(docId);
    if (chunkIds) {
      for (const id of chunkIds) {
        this.chunks.delete(id);
      }
      this.documentChunks.delete(docId);
    }
  }

  /**
   * Get total number of chunks stored
   */
  getTotalChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Get number of documents with chunks
   */
  getDocumentCount(): number {
    return this.documentChunks.size;
  }

  /**
   * Clear all chunks from memory
   */
  clearAll(): void {
    this.chunks.clear();
    this.documentChunks.clear();
  }
}

/**
 * Singleton instance of the chunk manager
 */
export const chunkManager = new ChunkManager();
