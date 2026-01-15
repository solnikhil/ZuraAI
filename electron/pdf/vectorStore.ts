/**
 * Vector Store Service (LanceDB)
 * 
 * This service handles vector storage and retrieval for the RAG pipeline.
 * It uses LanceDB as the embedded vector database for:
 * - Document metadata storage
 * - Chunk storage with embeddings
 * - Vector similarity search
 * - BM25 full-text search
 * - Hybrid search with reciprocal rank fusion
 * 
 * Requirements: 6.5, 6.6, 6.7, 7.1, 7.2, 20.2, 20.4
 */

import * as lancedb from '@lancedb/lancedb';
import * as arrow from 'apache-arrow';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

import type {
  IVectorStore,
  DocumentRecord,
  ChunkRecord,
  VectorSearchParams,
  BM25SearchParams,
  RRFParams,
} from './types';

// =============================================================================
// Constants
// =============================================================================

/** Default RRF parameters */
const DEFAULT_RRF_PARAMS: RRFParams = {
  k: 60,
  vectorWeight: 0.7,
  bm25Weight: 0.3,
};

/** Table names */
const DOCUMENTS_TABLE = 'documents';
const CHUNKS_TABLE = 'chunks';

/** Default embedding dimensions (can be overridden) */
const DEFAULT_EMBEDDING_DIMENSIONS = 768;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the vector store directory path
 */
function getVectorStoreDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'pdf-chat', 'vector-store');
}

/**
 * Ensure the vector store directory exists
 */
function ensureVectorStoreDir(): void {
  const dir = getVectorStoreDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create the documents table schema
 */
function createDocumentsSchema(): arrow.Schema {
  return new arrow.Schema([
    new arrow.Field('id', new arrow.Utf8(), false),
    new arrow.Field('filePath', new arrow.Utf8(), false),
    new arrow.Field('fileName', new arrow.Utf8(), false),
    new arrow.Field('fileHash', new arrow.Utf8(), false),
    new arrow.Field('pageCount', new arrow.Int32(), false),
    new arrow.Field('title', new arrow.Utf8(), true),
    new arrow.Field('author', new arrow.Utf8(), true),
    new arrow.Field('indexedAt', new arrow.Int64(), false),
    new arrow.Field('chunkCount', new arrow.Int32(), false),
    new arrow.Field('embeddingModel', new arrow.Utf8(), false),
  ]);
}

/**
 * Create the chunks table schema with vector field
 * @param dimensions - Embedding vector dimensions
 */
function createChunksSchema(dimensions: number): arrow.Schema {
  return new arrow.Schema([
    new arrow.Field('id', new arrow.Utf8(), false),
    new arrow.Field('documentId', new arrow.Utf8(), false),
    new arrow.Field('content', new arrow.Utf8(), false),
    new arrow.Field('pageNumbers', new arrow.List(new arrow.Field('item', new arrow.Int32(), true)), false),
    new arrow.Field('boundingBoxes', new arrow.Utf8(), false), // JSON serialized
    new arrow.Field('sectionHeader', new arrow.Utf8(), true),
    new arrow.Field('chunkIndex', new arrow.Int32(), false),
    new arrow.Field('tokenCount', new arrow.Int32(), false),
    new arrow.Field('blockType', new arrow.Utf8(), false),
    new arrow.Field(
      'vector',
      new arrow.FixedSizeList(dimensions, new arrow.Field('item', new arrow.Float32(), true)),
      false
    ),
  ]);
}

/**
 * Reciprocal Rank Fusion scoring
 * Combines rankings from multiple sources
 */
function computeRRFScore(ranks: number[], weights: number[], k: number): number {
  let score = 0;
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] >= 0) {
      score += weights[i] / (k + ranks[i] + 1);
    }
  }
  return score;
}


// =============================================================================
// Vector Store Implementation
// =============================================================================

/**
 * Vector Store Service
 * 
 * Manages vector storage and retrieval using LanceDB.
 * Provides document indexing, vector search, BM25 search, and hybrid search.
 */
export class VectorStore implements IVectorStore {
  private db: lancedb.Connection | null = null;
  private documentsTable: lancedb.Table | null = null;
  private chunksTable: lancedb.Table | null = null;
  private embeddingDimensions: number;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(embeddingDimensions: number = DEFAULT_EMBEDDING_DIMENSIONS) {
    this.embeddingDimensions = embeddingDimensions;
  }

