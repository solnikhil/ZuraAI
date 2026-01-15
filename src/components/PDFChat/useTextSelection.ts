/**
 * useTextSelection Hook
 * 
 * Custom hook for handling text selection in the PDF viewer.
 * Provides:
 * - Selection detection
 * - Bounding box calculation
 * - Selection clearing
 * 
 * Requirements: 4.1
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { TextSelection, BoundingBox } from '../../types/pdf';

export interface UseTextSelectionOptions {
  /** Document ID for the selection */
  documentId: string;
  /** Current page number */
  currentPage: number;
  /** Current zoom scale */
  scale: number;
  /** Container element ref */
  containerRef: React.RefObject<HTMLElement>;
  /** Callback when selection changes */
  onSelectionChange?: (selection: TextSelection | null) => void;
}

export interface UseTextSelectionReturn {
  /** Current text selection */
  selection: TextSelection | null;
  /** Whether there is an active selection */
  hasSelection: boolean;
  /** Clear the current selection */
  clearSelection: () => void;
  /** Handle mouse up event to capture selection */
  handleMouseUp: () => void;
}

/**
 * Calculate bounding box from a DOM Range relative to a container
 */
function calculateBoundingBox(
  range: Range,
  containerRect: DOMRect,
  scale: number,
  pageNumber: number
): BoundingBox {
  const rangeRect = range.getBoundingClientRect();
  
  return {
    x0: (rangeRect.left - containerRect.left) / scale,
    y0: (rangeRect.top - containerRect.top) / scale,
    x1: (rangeRect.right - containerRect.left) / scale,
    y1: (rangeRect.bottom - containerRect.top) / scale,
    pageNumber,
  };
}

/**
 * useTextSelection Hook
 */
export function useTextSelection({
  documentId,
  currentPage,
  scale,
  containerRef,
  onSelectionChange,
}: UseTextSelectionOptions): UseTextSelectionReturn {
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const previousSelectionRef = useRef<string | null>(null);

  // Handle mouse up to capture selection
  const handleMouseUp = useCallback(() => {
    const windowSelection = window.getSelection();
    
    if (!windowSelection || windowSelection.isCollapsed) {
      // No selection or collapsed selection
      if (selection !== null) {
        setSelection(null);
        onSelectionChange?.(null);
      }
      return;
    }

    const selectedText = windowSelection.toString().trim();
    
    if (!selectedText) {
      if (selection !== null) {
        setSelection(null);
        onSelectionChange?.(null);
      }
      return;
    }

    // Avoid duplicate processing
    if (selectedText === previousSelectionRef.current) {
      return;
    }
    previousSelectionRef.current = selectedText;

    // Get the container rect for relative positioning
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      return;
    }

    // Calculate bounding box
    const range = windowSelection.getRangeAt(0);
    const boundingBox = calculateBoundingBox(range, containerRect, scale, currentPage);

    const newSelection: TextSelection = {
      text: selectedText,
      documentId,
      pageNumber: currentPage,
      boundingBox,
    };

    setSelection(newSelection);
    onSelectionChange?.(newSelection);
  }, [documentId, currentPage, scale, containerRef, selection, onSelectionChange]);

  // Clear selection
  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    previousSelectionRef.current = null;
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  // Clear selection when page changes
  useEffect(() => {
    clearSelection();
  }, [currentPage, clearSelection]);

  // Listen for selection changes outside of mouse up
  useEffect(() => {
    const handleSelectionChange = () => {
      const windowSelection = window.getSelection();
      
      if (!windowSelection || windowSelection.isCollapsed) {
        if (selection !== null) {
          setSelection(null);
          previousSelectionRef.current = null;
          onSelectionChange?.(null);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [selection, onSelectionChange]);

  return {
    selection,
    hasSelection: selection !== null,
    clearSelection,
    handleMouseUp,
  };
}

export default useTextSelection;
