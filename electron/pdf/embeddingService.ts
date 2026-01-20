/**
 * Embedding Service
 * 
 * This service handles embedding generation for the RAG pipeline.
 * It supports multiple embedding providers:
 * - Local: Ollama with nomic-embed-text or other models
 * - API: OpenAI text-embedding-3-small/large
 * - API: Voyage AI (future)
 * 
 * Features:
 * - Model selection and switching
 * - Batch embedding generation
 * - Rate limiting for API calls
 * - Automatic fallback handling
 * - Model caching and offline support (Requirement 21.7)
 * 
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.7, 19.4
 */

import type { 
  EmbeddingModelInfo, 
  ModelCacheStatus, 
  AllModelsStatus, 
  ModelDownloadResult, 
  ModelCheckOptions,
  EmbeddingFallbackState,
  EmbeddingFallbackReason,
  EmbeddingFallbackNotification,
} from '../../src/types/pdf';
import type {
  IEmbeddingService,
  EmbeddingRequest,
  EmbeddingBatchResult,
  RateLimiterState,
} from './types';
import { getSecureValue } from '../secureStorage';

// =============================================================================
// Embedding Model Configurations
// =============================================================================

/**
 * Available embedding model configurations
 */
export const EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  {
    id: 'local-gemma',
    name: 'EmbeddingGemma (Local)',
    provider: 'local',
    dimensions: 512,
    maxTokens: 512,
  },
  {
    id: 'local-nomic',
    name: 'Nomic Embed Text (Local)',
    provider: 'local',
    dimensions: 768,
    maxTokens: 8192,
  },
  {
    id: 'local-mxbai',
    name: 'MxBai Embed Large (Local)',
    provider: 'local',
    dimensions: 1024,
    maxTokens: 512,
  },
  {
    id: 'local-all-minilm',
    name: 'All-MiniLM-L6-v2 (Local)',
    provider: 'local',
    dimensions: 384,
    maxTokens: 256,
  },
  {
    id: 'openai-small',
    name: 'OpenAI text-embedding-3-small',
    provider: 'openai',
    dimensions: 1536,
    maxTokens: 8191,
    endpoint: 'https://api.openai.com/v1/embeddings',
    apiKeySettingName: 'openRouterApiKey',
  },
  {
    id: 'openai-large',
    name: 'OpenAI text-embedding-3-large',
    provider: 'openai',
    dimensions: 3072,
    maxTokens: 8191,
    endpoint: 'https://api.openai.com/v1/embeddings',
    apiKeySettingName: 'openRouterApiKey',
  },
];

/**
 * Map of model ID to Ollama model name
 */
const OLLAMA_MODEL_MAP: Record<string, string> = {
  'local-gemma': 'embeddinggemma',
  'local-nomic': 'nomic-embed-text',
  'local-mxbai': 'mxbai-embed-large',
  'local-all-minilm': 'all-minilm',
};

/**
 * Map of model ID to common name variations/aliases
 * Used to detect models installed with alternative names
 */
const OLLAMA_MODEL_ALIASES: Record<string, string[]> = {
  'local-gemma': ['embeddinggemma', 'gemma', 'embedding-gemma'],
  'local-nomic': ['nomic-embed-text', 'nomic', 'nomic-embed'],
  'local-mxbai': ['mxbai-embed-large', 'mxbai', 'mxbai-embed'],
  'local-all-minilm': ['all-minilm', 'minilm', 'all-minilm-l6-v2'],
};

/**
 * Resolve a local model ID from an Ollama model name.
 * Supports version tags like "embeddinggemma:300m".
 */
export function resolveLocalModelIdFromOllamaName(ollamaName?: string): string | null {
  if (!ollamaName) return null;
  const normalized = ollamaName.toLowerCase().trim();
  const baseName = normalized.split(':')[0];

  for (const [modelId, aliases] of Object.entries(OLLAMA_MODEL_ALIASES)) {
    for (const alias of aliases) {
      const target = alias.toLowerCase();
      if (baseName === target || normalized === target || normalized.startsWith(`${target}:`)) {
        return modelId;
      }
    }
  }

  return null;
}

