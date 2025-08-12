// 内容脚本 - 负责从腾讯文档中提取 Markdown 内容

// 清理文本内容，移除多余的空行和空白字符
function cleanTextContent(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .replace(/\n\s*\n\s*\n/g, '\n\n')  // 将连续3个以上换行替换为2个
    .replace(/^\s+|\s+$/g, '')          // 移除开头和结尾空白
    .replace(/[ \t]+$/gm, '')           // 移除每行末尾的空格和制表符
    .replace(/(\|.*\|)\n\s*\n(?=\|)/g, '$1\n');  // 专门处理表格行间的多余空行
}

const debug = true;

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
let lastProcessedTimestamp = 0; // 记录上次处理时间
let lastClickedElement = null; // 记录上次点击的元素

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

// JSON内容修复工具
function tryFixJSONContent(content) {
  if (!content || typeof content !== 'string') return null;
  
  try {
    logMessage(`🔧 尝试修复JSON内容，原始长度: ${content.length}`);
    
    let fixed = content.trim();
    
    // 1. 尝试直接解析
    try {
      JSON.parse(fixed);
      logMessage(`✅ 内容本身就是有效JSON，无需修复`);
      return fixed;
    } catch (e) {
      // 继续修复
    }
    
    // 2. 如果是被引号包装的JSON字符串，先解包
    if (fixed.startsWith('"') && fixed.endsWith('"')) {
      try {
        const unescaped = JSON.parse(fixed); // 这会解除转义
        if (typeof unescaped === 'string') {
          logMessage(`🔧 检测到双重JSON编码，正在解包...`);
          try {
            JSON.parse(unescaped);
            logMessage(`✅ 成功解包双重编码的JSON`);
            return unescaped;
          } catch (e) {
            // 继续其他修复方法
          }
        }
      } catch (e) {
        // 继续其他修复方法
      }
    }
    
    // 3. 移除DOM可能添加的额外换行和空格
    fixed = fixed
      .replace(/\n\s*\n/g, '\n')  // 移除多余空行
      .replace(/\s+/g, ' ')       // 压缩多余空白
      .trim();
    
    // 4. 尝试查找JSON对象的边界
    let startIndex = fixed.indexOf('{');
    let endIndex = fixed.lastIndexOf('}');
    
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const jsonCandidate = fixed.substring(startIndex, endIndex + 1);
      try {
        JSON.parse(jsonCandidate);
        logMessage(`✅ 成功提取JSON对象部分`);
        return jsonCandidate;
      } catch (e) {
        // 继续其他修复方法
      }
    }
    
    // 5. 尝试查找JSON数组的边界
    startIndex = fixed.indexOf('[');
    endIndex = fixed.lastIndexOf(']');
    
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const jsonCandidate = fixed.substring(startIndex, endIndex + 1);
      try {
        JSON.parse(jsonCandidate);
        logMessage(`✅ 成功提取JSON数组部分`);
        return jsonCandidate;
      } catch (e) {
        // 修复失败
      }
    }
    
    logMessage(`❌ JSON修复失败，无法恢复有效的JSON格式`);
    return null;
    
  } catch (error) {
    logMessage(`❌ JSON修复过程中出错: ${error.message}`);
    return null;
  }
}

