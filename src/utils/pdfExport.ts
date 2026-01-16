/**
 * PDF Chat Export Utilities
 * 
 * Provides functionality to export PDF chat responses with citations
 * in markdown format, including a references section.
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4
 */

import type { 
  Citation, 
  PDFChatMessage, 
  RetrievalResult,
  ExportOptions,
  ExportResult 
} from '../types/pdf';

/**
 * Default export options
 */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'markdown',
  includeCitations: true,
  includeSources: true,
  includeMetadata: true,
};

/**
 * Reference entry for the references section
 */
interface ReferenceEntry {
  /** Reference number (1-indexed) */
  number: number;
  /** Document name */
  documentName: string;
  /** Page number */
  pageNumber: number;
  /** Quoted text from the source */
  quotedText: string;
  /** Chunk ID for reference */
  chunkId: string;
}

/**
 * Parse citation markers from response text and extract citation numbers
 * Returns the text with citation markers and a map of citation numbers to citations
 */
function extractCitationNumbers(text: string): number[] {
  const citationPattern = /\[(\d+)\]/g;
  const numbers: number[] = [];
  let match;
  
  while ((match = citationPattern.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
  }
  
  return numbers.sort((a, b) => a - b);
}

/**
 * Format a single citation for markdown display
 * Converts [1] style citations to [Document, p.X] format with links
 */
function formatCitationForMarkdown(
  citation: Citation,
  referenceNumber: number
): string {
  return `[${referenceNumber}]`;
}

/**
 * Generate the references section in markdown format
 * Requirements: 14.3, 14.4
 */
function generateReferencesSection(references: ReferenceEntry[]): string {
  if (references.length === 0) {
    return '';
  }

  const lines: string[] = [
    '',
    '---',
    '',
    '## References',
    '',
  ];

  for (const ref of references) {
    // Format: [1] Document Name, Page X
    //         "Quoted text from the source..."
    lines.push(`**[${ref.number}]** ${ref.documentName}, Page ${ref.pageNumber}`);
    
    if (ref.quotedText) {
      // Truncate long quotes and add ellipsis
      const maxQuoteLength = 200;
      const truncatedQuote = ref.quotedText.length > maxQuoteLength
        ? ref.quotedText.slice(0, maxQuoteLength).trim() + '...'
        : ref.quotedText;
      lines.push(`> "${truncatedQuote}"`);
    }
    
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build reference entries from citations
 */
function buildReferenceEntries(citations: Citation[]): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < citations.length; i++) {
    const citation = citations[i];
    const key = `${citation.chunkId}-${citation.pageNumber}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({
        number: i + 1,
        documentName: citation.documentName || 'Document',
        pageNumber: citation.pageNumber,
        quotedText: citation.quotedText || '',
        chunkId: citation.chunkId,
      });
    }
  }

  return entries;
}

/**
 * Export a single PDF chat message to markdown format
 * Requirements: 14.1, 14.2, 14.3
 * 
 * @param message - The message to export
 * @param options - Export options
 * @returns Markdown formatted string
 */
export function exportMessageToMarkdown(
  message: PDFChatMessage,
  options: Partial<ExportOptions> = {}
): string {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const lines: string[] = [];

  // Add metadata header if requested
  if (opts.includeMetadata) {
    const date = new Date(message.timestamp);
    lines.push(`<!-- Exported from Zura AI PDF Chat -->`);
    lines.push(`<!-- Date: ${date.toISOString()} -->`);
    lines.push('');
  }

  // Add role indicator
  if (message.role === 'user') {
    lines.push('**Question:**');
    lines.push('');
    lines.push(message.content);
    
    // Include attached selection if present
    if (message.attachedSelection) {
      lines.push('');
      lines.push(`*Selected text from page ${message.attachedSelection.pageNumber}:*`);
      lines.push(`> "${message.attachedSelection.text}"`);
    }
  } else {
    lines.push('**Answer:**');
    lines.push('');
    lines.push(message.content);
  }

  // Add references section for assistant messages with citations
  if (
    message.role === 'assistant' && 
    opts.includeCitations && 
    message.citations && 
    message.citations.length > 0
  ) {
    const references = buildReferenceEntries(message.citations);
    lines.push(generateReferencesSection(references));
  }

  // Add sources section if requested
  if (
    message.role === 'assistant' && 
    opts.includeSources && 
    message.sources && 
    message.sources.length > 0
  ) {
    lines.push('');
    lines.push('### Sources Used');
    lines.push('');
    
    for (const source of message.sources) {
      const pages = source.chunk.metadata.pageNumbers.join(', ');
      const score = Math.round(source.score * 100);
      lines.push(`- **Pages ${pages}** (${score}% relevance)`);
      
      // Add a brief excerpt
      const excerpt = source.chunk.content.slice(0, 150).trim();
      if (excerpt) {
        lines.push(`  > ${excerpt}...`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Export a conversation (question + answer pair) to markdown
 * Requirements: 14.1, 14.2, 14.3, 14.4
 * 
 * @param userMessage - The user's question
 * @param assistantMessage - The assistant's response
 * @param options - Export options
 * @returns Markdown formatted string
 */
export function exportConversationToMarkdown(
  userMessage: PDFChatMessage | null,
  assistantMessage: PDFChatMessage,
  options: Partial<ExportOptions> = {}
): string {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const lines: string[] = [];

  // Add header
  if (opts.includeMetadata) {
    const date = new Date(assistantMessage.timestamp);
    lines.push('# PDF Chat Export');
    lines.push('');
    lines.push(`*Exported from Zura AI on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}*`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Add user question if provided
  if (userMessage) {
    lines.push('## Question');
    lines.push('');
    lines.push(userMessage.content);
    
    if (userMessage.attachedSelection) {
      lines.push('');
      lines.push(`*Context from page ${userMessage.attachedSelection.pageNumber}:*`);
      lines.push(`> "${userMessage.attachedSelection.text}"`);
    }
    
    lines.push('');
  }

  // Add assistant response
  lines.push('## Answer');
  lines.push('');
  lines.push(assistantMessage.content);

  // Add references section
  if (
    opts.includeCitations && 
    assistantMessage.citations && 
    assistantMessage.citations.length > 0
  ) {
    const references = buildReferenceEntries(assistantMessage.citations);
    lines.push(generateReferencesSection(references));
  }

  return lines.join('\n');
}

/**
 * Export multiple messages to a brief document
 * Requirements: 14.5
 * 
 * @param messages - Array of messages to export
 * @param title - Document title
 * @param options - Export options
 * @returns Markdown formatted string
 */
export function exportBriefToMarkdown(
  messages: PDFChatMessage[],
  title: string = 'PDF Chat Brief',
  options: Partial<ExportOptions> = {}
): string {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const lines: string[] = [];
  
  // Document header
  lines.push(`# ${title}`);
  lines.push('');
  
  if (opts.includeMetadata) {
    const date = new Date();
    lines.push(`*Generated by Zura AI on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}*`);
    lines.push('');
  }
  
  lines.push('---');
  lines.push('');

  // Collect all citations for consolidated references
  const allCitations: Citation[] = [];
  const citationMap = new Map<string, number>(); // chunkId -> reference number
  let refCounter = 1;

  // First pass: collect all unique citations
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.citations) {
      for (const citation of msg.citations) {
        const key = `${citation.chunkId}-${citation.pageNumber}`;
        if (!citationMap.has(key)) {
          citationMap.set(key, refCounter++);
          allCitations.push(citation);
        }
      }
    }
  }

  // Group messages into Q&A pairs
  let questionNumber = 1;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    if (msg.role === 'user') {
      lines.push(`## ${questionNumber}. ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
      lines.push('');
      
      if (msg.attachedSelection) {
        lines.push(`*Context from page ${msg.attachedSelection.pageNumber}*`);
        lines.push('');
      }
      
      // Look for the next assistant message
      const nextMsg = messages[i + 1];
      if (nextMsg && nextMsg.role === 'assistant') {
        lines.push(nextMsg.content);
        lines.push('');
        i++; // Skip the assistant message in the next iteration
      }
      
      lines.push('---');
      lines.push('');
      questionNumber++;
    }
  }

  // Add consolidated references section
  if (opts.includeCitations && allCitations.length > 0) {
    const references = buildReferenceEntries(allCitations);
    lines.push(generateReferencesSection(references));
  }

  return lines.join('\n');
}

/**
 * Copy text to clipboard
 * Requirements: 14.4
 * 
 * @param text - Text to copy
 * @returns Promise that resolves when copy is complete
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('[pdfExport] Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Download text as a file
 * Requirements: 14.4
 * 
 * @param content - Content to download
 * @param filename - Name of the file
 * @param mimeType - MIME type of the file
 */
export function downloadAsFile(
  content: string,
  filename: string,
  mimeType: string = 'text/markdown'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
}

/**
 * Generate a filename for export
 * 
 * @param prefix - Filename prefix
 * @param extension - File extension
 * @returns Generated filename
 */
export function generateExportFilename(
  prefix: string = 'pdf-chat-export',
  extension: string = 'md'
): string {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
  return `${prefix}-${dateStr}-${timeStr}.${extension}`;
}

/**
 * Export response with full options
 * Requirements: 14.1, 14.2, 14.3, 14.4
 * 
 * @param message - The assistant message to export
 * @param userMessage - Optional user message for context
 * @param options - Export options
 * @returns Export result
 */
export function exportResponse(
  message: PDFChatMessage,
  userMessage?: PDFChatMessage | null,
  options: Partial<ExportOptions> = {}
): ExportResult {
  try {
    const content = exportConversationToMarkdown(
      userMessage || null,
      message,
      options
    );
    
    return {
      success: true,
      content,
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : 'Export failed',
    };
  }
}

/**
 * Export and copy to clipboard
 * Requirements: 14.4
 * 
 * @param message - The assistant message to export
 * @param userMessage - Optional user message for context
 * @param options - Export options
 * @returns Promise with export result
 */
export async function exportAndCopy(
  message: PDFChatMessage,
  userMessage?: PDFChatMessage | null,
  options: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  const result = exportResponse(message, userMessage, options);
  
  if (result.success) {
    const copied = await copyToClipboard(result.content);
    if (!copied) {
      return {
        ...result,
        success: false,
        error: 'Failed to copy to clipboard',
      };
    }
  }
  
  return result;
}

/**
 * Export and download as file
 * Requirements: 14.4
 * 
 * @param message - The assistant message to export
 * @param userMessage - Optional user message for context
 * @param options - Export options
 * @returns Export result
 */
export function exportAndDownload(
  message: PDFChatMessage,
  userMessage?: PDFChatMessage | null,
  options: Partial<ExportOptions> = {}
): ExportResult {
  const result = exportResponse(message, userMessage, options);
  
  if (result.success) {
    const filename = generateExportFilename('pdf-chat-response', 'md');
    downloadAsFile(result.content, filename);
    result.filePath = filename;
  }
  
  return result;
}
