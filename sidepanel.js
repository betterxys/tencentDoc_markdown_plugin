// 侧边栏脚本 - 负责渲染 Markdown

const debug = true;

// DOM 元素引用 - 将在DOM加载完成后初始化
let markdownOutput, timestampElement, contentInfoElement, logMessages, debugConsole;
let refreshButton, toggleLogButton, clearLogButton, copyLogButton, copyButton, viewModeButton;

// 状态变量
let isDebugVisible = false;
let isAccessibilityModeEnabled = false;
let currentContent = ''; // 存储当前内容用于复制
let currentContentType = 'text'; // 存储当前内容类型
let currentViewMode = 'rendered'; // 'rendered' 或 'source'

// 初始化DOM元素引用
function initializeDOMReferences() {
  console.log('🔍 开始初始化DOM元素引用...');
  
  // 首先检查文档状态
  console.log('📄 文档状态:', {
    readyState: document.readyState,
    body: !!document.body,
    head: !!document.head,
    documentElement: !!document.documentElement
  });
  
  markdownOutput = document.getElementById('markdown-output');
  timestampElement = document.getElementById('timestamp');
  contentInfoElement = document.getElementById('content-info');
  logMessages = document.getElementById('log-messages');
  debugConsole = document.getElementById('debug-console');
  refreshButton = document.getElementById('refresh-btn');
  toggleLogButton = document.getElementById('toggle-log-btn');
  clearLogButton = document.getElementById('clear-log-btn');
  copyLogButton = document.getElementById('copy-log-btn');
  copyButton = document.getElementById('copy-btn');
  viewModeButton = document.getElementById('view-mode-btn');
  
  // 验证所有重要元素都找到了
  const requiredElements = {
    markdownOutput, timestampElement, contentInfoElement, logMessages, debugConsole,
    refreshButton, toggleLogButton, clearLogButton, copyLogButton, 
    copyButton, viewModeButton
  };
  
  // 详细记录每个元素的状态
  console.log('🔎 DOM元素检查详情:');
  Object.entries(requiredElements).forEach(([name, element]) => {
    const status = element ? '✅' : '❌';
    console.log(`  ${status} ${name}:`, element ? 'found' : 'NOT FOUND');
  });
  
  const missingElements = Object.entries(requiredElements)
    .filter(([name, element]) => !element)
    .map(([name]) => name);
  
  if (missingElements.length > 0) {
    console.error('❌ 以下DOM元素未找到:', missingElements);
    console.error('💡 请检查sidepanel.html中是否包含这些元素的ID');
    
    // 尝试列出所有现有的带ID的元素
    const allElementsWithId = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
    console.log('📝 页面中所有带ID的元素:', allElementsWithId);
    
    return false;
  }
  
  console.log('✅ 所有DOM元素引用初始化成功');
  return true;
}

