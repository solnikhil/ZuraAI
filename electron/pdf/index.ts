/**
 * PDF Services - Main Process
 * 
 * This module exports all PDF-related services for the Electron main process.
 * These services handle PDF parsing, chunking, embedding, vector storage,
 * and RAG operations.
 * 
 * All PDF processing happens in the main process to ensure security
 * (renderer is untrusted) and to leverage Node.js capabilities.
 */

// PDF Parser Service
export { PDFParserService, pdfParserService } from './pdfParser';

// Chunk Manager Service
export { ChunkManager, chunkManager } from './chunkManager';

// Embedding Service
export { 
  EmbeddingService, 
  embeddingService, 
  EMBEDDING_MODELS,
  areModelsCompatible,
  getEmbeddingModelById,
} from './embeddingService';
export type { ModelChangeInfo } from './embeddingService';

// Vector Store Service (LanceDB)
export { VectorStore, vectorStore } from './vectorStore';

// Retrieval Service
export { RetrievalService, retrievalService } from './retrievalService';

// RAG Engine
export { RAGEngine, ragEngine } from './ragEngine';

// PDF Chat Instructions
export {
  generatePDFSystemPrompt,
  generateFallbackPrompt,
  expandQueryForRetrieval,
  buildPDFChatErrorMessage,
} from './pdfChatInstructions';
export type { PDFChatContext } from './pdfChatInstructions';

// PDF Chat Store
// export { PDFChatStore } from './pdfChatStore';

// Types re-export for convenience
export type {
  PDFDocument,
  PDFMetadata,
  PDFPage,
  BoundingBox,
  TextBlock,
  ImageBlock,
  TableBlock,
  TableRow,
  TableCell,
  Chunk,
  ChunkMetadata,
  QueryOptions,
  RetrievalResult,
  RAGResponse,
  Citation,
  PDFChatSession,
  PDFChatMessage,
  TextSelection,
  PDFRAGSettings,
  IndexOptions,
  IndexResult,
  IndexStatus,
  SearchOptions,
  SearchResult,
  HybridSearchOptions,
  CollectionInfo,
  EmbeddingModelInfo,
  OutlineItem,
  MajorSection,
  TextSearchResult,
  RecentDocument,
  PDFChatStore as PDFChatStoreType,
} from '../../src/types/pdf';

// Note: Services will be exported as they are implemented in subsequent tasks
