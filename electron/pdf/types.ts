/**
 * PDF Services - Internal Types
 * 
 * This file contains TypeScript interfaces specific to the main process
 * PDF services implementation. These types complement the shared types
 * in src/types/pdf.ts with implementation-specific details.
 */

import type {
  PDFDocument,
  PDFPage,
  TextBlock,
  Chunk,
  ChunkMetadata,
  BoundingBox,
  EmbeddingModelInfo,
  PDFRAGSettings,
  QueryOptions,
  RetrievalResult,
} from '../../src/types/pdf';

// =============================================================================
// PDF Parser Service Types
// =============================================================================

/**
 * Internal representation of a loaded PDF in memory
 */
export interface LoadedPDF {
  /** Document metadata */
  document: PDFDocument;
  /** Cached pages (loaded on demand) */
  pages: Map<number, PDFPage>;
  /** Raw pdf.js document reference */
  pdfDocument: any; // PDFDocumentProxy from pdf.js
  /** Whether the document is fully loaded */
  isFullyLoaded: boolean;
}

/**
 * Options for text extraction
 */
export interface TextExtractionOptions {
  /** Whether to detect and preserve layout */
  preserveLayout: boolean;
  /** Whether to extract tables */
  extractTables: boolean;
  /** Whether to extract figures */
  extractFigures: boolean;
  /** Minimum font size to consider as heading */
  headingFontSizeThreshold: number;
}

/**
 * Result of layout analysis for a page
 */
export interface LayoutAnalysisResult {
  /** Detected columns */
  columns: ColumnRegion[];
  /** Reading order of text blocks */
  readingOrder: string[];
  /** Whether the page has multi-column layout */
  isMultiColumn: boolean;
}

/**
 * A column region detected in the page
 */
export interface ColumnRegion {
  /** Bounding box of the column */
  bbox: BoundingBox;
  /** Text blocks in this column */
  blockIds: string[];
}

// =============================================================================
// Chunk Manager Types
// =============================================================================

/**
 * Options for chunking a document
 */
export interface ChunkingOptions {
  /** Target chunk size in tokens */
  chunkSize: number;
  /** Overlap between chunks in tokens */
  chunkOverlap: number;
  /** Chunking strategy */
  strategy: 'fixed' | 'semantic' | 'paragraph';
  /** Whether to preserve section boundaries */
  preserveSections: boolean;
}

/**
 * Internal chunk builder state
 */
export interface ChunkBuilderState {
  /** Current chunk content */
  content: string;
  /** Current token count */
  tokenCount: number;
  /** Page numbers included */
  pageNumbers: Set<number>;
  /** Bounding boxes included */
  boundingBoxes: BoundingBox[];
  /** Current section header */
  sectionHeader?: string;
  /** Block type */
  blockType: 'text' | 'table' | 'figure';
}

/**
 * Token counting result
 */
export interface TokenCountResult {
  /** Number of tokens */
  count: number;
  /** Token boundaries (character indices) */
  boundaries: number[];
}

// =============================================================================
// Embedding Service Types
// =============================================================================

/**
 * Embedding request for batching
 */
export interface EmbeddingRequest {
  /** Unique request ID */
  id: string;
  /** Text to embed */
  text: string;
  /** Callback when embedding is ready */
  resolve: (embedding: number[]) => void;
  /** Callback on error */
  reject: (error: Error) => void;
}

/**
 * Embedding batch result
 */
export interface EmbeddingBatchResult {
  /** Request IDs */
  ids: string[];
  /** Embeddings (same order as ids) */
  embeddings: number[][];
  /** Time taken in milliseconds */
  timeMs: number;
}

/**
 * Rate limiter state
 */
export interface RateLimiterState {
  /** Requests in current window */
  requestCount: number;
  /** Window start timestamp */
  windowStart: number;
  /** Queue of pending requests */
  queue: EmbeddingRequest[];
  /** Whether currently processing */
  isProcessing: boolean;
}

