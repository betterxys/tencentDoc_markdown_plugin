// 背景脚本 - 处理事件和消息传递
const debug = true;

// 侧边栏的状态
let sidePanelInitialized = false;

// 无障碍模式状态
let accessibilityMode = false;

// 日志函数
function logMessage(message) {
  if (debug) {
    console.log(`[Background] ${message}`);
    // 尝试将日志消息发送到侧边栏
    try {
      chrome.runtime.sendMessage({
        type: 'log',
        source: 'background',
        message: message
      }).catch(err => {
        // 忽略消息传递错误 (侧边栏可能未打开)
      });
    } catch (error) {
      // 忽略错误
    }
  }
}

// 当扩展图标被点击时显示侧边栏
chrome.action.onClicked.addListener((tab) => {
  logMessage("扩展图标被点击");
  chrome.sidePanel.open({ tabId: tab.id });
});

// 检查URL是否是腾讯文档 sheet 模式
function isValidDocUrl(url) {
  if (!url) return false;
  
  // 只有 doc.weixin.qq.com/sheet 域名下的才算有效
  return url.includes("doc.weixin.qq.com/sheet");
}

// 监听标签页切换事件，当用户切换到其他标签页时关闭侧边栏
chrome.tabs.onActivated.addListener((activeInfo) => {
  logMessage(`标签页切换: ${activeInfo.tabId}`);
  
  // 检查当前活动的标签页是否是腾讯文档 sheet 模式页面
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    const isValidTab = isValidDocUrl(tab.url);
    
    if (!isValidTab) {
      // 如果不是腾讯文档 sheet 模式页面，关闭侧边栏
      chrome.sidePanel.close().catch(err => {
        // 忽略错误
        logMessage(`关闭侧边栏错误: ${err.message}`);
      });
      logMessage("标签页不是腾讯文档 sheet 模式，关闭侧边栏");
    }
  });
});

