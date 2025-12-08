# Design Document: Zura Showcase Website

## Overview

A modern, single-page showcase website for Zura - an open-source AI desktop assistant. The website will be built as a static HTML/CSS/JS site in the `website` folder, featuring smooth animations, glassmorphism design, and a dark theme consistent with developer tools. The site emphasizes Zura's key features: screen capture with AI analysis, multi-provider support (Ollama/OpenRouter), and the overlay interface.

## Architecture

### Technology Stack
- **HTML5**: Semantic markup structure
- **CSS3**: Styling with CSS variables, animations, and modern features
- **Vanilla JavaScript**: Minimal JS for scroll animations and interactions
- **No build tools**: Static files served directly for simplicity

### File Structure
```
website/
├── index.html          # Main HTML file
├── styles.css          # All styles including animations
├── script.js           # Scroll animations and interactions
└── assets/
    ├── hero-mockup.png # Product screenshot/mockup
    ├── demo-1.png      # Demo screenshots
    └── demo-2.png      # Demo screenshots
```

## Components and Interfaces

### 1. Navigation Header
- Fixed position with backdrop blur
- Logo + "Zura" text on left
- Navigation links: Features, Demo, Open Source
- GitHub icon link on right
- Appears/hides on scroll with smooth transition

### 2. Hero Section
- Full viewport height
- Animated gradient background (purple/blue/pink shifting)
- Large animated headline with text reveal effect
- Tagline with fade-in animation
- Two CTA buttons: "Download" (primary), "View on GitHub" (secondary)
- Floating product mockup with subtle up/down animation

### 3. Features Section
- Section title with fade-in
- 3-column grid of feature cards (responsive to 1 column on mobile)
- Feature cards with:
  - Icon (emoji or SVG)
  - Title
  - Description
  - Glassmorphism styling
  - Hover lift + glow effect
  - Staggered entrance animation on scroll

**Features to highlight:**
1. Screen Capture + AI Analysis
2. Multiple AI Providers (Ollama local, OpenRouter cloud)
3. Overlay Interface with Global Hotkey
4. Markdown & Code Highlighting
5. Privacy-First (local processing option)
6. Open Source & Free

### 4. Demo Section
- Section title
- Screenshot gallery or GIF showing workflow
- Step indicators: Capture → Ask → Get Answer
- Scroll-triggered animations

### 5. Open Source Section
- Emphasis on MIT license
- GitHub repository link with stats placeholder
- "Star on GitHub" CTA button
- Community contribution invitation

### 6. Download/CTA Section
- Final call-to-action
- Download button linking to GitHub releases
- Platform indicators (Windows, macOS coming soon, Linux coming soon)

### 7. Footer
- Copyright notice
- Links: GitHub, License
- "Built with ❤️" message

## Data Models

No persistent data models required - this is a static marketing website.

### Configuration Constants (CSS Variables)
```css
:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --text-primary: #ffffff;
  --text-secondary: #a0a0b0;
  --accent-primary: #8b5cf6;
  --accent-secondary: #06b6d4;
  --glass-bg: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.1);
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, most acceptance criteria are example-based tests verifying specific content presence. One property emerges for universal testing:

### Property 1: Responsive Layout Consistency
*For any* viewport width between 320px and 1920px, the website layout SHALL adapt without horizontal overflow, and all content SHALL remain accessible and readable.
**Validates: Requirements 5.5**

## Error Handling

### Graceful Degradation
- If JavaScript fails to load, core content remains visible and readable
- If images fail to load, alt text provides context
- Animations use CSS with JS enhancement (not JS-dependent)

### Browser Compatibility
- Target: Modern browsers (Chrome, Firefox, Safari, Edge - last 2 versions)
- Fallbacks for older browsers:
  - `backdrop-filter` fallback to solid background
  - CSS animations fallback to static states

## Testing Strategy

### Unit Testing
Given this is a static website with minimal JavaScript, traditional unit tests are limited. Focus on:
- JavaScript function tests for scroll handler logic
- Intersection Observer callback behavior

### Property-Based Testing
- **Framework**: None required for this static site
- **Property 1 (Responsive)**: Manual testing across viewport sizes or automated visual regression testing

### Manual Testing Checklist
1. Verify all sections render correctly
2. Test all links (GitHub, download)
3. Verify animations trigger on scroll
4. Test responsive breakpoints (mobile, tablet, desktop)
5. Verify hover states on interactive elements
6. Test keyboard navigation
7. Verify dark theme consistency

### Browser Testing
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile Safari (iOS)
- Chrome Mobile (Android)
