// 侧边栏脚本 - 负责渲染 Markdown

const debug = true;

// DOM 元素引用
const markdownOutput = document.getElementById('markdown-output');
const timestampElement = document.getElementById('timestamp');
const logMessages = document.getElementById('log-messages');
const debugConsole = document.getElementById('debug-console');
const refreshButton = document.getElementById('refresh-btn');
const toggleLogButton = document.getElementById('toggle-log-btn');
const clearLogButton = document.getElementById('clear-log-btn');
const copyButton = document.getElementById('copy-btn');
const viewModeButton = document.getElementById('view-mode-btn');
const pinButton = document.getElementById('pin-btn');

// 状态变量
let isDebugVisible = false;
let isAccessibilityModeEnabled = false;
let isPinned = true; // 默认开启置顶状态
let currentContent = ''; // 存储当前内容用于复制
let currentContentType = 'text'; // 存储当前内容类型
let currentViewMode = 'rendered'; // 'rendered' 或 'source'

// 日志函数
function logMessage(source, message) {
  if (debug) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[SidePanel] [${source}] ${message}`);
    
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
    const markdownContents = this.extractMarkdownFromJSON(jsonData);
    let html = `<div class="json-with-markdown">`;
    
    // 显示结构化的JSON
    html += `
      <div class="json-structure">
        <h3>JSON 结构</h3>
        ${this.renderJSONStructure(jsonData)}
      </div>
    `;
    
    // 显示提取的Markdown内容
    if (markdownContents.length > 0) {
      html += `<div class="markdown-sections">`;
      html += `<h3>Markdown 内容 (${markdownContents.length} 项)</h3>`;
      
      markdownContents.forEach((markdown, index) => {
        try {
          const rendered = DOMPurify.sanitize(marked.parse(markdown));
          html += `
            <div class="markdown-section">
              <div class="markdown-section-header">Markdown 片段 ${index + 1}</div>
              <div class="markdown-section-content">${rendered}</div>
            </div>
          `;
        } catch (error) {
          html += `
            <div class="markdown-section error">
              <div class="markdown-section-header">Markdown 片段 ${index + 1} (解析失败)</div>
              <pre>${this.escapeHtml(markdown)}</pre>
            </div>
          `;
        }
      });
      
      html += `</div>`;
    }
    
    html += `</div>`;
    return html;
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
      
      // 添加内容类型指示器
      addContentTypeIndicator(contentType);
      
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

// 初始化侧边栏
function initializeSidePanel() {
  logMessage('sidepanel', '侧边栏初始化');
  
  // 确保调试控制台默认隐藏
  debugConsole.classList.add('hidden');
  
  // 从 chrome.storage.local 获取最后的内容和设置
  chrome.storage.local.get(['lastMarkdownContent', 'timestamp', 'accessibilityMode', 'isPinned'], function(data) {
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
      renderMarkdown(data.lastMarkdownContent, data.timestamp);
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
  
  // 刷新按钮点击
  refreshButton.addEventListener('click', reloadSidePanel);
  
  // 切换日志按钮点击
  toggleLogButton.addEventListener('click', toggleDebugConsole);
  
  // 清除日志按钮点击
  clearLogButton.addEventListener('click', clearLogs);
  
  // 复制按钮点击
  copyButton.addEventListener('click', copyToClipboard);
  
  // 查看模式切换按钮点击
  viewModeButton.addEventListener('click', toggleViewMode);
  
  // 置顶按钮点击
  pinButton.addEventListener('click', togglePinStatus);
  
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

// 启动侧边栏
function start() {
  try {
    setupEventListeners();
    initializeSidePanel();
  } catch (error) {
    console.error('侧边栏启动错误:', error);
    showError(`侧边栏启动失败: ${error.message}`);
  }
}

// 各种内容类型的渲染函数
function renderMarkdownContent(content) {
  try {
    const rawHtml = marked.parse(content);
    return DOMPurify.sanitize(rawHtml);
  } catch (error) {
    logMessage('error', `Markdown 解析错误: ${error.message}`);
    return `<div class="error-content">Markdown 解析失败: ${error.message}</div>`;
  }
}

function renderJSONContent(content, contentType) {
  try {
    const jsonData = JSON.parse(content.trim());
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
  return `<div class="content-type-${contentType}"><pre class="text-content">${escapedContent}</pre></div>`;
}

function addContentTypeIndicator(contentType) {
  if (contentType && contentType !== 'markdown') {
    const typeMap = {
      'json': 'JSON 数据',
      'json-with-markdown': 'JSON + Markdown',
      'code': '代码',
      'table': '表格数据',
      'text': '纯文本'
    };
    
    const typeIndicator = document.createElement('div');
    typeIndicator.className = 'content-type-indicator';
    typeIndicator.textContent = `内容类型: ${typeMap[contentType] || contentType}`;
    markdownOutput.insertBefore(typeIndicator, markdownOutput.firstChild);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 启动
start(); 