import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { DocumentTabInfo } from '../components/PDFChat/DocumentTabs';

interface PDFDocumentContextValue {
    loadedDocuments: DocumentTabInfo[];
    setLoadedDocuments: React.Dispatch<React.SetStateAction<Map<string, DocumentTabInfo>>>;
    activeDocumentId: string | null;
    setActiveDocumentId: React.Dispatch<React.SetStateAction<string | null>>;
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
    const [loadedDocuments, setLoadedDocuments] = useState<Map<string, DocumentTabInfo>>(new Map());
    const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);

    const value = {
        loadedDocuments: Array.from(loadedDocuments.values()),
        setLoadedDocuments,
        activeDocumentId,
        setActiveDocumentId,
    };

    return (
        <PDFDocumentContext.Provider value={value}>
            {children}
        </PDFDocumentContext.Provider>
    );
}
