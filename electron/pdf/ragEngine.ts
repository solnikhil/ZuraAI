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
      ...settings,
    };
  }

  /**
   * Index a document for RAG retrieval
   * 
   * Orchestrates: parsing → chunking → embedding → indexing
   * 
   * Implements Requirements 6.1, 6.4
   * 
   * @param docId - Document ID to index
   * @param options - Indexing options
   * @returns Index result with statistics
   */
  async indexDocument(docId: string, options: IndexOptions = {}): Promise<IndexResult> {
    const startTime = Date.now();
    
    // Update status to indexing
    this.indexingStatus.set(docId, {
      isIndexed: false,
      chunkCount: 0,
      isIndexing: true,
      indexingProgress: 0,
    });

    try {
      // Step 1: Ensure vector store is initialized
      await this.vecStore.initialize();
      
      // Step 2: Check if document is already indexed (unless force reindex)
      if (!options.forceReindex) {
        const existingDoc = await this.vecStore.getDocument(docId);
        if (existingDoc) {
          const status: IndexStatus = {
            isIndexed: true,
            chunkCount: existingDoc.chunkCount,
            indexedAt: existingDoc.indexedAt,
            embeddingModel: existingDoc.embeddingModel,
            fileHash: existingDoc.fileHash,
            isIndexing: false,
          };
          this.indexingStatus.set(docId, status);
          
          return {
            success: true,
            documentId: docId,
            chunkCount: existingDoc.chunkCount,
            indexingTimeMs: Date.now() - startTime,
          };
        }
      }

      // Step 3: Extract text from document
      this.updateIndexingProgress(docId, 10);
      const textBlocks = await this.pdfParser.extractAllText(docId);
      
      if (textBlocks.length === 0) {
        throw new Error('No text content extracted from document');
      }

      // Step 4: Create chunks
      this.updateIndexingProgress(docId, 30);
      const chunkingOptions: ChunkingOptions = {
        chunkSize: options.chunkSize ?? this.settings.chunkSize,
        chunkOverlap: options.chunkOverlap ?? this.settings.chunkOverlap,
        strategy: options.chunkingStrategy ?? this.settings.chunkingStrategy,
        preserveSections: true,
      };
      
      const chunks = this.chunkMgr.createChunks(docId, textBlocks, chunkingOptions);
      
      if (chunks.length === 0) {
        throw new Error('No chunks created from document');
      }

      // Step 5: Generate embeddings
      this.updateIndexingProgress(docId, 50);
      const chunkTexts = chunks.map(c => c.content);
      const embeddings = await this.embedService.generateEmbeddings(chunkTexts);

      // Step 6: Prepare chunk records for storage
      this.updateIndexingProgress(docId, 70);
      const chunkRecords: ChunkRecord[] = chunks.map((chunk, i) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        content: chunk.content,
        pageNumbers: chunk.metadata.pageNumbers,
        boundingBoxes: JSON.stringify(chunk.metadata.boundingBoxes),
        sectionHeader: chunk.metadata.sectionHeader || null,
        chunkIndex: chunk.metadata.chunkIndex,
        tokenCount: chunk.metadata.tokenCount,
        blockType: chunk.metadata.blockType,
        vector: embeddings[i],
      }));

      // Step 7: Store chunks in vector store
      this.updateIndexingProgress(docId, 85);
      await this.vecStore.addChunks(chunkRecords);

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

      // Step 9: Update status
      this.updateIndexingProgress(docId, 100);
      const finalStatus: IndexStatus = {
        isIndexed: true,
        chunkCount: chunks.length,
        indexedAt: Date.now(),
        embeddingModel: this.embedService.getModelInfo().id,
        fileHash: docRecord.fileHash,
        isIndexing: false,
      };
      this.indexingStatus.set(docId, finalStatus);

      return {
        success: true,
        documentId: docId,
        chunkCount: chunks.length,
        indexingTimeMs: Date.now() - startTime,
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
   */
  async getIndexStatusAsync(docId: string): Promise<IndexStatus> {
    // Check in-memory status first
    const memStatus = this.indexingStatus.get(docId);
    if (memStatus?.isIndexed || memStatus?.isIndexing) {
      return memStatus;
    }

    // Check vector store
    try {
      await this.vecStore.initialize();
      const doc = await this.vecStore.getDocument(docId);
      
      if (doc) {
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

    // Rewrite query with context
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

    // Apply view context filter
    if (context?.viewState && hasViewReference(query)) {
      queryOpts.pageFilter = {
        start: context.viewState.currentPage,
        end: context.viewState.currentPage,
      };
    }

    // Retrieve with confidence from all specified documents
    const retrievalResult = await this.retrieval.retrieveWithConfidence(
      processedQuery,
      docIds,
      queryOpts
    );

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
      minScore: 0.3, // Lower threshold for summarization
      useHybrid: this.settings.useHybridSearch,
      useReranker: false, // Don't rerank for summarization
      pageFilter: {
        start: section.startPage,
        end: section.endPage > 0 ? section.endPage : section.startPage + 50, // Handle -1 end page
      },
    };

    // Use section title as query to get relevant chunks
    const retrievalResult = await this.retrieval.retrieveWithConfidence(
      `Summary of ${section.title}`,
      [docId],
      queryOpts
    );

    // Build context from retrieved chunks
    const contextOptions: ContextBuildOptions = {
      maxTokens: 3000,
      maxSources: 8,
      includeCitationMarkers: true,
      format: 'markdown',
    };

    const builtContext = this.buildContext(retrievalResult.results, contextOptions);

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
 * Singleton instance of the RAG engine
 */
export const ragEngine = new RAGEngine();
