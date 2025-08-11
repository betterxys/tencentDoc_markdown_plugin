# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome browser extension (腾讯文档 Markdown 查看器) that extracts text content from Tencent Docs spreadsheet cells and renders it as Markdown in a browser side panel. The extension only works on `doc.weixin.qq.com/sheet*` domains.

## Development Commands

### Library Setup
The extension requires external libraries that must be downloaded manually:

```bash
mkdir -p lib
curl -o lib/markdown-it.min.js https://cdn.jsdelivr.net/npm/markdown-it@13.0.2/dist/markdown-it.min.js
curl -o lib/purify.min.js https://cdn.jsdelivr.net/npm/dompurify@2.3.6/dist/purify.min.js
curl -o lib/mermaid.min.js https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js
```

Note: The extension has been upgraded from marked.js to markdown-it for better table support and includes Mermaid support for diagram rendering.

### Extension Installation
Since this is a Chrome extension:
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" 
3. Click "Load unpacked" and select the project directory

### Testing
- Navigate to a Tencent Docs spreadsheet (`doc.weixin.qq.com/sheet*`)
- Click extension icon to open side panel
- Click on cells containing Markdown content to see rendered output

## Recent Optimizations

### Performance Improvements
- **Debouncing**: Added 250ms debounce to prevent rapid click processing
- **DOM Caching**: Implemented selector caching with 5-second expiration to reduce DOM queries
- **Duplicate Content Detection**: Prevents processing identical content multiple times
- **Optimized Event Handling**: Reduced unnecessary event processing and improved response time

### Smart Features
- **Markdown Detection**: Automatically identifies content containing Markdown syntax
- **Content Type Classification**: Supports markdown, text, table, and other content types
- **Loading States**: Added loading animations and status indicators
- **Enhanced Error Handling**: Unified error handling and logging system

### User Experience Enhancements
- **Copy Functionality**: One-click copy of raw content to clipboard
- **View Mode Toggle**: Switch between rendered view and raw source view
- **Content Type Indicators**: Visual indicators for different content types
- **Improved Accessibility**: Better support for accessibility mode with enhanced contrast and font sizes

### Advanced Content Processing
- **JSON with Markdown Support**: Automatically detects and renders Markdown content within JSON values
- **Recursive JSON Analysis**: Deep scanning of nested JSON structures to extract embedded Markdown
- **Code Syntax Highlighting**: Basic syntax highlighting for JSON, JavaScript, SQL, and generic code
- **Enhanced Content Detection**: Improved algorithms to distinguish between different content types
- **Rich Rendering Options**: Specialized renderers for JSON, code, tables, and mixed content

### JSON-Specific Features
- **Structured JSON Display**: Hierarchical visualization of JSON objects and arrays
- **Markdown Extraction**: Automatic identification and separate rendering of Markdown within JSON strings
- **Interactive JSON Viewer**: Expandable/collapsible JSON structure with syntax highlighting
- **Format Validation**: Graceful handling of malformed JSON with fallback to code rendering
- **Content Type Detection**: Smart detection of JSON containing Markdown vs. plain JSON

## Architecture Overview

### Core Components

**manifest.json**: Manifest V3 extension configuration
- Defines permissions: storage, scripting, sidePanel, tabs
- Content script injection for Tencent Docs domains
- Background service worker and side panel setup
- Keyboard shortcut: Ctrl/Cmd+Shift+M

**background.js**: Service worker handling extension lifecycle
- Message routing between content script and side panel
- Storage management for markdown content and settings
- Side panel state management (open/close based on valid URLs)
- Accessibility mode toggle coordination

**content.js**: Content script for text extraction from Tencent Docs
- Complex cell content extraction with multiple fallback strategies
- Event listeners for clicks, keyboard shortcuts, and DOM mutations
- Text extraction from various Tencent Docs UI elements (formula bar, input areas, contenteditable elements)
- Support for stopping/starting listening based on extension state
- Intelligent content type detection with scoring system to prevent misclassification
- JSON content repair mechanisms to handle DOM-corrupted content
- Enhanced Markdown detection that avoids false positives for plain text
- Debounced processing, DOM caching, smart Markdown detection, unified error handling

