/**
 * PDF Chat Component Props Types
 * 
 * This file contains TypeScript interfaces for PDF Chat React component props.
 * These types are specific to the UI components and complement the core types
 * defined in src/types/pdf.ts.
 */

import type {
  Citation,
  TextSelection,
  RetrievalResult,
  PDFChatSession,
  PDFChatMessage,
  PDFDocument,
  OutlineItem,
} from '../../types/pdf';

// =============================================================================
// Layout Component Props
// =============================================================================

/**
 * Props for the main PDF Chat layout component
 */
export interface PDFChatLayoutProps {
  /** Session ID to load (optional, creates new session if not provided) */
  sessionId?: string;
  /** Initial document to load (optional) */
  initialDocumentPath?: string;
}

/**
 * Information about a loaded document for display in tabs
 * Requirements: 13.1, 13.2
 */
export interface DocumentTabInfo {
  /** Document ID (file path) */
  id: string;
  /** Display name (file name) */
  name: string;
  /** Whether the document is indexed */
  isIndexed: boolean;
  /** Page count (optional) */
  pageCount?: number;
}

/**
 * Props for the document tabs component
 * Requirements: 13.1, 13.2
 */
export interface DocumentTabsProps {
  /** List of loaded documents */
  documents: DocumentTabInfo[];
  /** ID of the currently active document */
  activeDocumentId: string | null;
  /** Callback when a tab is clicked */
  onTabSelect: (documentId: string) => void;
  /** Callback when a tab close button is clicked */
  onTabClose: (documentId: string) => void;
  /** Callback when add document button is clicked */
  onAddDocument: () => void;
  /** Whether adding documents is disabled */
  addDisabled?: boolean;
}

// =============================================================================
// PDF Viewer Component Props
// =============================================================================

/**
 * Props for the PDF Viewer component
 */
export interface PDFViewerProps {
  /** ID of the document to display */
  documentId: string;
  /** Callback when user selects text */
  onTextSelect: (selection: TextSelection) => void;
  /** Citations to highlight in the viewer */
  highlightedCitations: Citation[];
  /** Callback when page changes */
  onPageChange: (pageNumber: number) => void;
  /** Current page number (controlled) */
  currentPage?: number;
  /** Current zoom level (controlled) */
  zoomLevel?: number;
  /** Callback when zoom changes */
  onZoomChange?: (zoom: number) => void;
  /** Auto-fit pages to container width */
  autoFit?: boolean;
  /** Whether the current document is starred */
  isStarred?: boolean;
  /** Toggle starred state for the current document */
  onToggleStar?: () => void;
}

/**
 * Props for the PDF thumbnails sidebar
 */
export interface PDFThumbnailsProps {
  /** ID of the document */
  documentId: string;
  /** Total number of pages */
  pageCount: number;
  /** Currently active page */
  currentPage: number;
  /** Callback when a thumbnail is clicked */
  onPageSelect: (pageNumber: number) => void;
}

/**
 * Props for PDF navigation controls
 */
export interface PDFControlsProps {
  /** Current page number */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Current zoom level (percentage) */
  zoomLevel: number;
  /** Callback to navigate to a specific page */
  onPageChange: (pageNumber: number) => void;
  /** Callback to change zoom level */
  onZoomChange: (zoom: number) => void;
  /** Document outline for navigation */
  outline?: OutlineItem[];
  /** Callback when outline item is clicked */
  onOutlineItemClick?: (item: OutlineItem) => void;
}

// =============================================================================
// Chat Component Props
// =============================================================================

/**
 * Props for the PDF Chat Area component
 */
/**
 * Indexing progress state
 * Shared between PDFChatLayout and PDFChatArea
 */
export interface IndexingState {
  /** Document ID being indexed */
  documentId: string;
  /** Document name for display */
  documentName: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Whether indexing is in progress */
  isIndexing: boolean;
  /** Whether indexing is complete */
  isComplete: boolean;
  /** Error message if indexing failed */
  error?: string;
  /** Storage path of the index */
  storagePath?: string;
  /** Size of the index in bytes */
  storageSizeBytes?: number;
}

