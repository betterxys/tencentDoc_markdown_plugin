// 增强的文本提取策略 - 从源头获取严格一致的原始文本
// 目标：在提取阶段就避免DOM污染，获取与原始数据完全一致的文本

class EnhancedTextExtractor {
  
  /**
   * 主要提取策略 - 按优先级尝试不同的数据源
   */
  static extractPureText() {
    const strategies = [
      this.extractFromDataModel,      // 策略1: 数据模型（最纯净）
      this.extractFromInputValue,     // 策略2: input.value（次纯净）
      this.extractFromDataAttributes, // 策略3: data属性
      this.extractFromTextContent,    // 策略4: textContent（比innerText好）
      this.extractFromCleanDOM       // 策略5: 清理后的DOM（最后选择）
    ];
    
    for (const strategy of strategies) {
      try {
        const result = strategy.call(this);
        if (result && result.trim()) {
          console.log(`✅ 使用策略: ${strategy.name}`);
          return this.validateAndReturn(result, strategy.name);
        }
      } catch (error) {
        console.log(`❌ 策略失败 ${strategy.name}: ${error.message}`);
      }
    }
    
    console.log('❌ 所有提取策略都失败了');
    return '';
  }
  
  /**
   * 策略1: 从腾讯文档的数据模型中直接获取原始文本
   * 这是最理想的方法，完全绕过DOM渲染
   */
  static extractFromDataModel() {
    // 检查腾讯文档的全局数据对象
    const dataObjects = [
      'window.basicClientVars',
      'window.__INITIAL_STATE__',
      'window.App',
      'window.sheetsData',
      'window.cellData'
    ];
    
    for (const objPath of dataObjects) {
      try {
        const obj = this.getNestedObject(window, objPath.replace('window.', ''));
        if (obj) {
          console.log(`找到数据对象: ${objPath}`);
          
          // 尝试获取当前选中单元格的数据
          const cellData = this.extractCellDataFromObject(obj);
          if (cellData) {
            return cellData;
          }
        }
      } catch (e) {
        // 忽略错误，继续下一个
      }
    }
    
    return null;
  }
  
  /**
   * 策略2: 从input元素的value属性获取原始值
   * input.value通常是最接近原始数据的
   */
  static extractFromInputValue() {
    const inputSelectors = [
      '.formula-input input',
      '.ae-formula-input input',
      'input[role="combobox"]',
      '.table-input-stage input',
      '#alloy-simple-text-editor input',
      'input[type="text"]'
    ];
    
    for (const selector of inputSelectors) {
      const input = document.querySelector(selector);
      if (input && input.value) {
        console.log(`从input.value获取: ${selector}`);
        return input.value;
      }
    }
    
    // 检查contenteditable元素的数据属性
    const editables = document.querySelectorAll('[contenteditable="true"]');
    for (const editable of editables) {
      if (editable.dataset.value || editable.value) {
        return editable.dataset.value || editable.value;
      }
    }
    
    return null;
  }
  
