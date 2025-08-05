// 内容脚本 - 负责从腾讯文档中提取 Markdown 内容

const debug = false;

// 配置常量
const CONFIG = {
  delays: {
    cellProcess: 300,
    domUpdate: 500,
    debounce: 250
  },
  selectors: {
    formulaBar: '.formula-bar .formula-input, #alloy-simple-text-editor, .ae-formula-input',
    tableInput: '.table-input-stage, #alloy-rich-text-editor',
    cellContent: '.sheet-cell-content, .single-line-cell, [data-id="cell-content"]',
    richTextEditors: '[contenteditable="true"], .doc-editor-container',
    tableCells: '.sheet-cell, [role="gridcell"], td, th',
    tableContainers: '.excel-container, .main-board, .block-board'
  }
};

// DOM缓存
const domCache = {
  formulaBar: null,
  tableInputStage: null,
  tableContainers: [],
  lastCacheTime: 0,
  cacheDuration: 5000, // 5秒缓存
  
  refresh() {
    const now = Date.now();
    if (now - this.lastCacheTime < this.cacheDuration) return;
    
    this.formulaBar = document.querySelector(CONFIG.selectors.formulaBar);
    this.tableInputStage = document.querySelector(CONFIG.selectors.tableInput);
    this.tableContainers = Array.from(document.querySelectorAll(CONFIG.selectors.tableContainers));
    this.lastCacheTime = now;
    logMessage('DOM缓存已刷新');
  },
  
  getFormulaBar() {
    this.refresh();
    return this.formulaBar;
  },
  
  getTableInputStage() {
    this.refresh();
    return this.tableInputStage;
  },
  
  getTableContainers() {
    this.refresh();
    return this.tableContainers;
  }
};

// 防抖工具函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 状态变量
let isListening = true;  // 是否正在监听
let clickHandler = null;
let keydownHandler = null;
let mousedownHandler = null;
let mutationObserver = null;
let lastProcessedContent = ''; // 避免重复处理相同内容

// 错误处理类
class ErrorHandler {
  static handle(error, context, shouldLog = true) {
    const errorMsg = `${context}: ${error.message}`;
    if (shouldLog) {
      logMessage(`[ERROR] ${errorMsg}`);
    }
    
    // 发送错误到背景脚本进行记录
    try {
      chrome.runtime.sendMessage({
        type: 'log',
        source: 'content-error',
        message: errorMsg
      }).catch(() => {}); // 静默失败
    } catch (e) {}
    
    return null;
  }
}

// JSON处理工具
class JSONProcessor {
  static isJSON(text) {
    if (!text || typeof text !== 'string') return false;
    
    const trimmed = text.trim();
    if (!trimmed) return false;
    
    // 检查是否以JSON的开始符号开始
    if (!(trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"'))) {
      return false;
    }
    
    try {
      JSON.parse(trimmed);
      return true;
    } catch (e) {
      return false;
    }
  }
  
  static parseJSON(text) {
    try {
      return JSON.parse(text.trim());
    } catch (e) {
      return null;
    }
  }
  
  // 递归检查JSON中是否包含Markdown内容
  static hasMarkdownInJSON(obj, depth = 0) {
    if (depth > 10) return false; // 防止无限递归
    
    if (typeof obj === 'string') {
      return MarkdownDetector.isMarkdown(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.some(item => this.hasMarkdownInJSON(item, depth + 1));
    }
    
    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(value => this.hasMarkdownInJSON(value, depth + 1));
    }
    
    return false;
  }
  
  // 提取JSON中所有的Markdown内容
  static extractMarkdownFromJSON(obj, depth = 0) {
    const results = [];
    
    if (depth > 10) return results;
    
    if (typeof obj === 'string' && MarkdownDetector.isMarkdown(obj)) {
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
}

// 增强Markdown检测工具
class MarkdownDetector {
  static MARKDOWN_PATTERNS = [
    /#{1,6}\s+.+/,           // 标题
    /\*\*[^*]+\*\*/,         // 粗体
    /\*[^*]+\*/,            // 斜体
    /\[.+?\]\(.+?\)/,        // 链接
    /```[\s\S]*?```/,       // 代码块
    /`[^`\n]+`/,            // 行内代码
    /^\s*[-*+]\s+/m,        // 无序列表
    /^\s*\d+\.\s+/m,        // 有序列表
    /^\s*>\s+/m,            // 引用
    /\|.+\|/,               // 表格
    /^\s*[-=]{3,}\s*$/m,    // 分隔线
    /~~[^~]+~~/,            // 删除线
    /\$\$[\s\S]+?\$\$/,     // LaTeX数学公式块
    /\$[^$\n]+\$/,          // 行内LaTeX公式
    /!\[.*?\]\(.+?\)/,      // 图片
    /\[\^.+?\]/             // 脚注
  ];
  
  static isMarkdown(text) {
    if (!text || typeof text !== 'string' || text.trim().length < 3) return false;
    
    // 检查是否包含Markdown语法
    const hasMarkdownSyntax = this.MARKDOWN_PATTERNS.some(pattern => 
      pattern.test(text)
    );
    
    // 如果没有明显的Markdown语法，检查是否为纯文本
    if (!hasMarkdownSyntax) {
      // 如果文本很短且没有特殊字符，可能不是Markdown
      if (text.length < 20 && !/[#*`\[\]()_~$!]/.test(text)) {
        return false;
      }
      
      // 检查是否包含多行结构化内容
      const lines = text.split('\n');
      if (lines.length > 3 && lines.some(line => line.trim().length > 0)) {
        return true;
      }
    }
    
