/**
 * PDF Core IPC Handlers
 * 
 * This module provides lightweight PDF loading and viewing handlers that
 * don't depend on LanceDB or other native modules. These handlers work
 * in all environments including dev mode.
 * 
 * For full PDF RAG features (indexing, querying, etc.), see pdfHandlers.ts
 * which requires native modules that may not be available in all environments.
 */

import { ipcMain } from 'electron';
import * as fs from 'fs';
import { pdfParserService } from '../pdf/pdfParser';

// Track registered handlers for cleanup
const registeredChannels: string[] = [];

/**
 * Register core PDF IPC handlers
 * These handlers only use pdf.js and don't require LanceDB
 */
export function registerPDFCoreHandlers(): void {
  // PDF Loading & Parsing (no LanceDB needed)
  
  // pdf:load - Load a PDF document
  ipcMain.handle('pdf:load', async (_event, filePath: string, password?: string) => {
    try {
      const doc = await pdfParserService.loadDocument(filePath, password);
      return doc;
    } catch (error) {
      throw new Error(`Failed to load PDF: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  registeredChannels.push('pdf:load');

  // pdf:get-file-data - Read PDF file bytes for renderer display
  // Accepts either a file path or a document ID (will look up the file path)
  ipcMain.handle('pdf:get-file-data', async (_event, docIdOrPath: string) => {
    if (!docIdOrPath || typeof docIdOrPath !== 'string') {
      throw new Error('Invalid file path or document ID');
    }

    // Check if this is a document ID (starts with 'doc_') or a file path
    let filePath = docIdOrPath;

    // If it looks like a doc ID, try to look up the actual file path
    if (docIdOrPath.startsWith('doc_')) {
      const loadedDoc = pdfParserService.getLoadedDocument(docIdOrPath);
      if (loadedDoc) {
        filePath = loadedDoc.document.filePath;
      } else {
        throw new Error(`Document not loaded: ${docIdOrPath}`);
      }
    }

    const data = await fs.promises.readFile(filePath);
    return { data, byteLength: data.byteLength };
  });
  registeredChannels.push('pdf:get-file-data');

  // pdf:get-page - Get a specific page from a loaded document
  ipcMain.handle('pdf:get-page', async (_event, docId: string, pageNum: number) => {
    try {
      const page = await pdfParserService.getPage(docId, pageNum);
      return page;
    } catch (error) {
      throw new Error(`Failed to get page: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  registeredChannels.push('pdf:get-page');

  // pdf:search-text - Search text within a document
  ipcMain.handle('pdf:search-text', async (_event, docId: string, query: string) => {
    try {
      const results = await pdfParserService.searchText(docId, query);
      return results;
    } catch (error) {
      throw new Error(`Failed to search text: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  registeredChannels.push('pdf:search-text');

  // pdf:get-outline - Get document outline/table of contents
  ipcMain.handle('pdf:get-outline', async (_event, docId: string) => {
    try {
      const outline = await pdfParserService.getDocumentOutline(docId);
      return outline;
    } catch (error) {
      throw new Error(`Failed to get outline: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  registeredChannels.push('pdf:get-outline');

  // pdf:get-major-sections - Get major sections from the document
  ipcMain.handle('pdf:get-major-sections', async (_event, docId: string) => {
    try {
      const sections = await pdfParserService.getMajorSections(docId);
      return sections;
    } catch (error) {
      throw new Error(`Failed to get major sections: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  registeredChannels.push('pdf:get-major-sections');

  // pdf:unload - Unload a document from memory
  ipcMain.handle('pdf:unload', async (_event, docId: string) => {
    try {
      await pdfParserService.unloadDocument(docId);
      return { success: true };
    } catch (error) {
      // Don't throw on unload errors, just log
      console.warn(`[PDFCoreHandlers] Failed to unload document ${docId}:`, error);
      return { success: false };
    }
  });
  registeredChannels.push('pdf:unload');

  // =============================================================================
  // Image Processing Handlers
  // =============================================================================

  // Lazy load image processor to avoid loading Tesseract unless needed
  let imageProcessorModule: typeof import('../pdf/imageProcessor') | null = null;

  const getImageProcessor = async () => {
    if (!imageProcessorModule) {
      imageProcessorModule = await import('../pdf/imageProcessor');
    }
    return imageProcessorModule;
  };

  // pdf:check-vision-availability - Check if vision model is available
  ipcMain.handle('pdf:check-vision-availability', async (_event, modelId?: string) => {
    try {
      const { imageProcessorService } = await getImageProcessor();
      return await imageProcessorService.isVisionModelAvailable(modelId);
    } catch (error) {
      console.error('[PDFCoreHandlers] Error checking vision availability:', error);
      return false;
    }
  });
  registeredChannels.push('pdf:check-vision-availability');

  // pdf:get-vision-models - Get list of available vision models with status
  ipcMain.handle('pdf:get-vision-models', async () => {
    try {
      const { imageProcessorService } = await getImageProcessor();
      return await imageProcessorService.getAvailableModels();
    } catch (error) {
      console.error('[PDFCoreHandlers] Error getting vision models:', error);
      return [];
    }
  });
  registeredChannels.push('pdf:get-vision-models');

  // pdf:get-image-fallback-state - Get current image processing fallback state
  ipcMain.handle('pdf:get-image-fallback-state', async () => {
    try {
      const { imageProcessorService } = await getImageProcessor();
      return imageProcessorService.getFallbackState();
    } catch (error) {
      console.error('[PDFCoreHandlers] Error getting fallback state:', error);
      return {
        isActive: false,
        failureCount: 0,
        canRecover: true,
      };
    }
  });
  registeredChannels.push('pdf:get-image-fallback-state');

  // pdf:attempt-image-recovery - Attempt to recover from fallback mode
  ipcMain.handle('pdf:attempt-image-recovery', async () => {
    try {
      const { imageProcessorService } = await getImageProcessor();
      return await imageProcessorService.attemptRecovery();
    } catch (error) {
      console.error('[PDFCoreHandlers] Error attempting recovery:', error);
      return false;
    }
  });
  registeredChannels.push('pdf:attempt-image-recovery');

  // pdf:update-image-config - Update image processing configuration
  ipcMain.handle('pdf:update-image-config', async (_event, config: any) => {
    try {
      const { imageProcessorService } = await getImageProcessor();
      imageProcessorService.updateConfig(config);
      return imageProcessorService.getConfig();
    } catch (error) {
      console.error('[PDFCoreHandlers] Error updating image config:', error);
      throw error;
    }
  });
  registeredChannels.push('pdf:update-image-config');

  console.log('[IPC] PDF core handlers registered successfully (no LanceDB required)');
}

/**
 * Unregister core PDF IPC handlers
 */
export function unregisterPDFCoreHandlers(): void {
  for (const channel of registeredChannels) {
    ipcMain.removeHandler(channel);
  }
  registeredChannels.length = 0;
  console.log('[IPC] PDF core handlers unregistered');
}