// 日志函数
function logMessage(source, message) {
  if (debug) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[SidePanel] [${source}] ${message}`);
    
    // 只有在logMessages元素存在时才添加到DOM
    if (logMessages) {
      const logEntry = document.createElement('p');
      
      const timestampSpan = document.createElement('span');
      timestampSpan.textContent = timestamp;
      timestampSpan.className = 'timestamp';
      
      const sourceSpan = document.createElement('span');
      sourceSpan.textContent = `[${source}]`;
      
      // 根据来源设置样式
      if (source === 'background') {
        sourceSpan.className = 'log-background';
      } else if (source === 'content') {
        sourceSpan.className = 'log-content';
      } else if (source === 'error') {
        sourceSpan.className = 'log-error';
      }
      
      const messageSpan = document.createElement('span');
      messageSpan.textContent = ` ${message}`;
      messageSpan.className = 'log-message-content';
      
      logEntry.appendChild(timestampSpan);
      logEntry.appendChild(document.createTextNode(' '));
      logEntry.appendChild(sourceSpan);
      logEntry.appendChild(messageSpan);
      
      logMessages.appendChild(logEntry);
      logMessages.scrollTop = logMessages.scrollHeight;
    }
  }
}


// 设置无障碍模式
function setAccessibilityMode(enabled) {
  isAccessibilityModeEnabled = enabled;
  
  // 更新界面
  if (enabled) {
    document.body.classList.add('accessibility-mode');
    logMessage('sidepanel', '无障碍模式已启用');
  } else {
    document.body.classList.remove('accessibility-mode');
    logMessage('sidepanel', '无障碍模式已禁用');
  }
  
  // 添加或更新状态指示器
  let statusIndicator = document.getElementById('accessibility-status');
  if (!statusIndicator) {
    statusIndicator = document.createElement('div');
    statusIndicator.id = 'accessibility-status';
    document.querySelector('.header-info').appendChild(statusIndicator);
  }
  
  statusIndicator.textContent = enabled ? '无障碍模式: 开启' : '';
  statusIndicator.style.display = enabled ? 'block' : 'none';
  
  // 如果已经渲染了内容，重新应用样式
  if (markdownOutput.innerHTML && !markdownOutput.querySelector('.empty-state')) {
    applyAccessibilityStyles();
  }
}

// 应用无障碍样式到渲染的内容
function applyAccessibilityStyles() {
  if (!isAccessibilityModeEnabled) return;
  
  // 为所有内容元素添加无障碍样式
  const elements = markdownOutput.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, code, pre');
  elements.forEach(el => {
    // 增加行间距
    el.style.lineHeight = '1.8';
    
    // 确保足够的文本大小
    if (window.getComputedStyle(el).fontSize < '16px') {
      el.style.fontSize = '16px';
    }
    
    // 增加文本对比度
    el.style.color = '#000000';
    
    // 确保背景与文本有足够对比度
    if (el.tagName === 'CODE' || el.tagName === 'PRE') {
      el.style.backgroundColor = '#f8f8f8';
      el.style.border = '1px solid #e0e0e0';
      el.style.padding = '0.5rem';
    }
  });
  
  // 确保链接可识别
  const links = markdownOutput.querySelectorAll('a');
  links.forEach(link => {
    link.style.textDecoration = 'underline';
    link.style.color = '#0066cc';
    link.style.fontWeight = 'bold';
  });
  
  // 确保图片有替代文本
  const images = markdownOutput.querySelectorAll('img:not([alt])');
  images.forEach(img => {
    img.alt = '图片内容';
  });
}

// JSON渲染器
class JSONRenderer {
  static render(jsonData, contentType) {
    if (contentType === 'json-with-markdown') {
      return this.renderJSONWithMarkdown(jsonData);
    } else {
      return this.renderJSONOnly(jsonData);
    }
  }
  
  static renderJSONOnly(jsonData) {
    const formatted = JSON.stringify(jsonData, null, 2);
    const escaped = this.escapeHtml(formatted);
    return `
      <div class="json-viewer">
        <div class="json-header">JSON 数据</div>
        <pre class="json-content"><code class="language-json">${escaped}</code></pre>
      </div>
    `;
  }
  
  static renderJSONWithMarkdown(jsonData) {
    let html = `<div class="json-with-markdown">`;
    
    // 显示带有内联Markdown的JSON结构
    html += `
      <div class="json-structure">
        <div class="json-header">
          <h3>JSON + Markdown 混合内容</h3>
          <div class="markdown-controls">
            <button class="expand-all-btn" data-action="expand">展开所有</button>
            <button class="collapse-all-btn" data-action="collapse">折叠所有</button>
          </div>
        </div>
        ${this.renderJSONStructureWithInlineMarkdown(jsonData)}
      </div>
    `;
    
    html += `</div>`;
    return html;
  }
  
  static renderJSONStructureWithInlineMarkdown(obj, depth = 0, maxDepth = 5, path = '') {
    if (depth > maxDepth) {
      return '<span class="json-truncated">...</span>';
    }
    
    if (obj === null) return '<span class="json-null">null</span>';
    if (typeof obj === 'boolean') return `<span class="json-boolean">${obj}</span>`;
    if (typeof obj === 'number') return `<span class="json-number">${obj}</span>`;
    
    if (typeof obj === 'string') {
      const isMarkdown = this.isMarkdown(obj);
      if (isMarkdown) {
        const uniqueId = `markdown-${Math.random().toString(36).substr(2, 9)}`;
        const preview = obj.length > 50 ? obj.substring(0, 50) + '...' : obj;
        
        try {
          // 使用marked解析Markdown
          let parsedMarkdown;
          if (typeof window.md !== 'undefined') {
            parsedMarkdown = window.md.render(obj);
          } else {
            throw new Error('markdown-it 未初始化');
          }
          
          logMessage('sidepanel', `JSON中Markdown 解析结果长度: ${parsedMarkdown.length}`);
          
          // 使用更宽松的DOMPurify配置，确保Markdown标题等元素和表格不被过滤
          const rendered = DOMPurify.sanitize(parsedMarkdown, {
            ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
            ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'align', 'style', 'colspan', 'rowspan']
          });
          
          logMessage('sidepanel', `DOMPurify 清理后长度: ${rendered.length}`);
          
          return `
            <div class="json-markdown-container">
              <div class="json-markdown-preview">
                <span class="json-string markdown-string">"${this.escapeHtml(preview)}"</span>
                <button class="markdown-toggle-btn" data-target="${uniqueId}" title="展开/折叠 Markdown">
                  <svg class="expand-icon" width="12" height="12" viewBox="0 0 24 24">
                    <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
                  </svg>
                </button>
              </div>
              <div id="${uniqueId}" class="json-markdown-content collapsed">
                <div class="markdown-rendered markdown-body">${rendered}</div>
              </div>
            </div>
          `;
        } catch (error) {
          return `
            <div class="json-markdown-container error">
              <span class="json-string">"${this.escapeHtml(preview)}"</span>
              <span class="markdown-error">(Markdown 解析失败)</span>
            </div>
          `;
        }
      } else {
        const preview = obj.length > 100 ? obj.substring(0, 100) + '...' : obj;
        return `<span class="json-string">"${this.escapeHtml(preview)}"</span>`;
      }
    }
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '<span class="json-array">[]</span>';
      
      let html = '<div class="json-array">';
      html += '<span class="json-bracket">[</span>';
      
      obj.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        html += '<div class="json-array-item">';
        html += `<span class="json-index">${index}:</span> `;
        html += this.renderJSONStructureWithInlineMarkdown(item, depth + 1, maxDepth, itemPath);
        if (index < obj.length - 1) html += ',';
        html += '</div>';
      });
      
      html += '<span class="json-bracket">]</span>';
      html += '</div>';
      return html;
    }
    
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '<span class="json-object">{}</span>';
      
      let html = '<div class="json-object">';
      html += '<span class="json-bracket">{</span>';
      
      keys.forEach((key, index) => {
        const keyPath = `${path}.${key}`;
        html += '<div class="json-object-item">';
        html += `<span class="json-key">"${this.escapeHtml(key)}"</span>: `;
        html += this.renderJSONStructureWithInlineMarkdown(obj[key], depth + 1, maxDepth, keyPath);
        if (index < keys.length - 1) html += ',';
        html += '</div>';
      });
      
      html += '<span class="json-bracket">}</span>';
      html += '</div>';
      return html;
    }
    
    return `<span class="json-unknown">${this.escapeHtml(String(obj))}</span>`;
  }

  static renderJSONStructure(obj, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) {
      return '<span class="json-truncated">...</span>';
    }
    
    if (obj === null) return '<span class="json-null">null</span>';
    if (typeof obj === 'boolean') return `<span class="json-boolean">${obj}</span>`;
    if (typeof obj === 'number') return `<span class="json-number">${obj}</span>`;
    
    if (typeof obj === 'string') {
      const isMarkdown = this.isMarkdown(obj);
      const className = isMarkdown ? 'json-string json-markdown' : 'json-string';
      const preview = obj.length > 100 ? obj.substring(0, 100) + '...' : obj;
      const title = isMarkdown ? 'title="包含Markdown内容"' : '';
      return `<span class="${className}" ${title}>"${this.escapeHtml(preview)}"</span>`;
    }
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '<span class="json-array">[]</span>';
      
      let html = '<div class="json-array">';
      html += '<span class="json-bracket">[</span>';
      
      obj.forEach((item, index) => {
        html += '<div class="json-array-item">';
        html += `<span class="json-index">${index}:</span> `;
        html += this.renderJSONStructure(item, depth + 1, maxDepth);
        if (index < obj.length - 1) html += ',';
        html += '</div>';
      });
      
      html += '<span class="json-bracket">]</span>';
      html += '</div>';
      return html;
    }
    
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '<span class="json-object">{}</span>';
      
      let html = '<div class="json-object">';
      html += '<span class="json-bracket">{</span>';
      
      keys.forEach((key, index) => {
        html += '<div class="json-object-item">';
        html += `<span class="json-key">"${this.escapeHtml(key)}"</span>: `;
        html += this.renderJSONStructure(obj[key], depth + 1, maxDepth);
        if (index < keys.length - 1) html += ',';
        html += '</div>';
      });
      
      html += '<span class="json-bracket">}</span>';
      html += '</div>';
      return html;
    }
    
    return `<span class="json-unknown">${this.escapeHtml(String(obj))}</span>`;
  }
  
  static extractMarkdownFromJSON(obj, depth = 0) {
    const results = [];
    
    if (depth > 10) return results;
    
    if (typeof obj === 'string' && this.isMarkdown(obj)) {
      results.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(item => {
        results.push(...this.extractMarkdownFromJSON(item, depth + 1));
      });
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(value => {
        results.push(...this.extractMarkdownFromJSON(value, depth + 1));
      });
    }
    
    return results;
  }
  
  static isMarkdown(text) {
    if (!text || typeof text !== 'string' || text.length < 3) return false;
    
    // 先排除JSON格式
    const trimmed = text.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return false; // 是有效JSON，不是Markdown
      } catch (e) {
        // 继续检测，可能是包含JSON语法的Markdown
      }
    }
    
    // 使用与content.js相同的智能检测逻辑
    const markdownScore = this.calculateMarkdownScore(text);
    return markdownScore >= 2;
  }
  
  // 计算Markdown评分（与content.js保持一致）
  static calculateMarkdownScore(text) {
    let score = 0;
    
    // 1. 检查标题（权重高）
    if (/^#{1,6}\s+.+/m.test(text)) score += 3;
    
    // 2. 检查强调格式
    if (/\*\*[^*]+\*\*/.test(text)) score += 1;
    if (/\*[^*]+\*/.test(text)) score += 1;
    
    // 3. 检查链接
    if (/\[.+?\]\(.+?\)/.test(text)) score += 2;
    
    // 4. 检查代码块和行内代码
    if (/```[\s\S]*?```/.test(text)) score += 3;
    if (/`[^`\n]+`/.test(text)) score += 1;
    
    // 5. 智能检测列表
    const listScore = this.detectListPattern(text);
    score += listScore;
    
    // 6. 检查引用
    if (/^\s*>\s+/m.test(text)) score += 2;
    
    // 7. 检查表格
    if (/^\s*\|.*\|[\s\S]*?\n\s*\|[\s\-:]*\|\s*$/m.test(text)) score += 3;
    
    // 8. 检查分隔线
    if (/^\s*[-=]{3,}\s*$/m.test(text)) score += 2;
    
    // 9. 检查其他格式
    if (/~~[^~]+~~/.test(text)) score += 1;
    if (/!\[.*?\]\(.+?\)/.test(text)) score += 2;
    
    return score;
  }
  
  // 智能检测列表模式（与content.js保持一致）
  static detectListPattern(text) {
    const lines = text.split('\n');
    let listLines = 0;
    let totalLines = lines.filter(line => line.trim().length > 0).length;
    
    for (const line of lines) {
      // 检查无序列表模式
      if (/^\s*[-*+]\s+/.test(line)) {
        // 额外验证：列表项通常不会以冒号结尾
        const content = line.replace(/^\s*[-*+]\s+/, '').trim();
        if (content.length > 2 && !content.endsWith(':') && !content.endsWith('：')) {
          listLines++;
        }
      }
      // 检查有序列表模式
      else if (/^\s*\d+\.\s+/.test(line)) {
        const content = line.replace(/^\s*\d+\.\s+/, '').trim();
        if (content.length > 2) {
          listLines++;
        }
      }
    }
    
    // 如果超过30%的行是列表，且至少有2行列表，才认为是Markdown列表
    if (listLines >= 2 && (listLines / totalLines) > 0.3) {
      return 2;
    }
    if (listLines >= 1) {
      return 1;
    }
    
    return 0;
  }
  
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 代码高亮器 (简单版本)
class CodeHighlighter {
  static highlight(code, language = '') {
    // 基本的语法高亮
    let highlighted = this.escapeHtml(code);
    
    if (language === 'json') {
      highlighted = this.highlightJSON(highlighted);
    } else if (language === 'javascript' || language === 'js') {
      highlighted = this.highlightJavaScript(highlighted);
    } else {
      highlighted = this.highlightGeneric(highlighted);
    }
    
    return highlighted;
  }
  
  static highlightJSON(code) {
    return code
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/:\s*"([^"]*)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/:\s*(\d+(?:\.\d+)?)/g, ': <span class="json-number">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/:\s*null/g, ': <span class="json-null">null</span>');
  }
  
  static highlightJavaScript(code) {
    return code
      .replace(/\b(function|var|let|const|if|else|for|while|return|class|extends)\b/g, '<span class="js-keyword">$1</span>')
      .replace(/\/\*[\s\S]*?\*\//g, '<span class="js-comment">$&</span>')
      .replace(/\/\/.*$/gm, '<span class="js-comment">$&</span>')
      .replace(/"([^"]*)"/g, '<span class="js-string">"$1"</span>')
      .replace(/'([^']*)'/g, '<span class="js-string">\'$1\'</span>');
  }
  
  static highlightGeneric(code) {
    return code
      .replace(/\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/gi, '<span class="sql-keyword">$1</span>')
      .replace(/#[^\n]*/g, '<span class="comment">$&</span>')
      .replace(/"([^"]*)"/g, '<span class="string">"$1"</span>')
      .replace(/'([^']*)'/g, '<span class="string">\'$1\'</span>');
  }
  
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 复制内容到剪贴板
function copyToClipboard() {
  if (!currentContent) {
    logMessage('sidepanel', '没有内容可复制');
    return;
  }
  
  navigator.clipboard.writeText(currentContent).then(() => {
    logMessage('sidepanel', '内容已复制到剪贴板');
    
    // 显示复制成功提示
    const originalText = copyButton.innerHTML;
    copyButton.innerHTML = '<span style="color: #34a853;">✓</span>';
    setTimeout(() => {
      copyButton.innerHTML = originalText;
    }, 1000);
  }).catch(err => {
    logMessage('error', `复制失败: ${err.message}`);
  });
}

// 切换查看模式
function toggleViewMode() {
  if (!currentContent) {
    logMessage('sidepanel', '没有内容可切换查看模式');
    return;
  }
  
  currentViewMode = currentViewMode === 'rendered' ? 'source' : 'rendered';
  
  if (currentViewMode === 'source') {
    // 显示原始内容
    const escapedContent = currentContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    markdownOutput.innerHTML = `
      <div class="source-view">
        <div class="source-header">原始内容</div>
        <pre><code>${escapedContent}</code></pre>
      </div>
    `;
    viewModeButton.title = '切换到渲染视图';
    viewModeButton.classList.add('source-mode');
  } else {
    // 重新渲染
    viewModeButton.title = '切换到原始视图';
    viewModeButton.classList.remove('source-mode');
    // 重新渲染，使用存储的contentType或者默认为text
    const contentType = currentContentType || 'text';
    renderContent(currentContent, contentType);
  }
  
  logMessage('sidepanel', `已切换到${currentViewMode === 'source' ? '原始' : '渲染'}模式`);
}