    return hasMarkdownSyntax;
  }
  
  static getContentType(text) {
    if (!text || text.trim().length === 0) return 'empty';
    
    // 首先检查是否为JSON
    if (JSONProcessor.isJSON(text)) {
      const jsonData = JSONProcessor.parseJSON(text);
      if (jsonData && JSONProcessor.hasMarkdownInJSON(jsonData)) {
        return 'json-with-markdown';
      }
      return 'json';
    }
    
    // 检查是否为Markdown
    if (this.isMarkdown(text)) return 'markdown';
    
    // 检查表格格式
    if (text.includes('\t') || (text.includes('|') && text.split('\n').length > 1)) return 'table';
    
    // 检查代码格式
    if (this.looksLikeCode(text)) return 'code';
    
    return 'text';
  }
  
  static looksLikeCode(text) {
    const codePatterns = [
      /function\s+\w+\s*\(/,     // JavaScript function
      /class\s+\w+/,            // Class definition
      /import\s+.*from/,        // Import statement
      /\w+\s*=\s*\{[\s\S]*\}/,  // Object assignment
      /if\s*\([^)]+\)\s*\{/,    // If statement
      /for\s*\([^)]*\)\s*\{/,   // For loop
      /<\w+[^>]*>/,             // HTML/XML tags
      /SELECT\s+.*FROM/i,       // SQL
      /def\s+\w+\s*\(/,         // Python function
    ];
    
    return codePatterns.some(pattern => pattern.test(text));
  }
}

// 日志函数
function logMessage(message) {
  if (debug) {
    console.log(`[Content] ${message}`);
    // 尝试将日志消息发送到背景脚本，再转发到侧边栏
    try {
      chrome.runtime.sendMessage({
        type: 'log',
        source: 'content',
        message: message
      }).catch(err => {
        // 忽略消息传递错误
      });
    } catch (error) {
      // 忽略错误
    }
  }
}

// 监听来自背景脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'stop_listening') {
    logMessage('收到停止监听的消息');
    stopListening();
    sendResponse({ status: 'stopped' });
    return true;
  }
  
  if (message.type === 'start_listening') {
    logMessage('收到开始监听的消息');
    startListening();
    sendResponse({ status: 'started' });
    return true;
  }
  
  return false;
});

// 停止监听函数
function stopListening() {
  isListening = false;
  logMessage('停止监听所有事件');
  
  // 移除事件监听器
  if (clickHandler) {
    document.removeEventListener('click', clickHandler);
    clickHandler = null;
  }
  
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  
  if (mousedownHandler) {
    document.removeEventListener('mousedown', mousedownHandler, true);
    mousedownHandler = null;
  }
  
  // 断开 MutationObserver
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  
  logMessage('插件已进入休眠状态');
}

// 开始监听函数
function startListening() {
  if (isListening) {
    logMessage('插件已经在监听状态');
    return;
  }
  
  isListening = true;
  logMessage('重新开始监听事件');
  
  // 重新初始化
  initialize();
}

