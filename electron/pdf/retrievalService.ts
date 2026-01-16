/**
 * Retrieval Service
 * 
 * This service handles query processing and retrieval for the RAG pipeline.
 * It provides:
 * - Query processing and rewriting
 * - Hybrid search orchestration
 * - Cross-encoder reranking (optional)
 * - Metadata filtering (page range, section, document)
 * - Confidence scoring and low-confidence warnings
 * - BM25-only fallback when embeddings are unavailable (Requirement 18.2)
 * 
 * Requirements: 7.3, 7.5, 7.6, 10.2, 10.5, 18.2
 */

import type {
  Chunk,
  ChunkMetadata,
  BoundingBox,
  QueryOptions,
  RetrievalResult,
  EmbeddingFallbackState,
  RetrievalResultWithFallback,
} from '../../src/types/pdf';
import type {
  IRetrievalService,
  IVectorStore,
  IEmbeddingService,
  ProcessedQuery,
  ConversationContext,
  RerankerConfig,
  RRFParams,
  ChunkRecord,
} from './types';
import { vectorStore } from './vectorStore';
import { embeddingService, embeddingFallbackManager, generateEmbeddingWithFallback } from './embeddingService';

// =============================================================================
// Constants
// =============================================================================

/** Default retrieval options */
const DEFAULT_QUERY_OPTIONS: Required<QueryOptions> = {
  topK: 5,
  minScore: 0,
  useHybrid: true,
  useReranker: true,
  pageFilter: undefined as any,
  sectionFilter: undefined as any,
};

/** Default reranker configuration */
const DEFAULT_RERANKER_CONFIG: RerankerConfig = {
  enabled: true,
  model: 'cross-encoder',
  topN: 20,
  batchSize: 10,
};

/** Default RRF parameters */
const DEFAULT_RRF_PARAMS: RRFParams = {
  k: 60,
  vectorWeight: 0.7,
  bm25Weight: 0.3,
};

/** Low confidence threshold (default) */
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.5;

/** View-relative reference patterns */
const VIEW_REFERENCE_PATTERNS = [
  /\bthis page\b/i,
  /\bthis section\b/i,
  /\bthe table above\b/i,
  /\bthe figure above\b/i,
  /\bthe image above\b/i,
  /\bcurrent page\b/i,
  /\bhere\b/i,
  /\babove\b/i,
  /\bbelow\b/i,
];

/** Pronoun patterns for resolution */
const PRONOUN_PATTERNS = [
  /\bit\b/i,
  /\bthis\b/i,
  /\bthat\b/i,
  /\bthey\b/i,
  /\bthem\b/i,
  /\bthese\b/i,
  /\bthose\b/i,
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract keywords from a query string
 */
function extractKeywords(query: string): string[] {
  // Remove common stop words and extract meaningful terms
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but',
    'if', 'or', 'because', 'until', 'while', 'what', 'which', 'who',
    'whom', 'this', 'that', 'these', 'those', 'am', 'i', 'me', 'my',
    'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
    'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her',
    'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their',
    'theirs', 'themselves',
  ]);

  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Remove duplicates while preserving order
  return [...new Set(words)];
}

/**
 * Check if query contains view-relative references
 */
function hasViewReference(query: string): boolean {
  return VIEW_REFERENCE_PATTERNS.some(pattern => pattern.test(query));
}

/**
 * Check if query contains pronouns that might need resolution
 */
function hasPronouns(query: string): boolean {
  return PRONOUN_PATTERNS.some(pattern => pattern.test(query));
}

/**
 * Expand query using conversation context
 */
function expandQueryWithContext(query: string, context: ConversationContext): string {
  if (!context.messages || context.messages.length === 0) {
    return query;
  }

  // If query has pronouns, try to resolve them from recent context
  if (hasPronouns(query)) {
    // Get the last few messages for context
    const recentMessages = context.messages.slice(-3);
    const contextText = recentMessages
      .map(m => m.content)
      .join(' ')
      .substring(0, 500); // Limit context length

    // Extract key terms from context
    const contextKeywords = extractKeywords(contextText);
    
    if (contextKeywords.length > 0) {
      // Append relevant context keywords to the query
      const topKeywords = contextKeywords.slice(0, 3).join(' ');
      return `${query} ${topKeywords}`;
    }
  }

  return query;
}