// 渲染内容的实际逻辑
function renderContent(content, contentType) {
  // 模拟异步渲染过程
  setTimeout(() => {
    try {
      let finalHtml;
      
      // 根据内容类型进行不同处理
      switch (contentType) {
        case 'markdown':
          finalHtml = renderMarkdownContent(content);
          break;
          
        case 'json':
        case 'json-with-markdown':
          finalHtml = renderJSONContent(content, contentType);
          break;
          
        case 'code':
          finalHtml = renderCodeContent(content);
          break;
          
        case 'table':
          finalHtml = renderTableContent(content);
          break;
          
        default:
          finalHtml = renderTextContent(content, contentType);
      }
      
      if (!finalHtml) {
        showError('渲染失败，未能生成内容');
        return;
      }
      
      // 渲染到页面
      markdownOutput.innerHTML = finalHtml;
      
      // 更新顶栏内容信息
      updateContentInfo(contentType, currentContent);
      
      // 如果无障碍模式启用，应用样式
      if (isAccessibilityModeEnabled) {
        applyAccessibilityStyles();
      }
      
      
      // 渲染完成后处理 Mermaid 图表
      processMermaidDiagrams();
      
      logMessage('sidepanel', '渲染完成');
    } catch (error) {
      logMessage('error', `渲染过程中发生错误: ${error.message}`);
      showError(`渲染过程中发生错误: ${error.message}`);
    }
  }, 100);
}

