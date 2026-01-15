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
   * Implements Requirements 6.4, 7.9, 8.1
   * 
   * @param query - User's query
   * @param docIds - Document IDs to search
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

    // Retrieve relevant chunks
    const retrievalResult = await this.retrieval.retrieveWithConfidence(
      processedQuery,
      docIds,
      queryOpts
    );

    // Build context for AI
    const contextOptions: ContextBuildOptions = {
      maxTokens: DEFAULT_CONTEXT_OPTIONS.maxTokens,
      maxSources: this.settings.maxSourcesInContext,
      includeCitationMarkers: true,
      format: 'markdown',
    };
    
    const builtContext = this.buildContext(retrievalResult.results, contextOptions);

    // Build citations from sources
    const citations = this.buildCitations(builtContext.includedSources);

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
   * Build context string for AI prompt from retrieval results
   * 
   * Implements Requirements 7.9, 8.1
   * 
   * @param results - Retrieval results
   * @param options - Context building options
   * @returns Built context with citation mapping
   */
  buildContext(results: RetrievalResult[], options: ContextBuildOptions = DEFAULT_CONTEXT_OPTIONS): BuiltContext {
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
            i + 1
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
        i + 1
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
   */
  private formatChunkForContext(
    content: string,
    chunk: Chunk,
    citationMarker: string,
    format: 'plain' | 'markdown' | 'structured',
    sourceIndex: number
  ): string {
    const pageInfo = chunk.metadata.pageNumbers.length > 0
      ? `Page ${chunk.metadata.pageNumbers.join(', ')}`
      : 'Unknown page';
    
    const sectionInfo = chunk.metadata.sectionHeader
      ? ` - ${chunk.metadata.sectionHeader}`
      : '';

    if (format === 'markdown') {
      return `**Source ${sourceIndex}** (${pageInfo}${sectionInfo}) ${citationMarker}\n\n${content}`;
    } else if (format === 'structured') {
      return `[Source ${sourceIndex}] ${pageInfo}${sectionInfo}\nCitation: ${citationMarker}\nContent: ${content}`;
    } else {
      return `Source ${sourceIndex} (${pageInfo}${sectionInfo}): ${content} ${citationMarker}`;
    }
  }

  /**
   * Build citations from retrieval results
   */
  private buildCitations(sources: RetrievalResult[]): Citation[] {
    return sources.map((source, index) => {
      const chunk = source.chunk;
      const pageNumber = chunk.metadata.pageNumbers[0] || 1;
      
      // Get document name from chunk ID or use placeholder
      const docName = chunk.documentId.substring(0, 20);
      
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
   * Get context string for a query (for external use)
   * 
   * This method retrieves relevant chunks and builds a context string
   * that can be used in AI prompts.
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

    // Retrieve with confidence
    const retrievalResult = await this.retrieval.retrieveWithConfidence(
      processedQuery,
      docIds,
      queryOpts
    );

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
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Singleton instance of the RAG engine
 */
export const ragEngine = new RAGEngine();
