# PDF Chat Fixes Required

## Issue 1: Document Summarization Returns Empty Content

### Problem
When users click "Generate a section-by-section summary", they get:
```
No content available for this section
```

### Root Cause
The `ragEngine.generateDocumentSummary()` method at `electron/pdf/ragEngine.ts:1406` returns section summaries with empty `content` fields. The comment says "To be filled by AI provider" but there's no AI provider integration.

### Fix Required
The RAG engine needs to be enhanced to actually generate summaries using the AI model. Here's what needs to be added:

**File**: `electron/pdf/ragEngine.ts`

**Changes needed**:
1. Add a method to generate actual summary content using the AI provider
2. Integrate with the settings to get the configured AI model
3. Generate summaries for each section using the retrieved context

### Implementation Approach

Add this method to the `RAGEngine` class around line 1392:

```typescript
/**
 * Generate AI summary for a section using retrieved context
 */
private async generateAISummary(
  sectionSummary: SectionSummary,
  settings: PDFRAGSettings
): Promise<string> {
  // Build prompt for summarization
  const prompt = `Based on the following content from "${sectionSummary.sectionTitle}" (pages ${sectionSummary.startPage}-${sectionSummary.endPage}), generate a concise summary:

${sectionSummary.contextString}

Provide a clear, structured summary that captures the key points.`;

  // Here you would call the AI service based on settings.modelProvider
  // This requires access to the AI generation services from the renderer
  // For now, return the context string as a fallback
  return sectionSummary.contextString || `No content available for section: ${sectionSummary.sectionTitle}`;
}
```

Then update line 1462 in the `generateDocumentSummary` method:

```typescript
// Change from:
const summary = await this.summarizeSection(docId, section);

// To:
const summary = await this.summarizeSection(docId, section);
// Generate actual AI summary content
summary.content = await this.generateAISummary(summary, this.settings);
```

**Better Solution**: Since AI generation happens in the renderer process (due to API keys being stored there), the summarization should be handled differently:

1. Return the context and structure from the main process
2. Let the renderer generate the actual summaries using `PDFChatArea`'s AI integration
3. Update the display logic to handle this flow

---

## Issue 2: Model Doesn't Recognize PDF Context

### Problem
When asking questions about a PDF, the AI model doesn't know it has access to PDF content. Users need to explicitly mention "in the PDF" for the model to understand context.

### Root Cause
The custom system instructions for PDF chat are **not being injected** into the AI model's context when processing queries.

### Current Flow
1. User asks: "What is this about?"
2. System retrieves relevant chunks from PDF ✓
3. System builds context with citations ✓
4. **Missing**: System should add PDF-aware instructions
5. AI generates response without knowing it's answering from a PDF ✗

### Fix Required

Add PDF-specific system instructions that:
- Tell the model it has access to PDF document(s)
- Explain how to use citations
- Set expectations for grounded responses
- Provide document metadata (filename, page count, etc.)

### Implementation Locations

#### Location 1: `src/components/PDFChat/PDFChatArea.tsx` (lines 1517-1526)

Currently, when building the prompt for AI, it just sends the retrieval context. We need to add system instructions.

**Change needed** around line 1554:

```typescript
// Current code just returns fallback
const fallbackContent = await generateFallbackResponse(userMessage.content);

// Should be changed to include PDF context:
const ragResponse = await window.ipcRenderer?.invoke('pdf:query',
  userMessage.content,
  documentIds,
  { groundedMode }
);

if (ragResponse) {
  // Build messages with PDF context
  const messagesWithContext = buildPDFAwareMessages(
    userMessage.content,
    ragResponse,
    loadedDocuments
  );

  // Then pass to AI provider
  const aiResponse = await generateWithPDFContext(messagesWithContext);
}
```

#### Location 2: Create Helper Function

Add a new helper function in `PDFChatArea.tsx` around line 1400:

```typescript
/**
 * Build AI messages with PDF context awareness
 */
function buildPDFAwareMessages(
  userQuery: string,
  ragResponse: RAGResponse,
  loadedDocuments: Map<string, DocumentInfo>
): ChatMessage[] {
  // Build document context string
  const docNames = Array.from(loadedDocuments.values())
    .map(doc => doc.name)
    .join(', ');

  // Create system message with PDF instructions
  const systemMessage = {
    role: 'system',
    content: `You are an AI assistant helping users understand PDF documents.

Currently open document(s): ${docNames}

You have access to relevant excerpts from these documents with page citations in the format [[cite:id:pN]].