export async function listOllamaModels(ollamaBaseUrl: string): Promise<Array<{ name: string; size?: number }>> {
  const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
    method: 'GET',
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Ollama API returned status ${response.status}`);
  }

  const data = await response.json();
  const models = Array.isArray(data?.models) ? data.models : [];

  return models.map((model: { name: string; size?: number }) => ({
    name: model.name,
    size: model.size,
  }));
}

/**
 * Map of model ID to OpenAI model name
 */
const OPENAI_MODEL_MAP: Record<string, string> = {
  'openai-small': 'text-embedding-3-small',
  'openai-large': 'text-embedding-3-large',
};

/**
 * Default Ollama base URL
 * Using 127.0.0.1 instead of localhost to avoid IPv6 (::1) connection issues
 */
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

// =============================================================================
// Rate Limiter
// =============================================================================

/**
 * Rate limiter for API calls
 * Implements token bucket algorithm
 */
class RateLimiter {
  private state: RateLimiterState;
  private readonly maxRequestsPerMinute: number;
  private readonly windowMs: number = 60000; // 1 minute

  constructor(maxRequestsPerMinute: number = 60) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.state = {
      requestCount: 0,
      windowStart: Date.now(),
      queue: [],
      isProcessing: false,
    };
  }

  /**
   * Check if a request can be made immediately
   */
  canMakeRequest(): boolean {
    this.resetWindowIfNeeded();
    return this.state.requestCount < this.maxRequestsPerMinute;
  }

  /**
   * Record a request being made
   */
  recordRequest(): void {
    this.resetWindowIfNeeded();
    this.state.requestCount++;
  }

  /**
   * Get time to wait before next request (in ms)
   */
  getWaitTime(): number {
    if (this.canMakeRequest()) {
      return 0;
    }
    const elapsed = Date.now() - this.state.windowStart;
    return Math.max(0, this.windowMs - elapsed);
  }

  /**
   * Wait until a request can be made
   */
  async waitForSlot(): Promise<void> {
    const waitTime = this.getWaitTime();
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.recordRequest();
  }

  /**
   * Reset the window if it has expired
   */
  private resetWindowIfNeeded(): void {
    const now = Date.now();
    if (now - this.state.windowStart >= this.windowMs) {
      this.state.requestCount = 0;
      this.state.windowStart = now;
    }
  }

  /**
   * Get current rate limiter stats
   */
  getStats(): { requestCount: number; remainingRequests: number; windowResetIn: number } {
    this.resetWindowIfNeeded();
    return {
      requestCount: this.state.requestCount,
      remainingRequests: Math.max(0, this.maxRequestsPerMinute - this.state.requestCount),
      windowResetIn: Math.max(0, this.windowMs - (Date.now() - this.state.windowStart)),
    };
  }
}

// =============================================================================
// Embedding Service Implementation
// =============================================================================

/**
 * Embedding Service
 * 
 * Handles embedding generation for RAG retrieval.
 * Supports local (Ollama) and API-based (OpenAI) embedding models.
 */
export class EmbeddingService implements IEmbeddingService {
  private currentModelId: string;
  private currentModelInfo: EmbeddingModelInfo;
  private ollamaBaseUrl: string;
  private rateLimiter: RateLimiter;
  private modelAvailabilityCache: Map<string, { available: boolean; checkedAt: number }>;
  private readonly availabilityCacheTTL = 30000; // 30 seconds

  constructor(modelId: string = 'local-gemma', ollamaBaseUrl: string = DEFAULT_OLLAMA_URL) {
    this.currentModelId = modelId;
    this.currentModelInfo = this.getModelInfoById(modelId);
    this.ollamaBaseUrl = ollamaBaseUrl;
    this.rateLimiter = new RateLimiter(60); // 60 requests per minute for OpenAI
    this.modelAvailabilityCache = new Map();
  }

  /**
   * Get model info by ID
   */
  private getModelInfoById(modelId: string): EmbeddingModelInfo {
    const model = EMBEDDING_MODELS.find(m => m.id === modelId);
    if (model) {
      return model;
    }
    
    // Handle dynamic Ollama models (e.g., "ollama-embeddinggemma:300m")
    if (modelId.startsWith('ollama-')) {
      const ollamaModelName = modelId.replace(/^ollama-/, '');
      return {
        id: modelId,
        name: ollamaModelName,
        provider: 'local',
        dimensions: 768, // Default, will be determined at runtime
        maxTokens: 512,
      };
    }
    
    // Default to local-nomic if model not found
    return EMBEDDING_MODELS[0];
  }

  /**
   * Get information about the current embedding model
   * 
   * Implements Requirement 21.5
   */
  getModelInfo(): EmbeddingModelInfo {
    return { ...this.currentModelInfo };
  }

  /**
   * Set the active embedding model
   * 
   * Implements Requirement 21.1
   * 
   * @param modelId - ID of the model to use
   */
  async setModel(modelId: string): Promise<void> {
    const modelInfo = this.getModelInfoById(modelId);
    
    // Check if model is available before switching
    const isAvailable = await this.isModelAvailable(modelId);
    if (!isAvailable) {
      throw new Error(`Embedding model '${modelId}' is not available`);
    }

    this.currentModelId = modelId;
    this.currentModelInfo = modelInfo;
  }

  /**
   * Check if a model is available
   *
   * @param modelId - ID of the model to check
   * @param forceRefresh - Force a fresh check, bypassing cache
   * @returns Whether the model is available
   */
  async isModelAvailable(modelId: string, forceRefresh: boolean = false): Promise<boolean> {
    // Check cache first (unless forceRefresh is true)
    if (!forceRefresh) {
      const cached = this.modelAvailabilityCache.get(modelId);
      if (cached && Date.now() - cached.checkedAt < this.availabilityCacheTTL) {
        console.log(`[EmbeddingService] Using cached availability for ${modelId}: ${cached.available}`);
        return cached.available;
      }
    } else {
      console.log(`[EmbeddingService] Force refresh enabled, bypassing cache for ${modelId}`);
    }

    const modelInfo = this.getModelInfoById(modelId);
    let available = false;

    try {
      if (modelInfo.provider === 'local') {
        available = await this.checkOllamaModelAvailable(modelId);
      } else if (modelInfo.provider === 'openai') {
        available = await this.checkOpenAIAvailable();
      }
    } catch (error) {
      console.error(`Error checking model availability for ${modelId}:`, error);
      available = false;
    }

    // Cache the result
    this.modelAvailabilityCache.set(modelId, {
      available,
      checkedAt: Date.now(),
    });

    return available;
  }

  /**
   * Check if Ollama is running and has the specified model
   */
  private async checkOllamaModelAvailable(modelId: string): Promise<boolean> {
    try {
      // First check if Ollama is running
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000), // Increased timeout to 10s
      });

      if (!response.ok) {
        console.log(`[EmbeddingService] Ollama API returned status ${response.status}`);
        return false;
      }

      const data = await response.json();
      const models = data.models || [];
      
      // Handle dynamic Ollama models (e.g., "ollama-embeddinggemma:300m")
      let ollamaModelName: string | undefined;
      if (modelId.startsWith('ollama-')) {
        ollamaModelName = modelId.replace(/^ollama-/, '');
      } else {
        ollamaModelName = OLLAMA_MODEL_MAP[modelId];
      }

      if (!ollamaModelName) {
        console.log(`[EmbeddingService] No Ollama mapping found for model ID: ${modelId}`);
        return false;
      }

      // Get aliases for this model
      const aliases = OLLAMA_MODEL_ALIASES[modelId] || [ollamaModelName];

      // Log available models for debugging
      console.log(`[EmbeddingService] Checking for model "${ollamaModelName}" (ID: ${modelId})`);
      console.log(`[EmbeddingService] Also checking aliases:`, aliases);
      console.log(`[EmbeddingService] Available Ollama models:`, models.map((m: any) => m.name));
      console.log(`[EmbeddingService] Total models found in Ollama: ${models.length}`);

      // Check if the model is installed with improved matching
      const isAvailable = models.some((m: { name: string }) => {
        // Normalize model name: convert to lowercase, keep colons for version tags
        const modelName = m.name.toLowerCase().trim();

        // Check against all possible names (primary + aliases)
        const matches = aliases.some(alias => {
          const targetName = alias.toLowerCase();
          // Match exact name OR name with version tag (e.g., "embeddinggemma:latest")
          const exactMatch = modelName === targetName;
          const tagMatch = modelName.startsWith(`${targetName}:`);

          if (exactMatch || tagMatch) {
            console.log(`[EmbeddingService] ✓ Matched "${modelName}" against alias "${targetName}"`);
          }

          return exactMatch || tagMatch;
        });

        if (matches) {
          console.log(`[EmbeddingService] ✓ Found matching model: ${m.name}`);
        }

        return matches;
      });

      if (!isAvailable) {
        console.log(`[EmbeddingService] ✗ Model "${ollamaModelName}" not found in available models`);
      }

      return isAvailable;
    } catch (error) {
      // Ollama not running or network error
      console.error(`[EmbeddingService] Error checking Ollama model availability:`, error);
      return false;
    }
  }

  /**
   * Check if OpenAI API is available (has valid API key)
   */
  private async checkOpenAIAvailable(): Promise<boolean> {
    try {
      const apiKey = getSecureValue('openRouterApiKey');
      // OpenAI keys start with 'sk-'
      return !!apiKey && apiKey.startsWith('sk-');
    } catch {
      return false;
    }
  }

  /**
   * Generate embedding for a single text
   * 
   * Implements Requirements 21.2, 21.3
   * 
   * @param text - Text to embed
   * @returns Embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      // Return zero vector for empty text
      return new Array(this.currentModelInfo.dimensions).fill(0);
    }

    if (this.currentModelInfo.provider === 'local') {
      return this.generateOllamaEmbedding(text);
    } else if (this.currentModelInfo.provider === 'openai') {
      return this.generateOpenAIEmbedding(text);
    }

    throw new Error(`Unsupported embedding provider: ${this.currentModelInfo.provider}`);
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * 
   * Implements Requirements 21.2, 21.3
   * 
   * @param texts - Array of texts to embed
   * @returns Array of embedding vectors
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Filter out empty texts and track their indices
    const nonEmptyTexts: { text: string; originalIndex: number }[] = [];
    const results: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i++) {
      if (texts[i] && texts[i].trim().length > 0) {
        nonEmptyTexts.push({ text: texts[i], originalIndex: i });
      } else {
        // Fill empty texts with zero vectors
        results[i] = new Array(this.currentModelInfo.dimensions).fill(0);
      }
    }

    if (nonEmptyTexts.length === 0) {
      return results;
    }

    if (this.currentModelInfo.provider === 'local') {
      // Ollama doesn't support batch embeddings, process sequentially
      for (const { text, originalIndex } of nonEmptyTexts) {
        results[originalIndex] = await this.generateOllamaEmbedding(text);
      }
    } else if (this.currentModelInfo.provider === 'openai') {
      // OpenAI supports batch embeddings
      const batchTexts = nonEmptyTexts.map(t => t.text);
      const batchEmbeddings = await this.generateOpenAIEmbeddingsBatch(batchTexts);
      
      for (let i = 0; i < nonEmptyTexts.length; i++) {
        results[nonEmptyTexts[i].originalIndex] = batchEmbeddings[i];
      }
    } else {
      throw new Error(`Unsupported embedding provider: ${this.currentModelInfo.provider}`);
    }

    return results;
  }

  /**
   * Generate embedding using Ollama
   *
   * Implements Requirement 21.2, 21.4
   */
  private async generateOllamaEmbedding(text: string): Promise<number[]> {
    // Handle dynamic Ollama models (e.g., "ollama-embeddinggemma:300m")
    let ollamaModelName: string;
    if (this.currentModelId.startsWith('ollama-')) {
      ollamaModelName = this.currentModelId.replace(/^ollama-/, '');
    } else {
      ollamaModelName = OLLAMA_MODEL_MAP[this.currentModelId];
    }
    
    if (!ollamaModelName) {
      throw new Error(`Unknown Ollama model for ID: ${this.currentModelId}`);
    }

    // Check Ollama availability first with better error message
    const isAvailable = await this.isModelAvailable(this.currentModelId);
    if (!isAvailable) {
      throw new Error(
        'Ollama is not running or the embedding model is not available.\n\n' +
        `Required model: ${ollamaModelName}\n\n` +
        'To fix this:\n' +
        '1. Make sure Ollama is running: https://ollama.com/download\n' +
        `2. Install the embedding model: ollama pull ${ollamaModelName}\n` +
        `3. Or switch to a different embedding model in settings`
      );
    }

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ollamaModelName,
          prompt: text,
        }),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      return data.embedding;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new Error('Ollama embedding request timed out. The document may be too large or Ollama may be overloaded.');
      }
      // Re-throw our custom error message
      throw error;
    }
  }

  /**
   * Generate embedding using OpenAI API
   * 
   * Implements Requirement 21.3, 19.4
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateOpenAIEmbeddingsBatch([text]);
    return embeddings[0];
  }

  /**
   * Generate embeddings in batch using OpenAI API
   * 
   * Implements Requirement 21.3, 19.4
   */
  private async generateOpenAIEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const apiKey = getSecureValue('openRouterApiKey');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const openaiModelName = OPENAI_MODEL_MAP[this.currentModelId];
    if (!openaiModelName) {
      throw new Error(`Unknown OpenAI model for ID: ${this.currentModelId}`);
    }

    // Apply rate limiting
    await this.rateLimiter.waitForSlot();

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: openaiModelName,
          input: texts,
        }),
        signal: AbortSignal.timeout(60000), // 60 second timeout for batch
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
          throw new Error(`OpenAI rate limit exceeded. Retry after ${waitTime / 1000} seconds`);
        }

        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid embedding response from OpenAI');
      }

      // Sort by index to ensure correct order
      const sortedData = data.data.sort((a: any, b: any) => a.index - b.index);
      
      return sortedData.map((item: any) => item.embedding);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new Error('OpenAI embedding request timed out');
      }
      throw error;
    }
  }

  /**
   * Get all available embedding models
   */
  static getAvailableModels(): EmbeddingModelInfo[] {
    return [...EMBEDDING_MODELS];
  }

  /**
   * Get rate limiter stats (for monitoring)
   */
  getRateLimiterStats(): { requestCount: number; remainingRequests: number; windowResetIn: number } {
    return this.rateLimiter.getStats();
  }

  /**
   * Set the Ollama base URL
   */
  setOllamaBaseUrl(url: string): void {
    this.ollamaBaseUrl = url;
    // Clear availability cache when URL changes
    this.modelAvailabilityCache.clear();
  }

  /**
   * Get the current Ollama base URL
   */
  getOllamaBaseUrl(): string {
    return this.ollamaBaseUrl;
  }

  /**
   * Clear the model availability cache
   */
  clearAvailabilityCache(): void {
    this.modelAvailabilityCache.clear();
  }

  /**
   * Check if switching to a new model would require re-indexing
   * 
   * Implements Requirement 21.6: Handle embedding model changes
   * 
   * @param newModelId - The model ID to switch to
   * @param documentEmbeddingModel - The model used to index the document
   * @returns Model change information including whether re-indexing is required
   */
  checkModelChange(newModelId: string, documentEmbeddingModel?: string): ModelChangeInfo {
    const newModelInfo = this.getModelInfoById(newModelId);
    const currentDimensions = newModelInfo.dimensions;
    
    // If no document model provided, just return current model info
    if (!documentEmbeddingModel) {
      return {
        hasChanged: false,
        currentModelId: newModelId,
        requiresReindex: false,
        currentDimensions,
      };
    }
    
    const previousModelInfo = this.getModelInfoById(documentEmbeddingModel);
    const previousDimensions = previousModelInfo.dimensions;
    
    const hasChanged = newModelId !== documentEmbeddingModel;
    const requiresReindex = hasChanged && previousDimensions !== currentDimensions;
    
    return {
      hasChanged,
      previousModelId: documentEmbeddingModel,
      currentModelId: newModelId,
      requiresReindex,
      previousDimensions,
      currentDimensions,
    };
  }

  /**
   * Get the current model ID
   */
  getCurrentModelId(): string {
    return this.currentModelId;
  }
}

/**
 * Check if two embedding models are compatible (same dimensions)
 * 
 * @param modelId1 - First model ID
 * @param modelId2 - Second model ID
 * @returns Whether the models have compatible dimensions
 */
export function areModelsCompatible(modelId1: string, modelId2: string): boolean {
  const model1 = EMBEDDING_MODELS.find(m => m.id === modelId1);
  const model2 = EMBEDDING_MODELS.find(m => m.id === modelId2);
  
  if (!model1 || !model2) {
    return false;
  }
  
  return model1.dimensions === model2.dimensions;
}

/**
 * Get model info by ID (exported for external use)
 * 
 * @param modelId - Model ID to look up
 * @returns Model info or undefined if not found
 */
export function getEmbeddingModelById(modelId: string): EmbeddingModelInfo | undefined {
  return EMBEDDING_MODELS.find(m => m.id === modelId);
}

/**
 * Model change detection result
 */
export interface ModelChangeInfo {
  /** Whether the model has changed */
  hasChanged: boolean;
  /** Previous model ID (if available) */
  previousModelId?: string;
  /** Current model ID */
  currentModelId: string;
  /** Whether re-indexing is required (dimensions differ) */
  requiresReindex: boolean;
  /** Previous model dimensions */
  previousDimensions?: number;
  /** Current model dimensions */
  currentDimensions: number;
}

/**
 * Singleton instance of the embedding service using global registry
 */
export const embeddingService = (() => {
  const globalKey = Symbol.for('zura.embeddingService');
  const globalRegistry = global as any;
  
  if (!globalRegistry[globalKey]) {
    globalRegistry[globalKey] = new EmbeddingService();
  }
  
  return globalRegistry[globalKey] as EmbeddingService;
})();


// =============================================================================
// Embedding Fallback Support (Requirement 18.2)
// =============================================================================

/**
 * Embedding Fallback Manager
 * 
 * Tracks embedding availability and manages fallback state.
 * When embeddings are unavailable, the system falls back to BM25-only search.
 * 
 * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
 */
export class EmbeddingFallbackManager {
  private state: EmbeddingFallbackState;
  private readonly maxFailuresBeforeFallback = 3;
  private readonly recoveryCheckIntervalMs = 30000; // 30 seconds
  private recoveryCheckTimer: NodeJS.Timeout | null = null;
  private onStateChangeCallback?: (state: EmbeddingFallbackState) => void;

  constructor() {
    this.state = {
      isActive: false,
      failureCount: 0,
      canRecover: true,
    };
  }

  /**
   * Get the current fallback state
   */
  getState(): EmbeddingFallbackState {
    return { ...this.state };
  }

  /**
   * Check if fallback mode is active
   */
  isInFallbackMode(): boolean {
    return this.state.isActive;
  }

  /**
   * Record an embedding failure
   * 
   * @param error - The error that occurred
   * @param reason - The reason for the failure
   */
  recordFailure(error: Error | string, reason: EmbeddingFallbackReason = 'generation_failed'): void {
    const errorMessage = error instanceof Error ? error.message : error;
    
    this.state.failureCount++;
    this.state.lastError = errorMessage;

    console.warn(`[EmbeddingFallbackManager] Embedding failure #${this.state.failureCount}: ${errorMessage}`);

    // Activate fallback mode after max failures
    if (this.state.failureCount >= this.maxFailuresBeforeFallback && !this.state.isActive) {
      this.activateFallback(reason, errorMessage);
    }
  }

  /**
   * Activate fallback mode
   * 
   * @param reason - Reason for activating fallback
   * @param errorMessage - Optional error message
   */
  activateFallback(reason: EmbeddingFallbackReason, errorMessage?: string): void {
    const message = this.getFallbackMessage(reason, errorMessage);
    
    this.state = {
      isActive: true,
      reason,
      message,
      activatedAt: Date.now(),
      failureCount: this.state.failureCount,
      lastError: errorMessage || this.state.lastError,
      canRecover: this.canRecoverFromReason(reason),
    };

    console.warn(`[EmbeddingFallbackManager] Fallback mode activated: ${reason} - ${message}`);
    
    // Start recovery check timer if recovery is possible
    if (this.state.canRecover) {
      this.startRecoveryChecks();
    }

    // Notify listeners
    this.onStateChangeCallback?.(this.state);
  }

  /**
   * Deactivate fallback mode (recovery successful)
   */
  deactivateFallback(): void {
    if (!this.state.isActive) return;

    console.log('[EmbeddingFallbackManager] Fallback mode deactivated - embeddings recovered');
    
    this.state = {
      isActive: false,
      failureCount: 0,
      canRecover: true,
    };

    this.stopRecoveryChecks();
    this.onStateChangeCallback?.(this.state);
  }

  /**
   * Record a successful embedding operation
   * Resets failure count and potentially deactivates fallback
   */
  recordSuccess(): void {
    if (this.state.isActive) {
      // If we were in fallback mode and now succeeded, deactivate
      this.deactivateFallback();
    } else {
      // Reset failure count on success
      this.state.failureCount = 0;
    }
  }

  /**
   * Attempt recovery from fallback mode
   * 
   * @returns Whether recovery was successful
   */
  async attemptRecovery(): Promise<boolean> {
    if (!this.state.isActive || !this.state.canRecover) {
      return false;
    }

    this.state.lastRecoveryAttempt = Date.now();
    console.log('[EmbeddingFallbackManager] Attempting recovery from fallback mode...');

    try {
      // Check if the current embedding model is available
      const isAvailable = await embeddingService.isModelAvailable(
        embeddingService.getCurrentModelId()
      );

      if (isAvailable) {
        // Try a test embedding to verify it works
        const testEmbedding = await embeddingService.generateEmbedding('test');
        
        if (testEmbedding && testEmbedding.length > 0) {
          this.deactivateFallback();
          return true;
        }
      }
    } catch (error) {
      console.warn('[EmbeddingFallbackManager] Recovery attempt failed:', error);
    }

    return false;
  }

  /**
   * Set callback for state changes
   */
  onStateChange(callback: (state: EmbeddingFallbackState) => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Create a notification for the UI
   */
  createNotification(): EmbeddingFallbackNotification | null {
    if (!this.state.isActive) {
      return null;
    }

    const notification: EmbeddingFallbackNotification = {
      type: 'warning',
      title: 'Using Keyword Search Only',
      message: this.state.message || 'Semantic search is temporarily unavailable. Results are based on keyword matching only.',
      dismissible: true,
      timestamp: Date.now(),
    };

    // Add action based on reason
    if (this.state.reason === 'model_unavailable') {
      notification.action = {
        label: 'Configure Embedding Model',
        actionType: 'configure',
      };
    } else if (this.state.canRecover) {
      notification.action = {
        label: 'Retry',
        actionType: 'retry',
      };
    }

    return notification;
  }

  /**
   * Get human-readable message for fallback reason
   */
  private getFallbackMessage(reason: EmbeddingFallbackReason, errorMessage?: string): string {
    switch (reason) {
      case 'model_unavailable':
        return 'The embedding model is not available. Please check that Ollama is running or configure an API key for cloud embeddings.';
      case 'generation_failed':
        return `Embedding generation failed${errorMessage ? `: ${errorMessage}` : ''}. Using keyword search as fallback.`;
      case 'rate_limited':
        return 'API rate limit exceeded. Using keyword search while waiting for rate limit to reset.';
      case 'model_loading':
        return 'The embedding model is still loading. Using keyword search temporarily.';
      case 'dimension_mismatch':
        return 'Embedding dimensions do not match the indexed documents. Please re-index the documents or switch to a compatible model.';
      default:
        return 'Semantic search is temporarily unavailable. Using keyword search as fallback.';
    }
  }

  /**
   * Check if recovery is possible for a given reason
   */
  private canRecoverFromReason(reason: EmbeddingFallbackReason): boolean {
    switch (reason) {
      case 'dimension_mismatch':
        // Dimension mismatch requires re-indexing, not automatic recovery
        return false;
      case 'model_unavailable':
      case 'generation_failed':
      case 'rate_limited':
      case 'model_loading':
      default:
        return true;
    }
  }

  /**
   * Start periodic recovery checks
   */
  private startRecoveryChecks(): void {
    if (this.recoveryCheckTimer) {
      return;
    }

    this.recoveryCheckTimer = setInterval(async () => {
      if (this.state.isActive && this.state.canRecover) {
        await this.attemptRecovery();
      }
    }, this.recoveryCheckIntervalMs);
  }

  /**
   * Stop periodic recovery checks
   */
  private stopRecoveryChecks(): void {
    if (this.recoveryCheckTimer) {
      clearInterval(this.recoveryCheckTimer);
      this.recoveryCheckTimer = null;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopRecoveryChecks();
    this.onStateChangeCallback = undefined;
  }
}

/**
 * Singleton instance of the fallback manager
 */
export const embeddingFallbackManager = new EmbeddingFallbackManager();

/**
 * Wrapper function to generate embeddings with fallback support
 * 
 * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
 * 
 * @param text - Text to embed
 * @returns Embedding vector or null if fallback mode is active
 */
export async function generateEmbeddingWithFallback(text: string): Promise<number[] | null> {
  // If already in fallback mode, return null immediately
  if (embeddingFallbackManager.isInFallbackMode()) {
    return null;
  }

  try {
    const embedding = await embeddingService.generateEmbedding(text);
    embeddingFallbackManager.recordSuccess();
    return embedding;
  } catch (error: any) {
    // Determine the reason for failure
    let reason: EmbeddingFallbackReason = 'generation_failed';
    
    if (error.message?.includes('not available') || error.message?.includes('not running')) {
      reason = 'model_unavailable';
    } else if (error.message?.includes('rate limit')) {
      reason = 'rate_limited';
    } else if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
      reason = 'generation_failed';
    }

    embeddingFallbackManager.recordFailure(error, reason);
    return null;
  }
}