/**
 * Document loading state
 * Shows when a document is being initially loaded
 */
export interface DocumentLoadingState {
  /** Document ID being loaded */
  documentId: string;
  /** Document name for display */
  documentName: string;
  /** Whether loading is in progress */
  isLoading: boolean;
}

/**
 * State for pending indexing prompt (shown as inline chat message)
 */
export interface IndexingPromptState {
  /** Document ID to index */
  documentId: string;
  /** Document name for display */
  documentName: string;
  /** Page count of the document */
  pageCount: number;
}

/**
 * Indexing log entry for displaying progress details
 */
export interface IndexingLogEntry {
  /** Timestamp of the log entry */
  timestamp: number;
  /** Log level */
  level: 'info' | 'progress' | 'error' | 'success' | 'warning';
  /** Log message */
  message: string;
}

export interface PDFChatAreaProps {
  /** Current session ID */
  sessionId: string;
  /** IDs of documents in the session */
  documentIds: string[];
  /** Callback when a citation is clicked */
  onCitationClick: (citation: Citation) => void;
  /** Whether grounded mode is enabled */
  groundedMode?: boolean;
  /** Callback to toggle grounded mode */
  onGroundedModeChange?: (enabled: boolean) => void;
  /** Current indexing state (optional) */
  indexingState?: IndexingState | null;
  /** Loaded document info for context display */
  loadedDocuments?: Map<string, { name: string; isIndexed: boolean }>;
  /** Document loading state (optional) */
  documentLoadingState?: DocumentLoadingState | null;
  /** Callback to dismiss indexing notification */
  onDismissIndexingNotification?: () => void;
  /** Pending indexing prompt (shown as inline chat message) */
  indexingPrompt?: IndexingPromptState | null;
  /** Callback when user confirms indexing */
  onConfirmIndexing?: (documentId: string, modelId?: string) => void;
  /** Callback when user skips indexing */
  onSkipIndexing?: (documentId: string) => void;
  /** Indexing logs for display */
  indexingLogs?: IndexingLogEntry[];
}

/**
 * Props for a single PDF chat message
 */
export interface PDFChatMessageProps {
  /** The message to display */
  message: PDFChatMessage;
  /** Callback when a citation is clicked */
  onCitationClick: (citation: Citation) => void;
  /** Callback when sources panel is toggled */
  onSourcesToggle?: () => void;
  /** Whether sources panel is expanded */
  sourcesExpanded?: boolean;
}

/**
 * Props for the PDF chat input component
 */
export interface PDFChatInputProps {
  /** Callback when a message is submitted */
  onSubmit: (message: string, attachedSelection?: TextSelection) => void;
  /** Whether the chat is currently processing */
  isLoading: boolean;
  /** Text selection to attach to the message */
  attachedSelection?: TextSelection;
  /** Callback to clear attached selection */
  onClearSelection?: () => void;
  /** Placeholder text */
  placeholder?: string;
}

// =============================================================================
// Citation Component Props
// =============================================================================

/**
 * Props for a citation link in a message
 */
export interface CitationLinkProps {
  /** The citation to display */
  citation: Citation;
  /** Callback when clicked */
  onClick: () => void;
  /** Callback when hovered */
  onHover?: () => void;
  /** Callback when hover ends */
  onHoverEnd?: () => void;
}

/**
 * Props for citation highlight overlay in PDF viewer
 */
export interface CitationHighlightProps {
  /** Citations to highlight */
  citations: Citation[];
  /** Scale factor for coordinates */
  scale: number;
  /** Page number being displayed */
  pageNumber: number;
  /** Callback when a highlight is clicked */
  onHighlightClick?: (citation: Citation) => void;
}

/**
 * Props for the sources panel component
 */
