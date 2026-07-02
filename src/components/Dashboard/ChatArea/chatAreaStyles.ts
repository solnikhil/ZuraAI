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
        .chat-scroll-rail {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 18px;
          z-index: 8;
          display: flex;
          align-items: center;
          width: 72px;
          pointer-events: none;
          opacity: 0.64;
          transition: opacity 140ms ease;
        }
        .chat-scroll-rail:hover,
        .chat-scroll-rail:focus-within {
          opacity: 1;
        }
        .chat-scroll-rail__track {
          display: flex;
          width: 100%;
          max-height: min(52vh, 420px);
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          gap: 0;
          overflow: hidden;
          transition: none;
        }
        .chat-scroll-rail__marker {
          display: grid;
          place-items: center start;
          width: 56px;
          height: 10px;
          min-height: 10px;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          cursor: pointer;
          pointer-events: auto;
        }
        .chat-scroll-rail__marker::before {
          content: "";
          width: 20px;
          height: 2px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--theme-text-muted) 48%, transparent);
          box-shadow: none;
          transition:
            width 140ms ease,
            height 120ms ease,
            background-color 120ms ease,
            opacity 120ms ease;
        }
        .chat-scroll-rail__marker.is-user::before {
          width: 10px;
          opacity: 0.68;
        }
        .chat-scroll-rail__marker.is-assistant::before {
          width: 20px;
          opacity: 0.78;
        }
        .chat-scroll-rail__marker:hover::before,
        .chat-scroll-rail__marker.is-visible::before {
          height: 2px;
          opacity: 1;
          background: color-mix(in srgb, var(--theme-text-secondary) 88%, transparent);
        }
        .chat-scroll-rail__marker.is-user:hover::before,
        .chat-scroll-rail__marker.is-user:focus-visible::before {
          width: 14px;
        }
        .chat-scroll-rail__marker.is-assistant:hover::before,
        .chat-scroll-rail__marker.is-assistant:focus-visible::before {
          width: 30px;
        }
        .chat-scroll-rail__marker.is-current::before {
          height: 3px;
          background: var(--theme-text-primary);
          opacity: 1;
        }
        .chat-scroll-rail__marker:focus-visible {
          outline: 2px solid var(--theme-focus);
          outline-offset: 2px;
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
        @media (max-width: 900px) {
          .chat-scroll-rail {
            display: none;
          }
        }
      `