/**
 * Wrapper function to generate batch embeddings with fallback support
 * 
 * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
 * 
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors or null if fallback mode is active
 */
export async function generateEmbeddingsWithFallback(texts: string[]): Promise<number[][] | null> {
  // If already in fallback mode, return null immediately
  if (embeddingFallbackManager.isInFallbackMode()) {
    return null;
  }

  try {
    const embeddings = await embeddingService.generateEmbeddings(texts);
    embeddingFallbackManager.recordSuccess();
    return embeddings;
  } catch (error: any) {
    // Determine the reason for failure
    let reason: EmbeddingFallbackReason = 'generation_failed';
    
    if (error.message?.includes('not available') || error.message?.includes('not running')) {
      reason = 'model_unavailable';
    } else if (error.message?.includes('rate limit')) {
      reason = 'rate_limited';
    }

    embeddingFallbackManager.recordFailure(error, reason);
    return null;
  }
}

/**
 * Check embedding availability and update fallback state
 * 
 * @returns Whether embeddings are available
 */
export async function checkEmbeddingAvailability(): Promise<boolean> {
  try {
    const modelId = embeddingService.getCurrentModelId();
    const isAvailable = await embeddingService.isModelAvailable(modelId);
    
    if (!isAvailable) {
      embeddingFallbackManager.activateFallback('model_unavailable');
      return false;
    }

    // If we were in fallback mode and model is now available, try recovery
    if (embeddingFallbackManager.isInFallbackMode()) {
      const recovered = await embeddingFallbackManager.attemptRecovery();
      return recovered;
    }

    return true;
  } catch (error: any) {
    embeddingFallbackManager.recordFailure(error, 'model_unavailable');
    return false;
  }
}