/**
 * Convert ChunkRecord to Chunk with parsed metadata
 */
function chunkRecordToChunk(record: ChunkRecord): Chunk {
  let boundingBoxes: BoundingBox[] = [];
  try {
    boundingBoxes = JSON.parse(record.boundingBoxes || '[]');
  } catch {
    boundingBoxes = [];
  }

  const metadata: ChunkMetadata = {
    pageNumbers: record.pageNumbers || [],
    boundingBoxes,
    sectionHeader: record.sectionHeader || undefined,
    chunkIndex: record.chunkIndex,
    tokenCount: record.tokenCount,
    blockType: record.blockType as 'text' | 'table' | 'figure',
  };

  return {
    id: record.id,
    documentId: record.documentId,
    content: record.content,
    metadata,
    embedding: record.vector,
  };
}

/**
 * Calculate confidence score from retrieval scores
 * Normalizes and combines scores to produce a 0-1 confidence value
 */
function calculateConfidence(results: RetrievalResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  // Use the top result's score as the primary confidence indicator
  const topScore = results[0].score;
  
  // Also consider the average of top results for stability
  const topN = Math.min(3, results.length);
  const avgTopScore = results.slice(0, topN).reduce((sum, r) => sum + r.score, 0) / topN;
  
  // Weighted combination: 70% top score, 30% average
  const confidence = 0.7 * topScore + 0.3 * avgTopScore;
  
  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, confidence));
}

// =============================================================================
// Cross-Encoder Reranker
// =============================================================================

/**
 * Simple cross-encoder reranker using cosine similarity
 * 
 * In a production system, this would use a dedicated cross-encoder model
 * (e.g., ms-marco-MiniLM-L-6-v2). For now, we implement a lightweight
 * reranking based on query-chunk similarity.
 */
class CrossEncoderReranker {
  private embeddingService: IEmbeddingService;

  constructor(embeddingService: IEmbeddingService) {
    this.embeddingService = embeddingService;
  }

  /**
   * Rerank results using cross-encoder scoring
   * 
   * @param query - The original query
   * @param results - Results to rerank
   * @param config - Reranker configuration
   * @returns Reranked results with updated scores
   */
  async rerank(
    query: string,
    results: RetrievalResult[],
    config: RerankerConfig = DEFAULT_RERANKER_CONFIG
  ): Promise<RetrievalResult[]> {
    if (!config.enabled || results.length === 0) {
      return results;
    }

    // Limit candidates to rerank
    const candidates = results.slice(0, config.topN);
    const remaining = results.slice(config.topN);

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Score each candidate
      const scoredCandidates = await Promise.all(
        candidates.map(async (result) => {
          // Get chunk embedding (should already be stored)
          const chunkEmbedding = result.chunk.embedding;
          
          if (!chunkEmbedding || chunkEmbedding.length === 0) {
            // If no embedding, keep original score
            return result;
          }

          // Calculate cosine similarity as reranker score
          const rerankerScore = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
          
          // Combine with original score (weighted average)
          const combinedScore = 0.4 * result.score + 0.6 * rerankerScore;

          return {
            ...result,
            rerankerScore,
            score: combinedScore,
          };
        })
      );

      // Sort by new combined score
      scoredCandidates.sort((a, b) => b.score - a.score);

      // Return reranked candidates followed by remaining results
      return [...scoredCandidates, ...remaining];
    } catch (error) {
      console.error('[RetrievalService] Reranking failed:', error);
      // Return original results on failure
      return results;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    // Normalize to 0-1 range (cosine similarity is -1 to 1)
    return (dotProduct / denominator + 1) / 2;
  }
}

// =============================================================================
// Retrieval Service Implementation
// =============================================================================

/**
 * Retrieval Service
 * 
 * Orchestrates the retrieval pipeline including:
 * - Query processing and expansion
 * - Hybrid search (vector + BM25)
 * - Reranking
 * - Metadata filtering
 * - Confidence scoring
 */
export class RetrievalService implements IRetrievalService {
  private vectorStore: IVectorStore;
  private embeddingService: IEmbeddingService;
  private reranker: CrossEncoderReranker;
  private rerankerConfig: RerankerConfig;
  private rrfParams: RRFParams;
  private lowConfidenceThreshold: number;