// 处理 Mermaid 图表
function processMermaidDiagrams() {
  if (typeof mermaid === 'undefined') {
    logMessage('sidepanel', 'Mermaid 库未加载，跳过图表处理');
    return;
  }

  try {
    // 查找所有 Mermaid 代码块
    const mermaidBlocks = markdownOutput.querySelectorAll('pre code.language-mermaid, pre code[class*="mermaid"]');
    
    if (mermaidBlocks.length === 0) {
      logMessage('sidepanel', '未找到 Mermaid 图表');
      return;
    }

    logMessage('sidepanel', `找到 ${mermaidBlocks.length} 个 Mermaid 图表，开始处理`);

    let processedCount = 0;
    const promises = [];

    mermaidBlocks.forEach((codeBlock, index) => {
      const pre = codeBlock.parentElement;
      const mermaidCode = codeBlock.textContent.trim();
      
      if (!mermaidCode) {
        logMessage('sidepanel', `Mermaid 图表 ${index + 1} 为空，跳过`);
        return;
      }

      logMessage('sidepanel', `处理 Mermaid 图表 ${index + 1}: ${mermaidCode.substring(0, 50)}...`);

      // 创建一个容器来替换原来的 pre 元素
      const mermaidContainer = document.createElement('div');
      mermaidContainer.className = 'mermaid-container';
      mermaidContainer.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        border: 1px solid #e1e4e8;
        border-radius: 6px;
        background: #f8f9fa;
        text-align: center;
        overflow-x: auto;
      `;

      const mermaidDiv = document.createElement('div');
      const diagramId = `mermaid-diagram-${Date.now()}-${index}`;
      mermaidDiv.id = diagramId;
      mermaidDiv.className = 'mermaid';
      mermaidDiv.style.cssText = `
        display: inline-block;
        max-width: 100%;
        font-family: system-ui, -apple-system, sans-serif;
      `;

      // 渲染 Mermaid 图表
      const promise = new Promise((resolve, reject) => {
        try {
          mermaid.render(diagramId + '-svg', mermaidCode).then(result => {
            if (result && result.svg) {
              mermaidDiv.innerHTML = result.svg;
              logMessage('sidepanel', `Mermaid 图表 ${index + 1} 渲染成功`);
              processedCount++;
              resolve();
            } else {
              throw new Error('渲染结果为空');
            }
          }).catch(error => {
            logMessage('error', `Mermaid 图表 ${index + 1} 渲染失败: ${error.message}`);
            mermaidDiv.innerHTML = `
              <div style="color: #d73a49; padding: 10px; font-size: 14px;">
                <strong>Mermaid 图表渲染失败:</strong><br>
                ${escapeHtml(error.message)}<br>
                <details style="margin-top: 10px;">
                  <summary style="cursor: pointer;">查看原始代码</summary>
                  <pre style="background: #f1f1f1; padding: 10px; margin-top: 5px; text-align: left; white-space: pre-wrap;">${escapeHtml(mermaidCode)}</pre>
                </details>
              </div>
            `;
            reject(error);
          });
        } catch (error) {
          logMessage('error', `Mermaid 图表 ${index + 1} 渲染异常: ${error.message}`);
          mermaidDiv.innerHTML = `
            <div style="color: #d73a49; padding: 10px; font-size: 14px;">
              <strong>Mermaid 图表渲染异常:</strong><br>
              ${escapeHtml(error.message)}<br>
              <details style="margin-top: 10px;">
                <summary style="cursor: pointer;">查看原始代码</summary>
                <pre style="background: #f1f1f1; padding: 10px; margin-top: 5px; text-align: left; white-space: pre-wrap;">${escapeHtml(mermaidCode)}</pre>
              </details>
            </div>
          `;
          reject(error);
        }
      });

      promises.push(promise);

      // 添加标题
      const title = document.createElement('div');
      title.style.cssText = `
        font-size: 14px;
        color: #586069;
        margin-bottom: 10px;
        font-weight: 500;
      `;
      title.textContent = `📊 Mermaid 图表 ${index + 1}`;

      mermaidContainer.appendChild(title);
      mermaidContainer.appendChild(mermaidDiv);

      // 替换原来的 pre 元素
      pre.parentNode.replaceChild(mermaidContainer, pre);
    });

    // 等待所有图表处理完成
    Promise.allSettled(promises).then(results => {
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.filter(r => r.status === 'rejected').length;
      
      logMessage('sidepanel', `Mermaid 图表处理完成: ${successCount} 个成功, ${failCount} 个失败`);
      
      if (successCount > 0) {
        logMessage('sidepanel', '✅ Mermaid 图表渲染完成');
      }
    });

  } catch (error) {
    logMessage('error', `处理 Mermaid 图表时出错: ${error.message}`);
  }
}

// 显示加载状态
function showLoading(message = '正在渲染...') {
  markdownOutput.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

// 渲染 Markdown 内容
function renderMarkdown(content, timestamp, accessibilityMode, contentType) {
  // 如果提供了无障碍模式设置，先更新它
  if (accessibilityMode !== undefined) {
    setAccessibilityMode(accessibilityMode);
  }
  
  // 存储当前内容和类型
  currentContent = content || '';
  currentContentType = contentType || 'text';
  
  // 更新顶栏内容信息
  if (content) {
    updateContentInfo(contentType, content);
  } else {
    contentInfoElement.style.display = 'none';
  }
  
  if (!content) {
    logMessage('sidepanel', '收到空内容，不进行渲染');
    
    // 显示空状态
    markdownOutput.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" height="48" width="48" viewBox="0 0 24 24">
          <path d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z" />
        </svg>
        <p>点击腾讯文档中的单元格来查看其 Markdown 渲染效果</p>
        <p class="shortcut-hint">提示: 使用 Ctrl+~ 切换无障碍模式</p>
        <div class="debug-hint">
          <p><strong>调试步骤:</strong></p>
          <ol>
            <li>确保在腾讯文档表格页面</li>
            <li>点击任意表格单元格</li>
            <li>查看浏览器控制台的调试信息</li>
            <li>或在控制台运行: <code>tencentDocExtensionDebug.testExtraction()</code></li>
          </ol>
        </div>
      </div>
    `;
    timestampElement.textContent = '';
    return;
  }
  
  // 显示加载状态
  showLoading();
  
  try {
    // 根据当前查看模式渲染
    if (currentViewMode === 'source') {
      toggleViewMode(); // 切换到原始视图
    } else {
      renderContent(content, contentType);
    }
  } catch (error) {
    logMessage('error', `渲染过程中发生错误: ${error.message}`);
    showError(`渲染过程中发生错误: ${error.message}`);
  }
}

// 显示错误信息
function showError(message) {
  markdownOutput.innerHTML = `
    <div class="error-state">
      <strong>错误:</strong> ${message}
    </div>
  `;
}

// 重新加载侧边栏
function reloadSidePanel() {
  logMessage('sidepanel', '重新加载侧边栏');
  window.location.reload();
}

// 切换调试控制台的可见性
function toggleDebugConsole() {
  isDebugVisible = !isDebugVisible;
  
  if (isDebugVisible) {
    debugConsole.classList.remove('hidden');
  } else {
    debugConsole.classList.add('hidden');
  }
  
  logMessage('sidepanel', `调试控制台 ${isDebugVisible ? '显示' : '隐藏'}`);
}

// 清除日志
function clearLogs() {
  logMessages.innerHTML = '';
  logMessage('sidepanel', '日志已清除');
}

// 复制所有日志到剪贴板
function copyAllLogs() {
  try {
    // 获取所有日志条目
    const logEntries = logMessages.querySelectorAll('p');
    
    if (logEntries.length === 0) {
      logMessage('sidepanel', '没有日志可复制');
      return;
    }
    
    // 提取日志文本内容
    const logsText = Array.from(logEntries).map(entry => {
      return entry.textContent || entry.innerText;
    }).join('\n');
    
    // 添加标题和分隔符
    const timestamp = new Date().toLocaleString();
    const header = `腾讯文档 Markdown 查看器 - 调试日志\n导出时间: ${timestamp}\n${'='.repeat(50)}\n\n`;
    const fullText = header + logsText;
    
    // 复制到剪贴板
    navigator.clipboard.writeText(fullText).then(() => {
      logMessage('sidepanel', `已复制 ${logEntries.length} 条日志到剪贴板`);
      
      // 显示成功反馈
      const originalText = copyLogButton.innerHTML;
      copyLogButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        已复制
      `;
      copyLogButton.classList.add('success');
      
      setTimeout(() => {
        copyLogButton.innerHTML = originalText;
        copyLogButton.classList.remove('success');
      }, 2000);
      
    }).catch(err => {
      logMessage('error', `复制日志失败: ${err.message}`);
      
      // 降级方案：选择日志文本
      try {
        const range = document.createRange();
        range.selectNodeContents(logMessages);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        logMessage('sidepanel', '无法自动复制，已选中日志文本，请手动复制 (Ctrl+C)');
      } catch (selectErr) {
        logMessage('error', '选择日志文本也失败，请手动选择和复制');
      }
    });
    
  } catch (error) {
    logMessage('error', `复制日志时出错: ${error.message}`);
  }
}

// 初始化侧边栏
function initializeSidePanel() {
  logMessage('sidepanel', '侧边栏初始化');
  
  // 确保调试控制台默认隐藏
  debugConsole.classList.add('hidden');
  
  // 从 chrome.storage.local 获取最后的内容和设置
  chrome.storage.local.get(['lastMarkdownContent', 'contentType', 'timestamp', 'accessibilityMode'], function(data) {
    // 设置无障碍模式
    if (data.accessibilityMode !== undefined) {
      setAccessibilityMode(data.accessibilityMode);
    }
    
    // 默认展示markdown区域
    markdownOutput.classList.remove('hidden');
    
    if (data.lastMarkdownContent) {
      logMessage('sidepanel', `从存储中加载上次的内容 (${data.timestamp})`);
      logMessage('sidepanel', `内容类型: ${data.contentType || 'unknown'}, 长度: ${data.lastMarkdownContent.length}`);
      renderMarkdown(data.lastMarkdownContent, data.timestamp, undefined, data.contentType || 'text');
    }
  });
  
  // 通知背景脚本侧边栏已初始化
  console.log('📡 准备向背景脚本发送初始化消息...');
  logMessage('sidepanel', '准备发送侧边栏初始化消息到背景脚本');
  
  chrome.runtime.sendMessage({ type: 'sidePanel_initialized' }, function(response) {
    console.log('✅ 背景脚本响应:', response);
    logMessage('sidepanel', `背景脚本响应初始化: ${JSON.stringify(response)}`);
    
    if (chrome.runtime.lastError) {
      console.error('❌ 消息发送错误:', chrome.runtime.lastError);
      logMessage('error', `消息发送错误: ${chrome.runtime.lastError.message}`);
    }
  }).then(response => {
    console.log('✅ 背景脚本响应:', response);
    logMessage('sidepanel', '成功通知背景脚本侧边栏已初始化');
  }).catch(error => {
    console.warn('⚠️ 背景脚本通信失败:', error.message);
    logMessage('warning', `背景脚本通信失败: ${error.message}`);
  });
}

// 设置事件监听器
function setupEventListeners() {
  // 监听来自背景脚本的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'render_markdown') {
      renderMarkdown(message.content, message.timestamp, message.accessibilityMode, message.contentType);
      sendResponse({ status: 'rendered' });
      return true;
    }
    
    if (message.type === 'update_accessibility') {
      setAccessibilityMode(message.enabled);
      sendResponse({ status: 'updated' });
      return true;
    }
    
    if (message.type === 'log') {
      logMessage(message.source, message.message);
      sendResponse({ status: 'logged' });
      return true;
    }
    
    return false;
  });
  
  // 只有在元素存在时才添加事件监听器
  if (refreshButton) {
    refreshButton.addEventListener('click', reloadSidePanel);
  }
  
  if (toggleLogButton) {
    toggleLogButton.addEventListener('click', toggleDebugConsole);
  }
  
  if (clearLogButton) {
    clearLogButton.addEventListener('click', clearLogs);
  }
  
  if (copyLogButton) {
    copyLogButton.addEventListener('click', copyAllLogs);
  }
  
  if (copyButton) {
    copyButton.addEventListener('click', copyToClipboard);
  }
  
  if (viewModeButton) {
    viewModeButton.addEventListener('click', toggleViewMode);
  }
  
  
  // JSON + Markdown 交互事件委托
  if (markdownOutput) {
    markdownOutput.addEventListener('click', function(event) {
    const target = event.target;
    logMessage('sidepanel', `点击事件: ${target.tagName}, 类名: ${target.className}`);
    
    // 处理 Markdown 切换按钮
    const toggleBtn = target.closest('.markdown-toggle-btn');
    if (toggleBtn) {
      event.preventDefault();
      const targetId = toggleBtn.getAttribute('data-target');
      logMessage('sidepanel', `点击了 Markdown 切换按钮，目标ID: ${targetId}`);
      toggleMarkdown(targetId);
      return;
    }
    
    // 处理展开/折叠所有按钮
    const expandBtn = target.closest('.expand-all-btn');
    const collapseBtn = target.closest('.collapse-all-btn');
    
    if (expandBtn) {
      event.preventDefault();
      toggleAllMarkdown(true);
      logMessage('sidepanel', '展开所有 Markdown 内容');
      return;
    }
    
    if (collapseBtn) {
      event.preventDefault();
      toggleAllMarkdown(false);
      logMessage('sidepanel', '折叠所有 Markdown 内容');
      return;
    }
    });
  }

  // 监听键盘快捷键
  document.addEventListener('keydown', event => {
    // Ctrl+R 或 Cmd+R 重新加载侧边栏
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
      event.preventDefault();
      reloadSidePanel();
    }
    
    // Ctrl+` 或 Cmd+` 切换无障碍模式
    if ((event.ctrlKey || event.metaKey) && event.key === '`') {
      event.preventDefault();
      // 通知背景脚本切换无障碍模式
      chrome.runtime.sendMessage({ type: 'toggle_accessibility' }, response => {
        if (response && response.status === 'toggled') {
          setAccessibilityMode(response.enabled);
        }
      });
    }
  });
}

// 初始化markdown-it配置
function initializeMarkdownIt() {
  try {
    console.log('🔧 开始初始化markdown-it...');
    
    // 检查所有依赖库的加载状态
    const dependencies = {
      markdownit: typeof markdownit !== 'undefined',
      DOMPurify: typeof DOMPurify !== 'undefined',
      mermaid: typeof mermaid !== 'undefined'
    };
    
    console.log('📚 依赖库加载状态:', dependencies);
    
    // 检查markdown-it是否可用
    if (!dependencies.markdownit) {
      const errorMsg = 'markdown-it 未加载 - 检查lib/markdown-it.min.js是否正确引入';
      console.error('❌', errorMsg);
      logMessage('error', errorMsg);
      return false;
    }
    
    if (!dependencies.DOMPurify) {
      console.warn('⚠️ DOMPurify 未加载 - HTML清理功能将不可用');
      logMessage('warning', 'DOMPurify 未加载');
    }
    
    if (!dependencies.mermaid) {
      console.warn('⚠️ Mermaid 未加载 - 图表渲染功能将不可用');
      logMessage('warning', 'Mermaid 未加载');
    }
    
    // 创建markdown-it实例，优化配置以支持腾讯文档的内容格式
    window.md = markdownit({
      html: false,        // 不允许HTML标签
      xhtmlOut: false,    // 不使用XHTML输出
      breaks: true,       // 将换行符转换为<br> - 修复换行问题
      langPrefix: 'language-',  // CSS语言前缀
      linkify: true,      // 自动检测链接
      typographer: true   // 启用智能引号和其他排版增强
    });
    
    // 初始化 Mermaid
    if (typeof mermaid !== 'undefined') {
      logMessage('sidepanel', '初始化 Mermaid 图表库');
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        htmlLabels: true,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true
        },
        sequence: {
          useMaxWidth: true,
          htmlLabels: true
        },
        gantt: {
          useMaxWidth: true
        },
        journey: {
          useMaxWidth: true
        },
        class: {
          useMaxWidth: true
        },
        state: {
          useMaxWidth: true
        },
        er: {
          useMaxWidth: true
        },
        pie: {
          useMaxWidth: true
        },
        quadrantChart: {
          useMaxWidth: true
        }
      });
      logMessage('sidepanel', 'Mermaid 初始化完成');
    } else {
      logMessage('error', 'Mermaid 库未加载');
    }
    
    logMessage('sidepanel', 'markdown-it 实例创建成功');
    logMessage('sidepanel', `markdown-it 可用特性: ${Object.getOwnPropertyNames(window.md).slice(0, 10).join(', ')}`);
    
    // 测试基本功能
    const simpleTable = '| A | B |\n|---|---|\n| 1 | 2 |';
    const complexTable = '| 问题 | 解决方案 |\n|------|----------|\n| **地面反光** | 低照度泛光+间接照明 |';
    
    logMessage('sidepanel', `简单表格测试输入: ${simpleTable.replace(/\n/g, '\\n')}`);
    const simpleResult = window.md.render(simpleTable);
    logMessage('sidepanel', `简单表格解析结果: ${simpleResult}`);
    
    logMessage('sidepanel', `复杂表格测试输入: ${complexTable.replace(/\n/g, '\\n')}`);
    const complexResult = window.md.render(complexTable);
    logMessage('sidepanel', `复杂表格解析结果: ${complexResult}`);
    
    // 测试问题内容
    const problematicContent = `### 测试表格

| **行业** | **场景** |

|----------|----------|

| **化工** | 攻击场景 |`;
    
    logMessage('sidepanel', '测试问题表格（带空行）');
    const problematicResult = window.md.render(problematicContent);
    logMessage('sidepanel', `问题表格解析结果: ${problematicResult}`);
    logMessage('sidepanel', `问题表格包含table标签: ${/<table/.test(problematicResult)}`);
    
  } catch (error) {
    logMessage('error', `markdown-it初始化失败: ${error.message}`);
  }
}

