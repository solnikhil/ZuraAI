/**
 * Image Processor Service
 *
 * Handles image understanding for PDF indexing via:
 * - Ollama vision models (LLaVA, bakllava, llava-llama3)
 * - OCR fallback (Tesseract.js)
 *
 * Features:
 * - Vision model availability checking
 * - Automatic fallback to OCR when vision unavailable
 * - Batch processing support
 * - Configurable processing options
 * - Recovery from fallback mode
 */

import * as Tesseract from 'tesseract.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Information about a vision model
 */
export interface VisionModelInfo {
  /** Unique identifier for the model */
  id: string;
  /** Display name */
  name: string;
  /** Ollama model name */
  ollamaName: string;
  /** Whether this model is available */
  isAvailable?: boolean;
}

/**
 * Configuration for image processing
 */
export interface ImageProcessingConfig {
  /** Vision model to use */
  visionModel: string;
  /** Ollama base URL */
  ollamaBaseUrl: string;
  /** Whether vision processing is enabled */
  enableVision: boolean;
  /** Whether OCR fallback is enabled */
  enableOCR: boolean;
  /** Prefer vision over OCR when both available */
  preferVision: boolean;
  /** Maximum image dimension (resize if larger) */
  maxImageSize: number;
  /** Prompt for image description */
  descriptionPrompt: string;
  /** Languages for OCR */
  ocrLanguages: string[];
  /** Timeout for vision requests in ms */
  visionTimeoutMs: number;
  /** Timeout for OCR requests in ms */
  ocrTimeoutMs: number;
}

/**
 * Result of processing a single image
 */
export interface ImageProcessingResult {
  /** Image ID */
  imageId: string;
  /** Generated description */
  description: string;
  /** Method used */
  method: 'vision' | 'ocr' | 'none';
  /** Confidence score (0-1) */
  confidence: number;
  /** OCR extracted text (if OCR used) */
  extractedText?: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Error message if processing failed */
  error?: string;
  /** Whether processing was successful */
  success: boolean;
}

/**
 * Reason for fallback activation
 */
export type ImageFallbackReason =
  | 'model_unavailable'
  | 'generation_failed'
  | 'timeout'
  | 'ocr_failed';

/**
 * Image processing fallback state
 */
export interface ImageFallbackState {
  /** Whether fallback mode is active */
  isActive: boolean;
  /** Reason for fallback */
  reason?: ImageFallbackReason;
  /** Human-readable message */
  message?: string;
  /** Timestamp when fallback was activated */
  activatedAt?: number;
  /** Number of consecutive failures */
  failureCount: number;
  /** Whether recovery is possible */
  canRecover: boolean;
  /** Last error message */
  lastError?: string;
  /** Timestamp of last recovery attempt */
  lastRecoveryAttempt?: number;
}

/**
 * Notification for UI about fallback state
 */
export interface ImageFallbackNotification {
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  dismissible: boolean;
  timestamp: number;
  action?: {
    label: string;
    actionType: 'configure' | 'retry' | 'dismiss';
  };
}

// =============================================================================
// Vision Model Configurations
// =============================================================================

/**
 * Available vision models via Ollama
 */
export const VISION_MODELS: VisionModelInfo[] = [
  {
    id: 'qwen2-vl:2b',
    name: 'Qwen2-VL (2B)',
    ollamaName: 'qwen2-vl:2b',
  },
  {
    id: 'qwen2-vl:7b',
    name: 'Qwen2-VL (7B)',
    ollamaName: 'qwen2-vl:7b',
  },
  {
    id: 'llava',
    name: 'LLaVA (7B)',
    ollamaName: 'llava',
  },
  {
    id: 'llava-llama3',
    name: 'LLaVA-Llama3 (8B)',
    ollamaName: 'llava-llama3',
  },
  {
    id: 'bakllava',
    name: 'BakLLaVA (7B)',
    ollamaName: 'bakllava',
  },
  {
    id: 'llava:13b',
    name: 'LLaVA (13B)',
    ollamaName: 'llava:13b',
  },
  {
    id: 'moondream',
    name: 'Moondream (1.8B)',
    ollamaName: 'moondream',
  },
];

/**
 * Map of model ID to Ollama model name
 */
const VISION_MODEL_MAP: Record<string, string> = Object.fromEntries(
  VISION_MODELS.map(m => [m.id, m.ollamaName])
);

