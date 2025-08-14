// 背景脚本 - 处理事件和消息传递
const debug = true;

// 侧边栏的状态
let sidePanelInitialized = false;

// 内容脚本状态管理
let contentScriptStates = new Map(); // tabId -> { isInjected, lastActiveTime, retryCount }

// 连接健康监控
let connectionHealthMonitor = {
  lastSuccessfulMessage: Date.now(),
  failureCount: 0,
  maxFailures: 5,
  healthCheckInterval: null,
  
  // 记录成功的消息
  recordSuccess() {
    this.lastSuccessfulMessage = Date.now();
    this.failureCount = 0;
  },
  
  // 记录失败的消息
  recordFailure() {
    this.failureCount++;
    logMessage(`记录消息失败 (${this.failureCount}/${this.maxFailures})`);
    
    if (this.failureCount >= this.maxFailures) {
      logMessage('⚠️ 检测到连续消息失败，可能存在连接问题');
      this.handleConnectionIssue();
    }
  },
  
  // 处理连接问题
  handleConnectionIssue() {
    logMessage('🔧 尝试恢复连接...');
    
    // 重置侧边栏状态
    sidePanelInitialized = false;
    
    // 可以在这里添加更多恢复逻辑
    // 例如：重新注入内容脚本，重新配置侧边栏等
  },
  
  // 开始健康检查
  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      const timeSinceLastSuccess = Date.now() - this.lastSuccessfulMessage;
      
      // 如果超过30秒没有成功的消息，记录警告
      if (timeSinceLastSuccess > 30000 && sidePanelInitialized) {
        logMessage(`⚠️ 已有${Math.floor(timeSinceLastSuccess/1000)}秒没有成功的消息传递`);
      }
      
      // 如果超过2分钟没有成功的消息，认为连接有问题
      if (timeSinceLastSuccess > 120000 && sidePanelInitialized) {
        logMessage('❌ 检测到长时间无消息传递，可能存在连接问题');
        this.handleConnectionIssue();
      }
    }, 10000); // 每10秒检查一次
  },
  
  // 停止健康检查
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
};

// 检查侧边栏是否激活的辅助函数
function isSidePanelActive() {
  return sidePanelInitialized;
}

// 增强的消息传递重试机制（runtime消息）
function sendMessageWithRetry(message, retries = 3, retryDelay = 1000) {
  return new Promise((resolve, reject) => {
    function attemptSend(remainingRetries) {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const lastError = chrome.runtime.lastError;
          
          if (lastError) {
            logMessage(`❌ 背景脚本消息发送失败: ${lastError.message}`);
            
            if (remainingRetries > 0) {
              logMessage(`🔄 重试发送消息，剩余重试次数: ${remainingRetries - 1}`);
              setTimeout(() => {
                attemptSend(remainingRetries - 1);
              }, retryDelay);
            } else {
              const errorMsg = `消息发送失败，已超过重试次数: ${lastError.message}`;
              logMessage(`❌ ${errorMsg}`);
              connectionHealthMonitor.recordFailure();
              reject(new Error(errorMsg));
            }
          } else {
            logMessage("✅ 背景脚本消息发送成功");
            connectionHealthMonitor.recordSuccess();
            resolve(response);
          }
        });
      } catch (error) {
        if (remainingRetries > 0) {
          logMessage(`🔄 消息发送异常，重试中: ${error.message}`);
          setTimeout(() => {
            attemptSend(remainingRetries - 1);
          }, retryDelay);
        } else {
          logMessage(`❌ 消息发送异常，重试失败: ${error.message}`);
          reject(error);
        }
      }
    }
    
    attemptSend(retries);
  });
}