// 测试表格渲染的专用函数
function testTableRendering() {
  logMessage('sidepanel', '=== 开始表格渲染测试 ===');
  
  const testTableContent = `# 表格测试

| 问题 | 解决方案 | 推荐灯具 |
|------|----------|----------|
| **地面反光** | 低照度泛光+间接照明 | 悦上暗藏灯带 + U7筒灯（磨砂透镜） |
| **墙面眩光** | 洗墙灯+蜂窝防眩网/哑光反光杯 | 水墨轨道灯 + 光力导轨灯 |

## 简单表格

| A | B |
|---|---|
| 1 | 2 |`;

  try {
    const result = renderMarkdownContent(testTableContent);
    logMessage('sidepanel', `测试结果长度: ${result.length}`);
    logMessage('sidepanel', `测试结果是否包含table: ${/<table/.test(result)}`);
    
    // 更新渲染区域显示测试结果
    markdownOutput.innerHTML = result;
    updateContentInfo('markdown', testTableContent);
    
    logMessage('sidepanel', '=== 表格渲染测试完成 ===');
    return result;
  } catch (error) {
    logMessage('error', `表格测试失败: ${error.message}`);
    return null;
  }
}

// 测试具体内容的表格检测
function testContentTableDetection(content) {
  logMessage('sidepanel', '=== 开始内容表格检测测试 ===');
  logMessage('sidepanel', `内容长度: ${content.length}`);
  
  // 测试新的表格检测逻辑
  const hasTableNew = /\|.*\|[\s\S]*?\n\s*\|(\s*[\-:]+\s*\|)+\s*/.test(content);
  const hasTableOld = /\|.*\|/.test(content);
  
  logMessage('sidepanel', `新检测逻辑结果: ${hasTableNew}`);
  logMessage('sidepanel', `旧检测逻辑结果: ${hasTableOld}`);
  
  // 查找所有竖线模式
  const allPipes = content.match(/\|[^|\n]*\|/g);
  if (allPipes) {
    logMessage('sidepanel', `找到 ${allPipes.length} 个竖线模式:`);
    allPipes.slice(0, 5).forEach((pipe, index) => {
      logMessage('sidepanel', `  ${index + 1}: ${pipe}`);
    });
  }
  
  // 查找真实的表格
  const tableRegex = /\|.*\|[\s\S]*?\n\s*\|(\s*[\-:]+\s*\|)+\s*[\s\S]*?(?=\n\s*\n|\n\s*[^|]|\n\s*$|$)/g;
  const tables = content.match(tableRegex);
  if (tables) {
    logMessage('sidepanel', `找到 ${tables.length} 个真实表格:`);
    tables.forEach((table, index) => {
      logMessage('sidepanel', `表格 ${index + 1} (${table.length}字符): ${table.substring(0, 100)}...`);
    });
  }
  
  logMessage('sidepanel', '=== 内容表格检测测试完成 ===');
}

// 检查侧边栏状态的诊断函数
function checkSidePanelStatus() {
  console.log('🔍 ===== 侧边栏状态诊断 =====');
  
  const status = {
    timestamp: new Date().toLocaleString(),
    domStatus: {},
    libraryStatus: {},
    extensionStatus: {},
    configStatus: {}
  };
  
  // 检查DOM元素
  const domElements = [
    'markdown-output', 'timestamp', 'content-info', 'log-messages', 
    'debug-console', 'refresh-btn', 'toggle-log-btn', 'clear-log-btn',
    'copy-log-btn', 'copy-btn', 'view-mode-btn'
  ];
  
  domElements.forEach(id => {
    status.domStatus[id] = !!document.getElementById(id);
  });
  
  // 检查依赖库
  status.libraryStatus = {
    markdownit: typeof markdownit !== 'undefined',
    DOMPurify: typeof DOMPurify !== 'undefined', 
    mermaid: typeof mermaid !== 'undefined'
  };
  
  // 检查扩展API
  status.extensionStatus = {
    chrome: !!window.chrome,
    chromeRuntime: !!window.chrome?.runtime,
    chromeStorage: !!window.chrome?.storage
  };
  
  // 检查全局状态
  status.configStatus = {
    debug: debug,
    isAccessibilityModeEnabled: isAccessibilityModeEnabled,
    currentViewMode: currentViewMode,
    mdInstance: !!window.md
  };
  
  console.log('📊 诊断结果:', status);
  
  // 输出问题总结
  const issues = [];
  
  Object.entries(status.domStatus).forEach(([id, found]) => {
    if (!found) issues.push(`DOM元素缺失: ${id}`);
  });
  
  Object.entries(status.libraryStatus).forEach(([lib, loaded]) => {
    if (!loaded) issues.push(`依赖库未加载: ${lib}`);
  });
  
  Object.entries(status.extensionStatus).forEach(([api, available]) => {
    if (!available) issues.push(`Chrome API不可用: ${api}`);
  });
  
  if (issues.length > 0) {
    console.warn('⚠️ 发现问题:', issues);
  } else {
    console.log('✅ 所有检查通过，侧边栏状态正常');
  }
  
  // 如果日志区域可用，也写到日志中
  if (status.domStatus['log-messages']) {
    logMessage('diagnostic', `状态检查完成，发现 ${issues.length} 个问题`);
    issues.forEach(issue => logMessage('diagnostic', `❌ ${issue}`));
  }
  
  return status;
}

// 启动侧边栏
function start() {
  console.log('🚀 开始启动侧边栏...');
  console.log('⏰ 启动时间:', new Date().toLocaleString());
  
  try {
    // 检查基本环境
    console.log('🌍 运行环境检查:', {
      userAgent: navigator.userAgent,
      url: location.href,
      chrome: !!window.chrome,
      chromeRuntime: !!window.chrome?.runtime
    });
    
    // 首先初始化DOM元素引用
    console.log('📝 步骤1: 初始化DOM元素引用');
    if (!initializeDOMReferences()) {
      throw new Error('DOM元素初始化失败 - 请检查sidepanel.html文件');
    }
    console.log('✅ DOM元素初始化成功');
    
    // 初始化markdown-it
    console.log('📝 步骤2: 初始化markdown-it');
    const markdownInitSuccess = initializeMarkdownIt();
    if (markdownInitSuccess === false) {
      throw new Error('markdown-it初始化失败 - 请检查依赖库加载');
    }
    console.log('✅ markdown-it初始化成功');
    
    // 设置事件监听器
    console.log('📝 步骤3: 设置事件监听器');
    setupEventListeners();
    console.log('✅ 事件监听器设置成功');
    
    // 初始化侧边栏
    console.log('📝 步骤4: 初始化侧边栏状态');
    initializeSidePanel();
    console.log('✅ 侧边栏状态初始化成功');
    
    // 添加表格测试到全局作用域供调试使用
    console.log('📝 步骤5: 添加调试函数');
    window.testTableRendering = testTableRendering;
    window.testContentTableDetection = testContentTableDetection;
    window.testContentPreprocessing = testTableCleaning;
    window.debugCurrentContent = debugCurrentContent;
    window.checkSidePanelStatus = checkSidePanelStatus; // 新增状态检查函数
    
    const debugFunctions = [
      'testTableRendering()', 
      'testContentTableDetection()', 
      'testContentPreprocessing()', 
      'debugCurrentContent()',
      'checkSidePanelStatus()'
    ];
    console.log('🛠️ 可用调试函数:', debugFunctions);
    logMessage('sidepanel', `添加了全局调试函数: ${debugFunctions.join(', ')}`);
    
    // 通知背景脚本侧边栏已初始化
    console.log('📝 步骤6: 通知背景脚本');
    chrome.runtime.sendMessage({
      type: 'sidePanel_initialized'
    }).then(response => {
      console.log('✅ 背景脚本响应:', response);
      logMessage('sidepanel', '成功通知背景脚本侧边栏已初始化');
    }).catch(error => {
      console.warn('⚠️ 背景脚本通信失败:', error.message);
      logMessage('warning', `背景脚本通信失败: ${error.message}`);
    });
    
    console.log('🎉 侧边栏启动完成!');
    logMessage('sidepanel', '侧边栏启动完成，所有功能已就绪');
    
  } catch (error) {
    console.error('💥 侧边栏启动错误:', error);
    console.error('📍 错误堆栈:', error.stack);
    
    if (markdownOutput) {
      showError(`侧边栏启动失败: ${error.message}`);
    } else {
      // 如果连markdownOutput都没有，直接在body中显示错误
      document.body.innerHTML = `
        <div style="padding: 20px; color: red; font-family: monospace;">
          <h2>❌ 侧边栏启动失败</h2>
          <p><strong>错误信息:</strong> ${error.message}</p>
          <p><strong>建议解决方案:</strong></p>
          <ul>
            <li>检查sidepanel.html文件是否完整</li>
            <li>检查lib/目录下的依赖库是否存在</li>
            <li>重新加载扩展后再试</li>
          </ul>
          <button onclick="location.reload()">重新加载页面</button>
        </div>
      `;
    }
  }
}

