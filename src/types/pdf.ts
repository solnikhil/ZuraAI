/**
 * PDF Reader Chat Type Definitions
 * 
 * This file contains all TypeScript interfaces for the PDF Reader Chat feature,
 * including document types, chunking, retrieval, citations, sessions, and settings.
 * 
 * Requirements: 5.7, 6.3, 7.8, 8.2
 */

// =============================================================================
// PDF Document Types
// =============================================================================

/**
 * Represents a loaded PDF document with metadata
 */
export interface PDFDocument {
  /** Unique identifier for the document */
  id: string;
  /** Full file path to the PDF */
  filePath: string;
  /** Display name of the file */
  fileName: string;
  /** SHA-256 hash of the file for cache validation */
  fileHash: string;
  /** Total number of pages in the document */
  pageCount: number;
  /** Document metadata extracted from PDF */
  metadata: PDFMetadata;
  /** Timestamp when the document was loaded */
  loadedAt: number;
}

/**
 * PDF document metadata extracted from the file
 */
export interface PDFMetadata {
  /** Document title from PDF metadata */
  title?: string;
  /** Document author */
  author?: string;
  /** Document subject */
  subject?: string;
  /** Keywords associated with the document */
  keywords?: string[];
  /** Creation date timestamp */
  creationDate?: number;
  /** Last modification date timestamp */
  modificationDate?: number;
}

/**
 * Represents a single page in a PDF document
 */
export interface PDFPage {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Page width in points */
  width: number;
  /** Page height in points */
  height: number;
  /** Text blocks extracted from the page */
  textContent: TextBlock[];
  /** Images/figures extracted from the page */
  images: ImageBlock[];
  /** Tables extracted from the page */
  tables: TableBlock[];
}

// =============================================================================
// Bounding Box and Text Extraction Types
// =============================================================================

/**
 * Coordinates defining a rectangular region on a PDF page
 * Used for precise citation highlighting
 */
export interface BoundingBox {
  /** Left x-coordinate */
  x0: number;
  /** Top y-coordinate */
  y0: number;
  /** Right x-coordinate */
  x1: number;
  /** Bottom y-coordinate */
  y1: number;
  /** Page number this bounding box belongs to */
  pageNumber: number;
}

/**
 * A block of text extracted from a PDF with position information
 */
export interface TextBlock {
  /** Unique identifier for the text block */
  id: string;
  /** The extracted text content */
  text: string;
  /** Bounding box coordinates for the text */
  bbox: BoundingBox;
  /** Type of text block */
  blockType: 'paragraph' | 'heading' | 'list' | 'caption';
  /** Font size in points (if available) */
  fontSize?: number;
  /** Font name (if available) */
  fontName?: string;
}

/**
 * An image or figure extracted from a PDF
 */
export interface ImageBlock {
  /** Unique identifier for the image */
  id: string;
  /** Bounding box coordinates for the image */
  bbox: BoundingBox;
  /** Caption text associated with the figure */
  caption?: string;
  /** Alt text or description */
  altText?: string;
  /** Base64 encoded image data (optional, for thumbnails) */
  imageData?: string;
}

/**
 * A table extracted from a PDF with structure preserved
 */
export interface TableBlock {
  /** Unique identifier for the table */
  id: string;
  /** Bounding box coordinates for the entire table */
  bbox: BoundingBox;
  /** Rows of the table */
  rows: TableRow[];
  /** Table caption (if available) */
  caption?: string;
}

/**
 * A row in an extracted table
 */
export interface TableRow {
  /** Cells in this row */
  cells: TableCell[];
}

/**
 * A cell in an extracted table
 */
export interface TableCell {
  /** Text content of the cell */
  text: string;
  /** Bounding box coordinates for the cell */
  bbox: BoundingBox;
  /** Number of rows this cell spans */
  rowSpan?: number;
  /** Number of columns this cell spans */
  colSpan?: number;
}