When answering:
1. Use ONLY information from the provided excerpts
2. Include citation markers [[cite:id:pN]] in your response where appropriate
3. If information is not in the excerpts, say "I don't see that information in the provided content"
4. Be concise and direct
5. Always reference specific pages when making claims

Retrieved Context:
${ragResponse.contextString || '(No relevant content found)'}
`
  };

  return [
    systemMessage,
    { role: 'user', content: userQuery }
  ];
}
```

#### Location 3: Update the Query Handler

In `electron/ipc/pdfHandlers.ts` around line 501, when handling `pdf:query`, we should include document metadata:

```typescript
ipcMain.handle('pdf:query', async (
  _event,
  query: string,
  docIds: string[],
  options?: QueryOptions,
  conversationContext?: any
): Promise<RAGResponse> => {
  // ... existing code ...

  const response = await ragEngine.query(query, docIds, options, context);

  // Enhance response with document metadata
  response.documentMetadata = await getDocumentMetadata(docIds);

  return response;
});

async function getDocumentMetadata(docIds: string[]) {
  const metadata = [];
  for (const docId of docIds) {
    const doc = pdfParserService.getLoadedDocument(docId);
    if (doc) {
      metadata.push({
        id: docId,
        fileName: doc.document.fileName,
        pageCount: doc.document.pageCount,
        title: doc.document.metadata?.title
      });
    }
  }
  return metadata;
}
```

---

## Custom Instructions for PDF Chat

Create a new file `electron/pdf/pdfChatInstructions.ts`:

```typescript
export interface PDFChatContext {
  documentNames: string[];
  pageCount: number;
  currentPage?: number;
  hasMultipleDocuments: boolean;
}

export function generatePDFSystemPrompt(context: PDFChatContext): string {
  const docList = context.documentNames.join(', ');
  const docPlural = context.hasMultipleDocuments ? 'documents' : 'document';

  return `You are a PDF document assistant helping users understand their ${docPlural}.

Currently loaded: ${docList}
Total pages: ${context.pageCount}${context.currentPage ? `\nCurrent page: ${context.currentPage}` : ''}

You have access to relevant excerpts from ${context.hasMultipleDocuments ? 'these documents' : 'this document'}.

IMPORTANT INSTRUCTIONS:
1. **Only use information from the provided excerpts below**
2. **Include citation markers** in format [[cite:id:pN]] where N is the page number
3. **If information is not in the excerpts**, clearly state: "I don't see that information in the provided content"
4. **Reference specific pages** when making claims (e.g., "On page 5, ...")
5. **Be concise and accurate** - don't elaborate beyond what's in the excerpts
6. **For tables/figures**, describe them based on the extracted content only

When user asks general questions like "What is this about?", understand they're asking about the PDF document.

Retrieved Content:
---
{CONTEXT_PLACEHOLDER}
---

Now answer the user's question using ONLY the above content.`;
}
```

---

## Testing Checklist

After implementing these fixes:

### Test 1: Document Summarization
1. Open a PDF
2. Click "Summarize" button
3. Verify each section shows actual summary content (not "No content available")

### Test 2: PDF Context Recognition
1. Open a PDF
2. Ask: "What is this about?"
3. Verify AI responds with PDF content (not generic response)
4. Verify AI includes page citations

### Test 3: Grounded Mode
1. Enable grounded mode
2. Ask a question not covered in PDF
3. Verify AI says "I don't see that information" instead of hallucinating

### Test 4: Multi-Document Context
1. Open 2+ PDFs
2. Ask a question spanning documents
3. Verify citations include document names
4. Verify AI can distinguish between documents

---

## Priority Order

**High Priority** (breaks core functionality):
1. Fix Issue #2 - PDF Context Recognition (users can't effectively use the feature)

**Medium Priority** (feature incomplete):
2. Fix Issue #1 - Document Summarization (feature returns empty results)

**Low Priority** (enhancements):
3. Add custom instructions configuration UI
4. Add per-document instruction templates

---

## Additional Recommendations

1. **Add debug mode**: Show the actual prompt being sent to AI (helps users understand what the model sees)

2. **Add context preview**: Before sending to AI, show users what content was retrieved

3. **Add token usage display**: Show how much of the context window is being used

4. **Improve error messages**: Instead of "No content available", explain why (e.g., "No text could be extracted from this section")

5. **Add fallback for empty sections**: If a section has no extractable text, note it clearly in the summary