  constructor(
    vs: IVectorStore = vectorStore,
    es: IEmbeddingService = embeddingService,
    rerankerConfig: RerankerConfig = DEFAULT_RERANKER_CONFIG,
    rrfParams: RRFParams = DEFAULT_RRF_PARAMS,
    lowConfidenceThreshold: number = DEFAULT_LOW_CONFIDENCE_THRESHOLD
  ) {
    this.vectorStore = vs;
    this.embeddingService = es;
    this.reranker = new CrossEncoderReranker(es);
    this.rerankerConfig = rerankerConfig;
    this.rrfParams = rrfParams;
    this.lowConfidenceThreshold = lowConfidenceThreshold;
  }

  /**
   * Process a query for retrieval
   * 
   * Implements Requirements 7.4, 22.1, 22.2, 22.3, 22.4, 22.5
   * 
   * @param query - The user's query
   * @param context - Optional conversation context
   * @returns Processed query with expansions
   */
  async processQuery(query: string, context?: ConversationContext): Promise<ProcessedQuery> {
    const original = query.trim();
    let expanded = original;
    const hasViewRef = hasViewReference(original);

    // Expand query with conversation context if available
    if (context) {
      expanded = expandQueryWithContext(original, context);
    }

    // Extract keywords for BM25 search
    const keywords = extractKeywords(expanded);

    // Resolve view context if query references current view
    let viewContext: ProcessedQuery['viewContext'];
    if (hasViewRef && context?.viewState) {
      viewContext = {
        currentPage: context.viewState.currentPage,
        visibleElements: context.viewState.visibleText 
          ? [context.viewState.visibleText.substring(0, 200)]
          : [],
      };
    }

    return {
      original,
      expanded,
      keywords,
      hasViewReference: hasViewRef,
      viewContext,
    };
  }

  /**
   * Retrieve relevant chunks for a query
   * 
   * Implements Requirements 7.1, 7.2, 7.3, 7.5, 7.6, 18.2
   * 
   * @param query - The user's query
   * @param docIds - Document IDs to search
   * @param options - Query options
   * @returns Array of retrieval results with scores
   */
  async retrieve(
    query: string,
    docIds: string[],
    options: QueryOptions = {}
  ): Promise<RetrievalResult[]> {
    const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };
    
    // Process the query
    const processedQuery = await this.processQuery(query);
    
    // Check if we should use fallback mode (BM25-only)
    const useFallback = embeddingFallbackManager.isInFallbackMode();
    
    // Determine search limit (get more candidates for reranking)
    const searchLimit = opts.useReranker 
      ? Math.max(opts.topK * 4, this.rerankerConfig.topN)
      : opts.topK;

    let searchResults: Array<{ id: string; score: number }>;

    if (useFallback) {
      // Fallback mode: BM25-only search (Requirement 18.2)
      console.log('[RetrievalService] Using BM25-only fallback mode');
      searchResults = await this.vectorStore.bm25Search({
        queryText: processedQuery.expanded,
        limit: searchLimit,
        documentIds: docIds.length > 0 ? docIds : undefined,
        pageRange: opts.pageFilter,
      });
    } else {
      // Try to generate query embedding
      const queryEmbedding = await generateEmbeddingWithFallback(processedQuery.expanded);
      
      if (queryEmbedding === null) {
        // Embedding failed, use BM25-only fallback
        console.log('[RetrievalService] Embedding generation failed, falling back to BM25-only');
        searchResults = await this.vectorStore.bm25Search({
          queryText: processedQuery.expanded,
          limit: searchLimit,
          documentIds: docIds.length > 0 ? docIds : undefined,
          pageRange: opts.pageFilter,
        });
      } else if (opts.useHybrid) {
        // Hybrid search: vector + BM25 with RRF
        searchResults = await this.vectorStore.hybridSearch(
          {
            queryVector: queryEmbedding,
            limit: searchLimit,
            minScore: opts.minScore,
            documentIds: docIds.length > 0 ? docIds : undefined,
            pageRange: opts.pageFilter,
          },
          {
            queryText: processedQuery.expanded,
            limit: searchLimit,
            documentIds: docIds.length > 0 ? docIds : undefined,
            pageRange: opts.pageFilter,
          },
          this.rrfParams
        );
      } else {
        // Vector-only search
        searchResults = await this.vectorStore.vectorSearch({
          queryVector: queryEmbedding,
          limit: searchLimit,
          minScore: opts.minScore,
          documentIds: docIds.length > 0 ? docIds : undefined,
          pageRange: opts.pageFilter,
        });
      }
    }