// JSON处理工具
class JSONProcessor {
  static isJSON(text) {
    if (!text || typeof text !== 'string') return false;
    
    const trimmed = text.trim();
    if (!trimmed) return false;
    
    // 优先检查对象和数组（真正的JSON结构）
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        // 确保解析结果是对象或数组，不是基本类型
        return typeof parsed === 'object' && parsed !== null;
      } catch (e) {
        // JSON.parse失败，可能是格式不完整或有错误
        // 但如果从日志看起来像JSON，我们可以在这里记录
        console.log(`[DEBUG] JSON解析失败但格式看起来像JSON: ${e.message.substring(0, 100)}`);
        return false;
      }
    }
    
    // 对于字符串字面量，要更严格：只有当它本身就是JSON格式的字符串才认为是JSON
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        const parsed = JSON.parse(trimmed);
        // 如果解析出来的字符串内容本身是JSON格式，才认为是JSON
        if (typeof parsed === 'string') {
          const innerTrimmed = parsed.trim();
          if (innerTrimmed.startsWith('{') || innerTrimmed.startsWith('[')) {
            try {
              JSON.parse(innerTrimmed);
              return true;
            } catch (e) {
              return false;
            }
          }
        }
        return false; // 普通字符串不算JSON
      } catch (e) {
        return false;
      }
    }
    
    return false;
  }
  
  static parseJSON(text) {
    try {
      const trimmed = text.trim();
      let parsed = JSON.parse(trimmed);
      
      // 如果解析出来的是字符串，且这个字符串本身是JSON格式，则进一步解析
      if (typeof parsed === 'string') {
        const innerTrimmed = parsed.trim();
        if ((innerTrimmed.startsWith('{') && innerTrimmed.endsWith('}')) ||
            (innerTrimmed.startsWith('[') && innerTrimmed.endsWith(']'))) {
          try {
            parsed = JSON.parse(innerTrimmed);
          } catch (e) {
            // 如果内层解析失败，返回外层解析结果
          }
        }
      }
      
      return parsed;
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
    /#{1,6}\s+.+/,                                      // 标题
    /\*\*[^*]+\*\*/,                                    // 粗体
    /\*[^*]+\*/,                                        // 斜体
    /\[.+?\]\(.+?\)/,                                   // 链接
    /```[\s\S]*?```/,                                   // 代码块
    /`[^`\n]+`/,                                        // 行内代码
    /^\s*[-*+]\s+/m,                                    // 无序列表
    /^\s*\d+\.\s+/m,                                    // 有序列表
    /^\s*>\s+/m,                                        // 引用
    /^\s*\|.*\|[\s\S]*?\n\s*\|[\s\-:]*\|\s*$/m,        // 表格（更严格的匹配）
    /^\s*[-=]{3,}\s*$/m,                                // 分隔线
    /~~[^~]+~~/,                                        // 删除线
    /\$\$[\s\S]+?\$\$/,                                 // LaTeX数学公式块
    /\$[^$\n]+\$/,                                      // 行内LaTeX公式
    /!\[.*?\]\(.+?\)/,                                  // 图片
    /\[\^.+?\]/                                         // 脚注
  ];
  
  static isMarkdown(text) {
    if (!text || typeof text !== 'string' || text.trim().length < 3) return false;
    
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
    
    // 智能检测Markdown语法
    const markdownScore = this.calculateMarkdownScore(text);
    
    // 调试信息
    if (markdownScore > 0) {
      console.log(`[DEBUG] Markdown评分: ${markdownScore}, 内容前50字符: "${text.substring(0, 50)}"`);
    }
    
    // 如果Markdown评分足够高，才认为是Markdown
    return markdownScore >= 2;
  }
  
  // 计算Markdown评分，返回匹配到的Markdown特征数量
  static calculateMarkdownScore(text) {
    let score = 0;
    const lines = text.split('\n');
    
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
    
    // 5. 智能检测列表（更严格）
    const listScore = this.detectListPattern(text);
    score += listScore;
    
    // 6. 检查引用
    if (/^\s*>\s+/m.test(text)) score += 2;
    
    // 7. 检查表格
    if (/^\s*\|.*\|[\s\S]*?\n\s*\|[\s\-:]*\|\s*$/m.test(text)) score += 3;
    
    // 8. 检查分隔线
    if (/^\s*[-=]{3,}\s*$/m.test(text)) score += 2;
    
    // 9. 检查其他格式
    if (/~~[^~]+~~/.test(text)) score += 1; // 删除线
    if (/!\[.*?\]\(.+?\)/.test(text)) score += 2; // 图片
    
    return score;
  }
  
  // 智能检测列表模式
  static detectListPattern(text) {
    const lines = text.split('\n');
    let listLines = 0;
    let totalLines = lines.filter(line => line.trim().length > 0).length;
    
    for (const line of lines) {
      // 检查无序列表模式
      if (/^\s*[-*+]\s+/.test(line)) {
        // 额外验证：列表项通常不会以冒号结尾（避免误判如 "- 必做:" 这样的标题）
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
    // 如果只有少量列表行，评分较低
    if (listLines >= 1) {
      return 1;
    }
    
    return 0;
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
    logMessage(`📄 使用element.value获取内容 (最纯净): ${element.value.substring(0, 30)}...`);
    return element.value;
  }
  
  // 2. 腾讯文档特定的单元格处理
  // 腾讯文档单元格内容通常在特定的容器中
  const cellContent = element.querySelector('.sheet-cell-content, .single-line-cell, [data-id="cell-content"]');
  if (cellContent) {
    const text = cellContent.innerText || cellContent.textContent;
    if (text && text.trim()) {
      logMessage(`📄 使用单元格内容容器中的文本 (可能有DOM污染): ${text.substring(0, 30)}...`);
      return text;
    }
  }
  
  // 3. 针对腾讯文档段落的特殊处理
  if (element.classList.contains('paragraph') || element.classList.contains('para-graph')) {
    const text = element.innerText || element.textContent;
    if (text && text.trim()) {
      logMessage(`📄 使用段落元素的文本 (可能有DOM污染): ${text.substring(0, 30)}...`);
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
        logMessage(`📄 使用富文本编辑器的内容 (可能有DOM污染): ${editorContent.substring(0, 30)}...`);
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

// 获取公式栏内容 - 使用增强的提取策略
function extractFormulaBarContent() {
  try {
    // 优先使用增强的提取策略
    if (typeof EnhancedTextExtractor !== 'undefined') {
      const enhancedResult = EnhancedTextExtractor.extractPureText();
      if (enhancedResult) {
        logMessage("✅ 使用增强提取策略获取到纯净内容");
        return enhancedResult;
      }
    }
    
    // 回退到原有策略但优化顺序
    logMessage("回退到传统提取方法");
    
    // 策略1: 优先从input.value获取（最纯净）
    const inputSelectors = [
      '.formula-input input',
      '.ae-formula-input input', 
      'input[role="combobox"]',
      '.table-input-stage input'
    ];
    
    for (const selector of inputSelectors) {
      const input = document.querySelector(selector);
      if (input && input.value) {
        logMessage(`从input.value获取: ${selector}`);
        return input.value.trim(); // 不需要额外清理
      }
    }
    
    // 策略2: 从HTML结构获取（保持换行符）
    const htmlStructureSelectors = [
      '.formula-bar .formula-input',
      '#alloy-simple-text-editor', 
      '.ae-formula-input'
    ];
    
    for (const selector of htmlStructureSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        // 优先尝试从HTML结构中提取并保持格式
        const htmlContent = element.innerHTML;
        if (htmlContent && htmlContent.trim() && htmlContent !== element.textContent?.trim()) {
          const structuredContent = extractTextFromHTML(htmlContent);
          if (structuredContent && structuredContent.includes('\n')) {
            logMessage(`从HTML结构获取: ${selector} (${structuredContent.split('\n').length}行)`);
            return minimalCleanText(structuredContent);
          }
        }
        
        // 如果HTML没有结构化信息，尝试从textContent恢复结构
        const content = element.textContent;
        if (content && content.trim()) {
          logMessage(`从textContent获取: ${selector}`);
          // 尝试从纯文本中恢复换行结构
          const restoredContent = restoreLineBreaksFromText(minimalCleanText(content));
          if (restoredContent !== content) {
            logMessage(`成功恢复换行结构: ${content.length} → ${restoredContent.length}字符`);
            return restoredContent;
          }
          return minimalCleanText(content);
        }
      }
    }
    
    // 策略3: 最后才使用innerText（可能有DOM污染，但尝试恢复换行）
    const innerTextSelectors = [
      '#mainContainer .formula-input', 
      '.ae-formula-bar .ae-formula-input', 
      '#formula_bar_ssr .formula-input',
      '[role="combobox"][data-placeholder]'
    ];
    
    for (const selector of innerTextSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.innerText || element.textContent;
        if (content && content.trim()) {
          logMessage(`从innerText获取（需要清理）: ${selector}`);
          // 首先尝试恢复换行结构
          const restoredContent = restoreLineBreaksFromText(content);
          if (restoredContent !== content) {
            logMessage(`从innerText恢复换行结构: ${content.length} → ${restoredContent.length}字符`);
            return cleanTextContent(restoredContent);
          }
          // 使用原有的清理函数
          return cleanTextContent(content);
        }
      }
    }
  } catch (error) {
    logMessage(`提取公式栏内容时出错: ${error.message}`);
  }
  
  return '';
}

// 最小化文本清理 - 只处理必要的格式化问题
function minimalCleanText(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .replace(/\r\n/g, '\n')        // 统一换行符
    .replace(/\u00A0/g, ' ')       // 替换不间断空格
    .replace(/^\s+|\s+$/g, '')     // 去除首尾空白
    .replace(/[ \t]+$/gm, '');     // 去除行尾空格
}

// 从HTML结构中提取文本并保持换行符
function extractTextFromHTML(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') return '';
  
  try {
    // 创建临时DOM元素来解析HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // 将块级元素和换行标签转换为换行符
    const blockElements = tempDiv.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6, li, section, article');
    blockElements.forEach(el => {
      if (el.nextSibling) {
        el.insertAdjacentText('afterend', '\n');
      }
    });
    
    // 将br标签转换为换行符
    const brElements = tempDiv.querySelectorAll('br');
    brElements.forEach(br => {
      br.replaceWith('\n');
    });
    
    // 处理列表结构
    const listItems = tempDiv.querySelectorAll('li');
    listItems.forEach(li => {
      if (li.nextSibling) {
        li.insertAdjacentText('afterend', '\n');
      }
    });
    
    // 处理表格结构
    const tableRows = tempDiv.querySelectorAll('tr');
    tableRows.forEach(tr => {
      if (tr.nextSibling) {
        tr.insertAdjacentText('afterend', '\n');
      }
    });
    
    // 获取最终文本
    const extractedText = tempDiv.textContent || tempDiv.innerText || '';
    logMessage(`HTML提取: ${htmlContent.length}字符 → ${extractedText.length}字符`);
    
    return extractedText;
  } catch (error) {
    logMessage(`HTML提取失败: ${error.message}`);
    return '';
  }
}

// 从纯文本中尝试恢复换行结构
function restoreLineBreaksFromText(text) {
  if (!text || typeof text !== 'string') return text;
  
  try {
    // 在常见的Markdown和文本模式之间添加换行
    let restored = text
      // 在标题前后添加换行
      .replace(/([^\n])(#{1,6}\s)/g, '$1\n$2')
      .replace(/(#{1,6}[^\n]+)([^\n])/g, '$1\n$2')
      
      // 在表格行之间添加换行（如果检测到连续的表格行）
      .replace(/(\|[^\|]*\|)(\s*)(\|[^\|]*\|)/g, '$1\n$3')
      
      // 在列表项前添加换行
      .replace(/([^\n])(\s*[-*+]\s)/g, '$1\n$2')
      .replace(/([^\n])(\s*\d+\.\s)/g, '$1\n$2')
      
      // 在段落之间添加换行（检测到句号+空格+大写字母的模式）
      .replace(/([.!?])\s+([A-Z\u4e00-\u9fa5])/g, '$1\n\n$2')
      
      // 在引用块前添加换行
      .replace(/([^\n])(>\s)/g, '$1\n$2')
      
      // 在代码块前后添加换行
      .replace(/([^\n])(```)/g, '$1\n$2')
      .replace(/(```[^\n]*)([^\n])/g, '$1\n$2');
    
    logMessage(`换行恢复: ${text.length}字符 → ${restored.length}字符`);
    return restored;
  } catch (error) {
    logMessage(`换行恢复失败: ${error.message}`);
    return text;
  }
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
  if (!isListening) {
    logMessage("点击事件被忽略：插件未在监听状态");
    return;
  }
  
  logMessage("检测到点击事件");
  
  try {
    // 获取点击的元素
    const targetElement = event.target;
    logMessage(`点击目标: ${targetElement.tagName}, 类名: ${targetElement.className}, ID: ${targetElement.id}`);
    
    // 检查是否点击了单元格相关区域
    const cellSelectors = ['.cell-active', '.cell-selected', '.main-board', '.excel-container', '.block-board', '.sheet-cell', '[role="gridcell"]', 'td', 'th'];
    let isTableCell = null;
    
    for (const selector of cellSelectors) {
      isTableCell = targetElement.closest(selector);
      if (isTableCell) {
        logMessage(`检测到点击了表格相关区域: ${selector}`);
        break;
      }
    }
    
    if (isTableCell) {
      logMessage("使用防抖处理表格单元格点击");
      // 使用防抖处理，传递targetElement参数
      debouncedProcessCell(targetElement);
      return;
    }
    
    // 尝试获取单元格或文本区域
    const cell = getCellOrTextArea(targetElement);
    if (!cell) {
      logMessage("未能找到有效的单元格或文本区域");
      logMessage("尝试直接处理表格单元格内容");
      processTableCellContent(targetElement);
      return;
    }
    
    logMessage(`找到有效的单元格: ${cell.tagName}, 类名: ${cell.className}`);
    
    // 提取文本内容
    const content = extractTextContent(cell);
    logMessage(`提取到的内容长度: ${content ? content.length : 0}`);
    
    // 处理提取的内容
    processExtractedContent(content, targetElement);
    
  } catch (error) {
    ErrorHandler.handle(error, 'handleClick');
  }
}

// 处理提取的内容
function processExtractedContent(content, targetElement = null) {
  let cleanedContent = content?.trim() || '';
  
  if (!cleanedContent) {
    logMessage("提取的内容为空，不处理");
    return;
  }
  
  // 改进的重复内容检测逻辑
  const currentTimestamp = Date.now();
  const timeSinceLastProcess = currentTimestamp - lastProcessedTimestamp;
  
  // 获取点击元素，如果没有传入targetElement则尝试获取当前活动元素
  let clickedElement = null;
  if (targetElement) {
    clickedElement = getCellOrTextArea(targetElement);
  } else {
    // 尝试获取当前活动的单元格
    clickedElement = document.activeElement;
  }
  
  // 检查是否为快速重复点击同一元素（500ms内）
  const isSameElementQuickClick = lastClickedElement === clickedElement && timeSinceLastProcess < 500;
  
  // 检查是否为相同内容且相同元素的较短时间间隔重复处理
  const isSameContentSameElement = cleanedContent === lastProcessedContent && 
                                  lastClickedElement === clickedElement && 
                                  timeSinceLastProcess < 2000;
  
  if (isSameElementQuickClick) {
    logMessage(`快速重复点击同一元素(${timeSinceLastProcess}ms)，跳过处理`);
    return;
  }
  
  if (isSameContentSameElement) {
    logMessage(`相同元素的相同内容且时间间隔较短(${timeSinceLastProcess}ms)，跳过处理`);
    return;
  }
  
  // 如果是不同元素但相同内容，允许处理（用户可能想查看不同位置的相同内容）
  if (cleanedContent === lastProcessedContent && lastClickedElement !== clickedElement) {
    logMessage(`不同元素的相同内容，允许处理`);
  }
  
  // 更新处理记录
  lastProcessedContent = cleanedContent;
  lastProcessedTimestamp = currentTimestamp;
  lastClickedElement = clickedElement;
  
  // 检测内容类型（添加详细调试信息）
  const contentType = MarkdownDetector.getContentType(cleanedContent);
  logMessage(`内容类型: ${contentType}, 长度: ${cleanedContent.length}`);
  
  // 添加内容来源和格式分析
  const isLikelyJSON = cleanedContent.trim().startsWith('{') || cleanedContent.trim().startsWith('"{"');
  const containsPipe = cleanedContent.includes('|');
  logMessage(`内容分析: 疑似JSON=${isLikelyJSON}, 包含竖线=${containsPipe}, 前50字符: ${cleanedContent.substring(0, 50)}`);
  
  let finalContentType = contentType;
  
  if (contentType === 'markdown' && isLikelyJSON) {
    logMessage(`⚠️ 警告: JSON内容被误识别为Markdown! 尝试修复...`);
    
    // 尝试强制重新检测为JSON
    const fixedContent = tryFixJSONContent(cleanedContent);
    if (fixedContent && JSONProcessor.isJSON(fixedContent)) {
      logMessage(`✅ 成功修复JSON格式！重新设置内容类型为JSON`);
      logMessage(`修复前内容长度: ${cleanedContent.length}, 修复后内容长度: ${fixedContent.length}`);
      cleanedContent = fixedContent;
      finalContentType = MarkdownDetector.getContentType(cleanedContent);
      logMessage(`修复后内容类型: ${finalContentType}`);
      logMessage(`修复后内容前50字符: ${cleanedContent.substring(0, 50)}`);
    } else if (fixedContent) {
      // 即使JSON检测失败，但修复成功，也强制设为JSON
      logMessage(`🔧 JSON修复成功但检测失败，强制设置为JSON类型`);
      cleanedContent = fixedContent;
      finalContentType = 'json';
    } else {
      logMessage(`❌ JSON修复失败，保持原始内容类型: ${contentType}`);
    }
  }
  
  // 决定是否处理内容（使用修复后的内容类型）
  const shouldProcess = 
    finalContentType === 'markdown' || 
    finalContentType === 'json-with-markdown' || 
    finalContentType === 'json' ||
    finalContentType === 'code' ||
    finalContentType === 'table' ||
    cleanedContent.length > 50 ||
    (finalContentType === 'text' && cleanedContent.length >= 1); // 处理普通文本内容，包括单个字符
  
  if (shouldProcess) {
    logMessage(`✅ 决定处理内容 (类型: ${finalContentType}, 长度: ${cleanedContent.length})`);
    logMessage(`处理内容: ${cleanedContent.substring(0, 50)}${cleanedContent.length > 50 ? '...' : ''}`);
    
    // 发送内容到背景脚本（使用修复后的内容和类型）
    sendContentToBackground(cleanedContent, finalContentType);
  } else {
    logMessage(`❌ 跳过处理: 内容类型为 ${finalContentType}，长度为 ${cleanedContent.length}，不符合处理条件`);
  }
}

// 发送内容到背景脚本
function sendContentToBackground(content, contentType) {
  try {
    logMessage(`🚀 发送内容到背景脚本 (类型: ${contentType}, 长度: ${content.length})`);
    
    chrome.runtime.sendMessage({
      type: 'markdown_content',
      content: content,
      contentType: contentType,
      timestamp: Date.now()
    }, response => {
      if (response && response.status === 'received') {
        logMessage("✅ 内容已成功发送到背景脚本");
      } else {
        logMessage("❌ 发送内容到背景脚本失败，响应:", response);
      }
    });
  } catch (error) {
    ErrorHandler.handle(error, 'sendContentToBackground');
  }
}

// 处理腾讯文档表格单元格内容
function processTableCellContent(targetElement = null) {
  logMessage("尝试处理表格单元格内容");
  
  try {
    // 尝试多种方法获取内容
    let content = '';
    
    // 1. 首先尝试从公式栏获取内容
    logMessage("📊 方法1: 尝试从公式栏获取内容");
    content = extractFormulaBarContent();
    if (content) {
      logMessage(`✅ 从公式栏获取到内容 [来源:FORMULA_BAR]: ${content.substring(0, 50)}...`);
      logMessage(`📋 公式栏内容格式分析: 长度=${content.length}, 首字符='${content.charAt(0)}', 疑似JSON=${content.trim().startsWith('{') || content.trim().startsWith('"')}`);
    } else {
      logMessage("❌ 公式栏没有内容");
    }
    
    // 2. 如果未获取到内容，尝试从单元格坐标获取
    if (!content) {
      logMessage("🎯 方法2: 尝试从单元格坐标获取内容");
      content = extractContentByCellCoordinate();
      if (content) {
        logMessage(`✅ 从单元格坐标获取到内容 [来源:CELL_COORDINATE]: ${content.substring(0, 50)}...`);
        logMessage(`📋 单元格内容格式分析: 长度=${content.length}, 首字符='${content.charAt(0)}', 疑似JSON=${content.trim().startsWith('{') || content.trim().startsWith('"')}`);
      } else {
        logMessage("❌ 单元格坐标方法没有获取到内容");
      }
    }
    
    // 3. 如果公式栏没有内容，尝试从数据模型获取
    if (!content) {
      logMessage("🔧 方法3: 尝试从数据模型获取内容");
      content = extractCellContentFromDataModel();
      if (content) {
        logMessage(`✅ 从数据模型获取到内容 [来源:DATA_MODEL]: ${content.substring(0, 50)}...`);
        logMessage(`📋 数据模型内容格式分析: 长度=${content.length}, 首字符='${content.charAt(0)}', 疑似JSON=${content.trim().startsWith('{') || content.trim().startsWith('"')}`);
      } else {
        logMessage("❌ 数据模型方法没有获取到内容");
      }
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
            logMessage(`✅ 从DOM选择器获取到内容 [来源:DOM_SELECTOR] [选择器:${selector}]: ${selectionContent.substring(0, 50)}...`);
            logMessage(`📋 DOM内容格式分析: 长度=${selectionContent.length}, 首字符='${selectionContent.charAt(0)}', 疑似JSON=${selectionContent.trim().startsWith('{') || selectionContent.trim().startsWith('"')}`);
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
                logMessage(`✅ 从活动单元格获取到内容 [来源:ACTIVE_CELL_INPUT]: ${inputContent.substring(0, 50)}...`);
                logMessage(`📋 活动单元格内容格式分析: 长度=${inputContent.length}, 首字符='${inputContent.charAt(0)}', 疑似JSON=${inputContent.trim().startsWith('{') || inputContent.trim().startsWith('"')}`);
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
      processExtractedContent(content, targetElement);
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

// 新增：列出当前页面的关键DOM元素
function logAvailableElements() {
  logMessage("分析当前页面DOM结构");
  
  // 检查常见的表格相关选择器
  const selectors = [
    '.excel-container',
    '.main-board', 
    '.block-board',
    '.sheet-cell',
    '[role="gridcell"]',
    'td', 'th',
    '.formula-bar',
    '.formula-input',
    '.table-input-stage',
    '#alloy-rich-text-editor',
    '.single-selection',
    '.cell-editor-container',
    '[contenteditable="true"]'
  ];
  
  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      logMessage(`找到 ${elements.length} 个 "${selector}" 元素`);
      // 记录前几个元素的详细信息
      Array.from(elements).slice(0, 3).forEach((el, index) => {
        logMessage(`  ${selector}[${index}]: ${el.tagName}, class="${el.className}", id="${el.id}"`);
      });
    }
  });
  
  // 检查是否有任何表格
  const tables = document.querySelectorAll('table');
  logMessage(`页面中共有 ${tables.length} 个 table 元素`);
  
  // 检查是否有任何可编辑元素
  const editables = document.querySelectorAll('[contenteditable="true"]');
  logMessage(`页面中共有 ${editables.length} 个可编辑元素`);
}

// 初始化
function initialize() {
  logMessage("初始化内容脚本");
  logMessage(`当前URL: ${window.location.href}`);
  
  // 检查当前 URL 是否是腾讯文档的相关页面
  const currentUrl = window.location.href;
  const isTencentDoc = 
    currentUrl.includes('doc.weixin.qq.com') || 
    currentUrl.includes('docs.qq.com') ||
    currentUrl.includes('doc.qq.com');
  
  // 检查是否是表格模式
  const isSheetMode = 
    currentUrl.includes('/sheet') ||
    currentUrl.includes('excel') ||
    document.querySelector('.excel-container, .main-board, .block-board');
  
  logMessage(`是腾讯文档: ${isTencentDoc}, 是表格模式: ${isSheetMode}`);
  
  // 在腾讯文档页面启用扩展（不仅限于sheet模式）
  if (!isTencentDoc) {
    logMessage("当前页面不是腾讯文档，不启用扩展");
    return;
  }
  
  logMessage(`检测到腾讯文档页面，启用扩展 (表格模式: ${isSheetMode})`);
  
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
        processTableCellContent(e.target);
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
    
    // 移除脚本注入以避免CSP违规
    // injectScriptToAccessInternalAPI(); // 已禁用 - 违反CSP策略
    logMessage("跳过脚本注入（CSP限制）- 使用现有的文本提取方法");
  });
  
  // 立即进行DOM结构分析
  setTimeout(() => {
    logMessage("执行延迟DOM结构分析");
    debugCellStructure();
    logAvailableElements();
  }, 2000);
  
  logMessage(`已在 ${window.location.hostname} 启动内容脚本`);
}

// 注入脚本以访问内部API
function injectScriptToAccessInternalAPI() {
  logMessage("⚠️ 脚本注入已禁用 - 违反Content Security Policy");
  logMessage("使用现有的DOM文本提取方法作为替代方案");
  return; // 提前返回，不执行注入逻辑
  
  // 以下代码已禁用以避免CSP违规
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

// 添加全局测试函数（用于调试）
window.tencentDocExtensionDebug = {
  testExtraction: () => {
    logMessage("手动测试内容提取");
    processTableCellContent();
  },
  
  logDOMStructure: () => {
    logAvailableElements();
  },
  
  testClickHandler: (element) => {
    if (!element) {
      logMessage("请提供一个DOM元素进行测试");
      return;
    }
    logMessage("手动测试点击处理器");
    handleClick({ target: element });
  },
  
  getListeningStatus: () => {
    logMessage(`当前监听状态: ${isListening}`);
    return isListening;
  }
};

// 启动脚本
initialize(); 