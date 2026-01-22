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

  // Use refs to avoid stale closures and unnecessary re-renders
  const selectionRef = useRef<TextSelection | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Handle mouse up to capture selection - only runs on mouseup, not during drag
  const handleMouseUp = useCallback(() => {
    const windowSelection = window.getSelection();

    if (!windowSelection || windowSelection.isCollapsed) {
      if (selectionRef.current !== null) {
        selectionRef.current = null;
        setSelection(null);
        onSelectionChangeRef.current?.(null);
      }
      return;
    }

    const selectedText = windowSelection.toString().trim();

    if (!selectedText) {
      if (selectionRef.current !== null) {
        selectionRef.current = null;
        setSelection(null);
        onSelectionChangeRef.current?.(null);
      }
      return;
    }

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

    selectionRef.current = newSelection;
    setSelection(newSelection);
    onSelectionChangeRef.current?.(newSelection);
  }, [documentId, currentPage, scale, containerRef]);

  // Clear selection
  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    selectionRef.current = null;
    setSelection(null);
    onSelectionChangeRef.current?.(null);
  }, []);

  // Keep hook count consistent - empty effect replaces removed selectionchange listener
  useEffect(() => {
    // Intentionally empty - removed selectionchange listener for performance
  }, []);

  // Keep hook count consistent - empty effect replaces removed page change handler
  useEffect(() => {
    // Intentionally empty - page change handling removed for simplicity
  }, [currentPage]);

  return {
    selection,
    hasSelection: selection !== null,
    clearSelection,
    handleMouseUp,
  };
}

export default useTextSelection;