// 增强的标签页消息传递重试机制
function sendTabMessageWithRetry(tabId, message, retries = 3, retryDelay = 1000) {
  return new Promise((resolve, reject) => {
    function attemptSend(remainingRetries) {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          const lastError = chrome.runtime.lastError;
          
          if (lastError) {
            logMessage(`❌ 标签页${tabId}消息发送失败: ${lastError.message}`);
            
            // 特殊处理：如果内容脚本未注入，不重试
            if (lastError.message.includes('Receiving end does not exist') ||
                lastError.message.includes('Could not establish connection')) {
              logMessage(`⚠️ 内容脚本可能未注入到标签页${tabId}，跳过重试`);
              reject(new Error(`内容脚本连接失败: ${lastError.message}`));
              return;
            }
            
            if (remainingRetries > 0) {
              logMessage(`🔄 重试发送标签页消息，剩余重试次数: ${remainingRetries - 1}`);
              setTimeout(() => {
                attemptSend(remainingRetries - 1);
              }, retryDelay);
            } else {
              const errorMsg = `标签页消息发送失败，已超过重试次数: ${lastError.message}`;
              logMessage(`❌ ${errorMsg}`);
              reject(new Error(errorMsg));
            }
          } else {
            logMessage(`✅ 标签页${tabId}消息发送成功`);
            resolve(response);
          }
        });
      } catch (error) {
        if (remainingRetries > 0) {
          logMessage(`🔄 标签页消息发送异常，重试中: ${error.message}`);
          setTimeout(() => {
            attemptSend(remainingRetries - 1);
          }, retryDelay);
        } else {
          logMessage(`❌ 标签页消息发送异常，重试失败: ${error.message}`);
          reject(error);
        }
      }
    }
    
    attemptSend(retries);
  });
}

// 安全发送消息到侧边栏的辅助函数（增强版）
async function safeSendToSidePanel(message) {
  try {
    // 首先检查侧边栏是否激活
    if (!isSidePanelActive()) {
      throw new Error('侧边栏未激活');
    }
    
    // 使用重试机制发送消息
    const response = await sendMessageWithRetry(message, 3, 1000);
    return response;
  } catch (error) {
    logMessage(`侧边栏消息发送失败: ${error.message}`);
    
    // 如果是连接错误，可能侧边栏已关闭
    if (error.message.includes('Receiving end does not exist') || 
        error.message.includes('Extension context invalidated')) {
      logMessage('⚠️ 检测到侧边栏连接断开，重置状态');
      sidePanelInitialized = false;
    }
    
    throw error;
  }
}

// 无障碍模式状态
let accessibilityMode = false;

