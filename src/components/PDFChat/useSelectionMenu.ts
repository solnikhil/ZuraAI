/**
 * useSelectionMenu Hook
 * 
 * Custom hook for managing the text selection context menu state and actions.
 * Handles displaying the menu, positioning, and executing AI actions on selected text.
 * 
 * Requirements: 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TextSelection } from '../../types/pdf';
import type { SelectionAction } from './types';

export interface UseSelectionMenuOptions {
  /** Callback when an action is executed with the prepared prompt */
  onActionExecute: (action: SelectionAction, selection: TextSelection, prompt: string) => void;
  /** Offset from the selection position (default: { x: 0, y: 8 }) */
  positionOffset?: { x: number; y: number };
}

export interface UseSelectionMenuReturn {
  /** Whether the menu is currently visible */
  isMenuVisible: boolean;
  /** Current menu position */
  menuPosition: { x: number; y: number };
  /** Current text selection (if any) */
  currentSelection: TextSelection | null;
  /** Show the menu for a selection */
  showMenu: (selection: TextSelection, anchorPosition: { x: number; y: number }) => void;
  /** Hide the menu */
  hideMenu: () => void;
  /** Handle an action from the menu */
  handleAction: (action: SelectionAction) => void;
}

/**
 * Generate a prompt for the "Explain this" action
 * Requirements: 4.3
 */
function generateExplainPrompt(selection: TextSelection): string {
  return `Please explain the following text from page ${selection.pageNumber} of the document in clear, accessible terms:

"${selection.text}"

Provide a detailed explanation that:
1. Breaks down any complex concepts or terminology
2. Provides context where helpful
3. Uses examples if appropriate
4. Cites the source location when referencing specific claims`;
}

/**
 * Generate a prompt for the "Summarize" action
 * Requirements: 4.4
 */
function generateSummarizePrompt(selection: TextSelection): string {
  return `Please provide a concise summary of the following text from page ${selection.pageNumber}:

"${selection.text}"

The summary should:
1. Capture the main points and key information
2. Be significantly shorter than the original
3. Maintain accuracy to the source material
4. Cite the source page when appropriate`;
}

/**
 * Generate a prompt for the "Ask about this" action
 * Requirements: 4.6
 */
function generateAskPrompt(selection: TextSelection): string {
  return `I have selected the following text from page ${selection.pageNumber} and would like to ask about it:

"${selection.text}"

What would you like to know about this text?`;
}

/**
 * Generate a prompt for the "Find contradictions" action
 * Requirements: 4.5
 */
function generateFindContradictionsPrompt(selection: TextSelection): string {
  return `Please search the document for any information that contradicts or conflicts with the following text from page ${selection.pageNumber}:

"${selection.text}"

Look for:
1. Statements that directly contradict this passage
2. Data or figures that don't align
3. Different conclusions or interpretations
4. Inconsistencies in terminology or definitions

For each contradiction found, cite the specific location and explain the nature of the conflict.`;
}

/**
 * Generate the appropriate prompt based on the action type
 */
function generatePromptForAction(action: SelectionAction, selection: TextSelection): string {
  switch (action) {
    case 'explain':
      return generateExplainPrompt(selection);
    case 'summarize':
      return generateSummarizePrompt(selection);
    case 'ask':
      return generateAskPrompt(selection);
    case 'findContradictions':
      return generateFindContradictionsPrompt(selection);
    default:
      return `Selected text from page ${selection.pageNumber}: "${selection.text}"`;
  }
}

/**
 * useSelectionMenu Hook
 * 
 * Manages the state and behavior of the text selection context menu.
 */
export function useSelectionMenu({
  onActionExecute,
  positionOffset = { x: 0, y: 8 },
}: UseSelectionMenuOptions): UseSelectionMenuReturn {
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [currentSelection, setCurrentSelection] = useState<TextSelection | null>(null);
  
  // Track if we're in the process of showing the menu to prevent race conditions
  const showingMenuRef = useRef(false);

  /**
   * Show the menu for a given selection
   */
  const showMenu = useCallback(
    (selection: TextSelection, anchorPosition: { x: number; y: number }) => {
      if (showingMenuRef.current) return;
      
      showingMenuRef.current = true;
      
      // Calculate position with offset
      const position = {
        x: anchorPosition.x + positionOffset.x,
        y: anchorPosition.y + positionOffset.y,
      };

      setCurrentSelection(selection);
      setMenuPosition(position);
      setIsMenuVisible(true);
      
      // Reset the flag after a short delay
      setTimeout(() => {
        showingMenuRef.current = false;
      }, 100);
    },
    [positionOffset]
  );

  /**
   * Hide the menu
   */
  const hideMenu = useCallback(() => {
    setIsMenuVisible(false);
    // Keep the selection for a moment in case we need it
    setTimeout(() => {
      if (!showingMenuRef.current) {
        setCurrentSelection(null);
      }
    }, 200);
  }, []);

  /**
   * Handle an action from the menu
   */
  const handleAction = useCallback(
    (action: SelectionAction) => {
      if (!currentSelection) return;

      const prompt = generatePromptForAction(action, currentSelection);
      onActionExecute(action, currentSelection, prompt);
      
      // Hide the menu after action
      hideMenu();
    },
    [currentSelection, onActionExecute, hideMenu]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      showingMenuRef.current = false;
    };
  }, []);

  return {
    isMenuVisible,
    menuPosition,
    currentSelection,
    showMenu,
    hideMenu,
    handleAction,
  };
}

export default useSelectionMenu;

// Export prompt generators for testing and external use
export {
  generateExplainPrompt,
  generateSummarizePrompt,
  generateAskPrompt,
  generateFindContradictionsPrompt,
  generatePromptForAction,
};
