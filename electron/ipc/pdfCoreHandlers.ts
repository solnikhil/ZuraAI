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
import { PDFParserService } from '../pdf/pdfParser';

// Singleton instance of PDF parser service
const pdfParserService = new PDFParserService();

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
  ipcMain.handle('pdf:get-file-data', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
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