    // Fetch full chunk records
    const chunkIds = searchResults.map(r => r.id);
    const chunkRecords = await this.vectorStore.getChunks(chunkIds);

    // Create a map for quick lookup
    const chunkMap = new Map(chunkRecords.map(c => [c.id, c]));
    const scoreMap = new Map(searchResults.map(r => [r.id, r.score]));

    // Build retrieval results
    let results: RetrievalResult[] = [];
    
    for (const searchResult of searchResults) {
      const chunkRecord = chunkMap.get(searchResult.id);
      if (!chunkRecord) {
        continue;
      }

      const chunk = chunkRecordToChunk(chunkRecord);
      
      results.push({
        chunk,
        score: searchResult.score,
        vectorScore: useFallback ? undefined : searchResult.score, // Will be updated if hybrid
        bm25Score: useFallback ? searchResult.score : undefined,
        rerankerScore: undefined,
      });
    }

    // Apply metadata filters
    results = this.applyMetadataFilters(results, opts);

    // Apply reranking if enabled and not in fallback mode
    // Note: Reranking requires embeddings, so skip in fallback mode
    if (opts.useReranker && this.rerankerConfig.enabled && !useFallback) {
      results = await this.reranker.rerank(query, results, this.rerankerConfig);
    }

    // Limit to topK
    results = results.slice(0, opts.topK);