// 综合内容预处理 - 修复腾讯文档提取内容的各种格式问题
function preprocessTencentDocsContent(content) {
  try {
    logMessage('sidepanel', '=== 开始腾讯文档内容预处理 ===');
    logMessage('sidepanel', `原始内容长度: ${content.length}`);
    logMessage('sidepanel', `原始内容行数: ${content.split('\n').length}`);
    logMessage('sidepanel', `原始内容前300字符: ${content.substring(0, 300)}`);
    
    // 显示原始内容的前几行用于调试
    const originalLines = content.split('\n');
    logMessage('sidepanel', '原始内容前10行:');
    originalLines.slice(0, 10).forEach((line, i) => {
      logMessage('sidepanel', `  ${i+1}: "${line}"`);
    });
    
    let currentContent = content;
    
    // 1. 清理表格结构
    logMessage('sidepanel', '--- 步骤1: 清理表格结构 ---');
    const beforeTable = currentContent.length;
    currentContent = cleanTableStructure(currentContent);
    logMessage('sidepanel', `表格清理结果: ${beforeTable} → ${currentContent.length} 字符`);
    
    // 2. 修复标题格式（确保标题前后有空行）
    logMessage('sidepanel', '--- 步骤2: 修复标题格式 ---');
    const beforeHeader = currentContent.length;
    currentContent = fixHeaderFormatting(currentContent);
    logMessage('sidepanel', `标题修复结果: ${beforeHeader} → ${currentContent.length} 字符`);
    
    // 3. 修复列表格式
    logMessage('sidepanel', '--- 步骤3: 修复列表格式 ---');
    const beforeList = currentContent.length;
    currentContent = fixListFormatting(currentContent);
    logMessage('sidepanel', `列表修复结果: ${beforeList} → ${currentContent.length} 字符`);
    
    // 4. 清理多余的空行（但保留必要的段落分隔）
    logMessage('sidepanel', '--- 步骤4: 清理多余空行 ---');
    const beforeClean = currentContent.length;
    currentContent = cleanExcessiveEmptyLines(currentContent);
    logMessage('sidepanel', `空行清理结果: ${beforeClean} → ${currentContent.length} 字符`);
    
    // 显示处理后的内容
    const processedLines = currentContent.split('\n');
    logMessage('sidepanel', `处理后内容行数: ${processedLines.length}`);
    logMessage('sidepanel', '处理后内容前10行:');
    processedLines.slice(0, 10).forEach((line, i) => {
      logMessage('sidepanel', `  ${i+1}: "${line}"`);
    });
    
    logMessage('sidepanel', `=== 内容预处理完成：${content.length} → ${currentContent.length} 字符 ===`);
    
    // 如果内容没有任何变化，记录警告
    if (currentContent === content) {
      logMessage('sidepanel', '⚠️ 警告: 预处理后内容完全没有变化！');
    }
    
    return currentContent;
    
  } catch (error) {
    logMessage('error', `内容预处理失败: ${error.message}`);
    logMessage('error', `错误堆栈: ${error.stack}`);
    return content;
  }
}

// 修复标题格式
function fixHeaderFormatting(content) {
  const lines = content.split('\n');
  const fixedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeader = /^#{1,6}\s/.test(line);
    
    if (isHeader) {
      // 确保标题前有空行（除非是第一行）
      if (i > 0 && fixedLines.length > 0 && fixedLines[fixedLines.length - 1].trim() !== '') {
        fixedLines.push('');
      }
      fixedLines.push(line);
      // 确保标题后有空行（除非下一行已经是空行）
      if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
        fixedLines.push('');
      }
    } else {
      fixedLines.push(line);
    }
  }
  
  return fixedLines.join('\n');
}

// 修复列表格式
function fixListFormatting(content) {
  const lines = content.split('\n');
  const fixedLines = [];
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isListItem = /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line);
    
    if (isListItem) {
      if (!inList && fixedLines.length > 0 && fixedLines[fixedLines.length - 1].trim() !== '') {
        // 列表开始前添加空行
        fixedLines.push('');
      }
      inList = true;
      fixedLines.push(line);
    } else {
      if (inList && line.trim() !== '') {
        // 列表结束后添加空行
        fixedLines.push('');
        inList = false;
      }
      fixedLines.push(line);
    }
  }
  
  return fixedLines.join('\n');
}

// 清理多余的空行（保留段落间的单个空行）
function cleanExcessiveEmptyLines(content) {
  // 将多个连续空行替换为单个空行
  return content.replace(/\n\s*\n\s*\n+/g, '\n\n');
}

// 清理表格结构 - 移除表格行间的多余空行
function cleanTableStructure(content) {
  try {
    logMessage('sidepanel', '开始表格结构清理');
    const lines = content.split('\n');
    const cleanedLines = [];
    let inTable = false;
    let previousLineWasTable = false;
    let tableRowCount = 0;
    let removedEmptyLines = 0;
    
    logMessage('sidepanel', `输入总行数: ${lines.length}`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isTableLine = /^\s*\|.*\|\s*$/.test(line) && line.trim() !== '|';
      const isEmptyLine = line.trim() === '';
      
      if (isTableLine) {
        tableRowCount++;
        if (!inTable) {
          // 开始新表格
          logMessage('sidepanel', `行${i+1}: 检测到表格开始: "${line}"`);
          inTable = true;
        } else {
          logMessage('sidepanel', `行${i+1}: 表格行: "${line}"`);
        }
        cleanedLines.push(line);
        previousLineWasTable = true;
      } else if (inTable && isEmptyLine && previousLineWasTable) {
        logMessage('sidepanel', `行${i+1}: 在表格中发现空行，检查下一行...`);
        // 在表格中遇到空行 - 检查下一行是否还是表格行
        let nextTableLineIndex = -1;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (/^\s*\|.*\|\s*$/.test(nextLine) && nextLine.trim() !== '|') {
            nextTableLineIndex = j;
            logMessage('sidepanel', `  发现下一个表格行在第${j+1}行: "${nextLine}"`);
            break;
          } else if (nextLine.trim() !== '') {
            logMessage('sidepanel', `  遇到非空非表格行在第${j+1}行: "${nextLine}"，表格结束`);
            break; // 遇到非空非表格行，表格结束
          }
        }
        
        if (nextTableLineIndex > 0) {
          // 跳过空行，继续表格
          logMessage('sidepanel', `  跳过表格间空行`);
          removedEmptyLines++;
          continue;
        } else {
          // 表格结束
          logMessage('sidepanel', `  表格结束，保留空行`);
          inTable = false;
          cleanedLines.push(line);
          previousLineWasTable = false;
        }
      } else {
        if (inTable && !isTableLine) {
          logMessage('sidepanel', `行${i+1}: 表格结束于非表格行: "${line}"`);
          inTable = false;
        }
        cleanedLines.push(line);
        previousLineWasTable = false;
      }
    }
    
    logMessage('sidepanel', `表格清理完成:`);
    logMessage('sidepanel', `  发现表格行数: ${tableRowCount}`);
    logMessage('sidepanel', `  移除空行数: ${removedEmptyLines}`);
    logMessage('sidepanel', `  输出行数: ${cleanedLines.length}`);
    logMessage('sidepanel', `  字符数变化: ${lines.length} → ${cleanedLines.length} (${cleanedLines.length - lines.length})`);
    
    return cleanedLines.join('\n');
  } catch (error) {
    logMessage('error', `表格结构清理失败: ${error.message}`);
    return content; // 失败时返回原内容
  }
}

// 增强的表格检测函数
function detectTables(content) {
  try {
    logMessage('sidepanel', '=== 开始表格检测 ===');
    
    // 方法1: 标准Markdown表格检测（包含分隔符行）
    const standardTableRegex = /\|.*\|[\s\S]*?\n\s*\|(\s*[\-:]+\s*\|)+\s*/;
    const hasStandardTable = standardTableRegex.test(content);
    logMessage('sidepanel', `方法1-标准表格检测: ${hasStandardTable}`);
    
    if (hasStandardTable) {
      const match = content.match(standardTableRegex);
      if (match) {
        logMessage('sidepanel', `  匹配的标准表格: "${match[0].substring(0, 100)}..."`);
      }
      return true;
    }
    
    // 方法2: 检测至少2行以上的表格结构（即使没有分隔符）
    logMessage('sidepanel', '方法2-多行表格检测:');
    const lines = content.split('\n');
    let tableLineCount = 0;
    let consecutiveTableLines = 0;
    const foundTableLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isTableLine = /^\s*\|.*\|\s*$/.test(line) && line.trim() !== '|';
      
      if (isTableLine) {
        tableLineCount++;
        consecutiveTableLines++;
        foundTableLines.push(`行${i+1}: "${line}"`);
        logMessage('sidepanel', `  发现表格行${tableLineCount}: "${line}"`);
      } else if (line.trim() === '') {
        // 空行不中断计数
        logMessage('sidepanel', `  行${i+1}: 空行，不中断表格计数`);
        continue;
      } else {
        // 重置连续计数
        if (consecutiveTableLines > 0) {
          logMessage('sidepanel', `  行${i+1}: 非表格行"${line}"，重置连续计数`);
        }
        consecutiveTableLines = 0;
      }
      
      // 如果发现至少2行连续的表格行，认为是表格
      if (consecutiveTableLines >= 2) {
        logMessage('sidepanel', `  ✅ 发现${consecutiveTableLines}行连续表格，检测为表格`);
        return true;
      }
    }
    
    logMessage('sidepanel', `方法2结果: 总表格行数=${tableLineCount}, 最大连续行数=${consecutiveTableLines}`);
    
    // 方法3: 如果总共有多行表格行，也认为可能是表格
    const method3Result = tableLineCount >= 2;
    logMessage('sidepanel', `方法3-总行数检测: ${method3Result} (需要>=2行，实际${tableLineCount}行)`);
    
    if (foundTableLines.length > 0) {
      logMessage('sidepanel', '发现的所有表格行:');
      foundTableLines.forEach(line => logMessage('sidepanel', `  ${line}`));
    }
    
    logMessage('sidepanel', `=== 表格检测结果: ${method3Result} ===`);
    return method3Result;
    
  } catch (error) {
    logMessage('error', `表格检测失败: ${error.message}`);
    return false;
  }
}

// 调试当前内容的专用函数
function debugCurrentContent() {
  logMessage('sidepanel', '=== 调试当前内容 ===');
  
  // 获取当前显示的内容
  let currentDisplayContent = currentContent || '';
  
  if (!currentDisplayContent) {
    // 尝试从存储中获取
    chrome.storage.local.get(['lastMarkdownContent'], function(data) {
      if (data.lastMarkdownContent) {
        currentDisplayContent = data.lastMarkdownContent;
        logMessage('sidepanel', `从存储获取内容，长度: ${currentDisplayContent.length}`);
        analyzeContent(currentDisplayContent);
      } else {
        logMessage('sidepanel', '❌ 没有找到当前内容');
      }
    });
    return;
  }
  
  analyzeContent(currentDisplayContent);
}

