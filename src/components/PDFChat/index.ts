/**
 * PDF Chat Components
 * 
 * This module exports all PDF Chat related components for the Zura AI application.
 * The PDF Chat feature provides RAG-powered conversations about PDF documents
 * with inline citations and interactive PDF viewing.
 */

// Layout Components
export { PDFChatLayout } from './PDFChatLayout';
export { DocumentTabs } from './DocumentTabs';
export type { DocumentTabInfo } from './DocumentTabs';
export { IndexingProgress } from './IndexingProgress';
export type { IndexingProgressProps } from './IndexingProgress';

// PDF Viewer Components
export { PDFViewer } from './PDFViewer';
export { PDFThumbnails, generateThumbnailPages } from './PDFThumbnails';
export { PDFControls, ZOOM_PRESETS } from './PDFControls';

// Navigation utilities
export * from './navigationUtils';

// Chat Components
export { PDFChatArea, parseCitations, formatCitationDisplay, CITATION_PATTERN } from './PDFChatArea';
// export { PDFChatMessage } from './PDFChatMessage';
// export { PDFChatInput } from './PDFChatInput';

// Citation Components
export { CitationHighlight } from './CitationHighlight';
export { CitationLink, formatCitation } from './CitationLink';
export { SourcesPanel } from './SourcesPanel';

// Hooks
export { useTextSelection } from './useTextSelection';
export type { UseTextSelectionOptions, UseTextSelectionReturn } from './useTextSelection';
export { useCitationNavigation, isValidBoundingBox, isValidCitation } from './useCitationNavigation';
export type { UseCitationNavigationOptions, UseCitationNavigationReturn } from './useCitationNavigation';
export { useSelectionMenu, generateExplainPrompt, generateSummarizePrompt, generateAskPrompt, generateFindContradictionsPrompt, generatePromptForAction } from './useSelectionMenu';
export type { UseSelectionMenuOptions, UseSelectionMenuReturn } from './useSelectionMenu';

// Selection Components
export { SelectionMenu } from './SelectionMenu';

// Utility Components
// export { PDFUploadPrompt } from './PDFUploadPrompt';
// export { PDFLoadingState } from './PDFLoadingState';

// Types
export type * from './types';

// Note: Components will be exported as they are implemented in subsequent tasks
