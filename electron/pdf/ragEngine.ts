/**
 * RAG Engine
 * 
 * This service orchestrates the complete RAG (Retrieval-Augmented Generation) pipeline
 * for PDF document intelligence. It coordinates:
 * - Document parsing → chunking → embedding → indexing
 * - Query → retrieve → format context flow
 * - Context building for AI prompts with citation markers
 * - Query rewriting and expansion with conversation context
 * 
 * Requirements: 6.1, 6.4, 7.4, 7.9, 8.1, 22.1, 22.2, 22.3, 22.4, 22.5
 */

import type {
  PDFDocument,
  Chunk,
  QueryOptions,
  RetrievalResult,
  RAGResponse,
  Citation,
  IndexOptions,
  IndexResult,
  IndexStatus,
  PDFRAGSettings,
  DEFAULT_PDF_RAG_SETTINGS,
  CITATION_PATTERN,
} from '../../src/types/pdf';
import type {
  IRAGEngine,
  IPDFParserService,
  IChunkManager,
  IEmbeddingService,
  IVectorStore,
  IRetrievalService,
  ContextBuildOptions,
  BuiltContext,
  ConversationContext,
  ChunkingOptions,
  DocumentRecord,
  ChunkRecord,
} from './types';
import { pdfParserService } from './pdfParser';
import { chunkManager } from './chunkManager';
import { embeddingService } from './embeddingService';
import { vectorStore } from './vectorStore';
import { retrievalService } from './retrievalService';
import { imageProcessorService, type ImageProcessingResult } from './imageProcessor';

// =============================================================================
// Constants
// =============================================================================

/** Default context building options */
const DEFAULT_CONTEXT_OPTIONS: ContextBuildOptions = {
  maxTokens: 4000,
  maxSources: 8,
  includeCitationMarkers: true,
  format: 'markdown',
};

/** Maximum conversation context messages to consider */
const MAX_CONTEXT_MESSAGES = 5;

/** View-relative reference patterns for query rewriting (without 'g' flag for test()) */
const VIEW_REFERENCE_PATTERNS = [
  { pattern: /\bthis page\b/i, type: 'page' },
  { pattern: /\bcurrent page\b/i, type: 'page' },
  { pattern: /\bthe table above\b/i, type: 'table' },
  { pattern: /\bthe figure above\b/i, type: 'figure' },
  { pattern: /\bthe image above\b/i, type: 'figure' },
  { pattern: /\bthis section\b/i, type: 'section' },
  { pattern: /\bhere\b/i, type: 'context' },
];

/** Pronoun patterns for resolution */
const PRONOUN_PATTERNS = [
  /\bit\b/gi,
  /\bthis\b/gi,
  /\bthat\b/gi,
  /\bthey\b/gi,
  /\bthem\b/gi,
  /\bthese\b/gi,
  /\bthose\b/gi,
];

/** 
 * Overview/summary query patterns - queries that ask about the document as a whole
 * These should retrieve from early pages (intro/abstract) with lower score thresholds
 */
const OVERVIEW_QUERY_PATTERNS = [
  /what is this (document|pdf|file|paper) about/i,
  /what does this (document|pdf|file|paper) (cover|contain|discuss|describe|explain)/i,
  /summarize (this|the) (document|pdf|file|paper)/i,
  /give (me )?(a |an )?(brief )?(summary|overview|synopsis)/i,
  /^(summary|overview|synopsis|abstract)$/i,
  /what('s| is) the (main|key) (topic|subject|point|idea)/i,
  /tell me about this (document|pdf|file|paper)/i,
  /^what is this about\??$/i,
  /describe (this|the) (document|pdf|file|paper)/i,
];

/**
 * Check if query is asking for a document overview/summary
 */
function isOverviewQuery(query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return OVERVIEW_QUERY_PATTERNS.some(pattern => pattern.test(normalizedQuery));
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique citation ID
 */
function generateCitationId(chunkId: string, index: number): string {
  return `cite_${chunkId.substring(0, 8)}_${index}`;
}

/**
 * Estimate token count for text (simple approximation)
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  // Approximate: ~1.3 tokens per word
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return Math.ceil(words.length * 1.3);
}

/**
 * Truncate text to fit within token limit
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) {
    return text;
  }

  // Approximate words to keep
  const wordsToKeep = Math.floor(maxTokens / 1.3);
  const words = text.split(/\s+/);
  return words.slice(0, wordsToKeep).join(' ') + '...';
}

/**
 * Check if query contains view-relative references
 */
function hasViewReference(query: string): boolean {
  return VIEW_REFERENCE_PATTERNS.some(({ pattern }) => pattern.test(query));
}

/**
 * Check if query contains pronouns that need resolution
 */
function hasPronouns(query: string): boolean {
  return PRONOUN_PATTERNS.some(pattern => pattern.test(query));
}

/**
 * Extract key terms from text for context expansion
 */
function extractKeyTerms(text: string, maxTerms: number = 5): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'and',
    'but', 'if', 'or', 'because', 'what', 'which', 'who', 'this', 'that',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
    'she', 'her', 'it', 'its', 'they', 'them', 'their',
  ]);

  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Count word frequency
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }

  // Sort by frequency and return top terms
  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(([word]) => word);
}


// =============================================================================
// RAG Engine Implementation
// =============================================================================

/**
 * RAG Engine
 * 
 * Orchestrates the complete RAG pipeline for PDF document intelligence.
 * Handles document indexing, query processing, retrieval, and context building.
 */
export class RAGEngine implements IRAGEngine {
  private pdfParser: IPDFParserService;
  private chunkMgr: IChunkManager;
  private embedService: IEmbeddingService;
  private vecStore: IVectorStore;
  private retrieval: IRetrievalService;

  /** Map of document IDs to their indexing status */
  private indexingStatus: Map<string, IndexStatus> = new Map();

  /** Settings for RAG operations */
  private settings: PDFRAGSettings;

  constructor(
    parser: IPDFParserService = pdfParserService,
    chunker: IChunkManager = chunkManager,
    embedder: IEmbeddingService = embeddingService,
    store: IVectorStore = vectorStore,
    retriever: IRetrievalService = retrievalService,
    settings?: Partial<PDFRAGSettings>
  ) {
    this.pdfParser = parser;
    this.chunkMgr = chunker;
    this.embedService = embedder;
    this.vecStore = store;
    this.retrieval = retriever;

    // Import default settings dynamically to avoid circular dependency
    this.settings = {
      chunkSize: 256,  // Smaller chunks to fit within embedding model context
      chunkOverlap: 64,
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
      // Image processing settings
      processImages: true,
      visionModel: 'qwen2-vl:2b',
      enableOCRFallback: true,
      preferVisionOverOCR: true,
      ...settings,
    };
  }

