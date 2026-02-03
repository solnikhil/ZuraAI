import React from 'react';
import { PDFDocumentProvider } from '../../contexts/PDFDocumentContext';
import PDFChatLayout from './PDFChatLayout';

/**
 * Lazy-loaded wrapper for PDF Chat that includes the PDFDocumentProvider.
 * This ensures the PDFDocumentContext is only initialized when the /pdf-chat route is accessed.
 * 
 * Requirements: 8.4 - PDFDocumentContext SHALL be loaded lazily only when PDF chat route is accessed
 * Property 31: For any route other than /pdf-chat, the PDFDocumentContext SHALL not be initialized
 */
function LazyPDFChatWrapper() {
    return (
        <PDFDocumentProvider>
            <PDFChatLayout />
        </PDFDocumentProvider>
    );
}

export default LazyPDFChatWrapper;
