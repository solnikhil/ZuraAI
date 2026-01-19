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
  /** PDF-aware system prompt for AI (optional, added by handlers) */
  pdfSystemPrompt?: string;
  /** Document metadata for context (optional, added by handlers) */
  documentMetadata?: Array<{
    id: string;
    fileName: string;
    pageCount: number;
    title?: string;
  }>;
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
  /** ID of the source document (for cross-document scenarios) */
  documentId?: string;
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
  /** Ollama base URL for local embeddings (default: http://localhost:11434) */
  ollamaBaseUrl?: string;

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

  // Image processing settings
  /** Whether to process images during indexing */
  processImages: boolean;
  /** Vision model to use for image description (e.g., 'llava', 'bakllava') */
  visionModel: string;
  /** Whether to enable OCR fallback when vision model unavailable */
  enableOCRFallback: boolean;
  /** Prefer vision model over OCR when both available */
  preferVisionOverOCR: boolean;
}

// =============================================================================
// Per-Document Settings Types
// =============================================================================

/**
 * Per-document retrieval settings
 * Allows customizing RAG behavior for individual documents/collections
 * 
 * Implements Requirement 16.7: Support per-collection retrieval settings
 */
export interface DocumentRetrievalSettings {
  /** Document ID this settings applies to */
  documentId: string;
  /** Display name for the document (for UI) */
  documentName: string;
  /** Whether custom settings are enabled for this document */
  enabled: boolean;

  // Chunking overrides (optional - uses global if not set)
  /** Custom chunk size for this document */
  chunkSize?: number;
  /** Custom chunk overlap for this document */
  chunkOverlap?: number;
  /** Custom chunking strategy for this document */
  chunkingStrategy?: 'fixed' | 'semantic' | 'paragraph';

  // Retrieval overrides (optional - uses global if not set)
  /** Custom top-K results for this document */
  topK?: number;
  /** Custom minimum confidence score for this document */
  minConfidenceScore?: number;
  /** Custom hybrid search setting for this document */
  useHybridSearch?: boolean;
  /** Custom hybrid alpha (vector weight) for this document */
  hybridAlpha?: number;
  /** Custom reranker setting for this document */
  useReranker?: boolean;
  /** Custom max sources in context for this document */
  maxSourcesInContext?: number;

  // Grounding overrides (optional - uses global if not set)
  /** Custom grounded mode setting for this document */
  groundedModeEnabled?: boolean;
  /** Custom low confidence warning setting for this document */
  showLowConfidenceWarning?: boolean;
  /** Custom low confidence threshold for this document */
  lowConfidenceThreshold?: number;

  /** Timestamp when settings were last updated */
  updatedAt: number;
}

/**
 * Default per-document settings (all overrides disabled)
 */
export const DEFAULT_DOCUMENT_RETRIEVAL_SETTINGS: Omit<DocumentRetrievalSettings, 'documentId' | 'documentName'> = {
  enabled: false,
  updatedAt: Date.now(),
};

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
  /** Override embedding model for this document */
  embeddingModel?: string;
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
  /** Storage path where the index is stored */
  storagePath?: string;
  /** Size of the index in bytes */
  storageSizeBytes?: number;
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
 * A major section identified from the document outline
 * Used for section-aware summarization (Requirement 12.2)
 */
export interface MajorSection {
  /** Title of the section */
  title: string;
  /** Starting page number */
  startPage: number;
  /** Ending page number (exclusive, -1 if unknown/last section) */
  endPage: number;
  /** Nesting level (0 = top level) */
  level: number;
  /** Subsections within this section */
  subsections: MajorSection[];
  /** Whether this is a top-level section */
  isTopLevel: boolean;
}

/**
 * Summary of a single section
 * Used for section-aware summarization (Requirement 12.3)
 */