// 当侧边栏脚本加载时发出初始化消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'sidePanel_initialized') {
    sidePanelInitialized = true;
    logMessage("侧边栏已初始化");
    
    // 检查是否有存储的 Markdown 内容
    chrome.storage.local.get(['lastMarkdownContent', 'timestamp', 'accessibilityMode', 'isPinned'], function(data) {
      // 恢复无障碍模式设置
      if (data.accessibilityMode !== undefined) {
        accessibilityMode = data.accessibilityMode;
        logMessage(`恢复无障碍模式设置: ${accessibilityMode ? '启用' : '禁用'}`);
      }
      
      // 记录置顶状态
      const isPinned = data.isPinned !== undefined ? data.isPinned : true;
      logMessage(`当前置顶状态: ${isPinned ? '开启' : '关闭'}`);
      
      if (data.lastMarkdownContent) {
        logMessage(`加载存储的 Markdown 内容 (${data.timestamp})`);
        
        // 发送存储的内容到侧边栏
        chrome.runtime.sendMessage({
          type: 'render_markdown',
          content: data.lastMarkdownContent,
          contentType: data.contentType || 'unknown',
          timestamp: data.timestamp,
          accessibilityMode: accessibilityMode
        }).catch(err => {
          logMessage(`发送到侧边栏失败: ${err.message}`);
        });
      }
    });
    
    sendResponse({ status: 'ack' });
    return true;
  }
  
  // 处理无障碍模式切换请求
  if (message.type === 'toggle_accessibility') {
    // 切换无障碍模式
    accessibilityMode = !accessibilityMode;
    logMessage(`无障碍模式已${accessibilityMode ? '启用' : '禁用'}`);
    
    // 保存设置到存储
    chrome.storage.local.set({ accessibilityMode: accessibilityMode }, function() {
      logMessage('无障碍模式设置已保存');
    });
    
    // 通知侧边栏更新无障碍模式
    chrome.runtime.sendMessage({
      type: 'update_accessibility',
      enabled: accessibilityMode
    }).catch(err => {
      // 忽略错误 (侧边栏可能未打开)
    });
    
    // 响应请求
    sendResponse({ 
      status: 'toggled',
      enabled: accessibilityMode
    });
    return true;
  }
  
  // 处理关闭侧边栏请求
  if (message.type === 'close_sidepanel') {
    logMessage('收到关闭侧边栏请求，立即处理');
    
    // 立即尝试关闭侧边栏
    chrome.sidePanel.close()
      .then(() => {
        logMessage('侧边栏已成功关闭');
        
        // 获取当前活动的标签页来通知内容脚本
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs.length > 0) {
            const tabId = tabs[0].id;
            
            chrome.tabs.sendMessage(tabId, {
              type: 'stop_listening'
            }).then(() => {
              logMessage('已通知内容脚本停止监听');
            }).catch(err => {
              logMessage(`通知内容脚本失败: ${err.message}`);
            });
          }
        });
        
        // 清理存储的内容（可选）
        chrome.storage.local.remove(['lastMarkdownContent', 'timestamp'], () => {
          logMessage('已清理存储的内容');
        });
        
        sendResponse({ status: 'closed', success: true });
      })
      .catch(err => {
        logMessage(`关闭侧边栏错误: ${err.message}`);
        sendResponse({ status: 'error', message: err.message });
      });
    
    // 返回 true 表示将异步发送响应
    return true;
  }
  
  // 处理恢复监听请求
  if (message.type === 'start_listening') {
    logMessage('收到恢复监听请求');
    
    // 获取当前活动的标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const tabId = tabs[0].id;
        
        // 通知内容脚本恢复监听
        chrome.tabs.sendMessage(tabId, {
          type: 'start_listening'
        }).then(() => {
          logMessage('已通知内容脚本恢复监听');
          sendResponse({ status: 'started', success: true });
        }).catch(err => {
          logMessage(`通知内容脚本失败: ${err.message}`);
          sendResponse({ status: 'error', message: err.message });
        });
      } else {
        sendResponse({ status: 'error', message: '无法获取当前标签页' });
      }
    });
    
    // 返回 true 表示将异步发送响应
    return true;
  }
  
  // 从内容脚本接收 Markdown 内容
  if (message.type === 'markdown_content') {
    const { content } = message;
    logMessage(`接收到 Markdown 内容: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
    
    // 存储内容到本地存储
    const timestamp = new Date().toLocaleString();
    chrome.storage.local.set({
      lastMarkdownContent: content,
      timestamp: timestamp
    }, function() {
      logMessage('内容已保存到存储中');
    });
    
    // 检查置顶状态，决定是否打开侧边栏和渲染内容
    chrome.storage.local.get(['isPinned'], function(data) {
      const isPinned = data.isPinned !== undefined ? data.isPinned : true; // 默认开启
      
      if (isPinned && sender.tab) {
        // 置顶开启时，确保侧边栏已打开并发送内容
        chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
          // 短暂延迟，确保侧边栏有足够时间加载
          setTimeout(() => {
            // 发送内容到侧边栏进行渲染
            chrome.runtime.sendMessage({
              type: 'render_markdown',
              content: content,
              contentType: contentType,
              timestamp: timestamp,
              accessibilityMode: accessibilityMode
            }).catch(err => {
              logMessage(`发送到侧边栏失败: ${err.message}`);
            });
          }, 500);
        });
      } else {
        // 置顶关闭时，关闭侧边栏并只存储内容
        logMessage('置顶状态关闭，关闭侧边栏并存储内容');
        chrome.sidePanel.close().catch(err => {
          logMessage(`关闭侧边栏错误: ${err.message}`);
        });
      }
    });
    
    sendResponse({ status: 'received' });
    return true;
  }
  
  return false;
});

// 监听标签页的导航事件，当用户导航到非腾讯文档页面时关闭侧边栏
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 只在页面完成加载并且URL可用时检查
  if (changeInfo.status === 'complete' && tab.url) {
    const isValidTab = isValidDocUrl(tab.url);
    
    if (!isValidTab) {
      // 如果不是腾讯文档 sheet 模式页面，关闭侧边栏
      chrome.sidePanel.close().catch(err => {
        // 忽略错误
        logMessage(`关闭侧边栏错误: ${err.message}`);
      });
      logMessage(`标签页 ${tabId} 导航到非腾讯文档 sheet 模式页面，关闭侧边栏`);
    }
  }
});

// 初始化扩展
chrome.runtime.onInstalled.addListener(() => {
  logMessage("扩展已安装/更新");
  
  // 设置侧边栏
  if (chrome.sidePanel) {
    chrome.sidePanel.setOptions({
      path: 'sidepanel.html',
      enabled: true
    });
    logMessage("侧边栏选项已设置");
  }
  
  // 初始化无障碍模式设置
  chrome.storage.local.get(['accessibilityMode'], function(data) {
    if (data.accessibilityMode !== undefined) {
      accessibilityMode = data.accessibilityMode;
      logMessage(`恢复无障碍模式设置: ${accessibilityMode ? '启用' : '禁用'}`);
    } else {
      // 默认禁用
      chrome.storage.local.set({ accessibilityMode: false });
    }
  });
}); 