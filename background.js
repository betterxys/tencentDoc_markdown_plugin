// 背景脚本 - 处理事件和消息传递
const debug = true;

// 侧边栏的状态
let sidePanelInitialized = false;

// 检查侧边栏是否激活的辅助函数
function isSidePanelActive() {
  return sidePanelInitialized;
}

// 安全发送消息到侧边栏的辅助函数
function safeSendToSidePanel(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message).then(response => {
        resolve(response);
      }).catch(err => {
        logMessage(`侧边栏消息发送失败: ${err.message}`);
        reject(err);
      });
    } catch (err) {
      logMessage(`侧边栏消息异常: ${err.message}`);
      reject(err);
    }
  });
}

// 无障碍模式状态
let accessibilityMode = false;

// 日志函数
function logMessage(message) {
  if (debug) {
    console.log(`[Background] ${message}`);
    // 只在侧边栏激活时发送日志消息
    if (isSidePanelActive()) {
      safeSendToSidePanel({
        type: 'log',
        source: 'background',
        message: message
      }).catch(err => {
        // 忽略消息传递错误
      });
    }
  }
}

// 侧边栏错误处理函数
function handleSidePanelError(error, tab, startTime) {
  const duration = Date.now() - startTime;
  console.error(`❌ 侧边栏操作失败 (耗时: ${duration}ms):`, error);
  console.error('📍 错误详情:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
  
  logMessage(`❌ 侧边栏操作失败 (耗时: ${duration}ms): ${error.message}`);
  
  // 针对性的错误处理
  if (error.message.includes('No active side panel')) {
    logMessage('🔧 检测到侧边栏状态问题，重新设置配置...');
    
    // 只重新设置配置，不自动重试打开（避免用户手势问题）
    chrome.sidePanel.setOptions({
      tabId: tab.id,
      enabled: true,
      path: 'sidepanel.html'
    }).then(() => {
      logMessage('✅ 标签页侧边栏配置已重置');
      logMessage('💡 建议: 请重新点击插件图标尝试');
    }).catch(configErr => {
      logMessage(`❌ 配置重置失败: ${configErr.message}`);
      logMessage('💡 建议: 请重新加载扩展后再试');
    });
  } else if (error.message.includes('user gesture')) {
    logMessage('⚠️ 用户手势上下文已丢失（这不应该发生在简化后的代码中）');
    logMessage('💡 建议: 请直接点击插件图标，避免其他操作干扰');
    
  } else if (error.message.includes('Cannot access')) {
    logMessage('💡 建议: 可能是权限问题，请检查扩展权限配置');
    
  } else {
    logMessage('💡 建议: 请重新加载扩展后再试，或检查Chrome版本是否支持侧边栏API');
  }
}

// 当扩展图标被点击时显示侧边栏
chrome.action.onClicked.addListener((tab) => {
  console.log('=== 扩展图标点击事件 ===');
  console.log('⏰ 点击时间:', new Date().toLocaleString());
  console.log('🏷️ 标签页信息:', {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
    status: tab.status
  });
  console.log('🔌 Chrome API状态:', {
    sidePanel: !!chrome.sidePanel,
    storage: !!chrome.storage,
    tabs: !!chrome.tabs,
    runtime: !!chrome.runtime
  });
  
  logMessage(`扩展图标被点击，当前页面: ${tab.url}`);
  logMessage(`标签页ID: ${tab.id}, 标题: ${tab.title}`);
  logMessage(`侧边栏初始化状态: ${sidePanelInitialized}`);
  
  // 增加详细的侧边栏状态检查
  chrome.sidePanel.getOptions({ tabId: tab.id }).then(options => {
    console.log('🔍 当前标签页侧边栏配置:', options);
    logMessage(`📋 标签页 ${tab.id} 侧边栏配置: ${JSON.stringify(options)}`);
  }).catch(err => {
    console.log('⚠️ 无法获取侧边栏配置:', err.message);
    logMessage(`⚠️ 标签页 ${tab.id} 无法获取侧边栏配置: ${err.message}`);
  });
  
  // 检查是否支持侧边栏
  if (!isSidePanelSupportedUrl(tab.url)) {
    const message = `当前页面不支持侧边栏功能: ${tab.url}`;
    console.warn(message);
    logMessage(`⚠️ ${message}`);
    logMessage('💡 请在普通网页（如百度、谷歌等）上测试侧边栏功能');
    return;
  }
  
  if (!chrome.sidePanel) {
    const error = 'Chrome侧边栏API不可用';
    console.error(error);
    logMessage(error);
    return;
  }
  
  try {
    console.log('🚀 尝试打开侧边栏...');
    console.log('📋 侧边栏打开参数:', { tabId: tab.id });
    
    const startTime = Date.now();
    
    // 🔑 关键修复：在用户手势同步调用栈中直接打开侧边栏
    // 不使用异步 Promise 链，确保不丢失用户手势上下文
    chrome.sidePanel.open({ tabId: tab.id }).then(() => {
      const duration = Date.now() - startTime;
      console.log(`✅ 侧边栏打开成功 (耗时: ${duration}ms)`);
      logMessage(`✅ 为标签页 ${tab.id} 成功打开侧边栏 (耗时: ${duration}ms)`);
      
      // 侧边栏打开成功后，确保配置正确（这个操作不需要用户手势）
      chrome.sidePanel.setOptions({
        tabId: tab.id,
        enabled: true,
        path: 'sidepanel.html'
      }).then(() => {
        console.log('✅ 侧边栏配置已确认');
        logMessage(`✅ 标签页 ${tab.id} 侧边栏配置已确认`);
      }).catch(configError => {
        console.warn('⚠️ 侧边栏配置确认失败:', configError.message);
        logMessage(`⚠️ 侧边栏配置确认失败: ${configError.message}`);
      });
      
      // 等待一段时间后检查侧边栏是否真的初始化了
      setTimeout(() => {
        if (!sidePanelInitialized) {
          console.warn('⚠️ 侧边栏打开成功但未收到初始化消息');
          logMessage('⚠️ 侧边栏可能未正确初始化，请检查sidepanel.js是否正确加载');
        } else {
          console.log('✅ 侧边栏初始化确认完成');
          logMessage('✅ 侧边栏初始化确认完成');
        }
      }, 2000);
      
    }).catch(error => {
      handleSidePanelError(error, tab, startTime);
    });
    
  } catch (error) {
    console.error('💥 侧边栏打开异常:', error);
    console.error('📍 异常详情:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    logMessage(`❌ 打开侧边栏异常: ${error.message}`);
    logMessage('💡 建议: 这可能是代码错误，请检查background.js的语法');
  }
});

// 检查URL是否是腾讯文档 sheet 模式
function isValidDocUrl(url) {
  if (!url) return false;
  
  // 只有 doc.weixin.qq.com/sheet 域名下的才算有效
  return url.includes("doc.weixin.qq.com/sheet");
}

// 检查URL是否支持侧边栏
function isSidePanelSupportedUrl(url) {
  if (!url) return false;
  
  // Chrome内部页面不支持侧边栏
  const unsupportedSchemes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'brave://',
    'opera://',
    'about:',
    'moz-extension://'
  ];
  
  return !unsupportedSchemes.some(scheme => url.startsWith(scheme));
}

// 检查URL是否应该被监听（避免侧边栏页面触发逻辑）
function shouldMonitorTab(url) {
  if (!url) return false;
  
  // 排除扩展自身的页面
  if (url.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    return false;
  }
  
  // 排除Chrome内部页面
  const internalSchemes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'brave://',
    'opera://',
    'about:',
    'moz-extension://'
  ];
  
  return !internalSchemes.some(scheme => url.startsWith(scheme));
}

