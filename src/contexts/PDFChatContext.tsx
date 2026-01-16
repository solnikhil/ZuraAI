/**
 * PDF Chat Context
 * 
 * This context manages PDF chat sessions state and provides CRUD operations
 * for PDF chat sessions via IPC communication with the main process.
 * 
 * Requirements: 11.1, 11.2, 11.3
 * - 11.1: Create new chat sessions linked to PDF documents
 * - 11.2: Store PDF file reference, chat messages, and retrieval context
 * - 11.3: Restore PDF and conversation state when returning to a session
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { PDFChatSession, PDFChatMessage, RecentDocument, Citation, RetrievalResult, TextSelection } from '../types/pdf';

// =============================================================================
// Context Types
// =============================================================================

interface PDFChatContextType {
  /** All PDF chat sessions */
  sessions: PDFChatSession[];
  /** Currently active session ID */
  currentSessionId: string | null;
  /** Currently active session (derived from currentSessionId) */
  currentSession: PDFChatSession | null;
  /** Loading state for async operations */
  isLoading: boolean;
  /** Recent PDF documents */
  recentDocuments: RecentDocument[];
  
  // Session CRUD operations
  /** Create a new PDF chat session for the given document IDs */
  createSession: (documentIds: string[]) => Promise<PDFChatSession>;
  /** Switch to a different session */
  switchSession: (sessionId: string) => void;
  /** Save/update a session */
  saveSession: (session: PDFChatSession) => Promise<void>;
  /** Delete a session */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Refresh sessions from storage */
  refreshSessions: () => Promise<void>;
  /** Clear current session selection */
  clearCurrentSession: () => void;
  
  // Message operations
  /** Add a message to the current session */
  addMessage: (message: Omit<PDFChatMessage, 'id' | 'timestamp'>) => string;
  /** Update a message in the current session */
  updateMessage: (messageId: string, updates: Partial<PDFChatMessage>) => void;
  /** Delete a message from the current session */
  deleteMessage: (messageId: string) => void;
  
  // Session title operations
  /** Update the title of a session */
  updateSessionTitle: (sessionId: string, title: string) => void;
}


// =============================================================================
// Context Creation
// =============================================================================

const PDFChatContext = createContext<PDFChatContextType | undefined>(undefined);

// Check if we're in Electron environment
const isElectron = typeof window !== 'undefined' && Boolean(window.ipcRenderer);

// Local storage key for last active PDF session
const LAST_PDF_SESSION_ID_KEY = 'zura-ui:lastPDFChatSessionId';

// =============================================================================
// Provider Component
// =============================================================================