    return results;
  }

  /**
   * Retrieve using BM25-only search (explicit fallback method)
   * 
   * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
   * 
   * @param query - The user's query
   * @param docIds - Document IDs to search
   * @param options - Query options
   * @returns Array of retrieval results with scores
   */
  async retrieveBM25Only(
    query: string,
    docIds: string[],
    options: QueryOptions = {}
  ): Promise<RetrievalResult[]> {
    const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };
    
    // Process the query
    const processedQuery = await this.processQuery(query);
    
    // BM25-only search
    const searchResults = await this.vectorStore.bm25Search({
      queryText: processedQuery.expanded,
      limit: opts.topK,
      documentIds: docIds.length > 0 ? docIds : undefined,
      pageRange: opts.pageFilter,
    });

    // Fetch full chunk records
    const chunkIds = searchResults.map(r => r.id);
    const chunkRecords = await this.vectorStore.getChunks(chunkIds);

    // Create a map for quick lookup
    const chunkMap = new Map(chunkRecords.map(c => [c.id, c]));

    // Build retrieval results
    let results: RetrievalResult[] = [];
    
    for (const searchResult of searchResults) {
      const chunkRecord = chunkMap.get(searchResult.id);
      if (!chunkRecord) {
        continue;
      }

      const chunk = chunkRecordToChunk(chunkRecord);
      
      results.push({
        chunk,
        score: searchResult.score,
        vectorScore: undefined,
        bm25Score: searchResult.score,
        rerankerScore: undefined,
      });
    }

    // Apply metadata filters
    results = this.applyMetadataFilters(results, opts);

    return results;
  }

  /**
   * Rerank results using cross-encoder
   * 
   * Implements Requirement 7.3
   * 
   * @param query - The original query
   * @param results - Results to rerank
   * @returns Reranked results
   */
  async rerank(query: string, results: RetrievalResult[]): Promise<RetrievalResult[]> {
    return this.reranker.rerank(query, results, this.rerankerConfig);
  }

  /**
   * Apply metadata filters to results
   * 
   * Implements Requirement 7.5
   * 
   * @param results - Results to filter
   * @param options - Query options with filters
   * @returns Filtered results
   */
  private applyMetadataFilters(
    results: RetrievalResult[],
    options: QueryOptions
  ): RetrievalResult[] {
    let filtered = results;

    // Apply page range filter
    if (options.pageFilter) {
      const { start, end } = options.pageFilter;
      filtered = filtered.filter(result => {
        const pageNumbers = result.chunk.metadata.pageNumbers;
        return pageNumbers.some(p => p >= start && p <= end);
      });
    }

    // Apply section filter
    if (options.sectionFilter && options.sectionFilter.length > 0) {
      const sectionSet = new Set(options.sectionFilter.map(s => s.toLowerCase()));
      filtered = filtered.filter(result => {
        const sectionHeader = result.chunk.metadata.sectionHeader;
        if (!sectionHeader) {
          return false;
        }
        return sectionSet.has(sectionHeader.toLowerCase());
      });
    }

    return filtered;
  }

  /**
   * Calculate confidence score for retrieval results
   * 
   * Implements Requirements 7.6, 10.2, 10.5
   * 
   * @param results - Retrieval results
   * @returns Confidence score (0-1)
   */
  calculateConfidenceScore(results: RetrievalResult[]): number {
    return calculateConfidence(results);
  }

  /**
   * Check if results indicate low confidence
   * 
   * Implements Requirements 7.6, 10.2, 10.5
   * 
   * @param results - Retrieval results
   * @returns Whether confidence is below threshold
   */
  isLowConfidence(results: RetrievalResult[]): boolean {
    const confidence = this.calculateConfidenceScore(results);
    return confidence < this.lowConfidenceThreshold;
  }

  /**
   * Get retrieval results with confidence metadata
   * 
   * Implements Requirements 7.6, 10.2, 10.5, 18.2
   * 
   * @param query - The user's query
   * @param docIds - Document IDs to search
   * @param options - Query options
   * @returns Results with confidence information and fallback state
   */
  async retrieveWithConfidence(
    query: string,
    docIds: string[],
    options: QueryOptions = {}
  ): Promise<RetrievalResultWithFallback> {
    // Check fallback state before retrieval
    const fallbackState = embeddingFallbackManager.getState();
    const usedFallback = fallbackState.isActive;
    
    const results = await this.retrieve(query, docIds, options);
    const confidence = this.calculateConfidenceScore(results);
    const isLow = confidence < this.lowConfidenceThreshold;

    // Determine search method used
    let searchMethod: 'hybrid' | 'vector_only' | 'bm25_only';
    if (usedFallback) {
      searchMethod = 'bm25_only';
    } else if (options.useHybrid ?? true) {
      searchMethod = 'hybrid';
    } else {
      searchMethod = 'vector_only';
    }

    let warning: string | undefined;
    
    // Build warning message
    if (usedFallback) {
      // Fallback mode warning (Requirement 18.2)
      warning = fallbackState.message || 
        'Semantic search is unavailable. Results are based on keyword matching only, which may be less accurate.';
    } else if (isLow) {
      if (results.length === 0) {
        warning = 'No relevant information found in the documents.';
      } else {
        warning = 'The retrieved information may not be highly relevant to your query. Please verify the sources.';
      }
    }

    return {
      results,
      confidence,
      isLowConfidence: isLow,
      warning,
      usedFallback,
      fallbackState: usedFallback ? fallbackState : undefined,
      searchMethod,
    };
  }

  /**
   * Get the current fallback state
   * 
   * Implements Requirement 18.2
   */
  getFallbackState(): EmbeddingFallbackState {
    return embeddingFallbackManager.getState();
  }

  /**
   * Check if currently in fallback mode
   * 
   * Implements Requirement 18.2
   */
  isInFallbackMode(): boolean {
    return embeddingFallbackManager.isInFallbackMode();
  }

  /**
   * Attempt to recover from fallback mode
   * 
   * Implements Requirement 18.2
   * 
   * @returns Whether recovery was successful
   */
  async attemptFallbackRecovery(): Promise<boolean> {
    return embeddingFallbackManager.attemptRecovery();
  }

  /**
   * Update reranker configuration
   */
  setRerankerConfig(config: Partial<RerankerConfig>): void {
    this.rerankerConfig = { ...this.rerankerConfig, ...config };
  }

  /**
   * Update RRF parameters
   */
  setRRFParams(params: Partial<RRFParams>): void {
    this.rrfParams = { ...this.rrfParams, ...params };
  }

  /**
   * Update low confidence threshold
   */
  setLowConfidenceThreshold(threshold: number): void {
    this.lowConfidenceThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    rerankerConfig: RerankerConfig;
    rrfParams: RRFParams;
    lowConfidenceThreshold: number;
  } {
    return {
      rerankerConfig: { ...this.rerankerConfig },
      rrfParams: { ...this.rrfParams },
      lowConfidenceThreshold: this.lowConfidenceThreshold,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Singleton instance of the retrieval service
 */
export const retrievalService = new RetrievalService();
