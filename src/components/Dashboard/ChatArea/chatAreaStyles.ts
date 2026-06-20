/**
 * Static CSS for the dashboard chat surface.
 *
 * Extracted from ChatArea.tsx so the component stays focused on render/runtime
 * logic. Injected via a single <style> tag rendered by ChatArea.
 */
export const CHAT_AREA_STYLES = `
        .typing-indicator {
          display: flex;
          gap: 4px;
        }
        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: #555;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        .empty-state-title {
          font-size: 2rem;
          font-weight: 600;
          color: var(--theme-text-primary);
          margin-bottom: 8px;
        }
        .chat-input-overlay {
          --chat-input-split-start: 44px;
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 0 20px 6px;
          pointer-events: none;
          background: transparent;
          isolation: isolate;
        }
        .chat-input-overlay::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: var(--chat-input-split-start);
          bottom: 0;
          z-index: 0;
          pointer-events: none;
          background: var(--theme-content-solid);
        }
        .chat-input-overlay__inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: min(735px, 100%);
          margin: 0 auto;
          pointer-events: auto;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `
