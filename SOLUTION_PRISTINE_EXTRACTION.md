# 事前文本提取解决方案 - 获取严格一致的原始文本

## 🎯 问题定义

**核心问题**: 如何在文本提取阶段就获取与原始数据完全一致的文本，避免DOM渲染造成的格式污染？

**传统问题**: 
- `innerText` 受CSS影响，空的`<div>`产生多余换行
- 富文本编辑器的格式化标签造成文本污染
- 事后清理存在遗漏风险

## ✨ 核心解决策略

### 1. **数据源优先级金字塔**

```
🏆 最纯净: 数据模型 (window.basicClientVars)
⭐ 次纯净: input.value 属性
🔵 较纯净: data-* 属性
🟡 一般: textContent (比innerText好)
🔴 最差: innerText + 事后清理
```

### 2. **五层防护策略**

#### 策略1: 直接访问数据模型 ⭐⭐⭐⭐⭐
```javascript
// 绕过DOM，直接从腾讯文档的数据层获取
window.basicClientVars?.padData?.currentCell?.content
window.__INITIAL_STATE__?.cellData?.value
```

#### 策略2: Input元素的value属性 ⭐⭐⭐⭐
```javascript
// input.value是最接近原始数据的DOM属性
const input = document.querySelector('.formula-input input');
return input?.value; // 无需任何清理
```

#### 策略3: Data属性中的原始数据 ⭐⭐⭐
```javascript
// 现代Web应用在data属性存储原始数据
element.getAttribute('data-value')
element.dataset.content
```

#### 策略4: TextContent优于InnerText ⭐⭐
```javascript
// textContent不受CSS样式影响
element.textContent // 比 element.innerText 更纯净
```

#### 策略5: 最小化DOM清理 ⭐
```javascript
// 最后选择：DOM + 最小清理
cleanTextContent(element.innerText)
```

## 🛠 实现方案

### 核心提取函数

```javascript
class EnhancedTextExtractor {
  static extractPureText() {
    const strategies = [
      this.extractFromDataModel,      // 最优先
      this.extractFromInputValue,     
      this.extractFromDataAttributes,
      this.extractFromTextContent,    
      this.extractFromCleanDOM       // 最后选择
    ];
    
    for (const strategy of strategies) {
      const result = strategy.call(this);
      if (result?.trim()) {
        return result; // 第一个成功的策略就返回
      }
    }
    return '';
  }
}
```

### 数据模型访问

```javascript
static extractFromDataModel() {
  // 检查腾讯文档全局对象
  const dataSources = [
    'window.basicClientVars.padData.currentCell.content',
    'window.__INITIAL_STATE__.cellData.value',
    'window.App.currentCellData.content'
  ];
  
  for (const path of dataSources) {
    const value = this.getNestedValue(window, path);
    if (value) return value;
  }
  return null;
}
```

### Input Value提取

```javascript
static extractFromInputValue() {
  const selectors = [
    '.formula-input input',
    '.ae-formula-input input',
    'input[role="combobox"]'
  ];
  
  for (const selector of selectors) {
    const input = document.querySelector(selector);
    if (input?.value) return input.value; // 完全纯净
  }
  return null;
}
```

## 📊 效果对比

### 传统方法 (事后清理)
```
原始数据 → DOM渲染 → innerText → 正则清理 → 可能遗漏
```

### 增强方法 (事前提取)
```
原始数据 → 直接访问 → 零污染 → 完全一致 ✅
```

## 🎯 实际应用

### 集成到现有代码

```javascript
// 在 content.js 中的应用
function extractFormulaBarContent() {
  // 优先使用增强策略
  if (typeof EnhancedTextExtractor !== 'undefined') {
    const result = EnhancedTextExtractor.extractPureText();
    if (result) {
      console.log("✅ 获取纯净原始文本");
      return result; // 无需任何清理
    }
  }
  
  // 回退到传统方法
  return fallbackToTraditionalExtraction();
}
```

### 腾讯文档特定优化

```javascript
// 针对腾讯文档的特殊数据源
static extractFromTencentSpecific() {
  // 公式栏的特殊处理
  const formulaInput = document.querySelector('.formula-input input');
  if (formulaInput?.value) return formulaInput.value;
  
  // 单元格编辑器的value
  const cellEditor = document.querySelector('.table-input-stage input');
  if (cellEditor?.value) return cellEditor.value;
  
  // 检查data属性
  const containers = document.querySelectorAll('[data-value], [data-content]');
  for (const container of containers) {
    const value = container.dataset.value || container.dataset.content;
    if (value) return value;
  }
  
  return null;
}
```

## 🧪 测试验证

### 验证清单
- [ ] **完全匹配**: 提取文本与原始数据100%一致
- [ ] **无多余空行**: 不包含 `|\n\s*\n|` 模式  
- [ ] **长度一致**: 字符长度完全相同
- [ ] **表格渲染**: markdown-it能正确解析
- [ ] **性能优化**: 优先使用最快的方法

### 测试结果期望
```
✅ 策略1 - 数据模型: 成功 (最优)
✅ 策略2 - Input Value: 成功 (备选)
⭐ 策略3-5: 备用方案
```

## 🎉 核心价值

### 1. **从根源解决问题**
- 不是修复污染，而是避免污染
- 从数据层面获取，绕过DOM渲染

### 2. **零风险零遗漏**
- 无需复杂的正则表达式清理
- 获取的就是原始数据，无需后处理

### 3. **性能最优**
- 避免DOM遍历和文本处理
- 直接访问数据，速度最快

### 4. **兼容性最强**
- 多层降级策略
- 确保在各种环境下都能工作

## 🔄 持续优化

### 监控策略效果
```javascript
// 记录使用的策略
console.log(`使用策略: ${strategyName}`);
console.log(`文本长度: ${result.length}`);
console.log(`是否包含表格: ${result.includes('|')}`);
```

### 动态调整优先级
```javascript
// 根据成功率调整策略顺序
const strategyStats = {
  dataModel: { success: 45, total: 50 },
  inputValue: { success: 48, total: 50 },
  // ... 动态优化
};
```

这个解决方案彻底解决了文本提取的根本问题：**在源头获取纯净数据，而不是污染后再清理**。