/**
 * PDF Chat Instructions
 *
 * System prompts and instructions for PDF-aware AI chat.
 * These prompts help the AI model understand it has access to PDF content
 * and should respond with grounded, citation-backed answers.
 */

export interface PDFChatContext {
  /** Names of loaded documents */
  documentNames: string[];
  /** Total page count across all documents */
  pageCount: number;
  /** Current page user is viewing (if applicable) */
  currentPage?: number;
  /** Whether multiple documents are loaded */
  hasMultipleDocuments: boolean;
  /** Retrieved context from RAG system */
  retrievedContext: string;
  /** Whether grounded mode is enabled */
  groundedMode: boolean;
}

/**
 * Generate system prompt for PDF chat
 *
 * This creates a comprehensive system message that:
 * - Informs the AI it has access to PDF documents
 * - Explains citation format and usage
 * - Sets expectations for grounded responses
 * - Provides document metadata for context
 *
 * @param context - PDF chat context information
 * @returns System prompt string
 */
export function generatePDFSystemPrompt(context: PDFChatContext): string {
  const { documentNames, pageCount, currentPage, hasMultipleDocuments, retrievedContext, groundedMode } = context;

  const docList = documentNames.length > 0
    ? documentNames.join(', ')
    : 'PDF document';

  const docPlural = hasMultipleDocuments ? 'documents' : 'document';

  // Base instructions
  let prompt = `You are a helpful AI assistant analyzing ${docPlural} for the user.

📄 **Currently Loaded**: ${docList}
📊 **Total Pages**: ${pageCount}`;

  if (currentPage) {
    prompt += `\n👁️ **Current Page**: ${context.currentPage}`;
  }

  prompt += `\n\n`;

  // Grounded mode instructions
  if (groundedMode) {
    prompt += `⚠️ **GROUNDED MODE ACTIVE** - You MUST follow these strict rules:

1. **ONLY use information from the excerpts provided below**
2. **NEVER add information from your training data** - if it's not in the excerpts, don't mention it
3. **If information is missing**, explicitly state: "I don't see that information in the provided content"
4. **No speculation** - stick strictly to what's written in the excerpts

`;
  }

  // Citation instructions
  prompt += `📝 **Citation Format**:
- Citations are marked as [[cite:id:pN]] where N is the page number
- **Include these citation markers in your response** to show which page information came from
- Example: "The study found that... [[cite:abc123:p5]]"

📋 **How to Answer**:
1. Read the retrieved excerpts carefully
2. Answer based ONLY on the provided content
3. Include [[cite:id:pN]] markers next to facts from the document
4. If asked about the "document" or "PDF", understand the user means: ${docList}
5. Reference specific pages when making claims (e.g., "On page 5, ...")
6. For tables/figures, describe them based on extracted content only`;

  if (!groundedMode) {
    prompt += `\n7. You may use general knowledge to provide context, but clearly distinguish between what's in the document vs. general knowledge`;
  }

  prompt += `\n\n📚 **Retrieved Content from ${docPlural.charAt(0).toUpperCase() + docPlural.slice(1)}**:\n`;
  prompt += `---\n`;
  prompt += retrievedContext || '(No relevant content found for this query)';
  prompt += `\n---\n\n`;

  prompt += `Now answer the user's question using the above content${groundedMode ? ' ONLY' : ''}.`;

  return prompt;
}

/**
 * Generate a brief system prompt for non-PDF mode fallback
 * Used when RAG system is unavailable
 *
 * @param documentNames - Names of loaded documents
 * @returns Fallback system prompt
 */
export function generateFallbackPrompt(documentNames: string[]): string {
  const docList = documentNames.length > 0
    ? documentNames.join(', ')
    : 'PDF document';

  return `You are helping a user with their PDF document(s): ${docList}.

NOTE: PDF analysis features are currently unavailable. Answer based on your general knowledge, but inform the user that you cannot access the actual document content at this time.`;
}

/**
 * Generate query expansion hints for improved retrieval
 *
 * Adds context to short queries to improve RAG retrieval accuracy
 *
 * @param query - User's original query
 * @param documentContext - Optional context from previous messages
 * @returns Expanded query for better retrieval
 */
export function expandQueryForRetrieval(
  query: string,
  documentContext?: string
): string {
  // If query is very short, add document context
  if (query.split(/\s+/).length < 5 && documentContext) {
    return `${query} (in context of: ${documentContext})`;
  }

  return query;
}

/**
 * Build user-friendly error messages for PDF chat failures
 *
 * @param errorType - Type of error encountered
 * @param details - Additional error details
 * @returns User-friendly error message
 */
export function buildPDFChatErrorMessage(
  errorType: 'no_content' | 'indexing_required' | 'retrieval_failed' | 'no_documents',
  details?: string
): string {
  switch (errorType) {
    case 'no_content':
      return `I couldn't find relevant content in the document to answer your question. Try rephrasing or asking about a different topic covered in the PDF.`;

    case 'indexing_required':
      return `This document hasn't been indexed yet. Please wait for indexing to complete before asking questions. ${details || ''}`;

    case 'retrieval_failed':
      return `I encountered an error retrieving information from the document. ${details || 'Please try again.'}`;

    case 'no_documents':
      return `No documents are currently loaded. Please open a PDF document first.`;

    default:
      return `An unexpected error occurred: ${details || 'Unknown error'}`;
  }
}