export interface SectionSummary {
  /** Title of the section */
  sectionTitle: string;
  /** Starting page number */
  startPage: number;
  /** Ending page number */
  endPage: number;
  /** Nesting level */
  level: number;
  /** Summary content (generated by AI) */
  content: string;
  /** Citations for this section (Requirement 12.4) */
  citations: Citation[];
  /** Source chunks used for this section */
  sources: RetrievalResult[];
  /** Context string used for AI generation */
  contextString: string;
}

/**
 * Complete document summary with section summaries
 * Used for section-aware summarization (Requirements 12.1, 12.3, 12.4)
 */
export interface DocumentSummary {
  /** Document ID */
  documentId: string;
  /** Document file name */
  documentName: string;
  /** Total page count */
  pageCount: number;
  /** Number of sections summarized */
  sectionCount: number;
  /** Individual section summaries */
  sectionSummaries: SectionSummary[];
  /** Combined overall summary (generated by AI) */
  overallSummary: string;
  /** All citations from all sections (Requirement 12.4) */
  citations: Citation[];
  /** Timestamp when summary was generated */
  generatedAt: number;
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
  ollamaBaseUrl: 'http://localhost:11434',

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

  // Image processing
  processImages: true,
  visionModel: 'qwen2-vl:2b',
  enableOCRFallback: true,
  preferVisionOverOCR: true,
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
  GET_MAJOR_SECTIONS: 'pdf:get-major-sections',
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
  GET_RECENT_DOCUMENTS: 'pdf-chat:get-recent-documents',

  // Settings
  GET_SETTINGS: 'pdf:get-settings',
  UPDATE_SETTINGS: 'pdf:update-settings',

  // Per-Document Settings (Requirement 16.7)
  GET_DOCUMENT_SETTINGS: 'pdf:get-document-settings',
  UPDATE_DOCUMENT_SETTINGS: 'pdf:update-document-settings',
  DELETE_DOCUMENT_SETTINGS: 'pdf:delete-document-settings',
  GET_ALL_DOCUMENT_SETTINGS: 'pdf:get-all-document-settings',

  // Embedding Model Management (Requirement 21.6)
  CHECK_MODEL_CHANGE: 'pdf:check-model-change',
  GET_DOCUMENTS_NEEDING_REINDEX: 'pdf:get-documents-needing-reindex',
  GET_INDEXED_DOCUMENTS: 'pdf:get-indexed-documents',
  REINDEX_DOCUMENTS: 'pdf:reindex-documents',

  // Model Caching (Requirement 21.7)
  GET_MODEL_CACHE_STATUS: 'pdf:get-model-cache-status',
  GET_ALL_MODELS_STATUS: 'pdf:get-all-models-status',
  DOWNLOAD_MODEL: 'pdf:download-model',
  CLEAR_MODEL_CACHE: 'pdf:clear-model-cache',
  REFRESH_MODEL_STATUS: 'pdf:refresh-model-status',

  // Embedding Fallback (Requirement 18.2)
  GET_EMBEDDING_FALLBACK_STATE: 'pdf:get-embedding-fallback-state',
  ATTEMPT_EMBEDDING_RECOVERY: 'pdf:attempt-embedding-recovery',
  GET_EMBEDDING_FALLBACK_NOTIFICATION: 'pdf:get-embedding-fallback-notification',
  CHECK_EMBEDDING_AVAILABILITY: 'pdf:check-embedding-availability',

  // Index Corruption Recovery (Requirement 18.4)
  CHECK_INDEX_CORRUPTION: 'pdf:check-index-corruption',
  REBUILD_CORRUPTED_INDEX: 'pdf:rebuild-corrupted-index',
  CLEANUP_ORPHANED_CHUNKS: 'pdf:cleanup-orphaned-chunks',
  REPAIR_CHUNK_COUNTS: 'pdf:repair-chunk-counts',
  GET_DOCUMENTS_NEEDING_REBUILD: 'pdf:get-documents-needing-rebuild',