  /**
   * Index a document for RAG retrieval
   * 
   * Orchestrates: parsing → chunking → embedding → indexing
   * 
   * Implements Requirements 6.1, 6.4, 18.6, 19.3
   * 
   * @param docId - Document ID to index
   * @param options - Indexing options
   * @param onProgress - Optional callback for progress updates (0-100)
   * @param onLog - Optional callback for detailed log messages
   * @returns Index result with statistics
   */
  async indexDocument(
    docId: string,
    options: IndexOptions = {},
    onProgress?: (progress: number) => void,
    onLog?: (level: 'info' | 'success' | 'warning' | 'error', message: string) => void
  ): Promise<IndexResult> {
    const startTime = Date.now();

    // Helper to update progress both internally and via callback
    const reportProgress = (progress: number) => {
      this.updateIndexingProgress(docId, progress);
      if (onProgress) {
        onProgress(progress);
      }
    };

    // Helper to log messages
    const log = (level: 'info' | 'success' | 'warning' | 'error', message: string) => {
      console.log(`[RAGEngine] [${level.toUpperCase()}] ${message}`);
      if (onLog) {
        onLog(level, message);
      }
    };

    // Update status to indexing
    this.indexingStatus.set(docId, {
      isIndexed: false,
      chunkCount: 0,
      isIndexing: true,
      indexingProgress: 0,
    });
    reportProgress(0);
    log('info', 'Starting document indexing...');

    // Store original model to restore later if a custom model is specified
    const originalModelId = this.embedService.getCurrentModelId();
    let customModelRestored = false;

    try {
      // If a custom embedding model is specified, temporarily switch to it
      if (options.embeddingModel && options.embeddingModel !== originalModelId) {
        console.log('[RAGEngine] Switching to custom embedding model:', options.embeddingModel);
        await this.embedService.setModel(options.embeddingModel);
        customModelRestored = true;
      }

      // Step 1: Ensure vector store is initialized
      await this.vecStore.initialize();

      // Step 2: Check if document is already indexed (unless force reindex)
      const existingDoc = await this.vecStore.getDocument(docId);
      if (existingDoc) {
        if (!options.forceReindex) {
          // Document already indexed and no force reindex - return existing
          const status: IndexStatus = {
            isIndexed: true,
            chunkCount: existingDoc.chunkCount,
            indexedAt: existingDoc.indexedAt,
            embeddingModel: existingDoc.embeddingModel,
            fileHash: existingDoc.fileHash,
            isIndexing: false,
          };
          this.indexingStatus.set(docId, status);
          reportProgress(100);

          return {
            success: true,
            documentId: docId,
            chunkCount: existingDoc.chunkCount,
            indexingTimeMs: Date.now() - startTime,
          };
        } else {
          // Force reindex requested - delete existing index first to prevent duplicates
          log('info', 'Force reindex requested. Removing existing index...');
          try {
            await this.vecStore.deleteDocument(docId);
            this.chunkMgr.deleteChunksForDocument(docId);
            this.indexingStatus.delete(docId);
            log('success', 'Existing index removed successfully');
          } catch (deleteError: any) {
            log('warning', `Could not remove existing index: ${deleteError.message?.substring(0, 50) || 'Unknown error'}`);
          }
        }
      }

      // Step 3: Verify document is loaded before indexing
      reportProgress(10);
      log('info', 'Verifying document is loaded...');

      // Check if document is loaded in the parser
      if (!this.pdfParser.isDocumentLoaded(docId)) {
        throw new Error(
          `Document not loaded: ${docId}. ` +
          `Please ensure the document is loaded via 'pdf:load' before calling 'pdf:index'.`
        );
      }

      // Get document info for page count
      const loadedDocs = (this.pdfParser as any).loadedDocuments;
      const loadedDoc = loadedDocs?.get(docId);
      const pageCount = loadedDoc?.document?.pageCount || 1;

      log('info', `Document has ${pageCount} page(s). Processing page-by-page...`);

      // Process pages one at a time to avoid context length issues
      const allChunkRecords: ChunkRecord[] = [];
      let imageChunkIndex = 0;
      const chunkingOptions: ChunkingOptions = {
        chunkSize: options.chunkSize ?? this.settings.chunkSize,
        chunkOverlap: options.chunkOverlap ?? this.settings.chunkOverlap,
        strategy: options.chunkingStrategy ?? this.settings.chunkingStrategy,
        preserveSections: true,
      };

      // Calculate progress allocation: 10-80% for pages, 80-100% for storage
      const progressPerPage = 70 / pageCount;

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const pageStartProgress = 10 + (pageNum - 1) * progressPerPage;
        reportProgress(Math.round(pageStartProgress));
        log('info', `Processing page ${pageNum}/${pageCount}...`);

        try {
          // Extract text for this page only
          const pageData = await this.pdfParser.getPage(docId, pageNum);
          if (!pageData) {
            log('warning', `Page ${pageNum}: No page data found`);
            continue;
          }

          const hasTextContent = pageData.textContent && pageData.textContent.length > 0;
          if (!hasTextContent) {
            log('warning', `Page ${pageNum}: No text content found`);
          }

          if (hasTextContent) {
            // Create chunks for this page
            const pageChunks = this.chunkMgr.createChunks(docId, pageData.textContent, chunkingOptions);

            if (pageChunks.length === 0) {
              log('warning', `Page ${pageNum}: No chunks created`);
            } else {
              // Generate embeddings one chunk at a time to avoid context length issues
              const pageChunkRecords: ChunkRecord[] = [];
              for (let i = 0; i < pageChunks.length; i++) {
                const chunk = pageChunks[i];
                try {
                  // Truncate content if too long (max 500 chars for embedding)
                  const contentToEmbed = chunk.content.length > 500
                    ? chunk.content.substring(0, 500)
                    : chunk.content;

                  const embedding = await this.embedService.generateEmbedding(contentToEmbed);

                  pageChunkRecords.push({
                    id: chunk.id,
                    documentId: chunk.documentId,
                    content: chunk.content,
                    pageNumbers: chunk.metadata.pageNumbers,
                    boundingBoxes: JSON.stringify(chunk.metadata.boundingBoxes),
                    sectionHeader: chunk.metadata.sectionHeader || null,
                    chunkIndex: chunk.metadata.chunkIndex,
                    tokenCount: chunk.metadata.tokenCount,
                    blockType: chunk.metadata.blockType,
                    vector: embedding,
                  });
                } catch (embedError: any) {
                  log('warning', `Page ${pageNum}, chunk ${i + 1}: Embedding failed - ${embedError.message?.substring(0, 50) || 'Unknown error'}`);
                  // Continue with other chunks
                }
              }

              allChunkRecords.push(...pageChunkRecords);
              log('success', `Page ${pageNum}: Created ${pageChunkRecords.length} searchable chunks`);
            }
          }

          // Process images for this page (if enabled)
          if (this.settings.processImages && pageData.images && pageData.images.length > 0) {
            const imagesWithData = pageData.images.filter(image => image.imageData);

            if (imagesWithData.length === 0) {
              log('info', `Page ${pageNum}: Images found but no extractable data`);
            } else {
              try {
                log('info', `Page ${pageNum}: Processing ${imagesWithData.length} image(s)...`);

                const results = await imageProcessorService.processImages(
                  imagesWithData.map(image => ({
                    base64: image.imageData!,
                    id: image.id,
                  }))
                );

                let pageImageChunks = 0;

                for (let i = 0; i < results.length; i++) {
                  const result = results[i];
                  const image = imagesWithData[i];

                  if (!result.success || !result.description || result.description.trim().length === 0) {
                    log('warning', `Page ${pageNum}, image ${i + 1}: Processing failed - ${result.error || 'No description generated'}`);
                    continue;
                  }

                  const content = this.buildImageChunkContent(image, result);
                  const contentToEmbed = content.length > 500
                    ? content.substring(0, 500)
                    : content;

                  try {
                    const embedding = await this.embedService.generateEmbedding(contentToEmbed);
                    const pageNumber = image.bbox?.pageNumber || pageNum;

                    allChunkRecords.push({
                      id: `img_chunk_${image.id}`,
                      documentId: docId,
                      content,
                      pageNumbers: [pageNumber],
                      boundingBoxes: JSON.stringify([image.bbox]),
                      sectionHeader: image.caption || null,
                      chunkIndex: imageChunkIndex,
                      tokenCount: this.chunkMgr.countTokens(content),
                      blockType: 'figure',
                      vector: embedding,
                    });

                    imageChunkIndex += 1;
                    pageImageChunks += 1;
                  } catch (embedError: any) {
                    log('warning', `Page ${pageNum}, image ${i + 1}: Embedding failed - ${embedError.message?.substring(0, 50) || 'Unknown error'}`);
                  }
                }

                if (pageImageChunks > 0) {
                  log('success', `Page ${pageNum}: Created ${pageImageChunks} image chunk(s)`);
                }
              } catch (imgError: any) {
                log('warning', `Page ${pageNum}: Image processing failed - ${imgError.message?.substring(0, 50) || 'Unknown error'}`);
              }
            }
          }

        } catch (pageError: any) {
          log('error', `Page ${pageNum}: Failed - ${pageError.message?.substring(0, 100) || 'Unknown error'}`);
          // Continue with other pages
        }
      }

      if (allChunkRecords.length === 0) {
        throw new Error('No chunks created from document. The document may be empty or all pages failed to process.');
      }

      log('success', `Created ${allChunkRecords.length} total chunks across ${pageCount} page(s)`);

      // Step 7: Store chunks in vector store
      reportProgress(85);
      log('info', 'Storing chunks in vector database...');
      await this.vecStore.addChunks(allChunkRecords);
      const chunks = allChunkRecords; // For compatibility with existing code below

      // Step 8: Store document record
      // Get document info from parser (if loaded)
      let docRecord: DocumentRecord;
      try {
        // Try to get document info - this requires the document to be loaded
        const loadedDocs = (this.pdfParser as any).loadedDocuments;
        const loadedDoc = loadedDocs?.get(docId);

        if (loadedDoc?.document) {
          const doc = loadedDoc.document;
          docRecord = {
            id: docId,
            filePath: doc.filePath,
            fileName: doc.fileName,
            fileHash: doc.fileHash,
            pageCount: doc.pageCount,
            title: doc.metadata?.title || null,
            author: doc.metadata?.author || null,
            indexedAt: Date.now(),
            chunkCount: chunks.length,
            embeddingModel: this.embedService.getModelInfo().id,
          };
        } else {
          // Fallback if document info not available
          docRecord = {
            id: docId,
            filePath: '',
            fileName: docId,
            fileHash: '',
            pageCount: 0,
            title: null,
            author: null,
            indexedAt: Date.now(),
            chunkCount: chunks.length,
            embeddingModel: this.embedService.getModelInfo().id,
          };
        }
      } catch {
        // Fallback document record
        docRecord = {
          id: docId,
          filePath: '',
          fileName: docId,
          fileHash: '',
          pageCount: 0,
          title: null,
          author: null,
          indexedAt: Date.now(),
          chunkCount: chunks.length,
          embeddingModel: this.embedService.getModelInfo().id,
        };
      }

      await this.vecStore.addDocument(docRecord);
      log('success', 'Document record saved to database');

      // Step 9: Update status
      reportProgress(100);
      log('success', `Indexing complete! ${chunks.length} chunks indexed in ${Math.round((Date.now() - startTime) / 1000)}s`);

      const finalStatus: IndexStatus = {
        isIndexed: true,
        chunkCount: chunks.length,
        indexedAt: Date.now(),
        embeddingModel: this.embedService.getModelInfo().id,
        fileHash: docRecord.fileHash,
        isIndexing: false,
      };
      this.indexingStatus.set(docId, finalStatus);

      // Get storage stats
      const storageStats = await this.vecStore.getCollectionStats();

      return {
        success: true,
        documentId: docId,
        chunkCount: chunks.length,
        indexingTimeMs: Date.now() - startTime,
        storagePath: this.vecStore.getStoragePath(),
        storageSizeBytes: storageStats.sizeBytes,
      };
    } catch (error) {
      // Update status on failure
      const errorStatus: IndexStatus = {
        isIndexed: false,
        chunkCount: 0,
        isIndexing: false,
      };
      this.indexingStatus.set(docId, errorStatus);

      return {
        success: false,
        documentId: docId,
        chunkCount: 0,
        indexingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // Restore original embedding model if we temporarily switched
      if (customModelRestored && originalModelId) {
        try {
          console.log('[RAGEngine] Restoring original embedding model:', originalModelId);
          await this.embedService.setModel(originalModelId);
        } catch (restoreError) {
          console.error('[RAGEngine] Failed to restore original embedding model:', restoreError);
        }
      }
    }
  }