// 从元素中提取文本内容
function extractTextContent(element) {
  if (!element) return '';
  
  // 记录元素信息用于调试
  logMessage(`提取内容从元素: ${element.tagName}, 类名: ${element.className}`);
  
  // 1. 尝试获取值 (对于输入元素)
  if (element.value !== undefined && element.value !== null) {
    return element.value;
  }
  
  // 2. 腾讯文档特定的单元格处理
  // 腾讯文档单元格内容通常在特定的容器中
  const cellContent = element.querySelector('.sheet-cell-content, .single-line-cell, [data-id="cell-content"]');
  if (cellContent) {
    const text = cellContent.innerText || cellContent.textContent;
    if (text && text.trim()) {
      logMessage("使用单元格内容容器中的文本");
      return text;
    }
  }
  
  // 3. 针对腾讯文档段落的特殊处理
  if (element.classList.contains('paragraph') || element.classList.contains('para-graph')) {
    const text = element.innerText || element.textContent;
    if (text && text.trim()) {
      logMessage("使用段落元素的文本");
      return text;
    }
  }
  
  // 4. 尝试找到可能的富文本容器
  const richTextEditors = element.querySelectorAll('[contenteditable="true"], .doc-editor-container');
  if (richTextEditors.length > 0) {
    for (const editor of richTextEditors) {
      // 获取富文本编辑器的内容
      const editorContent = editor.innerText || editor.textContent;
      if (editorContent && editorContent.trim().length > 0) {
        logMessage("使用富文本编辑器的内容");
        return editorContent;
      }
    }
  }
  
  // 5. 检查是否有 data-slate-string 或 data-slate-leaf 属性的子元素 (常见于富文本编辑器)
  const slateElements = element.querySelectorAll('[data-slate-string], [data-slate-leaf]');
  if (slateElements.length > 0) {
    const text = Array.from(slateElements)
      .map(el => el.textContent || '')
      .join('\n')
      .trim();
    if (text) {
      logMessage("使用Slate编辑器元素的文本");
      return text;
    }
  }
  
  // 6. 如果元素是contenteditable，直接获取其内容
  if (element.isContentEditable) {
    const text = element.innerText || element.textContent;
    if (text && text.trim()) {
      logMessage("使用可编辑元素的文本");
      return text;
    }
  }
  
  // 7. 对于表格单元格的特殊处理
  if (element.tagName === 'TD' || element.tagName === 'TH' || 
      element.getAttribute('role') === 'gridcell' || 
      element.classList.contains('sheet-cell')) {
    const text = element.innerText || element.textContent;
    if (text && text.trim()) {
      logMessage("使用表格单元格的文本");
      return text;
    }
  }
  
  // 8. 从表格输入区域获取内容 (腾讯文档特有)
  const tableInputs = document.querySelectorAll('.table-input-stage, #alloy-rich-text-editor');
  if (tableInputs.length > 0) {
    for (const input of tableInputs) {
      if (input && input.isContentEditable) {
        const text = input.innerText || input.textContent;
        if (text && text.trim()) {
          logMessage("使用表格输入区域的文本");
          return text;
        }
      }
    }
  }
  
  // 9. 获取innerText，这通常能保留格式
  const innerText = element.innerText;
  if (innerText && innerText.trim()) {
    logMessage("使用元素的innerText");
    return innerText;
  }
  
  // 10. 最后尝试textContent
  return (element.textContent || '').trim();
}

// 从数据模型中提取单元格内容
function extractCellContentFromDataModel(cellElement) {
  try {
    // 尝试获取选中单元格的内容
    // 腾讯文档表格的单元格内容存储在window对象中
    if (window.basicClientVars && window.basicClientVars.padData) {
      logMessage("找到basicClientVars，尝试提取单元格内容");
      
      // 尝试从选中单元格获取内容
      const selections = document.querySelectorAll('.single-selection, .cell-editor-container, .cell-editor-stage, .table-input-stage');
      for (const selection of selections) {
        if (selection && selection.style.display !== 'none') {
          logMessage(`找到选中单元格: ${selection.className}`);
          
          // 从选中区域或编辑器中查找内容
          const editor = selection.querySelector('#alloy-rich-text-editor, [contenteditable="true"]');
          if (editor) {
            const content = editor.innerText || editor.textContent;
            if (content && content.trim()) {
              logMessage("从编辑器中获取到内容");
              return content.trim();
            }
          }
          
          // 尝试直接从选中区域获取
          const content = selection.innerText || selection.textContent;
          if (content && content.trim()) {
            logMessage("从选中区域获取到内容");
            return content.trim();
          }
        }
      }
    }
  } catch (error) {
    logMessage(`从数据模型提取内容时出错: ${error.message}`);
  }
  
  // 如果无法从数据模型获取，返回空字符串
  return '';
}