  // Image Processing
  CHECK_VISION_AVAILABILITY: 'pdf:check-vision-availability',
  GET_VISION_MODELS: 'pdf:get-vision-models',
  GET_IMAGE_FALLBACK_STATE: 'pdf:get-image-fallback-state',
  ATTEMPT_IMAGE_RECOVERY: 'pdf:attempt-image-recovery',
  UPDATE_IMAGE_CONFIG: 'pdf:update-image-config',

  // Feedback
  SAVE_FEEDBACK: 'pdf:save-feedback',
  GET_FEEDBACK: 'pdf:get-feedback',

  // Events (for ON_CHANNELS)
  INDEX_PROGRESS: 'pdf:index-progress',
  INDEX_COMPLETE: 'pdf:index-complete',
  INDEX_ERROR: 'pdf:index-error',
} as const;

/**
 * Type for PDF IPC channel names
 */
export type PDFIPCChannel = typeof PDF_IPC_CHANNELS[keyof typeof PDF_IPC_CHANNELS];

// =============================================================================
// Model Change Types (Requirement 21.6)
// =============================================================================

/**
 * Information about an embedding model change
 * Used to detect when re-indexing is needed
 * 
 * Implements Requirement 21.6: Handle embedding model changes
 */
export interface ModelChangeInfo {
  /** Whether the model has changed from what was used for indexing */
  hasChanged: boolean;
  /** Previous model ID (the one used for indexing) */
  previousModelId?: string;
  /** Current/new model ID */
  currentModelId: string;
  /** Whether re-indexing is required (dimensions differ) */
  requiresReindex: boolean;
  /** Previous model dimensions */
  previousDimensions?: number;
  /** Current model dimensions */
  currentDimensions: number;
}

/**
 * Information about an indexed document with its embedding model
 * Used for displaying model mismatch warnings
 * 
 * Implements Requirement 21.6: Handle embedding model changes
 */
export interface IndexedDocumentInfo {
  /** Document ID */
  id: string;
  /** Document file name */
  fileName: string;
  /** Document file path */
  filePath: string;
  /** Number of chunks in the index */
  chunkCount: number;
  /** Embedding model used for indexing */
  embeddingModel: string;
  /** Timestamp when indexed */
  indexedAt: number;
  /** Whether this document needs re-indexing with current model */
  needsReindex: boolean;
  /** Current model ID for comparison */
  currentModelId?: string;
}

// =============================================================================
// Model Caching Types (Requirement 21.7)
// =============================================================================

/**
 * Status of an embedding model's availability and cache state
 * 
 * Implements Requirement 21.7: Cache downloaded models locally, support offline use
 */
export interface ModelCacheStatus {
  /** Model identifier */
  modelId: string;
  /** Display name of the model */
  modelName: string;
  /** Provider type */
  provider: 'local' | 'openai' | 'voyage' | 'cohere';
  /** Whether the model is currently available for use */
  isAvailable: boolean;
  /** Whether the model is cached locally (for local models) */
  isCached: boolean;
  /** Whether the model is currently being downloaded */
  isDownloading: boolean;
  /** Download progress (0-100) if downloading */
  downloadProgress?: number;
  /** Size of the cached model in bytes (for local models) */
  cacheSizeBytes?: number;
  /** Timestamp when availability was last checked */
  lastCheckedAt: number;
  /** Error message if model is unavailable */
  errorMessage?: string;
  /** Whether the model requires an API key */
  requiresApiKey: boolean;
  /** Whether the required API key is configured */
  hasApiKey?: boolean;
  /** Embedding dimensions for this model */
  dimensions?: number;
}

/**
 * Result of a model download operation
 */
export interface ModelDownloadResult {
  /** Whether the download was successful */
  success: boolean;
  /** Model ID that was downloaded */
  modelId: string;
  /** Error message if download failed */
  error?: string;
  /** Time taken to download in milliseconds */
  downloadTimeMs?: number;
}

