# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# ui-design
- Use #171717 as dropdown background color with white text and stroke separators. Confidence: 0.85
- No outer shadows on dropdowns, menus, settings cards, or composer containers. Confidence: 0.80
- Use dark translucent glass material with strong blur for overlays and sidebars. Confidence: 0.75
- Use app icons not generic icons in search/results. Confidence: 0.70
- Keep dropdowns compact with consistent rounded corners and proper animations. Confidence: 0.70

# sidebar
- Sidebar should have a curved design with stroke/border matching the titlebar. Confidence: 0.75
- Sidebar scrollable area should not show a visible scrollbar/slider. Confidence: 0.70

# agent-mode
- Command Center is an internal Agent Mode capability on Windows, not a separate feature. Confidence: 0.80
- Agent mode should use native Windows tools (UIA, app management, window management) before screenshot/click fallback. Confidence: 0.70
- Agent mode controls only the current desktop; separate virtual desktop mode was removed. Confidence: 0.85

# web-search
- Web search should support parallel execution of multiple queries (up to 8 total per response). Confidence: 0.80
- Do not emit assistant-written fallback summaries when model synthesis fails after successful search results. Confidence: 0.75
- Use 2026 as the current year in web search queries; do not use 2024/2025 unless the user specifies otherwise. Confidence: 0.70

# streaming
- Non-thinking models should still show their tokens during streaming even without thinking blocks. Confidence: 0.70
- Fix DSML/XML tool-call leaks during final synthesis by treating them as invalid output. Confidence: 0.75