// 监听标签页切换事件，当用户切换到其他标签页时关闭侧边栏
chrome.tabs.onActivated.addListener((activeInfo) => {
  logMessage(`标签页切换: ${activeInfo.tabId}`);
  
  // 检查当前活动的标签页是否是腾讯文档 sheet 模式页面
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    // 只监听应该被监听的标签页，避免扩展自身页面触发逻辑
    if (!shouldMonitorTab(tab.url)) {
      logMessage(`跳过监听标签页: ${tab.url} (扩展内部页面)`);
      return;
    }
    
    const isValidTab = isValidDocUrl(tab.url);
    
    if (!isValidTab) {
      // 如果不是腾讯文档 sheet 模式页面，设置侧边栏不可用
      // 注意：chrome.sidePanel.close() 在 Manifest V3 中不存在
      // 替代方案：设置侧边栏为禁用状态
      try {
        chrome.sidePanel.setOptions({
          tabId: activeInfo.tabId,
          enabled: false
        });
        logMessage("标签页不是腾讯文档 sheet 模式，禁用侧边栏");
      } catch (err) {
        // 忽略错误，某些Chrome版本可能不支持此API或侧边栏未激活
        logMessage(`设置侧边栏状态错误: ${err.message}`);
      }
    } else {
      // 如果是有效页面，确保侧边栏可用
      try {
        chrome.sidePanel.setOptions({
          tabId: activeInfo.tabId,
          enabled: true,
          path: 'sidepanel.html'
        });
        logMessage("标签页是腾讯文档 sheet 模式，启用侧边栏");
      } catch (err) {
        logMessage(`启用侧边栏错误: ${err.message}`);
      }
    }
  });
});

// 当侧边栏脚本加载时发出初始化消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 收到消息:', message);
  console.log('📍 发送者信息:', sender);
  
  if (message.type === 'sidePanel_initialized') {
    console.log('✅ 收到侧边栏初始化消息');
    const wasInitialized = sidePanelInitialized;
    sidePanelInitialized = true;
    
    console.log(`🔄 初始化状态变更: ${wasInitialized} → ${sidePanelInitialized}`);
    
    if (!wasInitialized) {
      console.log("🎉 侧边栏首次初始化成功！");
      logMessage("✅ 侧边栏首次初始化成功");
    } else {
      console.log("🔄 侧边栏重新初始化");
      logMessage("🔄 侧边栏重新初始化");
    }
    
    // 检查是否有存储的 Markdown 内容
    chrome.storage.local.get(['lastMarkdownContent', 'timestamp', 'accessibilityMode'], function(data) {
      // 恢复无障碍模式设置
      if (data.accessibilityMode !== undefined) {
        accessibilityMode = data.accessibilityMode;
        logMessage(`恢复无障碍模式设置: ${accessibilityMode ? '启用' : '禁用'}`);
      }
      
      if (data.lastMarkdownContent) {
        logMessage(`加载存储的 Markdown 内容 (${data.timestamp})`);
        
        // 发送存储的内容到侧边栏
        safeSendToSidePanel({
          type: 'render_markdown',
          content: data.lastMarkdownContent,
          contentType: data.contentType || 'unknown',
          timestamp: data.timestamp,
          accessibilityMode: accessibilityMode
        }).then(response => {
          logMessage(`侧边栏初始化响应: ${JSON.stringify(response)}`);
        }).catch(err => {
          logMessage(`侧边栏初始化失败: ${err.message}`);
        });
      }
    });
    
    sendResponse({ status: 'ack' });
    return true;
  }
  
  // 处理侧边栏关闭通知
  if (message.type === 'sidePanel_closed') {
    sidePanelInitialized = false;
    logMessage("侧边栏已关闭");
    sendResponse({ status: 'ack' });
    return true;
  }
  
  // 处理调试测试消息
  if (message.type === 'debug_test') {
    console.log('收到调试测试消息:', message);
    logMessage(`收到调试测试消息: ${JSON.stringify(message)}`);
    sendResponse({ 
      status: 'success', 
      timestamp: Date.now(),
      sidePanelAPI: !!chrome.sidePanel,
      sidePanelInitialized: sidePanelInitialized,
      extensionId: chrome.runtime.id
    });
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
    if (isSidePanelActive()) {
      safeSendToSidePanel({
        type: 'update_accessibility',
        enabled: accessibilityMode
      }).catch(err => {
        logMessage(`更新无障碍模式失败: ${err.message}`);
      });
    } else {
      logMessage('侧边栏未激活，跳过无障碍模式更新');
    }
    
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
    
    // 注意：chrome.sidePanel.close() 在 Manifest V3 中不存在
    // 替代方案：通知内容脚本停止监听，用户可手动关闭侧边栏
    logMessage('通知内容脚本停止监听（侧边栏需用户手动关闭）');
    
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
      } else {
        logMessage('没有找到活动的标签页');
      }
    });
    
    // 清理存储的内容（可选）
    chrome.storage.local.remove(['lastMarkdownContent', 'timestamp'], () => {
      logMessage('已清理存储的内容');
    });
    
    sendResponse({ status: 'sidepanel_close_requested', success: true });
    
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
    const { content, contentType = 'text' } = message;
    logMessage(`接收到 Markdown 内容: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
    
    // 存储内容到本地存储
    const timestamp = new Date().toLocaleString();
    chrome.storage.local.set({
      lastMarkdownContent: content,
      contentType: contentType,
      timestamp: timestamp
    }, function() {
      logMessage('内容已保存到存储中');
    });
    
    // 默认自动渲染内容到侧边栏（如果已打开）
    if (sender.tab) {
      logMessage(`🚀 准备发送内容到侧边栏 (类型: ${contentType}, 长度: ${content.length})`);
      
      if (isSidePanelActive()) {
        safeSendToSidePanel({
          type: 'render_markdown',
          content: content,
          contentType: contentType,
          timestamp: timestamp,
          accessibilityMode: accessibilityMode
        }).then(response => {
          logMessage(`✅ 侧边栏响应: ${JSON.stringify(response)}`);
        }).catch(err => {
          logMessage(`❌ 发送到侧边栏失败: ${err.message}`);
        });
      } else {
        logMessage('侧边栏未激活，请点击插件图标打开侧边栏');
      }
    }
    
    sendResponse({ status: 'received' });
    return true;
  }
  
  return false;
});

// 监听标签页的导航事件，当用户导航到非腾讯文档页面时关闭侧边栏
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 只在页面完成加载并且URL可用时检查
  if (changeInfo.status === 'complete' && tab.url) {
    // 只监听应该被监听的标签页，避免扩展自身页面触发逻辑
    if (!shouldMonitorTab(tab.url)) {
      logMessage(`跳过导航监听: ${tab.url} (扩展内部页面)`);
      return;
    }
    
    const isValidTab = isValidDocUrl(tab.url);
    
    if (!isValidTab) {
      // 如果不是腾讯文档 sheet 模式页面，设置侧边栏不可用
      try {
        chrome.sidePanel.setOptions({
          tabId: tabId,
          enabled: false
        });
        logMessage(`标签页 ${tabId} 导航到非腾讯文档 sheet 模式页面，禁用侧边栏`);
      } catch (err) {
        // 忽略错误，某些Chrome版本可能不支持此API或侧边栏未激活
        logMessage(`设置侧边栏状态错误: ${err.message}`);
      }
    } else {
      // 如果是有效页面，确保侧边栏可用并配置正确
      try {
        chrome.sidePanel.setOptions({
          tabId: tabId,
          enabled: true,
          path: 'sidepanel.html'
        });
        logMessage(`标签页 ${tabId} 导航到腾讯文档 sheet 模式页面，启用侧边栏并配置完成`);
      } catch (err) {
        logMessage(`启用侧边栏错误: ${err.message}`);
      }
    }
  }
});

// 初始化扩展
chrome.runtime.onInstalled.addListener(() => {
  console.log("扩展已安装/更新");
  logMessage("扩展已安装/更新");
  
  // 检查侧边栏API可用性
  console.log("Chrome侧边栏API可用性:", !!chrome.sidePanel);
  
  // 设置侧边栏
  if (chrome.sidePanel) {
    try {
      // 强制重置侧边栏配置，确保状态干净
      chrome.sidePanel.setOptions({
        path: 'sidepanel.html',
        enabled: true
      });
      console.log("侧边栏选项设置成功");
      logMessage("✅ 侧边栏全局配置已重置");
      
      // 为现有的腾讯文档标签页启用侧边栏
      chrome.tabs.query({url: "*://doc.weixin.qq.com/sheet*"}, (tabs) => {
        if (tabs.length > 0) {
          logMessage(`🔧 为 ${tabs.length} 个现有腾讯文档标签页启用侧边栏`);
          tabs.forEach(tab => {
            chrome.sidePanel.setOptions({
              tabId: tab.id,
              enabled: true,
              path: 'sidepanel.html'
            }).catch(err => {
              logMessage(`启用标签页 ${tab.id} 侧边栏失败: ${err.message}`);
            });
          });
        }
      });
      
    } catch (error) {
      console.error("设置侧边栏选项失败:", error);
      logMessage(`❌ 设置侧边栏选项失败: ${error.message}`);
    }
  } else {
    console.error("Chrome侧边栏API不可用");
    logMessage("❌ Chrome侧边栏API不可用 - 请检查Chrome版本是否≥114");
  }
  
  // 重置侧边栏初始化状态
  sidePanelInitialized = false;
  logMessage("🔄 侧边栏初始化状态已重置");
  
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