// =============================================================================
// Chunking Types
// =============================================================================

/**
 * A chunk of document content for RAG retrieval
 */
export interface Chunk {
  /** Unique identifier for the chunk */
  id: string;
  /** ID of the source document */
  documentId: string;
  /** The text content of the chunk */
  content: string;
  /** Metadata about the chunk's location and context */
  metadata: ChunkMetadata;
  /** Vector embedding for semantic search (optional) */
  embedding?: number[];
}

/**
 * Metadata associated with a chunk
 */
export interface ChunkMetadata {
  /** Page numbers this chunk spans */
  pageNumbers: number[];
  /** Bounding boxes for the chunk content */
  boundingBoxes: BoundingBox[];
  /** Section header this chunk belongs to (if available) */
  sectionHeader?: string;
  /** Index of this chunk within the document */
  chunkIndex: number;
  /** Number of tokens in the chunk */
  tokenCount: number;
  /** Type of content in the chunk */
  blockType: 'text' | 'table' | 'figure';
}

// =============================================================================
// Retrieval Types
// =============================================================================

/**
 * Options for configuring RAG queries
 */
export interface QueryOptions {
  /** Number of top results to return (default: 5) */
  topK?: number;
  /** Minimum relevance score threshold (0-1) */
  minScore?: number;
  /** Whether to use hybrid search (vector + BM25) */
  useHybrid?: boolean;
  /** Whether to apply reranking to results */
  useReranker?: boolean;
  /** Filter results to specific page range */
  pageFilter?: { start: number; end: number };
  /** Filter results to specific sections */
  sectionFilter?: string[];
}

/**
 * A single retrieval result with scoring information
 */
export interface RetrievalResult {
  /** The retrieved chunk */
  chunk: Chunk;
  /** Combined relevance score (0-1) */
  score: number;
  /** Score from vector similarity search */
  vectorScore?: number;
  /** Score from BM25 keyword search */
  bm25Score?: number;
  /** Score from reranker (if applied) */
  rerankerScore?: number;
}

/**
 * Complete response from the RAG engine
 */
export interface RAGResponse {
  /** The generated answer text */
  answer: string;
  /** Citations linking claims to sources */
  citations: Citation[];
  /** Retrieved source chunks with scores */
  sources: RetrievalResult[];
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Whether grounded mode was enabled */
  groundedMode: boolean;
}

/**
 * A citation linking a claim to a source location
 */
export interface Citation {
  /** Unique identifier for the citation */
  id: string;
  /** Name of the source document */
  documentName: string;
  /** Primary page number for the citation */
  pageNumber: number;
  /** Bounding boxes for highlighting the cited region */
  boundingBoxes: BoundingBox[];
  /** The quoted text from the source */
  quotedText: string;
  /** ID of the source chunk */
  chunkId: string;
}

// =============================================================================
// Session Types
// =============================================================================

/**
 * A PDF chat session containing conversation history
 */
export interface PDFChatSession {
  /** Unique identifier for the session */
  id: string;
  /** Display title for the session */
  title: string;
  /** IDs of documents associated with this session */
  documentIds: string[];
  /** Messages in the conversation */
  messages: PDFChatMessage[];
  /** Timestamp when the session was created */
  createdAt: number;
  /** Timestamp when the session was last updated */
  updatedAt: number;
}

/**
 * A message in a PDF chat conversation
 */
export interface PDFChatMessage {
  /** Unique identifier for the message */
  id: string;
  /** Role of the message sender */
  role: 'user' | 'assistant';
  /** Message content */
  content: string;
  /** Timestamp when the message was sent */
  timestamp: number;
  /** Citations in the response (assistant messages only) */
  citations?: Citation[];
  /** Source chunks used for the response */
  sources?: RetrievalResult[];
  /** Text selection attached to the message (user messages) */
  attachedSelection?: TextSelection;
}

/**
 * A text selection from the PDF viewer
 */