/**
 * Default Ollama base URL
 */
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

/**
 * Default configuration for image processing
 */
export const DEFAULT_IMAGE_CONFIG: ImageProcessingConfig = {
  visionModel: 'qwen2-vl:2b',
  ollamaBaseUrl: DEFAULT_OLLAMA_URL,
  enableVision: true,
  enableOCR: true,
  preferVision: true,
  maxImageSize: 1024,
  descriptionPrompt: 'Describe this image in detail for a document search system. Include any text, diagrams, charts, tables, or visual elements you see. Be specific about what information this image conveys. If there is text, transcribe it accurately.',
  ocrLanguages: ['eng'],
  visionTimeoutMs: 60000, // 60 seconds
  ocrTimeoutMs: 30000, // 30 seconds
};

// =============================================================================
// Image Fallback Manager
// =============================================================================

/**
 * Manages fallback state for image processing
 *
 * When vision models are unavailable, the system falls back to OCR.
 * When both are unavailable, images are skipped.
 */
export class ImageFallbackManager {
  private state: ImageFallbackState;
  private readonly maxFailuresBeforeFallback = 3;
  private readonly recoveryCheckIntervalMs = 30000; // 30 seconds
  private recoveryCheckTimer: NodeJS.Timeout | null = null;
  private onStateChangeCallback?: (state: ImageFallbackState) => void;

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
  getState(): ImageFallbackState {
    return { ...this.state };
  }

  /**
   * Check if fallback mode is active
   */
  isInFallbackMode(): boolean {
    return this.state.isActive;
  }

  /**
   * Record an image processing failure
   */
  recordFailure(error: Error | string, reason: ImageFallbackReason = 'generation_failed'): void {
    const errorMessage = error instanceof Error ? error.message : error;

    this.state.failureCount++;
    this.state.lastError = errorMessage;

    console.warn(`[ImageFallbackManager] Image processing failure #${this.state.failureCount}: ${errorMessage}`);

    // Activate fallback mode after max failures
    if (this.state.failureCount >= this.maxFailuresBeforeFallback && !this.state.isActive) {
      this.activateFallback(reason, errorMessage);
    }
  }

  /**
   * Activate fallback mode
   */
  activateFallback(reason: ImageFallbackReason, errorMessage?: string): void {
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

    console.warn(`[ImageFallbackManager] Fallback mode activated: ${reason} - ${message}`);

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

    console.log('[ImageFallbackManager] Fallback mode deactivated - vision processing recovered');

    this.state = {
      isActive: false,
      failureCount: 0,
      canRecover: true,
    };

    this.stopRecoveryChecks();
    this.onStateChangeCallback?.(this.state);
  }

  /**
   * Record a successful processing operation
   */
  recordSuccess(): void {
    if (this.state.isActive) {
      this.deactivateFallback();
    } else {
      this.state.failureCount = 0;
    }
  }

  /**
   * Attempt recovery from fallback mode
   */
  async attemptRecovery(checkFn: () => Promise<boolean>): Promise<boolean> {
    if (!this.state.isActive || !this.state.canRecover) {
      return false;
    }

    this.state.lastRecoveryAttempt = Date.now();
    console.log('[ImageFallbackManager] Attempting recovery from fallback mode...');

    try {
      const isAvailable = await checkFn();

      if (isAvailable) {
        this.deactivateFallback();
        return true;
      }
    } catch (error) {
      console.warn('[ImageFallbackManager] Recovery attempt failed:', error);
    }

    return false;
  }