// =============================================================================
// Model Caching Functions (Requirement 21.7)
// =============================================================================

/**
 * Get the cache status for a specific embedding model
 * 
 * Implements Requirement 21.7: Cache downloaded models locally, support offline use
 * 
 * @param modelId - ID of the model to check
 * @param options - Options for the check
 * @returns Model cache status
 */
export async function getModelCacheStatus(
  modelId: string,
  options: ModelCheckOptions = {}
): Promise<ModelCacheStatus> {
  const modelInfo = getEmbeddingModelById(modelId);
  
  if (!modelInfo) {
    return {
      modelId,
      modelName: modelId,
      provider: 'local',
      isAvailable: false,
      isCached: false,
      isDownloading: false,
      lastCheckedAt: Date.now(),
      errorMessage: `Unknown model: ${modelId}`,
      requiresApiKey: false,
    };
  }

  const status: ModelCacheStatus = {
    modelId,
    modelName: modelInfo.name,
    provider: modelInfo.provider,
    isAvailable: false,
    isCached: false,
    isDownloading: false,
    lastCheckedAt: Date.now(),
    requiresApiKey: modelInfo.provider !== 'local',
    dimensions: modelInfo.dimensions,
  };

  try {
    if (modelInfo.provider === 'local') {
      // For local models (Ollama), check if the model is installed
      const ollamaStatus = await checkOllamaModelStatus(modelId, options);
      status.isAvailable = ollamaStatus.isAvailable;
      status.isCached = ollamaStatus.isCached;
      status.isDownloading = ollamaStatus.isDownloading;
      status.downloadProgress = ollamaStatus.downloadProgress;
      status.cacheSizeBytes = ollamaStatus.cacheSizeBytes;
      status.errorMessage = ollamaStatus.errorMessage;
    } else if (modelInfo.provider === 'openai') {
      // For OpenAI, check if API key is configured
      const apiKey = getSecureValue('openRouterApiKey');
      status.hasApiKey = !!apiKey && apiKey.startsWith('sk-');
      status.isAvailable = status.hasApiKey;
      status.isCached = true; // API models don't need local caching
      if (!status.hasApiKey) {
        status.errorMessage = 'OpenAI API key not configured';
      }
    } else if (modelInfo.provider === 'voyage') {
      // For Voyage AI, check if API key is configured
      const apiKey = getSecureValue('voyageApiKey');
      status.hasApiKey = !!apiKey;
      status.isAvailable = status.hasApiKey;
      status.isCached = true; // API models don't need local caching
      if (!status.hasApiKey) {
        status.errorMessage = 'Voyage AI API key not configured';
      }
    }
  } catch (error: any) {
    status.errorMessage = error.message || 'Failed to check model status';
  }

  return status;
}