export interface SourcesPanelProps {
  /** Retrieved sources to display */
  sources: RetrievalResult[];
  /** Callback when a source is clicked */
  onSourceClick: (source: RetrievalResult) => void;
  /** Whether the panel is expanded */
  expanded: boolean;
  /** Callback to toggle expansion */
  onToggle: () => void;
}

// =============================================================================
// Selection Component Props
// =============================================================================

/**
 * Props for the text selection context menu
 */
export interface SelectionMenuProps {
  /** The current text selection */
  selection: TextSelection;
  /** Position for the menu */
  position: { x: number; y: number };
  /** Callback when an action is selected */
  onAction: (action: SelectionAction) => void;
  /** Callback to close the menu */
  onClose: () => void;
}

/**
 * Available actions for text selection
 */
export type SelectionAction = 'explain' | 'summarize' | 'ask' | 'findContradictions';

// =============================================================================
// Utility Component Props
// =============================================================================

/**
 * Props for the PDF upload prompt
 */
export interface PDFUploadPromptProps {
  /** Callback when a file is selected */
  onFileSelect: (file: File) => void;
  /** Whether upload is in progress */
  isUploading: boolean;
  /** Error message to display */
  error?: string;
}

/**
 * Props for PDF loading state indicator
 */
export interface PDFLoadingStateProps {
  /** Current loading stage */
  stage: 'loading' | 'parsing' | 'indexing';
  /** Progress percentage (0-100) */
  progress?: number;
  /** Status message */
  message?: string;
}

// =============================================================================
// Sidebar Component Props
// =============================================================================

/**
 * Props for PDF sessions list in sidebar
 */
export interface PDFSessionsListProps {
  /** List of sessions to display */
  sessions: PDFChatSession[];
  /** Currently active session ID */
  activeSessionId?: string;
  /** Callback when a session is selected */
  onSessionSelect: (sessionId: string) => void;
  /** Callback when a session is deleted */
  onSessionDelete: (sessionId: string) => void;
}

/**
 * Props for recent documents list in sidebar
 */
export interface RecentDocumentsListProps {
  /** List of recent documents */
  documents: Array<{
    id: string;
    fileName: string;
    lastOpenedAt: number;
    isIndexed: boolean;
  }>;
  /** Callback when a document is selected */
  onDocumentSelect: (documentId: string) => void;
}

// =============================================================================
// Hook Return Types
// =============================================================================

/**
 * Return type for usePDFViewer hook
 */
export interface UsePDFViewerReturn {
  /** Current document */
  document: PDFDocument | null;
  /** Current page number */
  currentPage: number;
  /** Current zoom level */
  zoomLevel: number;
  /** Whether document is loading */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Navigate to a specific page */
  goToPage: (page: number) => void;
  /** Set zoom level */
  setZoom: (zoom: number) => void;
  /** Load a document */
  loadDocument: (filePath: string) => Promise<void>;
  /** Unload current document */
  unloadDocument: () => void;
}

/**
 * Return type for usePDFChat hook
 */
export interface UsePDFChatReturn {
  /** Current session */
  session: PDFChatSession | null;
  /** Messages in the session */
  messages: PDFChatMessage[];
  /** Whether a response is being generated */
  isGenerating: boolean;
  /** Error message */
  error: string | null;
  /** Send a message */
  sendMessage: (content: string, attachedSelection?: TextSelection) => Promise<void>;
  /** Clear the session */
  clearSession: () => void;
  /** Export the session */
  exportSession: () => Promise<void>;
}

/**
 * Return type for usePDFIndex hook
 */
export interface UsePDFIndexReturn {
  /** Index status for the current document */
  indexStatus: {
    isIndexed: boolean;
    isIndexing: boolean;
    progress: number;
    chunkCount: number;
  };
  /** Start indexing */
  startIndexing: () => Promise<void>;
  /** Delete index */
  deleteIndex: () => Promise<void>;
  /** Error message */
  error: string | null;
}
