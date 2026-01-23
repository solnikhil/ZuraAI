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

export function usePDFDocuments() {
    const context = useContext(PDFDocumentContext);
    if (!context) {
        throw new Error('usePDFDocuments must be used within PDFDocumentProvider');
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