function analyzeContent(content) {
  logMessage('sidepanel', `=== 分析内容（长度: ${content.length}）===`);
  
  // 1. 显示基本信息
  const lines = content.split('\n');
  logMessage('sidepanel', `总行数: ${lines.length}`);
  logMessage('sidepanel', `首行: "${lines[0] || ''}"`);
  logMessage('sidepanel', `末行: "${lines[lines.length - 1] || ''}"`);
  
  // 2. 查找可能的表格行
  let tableLineCount = 0;
  const possibleTableLines = [];
  lines.forEach((line, i) => {
    if (line.includes('|')) {
      tableLineCount++;
      possibleTableLines.push(`行${i+1}: "${line}"`);
    }
  });
  
  logMessage('sidepanel', `包含竖线的行数: ${tableLineCount}`);
  if (possibleTableLines.length > 0) {
    logMessage('sidepanel', '包含竖线的行:');
    possibleTableLines.slice(0, 10).forEach(line => {
      logMessage('sidepanel', `  ${line}`);
    });
  }
  
  // 3. 测试表格检测
  const hasTable = detectTables(content);
  logMessage('sidepanel', `表格检测结果: ${hasTable}`);
  
  // 4. 测试预处理
  const processedContent = preprocessTencentDocsContent(content);
  logMessage('sidepanel', `预处理结果长度: ${processedContent.length}`);
  
  // 5. 测试渲染
  try {
    if (typeof window.md !== 'undefined') {
      const originalHtml = window.md.render(content);
      const processedHtml = window.md.render(processedContent);
      
      const originalHasTable = /<table/.test(originalHtml);
      const processedHasTable = /<table/.test(processedHtml);
      
      logMessage('sidepanel', `原始内容渲染表格: ${originalHasTable}`);
      logMessage('sidepanel', `处理后渲染表格: ${processedHasTable}`);
      logMessage('sidepanel', `原始HTML长度: ${originalHtml.length}`);
      logMessage('sidepanel', `处理后HTML长度: ${processedHtml.length}`);
      
      // 显示实际的HTML开头
      logMessage('sidepanel', `原始HTML开头: ${originalHtml.substring(0, 200)}`);
      logMessage('sidepanel', `处理后HTML开头: ${processedHtml.substring(0, 200)}`);
    } else {
      logMessage('sidepanel', '❌ markdown-it 未初始化');
    }
  } catch (error) {
    logMessage('error', `渲染测试失败: ${error.message}`);
  }
  
  logMessage('sidepanel', '=== 内容分析完成 ===');
}

// 测试内容预处理功能
function testTableCleaning() {
  logMessage('sidepanel', '=== 开始腾讯文档内容预处理测试 ===');
  
  // 模拟用户失败的内容（包含多种格式问题）
  const problematicContent = `思考过程：

嗯，用户询问网安险与天创机器人产品捆绑销售在化工及电力行业的设计方案。


### ⚙️ **一、行业风险特性与保险需求**

| **行业** | **核心风险场景** | **网安险保障重点** | **政策依据** |

|----------|------------------|-------------------|-------------|

| **化工行业** | 工控系统遭勒索攻击 | 覆盖停产损失 | 《工业控制系统指南》 |

| **电力行业** | 电网监控系统被入侵 | 赔偿电网瘫痪罚款 | 《电力可靠性管理办法》 |



### 🛡️ **二、网安险捆绑方案设计**
- 基础保障套餐
- 行业专属附加险


- 技术减费机制
这是保险+科技+服务的模式。`;

  logMessage('sidepanel', `原始内容长度: ${problematicContent.length}`);
  logMessage('sidepanel', `原始内容行数: ${problematicContent.split('\n').length}`);
  
  // 测试综合预处理功能
  const cleanedContent = preprocessTencentDocsContent(problematicContent);
  logMessage('sidepanel', `预处理后内容长度: ${cleanedContent.length}`);
  logMessage('sidepanel', `预处理后行数: ${cleanedContent.split('\n').length}`);
  
  // 测试检测功能
  const originalHasTable = detectTables(problematicContent);
  const cleanedHasTable = detectTables(cleanedContent);
  logMessage('sidepanel', `原始内容表格检测: ${originalHasTable}`);
  logMessage('sidepanel', `清理后表格检测: ${cleanedHasTable}`);
  
  // 测试渲染
  try {
    if (typeof window.md !== 'undefined') {
      const originalHtml = window.md.render(problematicContent);
      const cleanedHtml = window.md.render(cleanedContent);
      
      const originalHasTableHTML = /<table/.test(originalHtml);
      const cleanedHasTableHTML = /<table/.test(cleanedHtml);
      
      logMessage('sidepanel', `原始内容生成表格HTML: ${originalHasTableHTML}`);
      logMessage('sidepanel', `清理后生成表格HTML: ${cleanedHasTableHTML}`);
      
      if (cleanedHasTableHTML && !originalHasTableHTML) {
        logMessage('sidepanel', '✅ 表格清理成功！修复了渲染问题');
      } else if (cleanedHasTableHTML && originalHasTableHTML) {
        logMessage('sidepanel', '✅ 两种内容都能正常渲染表格');
      } else {
        logMessage('sidepanel', '⚠️ 表格清理后仍无法正常渲染');
      }
      
      // 更新渲染区域显示清理后的结果
      markdownOutput.innerHTML = cleanedHtml;
      updateContentInfo('markdown', cleanedContent);
    }
  } catch (error) {
    logMessage('error', `渲染测试失败: ${error.message}`);
  }
  
  logMessage('sidepanel', '=== 表格清理测试完成 ===');
  return { original: problematicContent, cleaned: cleanedContent };
}

// 各种内容类型的渲染函数
function renderMarkdownContent(content) {
  try {
    logMessage('sidepanel', `开始解析Markdown，内容长度: ${content.length}`);
    logMessage('sidepanel', `内容前200字符: ${content.substring(0, 200)}`);
    
    // 综合预处理腾讯文档内容 - 修复表格、标题、列表等格式问题
    const cleanedContent = preprocessTencentDocsContent(content);
    
    // 增强的表格检测：支持多种表格格式
    const hasTable = detectTables(cleanedContent);
    logMessage('sidepanel', `检测到表格: ${hasTable}`);
    
    // 额外调试：显示匹配到的表格模式
    if (hasTable) {
      const tableMatch = cleanedContent.match(/\|.*\|[\s\S]*?\n\s*\|(\s*[\-:]+\s*\|)+\s*[\s\S]*?(?=\n\s*\n|\n\s*[^|]|\n\s*$|$)/);
      if (tableMatch) {
        logMessage('sidepanel', `匹配到的表格内容: ${tableMatch[0].substring(0, 200)}...`);
      }
    } else {
      // 检查是否有简单的|字符但不是表格
      const hasPipe = /\|/.test(cleanedContent);
      if (hasPipe) {
        const pipes = cleanedContent.match(/\|[^|\n]*\|/g);
        logMessage('sidepanel', `发现竖线字符但非表格，示例: ${pipes ? pipes.slice(0, 3).join(', ') : '无'}`);
      }
    }
    
    // 使用markdown-it进行渲染（支持更好的表格解析）
    let rawHtml;
    
    try {
      // 检查markdown-it是否可用
      if (typeof window.md === 'undefined') {
        throw new Error('markdown-it 未初始化');
      }
      
      // 使用清理后的内容进行渲染
      rawHtml = window.md.render(cleanedContent);
      logMessage('sidepanel', 'markdown-it 渲染成功');
      
    } catch (e1) {
      logMessage('error', `markdown-it 渲染失败: ${e1.message}`);
      
      // 回退到手动表格解析（使用清理后的内容）
      rawHtml = parseMarkdownWithManualTables(cleanedContent);
      logMessage('sidepanel', '使用手动表格解析');
    }
    
    logMessage('sidepanel', `原始HTML长度: ${rawHtml.length}`);
    logMessage('sidepanel', `原始HTML（前200字符）: ${rawHtml.substring(0, 200)}`);
    
    // 检查是否成功生成了表格HTML
    const hasTableHTML = /<table/.test(rawHtml);
    logMessage('sidepanel', `生成的HTML包含table标签: ${hasTableHTML}`);
    
    // 配置DOMPurify以支持表格、Mermaid SVG和必要的属性
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'svg', 'g', 'path', 'circle', 'rect', 'line', 'text', 'tspan', 'defs', 'marker', 'polygon', 'polyline', 'ellipse', 'use', 'foreignObject'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'align', 'style', 'colspan', 'rowspan', 'viewBox', 'width', 'height', 'x', 'y', 'dx', 'dy', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'transform', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'marker-end', 'marker-start', 'text-anchor', 'dominant-baseline', 'font-family', 'font-size', 'font-weight', 'xmlns', 'xmlns:xlink', 'xlink:href']
    });
    
    logMessage('sidepanel', `DOMPurify清理后长度: ${cleanHtml.length}`);
    logMessage('sidepanel', `清理后HTML（前200字符）: ${cleanHtml.substring(0, 200)}`);
    
    // 检查DOMPurify是否保留了表格
    const finalHasTable = /<table/.test(cleanHtml);
    logMessage('sidepanel', `最终HTML包含table标签: ${finalHasTable}`);
    
    return cleanHtml;
  } catch (error) {
    logMessage('error', `Markdown 解析错误: ${error.message}`);
    return `<div class="error-content">Markdown 解析失败: ${error.message}</div>`;
  }
}