export interface TextSelection {
  /** The selected text */
  text: string;
  /** ID of the document containing the selection */
  documentId: string;
  /** Page number of the selection */
  pageNumber: number;
  /** Bounding box of the selection */
  boundingBox: BoundingBox;
}

// =============================================================================
// Settings Types
// =============================================================================

/**
 * Configuration settings for the PDF RAG system
 */
export interface PDFRAGSettings {
  // Chunking settings
  /** Target chunk size in tokens (default: 512) */
  chunkSize: number;
  /** Overlap between chunks in tokens (default: 128) */
  chunkOverlap: number;
  /** Strategy for creating chunks */
  chunkingStrategy: 'fixed' | 'semantic' | 'paragraph';
  
  // Embedding settings
  /** Type of embedding model to use */
  embeddingModel: 'local' | 'openai' | 'voyage';
  /** Name of local embedding model (e.g., 'nomic-embed-text') */
  localEmbeddingModel?: string;
  /** Dimension of embedding vectors */
  embeddingDimensions: number;
  
  // Retrieval settings
  /** Number of top results to retrieve (default: 5) */
  topK: number;
  /** Minimum confidence score threshold (default: 0.5) */
  minConfidenceScore: number;
  /** Whether to use hybrid search (vector + BM25) */
  useHybridSearch: boolean;
  /** Weight for vector vs BM25 in hybrid search (0-1) */
  hybridAlpha: number;
  /** Whether to apply reranking to results */
  useReranker: boolean;
  /** Maximum number of sources to include in context */
  maxSourcesInContext: number;
  
  // Grounding settings
  /** Whether grounded mode is enabled by default */
  groundedModeEnabled: boolean;
  /** Whether to show warnings for low confidence results */
  showLowConfidenceWarning: boolean;
  /** Threshold below which to show low confidence warning */
  lowConfidenceThreshold: number;
}

// =============================================================================
// Indexing Types
// =============================================================================

/**
 * Options for indexing a document
 */
export interface IndexOptions {
  /** Force re-indexing even if cached index exists */
  forceReindex?: boolean;
  /** Custom chunk size for this document */
  chunkSize?: number;
  /** Custom chunk overlap for this document */
  chunkOverlap?: number;
  /** Chunking strategy to use */
  chunkingStrategy?: 'fixed' | 'semantic' | 'paragraph';
}

/**
 * Result of an indexing operation
 */
export interface IndexResult {
  /** Whether indexing was successful */
  success: boolean;
  /** ID of the indexed document */
  documentId: string;
  /** Number of chunks created */
  chunkCount: number;
  /** Time taken to index in milliseconds */
  indexingTimeMs: number;
  /** Error message if indexing failed */
  error?: string;
}

/**
 * Status of a document's index
 */
export interface IndexStatus {
  /** Whether the document is indexed */
  isIndexed: boolean;
  /** Number of chunks in the index */
  chunkCount: number;
  /** Timestamp when the index was created */
  indexedAt?: number;
  /** Embedding model used for the index */
  embeddingModel?: string;
  /** File hash used for cache validation */
  fileHash?: string;
  /** Whether the index is currently being built */
  isIndexing: boolean;
  /** Progress percentage (0-100) if indexing */
  indexingProgress?: number;
}

// =============================================================================
// Search Types
// =============================================================================

/**
 * Options for vector search
 */
export interface SearchOptions {
  /** Number of results to return */
  limit: number;
  /** Minimum similarity score */
  minScore?: number;
  /** Filter by document IDs */
  documentIds?: string[];
  /** Filter by page range */
  pageRange?: { start: number; end: number };
}

/**
 * Result from a search operation
 */
export interface SearchResult {
  /** ID of the matching chunk */
  chunkId: string;
  /** ID of the source document */
  documentId: string;
  /** Similarity score */
  score: number;
  /** The chunk content */
  content: string;
  /** Chunk metadata */
  metadata: ChunkMetadata;
}

