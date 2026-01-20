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
 * - LRU chunk caching for frequently accessed chunks (Requirement 19.5, 19.6)
 * 
 * Requirements: 7.3, 7.5, 7.6, 10.2, 10.5, 18.2, 19.5, 19.6
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

/** Low confidence threshold (default) - lowered from 0.5 for better retrieval coverage */
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.4;

/** Chunk cache configuration (Requirements 19.5, 19.6) */
const CHUNK_CACHE_MAX_SIZE = 500; // Maximum number of chunks to cache
const CHUNK_CACHE_MAX_MEMORY_MB = 50; // Maximum memory usage in MB before clearing cache
const CHUNK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL for cached chunks

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
// LRU Chunk Cache (Requirements 19.5, 19.6)
// =============================================================================

/**
 * Cache entry with metadata for LRU eviction
 */
interface CacheEntry {
  chunk: ChunkRecord;
  lastAccessed: number;
  accessCount: number;
  sizeBytes: number;
}

/**
 * LRU Cache for frequently accessed chunks
 * 
 * Implements Requirements 19.5, 19.6:
 * - 19.5: Cache frequently accessed chunks in memory for faster retrieval
 * - 19.6: Release cache on memory pressure
 */
class ChunkCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private maxMemoryBytes: number;
  private ttlMs: number;
  private currentMemoryBytes: number = 0;

  constructor(
    maxSize: number = CHUNK_CACHE_MAX_SIZE,
    maxMemoryMB: number = CHUNK_CACHE_MAX_MEMORY_MB,
    ttlMs: number = CHUNK_CACHE_TTL_MS
  ) {
    this.maxSize = maxSize;
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
    this.ttlMs = ttlMs;
  }

  /**
   * Estimate memory size of a chunk record
   */
  private estimateSize(chunk: ChunkRecord): number {
    // Rough estimate: content length + vector size + metadata overhead
    const contentSize = (chunk.content?.length || 0) * 2; // UTF-16
    const vectorSize = (chunk.vector?.length || 0) * 4; // Float32
    const metadataSize = 500; // Approximate overhead for other fields
    return contentSize + vectorSize + metadataSize;
  }

  /**
   * Get a chunk from cache
   */
  get(chunkId: string): ChunkRecord | null {
    const entry = this.cache.get(chunkId);
    
    if (!entry) {
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.lastAccessed > this.ttlMs) {
      this.delete(chunkId);
      return null;
    }

    // Update access metadata
    entry.lastAccessed = now;
    entry.accessCount++;

    return entry.chunk;
  }

  /**
   * Get multiple chunks from cache
   * Returns found chunks and list of missing IDs
   */
  getMany(chunkIds: string[]): { found: ChunkRecord[]; missing: string[] } {
    const found: ChunkRecord[] = [];
    const missing: string[] = [];

    for (const id of chunkIds) {
      const chunk = this.get(id);
      if (chunk) {
        found.push(chunk);
      } else {
        missing.push(id);
      }
    }

    return { found, missing };
  }

  /**
   * Add a chunk to cache
   */
  set(chunk: ChunkRecord): void {
    const size = this.estimateSize(chunk);

    // Check if adding this chunk would exceed memory limit
    if (this.currentMemoryBytes + size > this.maxMemoryBytes) {
      this.evictLRU(size);
    }

    // Check if cache is at max size
    if (this.cache.size >= this.maxSize) {
      this.evictLRU(0);
    }

    // Remove existing entry if present
    if (this.cache.has(chunk.id)) {
      this.delete(chunk.id);
    }

    // Add new entry
    this.cache.set(chunk.id, {
      chunk,
      lastAccessed: Date.now(),
      accessCount: 1,
      sizeBytes: size,
    });
    this.currentMemoryBytes += size;
  }

  /**
   * Add multiple chunks to cache
   */
  setMany(chunks: ChunkRecord[]): void {
    for (const chunk of chunks) {
      this.set(chunk);
    }
  }

  /**
   * Delete a chunk from cache
   */
  delete(chunkId: string): boolean {
    const entry = this.cache.get(chunkId);
    if (entry) {
      this.currentMemoryBytes -= entry.sizeBytes;
      return this.cache.delete(chunkId);
    }
    return false;
  }

  /**
   * Evict least recently used entries to free up space
   */
  private evictLRU(requiredBytes: number): void {
    // Sort entries by last accessed time (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    let freedBytes = 0;
    let evictedCount = 0;

    for (const [id, entry] of entries) {
      // Stop if we've freed enough space and cache is under max size
      if (freedBytes >= requiredBytes && this.cache.size - evictedCount < this.maxSize) {
        break;
      }

      this.cache.delete(id);
      freedBytes += entry.sizeBytes;
      this.currentMemoryBytes -= entry.sizeBytes;
      evictedCount++;
    }

    if (evictedCount > 0) {
      console.log(`[ChunkCache] Evicted ${evictedCount} entries, freed ${Math.round(freedBytes / 1024)}KB`);
    }
  }

  /**
   * Clear all cached chunks for a document
   */
  clearDocument(documentId: string): number {
    let cleared = 0;
    for (const [id, entry] of this.cache.entries()) {
      if (entry.chunk.documentId === documentId) {
        this.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Clear entire cache (for memory pressure)
   * Implements Requirement 19.6
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.currentMemoryBytes = 0;
    console.log(`[ChunkCache] Cleared ${size} entries`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    memoryBytes: number;
    maxMemoryBytes: number;
    hitRate: number;
  } {
    let totalAccesses = 0;
    let totalHits = 0;

    for (const entry of this.cache.values()) {
      totalAccesses += entry.accessCount;
      totalHits += entry.accessCount - 1; // First access is a miss
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryBytes: this.currentMemoryBytes,
      maxMemoryBytes: this.maxMemoryBytes,
      hitRate: totalAccesses > 0 ? totalHits / totalAccesses : 0,
    };
  }

  /**
   * Check if memory pressure is high and clear cache if needed
   * Implements Requirement 19.6
   */
  checkMemoryPressure(): boolean {
    // Check if we're using more than 80% of max memory
    if (this.currentMemoryBytes > this.maxMemoryBytes * 0.8) {
      console.log('[ChunkCache] Memory pressure detected, clearing cache');
      this.clear();
      return true;
    }
    return false;
  }
}

// Global chunk cache instance
const chunkCache = new ChunkCache();

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
 * - Chunk caching for performance (Requirements 19.5, 19.6)
 */
export class RetrievalService implements IRetrievalService {
  private vectorStore: IVectorStore;
  private embeddingService: IEmbeddingService;
  private reranker: CrossEncoderReranker;
  private rerankerConfig: RerankerConfig;
  private rrfParams: RRFParams;
  private lowConfidenceThreshold: number;
  private cache: ChunkCache;

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
    this.cache = chunkCache; // Use global cache instance
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

    // For short queries (< 4 words), add common document-related terms to improve matching
    const wordCount = original.split(/\s+/).length;
    if (wordCount < 4 && !hasViewRef) {
      // Add generic document terms to help with broad queries
      const shortQueryExpansion = this.expandShortQuery(original);
      if (shortQueryExpansion !== original) {
        expanded = shortQueryExpansion;
        console.log('[RetrievalService] 📝 Short query expanded: "' + original + '" → "' + expanded + '"');
      }
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
   * Expand short/vague queries with additional context for better matching
   * 
   * @param query - Original short query
   * @returns Expanded query with additional terms
   */
  private expandShortQuery(query: string): string {
    const normalized = query.toLowerCase().trim();
    
    // Patterns for common short queries and their expansions
    const expansions: Array<{ pattern: RegExp; expansion: string }> = [
      // Document overview queries
      { pattern: /^(what|about|overview|summary)$/i, expansion: `${query} document content main topic` },
      { pattern: /^tell me$/i, expansion: `${query} about document content` },
      // Topic queries
      { pattern: /^(topic|subject|theme)$/i, expansion: `main ${query} content discusses` },
      // Author/metadata queries  
      { pattern: /^(author|writer|by whom)$/i, expansion: `${query} written published created` },
      // Date queries
      { pattern: /^(date|when|year)$/i, expansion: `${query} published created written` },
      // Conclusion/findings
      { pattern: /^(conclusion|result|finding)s?$/i, expansion: `${query} summary main points outcome` },
      // Introduction
      { pattern: /^(intro|introduction|beginning)$/i, expansion: `${query} overview abstract purpose` },
    ];

    for (const { pattern, expansion } of expansions) {
      if (pattern.test(normalized)) {
        return expansion;
      }
    }

    // For other short queries, add generic document context
    if (normalized.length < 20) {
      return `${query} document content`;
    }

    return query;
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

    console.log('[RetrievalService] ───────────────────────────────────────────────');
    console.log('[RetrievalService] 🔎 SEARCH START');
    console.log('[RetrievalService]    Query: "' + query.substring(0, 60) + (query.length > 60 ? '...' : '') + '"');
    console.log('[RetrievalService]    Document IDs to search:', docIds);

    // Process the query
    const processedQuery = await this.processQuery(query);
    console.log('[RetrievalService]    Expanded query: "' + processedQuery.expanded.substring(0, 60) + '"');
    console.log('[RetrievalService]    Keywords:', processedQuery.keywords.slice(0, 5).join(', '));

    // Check if we should use fallback mode (BM25-only)
    const useFallback = embeddingFallbackManager.isInFallbackMode();

    // Determine search limit (get more candidates for reranking)
    const searchLimit = opts.useReranker
      ? Math.max(opts.topK * 4, this.rerankerConfig.topN)
      : opts.topK;

    let searchResults: Array<{ id: string; score: number }>;
    let searchMethod = 'unknown';

    if (useFallback) {
      // Fallback mode: BM25-only search (Requirement 18.2)
      searchMethod = 'BM25-only (fallback)';
      console.log('[RetrievalService]    ⚠️ Using BM25-only fallback mode');
      searchResults = await this.vectorStore.bm25Search({
        queryText: processedQuery.expanded,
        limit: searchLimit,
        documentIds: docIds.length > 0 ? docIds : undefined,
        pageRange: opts.pageFilter,
      });
    } else {
      // Try to generate query embedding
      console.log('[RetrievalService]    Generating query embedding...');
      const queryEmbedding = await generateEmbeddingWithFallback(processedQuery.expanded);

      if (queryEmbedding === null) {
        // Embedding failed, use BM25-only fallback
        searchMethod = 'BM25-only (embedding failed)';
        console.log('[RetrievalService]    ⚠️ Embedding generation failed, falling back to BM25-only');
        searchResults = await this.vectorStore.bm25Search({
          queryText: processedQuery.expanded,
          limit: searchLimit,
          documentIds: docIds.length > 0 ? docIds : undefined,
          pageRange: opts.pageFilter,
        });
      } else if (opts.useHybrid) {
        // Hybrid search: vector + BM25 with RRF
        searchMethod = 'Hybrid (vector + BM25)';
        console.log('[RetrievalService]    Using hybrid search (vector + BM25)');
        console.log('[RetrievalService]    Embedding dimensions:', queryEmbedding.length);
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
        searchMethod = 'Vector-only';
        console.log('[RetrievalService]    Using vector-only search');
        searchResults = await this.vectorStore.vectorSearch({
          queryVector: queryEmbedding,
          limit: searchLimit,
          minScore: opts.minScore,
          documentIds: docIds.length > 0 ? docIds : undefined,
          pageRange: opts.pageFilter,
        });
      }
    }

    console.log('[RetrievalService] 📦 SEARCH RESULTS');
    console.log('[RetrievalService]    Method: ' + searchMethod);
    console.log('[RetrievalService]    Chunks found: ' + searchResults.length);
    if (searchResults.length > 0) {
      console.log('[RetrievalService]    Top scores:', searchResults.slice(0, 5).map(r => r.score.toFixed(3)).join(', '));
    } else {
      console.log('[RetrievalService]    ⚠️ NO CHUNKS FOUND - check if document IDs match indexed documents');
    }

    // BM25 fallback: If hybrid/vector search returned no results, try BM25-only with lower threshold
    let usedBM25Fallback = false;
    if (searchResults.length === 0 && !useFallback && searchMethod !== 'BM25-only (embedding failed)') {
      console.log('[RetrievalService] 🔄 Attempting BM25 fallback search...');
      const bm25Results = await this.vectorStore.bm25Search({
        queryText: processedQuery.expanded,
        limit: searchLimit,
        documentIds: docIds.length > 0 ? docIds : undefined,
        pageRange: opts.pageFilter,
      });
      
      if (bm25Results.length > 0) {
        searchResults = bm25Results;
        searchMethod = 'BM25-only (fallback after empty results)';
        usedBM25Fallback = true;
        console.log('[RetrievalService] ✅ BM25 fallback found ' + bm25Results.length + ' results');
        console.log('[RetrievalService]    Top scores:', bm25Results.slice(0, 5).map(r => r.score.toFixed(3)).join(', '));
      } else {
        console.log('[RetrievalService] ⚠️ BM25 fallback also found no results');
      }
    }

    // Fetch full chunk records (with caching - Requirements 19.5, 19.6)
    const chunkIds = searchResults.map(r => r.id);

    // Check cache first
    const { found: cachedChunks, missing: missingIds } = this.cache.getMany(chunkIds);
    
    // Fetch missing chunks from vector store
    let fetchedChunks: ChunkRecord[] = [];
    if (missingIds.length > 0) {
      fetchedChunks = await this.vectorStore.getChunks(missingIds);
      // Add fetched chunks to cache
      this.cache.setMany(fetchedChunks);
    }
    
    // Combine cached and fetched chunks
    const allChunks = [...cachedChunks, ...fetchedChunks];
    const chunkRecords = allChunks;

    // Create a map for quick lookup
    const chunkMap = new Map(chunkRecords.map(c => [c.id, c]));
    const scoreMap = new Map(searchResults.map(r => [r.id, r.score]));

    // Build retrieval results
    let results: RetrievalResult[] = [];
    const isBM25Mode = useFallback || usedBM25Fallback;
    
    for (const searchResult of searchResults) {
      const chunkRecord = chunkMap.get(searchResult.id);
      if (!chunkRecord) {
        continue;
      }

      const chunk = chunkRecordToChunk(chunkRecord);
      
      results.push({
        chunk,
        score: searchResult.score,
        vectorScore: isBM25Mode ? undefined : searchResult.score, // Will be updated if hybrid
        bm25Score: isBM25Mode ? searchResult.score : undefined,
        rerankerScore: undefined,
      });
    }

    // Apply metadata filters
    results = this.applyMetadataFilters(results, opts);

    // Apply reranking if enabled and not in fallback mode
    // Note: Reranking requires embeddings, so skip in BM25 fallback mode
    if (opts.useReranker && this.rerankerConfig.enabled && !isBM25Mode) {
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

  // ===========================================================================
  // Cache Management (Requirements 19.5, 19.6)
  // ===========================================================================

  /**
   * Get cache statistics
   * 
   * Implements Requirement 19.5
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    memoryBytes: number;
    maxMemoryBytes: number;
    hitRate: number;
  } {
    return this.cache.getStats();
  }

  /**
   * Clear cache for a specific document
   * 
   * Implements Requirement 19.6
   * 
   * @param documentId - Document ID to clear from cache
   * @returns Number of entries cleared
   */
  clearDocumentCache(documentId: string): number {
    return this.cache.clearDocument(documentId);
  }

  /**
   * Clear entire chunk cache
   * 
   * Implements Requirement 19.6: Release cache on memory pressure
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check memory pressure and clear cache if needed
   * 
   * Implements Requirement 19.6
   * 
   * @returns Whether cache was cleared due to memory pressure
   */
  checkMemoryPressure(): boolean {
    return this.cache.checkMemoryPressure();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Singleton instance of the retrieval service using global registry
 */
export const retrievalService = (() => {
  const globalKey = Symbol.for('zura.retrievalService');
  const globalRegistry = global as any;
  
  if (!globalRegistry[globalKey]) {
    globalRegistry[globalKey] = new RetrievalService();
  }
  
  return globalRegistry[globalKey] as RetrievalService;
})();