// =============================================================================
// Vector Store Types
// =============================================================================

/**
 * LanceDB table schemas
 */
export interface DocumentRecord {
  id: string;
  filePath: string;
  fileName: string;
  fileHash: string;
  pageCount: number;
  title: string | null;
  author: string | null;
  indexedAt: number;
  chunkCount: number;
  embeddingModel: string;
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  content: string;
  pageNumbers: number[];
  boundingBoxes: string; // JSON serialized
  sectionHeader: string | null;
  chunkIndex: number;
  tokenCount: number;
  blockType: string;
  vector: number[];
}

export interface FTSRecord {
  chunkId: string;
  documentId: string;
  content: string;
  pageNumbers: number[];
}

/**
 * Vector search parameters
 */
export interface VectorSearchParams {
  /** Query vector */
  queryVector: number[];
  /** Number of results */
  limit: number;
  /** Minimum similarity score */
  minScore?: number;
  /** Document ID filter */
  documentIds?: string[];
  /** Page range filter */
  pageRange?: { start: number; end: number };
}

/**
 * BM25 search parameters
 */
export interface BM25SearchParams {
  /** Query text */
  queryText: string;
  /** Number of results */
  limit: number;
  /** Document ID filter */
  documentIds?: string[];
  /** Page range filter */
  pageRange?: { start: number; end: number };
}

// =============================================================================
// Retrieval Service Types
// =============================================================================

/**
 * Reciprocal Rank Fusion parameters
 */
export interface RRFParams {
  /** Constant k for RRF formula (default: 60) */
  k: number;
  /** Weight for vector results */
  vectorWeight: number;
  /** Weight for BM25 results */
  bm25Weight: number;
}

/**
 * Reranker configuration
 */
export interface RerankerConfig {
  /** Whether reranking is enabled */
  enabled: boolean;
  /** Reranker model type */
  model: 'cross-encoder' | 'llm';
  /** Number of candidates to rerank */
  topN: number;
  /** Batch size for reranking */
  batchSize: number;
}

/**
 * Query processing configuration
 */
export interface QueryProcessingConfig {
  /** Whether to expand the query */
  expandQuery: boolean;
  /** Whether to use conversation context */
  useConversationContext: boolean;
  /** Maximum context messages to consider */
  maxContextMessages: number;
}

/**
 * Processed query with expansions
 */
export interface ProcessedQuery {
  /** Original query */
  original: string;
  /** Expanded/rewritten query */
  expanded: string;
  /** Keywords extracted */
  keywords: string[];
  /** Whether query references view context */
  hasViewReference: boolean;
  /** Resolved view context (if any) */
  viewContext?: {
    currentPage: number;
    visibleElements: string[];
  };
}

// =============================================================================
// RAG Engine Types
// =============================================================================

/**
 * Context building options
 */
export interface ContextBuildOptions {
  /** Maximum tokens for context */
  maxTokens: number;
  /** Maximum number of sources */
  maxSources: number;
  /** Whether to include citation markers */
  includeCitationMarkers: boolean;
  /** Format for context */
  format: 'plain' | 'markdown' | 'structured';
}

/**
 * Built context for AI prompt
 */
export interface BuiltContext {
  /** Formatted context string */
  contextString: string;
  /** Sources included in context */
  includedSources: RetrievalResult[];
  /** Total tokens used */
  tokenCount: number;
  /** Citation mapping (chunk ID -> citation marker) */
  citationMap: Map<string, string>;
}

/**
 * Conversation context for query enhancement
 */
export interface ConversationContext {
  /** Recent messages */
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  /** Current document IDs */
  documentIds: string[];
  /** Current view state */
  viewState?: {
    currentPage: number;
    visibleText: string;
  };
}

// =============================================================================
// Service Interfaces
// =============================================================================

/**
 * PDF validation result
 */
export interface PDFValidationResult {
  /** Whether the PDF is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Whether the PDF is password protected */
  isPasswordProtected?: boolean;
}

