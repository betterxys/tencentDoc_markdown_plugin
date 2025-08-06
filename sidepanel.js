// 侧边栏脚本 - 负责渲染 Markdown

const debug = true;

// DOM 元素引用 - 将在DOM加载完成后初始化
let markdownOutput, timestampElement, contentInfoElement, logMessages, debugConsole;
let refreshButton, toggleLogButton, clearLogButton, copyLogButton, copyButton, viewModeButton, pinButton;

// 状态变量
let isDebugVisible = false;
let isAccessibilityModeEnabled = false;
let isPinned = true; // 默认开启置顶状态
let currentContent = ''; // 存储当前内容用于复制
let currentContentType = 'text'; // 存储当前内容类型
let currentViewMode = 'rendered'; // 'rendered' 或 'source'

// 初始化DOM元素引用
function initializeDOMReferences() {
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
  pinButton = document.getElementById('pin-btn');
  
  // 验证所有重要元素都找到了
  const requiredElements = {
    markdownOutput, timestampElement, contentInfoElement, logMessages, debugConsole,
    refreshButton, toggleLogButton, clearLogButton, copyLogButton, 
    copyButton, viewModeButton, pinButton
  };
  
  const missingElements = Object.entries(requiredElements)
    .filter(([name, element]) => !element)
    .map(([name]) => name);
  
  if (missingElements.length > 0) {
    console.error('❌ 以下DOM元素未找到:', missingElements);
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

// 切换置顶状态
function togglePinStatus() {
  isPinned = !isPinned;
  
  // 更新按钮样式
  if (isPinned) {
    pinButton.classList.add('pinned');
    markdownOutput.classList.remove('hidden');
    logMessage('sidepanel', '置顶状态开启，markdown区域展开');
    
    // 通知背景脚本恢复监听
    chrome.runtime.sendMessage({
      type: 'start_listening'
    }).then(response => {
      logMessage('sidepanel', `内容脚本监听已恢复: ${JSON.stringify(response)}`);
    }).catch(err => {
      logMessage('sidepanel', `恢复内容脚本监听失败: ${err.message}`);
    });
  } else {
    pinButton.classList.remove('pinned');
    markdownOutput.classList.add('hidden');
    logMessage('sidepanel', '置顶状态关闭，markdown区域收起');
    
    // 立即通知背景脚本关闭侧边栏
    logMessage('sidepanel', '准备发送关闭侧边栏请求');
    chrome.runtime.sendMessage({
      type: 'close_sidepanel'
    }).then(response => {
      logMessage('sidepanel', `关闭侧边栏请求已发送，响应: ${JSON.stringify(response)}`);
    }).catch(err => {
      logMessage('sidepanel', `通知关闭侧边栏失败: ${err.message}`);
    });
  }
  
  // 保存状态到chrome.storage
  chrome.storage.local.set({ isPinned: isPinned }, () => {
    logMessage('sidepanel', `置顶状态已保存: ${isPinned}`);
  });
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
    
    const patterns = [
      /#{1,6}\s+.+/,
      /\*\*[^*]+\*\*/,
      /\*[^*]+\*/,
      /\[.+?\]\(.+?\)/,
      /```[\s\S]*?```/,
      /`[^`\n]+`/,
      /^\s*[-*+]\s+/m,
      /^\s*\d+\.\s+/m,
      /^\s*>\s+/m,
      /\|.+\|/
    ];
    
    return patterns.some(pattern => pattern.test(text));
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
      
      // 检查置顶状态，如果置顶关闭则保持隐藏
      if (!isPinned) {
        markdownOutput.classList.add('hidden');
      }
      
      logMessage('sidepanel', '渲染完成');
    } catch (error) {
      logMessage('error', `渲染过程中发生错误: ${error.message}`);
      showError(`渲染过程中发生错误: ${error.message}`);
    }
  }, 100);
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
  chrome.storage.local.get(['lastMarkdownContent', 'contentType', 'timestamp', 'accessibilityMode', 'isPinned'], function(data) {
    // 设置置顶状态
    if (data.isPinned !== undefined) {
      isPinned = data.isPinned;
    }
    
    // 更新置顶按钮状态
    if (isPinned) {
      pinButton.classList.add('pinned');
      markdownOutput.classList.remove('hidden');
    } else {
      pinButton.classList.remove('pinned');
      markdownOutput.classList.add('hidden');
    }
    
    // 设置无障碍模式
    if (data.accessibilityMode !== undefined) {
      setAccessibilityMode(data.accessibilityMode);
    }
    
    if (data.lastMarkdownContent && isPinned) {
      logMessage('sidepanel', `从存储中加载上次的内容 (${data.timestamp})`);
      logMessage('sidepanel', `内容类型: ${data.contentType || 'unknown'}, 长度: ${data.lastMarkdownContent.length}`);
      renderMarkdown(data.lastMarkdownContent, data.timestamp, undefined, data.contentType || 'text');
    }
  });
  
  // 通知背景脚本侧边栏已初始化
  chrome.runtime.sendMessage({ type: 'sidePanel_initialized' }, function(response) {
    logMessage('sidepanel', `背景脚本响应初始化: ${JSON.stringify(response)}`);
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
  
  if (pinButton) {
    pinButton.addEventListener('click', togglePinStatus);
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
    // 检查markdown-it是否可用
    if (typeof markdownit === 'undefined') {
      logMessage('error', 'markdown-it 未加载');
      return;
    }
    
    // 创建markdown-it实例，启用所有增强功能
    window.md = markdownit({
      html: false,        // 不允许HTML标签
      xhtmlOut: false,    // 不使用XHTML输出
      breaks: false,      // 不将换行符转换为<br>
      langPrefix: 'language-',  // CSS语言前缀
      linkify: true,      // 自动检测链接
      typographer: true,  // 启用智能引号和其他排版增强
      quotes: '""''',     // 智能引号字符
    });
    
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

// 启动侧边栏
function start() {
  try {
    // 首先初始化DOM元素引用
    if (!initializeDOMReferences()) {
      throw new Error('DOM元素初始化失败');
    }
    
    // 初始化markdown-it
    initializeMarkdownIt();
    
    // 设置事件监听器
    setupEventListeners();
    
    // 初始化侧边栏
    initializeSidePanel();
    
    // 添加表格测试到全局作用域供调试使用
    window.testTableRendering = testTableRendering;
    window.testContentTableDetection = testContentTableDetection;
    logMessage('sidepanel', '添加了全局调试函数: window.testTableRendering(), window.testContentTableDetection()');
  } catch (error) {
    console.error('侧边栏启动错误:', error);
    if (markdownOutput) {
      showError(`侧边栏启动失败: ${error.message}`);
    }
  }
}

// 各种内容类型的渲染函数
function renderMarkdownContent(content) {
  try {
    logMessage('sidepanel', `开始解析Markdown，内容长度: ${content.length}`);
    logMessage('sidepanel', `内容前200字符: ${content.substring(0, 200)}`);
    
    // 改进的表格检测：需要有表头分隔符，支持多列表格
    const hasTable = /\|.*\|[\s\S]*?\n\s*\|(\s*[\-:]+\s*\|)+\s*/.test(content);
    logMessage('sidepanel', `检测到表格: ${hasTable}`);
    
    // 额外调试：显示匹配到的表格模式
    if (hasTable) {
      const tableMatch = content.match(/\|.*\|[\s\S]*?\n\s*\|(\s*[\-:]+\s*\|)+\s*[\s\S]*?(?=\n\s*\n|\n\s*[^|]|\n\s*$|$)/);
      if (tableMatch) {
        logMessage('sidepanel', `匹配到的表格内容: ${tableMatch[0].substring(0, 200)}...`);
      }
    } else {
      // 检查是否有简单的|字符但不是表格
      const hasPipe = /\|/.test(content);
      if (hasPipe) {
        const pipes = content.match(/\|[^|\n]*\|/g);
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
      
      // 使用markdown-it渲染
      rawHtml = window.md.render(content);
      logMessage('sidepanel', 'markdown-it 渲染成功');
      
    } catch (e1) {
      logMessage('error', `markdown-it 渲染失败: ${e1.message}`);
      
      // 回退到手动表格解析
      rawHtml = parseMarkdownWithManualTables(content);
      logMessage('sidepanel', '使用手动表格解析');
    }
    
    logMessage('sidepanel', `原始HTML长度: ${rawHtml.length}`);
    logMessage('sidepanel', `原始HTML（前200字符）: ${rawHtml.substring(0, 200)}`);
    
    // 检查是否成功生成了表格HTML
    const hasTableHTML = /<table/.test(rawHtml);
    logMessage('sidepanel', `生成的HTML包含table标签: ${hasTableHTML}`);
    
    // 配置DOMPurify以支持表格和必要的属性
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'align', 'style', 'colspan', 'rowspan']
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
  
  // 为长文本添加更好的样式
  const isLongText = content.length > 100;
  const className = isLongText ? 'text-content long-text' : 'text-content';
  
  return `
    <div class="content-type-${contentType}">
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