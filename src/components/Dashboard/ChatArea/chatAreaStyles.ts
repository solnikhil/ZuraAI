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
          padding: 0 clamp(12px, 3vw, 20px) 6px;
          pointer-events: none;
          background: transparent;
          isolation: isolate;
          box-sizing: border-box;
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
          min-width: 0;
          margin: 0 auto;
          pointer-events: auto;
          box-sizing: border-box;
        }
        .chat-message-scroller-viewport {
          padding: 16px clamp(12px, 3vw, 20px) 112px;
          min-width: 0;
          min-height: 0;
          box-sizing: border-box;
          scrollbar-gutter: stable;
        }
        .chat-message-scroller-content {
          width: 100%;
          max-width: min(735px, 100%);
          min-width: 0;
          min-height: 100%;
          margin: 0 auto;
          gap: 0;
        }
        .chat-message-scroller-item {
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }
        .chat-scroll-trail {
          position: absolute;
          top: 18px;
          bottom: 178px;
          left: 10px;
          z-index: 12;
          width: 28px;
          pointer-events: none;
        }
        .chat-scroll-trail::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: 6px;
          width: 1px;
          background: color-mix(in srgb, var(--theme-border) 42%, transparent);
        }
        .chat-scroll-trail__mark {
          position: absolute;
          left: 3px;
          width: 7px;
          height: 2px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: color-mix(in srgb, var(--theme-text-muted) 64%, transparent);
          transform: translateY(-50%);
          opacity: 0.74;
          pointer-events: auto;
          cursor: pointer;
          transition: width 120ms ease, background-color 120ms ease, opacity 120ms ease;
        }
        .chat-scroll-trail__mark:hover,
        .chat-scroll-trail__mark.is-visible {
          width: 13px;
          opacity: 0.95;
          background: color-mix(in srgb, var(--theme-text-secondary) 86%, transparent);
        }
        .chat-scroll-trail__mark.is-current {
          width: 22px;
          height: 2px;
          opacity: 1;
          background: var(--theme-text-primary);
        }
        .chat-scroll-trail__mark.is-user {
          left: 2px;
        }
        [data-slot='message-scroller-button'] {
          border-color: var(--theme-border) !important;
          background: var(--theme-surface) !important;
          color: var(--theme-text-primary) !important;
          box-shadow: var(--theme-shadow-md);
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 720px) {
          .chat-scroll-trail {
            display: none;
          }
        }
      `