// 获取公式栏内容
function extractFormulaBarContent() {
  try {
    // 尝试从公式栏获取内容 - 根据test.html中的结构匹配选择器
    const formulaBar = document.querySelector('.formula-bar .formula-input, #alloy-simple-text-editor, .ae-formula-input');
    if (formulaBar) {
      const content = formulaBar.innerText || formulaBar.textContent;
      if (content && content.trim()) {
        logMessage("从公式栏获取到内容");
        return content.trim();
      }
    }
    
    // 如果上面没找到，尝试更多类名
    const additionalSelectors = [
      '#mainContainer .formula-input', 
      '.ae-formula-bar .ae-formula-input', 
      '#formula_bar_ssr .formula-input',
      '[role="combobox"][data-placeholder]'
    ];
    
    for (const selector of additionalSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.innerText || element.textContent;
        if (content && content.trim()) {
          logMessage(`从${selector}获取到内容`);
          return content.trim();
        }
      }
    }
  } catch (error) {
    logMessage(`提取公式栏内容时出错: ${error.message}`);
  }
  
  return '';
}

// 从单元格坐标获取内容
function extractContentByCellCoordinate() {
  try {
    // 尝试从cell坐标名获取内容（如E11, A1等）
    const cellLabelElement = document.querySelector('.bar-label, .ae-bar-label');
    if (cellLabelElement) {
      const cellCoordinate = cellLabelElement.textContent.trim();
      logMessage(`当前单元格坐标: ${cellCoordinate}`);
      
      // 检查是否有包含此单元格坐标的公式栏
      const formulaInput = document.querySelector('.formula-input, .ae-formula-input');
      if (formulaInput) {
        const content = formulaInput.textContent || formulaInput.innerText;
        if (content && content.trim()) {
          logMessage(`从单元格坐标 ${cellCoordinate} 的公式栏获取内容`);
          return content.trim();
        }
      }
      
      // 如果是正在编辑的单元格
      const editingCells = document.querySelectorAll('.table-input-stage, #alloy-rich-text-editor');
      for (const cell of editingCells) {
        if (cell.style.display !== 'none') {
          const content = cell.textContent || cell.innerText;
          if (content && content.trim()) {
            logMessage(`从单元格坐标 ${cellCoordinate} 的编辑区域获取内容`);
            return content.trim();
          }
        }
      }
    }
  } catch (error) {
    logMessage(`从单元格坐标获取内容时出错: ${error.message}`);
  }
  
  return '';
}

// 尝试获取有效单元格或文本区域
function getCellOrTextArea(element) {
  if (!element) return null;
  
  // 记录点击元素信息用于调试
  logMessage(`点击元素: ${element.tagName}, 类名: ${element.className}, ID: ${element.id}`);
  
  // 1. 腾讯表格单元格的特定选择器
  // 首先检查单元格本身
  if (element.classList.contains('sheet-cell') || 
      element.getAttribute('role') === 'gridcell' ||
      element.tagName === 'TD' || 
      element.tagName === 'TH') {
    logMessage("找到表格单元格元素");
    return element;
  }
  
  // 2. 查找最接近的单元格容器
  const tdocCells = [
    // 腾讯表格单元格
    element.closest('.sheet-cell'),
    element.closest('[role="gridcell"]'),
    element.closest('[data-row-id]'),
    element.closest('td'),
    element.closest('th'),
    // 腾讯文档段落
    element.closest('.paragraph'),
    element.closest('.para-graph'),
    // 编辑器区域
    element.closest('[contenteditable="true"]'),
    element.closest('.doc-editor'),
    // 其他可能的容器
    element.closest('[data-tid]'),
    element.closest('[data-id]')
  ].filter(Boolean);
  
  if (tdocCells.length > 0) {
    logMessage(`找到单元格或编辑区域: ${tdocCells[0].tagName}, 类名: ${tdocCells[0].className}`);
    return tdocCells[0];
  }
  
  // 3. 检查当前活动元素
  const activeElement = document.activeElement;
  if (activeElement && 
    (activeElement.tagName === 'INPUT' || 
     activeElement.tagName === 'TEXTAREA' || 
     activeElement.isContentEditable)) {
    logMessage("使用当前活动元素");
    return activeElement;
  }
  
  // 4. 如果点击区域包含大量文本，可能是一个文本区域
  const text = extractTextContent(element);
  if (text && text.length > 5) { // 至少有一定长度的文本
    logMessage("使用点击的元素（含有足够的文本内容）");
    return element;
  }
  
  // 5. 向上查找可能含有文本的父元素
  let current = element;
  let depth = 0;
  const MAX_DEPTH = 3; // 限制向上查找的层数
  
  while (current && depth < MAX_DEPTH) {
    current = current.parentElement;
    if (!current) break;
    
    const parentText = extractTextContent(current);
    if (parentText && parentText.length > 5) {
      logMessage(`找到含有文本的父元素: ${current.tagName}, 类名: ${current.className}`);
      return current;
    }
    
    depth++;
  }
  
  // 6. 如果没有找到更好的元素，返回点击的元素
  logMessage("使用原始点击元素");
  return element;
}