/**
 * Options for hybrid search (vector + BM25)
 */
export interface HybridSearchOptions extends SearchOptions {
  /** Weight for vector search results (0-1) */
  vectorWeight: number;
  /** Weight for BM25 results (0-1) */
  bm25Weight: number;
  /** Constant for reciprocal rank fusion */
  rrfK?: number;
}

// =============================================================================
// Collection and Model Info Types
// =============================================================================

/**
 * Information about a vector store collection
 */
export interface CollectionInfo {
  /** Name of the collection */
  name: string;
  /** Number of documents in the collection */
  documentCount: number;
  /** Total number of chunks */
  chunkCount: number;
  /** Embedding dimensions used */
  embeddingDimensions: number;
  /** Size on disk in bytes */
  sizeBytes: number;
  /** Timestamp when the collection was created */
  createdAt: number;
  /** Timestamp when the collection was last updated */
  updatedAt: number;
}

/**
 * Information about an embedding model
 */
export interface EmbeddingModelInfo {
  /** Model identifier */
  id: string;
  /** Display name */
  name: string;
  /** Provider type */
  provider: 'local' | 'openai' | 'voyage' | 'cohere';
  /** Vector dimensions */
  dimensions: number;
  /** Maximum input tokens */
  maxTokens: number;
  /** API endpoint (for remote models) */
  endpoint?: string;
  /** Settings key for API key (for remote models) */
  apiKeySettingName?: string;
  /** Whether the model is currently available */
  isAvailable?: boolean;
}

// =============================================================================
// Navigation and Search Types
// =============================================================================

/**
 * An item in the PDF document outline (table of contents)
 */
export interface OutlineItem {
  /** Title of the outline item */
  title: string;
  /** Page number this item links to */
  pageNumber: number;
  /** Nesting level (0 = top level) */
  level: number;
  /** Child outline items */
  children: OutlineItem[];
}

/**
 * Result from text search within a PDF
 */
export interface TextSearchResult {
  /** The matched text */
  text: string;
  /** Page number where the match was found */
  pageNumber: number;
  /** Bounding box of the match */
  bbox: BoundingBox;
  /** Context around the match */
  context?: string;
  /** Index of this match in the document */
  matchIndex: number;
}

// =============================================================================
// Storage Types
// =============================================================================

/**
 * A recently opened PDF document
 */
export interface RecentDocument {
  /** Document ID */
  id: string;
  /** Full file path */
  filePath: string;
  /** Display file name */
  fileName: string;
  /** Timestamp when last opened */
  lastOpenedAt: number;
  /** Whether the document is indexed */
  isIndexed: boolean;
  /** Page count (for display) */
  pageCount?: number;
}

/**
 * Storage structure for PDF chat data
 */
export interface PDFChatStore {
  /** All PDF chat sessions */
  sessions: PDFChatSession[];
  /** Recently opened documents */
  recentDocuments: RecentDocument[];
  /** RAG settings */
  settings: PDFRAGSettings;
}

// =============================================================================
// Feedback Types
// =============================================================================

/**
 * User feedback on an AI response
 */
export interface ResponseFeedback {
  /** ID of the response being rated */
  responseId: string;
  /** Session ID */
  sessionId: string;
  /** Feedback type */
  type: 'thumbs_up' | 'thumbs_down';
  /** Timestamp of the feedback */
  timestamp: number;
  /** Optional comment */
  comment?: string;
}

/**
 * User feedback on a citation
 */
export interface CitationFeedback {
  /** ID of the citation being flagged */
  citationId: string;
  /** ID of the response containing the citation */
  responseId: string;
  /** Session ID */
  sessionId: string;
  /** Type of issue */
  type: 'wrong_citation' | 'missing_citation' | 'inaccurate_quote';
  /** Timestamp of the feedback */
  timestamp: number;
  /** Optional comment */
  comment?: string;
}