/**
 * Check Ollama model status including cache information
 */
async function checkOllamaModelStatus(
  modelId: string,
  options: ModelCheckOptions = {}
): Promise<{
  isAvailable: boolean;
  isCached: boolean;
  isDownloading: boolean;
  downloadProgress?: number;
  cacheSizeBytes?: number;
  errorMessage?: string;
}> {
  const ollamaModelName = OLLAMA_MODEL_MAP[modelId];
  
  if (!ollamaModelName) {
    return {
      isAvailable: false,
      isCached: false,
      isDownloading: false,
      errorMessage: `Unknown Ollama model for ID: ${modelId}`,
    };
  }

  const ollamaUrl = embeddingService.getOllamaBaseUrl();
  const timeout = options.timeoutMs || 10000; // Increased to 10s for slower responses

  try {
    console.log(`[EmbeddingService] ========================================`);
    console.log(`[EmbeddingService] Checking Ollama model '${ollamaModelName}' (ID: ${modelId})`);
    console.log(`[EmbeddingService] Ollama URL: ${ollamaUrl}`);
    console.log(`[EmbeddingService] Timeout: ${timeout}ms`);

    // First check if Ollama is running
    const tagsResponse = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout),
    });

    console.log(`[EmbeddingService] Ollama API response status: ${tagsResponse.status}`);

    if (!tagsResponse.ok) {
      console.log(`[EmbeddingService] Ollama not accessible: HTTP ${tagsResponse.status}`);
      return {
        isAvailable: false,
        isCached: false,
        isDownloading: false,
        errorMessage: 'Ollama is not running or not accessible',
      };
    }

    const tagsData = await tagsResponse.json();
    const models = tagsData.models || [];

    // Get aliases for this model
    const aliases = OLLAMA_MODEL_ALIASES[modelId] || [ollamaModelName];

    console.log(`[EmbeddingService] Found ${models.length} models in Ollama`);
    console.log(`[EmbeddingService] Searching for '${ollamaModelName}' or '${ollamaModelName}:*'`);
    console.log(`[EmbeddingService] Also checking aliases:`, aliases);

    // Check if the model is installed with improved matching
    const installedModel = models.find((m: { name: string; size?: number }) => {
      // Normalize model name: convert to lowercase, keep colons for version tags
      const modelName = m.name.toLowerCase().trim();

      // Check against all possible names (primary + aliases)
      return aliases.some(alias => {
        const targetName = alias.toLowerCase();
        // Match exact name OR name with version tag (e.g., "embeddinggemma:latest")
        const exactMatch = modelName === targetName;
        const tagMatch = modelName.startsWith(`${targetName}:`);

        if (exactMatch || tagMatch) {
          console.log(`[EmbeddingService] ✓ Matched "${modelName}" against alias "${targetName}"`);
        }

        return exactMatch || tagMatch;
      });
    });

    if (installedModel) {
      console.log(`[EmbeddingService] ✓ Model found: ${installedModel.name} (${installedModel.size} bytes)`);
      console.log(`[EmbeddingService] ========================================`);
      return {
        isAvailable: true,
        isCached: true,
        isDownloading: false,
        cacheSizeBytes: installedModel.size,
      };
    }

    // Model not installed
    console.log(`[EmbeddingService] ✗ Model '${ollamaModelName}' not found in installed models`);
    console.log(`[EmbeddingService] Available models: ${models.map((m: any) => m.name).join(', ')}`);
    console.log(`[EmbeddingService] ========================================`);

    return {
      isAvailable: false,
      isCached: false,
      isDownloading: false,
      errorMessage: `Model '${ollamaModelName}' is not installed. Run: ollama pull ${ollamaModelName}`,
    };
  } catch (error: any) {
    console.error(`[EmbeddingService] Error checking Ollama model:`, error);

    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return {
        isAvailable: false,
        isCached: false,
        isDownloading: false,
        errorMessage: 'Ollama connection timed out',
      };
    }
    return {
      isAvailable: false,
      isCached: false,
      isDownloading: false,
      errorMessage: `Failed to connect to Ollama: ${error.message}`,
    };
  }
}