/**
 * PDF Parser Service interface
 */
export interface IPDFParserService {
  loadDocument(filePath: string, password?: string): Promise<PDFDocument>;
  getPage(docId: string, pageNum: number): Promise<PDFPage>;
  extractAllText(docId: string, options?: Partial<TextExtractionOptions>): Promise<TextBlock[]>;
  analyzePageLayout(docId: string, pageNum: number): Promise<LayoutAnalysisResult>;
  getSectionHeaders(docId: string): Promise<TextBlock[]>;
  searchText(docId: string, query: string): Promise<any[]>;
  getDocumentOutline(docId: string): Promise<any[]>;
  /** Get major sections from the document outline for section-aware summarization (Requirement 12.2) */
  getMajorSections(docId: string): Promise<any[]>;
  unloadDocument(docId: string): void;
  isDocumentLoaded(docId: string): boolean;
  /** Check if a PDF is password protected (Requirement 18.5) */
  isPasswordProtected(filePath: string): Promise<boolean>;
  /** Validate PDF structure before loading (Requirement 5.6) */
  validatePDF(filePath: string): Promise<PDFValidationResult>;
}

/**
 * Chunk Manager interface
 */
export interface IChunkManager {
  createChunks(docId: string, textBlocks: TextBlock[], options: ChunkingOptions): Chunk[];
  getChunk(chunkId: string): Chunk | undefined;
  getChunksForDocument(docId: string): Chunk[];
  deleteChunksForDocument(docId: string): void;
  countTokens(text: string): number;
}

/**
 * Embedding Service interface
 */
export interface IEmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  getModelInfo(): EmbeddingModelInfo;
  setModel(modelId: string): Promise<void>;
  isModelAvailable(modelId: string): Promise<boolean>;
  getCurrentModelId(): string;
}

/**
 * Vector Store interface
 */
export interface IVectorStore {
  initialize(): Promise<void>;
  addDocument(doc: DocumentRecord): Promise<void>;
  addChunks(chunks: ChunkRecord[]): Promise<void>;
  vectorSearch(params: VectorSearchParams): Promise<Array<{ id: string; score: number }>>;
  bm25Search(params: BM25SearchParams): Promise<Array<{ id: string; score: number }>>;
  hybridSearch(vectorParams: VectorSearchParams, bm25Params: BM25SearchParams, rrfParams: RRFParams): Promise<Array<{ id: string; score: number }>>;
  getDocument(docId: string): Promise<DocumentRecord | null>;
  getChunk(chunkId: string): Promise<ChunkRecord | null>;
  getChunks(chunkIds: string[]): Promise<ChunkRecord[]>;
  deleteDocument(docId: string): Promise<void>;
  getCollectionStats(): Promise<{ documentCount: number; chunkCount: number; sizeBytes: number }>;
  /** Get the storage path for the vector store */
  getStoragePath(): string;
}

/**
 * Retrieval Service interface
 */
export interface IRetrievalService {
  retrieve(query: string, docIds: string[], options: QueryOptions): Promise<RetrievalResult[]>;
  rerank(query: string, results: RetrievalResult[]): Promise<RetrievalResult[]>;
  processQuery(query: string, context?: ConversationContext): Promise<ProcessedQuery>;
  retrieveWithConfidence(query: string, docIds: string[], options: QueryOptions): Promise<{
    results: RetrievalResult[];
    confidence: number;
    isLowConfidence: boolean;
    warning?: string;
  }>;
}

/**
 * RAG Engine interface
 */
export interface IRAGEngine {
  indexDocument(docId: string, options?: any): Promise<any>;
  query(query: string, docIds: string[], options?: QueryOptions, context?: ConversationContext): Promise<any>;
  getIndexStatus(docId: string): any;
  deleteIndex(docId: string): Promise<void>;
  buildContext(results: RetrievalResult[], options: ContextBuildOptions): BuiltContext;
}
