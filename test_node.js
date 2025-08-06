// 加载文件系统模块
const fs = require('fs');

// 检查marked.js是否存在
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

const testContent = `#### **2. 行业专属附加险**

| **行业**   | **附加险种**                | **触发条件**                          | **案例参考** |

|------------|----------------------------|---------------------------------------|-------------|

| **化工**    | 工艺参数篡改责任险          | 因机器人传输数据被篡改引发生产事故      | 某炼油厂因控制系统遭入侵致泄漏，赔付1200万[citation:8] |

| **电力**    | 新能源场站脱网损失险        | 风电场/光伏电站因攻击脱网导致的发电补偿 | 山东共保体覆盖光伏电站停机损失[citation:3] |`;

console.log('=== marked.js 渲染测试 ===');
console.log('测试内容长度:', testContent.length);

try {
    let html;
    if (typeof marked.parse === 'function') {
        html = marked.parse(testContent, { gfm: true, breaks: false });
        console.log('✅ 使用 marked.parse() 成功');
    } else if (typeof marked === 'function') {
        html = marked(testContent, { gfm: true, breaks: false });
        console.log('✅ 使用 marked() 成功');
    } else {
        throw new Error('marked函数不可用');
    }
    
    console.log('生成HTML长度:', html.length);
    console.log('包含<table>标签:', /<table/.test(html));
    console.log('包含<th>标签:', /<th/.test(html));
    console.log('包含<td>标签:', /<td/.test(html));
    
    // 显示生成的HTML（截取前500字符）
    console.log('\n生成的HTML（前500字符）:');
    console.log(html.substring(0, 500));
    
    // 检查表格结构
    const tableCount = (html.match(/<table/g) || []).length;
    const headerCount = (html.match(/<th/g) || []).length;
    const cellCount = (html.match(/<td/g) || []).length;
    
    console.log('\n表格统计:');
    console.log('- 表格数量:', tableCount);
    console.log('- 表头数量:', headerCount);
    console.log('- 数据单元格数量:', cellCount);
    
    if (tableCount > 0) {
        console.log('\n🎉 成功！表格已正确生成HTML');
    } else {
        console.log('\n❌ 失败！没有生成表格HTML');
    }
    
} catch (error) {
    console.log('❌ 渲染错误:', error.message);
}