export function PDFChatProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<PDFChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);

  // Derive current session from sessions and currentSessionId
  const currentSession = useMemo(() => {
    if (!currentSessionId) return null;
    return sessions.find(s => s.id === currentSessionId) || null;
  }, [sessions, currentSessionId]);

  // ==========================================================================
  // Load Sessions from Main Process
  // ==========================================================================

  const loadSessions = useCallback(async () => {
    try {
      if (isElectron) {
        const storedSessions = await window.ipcRenderer.invoke('pdf-chat:get-sessions');
        setSessions(storedSessions || []);
      } else {
        // Fallback to localStorage for non-Electron environments (dev/testing)
        const saved = localStorage.getItem('zura-pdf-chat-sessions');
        setSessions(saved ? JSON.parse(saved) : []);
      }
    } catch (error) {
      console.error('[PDFChatContext] Failed to load PDF chat sessions:', error);
      // Fallback to localStorage
      const saved = localStorage.getItem('zura-pdf-chat-sessions');
      setSessions(saved ? JSON.parse(saved) : []);
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
    }
  }, []);

  const loadRecentDocuments = useCallback(async () => {
    try {
      if (isElectron) {
        const docs = await window.ipcRenderer.invoke('pdf-chat:get-recent-documents', 10);
        setRecentDocuments(docs || []);
      }
    } catch (error) {
      console.error('[PDFChatContext] Failed to load recent documents:', error);
    }
  }, []);


  // ==========================================================================
  // Initialize on Mount
  // ==========================================================================

  useEffect(() => {
    const initialize = async () => {
      await loadSessions();
      await loadRecentDocuments();
    };
    initialize();
  }, [loadSessions, loadRecentDocuments]);

  // ==========================================================================
  // Restore Last Active Session
  // ==========================================================================

  useEffect(() => {
    if (!isInitialized) return;
    if (currentSessionId) return;

    const rememberedId = localStorage.getItem(LAST_PDF_SESSION_ID_KEY);
    if (!rememberedId) return;
    
    if (sessions.some(s => s.id === rememberedId)) {
      setCurrentSessionId(rememberedId);
    } else {
      // Session no longer exists, clear the stored ID
      localStorage.removeItem(LAST_PDF_SESSION_ID_KEY);
    }
  }, [currentSessionId, isInitialized, sessions]);

  // ==========================================================================
  // Persist Last Active Session
  // ==========================================================================

  useEffect(() => {
    if (!isInitialized) return;
    
    if (currentSessionId) {
      localStorage.setItem(LAST_PDF_SESSION_ID_KEY, currentSessionId);
    } else {
      localStorage.removeItem(LAST_PDF_SESSION_ID_KEY);
    }
  }, [currentSessionId, isInitialized]);

  // ==========================================================================
  // Session CRUD Operations
  // ==========================================================================

  const refreshSessions = useCallback(async () => {
    await loadSessions();
    await loadRecentDocuments();
  }, [loadSessions, loadRecentDocuments]);

  /**
   * Create a new PDF chat session
   * Requirement 11.1: Create new chat session linked to PDF document
   */
  const createSession = useCallback(async (documentIds: string[]): Promise<PDFChatSession> => {
    try {
      if (isElectron) {
        const session = await window.ipcRenderer.invoke('pdf-chat:create-session', documentIds);
        setSessions(prev => [session, ...prev]);
        setCurrentSessionId(session.id);
        return session;
      } else {
        // Fallback for non-Electron environments
        const session: PDFChatSession = {
          id: crypto.randomUUID(),
          title: `PDF Chat ${new Date().toLocaleDateString()}`,
          documentIds,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setSessions(prev => {
          const updated = [session, ...prev];
          localStorage.setItem('zura-pdf-chat-sessions', JSON.stringify(updated));
          return updated;
        });
        setCurrentSessionId(session.id);
        return session;
      }
    } catch (error) {
      console.error('[PDFChatContext] Failed to create session:', error);
      throw error;
    }
  }, []);


  /**
   * Switch to a different session
   * Requirement 11.3: Restore PDF and conversation state
   */
  const switchSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSessionId(sessionId);
    }
  }, [sessions]);

  /**
   * Save/update a session
   * Requirement 11.2: Store PDF file reference, chat messages, and retrieval context
   */
  const saveSession = useCallback(async (session: PDFChatSession): Promise<void> => {
    try {
      // Update timestamp
      const updatedSession = {
        ...session,
        updatedAt: Date.now(),
      };

      if (isElectron) {
        await window.ipcRenderer.invoke('pdf-chat:save-session', updatedSession);
      }

      setSessions(prev => {
        const existingIndex = prev.findIndex(s => s.id === session.id);
        let updated: PDFChatSession[];
        
        if (existingIndex >= 0) {
          updated = [...prev];
          updated[existingIndex] = updatedSession;
        } else {
          updated = [updatedSession, ...prev];
        }
        
        if (!isElectron) {
          localStorage.setItem('zura-pdf-chat-sessions', JSON.stringify(updated));
        }
        
        return updated;
      });
    } catch (error) {
      console.error('[PDFChatContext] Failed to save session:', error);
      throw error;
    }
  }, []);

  /**
   * Delete a session
   */
  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      if (isElectron) {
        await window.ipcRenderer.invoke('pdf-chat:delete-session', sessionId);
      }

      setSessions(prev => {
        const updated = prev.filter(s => s.id !== sessionId);
        if (!isElectron) {
          localStorage.setItem('zura-pdf-chat-sessions', JSON.stringify(updated));
        }
        return updated;
      });

      // Clear current session if it was deleted
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
      }
    } catch (error) {
      console.error('[PDFChatContext] Failed to delete session:', error);
      throw error;
    }
  }, [currentSessionId]);

  /**
   * Clear current session selection
   */
  const clearCurrentSession = useCallback(() => {
    localStorage.removeItem(LAST_PDF_SESSION_ID_KEY);
    setCurrentSessionId(null);
  }, []);


  // ==========================================================================
  // Message Operations
  // ==========================================================================

  /**
   * Add a message to the current session
   */
  const addMessage = useCallback((message: Omit<PDFChatMessage, 'id' | 'timestamp'>): string => {
    if (!currentSessionId) {
      throw new Error('No active session to add message to');
    }

    const newMessage: PDFChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    setSessions(prev => {
      const updated = prev.map(session => {
        if (session.id === currentSessionId) {
          // If this is the first user message and title is generic, update title
          let newTitle = session.title;
          if (session.messages.length === 0 && message.role === 'user') {
            newTitle = message.content.slice(0, 40) + (message.content.length > 40 ? '...' : '');
          }

          const updatedSession = {
            ...session,
            title: newTitle,
            messages: [...session.messages, newMessage],
            updatedAt: Date.now(),
          };

          // Persist to main process (debounced in effect)
          return updatedSession;
        }
        return session;
      });

      return updated;
    });

    return newMessage.id;
  }, [currentSessionId]);

  /**
   * Update a message in the current session
   */
  const updateMessage = useCallback((messageId: string, updates: Partial<PDFChatMessage>) => {
    if (!currentSessionId) return;

    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return {
          ...session,
          messages: session.messages.map(msg =>
            msg.id === messageId ? { ...msg, ...updates } : msg
          ),
          updatedAt: Date.now(),
        };
      }
      return session;
    }));
  }, [currentSessionId]);

  /**
   * Delete a message from the current session
   */
  const deleteMessage = useCallback((messageId: string) => {
    if (!currentSessionId) return;

    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return {
          ...session,
          messages: session.messages.filter(msg => msg.id !== messageId),
          updatedAt: Date.now(),
        };
      }
      return session;
    }));
  }, [currentSessionId]);

  // ==========================================================================
  // Session Title Operations
  // ==========================================================================

  /**
   * Update the title of a session
   */
  const updateSessionTitle = useCallback((sessionId: string, title: string) => {
    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s
    ));
  }, []);


  // ==========================================================================
  // Auto-save Sessions (Debounced)
  // ==========================================================================

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentSession) return;

    // Debounce saves to avoid excessive IPC calls during streaming
    const timeoutId = setTimeout(() => {
      const persistCurrentSession = async () => {
        try {
          if (isElectron) {
            await window.ipcRenderer.invoke('pdf-chat:save-session', currentSession);
          } else {
            localStorage.setItem('zura-pdf-chat-sessions', JSON.stringify(sessions));
          }
        } catch (error) {
          console.error('[PDFChatContext] Failed to auto-save session:', error);
        }
      };

      void persistCurrentSession();
    }, 750);

    return () => clearTimeout(timeoutId);
  }, [currentSession, sessions, isInitialized]);

  // ==========================================================================
  // Context Value
  // ==========================================================================

  const contextValue = useMemo(() => ({
    sessions,
    currentSessionId,
    currentSession,
    isLoading,
    recentDocuments,
    createSession,
    switchSession,
    saveSession,
    deleteSession,
    refreshSessions,
    clearCurrentSession,
    addMessage,
    updateMessage,
    deleteMessage,
    updateSessionTitle,
  }), [
    sessions,
    currentSessionId,
    currentSession,
    isLoading,
    recentDocuments,
    createSession,
    switchSession,
    saveSession,
    deleteSession,
    refreshSessions,
    clearCurrentSession,
    addMessage,
    updateMessage,
    deleteMessage,
    updateSessionTitle,
  ]);

  return (
    <PDFChatContext.Provider value={contextValue}>
      {children}
    </PDFChatContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access PDF chat context
 * 
 * @throws Error if used outside of PDFChatProvider
 */
export function usePDFChat() {
  const context = useContext(PDFChatContext);
  if (context === undefined) {
    throw new Error('usePDFChat must be used within a PDFChatProvider');
  }
  return context;
}