  /**
   * Initialize the vector store
   * Creates the database and tables if they don't exist
   * 
   * Implements Requirements 6.6, 20.2
   */
  async initialize(): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.isInitialized) {
      return;
    }

    this.initPromise = this._doInitialize();
    
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async _doInitialize(): Promise<void> {
    try {
      ensureVectorStoreDir();
      const dbPath = getVectorStoreDir();
      
      // Connect to LanceDB
      this.db = await lancedb.connect(dbPath);
      
      // Get existing tables
      const tableNames = await this.db.tableNames();
      
      // Initialize documents table
      if (tableNames.includes(DOCUMENTS_TABLE)) {
        this.documentsTable = await this.db.openTable(DOCUMENTS_TABLE);
      }
      
      // Initialize chunks table
      if (tableNames.includes(CHUNKS_TABLE)) {
        this.chunksTable = await this.db.openTable(CHUNKS_TABLE);
      }
      
      this.isInitialized = true;
      console.log('[VectorStore] Initialized successfully at:', dbPath);
    } catch (error) {
      console.error('[VectorStore] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Ensure the store is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Add a document record to the store
   * 
   * Implements Requirement 6.6
   * 
   * @param doc - Document record to add
   */
  async addDocument(doc: DocumentRecord): Promise<void> {
    await this.ensureInitialized();
    
    if (!this.db) {
      throw new Error('Vector store not initialized');
    }

    const record = {
      id: doc.id,
      filePath: doc.filePath,
      fileName: doc.fileName,
      fileHash: doc.fileHash,
      pageCount: doc.pageCount,
      title: doc.title || null,
      author: doc.author || null,
      indexedAt: doc.indexedAt,
      chunkCount: doc.chunkCount,
      embeddingModel: doc.embeddingModel,
    };

    if (!this.documentsTable) {
      // Create table with first document
      this.documentsTable = await this.db.createTable(DOCUMENTS_TABLE, [record]);
      console.log('[VectorStore] Created documents table');
    } else {
      // Check if document already exists
      const existing = await this.getDocument(doc.id);
      if (existing) {
        // Update existing document
        await this.documentsTable.update({
          where: `id = '${doc.id}'`,
          values: record,
        });
      } else {
        // Add new document
        await this.documentsTable.add([record]);
      }
    }
  }

  /**
   * Add chunks with embeddings to the store
   * 
   * Implements Requirements 6.5, 6.6
   * 
   * @param chunks - Array of chunk records to add
   */
  async addChunks(chunks: ChunkRecord[]): Promise<void> {
    await this.ensureInitialized();
    
    if (!this.db) {
      throw new Error('Vector store not initialized');
    }

    if (chunks.length === 0) {
      return;
    }

    // Validate embedding dimensions
    for (const chunk of chunks) {
      if (chunk.vector.length !== this.embeddingDimensions) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.embeddingDimensions}, got ${chunk.vector.length}`
        );
      }
    }

    // Prepare records
    const records = chunks.map(chunk => ({
      id: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content,
      pageNumbers: chunk.pageNumbers,
      boundingBoxes: chunk.boundingBoxes, // Already JSON serialized
      sectionHeader: chunk.sectionHeader || null,
      chunkIndex: chunk.chunkIndex,
      tokenCount: chunk.tokenCount,
      blockType: chunk.blockType,
      vector: chunk.vector,
    }));

    if (!this.chunksTable) {
      // Create table with first batch
      const schema = createChunksSchema(this.embeddingDimensions);
      this.chunksTable = await this.db.createTable(CHUNKS_TABLE, records, { schema });
      console.log('[VectorStore] Created chunks table with', records.length, 'chunks');
    } else {
      // Add to existing table
      await this.chunksTable.add(records);
      console.log('[VectorStore] Added', records.length, 'chunks');
    }
  }

  /**
   * Perform vector similarity search
   * 
   * Implements Requirement 7.1
   * 
   * @param params - Vector search parameters
   * @returns Array of chunk IDs with scores
   */
  async vectorSearch(params: VectorSearchParams): Promise<Array<{ id: string; score: number }>> {
    await this.ensureInitialized();
    
    if (!this.chunksTable) {
      return [];
    }

    const { queryVector, limit, minScore, documentIds, pageRange } = params;

    // Build query
    let query = this.chunksTable.query().nearestTo(queryVector).limit(limit);

    // Apply document filter
    if (documentIds && documentIds.length > 0) {
      const docFilter = documentIds.map(id => `documentId = '${id}'`).join(' OR ');
      query = query.where(`(${docFilter})`);
    }

    // Execute search
    const results = await query.toArray();

    // Process results
    const processed: Array<{ id: string; score: number }> = [];
    
    for (const row of results) {
      // LanceDB returns _distance for vector search
      // Convert distance to similarity score (1 / (1 + distance))
      const distance = row._distance ?? 0;
      const score = 1 / (1 + distance);
      
      // Apply minimum score filter
      if (minScore !== undefined && score < minScore) {
        continue;
      }

      // Apply page range filter (post-filter since LanceDB doesn't support array contains)
      if (pageRange) {
        const pageNumbers: number[] = row.pageNumbers || [];
        const hasPageInRange = pageNumbers.some(
          p => p >= pageRange.start && p <= pageRange.end
        );
        if (!hasPageInRange) {
          continue;
        }
      }

      processed.push({
        id: row.id,
        score,
      });
    }

    return processed;
  }


  /**
   * Perform BM25 full-text search
   * 
   * Implements Requirement 7.1
   * 
   * @param params - BM25 search parameters
   * @returns Array of chunk IDs with scores
   */
  async bm25Search(params: BM25SearchParams): Promise<Array<{ id: string; score: number }>> {
    await this.ensureInitialized();
    
    if (!this.chunksTable) {
      return [];
    }

    const { queryText, limit, documentIds, pageRange } = params;

    try {
      // Check if FTS index exists, create if not
      await this.ensureFTSIndex();

      // Build query with full-text search
      let query = this.chunksTable.query().nearestToText(queryText).limit(limit);

      // Apply document filter
      if (documentIds && documentIds.length > 0) {
        const docFilter = documentIds.map(id => `documentId = '${id}'`).join(' OR ');
        query = query.where(`(${docFilter})`);
      }

      // Execute search
      const results = await query.toArray();

      // Process results
      const processed: Array<{ id: string; score: number }> = [];
      
      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        
        // BM25 score is typically returned as _score or we use rank-based scoring
        const score = row._score ?? (1 / (i + 1)); // Fallback to rank-based score
        
        // Apply page range filter
        if (pageRange) {
          const pageNumbers: number[] = row.pageNumbers || [];
          const hasPageInRange = pageNumbers.some(
            p => p >= pageRange.start && p <= pageRange.end
          );
          if (!hasPageInRange) {
            continue;
          }
        }

        processed.push({
          id: row.id,
          score,
        });
      }

      return processed;
    } catch (error) {
      console.error('[VectorStore] BM25 search failed:', error);
      // Return empty results on FTS failure (graceful degradation)
      return [];
    }
  }

  /**
   * Ensure FTS index exists on the content column
   */
  private async ensureFTSIndex(): Promise<void> {
    if (!this.chunksTable) {
      return;
    }

    try {
      // Try to create FTS index (will fail silently if already exists)
      await this.chunksTable.createIndex('content', {
        config: lancedb.Index.fts(),
      });
      console.log('[VectorStore] Created FTS index on content column');
    } catch (error: any) {
      // Index might already exist, which is fine
      if (!error.message?.includes('already exists')) {
        console.warn('[VectorStore] FTS index creation warning:', error.message);
      }
    }
  }

  /**
   * Perform hybrid search combining vector and BM25 with RRF
   * 
   * Implements Requirement 7.2
   * 
   * @param vectorParams - Vector search parameters
   * @param bm25Params - BM25 search parameters
   * @param rrfParams - RRF fusion parameters
   * @returns Array of chunk IDs with combined scores
   */
  async hybridSearch(
    vectorParams: VectorSearchParams,
    bm25Params: BM25SearchParams,
    rrfParams: RRFParams = DEFAULT_RRF_PARAMS
  ): Promise<Array<{ id: string; score: number }>> {
    // Execute both searches in parallel
    const [vectorResults, bm25Results] = await Promise.all([
      this.vectorSearch(vectorParams),
      this.bm25Search(bm25Params),
    ]);

    // Build rank maps
    const vectorRanks = new Map<string, number>();
    vectorResults.forEach((r, i) => vectorRanks.set(r.id, i));

    const bm25Ranks = new Map<string, number>();
    bm25Results.forEach((r, i) => bm25Ranks.set(r.id, i));

    // Collect all unique IDs
    const allIds = new Set<string>([
      ...vectorResults.map(r => r.id),
      ...bm25Results.map(r => r.id),
    ]);

    // Compute RRF scores
    const { k, vectorWeight, bm25Weight } = rrfParams;
    const totalWeight = vectorWeight + bm25Weight;
    const normalizedVectorWeight = vectorWeight / totalWeight;
    const normalizedBm25Weight = bm25Weight / totalWeight;

    const fusedResults: Array<{ id: string; score: number }> = [];

    for (const id of allIds) {
      const vectorRank = vectorRanks.has(id) ? vectorRanks.get(id)! : -1;
      const bm25Rank = bm25Ranks.has(id) ? bm25Ranks.get(id)! : -1;

      const score = computeRRFScore(
        [vectorRank, bm25Rank],
        [normalizedVectorWeight, normalizedBm25Weight],
        k
      );

      fusedResults.push({ id, score });
    }

    // Sort by score descending and limit
    fusedResults.sort((a, b) => b.score - a.score);
    
    const limit = Math.max(vectorParams.limit, bm25Params.limit);
    return fusedResults.slice(0, limit);
  }

  /**
   * Get a document by ID
   * 
   * @param docId - Document ID
   * @returns Document record or null if not found
   */
  async getDocument(docId: string): Promise<DocumentRecord | null> {
    await this.ensureInitialized();
    
    if (!this.documentsTable) {
      return null;
    }

    try {
      const results = await this.documentsTable
        .query()
        .where(`id = '${docId}'`)
        .limit(1)
        .toArray();

      if (results.length === 0) {
        return null;
      }

      const row = results[0];
      return {
        id: row.id,
        filePath: row.filePath,
        fileName: row.fileName,
        fileHash: row.fileHash,
        pageCount: row.pageCount,
        title: row.title,
        author: row.author,
        indexedAt: Number(row.indexedAt),
        chunkCount: row.chunkCount,
        embeddingModel: row.embeddingModel,
      };
    } catch (error) {
      console.error('[VectorStore] Error getting document:', error);
      return null;
    }
  }

  /**
   * Get a chunk by ID
   * 
   * @param chunkId - Chunk ID
   * @returns Chunk record or null if not found
   */
  async getChunk(chunkId: string): Promise<ChunkRecord | null> {
    await this.ensureInitialized();
    
    if (!this.chunksTable) {
      return null;
    }

    try {
      const results = await this.chunksTable
        .query()
        .where(`id = '${chunkId}'`)
        .limit(1)
        .toArray();

      if (results.length === 0) {
        return null;
      }

      return this.rowToChunkRecord(results[0]);
    } catch (error) {
      console.error('[VectorStore] Error getting chunk:', error);
      return null;
    }
  }

  /**
   * Get multiple chunks by IDs
   * 
   * @param chunkIds - Array of chunk IDs
   * @returns Array of chunk records
   */
  async getChunks(chunkIds: string[]): Promise<ChunkRecord[]> {
    await this.ensureInitialized();
    
    if (!this.chunksTable || chunkIds.length === 0) {
      return [];
    }

    try {
      const idFilter = chunkIds.map(id => `id = '${id}'`).join(' OR ');
      const results = await this.chunksTable
        .query()
        .where(`(${idFilter})`)
        .toArray();

      return results.map(row => this.rowToChunkRecord(row));
    } catch (error) {
      console.error('[VectorStore] Error getting chunks:', error);
      return [];
    }
  }

  /**
   * Convert a database row to ChunkRecord
   */
  private rowToChunkRecord(row: any): ChunkRecord {
    return {
      id: row.id,
      documentId: row.documentId,
      content: row.content,
      pageNumbers: Array.isArray(row.pageNumbers) ? row.pageNumbers : [],
      boundingBoxes: row.boundingBoxes,
      sectionHeader: row.sectionHeader,
      chunkIndex: row.chunkIndex,
      tokenCount: row.tokenCount,
      blockType: row.blockType,
      vector: Array.isArray(row.vector) ? row.vector : [],
    };
  }


  /**
   * Delete a document and all its chunks
   * 
   * Implements Requirement 20.4
   * 
   * @param docId - Document ID to delete
   */
  async deleteDocument(docId: string): Promise<void> {
    await this.ensureInitialized();

    // Delete chunks first
    if (this.chunksTable) {
      try {
        await this.chunksTable.delete(`documentId = '${docId}'`);
        console.log('[VectorStore] Deleted chunks for document:', docId);
      } catch (error) {
        console.error('[VectorStore] Error deleting chunks:', error);
      }
    }

    // Delete document record
    if (this.documentsTable) {
      try {
        await this.documentsTable.delete(`id = '${docId}'`);
        console.log('[VectorStore] Deleted document:', docId);
      } catch (error) {
        console.error('[VectorStore] Error deleting document:', error);
      }
    }
  }

  /**
   * Get collection statistics
   * 
   * @returns Statistics about the vector store
   */
  async getCollectionStats(): Promise<{ documentCount: number; chunkCount: number; sizeBytes: number }> {
    await this.ensureInitialized();

    let documentCount = 0;
    let chunkCount = 0;
    let sizeBytes = 0;

    try {
      if (this.documentsTable) {
        documentCount = await this.documentsTable.countRows();
      }

      if (this.chunksTable) {
        chunkCount = await this.chunksTable.countRows();
      }

      // Estimate size from directory
      const dbPath = getVectorStoreDir();
      sizeBytes = this.getDirectorySize(dbPath);
    } catch (error) {
      console.error('[VectorStore] Error getting stats:', error);
    }

    return { documentCount, chunkCount, sizeBytes };
  }

  /**
   * Get directory size recursively
   */
  private getDirectorySize(dirPath: string): number {
    let size = 0;
    
    try {
      if (!fs.existsSync(dirPath)) {
        return 0;
      }

      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          size += this.getDirectorySize(filePath);
        } else {
          size += stat.size;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return size;
  }

  /**
   * Get all chunks for a document
   * 
   * @param docId - Document ID
   * @returns Array of chunk records
   */
  async getChunksForDocument(docId: string): Promise<ChunkRecord[]> {
    await this.ensureInitialized();
    
    if (!this.chunksTable) {
      return [];
    }

    try {
      const results = await this.chunksTable
        .query()
        .where(`documentId = '${docId}'`)
        .toArray();

      return results.map(row => this.rowToChunkRecord(row));
    } catch (error) {
      console.error('[VectorStore] Error getting chunks for document:', error);
      return [];
    }
  }

  /**
   * Check if a document exists by file hash
   * Used for cache validation
   * 
   * Implements Requirement 6.7
   * 
   * @param fileHash - File hash to check
   * @returns Document record if found, null otherwise
   */
  async getDocumentByHash(fileHash: string): Promise<DocumentRecord | null> {
    await this.ensureInitialized();
    
    if (!this.documentsTable) {
      return null;
    }

    try {
      const results = await this.documentsTable
        .query()
        .where(`fileHash = '${fileHash}'`)
        .limit(1)
        .toArray();

      if (results.length === 0) {
        return null;
      }

      const row = results[0];
      return {
        id: row.id,
        filePath: row.filePath,
        fileName: row.fileName,
        fileHash: row.fileHash,
        pageCount: row.pageCount,
        title: row.title,
        author: row.author,
        indexedAt: Number(row.indexedAt),
        chunkCount: row.chunkCount,
        embeddingModel: row.embeddingModel,
      };
    } catch (error) {
      console.error('[VectorStore] Error getting document by hash:', error);
      return null;
    }
  }

  /**
   * Clear all data from the vector store
   * 
   * Implements Requirement 20.4
   */
  async clearAll(): Promise<void> {
    await this.ensureInitialized();

    if (!this.db) {
      return;
    }

    try {
      // Drop tables if they exist
      const tableNames = await this.db.tableNames();
      
      if (tableNames.includes(CHUNKS_TABLE)) {
        await this.db.dropTable(CHUNKS_TABLE);
        this.chunksTable = null;
        console.log('[VectorStore] Dropped chunks table');
      }

      if (tableNames.includes(DOCUMENTS_TABLE)) {
        await this.db.dropTable(DOCUMENTS_TABLE);
        this.documentsTable = null;
        console.log('[VectorStore] Dropped documents table');
      }
    } catch (error) {
      console.error('[VectorStore] Error clearing all data:', error);
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    this.db = null;
    this.documentsTable = null;
    this.chunksTable = null;
    this.isInitialized = false;
    console.log('[VectorStore] Closed connection');
  }

  /**
   * Check if the store is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the embedding dimensions
   */
  getEmbeddingDimensions(): number {
    return this.embeddingDimensions;
  }

  /**
   * Set the embedding dimensions
   * Note: This should only be called before adding any data
   */
  setEmbeddingDimensions(dimensions: number): void {
    if (this.chunksTable) {
      console.warn('[VectorStore] Cannot change dimensions after chunks have been added');
      return;
    }
    this.embeddingDimensions = dimensions;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Singleton instance of the vector store
 */
export const vectorStore = new VectorStore();