// =============================================================================
// Export Types
// =============================================================================

/**
 * Options for exporting chat responses
 */
export interface ExportOptions {
  /** Format for the export */
  format: 'markdown' | 'html' | 'pdf';
  /** Whether to include citations */
  includeCitations: boolean;
  /** Whether to include source chunks */
  includeSources: boolean;
  /** Whether to include metadata */
  includeMetadata: boolean;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  /** Whether export was successful */
  success: boolean;
  /** Exported content */
  content: string;
  /** File path if saved to disk */
  filePath?: string;
  /** Error message if export failed */
  error?: string;
}

// =============================================================================
// Default Settings
// =============================================================================

/**
 * Default RAG settings
 */
export const DEFAULT_PDF_RAG_SETTINGS: PDFRAGSettings = {
  // Chunking
  chunkSize: 512,
  chunkOverlap: 128,
  chunkingStrategy: 'semantic',
  
  // Embedding
  embeddingModel: 'local',
  localEmbeddingModel: 'nomic-embed-text',
  embeddingDimensions: 768,
  
  // Retrieval
  topK: 5,
  minConfidenceScore: 0.5,
  useHybridSearch: true,
  hybridAlpha: 0.7,
  useReranker: true,
  maxSourcesInContext: 8,
  
  // Grounding
  groundedModeEnabled: false,
  showLowConfidenceWarning: true,
  lowConfidenceThreshold: 0.5,
};

// =============================================================================
// Citation Parsing Utilities
// =============================================================================

/**
 * Regex pattern for parsing citations in AI responses
 * Format: [[cite:CHUNK_ID:pPAGE_NUMBER]]
 */
export const CITATION_PATTERN = /\[\[cite:([a-zA-Z0-9_-]+):p(\d+)\]\]/g;

/**
 * Parsed citation from AI response text
 */
export interface ParsedCitation {
  /** The chunk ID referenced */
  chunkId: string;
  /** The page number */
  pageNumber: number;
  /** The raw citation text that was matched */
  rawText: string;
  /** Start index in the original text */
  startIndex: number;
  /** End index in the original text */
  endIndex: number;
}

// =============================================================================
// IPC Channel Types
// =============================================================================

/**
 * PDF IPC channel names for type-safe IPC communication
 */
export const PDF_IPC_CHANNELS = {
  // PDF Loading & Parsing
  LOAD: 'pdf:load',
  GET_PAGE: 'pdf:get-page',
  SEARCH_TEXT: 'pdf:search-text',
  GET_OUTLINE: 'pdf:get-outline',
  UNLOAD: 'pdf:unload',
  
  // Indexing
  INDEX: 'pdf:index',
  GET_INDEX_STATUS: 'pdf:get-index-status',
  DELETE_INDEX: 'pdf:delete-index',
  
  // RAG Query
  QUERY: 'pdf:query',
  GET_CHUNKS: 'pdf:get-chunks',
  
  // Session Management
  CREATE_SESSION: 'pdf-chat:create-session',
  GET_SESSIONS: 'pdf-chat:get-sessions',
  GET_SESSION: 'pdf-chat:get-session',
  SAVE_SESSION: 'pdf-chat:save-session',
  DELETE_SESSION: 'pdf-chat:delete-session',
  
  // Settings
  GET_SETTINGS: 'pdf:get-settings',
  UPDATE_SETTINGS: 'pdf:update-settings',
  
  // Feedback
  SAVE_FEEDBACK: 'pdf:save-feedback',
  
  // Events (for ON_CHANNELS)
  INDEX_PROGRESS: 'pdf:index-progress',
  INDEX_COMPLETE: 'pdf:index-complete',
  INDEX_ERROR: 'pdf:index-error',
} as const;

/**
 * Type for PDF IPC channel names
 */
export type PDFIPCChannel = typeof PDF_IPC_CHANNELS[keyof typeof PDF_IPC_CHANNELS];
