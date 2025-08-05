# 腾讯文档 Markdown 查看器 Chrome 扩展

这是一个 Chrome 浏览器扩展，用于在腾讯文档（docs.qq.com）中，当用户点击一个单元格时，能够提取该单元格内的文本内容，并将其作为 Markdown 在浏览器的侧边栏中进行渲染和展示。

## 安装前准备

在使用此扩展前，您需要下载两个外部库文件并放置在 `lib` 目录中：

1. **marked.min.js** - Markdown 解析库
   - 下载地址：https://cdn.jsdelivr.net/npm/marked@4.0.0/marked.min.js
   - 保存位置：`lib/marked.min.js`

2. **purify.min.js** - HTML 清理库（防止 XSS 攻击）
   - 下载地址：https://cdn.jsdelivr.net/npm/dompurify@2.3.6/dist/purify.min.js
   - 保存位置：`lib/purify.min.js`

您可以通过以下命令下载这些文件：

```bash
mkdir -p lib
curl -o lib/marked.min.js https://cdn.jsdelivr.net/npm/marked@4.0.0/marked.min.js
curl -o lib/purify.min.js https://cdn.jsdelivr.net/npm/dompurify@2.3.6/dist/purify.min.js
```

## 安装扩展

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 右上角开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择此项目的文件夹

## 使用方法

1. 访问腾讯文档（docs.qq.com 或 doc.weixin.qq.com）
2. 点击浏览器工具栏中的扩展图标打开侧边栏
3. 在文档中点击包含 Markdown 格式的单元格
4. 查看侧边栏中渲染的 Markdown 内容

## 快捷键

- `Ctrl+Shift+M` (Windows) 或 `Command+Shift+M` (Mac) - 打开侧边栏
- 在侧边栏中，使用 `Ctrl+R` 或 `Command+R` 重新加载侧边栏 