**sidepanel.js/html/css**: Side panel UI for Markdown rendering
- Markdown parsing using markdown-it library (upgraded from marked.js for better table support)
- Mermaid diagram rendering support for flowcharts, sequence diagrams, etc.
- HTML sanitization using DOMPurify
- Accessibility mode with enhanced contrast and font sizes
- Debug console with logging from all components
- Pin/unpin functionality to control auto-rendering behavior
- Copy functionality, view mode toggle, loading states, content type indicators
- Enhanced table preprocessing to fix DOM pollution issues from Tencent Docs

### Data Flow

1. **Content Detection**: Content script monitors clicks and DOM changes on Tencent Docs sheets
2. **Text Extraction**: Multiple strategies extract text from cells, formula bars, and input areas
3. **Message Passing**: Content script sends extracted text to background script
4. **Storage**: Background script stores content and forwards to side panel
5. **Rendering**: Side panel receives content, parses Markdown, sanitizes HTML, and displays

### Key Features

- **Multi-strategy Content Extraction**: Handles various Tencent Docs UI elements and states
- **Accessibility Mode**: Enhanced readability with larger fonts, higher contrast, better spacing
- **Pin/Unpin Behavior**: Controls whether side panel auto-opens and renders content
- **Debug Logging**: Comprehensive logging system across all components
- **Keyboard Shortcuts**: 
  - Ctrl/Cmd+Shift+M: Extract content from current selection/active element
  - Ctrl/Cmd+~: Toggle accessibility mode
  - Ctrl/Cmd+R: Reload side panel

### Storage Schema

Chrome local storage contains:
- `lastMarkdownContent`: Most recently extracted text
- `timestamp`: When content was last extracted  
- `accessibilityMode`: Boolean for accessibility features
- `isPinned`: Boolean controlling auto-rendering behavior

### Security Considerations

- Content Security Policy compliant
- HTML sanitization via DOMPurify prevents XSS
- Script injection for accessing internal Tencent Docs APIs (limited scope)
- Host permissions restricted to Tencent Docs domains only

## Development Workflow

### Testing and Debugging
- Debug functions are exposed globally via `window.testTableRendering()`, `window.testContentTableDetection()`, `window.debugCurrentContent()`
- Comprehensive debug console in side panel shows real-time logs from all components
- Test HTML files in root directory provide isolated testing environments for specific features
- Use browser's developer tools on extension pages: `chrome-extension://[id]/sidepanel.html`

### Common Issues and Solutions

**Table Rendering Problems**: 
- Tables with empty lines between rows require preprocessing via `cleanTableStructure()`
- Use `preprocessTencentDocsContent()` for comprehensive content cleanup

**Content Type Misclassification**:
- JSON content has repair mechanisms via `tryFixJSONContent()`
- Markdown detection uses intelligent scoring system to avoid false positives
- Plain text with list-like patterns (e.g., "- 必做:") properly detected as text, not Markdown

**CSS Issues**:
- Ordered lists use `!important` rules to override potential conflicts
- Table styles are specifically designed to work with markdown-it output
- Accessibility mode has enhanced contrast and sizing

### Architecture Patterns

**Multi-Strategy Content Extraction**: Content extraction follows a priority hierarchy:
1. `input.value` (cleanest source)
2. HTML structure with preserved formatting
3. `textContent` with line break restoration
4. `innerText` with cleanup (last resort)

**Intelligent Content Classification**: Uses scoring system rather than simple pattern matching:
- Markdown requires ≥2 points from various features (headers=3pts, tables=3pts, etc.)
- List detection excludes colon-terminated items to avoid title confusion
- JSON repair handles double-encoded content and extracts from corrupted text

**Error-Resilient Processing**: Each processing stage has fallbacks:
- markdown-it → manual table parsing → basic rendering
- JSON parsing → content repair → code highlighting
- Content extraction → multiple DOM selectors → cached results

## Important Notes

- Extension automatically disables on non-Tencent Docs pages
- Complex DOM structure handling for Tencent Docs requires multiple extraction strategies
- Mutation observers monitor dynamic content changes in spreadsheet interface
- All components communicate via Chrome extension messaging APIs
- No build process required - direct JavaScript files loaded by Chrome
- Content Security Policy restrictions prevent script injection (CSP compliant design)