  /**
   * Update indexing progress
   */
  private updateIndexingProgress(docId: string, progress: number): void {
    const current = this.indexingStatus.get(docId);
    if (current) {
      this.indexingStatus.set(docId, {
        ...current,
        indexingProgress: progress,
      });
    }
  }

  /**
   * Extract and process images from a document
   *
   * @param docId - Document ID
   * @param onProgress - Progress callback (0-100)
   * @returns Array of Chunk objects created from image descriptions
   */
  private async extractAndProcessImages(
    docId: string,
    onProgress?: (progress: number) => void
  ): Promise<Chunk[]> {
    const chunks: Chunk[] = [];

    try {
      // Get loaded document info
      // Cast to access the getLoadedDocument method which exists on the implementation
      const loadedDoc = (this.pdfParser as any).getLoadedDocument?.(docId);
      if (!loadedDoc) {
        console.warn(`[RAGEngine] Document ${docId} not loaded for image processing`);
        return chunks;
      }

      const pageCount = loadedDoc.document.pageCount;

      // Collect all images from all pages
      const allImages: Array<{
        image: { id: string; imageData?: string; caption?: string; bbox: any };
        pageNum: number;
      }> = [];

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        try {
          const page = await this.pdfParser.getPage(docId, pageNum);
          if (page.images && page.images.length > 0) {
            for (const img of page.images) {
              // Only include images that have extracted data
              if (img.imageData) {
                allImages.push({ image: img, pageNum });
              }
            }
          }
        } catch (pageErr) {
          console.debug(`[RAGEngine] Could not get page ${pageNum} for image extraction:`, pageErr);
        }
      }

      if (allImages.length === 0) {
        console.log(`[RAGEngine] No processable images found in document ${docId}`);
        return chunks;
      }

      console.log(`[RAGEngine] Found ${allImages.length} images to process`);

      // Process images in batches
      const batchSize = 3; // Process 3 images at a time
      let processedCount = 0;

      for (let i = 0; i < allImages.length; i += batchSize) {
        const batch = allImages.slice(i, i + batchSize);

        // Process batch
        const results = await imageProcessorService.processImages(
          batch.map(item => ({
            base64: item.image.imageData!,
            id: item.image.id,
          }))
        );

        // Create chunks from successful results
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const item = batch[j];

          if (result.success && result.description && result.description.trim().length > 0) {
            const content = this.buildImageChunkContent(item.image, result);

            const chunk: Chunk = {
              id: `img_chunk_${item.image.id}`,
              documentId: docId,
              content,
              metadata: {
                pageNumbers: [item.pageNum],
                boundingBoxes: [item.image.bbox],
                sectionHeader: item.image.caption || undefined,
                chunkIndex: chunks.length,
                tokenCount: this.chunkMgr.countTokens(content),
                blockType: 'figure',
              },
            };

            chunks.push(chunk);
          }
        }

        // Update progress
        processedCount += batch.length;
        if (onProgress) {
          const progress = Math.round((processedCount / allImages.length) * 100);
          onProgress(progress);
        }
      }