// 手动表格解析函数（作为marked.js的回退方案）
function parseMarkdownWithManualTables(content) {
  logMessage('sidepanel', '开始手动表格解析');
  
  try {
    // 先用marked处理非表格部分
    let result = '';
    const lines = content.split('\n');
    let inTable = false;
    let tableLines = [];
    let currentBlock = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isTableLine = /^\s*\|.*\|\s*$/.test(line);
      const isSeparator = /^\s*\|[\s\-:]*\|\s*$/.test(line);
      
      // 更严格的表格行检测：至少要有2个单元格
      const cellCount = line.split('|').filter(cell => cell.trim()).length;
      const isValidTableLine = isTableLine && cellCount >= 2;
      
      if (isValidTableLine || isSeparator) {
        if (!inTable) {
          // 开始表格，处理之前的内容
          if (currentBlock.length > 0) {
            if (typeof window.md !== 'undefined') {
              result += window.md.render(currentBlock.join('\n'));
            } else {
              result += currentBlock.join('\n');
            }
            currentBlock = [];
          }
          inTable = true;
        }
        tableLines.push(line);
      } else {
        if (inTable) {
          // 结束表格，生成表格HTML
          result += generateTableHTML(tableLines);
          tableLines = [];
          inTable = false;
        }
        currentBlock.push(line);
      }
    }
    
    // 处理剩余内容
    if (inTable && tableLines.length > 0) {
      result += generateTableHTML(tableLines);
    }
    if (currentBlock.length > 0) {
      if (typeof window.md !== 'undefined') {
        result += window.md.render(currentBlock.join('\n'));
      } else {
        result += currentBlock.join('\n');
      }
    }
    
    return result;
  } catch (error) {
    logMessage('error', `手动表格解析失败: ${error.message}`);
    // 回退到基本markdown解析
    if (typeof window.md !== 'undefined') {
      return window.md.render(content);
    } else {
      return content;
    }
  }
}

// 预处理表格内容，移除表格中的空行以改善markdown-it解析
function preprocessTableContent(content) {
  try {
    const lines = content.split('\n');
    const processedLines = [];
    let inTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isTableLine = /^\s*\|.*\|\s*$/.test(line);
      
      if (isTableLine) {
        inTable = true;
        processedLines.push(line);
      } else if (inTable && line.trim() === '') {
        // 在表格中遇到空行，跳过不添加
        continue;
      } else if (inTable && !isTableLine) {
        // 表格结束
        inTable = false;
        processedLines.push(line);
      } else {
        // 非表格内容，正常添加
        processedLines.push(line);
      }
    }
    
    const result = processedLines.join('\n');
    logMessage('sidepanel', `表格预处理：${lines.length}行 → ${processedLines.length}行`);
    return result;
    
  } catch (error) {
    logMessage('error', `表格预处理失败: ${error.message}`);
    return content; // 失败时返回原内容
  }
}

// 生成表格HTML
function generateTableHTML(tableLines) {
  if (tableLines.length < 2) return '';
  
  logMessage('sidepanel', `生成表格HTML，行数: ${tableLines.length}`);
  
  try {
    const headerLine = tableLines[0];
    const separatorLine = tableLines[1];
    const dataLines = tableLines.slice(2);
    
    // 解析表头
    const headers = headerLine.split('|').map(cell => cell.trim()).filter(cell => cell);
    
    // 解析对齐方式
    const alignments = separatorLine.split('|').map(cell => {
      const trimmed = cell.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
      if (trimmed.endsWith(':')) return 'right';
      return 'left';
    }).filter((_, index) => index < headers.length);
    
    let html = '<table><thead><tr>';
    
    // 生成表头
    headers.forEach((header, index) => {
      const align = alignments[index] || 'left';
      const alignAttr = align !== 'left' ? ` align="${align}"` : '';
      // 处理表头中的markdown（如粗体）
      let processedHeader;
      if (typeof window.md !== 'undefined') {
        processedHeader = window.md.render(header).replace(/<\/?p>/g, '');
      } else {
        processedHeader = header;
      }
      html += `<th${alignAttr}>${processedHeader}</th>`;
    });
    
    html += '</tr></thead><tbody>';
    
    // 生成数据行
    dataLines.forEach(line => {
      const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
      if (cells.length > 0) {
        html += '<tr>';
        cells.forEach((cell, index) => {
          const align = alignments[index] || 'left';
          const alignAttr = align !== 'left' ? ` align="${align}"` : '';
          // 处理单元格中的markdown
          let processedCell;
          if (typeof window.md !== 'undefined') {
            processedCell = window.md.render(cell).replace(/<\/?p>/g, '');
          } else {
            processedCell = cell;
          }
          html += `<td${alignAttr}>${processedCell}</td>`;
        });
        html += '</tr>';
      }
    });
    
    html += '</tbody></table>';
    
    logMessage('sidepanel', `表格HTML生成完成，长度: ${html.length}`);
    return html;
  } catch (error) {
    logMessage('error', `表格HTML生成失败: ${error.message}`);
    return `<div class="error-content">表格解析失败: ${error.message}</div>`;
  }
}

function renderJSONContent(content, contentType) {
  try {
    const jsonData = JSON.parse(content.trim());
    logMessage('sidepanel', `JSON 解析成功，内容类型: ${contentType}`);
    
    if (contentType === 'json-with-markdown') {
      logMessage('sidepanel', '检测到 JSON + Markdown 混合内容，使用特殊渲染器');
    }
    
    return JSONRenderer.render(jsonData, contentType);
  } catch (error) {
    logMessage('error', `JSON 解析错误: ${error.message}`);
    // 如果JSON解析失败，尝试作为代码渲染
    return renderCodeContent(content, 'json');
  }
}

function renderCodeContent(content, language = '') {
  const highlighted = CodeHighlighter.highlight(content, language);
  return `
    <div class="code-viewer">
      <div class="code-header">代码${language ? ` (${language})` : ''}</div>
      <pre class="code-content"><code class="language-${language}">${highlighted}</code></pre>
    </div>
  `;
}

function renderTableContent(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return renderTextContent(content, 'table');
  
  let html = '<div class="table-viewer"><div class="table-header">表格数据</div><table class="data-table">';
  
  lines.forEach((line, index) => {
    const cells = line.split('\t').map(cell => cell.trim());
    const tag = index === 0 ? 'th' : 'td';
    html += '<tr>' + cells.map(cell => `<${tag}>${escapeHtml(cell)}</${tag}>`).join('') + '</tr>';
  });
  
  html += '</table></div>';
  return html;
}

function renderTextContent(content, contentType) {
  const escapedContent = escapeHtml(content);
  
  // 计算内容统计信息
  const lineCount = content.split('\n').length;
  const charCount = content.length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const isLongText = content.length > 300;
  
  // 统一使用改进后的样式
  const className = 'text-content';
  
  // 为长文本添加内容信息头部
  const headerHtml = isLongText ? `
    <div class="text-header">
      <div class="text-title">文本内容</div>
      <div class="text-meta">
        ${lineCount} 行 · ${charCount} 字符 · ${wordCount} 词
      </div>
    </div>
  ` : '';
  
  return `
    <div class="content-type-${contentType}">
      ${headerHtml}
      <div class="${className}">${escapedContent}</div>
    </div>
  `;
}

function updateContentInfo(contentType, content) {
  if (!contentType || !content) {
    contentInfoElement.style.display = 'none';
    return;
  }
  
  const typeMap = {
    'markdown': 'Markdown',
    'json': 'JSON',
    'json-with-markdown': 'JSON+MD',
    'code': '代码',
    'table': '表格',
    'text': '文本'
  };
  
  const typeName = typeMap[contentType] || contentType;
  const charCount = content.length;
  
  contentInfoElement.textContent = `${typeName} • ${charCount} 字符`;
  contentInfoElement.style.display = 'block';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 切换单个Markdown内容的显示
function toggleMarkdown(id) {
  logMessage('sidepanel', `切换 Markdown 显示: ${id}`);
  
  const element = document.getElementById(id);
  if (!element) {
    logMessage('error', `找不到 Markdown 元素: ${id}`);
    return;
  }
  
  const container = element.closest('.json-markdown-container');
  const button = container.querySelector('.markdown-toggle-btn');
  const icon = button.querySelector('.expand-icon');
  
  if (element.classList.contains('collapsed')) {
    element.classList.remove('collapsed');
    element.classList.add('expanded');
    icon.style.transform = 'rotate(180deg)';
    logMessage('sidepanel', `Markdown 内容已展开: ${id}`);
  } else {
    element.classList.add('collapsed');
    element.classList.remove('expanded');
    icon.style.transform = 'rotate(0deg)';
    logMessage('sidepanel', `Markdown 内容已折叠: ${id}`);
  }
}

// 展开或折叠所有Markdown内容
function toggleAllMarkdown(expand) {
  const allMarkdownContents = document.querySelectorAll('.json-markdown-content');
  const allButtons = document.querySelectorAll('.markdown-toggle-btn .expand-icon');
  
  logMessage('sidepanel', `${expand ? '展开' : '折叠'}所有 Markdown 内容，共 ${allMarkdownContents.length} 个`);
  
  allMarkdownContents.forEach(element => {
    if (expand) {
      element.classList.remove('collapsed');
      element.classList.add('expanded');
    } else {
      element.classList.add('collapsed');
      element.classList.remove('expanded');
    }
  });
  
  allButtons.forEach(icon => {
    icon.style.transform = expand ? 'rotate(180deg)' : 'rotate(0deg)';
  });
}

// 等待DOM完全加载后启动
document.addEventListener('DOMContentLoaded', start);

// 监听页面关闭事件，通知背景脚本侧边栏已关闭
window.addEventListener('beforeunload', function() {
  try {
    chrome.runtime.sendMessage({ type: 'sidePanel_closed' });
  } catch (error) {
    // 忽略错误，可能在扩展卸载时发生
  }
});

// 监听页面隐藏事件（用户切换标签页或关闭侧边栏）
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    try {
      chrome.runtime.sendMessage({ type: 'sidePanel_closed' });
    } catch (error) {
      // 忽略错误
    }
  }
}); 