  /**
   * Set callback for state changes
   */
  onStateChange(callback: (state: ImageFallbackState) => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Create a notification for the UI
   */
  createNotification(): ImageFallbackNotification | null {
    if (!this.state.isActive) {
      return null;
    }

    const notification: ImageFallbackNotification = {
      type: 'warning',
      title: 'Using OCR for Images',
      message: this.state.message || 'Vision model is unavailable. Using OCR to extract text from images.',
      dismissible: true,
      timestamp: Date.now(),
    };

    if (this.state.reason === 'model_unavailable') {
      notification.action = {
        label: 'Configure Vision Model',
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
  private getFallbackMessage(reason: ImageFallbackReason, errorMessage?: string): string {
    switch (reason) {
      case 'model_unavailable':
        return 'The vision model is not available. Please check that Ollama is running and has the model installed (e.g., ollama pull llava).';
      case 'generation_failed':
        return `Vision model failed${errorMessage ? `: ${errorMessage}` : ''}. Using OCR as fallback.`;
      case 'timeout':
        return 'Vision model request timed out. Using OCR as fallback.';
      case 'ocr_failed':
        return 'Both vision and OCR processing failed. Images will be skipped.';
      default:
        return 'Image processing is temporarily unavailable.';
    }
  }

  /**
   * Check if recovery is possible for a given reason
   */
  private canRecoverFromReason(reason: ImageFallbackReason): boolean {
    switch (reason) {
      case 'ocr_failed':
        // If both vision and OCR failed, recovery is less likely
        return false;
      case 'model_unavailable':
      case 'generation_failed':
      case 'timeout':
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

    // Note: The actual check function will be provided by ImageProcessorService
    this.recoveryCheckTimer = setInterval(() => {
      // Timer is just a placeholder - actual recovery is triggered externally
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

// =============================================================================
// Image Processor Service
// =============================================================================

/**
 * Image Processor Service
 *
 * Handles image understanding for PDF indexing via vision models and OCR.
 */
export class ImageProcessorService {
  private config: ImageProcessingConfig;
  private fallbackManager: ImageFallbackManager;
  private tesseractWorker: Tesseract.Worker | null = null;
  private tesseractInitPromise: Promise<void> | null = null;
  private modelAvailabilityCache: Map<string, { available: boolean; checkedAt: number }>;
  private readonly availabilityCacheTTL = 30000; // 30 seconds

  constructor(config?: Partial<ImageProcessingConfig>) {
    this.config = { ...DEFAULT_IMAGE_CONFIG, ...config };
    this.fallbackManager = new ImageFallbackManager();
    this.modelAvailabilityCache = new Map();

    // Set up periodic recovery checks
    this.setupRecoveryChecks();
  }

  /**
   * Set up periodic recovery checks
   */
  private setupRecoveryChecks(): void {
    setInterval(async () => {
      if (this.fallbackManager.isInFallbackMode()) {
        await this.fallbackManager.attemptRecovery(async () => {
          return this.isVisionModelAvailable();
        });
      }
    }, 30000);
  }

  // ===========================================================================
  // Core Processing Methods
  // ===========================================================================

  /**
   * Process a single image
   *
   * @param imageBase64 - Base64 encoded image data (without data URL prefix)
   * @param imageId - Unique identifier for the image
   * @returns Processing result with description
   */
  async processImage(imageBase64: string, imageId: string): Promise<ImageProcessingResult> {
    const startTime = Date.now();

    // Determine which method to use
    const useVision = this.config.enableVision &&
                      this.config.preferVision &&
                      !this.fallbackManager.isInFallbackMode();

    if (useVision) {
      // Try vision model first
      const visionResult = await this.tryVisionProcessing(imageBase64, imageId, startTime);

      if (visionResult.success) {
        this.fallbackManager.recordSuccess();
        return visionResult;
      }

      // Vision failed, try OCR if enabled
      if (this.config.enableOCR) {
        console.log(`[ImageProcessor] Vision failed for ${imageId}, falling back to OCR`);
        return this.tryOCRProcessing(imageBase64, imageId, startTime);
      }

      return visionResult;
    } else if (this.config.enableOCR) {
      // Use OCR directly
      return this.tryOCRProcessing(imageBase64, imageId, startTime);
    }

    // Neither vision nor OCR enabled
    return {
      imageId,
      description: '',
      method: 'none',
      confidence: 0,
      processingTimeMs: Date.now() - startTime,
      error: 'Image processing is disabled',
      success: false,
    };
  }

  /**
   * Process multiple images
   *
   * @param images - Array of images with base64 data and IDs
   * @returns Array of processing results
   */
  async processImages(
    images: Array<{ base64: string; id: string }>
  ): Promise<ImageProcessingResult[]> {
    const results: ImageProcessingResult[] = [];

    // Process images sequentially to avoid overwhelming the vision model
    for (const image of images) {
      const result = await this.processImage(image.base64, image.id);
      results.push(result);
    }

    return results;
  }

  // ===========================================================================
  // Vision Model Methods
  // ===========================================================================

  /**
   * Try processing with vision model
   */
  private async tryVisionProcessing(
    imageBase64: string,
    imageId: string,
    startTime: number
  ): Promise<ImageProcessingResult> {
    try {
      // Check if vision model is available
      const isAvailable = await this.isVisionModelAvailable();

      if (!isAvailable) {
        this.fallbackManager.recordFailure(
          'Vision model not available',
          'model_unavailable'
        );
        return {
          imageId,
          description: '',
          method: 'vision',
          confidence: 0,
          processingTimeMs: Date.now() - startTime,
          error: 'Vision model not available',
          success: false,
        };
      }

      // Generate description
      const description = await this.describeImageWithVision(imageBase64);

      return {
        imageId,
        description,
        method: 'vision',
        confidence: 0.9, // Vision models generally produce high-quality descriptions
        processingTimeMs: Date.now() - startTime,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Vision processing failed';

      // Determine failure reason
      let reason: ImageFallbackReason = 'generation_failed';
      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        reason = 'timeout';
      } else if (errorMessage.includes('not available') || errorMessage.includes('not running')) {
        reason = 'model_unavailable';
      }

      this.fallbackManager.recordFailure(error, reason);

      return {
        imageId,
        description: '',
        method: 'vision',
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
        error: errorMessage,
        success: false,
      };
    }
  }

  /**
   * Generate image description using Ollama vision model
   */
  private async describeImageWithVision(imageBase64: string): Promise<string> {
    const ollamaModelName = VISION_MODEL_MAP[this.config.visionModel];

    if (!ollamaModelName) {
      throw new Error(`Unknown vision model: ${this.config.visionModel}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.visionTimeoutMs);

    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ollamaModelName,
          messages: [{
            role: 'user',
            content: this.config.descriptionPrompt,
            images: [imageBase64], // Ollama expects base64 without data URL prefix
          }],
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.message?.content) {
        throw new Error('Invalid response from vision model');
      }

      return data.message.content.trim();
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Vision model request timed out');
      }
      throw error;
    }
  }

  /**
   * Check if a vision model is available
   */
  async isVisionModelAvailable(modelId?: string): Promise<boolean> {
    const targetModelId = modelId || this.config.visionModel;

    // Check cache first
    const cached = this.modelAvailabilityCache.get(targetModelId);
    if (cached && Date.now() - cached.checkedAt < this.availabilityCacheTTL) {
      return cached.available;
    }

    const ollamaModelName = VISION_MODEL_MAP[targetModelId];
    if (!ollamaModelName) {
      return false;
    }

    let available = false;

    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      const models = data.models || [];

      // Check if the model is installed
      available = models.some((m: { name: string }) =>
        m.name === ollamaModelName || m.name.startsWith(`${ollamaModelName}:`)
      );
    } catch (error) {
      // Ollama not running or network error
      available = false;
    }

    // Cache the result
    this.modelAvailabilityCache.set(targetModelId, {
      available,
      checkedAt: Date.now(),
    });

    return available;
  }

  // ===========================================================================
  // OCR Methods
  // ===========================================================================

  /**
   * Try processing with OCR
   */
  private async tryOCRProcessing(
    imageBase64: string,
    imageId: string,
    startTime: number
  ): Promise<ImageProcessingResult> {
    try {
      const extractedText = await this.extractTextWithOCR(imageBase64);

      if (!extractedText || extractedText.trim().length === 0) {
        return {
          imageId,
          description: '',
          method: 'ocr',
          confidence: 0,
          extractedText: '',
          processingTimeMs: Date.now() - startTime,
          error: 'No text found in image',
          success: false,
        };
      }

      // Create a description from the extracted text
      const description = `[Image containing text]\n${extractedText.trim()}`;

      return {
        imageId,
        description,
        method: 'ocr',
        confidence: 0.7, // OCR confidence is generally lower than vision
        extractedText: extractedText.trim(),
        processingTimeMs: Date.now() - startTime,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'OCR processing failed';

      return {
        imageId,
        description: '',
        method: 'ocr',
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
        error: errorMessage,
        success: false,
      };
    }
  }

  /**
   * Extract text from image using Tesseract.js
   */
  async extractTextWithOCR(imageBase64: string): Promise<string> {
    await this.initTesseract();

    if (!this.tesseractWorker) {
      throw new Error('Tesseract worker not initialized');
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(imageBase64, 'base64');

    const result = await this.tesseractWorker.recognize(buffer);

    return result.data.text;
  }

  /**
   * Initialize Tesseract worker
   */
  private async initTesseract(): Promise<void> {
    if (this.tesseractWorker) {
      return;
    }

    if (this.tesseractInitPromise) {
      await this.tesseractInitPromise;
      return;
    }

    this.tesseractInitPromise = (async () => {
      console.log('[ImageProcessor] Initializing Tesseract worker...');

      this.tesseractWorker = await Tesseract.createWorker(
        this.config.ocrLanguages,
        1, // OEM.LSTM_ONLY
        {
          // Use CDN for language data
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        }
      );

      console.log('[ImageProcessor] Tesseract worker initialized');
    })();

    await this.tesseractInitPromise;
  }

  // ===========================================================================
  // Configuration Methods
  // ===========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ImageProcessingConfig>): void {
    this.config = { ...this.config, ...config };

    // Clear availability cache when config changes
    if (config.ollamaBaseUrl || config.visionModel) {
      this.modelAvailabilityCache.clear();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ImageProcessingConfig {
    return { ...this.config };
  }

  /**
   * Set the Ollama base URL
   */
  setOllamaBaseUrl(url: string): void {
    this.config.ollamaBaseUrl = url;
    this.modelAvailabilityCache.clear();
  }

  /**
   * Get the Ollama base URL
   */
  getOllamaBaseUrl(): string {
    return this.config.ollamaBaseUrl;
  }

  // ===========================================================================
  // Fallback Management
  // ===========================================================================

  /**
   * Get the fallback manager
   */
  getFallbackManager(): ImageFallbackManager {
    return this.fallbackManager;
  }

  /**
   * Get current fallback state
   */
  getFallbackState(): ImageFallbackState {
    return this.fallbackManager.getState();
  }

  /**
   * Check if in fallback mode
   */
  isInFallbackMode(): boolean {
    return this.fallbackManager.isInFallbackMode();
  }

  /**
   * Attempt recovery from fallback mode
   */
  async attemptRecovery(): Promise<boolean> {
    return this.fallbackManager.attemptRecovery(async () => {
      return this.isVisionModelAvailable();
    });
  }

  // ===========================================================================
  // Model Information
  // ===========================================================================

  /**
   * Get list of available vision models with status
   */
  async getAvailableModels(): Promise<VisionModelInfo[]> {
    const models: VisionModelInfo[] = [];

    for (const model of VISION_MODELS) {
      const isAvailable = await this.isVisionModelAvailable(model.id);
      models.push({
        ...model,
        isAvailable,
      });
    }

    return models;
  }

  /**
   * Get vision model info by ID
   */
  getModelInfo(modelId: string): VisionModelInfo | undefined {
    return VISION_MODELS.find(m => m.id === modelId);
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Dispose of resources
   */
  async dispose(): Promise<void> {
    this.fallbackManager.dispose();

    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }
}

// =============================================================================
// Singleton Instances
// =============================================================================

/**
 * Singleton instance of the image processor service using global registry
 */
export const imageProcessorService = (() => {
  const globalKey = Symbol.for('zura.imageProcessorService');
  const globalRegistry = global as any;

  if (!globalRegistry[globalKey]) {
    globalRegistry[globalKey] = new ImageProcessorService();
  }

  return globalRegistry[globalKey] as ImageProcessorService;
})();

/**
 * Singleton instance of the image fallback manager
 */
export const imageFallbackManager = imageProcessorService.getFallbackManager();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Process an image with fallback support
 *
 * Convenience function that handles all the fallback logic automatically.
 */
export async function processImageWithFallback(
  imageBase64: string,
  imageId: string
): Promise<ImageProcessingResult> {
  return imageProcessorService.processImage(imageBase64, imageId);
}

/**
 * Check if image processing is available
 */
export async function checkImageProcessingAvailability(): Promise<{
  visionAvailable: boolean;
  ocrAvailable: boolean;
  anyAvailable: boolean;
}> {
  const config = imageProcessorService.getConfig();

  const visionAvailable = config.enableVision &&
    await imageProcessorService.isVisionModelAvailable();

  // OCR is always available if enabled (Tesseract.js runs locally)
  const ocrAvailable = config.enableOCR;

  return {
    visionAvailable,
    ocrAvailable,
    anyAvailable: visionAvailable || ocrAvailable,
  };
}
