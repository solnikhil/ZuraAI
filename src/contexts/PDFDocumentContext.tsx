import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import type { DocumentTabInfo } from '../components/PDFChat/DocumentTabs';

interface PDFDocumentContextValue {
    // Map for direct access (used by PDFChatLayout)
    loadedDocumentsMap: Map<string, DocumentTabInfo>;
    // Array for iteration (used by Sidebar and other components)
    loadedDocuments: DocumentTabInfo[];
    setLoadedDocuments: React.Dispatch<React.SetStateAction<Map<string, DocumentTabInfo>>>;
    activeDocumentId: string | null;
    setActiveDocumentId: React.Dispatch<React.SetStateAction<string | null>>;
    currentPage: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
    activeDocumentPageCount: number;
}

const PDFDocumentContext = createContext<PDFDocumentContextValue | undefined>(undefined);

// Default empty state for when context is not available
// This allows components to safely use the hook outside of PDFDocumentProvider
// without throwing errors - they just get empty/no-op values
const defaultPDFDocumentValue: PDFDocumentContextValue = {
    loadedDocumentsMap: new Map(),
    loadedDocuments: [],
    setLoadedDocuments: () => {},
    activeDocumentId: null,
    setActiveDocumentId: () => {},
    currentPage: 1,
    setCurrentPage: () => {},
    activeDocumentPageCount: 0,
};

/**
 * Hook to access PDF document context.
 * Returns default empty values when used outside of PDFDocumentProvider.
 * This enables lazy loading of PDFDocumentContext only for /pdf-chat route
 * while allowing other components (like Sidebar) to safely call this hook.
 * 
 * Requirements: 8.4 - PDFDocumentContext SHALL be loaded lazily only when PDF chat route is accessed
 * Property 31: For any route other than /pdf-chat, the PDFDocumentContext SHALL not be initialized
 */
export function usePDFDocuments(): PDFDocumentContextValue {
    const context = useContext(PDFDocumentContext);
    // Return default values if context is not available (outside PDFDocumentProvider)
    // This enables lazy loading - the context is only initialized for /pdf-chat route
    if (!context) {
        return defaultPDFDocumentValue;
    }
    return context;
}

/**
 * Hook that throws if used outside PDFDocumentProvider.
 * Use this when you need to ensure the context is available (e.g., in PDFChatLayout).
 */
export function usePDFDocumentsStrict(): PDFDocumentContextValue {
    const context = useContext(PDFDocumentContext);
    if (!context) {
        throw new Error('usePDFDocumentsStrict must be used within PDFDocumentProvider');
    }
    return context;
}

interface PDFDocumentProviderProps {
    children: ReactNode;
}

export function PDFDocumentProvider({ children }: PDFDocumentProviderProps) {
    const [loadedDocumentsMap, setLoadedDocuments] = useState<Map<string, DocumentTabInfo>>(new Map());
    const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);

    // Convert map to array for components that need iteration
    const loadedDocuments = useMemo(() => Array.from(loadedDocumentsMap.values()), [loadedDocumentsMap]);

    // Get page count for the active document
    const activeDocumentPageCount = activeDocumentId
        ? (loadedDocumentsMap.get(activeDocumentId)?.pageCount || 0)
        : 0;

    const value = useMemo(() => ({
        loadedDocumentsMap,
        loadedDocuments,
        setLoadedDocuments,
        activeDocumentId,
        setActiveDocumentId,
        currentPage,
        setCurrentPage,
        activeDocumentPageCount,
    }), [loadedDocumentsMap, loadedDocuments, activeDocumentId, currentPage, activeDocumentPageCount]);

    return (
        <PDFDocumentContext.Provider value={value}>
            {children}
        </PDFDocumentContext.Provider>
    );
}