/**
 * Get status of all available embedding models
 * 
 * Implements Requirement 21.7: Cache downloaded models locally, support offline use
 * 
 * @param options - Options for the check
 * @returns Status of all models
 */
export async function getAllModelsStatus(
  options: ModelCheckOptions = {}
): Promise<AllModelsStatus> {
  const models: ModelCacheStatus[] = [];
  
  // Check all predefined models in parallel
  const statusPromises = EMBEDDING_MODELS.map(model => 
    getModelCacheStatus(model.id, options)
  );
  
  const statuses = await Promise.all(statusPromises);
  models.push(...statuses);

  // Also fetch dynamically installed Ollama models
  try {
    const ollamaModels = await listOllamaModels(embeddingService.getOllamaBaseUrl());
    const knownModelNames = new Set(models.map(m => m.modelName.toLowerCase()));
    
    for (const ollamaModel of ollamaModels) {
      // Skip if this model is already in the list (matched by name)
      const normalizedName = ollamaModel.name.toLowerCase();
      const baseName = normalizedName.split(':')[0];
      const alreadyListed = Array.from(knownModelNames).some(known => 
        known.includes(baseName) || baseName.includes(known.split(' ')[0].toLowerCase())
      );
      
      if (!alreadyListed) {
        // Create a dynamic model entry for this Ollama model
        models.push({
          modelId: `ollama-${ollamaModel.name}`,
          modelName: ollamaModel.name,
          provider: 'local',
          dimensions: 768, // Default, will be determined at runtime
          isAvailable: true, // It's in the Ollama list, so it's available
          isCached: true,
          isDownloading: false,
          needsDownload: false,
          lastCheckedAt: Date.now(),
          sizeBytes: ollamaModel.size,
        });
      }
    }
  } catch (error) {
    console.warn('[EmbeddingService] Failed to fetch dynamic Ollama models:', error);
    // Continue with just the static list if Ollama query fails
  }

  const currentModelId = embeddingService.getCurrentModelId();
  const hasAvailableModel = models.some(m => m.isAvailable);

  return {
    models,
    currentModelId,
    hasAvailableModel,
    lastUpdatedAt: Date.now(),
  };
}