// 创建防抖版本的处理函数
const debouncedProcessCell = debounce(processTableCellContent, CONFIG.delays.debounce);

// 处理点击事件
function handleClick(event) {
  // 检查是否在监听状态
  if (!isListening) return;
  
  logMessage("检测到点击事件");
  
  try {
    // 获取点击的元素
    const targetElement = event.target;
    
    // 检查是否点击了单元格相关区域
    const isTableCell = targetElement.closest('.cell-active, .cell-selected, .main-board, .excel-container, .block-board');
    if (isTableCell) {
      logMessage("检测到可能点击了表格单元格");
      
      // 使用防抖处理
      debouncedProcessCell();
      return;
    }
    
    // 尝试获取单元格或文本区域
    const cell = getCellOrTextArea(targetElement);
    if (!cell) {
      logMessage("未能找到有效的单元格或文本区域");
      return;
    }
    
    // 提取文本内容
    const content = extractTextContent(cell);
    
    // 处理提取的内容
    processExtractedContent(content);
    
  } catch (error) {
    ErrorHandler.handle(error, 'handleClick');
  }
}

// 处理提取的内容
function processExtractedContent(content) {
  const cleanedContent = content?.trim() || '';
  
  if (!cleanedContent) {
    logMessage("提取的内容为空，不处理");
    return;
  }
  
  // 避免重复处理相同内容
  if (cleanedContent === lastProcessedContent) {
    logMessage("内容与上次相同，跳过处理");
    return;
  }
  
  // 检测内容类型
  const contentType = MarkdownDetector.getContentType(cleanedContent);
  logMessage(`内容类型: ${contentType}, 长度: ${cleanedContent.length}`);
  
  // 决定是否处理内容
  const shouldProcess = 
    contentType === 'markdown' || 
    contentType === 'json-with-markdown' || 
    contentType === 'json' ||
    contentType === 'code' ||
    contentType === 'table' ||
    cleanedContent.length > 50;
  
  if (shouldProcess) {
    lastProcessedContent = cleanedContent;
    
    logMessage(`处理内容: ${cleanedContent.substring(0, 50)}${cleanedContent.length > 50 ? '...' : ''}`);
    
    // 发送内容到背景脚本
    sendContentToBackground(cleanedContent, contentType);
  } else {
    logMessage(`跳过处理: 内容类型为 ${contentType}，不符合处理条件`);
  }
}

// 发送内容到背景脚本
function sendContentToBackground(content, contentType) {
  try {
    chrome.runtime.sendMessage({
      type: 'markdown_content',
      content: content,
      contentType: contentType,
      timestamp: Date.now()
    }, response => {
      if (response && response.status === 'received') {
        logMessage("内容已发送到背景脚本");
      } else {
        logMessage("发送内容到背景脚本失败");
      }
    });
  } catch (error) {
    ErrorHandler.handle(error, 'sendContentToBackground');
  }
}

