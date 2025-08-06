// 测试marked.js对失败内容的实际渲染结果
const fs = require('fs');

if (!fs.existsSync('./lib/marked.min.js')) {
    console.log('❌ marked.js 文件不存在');
    process.exit(1);
}

// 模拟浏览器环境
global.window = {};
global.document = {
    createElement: () => ({ innerHTML: '' }),
    createTextNode: () => ({})
};

// 加载marked.js
const markedContent = fs.readFileSync('./lib/marked.min.js', 'utf8');
eval(markedContent);

const failingContent = `### ⚙️ **一、行业风险特性与保险需求**

| **行业** | **核心风险场景** | **网安险保障重点** | **政策依据** |

|----------|------------------|-------------------|-------------|

| **化工行业** | 工控系统（DCS/SIS）遭勒索攻击导致生产中断；工艺参数泄露引发安全事故；环保数据篡改招致监管罚款 | 覆盖停产损失（日均产值×停机天数）+ 数据恢复费用 + 第三方责任赔偿（如环境污染） | 《工业控制系统信息安全防护指南》[citation:7]；《网络安全法》[citation:7] |

| **电力行业** | 电网监控系统被入侵引发大面积停电；新能源电站遭DDoS攻击致脱网；用户数据泄露面临能监罚款 | 赔偿电网瘫痪罚款（单次最高500万） + 发电损失（按上网电价计算） + 合规罚金 | 《电力可靠性管理办法》要求强化监控系统防护[citation:9] |`;

console.log('=== marked.js渲染测试 ===');

try {
    let html;
    if (typeof marked.parse === 'function') {
        html = marked.parse(failingContent, { 
            gfm: true, 
            breaks: false,
            pedantic: false 
        });
        console.log('✅ 使用 marked.parse() 成功');
    } else if (typeof marked === 'function') {
        html = marked(failingContent, { 
            gfm: true, 
            breaks: false,
            pedantic: false 
        });
        console.log('✅ 使用 marked() 成功');
    } else {
        throw new Error('marked函数不可用');
    }
    
    console.log('\n生成HTML长度:', html.length);
    console.log('包含<table>标签:', /<table/.test(html));
    console.log('包含<th>标签:', /<th/.test(html));
    console.log('包含<td>标签:', /<td/.test(html));
    
    // 显示完整的HTML输出
    console.log('\n=== 完整HTML输出 ===');
    console.log(html);
    
    // 分析HTML结构
    const tableCount = (html.match(/<table/g) || []).length;
    const headerCount = (html.match(/<th/g) || []).length;
    const cellCount = (html.match(/<td/g) || []).length;
    
    console.log('\n=== HTML结构分析 ===');
    console.log('表格数量:', tableCount);
    console.log('表头数量:', headerCount);
    console.log('数据单元格数量:', cellCount);
    
    if (tableCount === 0) {
        console.log('\n❌ 关键问题：marked.js没有生成表格HTML！');
        console.log('这表明marked.js本身无法正确解析这种带空行的表格格式');
        
        // 测试去除空行的版本
        console.log('\n=== 测试去除空行的版本 ===');
        const contentWithoutEmptyLines = failingContent.replace(/\n\s*\n/g, '\n');
        console.log('去除空行后的内容:');
        console.log(contentWithoutEmptyLines);
        
        let htmlWithoutEmpty;
        if (typeof marked.parse === 'function') {
            htmlWithoutEmpty = marked.parse(contentWithoutEmptyLines, { gfm: true });
        } else {
            htmlWithoutEmpty = marked(contentWithoutEmptyLines, { gfm: true });
        }
        
        console.log('\n去除空行后的HTML:');
        console.log(htmlWithoutEmpty);
        console.log('去除空行后包含<table>:', /<table/.test(htmlWithoutEmpty));
    } else {
        console.log('\n✅ marked.js成功生成了表格HTML');
    }
    
} catch (error) {
    console.log('❌ 渲染错误:', error.message);
}