/**
 * Download/pull a local embedding model via Ollama
 * 
 * Implements Requirement 21.7: Cache downloaded models locally, support offline use
 * 
 * @param modelId - ID of the model to download
 * @param onProgress - Optional callback for download progress
 * @returns Download result
 */
export async function downloadModel(
  modelId: string,
  onProgress?: (progress: number, status: string) => void
): Promise<ModelDownloadResult> {
  const modelInfo = getEmbeddingModelById(modelId);
  
  if (!modelInfo) {
    return {
      success: false,
      modelId,
      error: `Unknown model: ${modelId}`,
    };
  }

  if (modelInfo.provider !== 'local') {
    return {
      success: false,
      modelId,
      error: 'Only local (Ollama) models can be downloaded',
    };
  }

  const ollamaModelName = OLLAMA_MODEL_MAP[modelId];
  if (!ollamaModelName) {
    return {
      success: false,
      modelId,
      error: `Unknown Ollama model for ID: ${modelId}`,
    };
  }

  const ollamaUrl = embeddingService.getOllamaBaseUrl();
  const startTime = Date.now();

  try {
    // Use Ollama's pull API to download the model
    const response = await fetch(`${ollamaUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: ollamaModelName,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        modelId,
        error: `Failed to start download: ${response.status} ${response.statusText} - ${errorText}`,
      };
    }

    // Process the streaming response for progress updates
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        success: false,
        modelId,
        error: 'Failed to read download stream',
      };
    }

    const decoder = new TextDecoder();
    let lastProgress = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          
          if (data.status) {
            // Calculate progress from download status
            if (data.completed && data.total) {
              const progress = Math.round((data.completed / data.total) * 100);
              if (progress !== lastProgress) {
                lastProgress = progress;
                onProgress?.(progress, data.status);
              }
            } else {
              onProgress?.(lastProgress, data.status);
            }
          }

          if (data.error) {
            return {
              success: false,
              modelId,
              error: data.error,
            };
          }
        } catch {
          // Ignore JSON parse errors for incomplete lines
        }
      }
    }

    // Clear the availability cache to force a fresh check
    embeddingService.clearAvailabilityCache();

    return {
      success: true,
      modelId,
      downloadTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      modelId,
      error: error.message || 'Download failed',
    };
  }
}

/**
 * Clear the model availability cache
 * Forces fresh checks on next status request
 * 
 * Implements Requirement 21.7: Cache downloaded models locally, support offline use
 */
export function clearModelCache(): void {
  embeddingService.clearAvailabilityCache();
}

/**
 * Refresh the status of a specific model
 * 
 * @param modelId - ID of the model to refresh
 * @returns Updated model status
 */
export async function refreshModelStatus(modelId: string): Promise<ModelCacheStatus> {
  // Clear cache for this model
  embeddingService.clearAvailabilityCache();
  
  // Get fresh status
  return getModelCacheStatus(modelId, { forceRefresh: true });
}