/**
 * Options for checking model availability
 */
export interface ModelCheckOptions {
  /** Force a fresh check, bypassing cache */
  forceRefresh?: boolean;
  /** Timeout for the check in milliseconds */
  timeoutMs?: number;
}

/**
 * Aggregate status of all embedding models
 */
export interface AllModelsStatus {
  /** Status of each model */
  models: ModelCacheStatus[];
  /** Currently selected model ID */
  currentModelId: string;
  /** Whether any model is available for use */
  hasAvailableModel: boolean;
  /** Timestamp when status was last updated */
  lastUpdatedAt: number;
}

// =============================================================================
// Embedding Fallback Types (Requirement 18.2)
// =============================================================================

/**
 * Reason for embedding fallback
 * 
 * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
 */
export type EmbeddingFallbackReason =
  | 'model_unavailable'      // Embedding model is not available (Ollama not running, API key missing)
  | 'generation_failed'      // Embedding generation failed (network error, timeout)
  | 'rate_limited'           // API rate limit exceeded
  | 'model_loading'          // Model is still loading/downloading
  | 'dimension_mismatch'     // Embedding dimensions don't match indexed documents
  | 'unknown';               // Unknown error

/**
 * State of the embedding fallback system
 * 
 * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
 */
export interface EmbeddingFallbackState {
  /** Whether fallback mode is currently active */
  isActive: boolean;
  /** Reason for the fallback (if active) */
  reason?: EmbeddingFallbackReason;
  /** Human-readable message explaining the fallback */
  message?: string;
  /** Timestamp when fallback was activated */
  activatedAt?: number;
  /** Number of consecutive embedding failures */
  failureCount: number;
  /** Last error message from embedding service */
  lastError?: string;
  /** Whether recovery is possible (model might become available) */
  canRecover: boolean;
  /** Timestamp of last recovery attempt */
  lastRecoveryAttempt?: number;
}

/**
 * Result of a retrieval operation with fallback information
 * 
 * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
 */
export interface RetrievalResultWithFallback {
  /** The retrieval results */
  results: RetrievalResult[];
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Whether confidence is below threshold */
  isLowConfidence: boolean;
  /** Warning message for low confidence */
  warning?: string;
  /** Whether fallback mode was used for this retrieval */
  usedFallback: boolean;
  /** Fallback state information */
  fallbackState?: EmbeddingFallbackState;
  /** Search method used */
  searchMethod: 'hybrid' | 'vector_only' | 'bm25_only';
}

/**
 * Notification about embedding fallback for the UI
 * 
 * Implements Requirement 18.2: Notify user of fallback
 */
export interface EmbeddingFallbackNotification {
  /** Type of notification */
  type: 'warning' | 'info' | 'error';
  /** Title for the notification */
  title: string;
  /** Detailed message */
  message: string;
  /** Whether the notification can be dismissed */
  dismissible: boolean;
  /** Action the user can take (if any) */
  action?: {
    label: string;
    actionType: 'retry' | 'configure' | 'dismiss';
  };
  /** Timestamp when notification was created */
  timestamp: number;
}

/**
 * Default fallback state (no fallback active)
 */
export const DEFAULT_EMBEDDING_FALLBACK_STATE: EmbeddingFallbackState = {
  isActive: false,
  failureCount: 0,
  canRecover: true,
};

/**
 * IPC channel for fallback notifications
 */
export const EMBEDDING_FALLBACK_CHANNEL = 'pdf:embedding-fallback-status' as const;


// =============================================================================
// Index Corruption Types (Requirement 18.4)
// =============================================================================

/**
 * Type of index corruption detected
 * 
 * Implements Requirement 18.4: IF the Vector_Store becomes corrupted, THEN THE System SHALL offer to rebuild the index
 */
