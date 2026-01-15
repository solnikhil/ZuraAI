/**
 * SelectionMenu Component
 * 
 * Context menu that appears when text is selected in the PDF viewer.
 * Provides quick actions for AI-powered analysis of selected text.
 * 
 * Requirements: 4.2, 4.3, 4.4, 4.5, 4.6
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type { SelectionMenuProps, SelectionAction } from './types';
import './SelectionMenu.css';

/**
 * Menu action configuration
 */
interface MenuAction {
  id: SelectionAction;
  label: string;
  icon: string;
  description: string;
}

/**
 * Available menu actions with their configurations
 */
const MENU_ACTIONS: MenuAction[] = [
  {
    id: 'explain',
    label: 'Explain this',
    icon: '💡',
    description: 'Get a detailed explanation of the selected text',
  },
  {
    id: 'summarize',
    label: 'Summarize',
    icon: '📝',
    description: 'Generate a concise summary',
  },
  {
    id: 'ask',
    label: 'Ask about this',
    icon: '❓',
    description: 'Ask a question about this text',
  },
  {
    id: 'findContradictions',
    label: 'Find contradictions',
    icon: '⚖️',
    description: 'Search for contradicting information in the document',
  },
];

/**
 * Calculate optimal menu position to keep it within viewport
 */
function calculateMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number
): { x: number; y: number } {
  const padding = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let adjustedX = x;
  let adjustedY = y;

  // Adjust horizontal position if menu would overflow right edge
  if (x + menuWidth + padding > viewportWidth) {
    adjustedX = viewportWidth - menuWidth - padding;
  }

  // Adjust horizontal position if menu would overflow left edge
  if (adjustedX < padding) {
    adjustedX = padding;
  }

  // Adjust vertical position if menu would overflow bottom edge
  if (y + menuHeight + padding > viewportHeight) {
    // Position above the selection point instead
    adjustedY = y - menuHeight - padding;
  }

  // Adjust vertical position if menu would overflow top edge
  if (adjustedY < padding) {
    adjustedY = padding;
  }

  return { x: adjustedX, y: adjustedY };
}

/**
 * SelectionMenu Component
 * 
 * Displays a context menu near the text selection with AI action options.
 */
export function SelectionMenu({
  selection,
  position,
  onAction,
  onClose,
}: SelectionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = React.useState(position);

  // Adjust menu position after render to ensure it stays within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const newPosition = calculateMenuPosition(
        position.x,
        position.y,
        rect.width,
        rect.height
      );
      setAdjustedPosition(newPosition);
    }
  }, [position]);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Add listeners with a small delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Handle action click
  const handleActionClick = useCallback(
    (action: SelectionAction) => {
      onAction(action);
      onClose();
    },
    [onAction, onClose]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, action: SelectionAction) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleActionClick(action);
      }
    },
    [handleActionClick]
  );

  // Truncate selection text for preview
  const previewText = selection.text.length > 100
    ? `${selection.text.substring(0, 100)}...`
    : selection.text;

  return (
    <div
      ref={menuRef}
      className="selection-menu"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
      role="menu"
      aria-label="Text selection actions"
    >
      {/* Selection Preview */}
      <div className="selection-menu-preview">
        <span className="selection-menu-preview-label">Selected text:</span>
        <span className="selection-menu-preview-text" title={selection.text}>
          "{previewText}"
        </span>
        <span className="selection-menu-preview-page">
          Page {selection.pageNumber}
        </span>
      </div>

      {/* Divider */}
      <div className="selection-menu-divider" />

      {/* Action Buttons */}
      <div className="selection-menu-actions">
        {MENU_ACTIONS.map((action) => (
          <button
            key={action.id}
            className="selection-menu-action"
            onClick={() => handleActionClick(action.id)}
            onKeyDown={(e) => handleKeyDown(e, action.id)}
            role="menuitem"
            title={action.description}
          >
            <span className="selection-menu-action-icon">{action.icon}</span>
            <span className="selection-menu-action-label">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SelectionMenu;