// 处理腾讯文档表格单元格内容
function processTableCellContent() {
  logMessage("尝试处理表格单元格内容");
  
  try {
    // 尝试多种方法获取内容
    let content = '';
    
    // 1. 首先尝试从公式栏获取内容
    content = extractFormulaBarContent();
    
    // 2. 如果未获取到内容，尝试从单元格坐标获取
    if (!content) {
      content = extractContentByCellCoordinate();
    }
    
    // 3. 如果公式栏没有内容，尝试从数据模型获取
    if (!content) {
      content = extractCellContentFromDataModel();
    }
  
  // 4. 如果数据模型也没有内容，尝试从可见单元格获取
  if (!content) {
    // 基于test.html分析添加更多的选择器
    const selectors = [
      '.single-selection', 
      '.cell-editor-container', 
      '.table-input-stage',
      '.table-input',
      '.table-input-board .table-input-stage', 
      '.operate-board .cell-editor-container',
      '.formula-input',
      '[contenteditable="true"][role="combobox"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element && element.style.display !== 'none') {
          const selectionContent = extractTextContent(element);
          if (selectionContent) {
            content = selectionContent;
            logMessage(`从${selector}获取到内容`);
            break;
          }
        }
      }
      if (content) break;
    }
  }
  
  // 5. 特别检查腾讯文档表格的活动单元格
  if (!content) {
    // 腾讯文档表格的活动单元格通常有特殊标记
    const activeCell = document.querySelector('.single-selection[style*="display: block"]');
    if (activeCell) {
      // 尝试获取选定单元格的坐标
      const cellStyle = activeCell.getAttribute('style') || '';
      const leftMatch = cellStyle.match(/left:\s*(\d+)px/);
      const topMatch = cellStyle.match(/top:\s*(\d+)px/);
      
      if (leftMatch && topMatch) {
        logMessage(`找到活动单元格位置: left=${leftMatch[1]}, top=${topMatch[1]}`);
        
        // 查找附近的单元格输入区域
        const inputAreas = document.querySelectorAll('.table-input-stage, [contenteditable="true"][role="combobox"]');
        for (const input of inputAreas) {
          const inputStyle = input.getAttribute('style') || '';
          const inputLeftMatch = inputStyle.match(/left:\s*(\d+)px/);
          const inputTopMatch = inputStyle.match(/top:\s*(\d+)px/);
          
          if (inputLeftMatch && inputTopMatch) {
            // 计算单元格和输入区域的距离
            const leftDiff = Math.abs(parseInt(leftMatch[1]) - parseInt(inputLeftMatch[1]));
            const topDiff = Math.abs(parseInt(topMatch[1]) - parseInt(inputTopMatch[1]));
            
            // 如果距离较近，可能是同一个单元格
            if (leftDiff < 50 && topDiff < 50) {
              const inputContent = extractTextContent(input);
              if (inputContent) {
                content = inputContent;
                logMessage("从活动单元格附近的输入区域获取内容");
                break;
              }
            }
          }
        }
      }
    }
  }
  
  // 6. 最后一种方法：尝试获取任何显示的单元格输入
  if (!content) {
    const inputAreas = document.querySelectorAll('.table-input, #alloy-rich-text-editor, [contenteditable="true"]');
    for (const input of inputAreas) {
      const inputContent = extractTextContent(input);
      if (inputContent) {
        content = inputContent;
        break;
      }
    }
  }
  
    // 如果找到了内容，处理它
    if (content) {
      processExtractedContent(content);
    } else {
      logMessage("未能提取表格单元格内容");
    }
    
  } catch (error) {
    ErrorHandler.handle(error, 'processTableCellContent');
  }
}

// 添加无障碍键盘快捷键: Ctrl+~ 切换无障碍模式
function handleAccessibilityToggle(event) {
  // 检测 Ctrl+~ (Windows/Linux) 或 Command+~ (Mac)
  if ((event.ctrlKey || event.metaKey) && event.key === '`') {
    logMessage("检测到无障碍切换快捷键 Ctrl/Cmd+~");
    
    // 阻止默认行为
    event.preventDefault();
    
    // 通知背景脚本切换无障碍模式
    chrome.runtime.sendMessage({
      type: 'toggle_accessibility'
    }, response => {
      if (response && response.status === 'toggled') {
        logMessage(`无障碍模式已${response.enabled ? '启用' : '禁用'}`);
      }
    });
  }
}

