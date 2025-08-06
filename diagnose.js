// 插件诊断脚本 - 在Chrome控制台中运行
console.log('=== 腾讯文档 Markdown 查看器诊断 ===');

// 1. 检查当前页面是否为腾讯文档
const currentURL = window.location.href;
const isValidDomain = currentURL.includes('doc.weixin.qq.com/sheet');
console.log(`当前URL: ${currentURL}`);
console.log(`是否为腾讯文档表格: ${isValidDomain ? '✅' : '❌'}`);

if (!isValidDomain) {
    console.warn('⚠️ 插件只能在腾讯文档表格页面使用！');
    console.log('请访问: doc.weixin.qq.com/sheet*');
}

// 2. 检查插件是否已安装
chrome.management.getAll((extensions) => {
    const plugin = extensions.find(ext => ext.name.includes('腾讯文档') || ext.name.includes('Markdown'));
    if (plugin) {
        console.log('✅ 插件已安装:', plugin.name);
        console.log('插件状态:', plugin.enabled ? '已启用' : '❌ 已禁用');
    } else {
        console.log('❌ 插件未安装或未找到');
    }
});

// 3. 检查内容脚本是否注入
if (typeof window.TencentDocMarkdownViewer !== 'undefined') {
    console.log('✅ 内容脚本已注入');
} else {
    console.log('❌ 内容脚本未注入 - 请重新加载页面');
}

// 4. 检查侧边栏API
if (typeof chrome.sidePanel !== 'undefined') {
    console.log('✅ 侧边栏API可用');
} else {
    console.log('❌ 侧边栏API不可用');
}

// 5. 测试键盘快捷键
console.log('测试键盘快捷键: Ctrl/Cmd+Shift+M');

// 6. 检查存储权限
chrome.storage.local.get(['lastMarkdownContent'], (result) => {
    if (chrome.runtime.lastError) {
        console.log('❌ 存储权限错误:', chrome.runtime.lastError);
    } else {
        console.log('✅ 存储权限正常');
        console.log('上次内容:', result.lastMarkdownContent ? '有内容' : '无内容');
    }
});

console.log('\n=== 诊断完成 ===');
console.log('如果看到❌，请按照解决方案修复问题');