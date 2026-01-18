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
    new arrow.Field('title', new arrow.Utf8(), false),  // Changed to non-nullable, will use empty string
    new arrow.Field('author', new arrow.Utf8(), false), // Changed to non-nullable, will use empty string
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
    new arrow.Field('sectionHeader', new arrow.Utf8(), false), // Changed to non-nullable, will use empty string
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
  protected db: lancedb.Connection | null = null;
  protected documentsTable: lancedb.Table | null = null;
  protected chunksTable: lancedb.Table | null = null;
  protected embeddingDimensions: number;
  protected isInitialized: boolean = false;
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
        try {
          this.documentsTable = await this.db.openTable(DOCUMENTS_TABLE);
        } catch (err) {
          // If opening fails (schema mismatch), drop and recreate
          console.warn('[VectorStore] Failed to open documents table, recreating:', err);
          await this.db.dropTable(DOCUMENTS_TABLE);
          this.documentsTable = null;
        }
      }

      // Initialize chunks table
      if (tableNames.includes(CHUNKS_TABLE)) {
        try {
          this.chunksTable = await this.db.openTable(CHUNKS_TABLE);
        } catch (err) {
          // If opening fails (schema mismatch), drop and recreate
          console.warn('[VectorStore] Failed to open chunks table, recreating:', err);
          await this.db.dropTable(CHUNKS_TABLE);
          this.chunksTable = null;
        }
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
  protected async ensureInitialized(): Promise<void> {
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
      title: doc.title || '',
      author: doc.author || '',
      indexedAt: doc.indexedAt,
      chunkCount: doc.chunkCount,
      embeddingModel: doc.embeddingModel,
    };

    if (!this.documentsTable) {
      // Create table with first document - use explicit schema to avoid type inference issues
      const schema = createDocumentsSchema();
      this.documentsTable = await this.db.createTable(DOCUMENTS_TABLE, [record], { schema });
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
      sectionHeader: chunk.sectionHeader || '',
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
      const docFilter = documentIds.map(id => `"documentId" = '${id}'`).join(' OR ');
      query = query.where(`(${docFilter})`);
    }

    // Debug: Check what's in the table first
    const allRows = await this.chunksTable.query().limit(5).toArray();
    console.log('[VectorStore] Debug - Sample rows in table:', allRows.length, 'first docId:', allRows[0]?.documentId);

    // Execute search
    console.log('[VectorStore] Vector search - limit:', limit, 'minScore:', minScore, 'documentIds:', documentIds);
    const results = await query.toArray();
    console.log('[VectorStore] Vector search raw results:', results.length);

    // Process results
    const processed: Array<{ id: string; score: number }> = [];

    for (const row of results) {
      // LanceDB returns _distance for vector search
      // Convert distance to similarity score (1 / (1 + distance))
      const distance = row._distance ?? 0;
      const score = 1 / (1 + distance);

      // Apply minimum score filter
      if (minScore !== undefined && score < minScore) {
        console.log('[VectorStore] Filtered out chunk due to minScore:', score, '<', minScore);
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

      console.log('[VectorStore] BM25 search - queryText:', queryText.substring(0, 100), 'limit:', limit, 'documentIds:', documentIds);

      // Build query with full-text search
      let query = this.chunksTable.query().nearestToText(queryText).limit(limit);

      // Apply document filter
      if (documentIds && documentIds.length > 0) {
        const docFilter = documentIds.map(id => `"documentId" = '${id}'`).join(' OR ');
        query = query.where(`(${docFilter})`);
      }

      // Execute search
      const results = await query.toArray();
      console.log('[VectorStore] BM25 search raw results:', results.length);

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
        await this.chunksTable.delete(`"documentId" = '${docId}'`);
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
   * Get the storage path for the vector store
   */
  getStoragePath(): string {
    return getVectorStoreDir();
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
        .where(`"documentId" = '${docId}'`)
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

  /**
   * Get all documents indexed with a specific embedding model
   * 
   * Implements Requirement 21.6: Handle embedding model changes
   * 
   * @param embeddingModel - The embedding model ID to filter by
   * @returns Array of document records indexed with the specified model
   */
  async getDocumentsByEmbeddingModel(embeddingModel: string): Promise<DocumentRecord[]> {
    await this.ensureInitialized();

    if (!this.documentsTable) {
      return [];
    }

    try {
      const results = await this.documentsTable
        .query()
        .where(`embeddingModel = '${embeddingModel}'`)
        .toArray();

      return results.map(row => ({
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
      }));
    } catch (error) {
      console.error('[VectorStore] Error getting documents by embedding model:', error);
      return [];
    }
  }

  /**
   * Get all documents that would need re-indexing if switching to a new model
   * 
   * Implements Requirement 21.6: Handle embedding model changes
   * 
   * @param newModelId - The new embedding model ID
   * @returns Array of document records that need re-indexing
   */
  async getDocumentsNeedingReindex(newModelId: string): Promise<DocumentRecord[]> {
    await this.ensureInitialized();

    if (!this.documentsTable) {
      return [];
    }

    try {
      // Get all documents not indexed with the new model
      const results = await this.documentsTable
        .query()
        .where(`embeddingModel != '${newModelId}'`)
        .toArray();

      return results.map(row => ({
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
      }));
    } catch (error) {
      console.error('[VectorStore] Error getting documents needing reindex:', error);
      return [];
    }
  }

  /**
   * Get all unique embedding models used across all indexed documents
   * 
   * Implements Requirement 21.6: Handle embedding model changes
   * 
   * @returns Array of unique embedding model IDs
   */
  async getUsedEmbeddingModels(): Promise<string[]> {
    await this.ensureInitialized();

    if (!this.documentsTable) {
      return [];
    }

    try {
      const results = await this.documentsTable
        .query()
        .toArray();

      const models = new Set<string>();
      for (const row of results) {
        if (row.embeddingModel) {
          models.add(row.embeddingModel);
        }
      }

      return Array.from(models);
    } catch (error) {
      console.error('[VectorStore] Error getting used embedding models:', error);
      return [];
    }
  }

  /**
   * Get all indexed documents with their embedding model info
   * 
   * Implements Requirement 21.6: Handle embedding model changes
   * 
   * @returns Array of all document records
   */
  async getAllDocuments(): Promise<DocumentRecord[]> {
    await this.ensureInitialized();

    if (!this.documentsTable) {
      return [];
    }

    try {
      const results = await this.documentsTable
        .query()
        .toArray();

      return results.map(row => ({
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
      }));
    } catch (error) {
      console.error('[VectorStore] Error getting all documents:', error);
      return [];
    }
  }
}

// =============================================================================
// Index Corruption Detection and Recovery (Requirement 18.4)
// =============================================================================

/**
 * Corruption issue type
 */
export type IndexCorruptionType =
  | 'missing_table'
  | 'schema_mismatch'
  | 'orphaned_chunks'
  | 'missing_chunks'
  | 'invalid_embeddings'
  | 'data_inconsistency'
  | 'file_corruption'
  | 'unknown';

/**
 * Details about a corruption issue
 */
export interface CorruptionIssue {
  type: IndexCorruptionType;
  description: string;
  severity: 'warning' | 'error' | 'critical';
  affectedDocuments?: string[];
  affectedCount?: number;
  canAutoRepair: boolean;
  suggestedAction: string;
}

/**
 * Result of corruption check
 */
export interface IndexCorruptionCheckResult {
  isCorrupted: boolean;
  isHealthy: boolean;
  issues: CorruptionIssue[];
  checkedAt: number;
  documentsChecked: number;
  chunksChecked: number;
  rebuildRecommended: boolean;
  summary: string;
}

/**
 * Extended VectorStore class with corruption detection and recovery
 * 
 * Implements Requirement 18.4: IF the Vector_Store becomes corrupted, 
 * THEN THE System SHALL offer to rebuild the index
 */
export class VectorStoreWithRecovery extends VectorStore {

  /**
   * Check the index for corruption
   * 
   * Detects various types of corruption:
   * - Missing tables
   * - Schema mismatches
   * - Orphaned chunks (chunks without documents)
   * - Missing chunks (documents without chunks)
   * - Invalid embeddings (wrong dimensions)
   * - Data inconsistencies
   * 
   * Implements Requirement 18.4: Detect corrupted indexes
   */
  async checkIndexCorruption(): Promise<IndexCorruptionCheckResult> {
    const issues: CorruptionIssue[] = [];
    let documentsChecked = 0;
    let chunksChecked = 0;

    console.log('[VectorStore] Starting index corruption check...');

    try {
      await this.ensureInitialized();

      // Check 1: Verify tables exist
      const tablesExist = await this.checkTablesExist();
      if (!tablesExist.documentsTable) {
        issues.push({
          type: 'missing_table',
          description: 'Documents table is missing from the vector store',
          severity: 'critical',
          canAutoRepair: false,
          suggestedAction: 'Rebuild the entire index from source PDFs',
        });
      }

      if (!tablesExist.chunksTable) {
        issues.push({
          type: 'missing_table',
          description: 'Chunks table is missing from the vector store',
          severity: 'critical',
          canAutoRepair: false,
          suggestedAction: 'Rebuild the entire index from source PDFs',
        });
      }

      // If tables are missing, we can't do further checks
      if (!tablesExist.documentsTable || !tablesExist.chunksTable) {
        return this.buildCorruptionResult(issues, documentsChecked, chunksChecked);
      }

      // Check 2: Get all documents and chunks
      const allDocuments = await this.getAllDocuments();
      const stats = await this.getCollectionStats();
      documentsChecked = allDocuments.length;
      chunksChecked = stats.chunkCount;

      // Check 3: Verify document-chunk consistency
      const consistencyIssues = await this.checkDocumentChunkConsistency(allDocuments);
      issues.push(...consistencyIssues);

      // Check 4: Check for orphaned chunks
      const orphanedChunks = await this.checkOrphanedChunks(allDocuments);
      if (orphanedChunks.length > 0) {
        issues.push({
          type: 'orphaned_chunks',
          description: `Found ${orphanedChunks.length} chunks without corresponding document records`,
          severity: 'warning',
          affectedCount: orphanedChunks.length,
          canAutoRepair: true,
          suggestedAction: 'Clean up orphaned chunks or rebuild affected documents',
        });
      }

      // Check 5: Validate embedding dimensions
      const embeddingIssues = await this.checkEmbeddingDimensions(allDocuments);
      issues.push(...embeddingIssues);

      // Check 6: Check for data inconsistencies
      const dataIssues = await this.checkDataIntegrity(allDocuments);
      issues.push(...dataIssues);

      console.log('[VectorStore] Corruption check complete. Issues found:', issues.length);

      return this.buildCorruptionResult(issues, documentsChecked, chunksChecked);

    } catch (error) {
      console.error('[VectorStore] Error during corruption check:', error);

      // If we can't even check, assume file corruption
      issues.push({
        type: 'file_corruption',
        description: `Failed to read index data: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'critical',
        canAutoRepair: false,
        suggestedAction: 'Clear the index and rebuild from source PDFs',
      });

      return this.buildCorruptionResult(issues, documentsChecked, chunksChecked);
    }
  }

  /**
   * Check if required tables exist
   */
  private async checkTablesExist(): Promise<{ documentsTable: boolean; chunksTable: boolean }> {
    try {
      if (!this.db) {
        return { documentsTable: false, chunksTable: false };
      }

      const tableNames = await this.db.tableNames();
      return {
        documentsTable: tableNames.includes(DOCUMENTS_TABLE),
        chunksTable: tableNames.includes(CHUNKS_TABLE),
      };
    } catch (error) {
      console.error('[VectorStore] Error checking tables:', error);
      return { documentsTable: false, chunksTable: false };
    }
  }

  /**
   * Check document-chunk consistency
   */
  private async checkDocumentChunkConsistency(documents: DocumentRecord[]): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];
    const documentsWithMissingChunks: string[] = [];
    const documentsWithWrongCount: string[] = [];

    for (const doc of documents) {
      try {
        const chunks = await this.getChunksForDocument(doc.id);

        // Check if document has no chunks but claims to have some
        if (doc.chunkCount > 0 && chunks.length === 0) {
          documentsWithMissingChunks.push(doc.id);
        }

        // Check if chunk count matches
        if (chunks.length !== doc.chunkCount) {
          documentsWithWrongCount.push(doc.id);
        }
      } catch (error) {
        console.error(`[VectorStore] Error checking chunks for document ${doc.id}:`, error);
        documentsWithMissingChunks.push(doc.id);
      }
    }

    if (documentsWithMissingChunks.length > 0) {
      issues.push({
        type: 'missing_chunks',
        description: `${documentsWithMissingChunks.length} document(s) have missing chunks`,
        severity: 'error',
        affectedDocuments: documentsWithMissingChunks,
        affectedCount: documentsWithMissingChunks.length,
        canAutoRepair: false,
        suggestedAction: 'Rebuild the index for affected documents',
      });
    }

    if (documentsWithWrongCount.length > 0) {
      issues.push({
        type: 'data_inconsistency',
        description: `${documentsWithWrongCount.length} document(s) have incorrect chunk counts`,
        severity: 'warning',
        affectedDocuments: documentsWithWrongCount,
        affectedCount: documentsWithWrongCount.length,
        canAutoRepair: true,
        suggestedAction: 'Update document metadata or rebuild affected documents',
      });
    }

    return issues;
  }

  /**
   * Check for orphaned chunks (chunks without documents)
   */
  private async checkOrphanedChunks(documents: DocumentRecord[]): Promise<string[]> {
    const orphanedChunkIds: string[] = [];

    try {
      if (!this.chunksTable) {
        return [];
      }

      const documentIds = new Set(documents.map(d => d.id));

      // Get all unique document IDs from chunks
      const allChunks = await this.chunksTable.query().toArray();

      for (const chunk of allChunks) {
        if (!documentIds.has(chunk.documentId)) {
          orphanedChunkIds.push(chunk.id);
        }
      }
    } catch (error) {
      console.error('[VectorStore] Error checking orphaned chunks:', error);
    }

    return orphanedChunkIds;
  }

  /**
   * Check embedding dimensions consistency
   */
  private async checkEmbeddingDimensions(documents: DocumentRecord[]): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];
    const documentsWithWrongDimensions: string[] = [];

    const expectedDimensions = this.getEmbeddingDimensions();

    for (const doc of documents) {
      try {
        const chunks = await this.getChunksForDocument(doc.id);

        for (const chunk of chunks) {
          if (chunk.vector && chunk.vector.length !== expectedDimensions) {
            documentsWithWrongDimensions.push(doc.id);
            break; // Only report once per document
          }
        }
      } catch (error) {
        console.error(`[VectorStore] Error checking embeddings for document ${doc.id}:`, error);
      }
    }

    if (documentsWithWrongDimensions.length > 0) {
      issues.push({
        type: 'invalid_embeddings',
        description: `${documentsWithWrongDimensions.length} document(s) have embeddings with incorrect dimensions (expected ${expectedDimensions})`,
        severity: 'error',
        affectedDocuments: documentsWithWrongDimensions,
        affectedCount: documentsWithWrongDimensions.length,
        canAutoRepair: false,
        suggestedAction: 'Rebuild the index for affected documents with the current embedding model',
      });
    }

    return issues;
  }

  /**
   * Check data integrity
   */
  private async checkDataIntegrity(documents: DocumentRecord[]): Promise<CorruptionIssue[]> {
    const issues: CorruptionIssue[] = [];
    const documentsWithInvalidData: string[] = [];

    for (const doc of documents) {
      // Check for required fields
      if (!doc.id || !doc.filePath || !doc.fileName || !doc.fileHash) {
        documentsWithInvalidData.push(doc.id || 'unknown');
      }

      // Check for valid timestamps
      if (doc.indexedAt <= 0 || doc.indexedAt > Date.now() + 86400000) { // Allow 1 day future
        documentsWithInvalidData.push(doc.id);
      }

      // Check for valid page count
      if (doc.pageCount <= 0) {
        documentsWithInvalidData.push(doc.id);
      }
    }

    // Remove duplicates
    const uniqueInvalid = [...new Set(documentsWithInvalidData)];

    if (uniqueInvalid.length > 0) {
      issues.push({
        type: 'data_inconsistency',
        description: `${uniqueInvalid.length} document(s) have invalid or missing metadata`,
        severity: 'warning',
        affectedDocuments: uniqueInvalid,
        affectedCount: uniqueInvalid.length,
        canAutoRepair: false,
        suggestedAction: 'Rebuild the index for affected documents',
      });
    }

    return issues;
  }

  /**
   * Build the corruption check result
   */
  private buildCorruptionResult(
    issues: CorruptionIssue[],
    documentsChecked: number,
    chunksChecked: number
  ): IndexCorruptionCheckResult {
    const hasCritical = issues.some(i => i.severity === 'critical');
    const hasError = issues.some(i => i.severity === 'error');
    const isCorrupted = hasCritical || hasError;
    const isHealthy = issues.length === 0;
    const rebuildRecommended = hasCritical || issues.filter(i => i.severity === 'error').length >= 2;

    let summary: string;
    if (isHealthy) {
      summary = 'Index is healthy. No corruption detected.';
    } else if (hasCritical) {
      summary = `Critical corruption detected. ${issues.length} issue(s) found. Immediate rebuild recommended.`;
    } else if (hasError) {
      summary = `Index corruption detected. ${issues.length} issue(s) found. Rebuild recommended for affected documents.`;
    } else {
      summary = `Minor issues detected. ${issues.length} warning(s) found. Index is functional but may benefit from cleanup.`;
    }

    return {
      isCorrupted,
      isHealthy,
      issues,
      checkedAt: Date.now(),
      documentsChecked,
      chunksChecked,
      rebuildRecommended,
      summary,
    };
  }

  /**
   * Clean up orphaned chunks
   * 
   * Removes chunks that don't have corresponding document records.
   * This is a safe operation that doesn't affect valid data.
   */
  async cleanupOrphanedChunks(): Promise<{ removed: number; errors: string[] }> {
    const errors: string[] = [];
    let removed = 0;

    try {
      await this.ensureInitialized();

      if (!this.chunksTable || !this.documentsTable) {
        return { removed: 0, errors: ['Tables not initialized'] };
      }

      // Get all document IDs
      const documents = await this.getAllDocuments();
      const documentIds = new Set(documents.map(d => d.id));

      // Get all chunks
      const allChunks = await this.chunksTable.query().toArray();

      // Find and delete orphaned chunks
      for (const chunk of allChunks) {
        if (!documentIds.has(chunk.documentId)) {
          try {
            await this.chunksTable.delete(`id = '${chunk.id}'`);
            removed++;
          } catch (error) {
            errors.push(`Failed to delete chunk ${chunk.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      console.log(`[VectorStore] Cleaned up ${removed} orphaned chunks`);

    } catch (error) {
      console.error('[VectorStore] Error cleaning up orphaned chunks:', error);
      errors.push(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { removed, errors };
  }

  /**
   * Repair document chunk count metadata
   * 
   * Updates document records to have accurate chunk counts.
   */
  async repairChunkCounts(): Promise<{ repaired: number; errors: string[] }> {
    const errors: string[] = [];
    let repaired = 0;

    try {
      await this.ensureInitialized();

      if (!this.documentsTable || !this.chunksTable) {
        return { repaired: 0, errors: ['Tables not initialized'] };
      }

      const documents = await this.getAllDocuments();

      for (const doc of documents) {
        try {
          const chunks = await this.getChunksForDocument(doc.id);
          const actualCount = chunks.length;

          if (actualCount !== doc.chunkCount) {
            await this.documentsTable.update({
              where: `id = '${doc.id}'`,
              values: { chunkCount: actualCount },
            });
            repaired++;
            console.log(`[VectorStore] Repaired chunk count for ${doc.id}: ${doc.chunkCount} -> ${actualCount}`);
          }
        } catch (error) {
          errors.push(`Failed to repair ${doc.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      console.log(`[VectorStore] Repaired chunk counts for ${repaired} documents`);

    } catch (error) {
      console.error('[VectorStore] Error repairing chunk counts:', error);
      errors.push(`Repair failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { repaired, errors };
  }

  /**
   * Get documents that need rebuilding based on corruption check
   */
  async getDocumentsNeedingRebuild(): Promise<DocumentRecord[]> {
    const corruptionResult = await this.checkIndexCorruption();

    if (corruptionResult.isHealthy) {
      return [];
    }

    // Collect all affected document IDs
    const affectedIds = new Set<string>();

    for (const issue of corruptionResult.issues) {
      if (issue.affectedDocuments) {
        issue.affectedDocuments.forEach(id => affectedIds.add(id));
      }
    }

    // If critical issues, return all documents
    if (corruptionResult.issues.some(i => i.severity === 'critical')) {
      return this.getAllDocuments();
    }

    // Return only affected documents
    const allDocs = await this.getAllDocuments();
    return allDocs.filter(doc => affectedIds.has(doc.id));
  }

  /**
   * Ensure initialized - expose for recovery operations
   */
  async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Singleton instance of the vector store with recovery capabilities using global registry
 */
export const vectorStore = (() => {
  const globalKey = Symbol.for('zura.vectorStore');
  const globalRegistry = global as any;

  if (!globalRegistry[globalKey]) {
    globalRegistry[globalKey] = new VectorStoreWithRecovery();
  }

  return globalRegistry[globalKey] as VectorStoreWithRecovery;
})();