// 使用键盘快捷键处理当前选中或焦点元素中的内容
function handleKeyboardShortcut(event) {
  // 处理无障碍切换
  if ((event.ctrlKey || event.metaKey) && event.key === '`') {
    handleAccessibilityToggle(event);
    return;
  }
  
  // 检测 Ctrl+Shift+M (Windows) 或 Command+Shift+M (Mac)
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'M') {
    logMessage("检测到快捷键 Ctrl/Cmd+Shift+M");
    
    // 阻止默认行为
    event.preventDefault();
    
    // 获取当前选中文本
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      // 使用选中文本
      const selectedText = selection.toString().trim();
      logMessage(`使用选中的文本: ${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}`);
      
      // 发送内容到背景脚本
      chrome.runtime.sendMessage({
        type: 'markdown_content',
        content: selectedText
      });
      
      return;
    }
    
    // 如果没有选中文本，检查活动元素
    const activeElement = document.activeElement;
    if (activeElement) {
      const cell = getCellOrTextArea(activeElement);
      if (cell) {
        const content = extractTextContent(cell);
        if (content) {
          logMessage(`使用活动元素中的文本: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
          
          // 发送内容到背景脚本
          chrome.runtime.sendMessage({
            type: 'markdown_content',
            content: content
          });
          
          return;
        }
      }
    }
    
    // 特殊处理表格
    processTableCellContent();
  }
}

// 设置MutationObserver来监视DOM变化
function setupMutationObserver() {
  logMessage("设置MutationObserver");
  
  // 创建一个观察器实例
  const observer = new MutationObserver((mutations) => {
    // 检查是否在监听状态
    if (!isListening) return;
    
    // 检查是否有相关的表格单元格选择或编辑操作
    let processCellContent = false;
    
    for (const mutation of mutations) {
      // 检查是否有表格单元格相关元素被添加
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查是否添加了与单元格相关的元素
            const isTableRelated = 
              node.classList?.contains('single-selection') ||
              node.classList?.contains('table-input-stage') ||
              node.classList?.contains('cell-editor-container') ||
              node.classList?.contains('table-input') ||
              node.classList?.contains('select-selection-border') ||
              node.id === 'alloy-rich-text-editor' ||
              node.id === 'alloy-simple-text-editor';
              
            if (isTableRelated) {
              processCellContent = true;
              logMessage(`检测到表格相关元素添加: ${node.className || node.id}`);
              break;
            }
            
            // 检查子元素
            const tableRelatedChildren = node.querySelectorAll(
              '.single-selection, .table-input-stage, .cell-editor-container, ' +
              '#alloy-rich-text-editor, .table-input, .select-selection-border, ' +
              '[contenteditable="true"][role="combobox"], .formula-input'
            );
            
            if (tableRelatedChildren.length > 0) {
              processCellContent = true;
              logMessage(`检测到表格相关子元素: ${tableRelatedChildren.length}个`);
              break;
            }
          }
        }
      }
      
      // 检查属性变化，特别是style和display属性
      if (mutation.type === 'attributes' && 
         (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
        const target = mutation.target;
        
        // 检查是否是表格相关元素
        const isTableRelated = 
          target.classList?.contains('single-selection') ||
          target.classList?.contains('table-input-stage') ||
          target.classList?.contains('cell-editor-container') ||
          target.classList?.contains('table-input') ||
          target.classList?.contains('select-selection-border') || 
          target.id === 'alloy-rich-text-editor' ||
          target.id === 'alloy-simple-text-editor';
          
        if (isTableRelated) {
          // 检查元素是否变为可见
          const isVisible = 
            target.style.display !== 'none' && 
            (
              target.style.width !== '0px' || 
              target.style.height !== '0px' ||
              target.classList.contains('select-selection-border') ||
              target.classList.contains('cell-active')
            );
            
          if (isVisible) {
            processCellContent = true;
            logMessage(`检测到表格相关元素变为可见: ${target.className || target.id}`);
            break;
          }
        }
      }
    }
    
    // 如果发现有单元格相关的变化，处理单元格内容
    if (processCellContent) {
      // 延迟处理，等待DOM完全更新
      setTimeout(() => {
        processTableCellContent();
      }, 300);
    }
  });
  
  // 配置观察选项
  const config = {
    childList: true,    // 观察目标子节点的添加或删除
    attributes: true,   // 观察属性变化
    subtree: true,      // 观察所有后代节点
    attributeFilter: ['style', 'class', 'display'] // 只观察这些属性的变化
  };
  
  // 开始观察文档
  observer.observe(document.body, config);
  
  // 特别关注表格区域
  const tableContainers = [
    '.excel-container', 
    '.main-board',
    '.table-input-board',
    '.formula-bar',
    '#mainContainer'
  ];
  
  for (const selector of tableContainers) {
    const container = document.querySelector(selector);
    if (container) {
      logMessage(`单独监视表格容器: ${selector}`);
      observer.observe(container, config);
    }
  }
  
  return observer;
}

// 调试函数 - 用于输出有用的信息
function debugCellStructure() {
  logMessage("调试表格结构");
  
  // 记录基本客户端变量
  logMessage(`基本客户端变量存在: ${!!window.basicClientVars}`);
  
  // 记录公式栏
  const formulaBar = document.querySelector('.formula-bar');
  if (formulaBar) {
    logMessage(`公式栏: ${formulaBar.outerHTML.substring(0, 100)}...`);
  } else {
    logMessage("未找到公式栏");
  }
  
  // 记录单元格选择器
  const selections = document.querySelectorAll('.single-selection');
  logMessage(`找到 ${selections.length} 个单元格选择器`);
  
  // 记录编辑器
  const editors = document.querySelectorAll('#alloy-rich-text-editor, .table-input-stage');
  logMessage(`找到 ${editors.length} 个编辑器`);
  
  // 记录表格区域
  const tableArea = document.querySelector('.excel-container');
  if (tableArea) {
    logMessage(`表格区域: ${tableArea.outerHTML.substring(0, 100)}...`);
  } else {
    logMessage("未找到表格区域");
  }
}

// 初始化
function initialize() {
  logMessage("初始化内容脚本");
  
  // 检查当前 URL 是否是腾讯文档的 sheet 模式
  const currentUrl = window.location.href;
  const isSheetMode = currentUrl.includes('doc.weixin.qq.com/sheet');
  
  // 只在腾讯文档的 sheet 模式下启用扩展
  if (!isSheetMode) {
    logMessage("当前页面不是腾讯文档 sheet 模式，不启用扩展");
    return;
  }
  
  logMessage("检测到腾讯文档 sheet 模式，启用扩展");
  
  // 保存事件处理函数引用
  clickHandler = handleClick;
  keydownHandler = handleKeyboardShortcut;
  mousedownHandler = function(e) {
    // 检查是否在监听状态
    if (!isListening) return;
    
    // 识别表格相关元素
    const tableElement = e.target.closest('.excel-container, .main-board, .block-board');
    if (tableElement) {
      // 在点击后延迟一段时间，等待DOM更新
      setTimeout(() => {
        processTableCellContent();
      }, 300);
    }
  };
  
  // 添加点击事件监听
  document.addEventListener('click', clickHandler);
  
  // 添加键盘快捷键监听
  document.addEventListener('keydown', keydownHandler);

  // 添加光标监听
  document.addEventListener('mousedown', mousedownHandler, true);
  
  // 设置MutationObserver
  mutationObserver = setupMutationObserver();
  
  // 添加文档加载完成的处理
  window.addEventListener('load', () => {
    logMessage("页面完全加载");
    debugCellStructure();
    
    // 注入脚本以访问内部API
    injectScriptToAccessInternalAPI();
  });
  
  logMessage(`已在 ${window.location.hostname} 启动内容脚本`);
}

// 注入脚本以访问内部API
function injectScriptToAccessInternalAPI() {
  logMessage("注入脚本以访问内部API");
  
  const scriptContent = `
    // 创建一个通信通道
    window.addEventListener('message', function(event) {
      // 确保消息来源是当前窗口
      if (event.source !== window) return;
      
      if (event.data && event.data.type === 'GET_CELL_CONTENT') {
        // 尝试获取单元格内容
        let content = '';
        
        // 尝试从基本客户端变量获取
        if (window.basicClientVars) {
          // 这里我们可以访问内部API和数据结构
          const currentCellCoordinates = event.data.cellCoordinates;
          
          // 尝试从公式栏获取内容
          const formulaInput = document.querySelector('.formula-input');
          if (formulaInput) {
            content = formulaInput.innerText || formulaInput.textContent;
          }
          
          // 响应消息
          window.postMessage({
            type: 'CELL_CONTENT_RESPONSE',
            content: content,
            success: !!content
          }, '*');
        } else {
          // 无法访问内部API
          window.postMessage({
            type: 'CELL_CONTENT_RESPONSE',
            success: false,
            error: '无法访问内部API'
          }, '*');
        }
      }
    });
    
    // 通知内容脚本注入脚本已加载
    window.postMessage({
      type: 'SCRIPT_INJECTED',
      timestamp: Date.now()
    }, '*');
  `;
  
  // 创建脚本元素
  const script = document.createElement('script');
  script.textContent = scriptContent;
  
  // 插入到页面头部
  (document.head || document.documentElement).appendChild(script);
  
  // 添加消息监听器接收注入脚本的响应
  window.addEventListener('message', function(event) {
    // 确保消息来源是当前窗口
    if (event.source !== window) return;
    
    // 处理注入脚本加载消息
    if (event.data && event.data.type === 'SCRIPT_INJECTED') {
      logMessage("注入脚本已加载");
    }
    
    // 处理单元格内容响应
    if (event.data && event.data.type === 'CELL_CONTENT_RESPONSE') {
      if (event.data.success && event.data.content) {
        logMessage(`从注入脚本获取的单元格内容: ${event.data.content}`);
        
        // 发送到背景脚本
        chrome.runtime.sendMessage({
          type: 'markdown_content',
          content: event.data.content.trim()
        });
      } else if (event.data.error) {
        logMessage(`注入脚本错误: ${event.data.error}`);
      }
    }
  });
}

// 启动脚本
initialize(); 