  /**
   * 策略3: 从data-*属性中获取原始数据
   * 现代Web应用经常在data属性中存储原始数据
   */
  static extractFromDataAttributes() {
    const containers = [
      '.formula-input',
      '.ae-formula-input', 
      '.table-input-stage',
      '.cell-editor-container',
      '[role="combobox"]'
    ];
    
    for (const selector of containers) {
      const element = document.querySelector(selector);
      if (element) {
        // 检查各种可能的data属性
        const dataAttrs = [
          'data-value',
          'data-content', 
          'data-text',
          'data-original',
          'data-raw',
          'data-cell-value'
        ];
        
        for (const attr of dataAttrs) {
          const value = element.getAttribute(attr);
          if (value) {
            console.log(`从${attr}获取原始数据`);
            return value;
          }
        }
        
        // 检查子元素的data属性
        const childWithData = element.querySelector('[data-value], [data-content], [data-text]');
        if (childWithData) {
          const value = childWithData.dataset.value || 
                       childWithData.dataset.content || 
                       childWithData.dataset.text;
          if (value) {
            console.log('从子元素data属性获取');
            return value;
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * 策略4: 使用textContent而不是innerText
   * textContent不受CSS样式影响，相对更纯净
   */
  static extractFromTextContent() {
    const selectors = [
      '.formula-input',
      '.ae-formula-input',
      '#alloy-simple-text-editor',
      '.table-input-stage'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        // 优先使用textContent
        const text = element.textContent;
        if (text && text.trim()) {
          console.log(`从textContent获取: ${selector}`);
          // 执行最小化清理 - 只处理明显的多余空行
          return this.minimalClean(text);
        }
      }
    }
    
    return null;
  }
  
  /**
   * 策略5: 清理DOM提取的文本（最后的选择）
   */
  static extractFromCleanDOM() {
    const selectors = [
      '.formula-input',
      '.ae-formula-input',
      '#alloy-simple-text-editor',
      '.table-input-stage'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.innerText || element.textContent;
        if (text && text.trim()) {
          console.log(`从DOM获取并清理: ${selector}`);
          return this.aggressiveClean(text);
        }
      }
    }
    
    return null;
  }
  
  /**
   * 最小化清理 - 只处理明显的格式化问题
   */
  static minimalClean(text) {
    if (!text) return '';
    
    return text
      .replace(/\r\n/g, '\n')                    // 统一换行符
      .replace(/\u00A0/g, ' ')                   // 替换不间断空格
      .replace(/^\s+|\s+$/g, '')                 // 去除首尾空白
      .replace(/[ \t]+$/gm, '');                 // 去除行尾空格
  }
  
  /**
   * 激进清理 - 处理所有已知的DOM污染问题
   */
  static aggressiveClean(text) {
    if (!text) return '';
    
    return text
      .replace(/\r\n/g, '\n')                           // 统一换行符
      .replace(/\u00A0/g, ' ')                          // 替换不间断空格
      .replace(/\n\s*\n\s*\n/g, '\n\n')                // 连续3+换行变为2个
      .replace(/(^\s+|\s+$)/g, '')                      // 去除首尾空白
      .replace(/[ \t]+$/gm, '')                         // 去除行尾空格
      .replace(/(\|.*\|)\n\s*\n(?=\|)/g, '$1\n');      // 表格专用清理
  }
  
  /**
   * 从数据对象中提取单元格数据
   */
  static extractCellDataFromObject(dataObj) {
    // 尝试不同的数据结构模式
    const patterns = [
      'currentCell.content',
      'currentCell.value', 
      'selectedCell.content',
      'selectedCell.value',
      'activeCell.content',
      'activeCell.value',
      'cellData.content',
      'cellData.value',
      'formulaBar.content',
      'formulaBar.value'
    ];
    
    for (const pattern of patterns) {
      try {
        const value = this.getNestedObject(dataObj, pattern);
        if (value && typeof value === 'string') {
          console.log(`从数据模型获取: ${pattern}`);
          return value;
        }
      } catch (e) {
        // 继续尝试下一个模式
      }
    }
    
    // 如果直接模式失败，尝试遍历对象寻找可能的文本内容
    return this.searchForTextInObject(dataObj);
  }
  
  /**
   * 在对象中递归搜索可能的文本内容
   */
  static searchForTextInObject(obj, depth = 0, maxDepth = 3) {
    if (!obj || depth > maxDepth) return null;
    
    // 如果是字符串且长度合适，可能是我们要的内容
    if (typeof obj === 'string' && obj.length > 0 && obj.length < 10000) {
      // 简单检查是否可能是有意义的内容
      if (obj.includes('|') || obj.includes('#') || obj.includes('*') || obj.length > 20) {
        return obj;
      }
    }
    
    // 如果是对象，递归搜索
    if (typeof obj === 'object' && obj !== null) {
      // 优先检查可能包含内容的属性名
      const priorityKeys = ['content', 'value', 'text', 'data', 'body', 'markdown'];
      
      for (const key of priorityKeys) {
        if (obj[key]) {
          const result = this.searchForTextInObject(obj[key], depth + 1, maxDepth);
          if (result) return result;
        }
      }
      
      // 然后检查其他属性
      for (const [key, value] of Object.entries(obj)) {
        if (!priorityKeys.includes(key)) {
          const result = this.searchForTextInObject(value, depth + 1, maxDepth);
          if (result) return result;
        }
      }
    }
    
    return null;
  }
  
  /**
   * 获取嵌套对象属性
   */
  static getNestedObject(obj, path) {
    return path.split('.').reduce((current, prop) => 
      current && current[prop] !== undefined ? current[prop] : null, obj);
  }
  
  /**
   * 验证并返回结果
   */
  static validateAndReturn(text, strategyName) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    const cleaned = text.trim();
    
    // 记录提取信息
    console.log(`策略 ${strategyName} 提取结果:`);
    console.log(`- 原始长度: ${text.length}`);
    console.log(`- 清理后长度: ${cleaned.length}`);
    console.log(`- 包含表格: ${cleaned.includes('|')}`);
    console.log(`- 包含Markdown: ${/[#*`\[\]]/.test(cleaned)}`);
    
    return cleaned;
  }
}

// 导出供content.js使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnhancedTextExtractor;
} else {
  window.EnhancedTextExtractor = EnhancedTextExtractor;
}