// 内容脚本管理工具
const ContentScriptManager = {
  // 检查内容脚本是否在指定标签页中活跃
  async checkContentScriptStatus(tabId) {
    try {
      logMessage(`检查标签页 ${tabId} 的内容脚本状态`);
      
      // 发送测试消息到内容脚本
      const response = await sendTabMessageWithRetry(tabId, {
        type: 'health_check',
        timestamp: Date.now()
      }, 1, 500); // 只尝试1次，快速失败
      
      if (response) {
        logMessage(`标签页 ${tabId} 内容脚本响应正常`);
        this.updateContentScriptState(tabId, true);
        return true;
      }
    } catch (error) {
      logMessage(`标签页 ${tabId} 内容脚本无响应: ${error.message}`);
      this.updateContentScriptState(tabId, false);
      return false;
    }
    
    return false;
  },
  
  // 动态注入内容脚本
  async injectContentScript(tabId) {
    try {
      logMessage(`开始向标签页 ${tabId} 注入内容脚本`);
      
      // 检查标签页是否有效
      const tab = await chrome.tabs.get(tabId);
      if (!isValidDocUrl(tab.url)) {
        logMessage(`标签页 ${tabId} URL不符合要求: ${tab.url}`);
        return false;
      }
      
      // 注入内容脚本
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      
      // 注入样式
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['styles.css']
      });
      
      logMessage(`✅ 成功向标签页 ${tabId} 注入内容脚本`);
      
      // 等待脚本初始化
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 验证注入是否成功
      const isWorking = await this.checkContentScriptStatus(tabId);
      if (isWorking) {
        this.updateContentScriptState(tabId, true);
        logMessage(`✅ 标签页 ${tabId} 内容脚本注入并验证成功`);
        return true;
      } else {
        logMessage(`❌ 标签页 ${tabId} 内容脚本注入后验证失败`);
        return false;
      }
      
    } catch (error) {
      logMessage(`❌ 向标签页 ${tabId} 注入内容脚本失败: ${error.message}`);
      this.updateContentScriptState(tabId, false);
      return false;
    }
  },
  
  // 确保内容脚本在指定标签页中可用
  async ensureContentScript(tabId) {
    const state = contentScriptStates.get(tabId);
    
    // 如果状态显示已注入且最近有活动，直接返回
    if (state && state.isInjected && (Date.now() - state.lastActiveTime) < 30000) {
      logMessage(`标签页 ${tabId} 内容脚本状态良好，无需重新注入`);
      return true;
    }
    
    // 检查内容脚本状态
    const isActive = await this.checkContentScriptStatus(tabId);
    if (isActive) {
      return true;
    }
    
    // 如果内容脚本不活跃，尝试注入
    logMessage(`标签页 ${tabId} 内容脚本不活跃，尝试重新注入`);
    return await this.injectContentScript(tabId);
  },
  
  // 更新内容脚本状态
  updateContentScriptState(tabId, isInjected) {
    const now = Date.now();
    const currentState = contentScriptStates.get(tabId) || { retryCount: 0 };
    
    contentScriptStates.set(tabId, {
      isInjected,
      lastActiveTime: isInjected ? now : (currentState.lastActiveTime || 0),
      retryCount: isInjected ? 0 : (currentState.retryCount + 1)
    });
    
    logMessage(`标签页 ${tabId} 状态更新: 注入=${isInjected}, 重试次数=${contentScriptStates.get(tabId).retryCount}`);
  },
  
  // 清理标签页状态
  cleanupTabState(tabId) {
    if (contentScriptStates.has(tabId)) {
      contentScriptStates.delete(tabId);
      logMessage(`清理标签页 ${tabId} 的内容脚本状态`);
    }
  },
  
  // 获取所有活跃标签页的状态摘要
  getStatusSummary() {
    const summary = [];
    contentScriptStates.forEach((state, tabId) => {
      summary.push({
        tabId,
        isInjected: state.isInjected,
        lastActiveTime: state.lastActiveTime,
        retryCount: state.retryCount,
        timeSinceLastActive: Date.now() - state.lastActiveTime
      });
    });
    return summary;
  }
};

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
chrome.action.onClicked.addListener(async (tab) => {
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
    // 🔑 新增：确保内容脚本在当前标签页中可用
    if (isValidDocUrl(tab.url)) {
      logMessage(`📋 确保标签页 ${tab.id} 内容脚本可用`);
      const scriptReady = await ContentScriptManager.ensureContentScript(tab.id);
      
      if (scriptReady) {
        logMessage(`✅ 标签页 ${tab.id} 内容脚本确认就绪`);
      } else {
        logMessage(`⚠️ 标签页 ${tab.id} 内容脚本未就绪，但继续打开侧边栏`);
      }
    }
    
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

// 监听标签页切换事件，确保内容脚本可用
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  logMessage(`标签页切换: ${activeInfo.tabId}`);
  
  try {
    // 检查当前活动的标签页是否是腾讯文档 sheet 模式页面
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    // 只监听应该被监听的标签页，避免扩展自身页面触发逻辑
    if (!shouldMonitorTab(tab.url)) {
      logMessage(`跳过监听标签页: ${tab.url} (扩展内部页面)`);
      return;
    }
    
    const isValidTab = isValidDocUrl(tab.url);
    
    if (!isValidTab) {
      // 如果不是腾讯文档 sheet 模式页面，设置侧边栏不可用
      try {
        chrome.sidePanel.setOptions({
          tabId: activeInfo.tabId,
          enabled: false
        });
        logMessage("标签页不是腾讯文档 sheet 模式，禁用侧边栏");
      } catch (err) {
        logMessage(`设置侧边栏状态错误: ${err.message}`);
      }
      
      // 清理内容脚本状态
      ContentScriptManager.cleanupTabState(activeInfo.tabId);
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
      
      // 🔑 关键改进：确保内容脚本在切换回来时可用
      logMessage(`🔄 标签页切换后检查内容脚本状态: ${activeInfo.tabId}`);
      const scriptReady = await ContentScriptManager.ensureContentScript(activeInfo.tabId);
      
      if (scriptReady) {
        logMessage(`✅ 标签页 ${activeInfo.tabId} 内容脚本就绪`);
      } else {
        logMessage(`❌ 标签页 ${activeInfo.tabId} 内容脚本无法就绪`);
      }
    }
  } catch (error) {
    logMessage(`标签页切换处理失败: ${error.message}`);
  }
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
      
      // 启动连接健康监控
      connectionHealthMonitor.startHealthCheck();
      logMessage("🔍 连接健康监控已启动");
    } else {
      console.log("🔄 侧边栏重新初始化");
      logMessage("🔄 侧边栏重新初始化");
    }
    
    // 记录成功的初始化
    connectionHealthMonitor.recordSuccess();
    
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
    
    // 停止连接健康监控
    connectionHealthMonitor.stopHealthCheck();
    logMessage("侧边栏已关闭，连接健康监控已停止");
    
    sendResponse({ status: 'ack' });
    return true;
  }
  
  // 处理调试测试消息
  if (message.type === 'debug_test') {
    console.log('收到调试测试消息:', message);
    logMessage(`收到调试测试消息: ${JSON.stringify(message)}`);
    
    // 添加内容脚本状态信息
    const contentScriptStatus = ContentScriptManager.getStatusSummary();
    
    sendResponse({ 
      status: 'success', 
      timestamp: Date.now(),
      sidePanelAPI: !!chrome.sidePanel,
      sidePanelInitialized: sidePanelInitialized,
      extensionId: chrome.runtime.id,
      contentScriptStatus: contentScriptStatus
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
        
        // 使用重试机制通知内容脚本
        sendTabMessageWithRetry(tabId, {
          type: 'stop_listening'
        }, 3, 1000).then(() => {
          logMessage('已通知内容脚本停止监听');
        }).catch(err => {
          logMessage(`通知内容脚本最终失败: ${err.message}`);
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
        
        // 使用重试机制通知内容脚本恢复监听
        sendTabMessageWithRetry(tabId, {
          type: 'start_listening'
        }, 3, 1000).then(() => {
          logMessage('已通知内容脚本恢复监听');
          sendResponse({ status: 'started', success: true });
        }).catch(err => {
          logMessage(`通知内容脚本最终失败: ${err.message}`);
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

// 监听标签页的导航事件，确保页面重新加载后内容脚本可用
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
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
        logMessage(`设置侧边栏状态错误: ${err.message}`);
      }
      
      // 清理内容脚本状态
      ContentScriptManager.cleanupTabState(tabId);
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
      
      // 🔑 关键改进：页面重新加载后确保内容脚本可用
      logMessage(`📄 页面加载完成，检查内容脚本状态: ${tabId}`);
      
      // 页面重新加载会清除所有注入的脚本，所以清理状态并重新注入
      ContentScriptManager.cleanupTabState(tabId);
      
      // 等待一段时间让页面完全稳定
      setTimeout(async () => {
        const scriptReady = await ContentScriptManager.ensureContentScript(tabId);
        
        if (scriptReady) {
          logMessage(`✅ 标签页 ${tabId} 页面加载后内容脚本就绪`);
        } else {
          logMessage(`❌ 标签页 ${tabId} 页面加载后内容脚本无法就绪`);
        }
      }, 2000); // 等待2秒确保页面完全加载
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