      console.log(`[RAGEngine] Created ${chunks.length} image chunks from ${allImages.length} images`);
    } catch (error) {
      console.error('[RAGEngine] Error processing images:', error);
      // Continue without image chunks - text indexing still works
    }

    return chunks;
  }

  /**
   * Build chunk content from image and processing result
   */
  private buildImageChunkContent(
    image: { caption?: string },
    result: ImageProcessingResult
  ): string {
    let content = '[Figure]';

    if (image.caption) {
      content += `\nCaption: ${image.caption}`;
    }

    content += `\nDescription: ${result.description}`;

    if (result.extractedText) {
      content += `\nText in image: ${result.extractedText}`;
    }

    return content;
  }

  /**
   * Get the indexing status for a document
   * 
   * @param docId - Document ID
   * @returns Index status
   */
  getIndexStatus(docId: string): IndexStatus {
    const status = this.indexingStatus.get(docId);
    if (status) {
      return status;
    }

    // Check vector store for existing index
    // This is async but we return a default for now
    return {
      isIndexed: false,
      chunkCount: 0,
      isIndexing: false,
    };
  }

  /**
   * Get index status asynchronously (checks vector store)
   * Includes backward compatibility for old document ID formats
   */
  async getIndexStatusAsync(docId: string): Promise<IndexStatus> {
    console.log('[RAGEngine] 🔍 getIndexStatusAsync called for:', docId);

    // Check in-memory status first
    const memStatus = this.indexingStatus.get(docId);
    if (memStatus?.isIndexed || memStatus?.isIndexing) {
      console.log('[RAGEngine]    Found in-memory status:', memStatus.isIndexed ? 'indexed' : 'indexing');
      return memStatus;
    }

    // Check vector store
    try {
      await this.vecStore.initialize();

      // First try exact document ID match
      let doc = await this.vecStore.getDocument(docId);
      console.log('[RAGEngine]    Exact match result:', doc ? 'found' : 'not found');

      // If not found, try backward-compatible lookup by hash prefix
      // Old format: doc_{hash16chars}_{timestamp}
      // New format: doc_{hash32chars}
      // Both share the same hash prefix
      if (!doc) {
        const hashMatch = docId.match(/^doc_([a-f0-9]+)/);
        if (hashMatch) {
          const hashPrefix = hashMatch[1].substring(0, 16);
          console.log('[RAGEngine]    Trying backward-compatible lookup with hash prefix:', hashPrefix);

          // Get all documents and find one matching the hash prefix
          const allDocs = await this.vecStore.getAllDocuments();
          console.log('[RAGEngine]    Total documents in vector store:', allDocs.length);

          if (allDocs.length > 0) {
            console.log('[RAGEngine]    Document IDs in store:', allDocs.map(d => d.id).join(', '));
          }

          for (const candidate of allDocs) {
            // Check if this document's ID starts with the same hash prefix
            const candidateMatch = candidate.id.match(/^doc_([a-f0-9]+)/);
            if (candidateMatch) {
              const candidatePrefix = candidateMatch[1].substring(0, 16);
              if (candidatePrefix === hashPrefix) {
                console.log('[RAGEngine]    ✓ Found indexed document with legacy ID:', candidate.id);
                doc = candidate;
                break;
              }
            }
          }
        }
      }

      if (doc) {
        console.log('[RAGEngine]    ✓ Document is indexed with', doc.chunkCount, 'chunks');
        const status: IndexStatus = {
          isIndexed: true,
          chunkCount: doc.chunkCount,
          indexedAt: doc.indexedAt,
          embeddingModel: doc.embeddingModel,
          fileHash: doc.fileHash,
          isIndexing: false,
        };
        this.indexingStatus.set(docId, status);
        return status;
      }

      console.log('[RAGEngine]    ✗ Document not found in vector store');
    } catch (error) {
      console.error('[RAGEngine] Error checking index status:', error);
    }

    return {
      isIndexed: false,
      chunkCount: 0,
      isIndexing: false,
    };
  }

  /**
   * Find document by hash prefix (backward compatible)
   * Returns the actual document ID used in the vector store
   */
  async findDocumentIdByHashPrefix(docId: string): Promise<string | null> {
    try {
      await this.vecStore.initialize();

      // First check exact match
      const doc = await this.vecStore.getDocument(docId);
      if (doc) return docId;

      // Try prefix match
      const hashMatch = docId.match(/^doc_([a-f0-9]+)/);
      if (!hashMatch) return null;

      const hashPrefix = hashMatch[1].substring(0, 16);
      const allDocs = await this.vecStore.getAllDocuments();

      for (const candidate of allDocs) {
        const candidateMatch = candidate.id.match(/^doc_([a-f0-9]+)/);
        if (candidateMatch && candidateMatch[1].substring(0, 16) === hashPrefix) {
          return candidate.id;
        }
      }
    } catch (error) {
      console.error('[RAGEngine] Error finding document by hash:', error);
    }
    return null;
  }

  /**
   * Delete the index for a document
   * 
   * @param docId - Document ID
   */
  async deleteIndex(docId: string): Promise<void> {
    try {
      await this.vecStore.initialize();
      await this.vecStore.deleteDocument(docId);
      this.chunkMgr.deleteChunksForDocument(docId);
      this.indexingStatus.delete(docId);
      console.log('[RAGEngine] Deleted index for document:', docId);
    } catch (error) {
      console.error('[RAGEngine] Error deleting index:', error);
      throw error;
    }
  }


  /**
   * Query the RAG system for relevant information
   * 
   * Orchestrates: query → retrieve → format context flow
   * 
   * Implements Requirements 6.4, 7.9, 8.1, 13.3, 13.4
   * 
   * @param query - User's query
   * @param docIds - Document IDs to search (supports multiple for cross-document retrieval)
   * @param options - Query options
   * @param context - Optional conversation context
   * @returns RAG response with answer placeholder and sources
   */
  async query(
    query: string,
    docIds: string[],
    options: QueryOptions = {},
    context?: ConversationContext
  ): Promise<RAGResponse> {
    // Ensure vector store is initialized
    await this.vecStore.initialize();

    // Rewrite query with context if available
    const processedQuery = this.rewriteQuery(query, context);

    // Build query options
    const queryOpts: QueryOptions = {
      topK: options.topK ?? this.settings.topK,
      minScore: options.minScore ?? this.settings.minConfidenceScore,
      useHybrid: options.useHybrid ?? this.settings.useHybridSearch,
      useReranker: options.useReranker ?? this.settings.useReranker,
      pageFilter: options.pageFilter,
      sectionFilter: options.sectionFilter,
    };

    // Apply view context filter if query references current view
    if (context?.viewState && hasViewReference(query)) {
      queryOpts.pageFilter = {
        start: context.viewState.currentPage,
        end: context.viewState.currentPage,
      };
    }

    // Retrieve relevant chunks from all specified documents
    // This implements cross-document retrieval (Requirement 13.3)
    const retrievalResult = await this.retrieval.retrieveWithConfidence(
      processedQuery,
      docIds,
      queryOpts
    );

    // Build document name map for proper citation display (Requirement 13.4)
    const documentNameMap = await this.buildDocumentNameMap(docIds, retrievalResult.results);

    // Build context for AI
    const contextOptions: ContextBuildOptions = {
      maxTokens: DEFAULT_CONTEXT_OPTIONS.maxTokens,
      maxSources: this.settings.maxSourcesInContext,
      includeCitationMarkers: true,
      format: 'markdown',
    };

    const builtContext = this.buildContext(retrievalResult.results, contextOptions);

    // Build citations from sources with document names
    const citations = this.buildCitations(builtContext.includedSources, documentNameMap);

    // Return RAG response (answer will be filled by AI provider)
    return {
      answer: '', // To be filled by AI provider
      citations,
      sources: builtContext.includedSources,
      confidence: retrievalResult.confidence,
      groundedMode: this.settings.groundedModeEnabled,
    };
  }

  /**
   * Build a map of document IDs to document names
   * 
   * Implements Requirement 13.4: Include document identifier in retrieval results
   * 
   * @param docIds - Document IDs to look up
   * @param results - Retrieval results (to get additional document IDs from chunks)
   * @returns Map of document ID to document name
   */
  private async buildDocumentNameMap(
    docIds: string[],
    results: RetrievalResult[]
  ): Promise<Map<string, string>> {
    const documentNameMap = new Map<string, string>();

    // Collect all unique document IDs from both input and results
    const allDocIds = new Set<string>(docIds);
    for (const result of results) {
      allDocIds.add(result.chunk.documentId);
    }

    // Fetch document records from vector store
    for (const docId of allDocIds) {
      try {
        const docRecord = await this.vecStore.getDocument(docId);
        if (docRecord) {
          // Use fileName as the display name
          documentNameMap.set(docId, docRecord.fileName);
        } else {
          // Try to get from loaded documents in parser
          const loadedDocs = (this.pdfParser as any).loadedDocuments;
          const loadedDoc = loadedDocs?.get(docId);
          if (loadedDoc?.document) {
            documentNameMap.set(docId, loadedDoc.document.fileName);
          }
        }
      } catch (error) {
        console.warn('[RAGEngine] Could not get document name for:', docId, error);
      }
    }

    return documentNameMap;
  }

  /**
   * Build context string for AI prompt from retrieval results
   * 
   * Implements Requirements 7.9, 8.1, 13.4
   * 
   * @param results - Retrieval results
   * @param options - Context building options
   * @param documentNameMap - Optional map of document IDs to names for cross-document scenarios
   * @returns Built context with citation mapping
   */
  buildContext(
    results: RetrievalResult[],
    options: ContextBuildOptions = DEFAULT_CONTEXT_OPTIONS,
    documentNameMap?: Map<string, string>
  ): BuiltContext {
    const { maxTokens, maxSources, includeCitationMarkers, format } = options;

    const includedSources: RetrievalResult[] = [];
    const citationMap = new Map<string, string>();
    let contextParts: string[] = [];
    let totalTokens = 0;

    // Sort by score descending
    const sortedResults = [...results].sort((a, b) => b.score - a.score);

    for (let i = 0; i < sortedResults.length && i < maxSources; i++) {
      const result = sortedResults[i];
      const chunk = result.chunk;

      // Estimate tokens for this chunk
      const chunkTokens = estimateTokens(chunk.content);

      // Check if adding this chunk would exceed limit
      if (totalTokens + chunkTokens > maxTokens) {
        // Try to truncate the chunk to fit
        const remainingTokens = maxTokens - totalTokens;
        if (remainingTokens > 50) { // Only include if we can fit meaningful content
          const truncatedContent = truncateToTokens(chunk.content, remainingTokens);
          const citationMarker = includeCitationMarkers
            ? `[[cite:${chunk.id}:p${chunk.metadata.pageNumbers[0] || 1}]]`
            : '';

          contextParts.push(this.formatChunkForContext(
            truncatedContent,
            chunk,
            citationMarker,
            format,
            i + 1,
            documentNameMap
          ));

          citationMap.set(chunk.id, citationMarker);
          includedSources.push(result);
          totalTokens += estimateTokens(truncatedContent);
        }
        break;
      }

      // Add full chunk
      const citationMarker = includeCitationMarkers
        ? `[[cite:${chunk.id}:p${chunk.metadata.pageNumbers[0] || 1}]]`
        : '';

      contextParts.push(this.formatChunkForContext(
        chunk.content,
        chunk,
        citationMarker,
        format,
        i + 1,
        documentNameMap
      ));

      citationMap.set(chunk.id, citationMarker);
      includedSources.push(result);
      totalTokens += chunkTokens;
    }

    // Build final context string
    let contextString: string;
    if (format === 'markdown') {
      contextString = contextParts.join('\n\n---\n\n');
    } else if (format === 'structured') {
      contextString = contextParts.join('\n\n');
    } else {
      contextString = contextParts.join('\n\n');
    }

    return {
      contextString,
      includedSources,
      tokenCount: totalTokens,
      citationMap,
    };
  }

  /**
   * Format a chunk for inclusion in context
   * 
   * Implements Requirement 13.4: Include document identifier in results
   */
  private formatChunkForContext(
    content: string,
    chunk: Chunk,
    citationMarker: string,
    format: 'plain' | 'markdown' | 'structured',
    sourceIndex: number,
    documentNameMap?: Map<string, string>
  ): string {
    const pageInfo = chunk.metadata.pageNumbers.length > 0
      ? `Page ${chunk.metadata.pageNumbers.join(', ')}`
      : 'Unknown page';

    const sectionInfo = chunk.metadata.sectionHeader
      ? ` - ${chunk.metadata.sectionHeader}`
      : '';

    // Get document name for cross-document scenarios
    const docName = documentNameMap?.get(chunk.documentId) || chunk.documentId.substring(0, 20);
    const docInfo = documentNameMap && documentNameMap.size > 1
      ? ` from "${docName}"`
      : '';

    if (format === 'markdown') {
      return `**Source ${sourceIndex}** (${pageInfo}${sectionInfo}${docInfo}) ${citationMarker}\n\n${content}`;
    } else if (format === 'structured') {
      return `[Source ${sourceIndex}] ${pageInfo}${sectionInfo}${docInfo}\nCitation: ${citationMarker}\nContent: ${content}`;
    } else {
      return `Source ${sourceIndex} (${pageInfo}${sectionInfo}${docInfo}): ${content} ${citationMarker}`;
    }
  }

  /**
   * Build citations from retrieval results
   * 
   * Implements Requirements 13.3, 13.4: Include document identifier in results
   * 
   * @param sources - Retrieval results
   * @param documentNameMap - Map of document IDs to document names
   */
  private buildCitations(
    sources: RetrievalResult[],
    documentNameMap?: Map<string, string>
  ): Citation[] {
    return sources.map((source, index) => {
      const chunk = source.chunk;
      const pageNumber = chunk.metadata.pageNumbers[0] || 1;

      // Get document name from map, or fall back to document ID
      // This ensures cross-document retrieval includes proper document identifiers
      let docName = documentNameMap?.get(chunk.documentId);
      if (!docName) {
        // Fallback: try to extract a meaningful name from the document ID
        // Document IDs are typically UUIDs or file-based identifiers
        docName = chunk.documentId.includes('/') || chunk.documentId.includes('\\')
          ? chunk.documentId.split(/[/\\]/).pop() || chunk.documentId
          : chunk.documentId.substring(0, 20);
      }

      // Extract a short quote from the content
      const quotedText = chunk.content.substring(0, 150) +
        (chunk.content.length > 150 ? '...' : '');

      return {
        id: generateCitationId(chunk.id, index),
        documentName: docName,
        pageNumber,
        boundingBoxes: chunk.metadata.boundingBoxes,
        quotedText,
        chunkId: chunk.id,
        documentId: chunk.documentId, // Include document ID for cross-document scenarios
      };
    });
  }

  /**
   * Rewrite query using conversation context
   * 
   * Implements Requirements 7.4, 22.1, 22.2, 22.3, 22.4, 22.5
   * 
   * @param query - Original query
   * @param context - Conversation context
   * @returns Rewritten query
   */
  rewriteQuery(query: string, context?: ConversationContext): string {
    if (!context) {
      return query;
    }

    let rewrittenQuery = query;

    // Handle view-relative references
    if (hasViewReference(query) && context.viewState) {
      rewrittenQuery = this.resolveViewReferences(rewrittenQuery, context.viewState);
    }

    // Handle pronouns using conversation history
    if (hasPronouns(query) && context.messages && context.messages.length > 0) {
      rewrittenQuery = this.resolvePronouns(rewrittenQuery, context.messages);
    }

    // Expand query with conversation context
    if (context.messages && context.messages.length > 0) {
      rewrittenQuery = this.expandWithConversationContext(rewrittenQuery, context.messages);
    }

    return rewrittenQuery;
  }

  /**
   * Resolve view-relative references in query
   * 
   * Implements Requirement 22.5
   */
  private resolveViewReferences(
    query: string,
    viewState: { currentPage: number; visibleText: string }
  ): string {
    let resolved = query;

    // Replace "this page" / "current page" with page number
    resolved = resolved.replace(/\b(this|current)\s+page\b/gi, `page ${viewState.currentPage}`);

    // If there's visible text context, we could add it to the query
    // but we'll rely on page filtering instead for better results

    return resolved;
  }

  /**
   * Resolve pronouns using conversation history
   * 
   * Implements Requirements 22.2, 22.3
   */
  private resolvePronouns(
    query: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    // Get recent messages for context
    const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);

    // Extract key terms from recent conversation
    const contextText = recentMessages
      .map(m => m.content)
      .join(' ')
      .substring(0, 1000);

    const keyTerms = extractKeyTerms(contextText, 3);

    if (keyTerms.length === 0) {
      return query;
    }

    // Check if query has pronouns that might refer to previous context
    const hasIt = /\bit\b/i.test(query);
    const hasThis = /\bthis\b/i.test(query) && !hasViewReference(query);
    const hasThat = /\bthat\b/i.test(query);

    // If query is very short and has pronouns, expand with context
    const words = query.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 5 && (hasIt || hasThis || hasThat)) {
      // Append key terms to help retrieval
      return `${query} (context: ${keyTerms.join(', ')})`;
    }

    return query;
  }

  /**
   * Expand query with conversation context
   * 
   * Implements Requirements 22.1, 22.4
   */
  private expandWithConversationContext(
    query: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    // Get recent user messages for context
    const recentUserMessages = messages
      .filter(m => m.role === 'user')
      .slice(-3);

    if (recentUserMessages.length === 0) {
      return query;
    }

    // Check if this looks like a follow-up question
    const isFollowUp = this.isFollowUpQuestion(query);

    if (!isFollowUp) {
      return query;
    }

    // Extract key terms from previous questions
    const previousContext = recentUserMessages
      .map(m => m.content)
      .join(' ')
      .substring(0, 500);

    const keyTerms = extractKeyTerms(previousContext, 3);

    if (keyTerms.length > 0) {
      // Append context terms to improve retrieval
      return `${query} ${keyTerms.join(' ')}`;
    }

    return query;
  }

  /**
   * Check if a query looks like a follow-up question
   */
  private isFollowUpQuestion(query: string): boolean {
    const followUpIndicators = [
      /^(and|also|what about|how about|tell me more|explain|why|can you)/i,
      /^(is it|are they|does it|do they|was it|were they)/i,
      /\?$/,
    ];

    return followUpIndicators.some(pattern => pattern.test(query.trim()));
  }

  /**
   * Update RAG settings
   */
  updateSettings(settings: Partial<PDFRAGSettings>): void {
    this.settings = { ...this.settings, ...settings };
    
    if (settings.ollamaBaseUrl) {
      this.embedService.setOllamaBaseUrl(settings.ollamaBaseUrl);
    }
  }

  /**
   * Get current RAG settings
   */
  getSettings(): PDFRAGSettings {
    return { ...this.settings };
  }

  /**
   * Get effective settings for a document
   * 
   * Merges global settings with per-document overrides.
   * Per-document settings take precedence when enabled.
   * 
   * Implements Requirement 16.7: Support per-collection retrieval settings
   * 
   * @param docId - Document ID
   * @param documentSettings - Per-document settings (if available)
   * @returns Merged settings
   */
  getEffectiveSettings(
    docId: string,
    documentSettings?: import('../../src/types/pdf').DocumentRetrievalSettings | null
  ): PDFRAGSettings {
    // If no per-document settings or not enabled, return global settings
    if (!documentSettings || !documentSettings.enabled) {
      return { ...this.settings };
    }

    // Merge per-document overrides with global settings
    const effective: PDFRAGSettings = { ...this.settings };

    // Apply chunking overrides
    if (documentSettings.chunkSize !== undefined) {
      effective.chunkSize = documentSettings.chunkSize;
    }
    if (documentSettings.chunkOverlap !== undefined) {
      effective.chunkOverlap = documentSettings.chunkOverlap;
    }
    if (documentSettings.chunkingStrategy !== undefined) {
      effective.chunkingStrategy = documentSettings.chunkingStrategy;
    }

    // Apply retrieval overrides
    if (documentSettings.topK !== undefined) {
      effective.topK = documentSettings.topK;
    }
    if (documentSettings.minConfidenceScore !== undefined) {
      effective.minConfidenceScore = documentSettings.minConfidenceScore;
    }
    if (documentSettings.useHybridSearch !== undefined) {
      effective.useHybridSearch = documentSettings.useHybridSearch;
    }
    if (documentSettings.hybridAlpha !== undefined) {
      effective.hybridAlpha = documentSettings.hybridAlpha;
    }
    if (documentSettings.useReranker !== undefined) {
      effective.useReranker = documentSettings.useReranker;
    }
    if (documentSettings.maxSourcesInContext !== undefined) {
      effective.maxSourcesInContext = documentSettings.maxSourcesInContext;
    }

    // Apply grounding overrides
    if (documentSettings.groundedModeEnabled !== undefined) {
      effective.groundedModeEnabled = documentSettings.groundedModeEnabled;
    }
    if (documentSettings.showLowConfidenceWarning !== undefined) {
      effective.showLowConfidenceWarning = documentSettings.showLowConfidenceWarning;
    }
    if (documentSettings.lowConfidenceThreshold !== undefined) {
      effective.lowConfidenceThreshold = documentSettings.lowConfidenceThreshold;
    }

    return effective;
  }

  /**
   * Get context string for a query (for external use)
   * 
   * This method retrieves relevant chunks and builds a context string
   * that can be used in AI prompts.
   * 
   * Implements Requirements 13.3, 13.4 for cross-document retrieval
   */
  async getContextForQuery(
    query: string,
    docIds: string[],
    options: QueryOptions = {},
    context?: ConversationContext
  ): Promise<{
    contextString: string;
    sources: RetrievalResult[];
    confidence: number;
    isLowConfidence: boolean;
    warning?: string;
    documentNameMap?: Map<string, string>;
  }> {
    // Ensure vector store is initialized
    await this.vecStore.initialize();

    // Check if this is an overview/summary query
    const isOverview = isOverviewQuery(query);

    // Rewrite query with context
    const processedQuery = this.rewriteQuery(query, context);

    // Build query options with special handling for overview queries
    const queryOpts: QueryOptions = {
      topK: options.topK ?? this.settings.topK,
      minScore: options.minScore ?? this.settings.minConfidenceScore,
      useHybrid: options.useHybrid ?? this.settings.useHybridSearch,
      useReranker: options.useReranker ?? this.settings.useReranker,
      pageFilter: options.pageFilter,
      sectionFilter: options.sectionFilter,
    };

    // Special handling for overview queries: prioritize first pages and lower threshold
    if (isOverview) {
      console.log('[RAGEngine] 📋 Overview query detected - using first-pages strategy');
      // For overview queries, prioritize first 5 pages (intro/abstract)
      queryOpts.pageFilter = { start: 1, end: 5 };
      // Lower minScore for overview queries since we want broad coverage
      queryOpts.minScore = Math.min(queryOpts.minScore ?? 0.3, 0.2);
      // Increase topK for overview to get more context
      queryOpts.topK = Math.max(queryOpts.topK ?? 8, 10);
    }

    // Apply view context filter (but not for overview queries)
    if (!isOverview && context?.viewState && hasViewReference(query)) {
      queryOpts.pageFilter = {
        start: context.viewState.currentPage,
        end: context.viewState.currentPage,
      };
    }

    // Retrieve with confidence from all specified documents
    console.log('[RAGEngine] ═══════════════════════════════════════════════════════');
    console.log('[RAGEngine] 🔍 RETRIEVAL START');
    console.log('[RAGEngine]    Query: "' + query.substring(0, 80) + (query.length > 80 ? '...' : '') + '"');
    console.log('[RAGEngine]    Processed query: "' + processedQuery.substring(0, 80) + (processedQuery.length > 80 ? '...' : '') + '"');
    console.log('[RAGEngine]    Document IDs:', docIds);
    console.log('[RAGEngine]    Options: topK=' + queryOpts.topK + ', minScore=' + queryOpts.minScore + ', hybrid=' + queryOpts.useHybrid);
    if (isOverview) {
      console.log('[RAGEngine]    📋 Overview mode: pageFilter=1-5, lowered minScore');
    }

    let retrievalResult = await this.retrieval.retrieveWithConfidence(
      processedQuery,
      docIds,
      queryOpts
    );

    // If overview query got no results from first pages, retry without page filter
    if (isOverview && retrievalResult.results.length === 0) {
      console.log('[RAGEngine] ⚠️ Overview query found no results in first pages, retrying without page filter');
      const retryOpts = { ...queryOpts, pageFilter: undefined };
      retrievalResult = await this.retrieval.retrieveWithConfidence(
        processedQuery,
        docIds,
        retryOpts
      );
    }

    console.log('[RAGEngine] 📊 RETRIEVAL RESULTS');
    console.log('[RAGEngine]    Chunks found: ' + retrievalResult.results.length);
    console.log('[RAGEngine]    Confidence: ' + (retrievalResult.confidence * 100).toFixed(1) + '%');
    console.log('[RAGEngine]    Low confidence: ' + retrievalResult.isLowConfidence);
    if (retrievalResult.warning) {
      console.log('[RAGEngine]    ⚠️ Warning: ' + retrievalResult.warning);
    }
    if (retrievalResult.results.length > 0) {
      console.log('[RAGEngine]    Top chunk scores:', retrievalResult.results.slice(0, 3).map(r => r.score.toFixed(3)).join(', '));
    }

    // Build document name map for cross-document scenarios
    const documentNameMap = await this.buildDocumentNameMap(docIds, retrievalResult.results);

    // Build context
    const contextOptions: ContextBuildOptions = {
      maxTokens: DEFAULT_CONTEXT_OPTIONS.maxTokens,
      maxSources: this.settings.maxSourcesInContext,
      includeCitationMarkers: true,
      format: 'markdown',
    };

    const builtContext = this.buildContext(retrievalResult.results, contextOptions);

    console.log('[RAGEngine] 📝 CONTEXT BUILT');
    console.log('[RAGEngine]    Sources included: ' + builtContext.includedSources.length);
    console.log('[RAGEngine]    Context tokens: ~' + builtContext.tokenCount);
    console.log('[RAGEngine]    Context length: ' + builtContext.contextString.length + ' chars');
    console.log('[RAGEngine] ═══════════════════════════════════════════════════════');

    return {
      contextString: builtContext.contextString,
      sources: builtContext.includedSources,
      confidence: retrievalResult.confidence,
      isLowConfidence: retrievalResult.isLowConfidence,
      warning: retrievalResult.warning,
      documentNameMap,
    };
  }

  // ===========================================================================
  // Section-Aware Summarization
  // ===========================================================================

  /**
   * Get major sections from a document
   * 
   * Implements Requirement 12.2: Extract document outline/table of contents
   * 
   * @param docId - Document ID
   * @returns Array of major sections
   */
  async getMajorSections(docId: string): Promise<import('../../src/types/pdf').MajorSection[]> {
    return this.pdfParser.getMajorSections(docId);
  }

  /**
   * Generate a summary for a specific section of the document
   * 
   * Implements Requirement 12.3: Section-by-section summarization
   * 
   * @param docId - Document ID
   * @param section - Section to summarize
   * @returns Section summary with citations
   */
  async summarizeSection(
    docId: string,
    section: import('../../src/types/pdf').MajorSection
  ): Promise<import('../../src/types/pdf').SectionSummary> {
    // Ensure vector store is initialized
    await this.vecStore.initialize();

    // Retrieve chunks for this section using page filter
    const queryOpts: QueryOptions = {
      topK: 10, // Get more chunks for summarization
      minScore: 0.2, // Lower threshold for summarization (was 0.3)
      useHybrid: this.settings.useHybridSearch,
      useReranker: false, // Don't rerank for summarization
      pageFilter: {
        start: section.startPage,
        end: section.endPage > 0 ? section.endPage : section.startPage + 50, // Handle -1 end page
      },
    };

    // Use section title as query to get relevant chunks
    // Note: Using just the title instead of "Summary of ${title}" for better matching
    let retrievalResult = await this.retrieval.retrieveWithConfidence(
      section.title,
      [docId],
      queryOpts
    );

    // Check if retrieval returned poor results - try broader query
    const hasGoodResults = retrievalResult.results.length > 0 &&
      retrievalResult.results.some(r => r.score >= 0.2);

    if (!hasGoodResults) {
      console.log(`[RAGEngine] Poor results for section "${section.title}", trying broader content query...`);

      // Try with a more generic query about the content on those pages
      const broaderQuery = `content from pages ${section.startPage} to ${section.endPage > 0 ? section.endPage : section.startPage + 5}`;
      retrievalResult = await this.retrieval.retrieveWithConfidence(
        broaderQuery,
        [docId],
        {
          ...queryOpts,
          minScore: 0.1, // Even lower threshold for fallback
          topK: 15, // Get more results
        }
      );
    }

    // Build context from retrieved chunks
    const contextOptions: ContextBuildOptions = {
      maxTokens: 3000,
      maxSources: 8,
      includeCitationMarkers: true,
      format: 'markdown',
    };

    let builtContext = this.buildContext(retrievalResult.results, contextOptions);

    // Final fallback: If still no context, try to get direct page content
    if (!builtContext.contextString || builtContext.contextString.trim().length < 50) {
      console.log(`[RAGEngine] Retrieval failed for section "${section.title}", falling back to direct page extraction...`);

      try {
        const directContent = await this.getDirectPageContent(
          docId,
          section.startPage,
          section.endPage > 0 ? Math.min(section.endPage, section.startPage + 5) : section.startPage + 3
        );

        if (directContent && directContent.trim().length > 0) {
          builtContext = {
            contextString: directContent,
            includedSources: [], // No vector store sources for direct extraction
            tokenCount: Math.ceil(directContent.length / 4),
            citationMap: new Map(), // No citations for direct extraction
          };
        }
      } catch (fallbackError) {
        console.warn(`[RAGEngine] Direct page extraction failed for section "${section.title}":`, fallbackError);
      }
    }

    // Build citations for this section
    const citations = this.buildCitations(builtContext.includedSources);

    // Return section summary structure (content will be filled by AI)
    return {
      sectionTitle: section.title,
      startPage: section.startPage,
      endPage: section.endPage,
      level: section.level,
      content: '', // To be filled by AI provider
      citations,
      sources: builtContext.includedSources,
      contextString: builtContext.contextString,
    };
  }

  /**
   * Get direct page content as a fallback when vector retrieval fails
   *
   * @param docId - Document ID
   * @param startPage - Start page number
   * @param endPage - End page number
   * @returns Combined text content from the pages
   */
  private async getDirectPageContent(
    docId: string,
    startPage: number,
    endPage: number
  ): Promise<string> {
    const textParts: string[] = [];

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      try {
        const page = await this.pdfParser.getPage(docId, pageNum);

        if (page.textContent && page.textContent.length > 0) {
          // Extract text from text blocks
          const pageText = page.textContent
            .map(block => block.text)
            .filter(text => text && text.trim().length > 0)
            .join(' ');

          if (pageText.trim().length > 0) {
            textParts.push(`[Page ${pageNum}]\n${pageText}`);
          }
        }
      } catch (pageError) {
        console.warn(`[RAGEngine] Failed to extract text from page ${pageNum}:`, pageError);
      }
    }

    return textParts.join('\n\n');
  }

  /**
   * Generate section-by-section summaries for a document
   * 
   * Implements Requirements 12.1, 12.3, 12.4:
   * - 12.1: Generate document summary
   * - 12.3: Section-by-section summarization
   * - 12.4: Include section citations in summary
   * 
   * @param docId - Document ID
   * @param options - Summarization options
   * @returns Document summary with section summaries and citations
   */
  async generateDocumentSummary(
    docId: string,
    options: {
      maxSectionsToSummarize?: number;
      includeSubsections?: boolean;
    } = {}
  ): Promise<import('../../src/types/pdf').DocumentSummary> {
    const { maxSectionsToSummarize = 20, includeSubsections = false } = options;

    // Step 1: Get major sections (Requirement 12.2)
    const sections = await this.getMajorSections(docId);

    if (sections.length === 0) {
      // If no sections found, create a single "full document" section
      const docInfo = await this.getDocumentInfo(docId);
      const fullDocSection: import('../../src/types/pdf').MajorSection = {
        title: 'Full Document',
        startPage: 1,
        endPage: docInfo?.pageCount || 100,
        level: 0,
        subsections: [],
        isTopLevel: true,
      };
      sections.push(fullDocSection);
    }

    // Step 2: Flatten sections if including subsections
    let sectionsToSummarize: import('../../src/types/pdf').MajorSection[] = [];

    if (includeSubsections) {
      const flattenSections = (
        secs: import('../../src/types/pdf').MajorSection[]
      ): import('../../src/types/pdf').MajorSection[] => {
        const result: import('../../src/types/pdf').MajorSection[] = [];
        for (const sec of secs) {
          result.push(sec);
          if (sec.subsections && sec.subsections.length > 0) {
            result.push(...flattenSections(sec.subsections));
          }
        }
        return result;
      };
      sectionsToSummarize = flattenSections(sections);
    } else {
      // Only top-level sections
      sectionsToSummarize = sections.filter(s => s.isTopLevel);
    }

    // Limit number of sections
    sectionsToSummarize = sectionsToSummarize.slice(0, maxSectionsToSummarize);

    // Step 3: Generate summary for each section (Requirement 12.3)
    const sectionSummaries: import('../../src/types/pdf').SectionSummary[] = [];

    for (const section of sectionsToSummarize) {
      try {
        const summary = await this.summarizeSection(docId, section);
        sectionSummaries.push(summary);
      } catch (error) {
        console.warn(`[RAGEngine] Failed to summarize section "${section.title}":`, error);
        // Add placeholder for failed section
        sectionSummaries.push({
          sectionTitle: section.title,
          startPage: section.startPage,
          endPage: section.endPage,
          level: section.level,
          content: `[Unable to summarize section: ${section.title}]`,
          citations: [],
          sources: [],
          contextString: '',
        });
      }
    }

    // Step 4: Collect all citations (Requirement 12.4)
    const allCitations: import('../../src/types/pdf').Citation[] = [];
    const seenChunkIds = new Set<string>();

    for (const summary of sectionSummaries) {
      for (const citation of summary.citations) {
        if (!seenChunkIds.has(citation.chunkId)) {
          seenChunkIds.add(citation.chunkId);
          allCitations.push(citation);
        }
      }
    }

    // Get document info for the summary
    const docInfo = await this.getDocumentInfo(docId);

    return {
      documentId: docId,
      documentName: docInfo?.fileName || docId,
      pageCount: docInfo?.pageCount || 0,
      sectionCount: sectionsToSummarize.length,
      sectionSummaries,
      overallSummary: '', // To be filled by combining section summaries
      citations: allCitations,
      generatedAt: Date.now(),
    };
  }

  /**
   * Get document info from loaded documents or vector store
   * 
   * @param docId - Document ID
   * @returns Document info or null
   */
  private async getDocumentInfo(docId: string): Promise<{
    fileName: string;
    pageCount: number;
  } | null> {
    // Try loaded documents first
    const loadedDocs = (this.pdfParser as any).loadedDocuments;
    const loadedDoc = loadedDocs?.get(docId);

    if (loadedDoc?.document) {
      return {
        fileName: loadedDoc.document.fileName,
        pageCount: loadedDoc.document.pageCount,
      };
    }

    // Try vector store
    try {
      const docRecord = await this.vecStore.getDocument(docId);
      if (docRecord) {
        return {
          fileName: docRecord.fileName,
          pageCount: docRecord.pageCount,
        };
      }
    } catch (error) {
      console.warn('[RAGEngine] Could not get document info:', error);
    }

    return null;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Singleton instance of the RAG engine using global registry
 */
export const ragEngine = (() => {
  const globalKey = Symbol.for('zura.ragEngine');
  const globalRegistry = global as any;

  if (!globalRegistry[globalKey]) {
    globalRegistry[globalKey] = new RAGEngine();
  }

  return globalRegistry[globalKey] as RAGEngine;
})();
