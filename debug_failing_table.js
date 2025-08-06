// 分析表格检测失败的具体原因
const failingContent = `### ⚙️ **一、行业风险特性与保险需求**

| **行业** | **核心风险场景** | **网安险保障重点** | **政策依据** |

|----------|------------------|-------------------|-------------|

| **化工行业** | 工控系统（DCS/SIS）遭勒索攻击导致生产中断；工艺参数泄露引发安全事故；环保数据篡改招致监管罚款 | 覆盖停产损失（日均产值×停机天数）+ 数据恢复费用 + 第三方责任赔偿（如环境污染） | 《工业控制系统信息安全防护指南》[citation:7]；《网络安全法》[citation:7] |

| **电力行业** | 电网监控系统被入侵引发大面积停电；新能源电站遭DDoS攻击致脱网；用户数据泄露面临能监罚款 | 赔偿电网瘫痪罚款（单次最高500万） + 发电损失（按上网电价计算） + 合规罚金 | 《电力可靠性管理办法》要求强化监控系统防护[citation:9] |`;

console.log('=== 深度分析表格检测失败原因 ===');

// 1. 基本信息
console.log('内容长度:', failingContent.length);
console.log('内容行数:', failingContent.split('\n').length);

// 2. 分析每一行
const lines = failingContent.split('\n');
console.log('\n=== 逐行分析 ===');
lines.forEach((line, i) => {
    console.log(`行${i+1}: "${line}"`);
    console.log(`  长度: ${line.length}`);
    console.log(`  是否为空行: ${line.trim() === ''}`);
    
    if (line.includes('|')) {
        console.log(`  包含竖线: true`);
        console.log(`  单元格数: ${line.split('|').filter(c => c.trim()).length}`);
        console.log(`  是表格行: ${/^\s*\|.*\|\s*$/.test(line)}`);
        console.log(`  是分隔符行: ${/^\s*\|[\s\-:]*\|\s*$/.test(line)}`);
        console.log(`  新分隔符检测: ${/^\s*\|(\s*[\-:]+\s*\|)+\s*$/.test(line)}`);
    } else {
        console.log(`  包含竖线: false`);
    }
    console.log('');
});

// 3. 当前检测逻辑测试
console.log('\n=== 检测逻辑测试 ===');
const currentRegex = /\|.*\|[\s\S]*?\n\s*\|(\s*[\-:]+\s*\|)+\s*/;
const result = currentRegex.test(failingContent);
console.log('当前检测结果:', result);

// 4. 寻找问题：空行影响
console.log('\n=== 空行问题分析 ===');
const emptyLinePositions = [];
lines.forEach((line, i) => {
    if (line.trim() === '') {
        emptyLinePositions.push(i + 1);
    }
});
console.log('空行位置:', emptyLinePositions);

// 5. 关键发现：分隔符行问题
console.log('\n=== 分隔符行详细分析 ===');
const separatorLine = '|----------|------------------|-------------------|-------------|';
console.log('分隔符行内容:', separatorLine);
console.log('分隔符行长度:', separatorLine.length);

// 逐个字符分析
console.log('分隔符行字符组成:');
for (let i = 0; i < separatorLine.length; i++) {
    const char = separatorLine[i];
    console.log(`  位置${i}: '${char}' (Unicode: ${char.charCodeAt(0)})`);
}

// 测试各种分隔符检测方式
console.log('\n=== 分隔符检测测试 ===');
console.log('原始分隔符检测:', /^\s*\|[\s\-:]*\|\s*$/.test(separatorLine));
console.log('新分隔符检测1:', /^\s*\|(\s*[\-:]+\s*\|)+\s*$/.test(separatorLine));
console.log('新分隔符检测2:', /^\s*\|(\s*[\-:|\s]+\s*)+\s*$/.test(separatorLine));
console.log('简化检测:', /^\s*\|[\-|\s]+\|\s*$/.test(separatorLine));

// 6. 表格完整性检测
console.log('\n=== 表格完整性检测 ===');
const tableLines = lines.filter(line => line.trim().startsWith('|') && line.trim().endsWith('|'));
console.log('表格行数:', tableLines.length);

if (tableLines.length >= 2) {
    const headerLine = tableLines[0];
    const separatorLineActual = tableLines[1];
    
    console.log('表头行:', headerLine);
    console.log('分隔符行:', separatorLineActual);
    
    const headerCells = headerLine.split('|').filter(cell => cell.trim()).length;
    const separatorCells = separatorLineActual.split('|').filter(cell => cell.trim()).length;
    
    console.log('表头单元格数:', headerCells);
    console.log('分隔符单元格数:', separatorCells);
    console.log('单元格数量匹配:', headerCells === separatorCells);
}

// 7. 新的修复建议
console.log('\n=== 修复建议 ===');
console.log('问题1: 空行影响连续性检测');
console.log('问题2: 分隔符行检测逻辑过于严格');
console.log('问题3: 可能需要更宽松的表格检测策略');