export type IndexCorruptionType =
  | 'missing_table'           // Required table (documents/chunks) is missing
  | 'schema_mismatch'         // Table schema doesn't match expected schema
  | 'orphaned_chunks'         // Chunks exist without corresponding document record
  | 'missing_chunks'          // Document record exists but chunks are missing
  | 'invalid_embeddings'      // Embeddings have wrong dimensions or are corrupted
  | 'data_inconsistency'      // Data integrity check failed (counts don't match, etc.)
  | 'file_corruption'         // Underlying database files are corrupted
  | 'unknown';                // Unknown corruption type

/**
 * Details about a specific corruption issue
 */
export interface CorruptionIssue {
  /** Type of corruption */
  type: IndexCorruptionType;
  /** Human-readable description of the issue */
  description: string;
  /** Severity level */
  severity: 'warning' | 'error' | 'critical';
  /** Affected document IDs (if applicable) */
  affectedDocuments?: string[];
  /** Number of affected items */
  affectedCount?: number;
  /** Whether this issue can be auto-repaired */
  canAutoRepair: boolean;
  /** Suggested action to fix the issue */
  suggestedAction: string;
}

/**
 * Result of an index corruption check
 * 
 * Implements Requirement 18.4: Detect corrupted indexes
 */
export interface IndexCorruptionCheckResult {
  /** Whether any corruption was detected */
  isCorrupted: boolean;
  /** Whether the index is healthy (no issues at all) */
  isHealthy: boolean;
  /** List of corruption issues found */
  issues: CorruptionIssue[];
  /** Timestamp when the check was performed */
  checkedAt: number;
  /** Total documents checked */
  documentsChecked: number;
  /** Total chunks checked */
  chunksChecked: number;
  /** Whether a rebuild is recommended */
  rebuildRecommended: boolean;
  /** Summary message for the user */
  summary: string;
}

/**
 * Options for rebuilding an index
 */
export interface IndexRebuildOptions {
  /** Document IDs to rebuild (if empty, rebuilds all) */
  documentIds?: string[];
  /** Whether to force rebuild even if no corruption detected */
  force?: boolean;
  /** Whether to preserve existing settings */
  preserveSettings?: boolean;
  /** Whether to clean up orphaned data */
  cleanupOrphans?: boolean;
}

/**
 * Progress information during index rebuild
 */
export interface IndexRebuildProgress {
  /** Current phase of the rebuild */
  phase: 'preparing' | 'cleaning' | 'reindexing' | 'verifying' | 'complete';
  /** Overall progress percentage (0-100) */
  overallProgress: number;
  /** Current document being processed */
  currentDocument?: string;
  /** Number of documents processed */
  documentsProcessed: number;
  /** Total documents to process */
  totalDocuments: number;
  /** Number of chunks created */
  chunksCreated: number;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
  /** Any errors encountered during rebuild */
  errors: Array<{ documentId: string; error: string }>;
}

/**
 * Result of an index rebuild operation
 * 
 * Implements Requirement 18.4: Offer rebuild option
 */
export interface IndexRebuildResult {
  /** Whether the rebuild was successful */
  success: boolean;
  /** Documents that were successfully rebuilt */
  rebuiltDocuments: string[];
  /** Documents that failed to rebuild */
  failedDocuments: Array<{ documentId: string; error: string }>;
  /** Total chunks created */
  totalChunksCreated: number;
  /** Time taken for the rebuild in milliseconds */
  rebuildTimeMs: number;
  /** Whether the index is now healthy */
  isHealthy: boolean;
  /** Summary message */
  summary: string;
  /** Any remaining issues after rebuild */
  remainingIssues?: CorruptionIssue[];
}

/**
 * IPC channels for index corruption handling
 */
export const INDEX_CORRUPTION_IPC_CHANNELS = {
  CHECK_CORRUPTION: 'pdf:check-index-corruption',
  REBUILD_INDEX: 'pdf:rebuild-corrupted-index',
  REBUILD_PROGRESS: 'pdf:rebuild-progress',
} as const;
