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
        .chat-workspace-stage {
          position: relative;
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
        }
        .workspace-artifacts-toggle {
          position: absolute;
          top: 14px;
          right: 18px;
          z-index: 12;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--theme-border) 78%, transparent);
          background: color-mix(in srgb, var(--theme-content-solid) 88%, var(--theme-surface));
          color: var(--theme-text-secondary);
          padding: 0 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, transform 160ms ease;
        }
        .workspace-artifacts-toggle:hover {
          border-color: var(--theme-border-hover);
          background: var(--theme-surface-hover);
          color: var(--theme-text-primary);
          transform: translateY(-1px);
        }
        .workspace-artifacts-panel {
          width: clamp(320px, 30vw, 430px);
          min-width: 300px;
          max-width: 46vw;
          height: 100%;
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--theme-border);
          background: color-mix(in srgb, var(--theme-background) 74%, var(--theme-surface));
          color: var(--theme-text-primary);
          overflow: hidden;
        }
        .workspace-artifacts-panel__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 18px 14px;
          border-bottom: 1px solid color-mix(in srgb, var(--theme-border) 72%, transparent);
        }
        .workspace-artifacts-panel__header h2 {
          margin: 2px 0 0;
          font-size: 19px;
          font-weight: 650;
          letter-spacing: -0.02em;
          line-height: 1.1;
        }
        .workspace-artifacts-panel__eyebrow {
          color: var(--theme-text-tertiary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .workspace-artifacts-empty {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin: 18px;
          padding: 14px;
          border: 1px dashed color-mix(in srgb, var(--theme-border) 86%, transparent);
          border-radius: 8px;
          color: var(--theme-text-secondary);
          background: color-mix(in srgb, var(--theme-surface) 42%, transparent);
        }
        .workspace-artifacts-empty p {
          margin: 0;
          font-size: 13px;
          line-height: 1.45;
        }
        .workspace-artifacts-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 12px 10px;
          border-bottom: 1px solid color-mix(in srgb, var(--theme-border) 72%, transparent);
          max-height: 34%;
          overflow: auto;
        }
        .workspace-artifact-row {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid transparent;
          border-radius: 8px;
          background: transparent;
          color: var(--theme-text-secondary);
          padding: 9px 10px;
          text-align: left;
          cursor: pointer;
          transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
        }
        .workspace-artifact-row:hover,
        .workspace-artifact-row--active {
          border-color: color-mix(in srgb, var(--theme-border-hover) 76%, transparent);
          background: color-mix(in srgb, var(--theme-surface-hover) 72%, transparent);
          color: var(--theme-text-primary);
        }
        .workspace-artifact-row__icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 7px;
          background: color-mix(in srgb, var(--theme-accent-muted) 58%, transparent);
          color: var(--theme-accent);
          flex: 0 0 auto;
        }
        .workspace-artifact-row__text {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .workspace-artifact-row__text span,
        .workspace-artifact-row__text small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .workspace-artifact-row__text span {
          font-size: 13px;
          font-weight: 600;
        }
        .workspace-artifact-row__text small {
          color: var(--theme-text-tertiary);
          font-size: 11px;
        }
        .workspace-artifact-preview {
          min-height: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .workspace-artifact-preview__bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 13px 14px;
          border-bottom: 1px solid color-mix(in srgb, var(--theme-border) 68%, transparent);
        }
        .workspace-artifact-preview__bar h3 {
          margin: 0;
          max-width: 24ch;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
          font-weight: 650;
        }
        .workspace-artifact-preview__bar span {
          color: var(--theme-text-tertiary);
          font-size: 11px;
        }
        .workspace-artifact-preview__body {
          min-height: 0;
          flex: 1;
          overflow: auto;
          padding: 16px;
        }
        .workspace-artifact-preview__body pre {
          margin: 0;
          min-height: 100%;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--theme-text-primary);
          font-size: 12px;
          line-height: 1.55;
          font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
        }
        @media (max-width: 1120px) {
          .workspace-artifacts-panel {
            position: absolute;
            inset: 0 0 0 auto;
            z-index: 20;
            width: min(430px, 88vw);
            max-width: 88vw;
          }
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
