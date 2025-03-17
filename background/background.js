/**
 * Twitch Gemini Translator - バックグラウンドスクリプト
 * 
 * 拡張機能のメインバックグラウンドプロセスを管理し、
 * メッセージハンドリング、初期化、イベント処理を行います。
 */

import { loadSettings, getSettings } from './modules/settings.js';
import { initializeCache } from './modules/cache.js';
import { initializeRequestQueue } from './modules/requestQueue.js';
import { translateText } from './modules/translator.js';
import { loadStats, saveStats } from './modules/stats.js';
import logger from './modules/logger.js';
import errorHandler from './modules/errorHandler.js';
import utils from './modules/utils.js';

// アプリケーションの状態
const appState = {
  initialized: false,
  initializationError: null,
  translationEnabled: false,
  apiKeyValid: false,
  activeTabId: null,
  lastSaveTime: 0
};

/**
 * 拡張機能を初期化
 */
async function initializeExtension() {
  try {
    logger.info('拡張機能を初期化中...', 'background');
    
    // 設定を読み込む
    const settings = await loadSettings();
    
    // ロガーの設定を更新
    logger.configure({
      level: settings.debugMode ? logger.LOG_LEVELS.DEBUG : logger.LOG_LEVELS.INFO
    });
    
    // キャッシュを初期化
    await initializeCache();
    
    // リクエストキューを初期化
    initializeRequestQueue({
      maxConcurrentRequests: settings.maxConcurrentRequests,
      requestDelay: settings.requestDelay
    });
    
    // 統計情報を読み込む
    await loadStats();
    
    // 翻訳機能の有効状態を設定
    appState.translationEnabled = settings.enabled;
    appState.apiKeyValid = !!settings.apiKey;
    
    // 初期化完了
    appState.initialized = true;
    logger.info('拡張機能の初期化が完了しました', 'background', { 
      translationEnabled: appState.translationEnabled,
      apiKeyValid: appState.apiKeyValid
    });
    
    // 定期的な統計情報の保存を設定
    setInterval(periodicSave, 5 * 60 * 1000); // 5分ごと
    
    // アクティブタブの変更を監視
    chrome.tabs.onActivated.addListener(handleTabActivated);
    
    // タブの更新を監視
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    
    return true;
  } catch (error) {
    appState.initializationError = error;
    appState.initialized = false;
    
    // エラーを処理
    errorHandler.handleError(error, {
      source: 'background',
      code: 'internal_error',
      details: '拡張機能の初期化中にエラーが発生しました'
    });
    
    logger.error('拡張機能の初期化に失敗しました', 'background', { error });
    return false;
  }
}

/**
 * 定期的な保存処理
 */
async function periodicSave() {
  try {
    const now = Date.now();
    
    // 前回の保存から5分以上経過している場合のみ保存
    if (now - appState.lastSaveTime >= 5 * 60 * 1000) {
      await saveStats();
      appState.lastSaveTime = now;
      logger.debug('統計情報を定期保存しました', 'background');
    }
  } catch (error) {
    errorHandler.handleError(error, {
      source: 'background',
      code: 'storage_write_error',
      details: '統計情報の定期保存中にエラーが発生しました'
    });
  }
}

/**
 * アクティブタブが変更された時の処理
 * @param {object} activeInfo アクティブタブ情報
 */
function handleTabActivated(activeInfo) {
  appState.activeTabId = activeInfo.tabId;
  
  // Twitchタブかどうかを確認
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    const isTwitchTab = tab.url && tab.url.includes('twitch.tv');
    logger.debug('アクティブタブが変更されました', 'background', { 
      tabId: activeInfo.tabId,
      isTwitchTab,
      url: tab.url
    });
  });
}

/**
 * タブが更新された時の処理
 * @param {number} tabId タブID
 * @param {object} changeInfo 変更情報
 * @param {object} tab タブ情報
 */
function handleTabUpdated(tabId, changeInfo, tab) {
  // URLが変更され、Twitchページの場合
  if (changeInfo.url && changeInfo.url.includes('twitch.tv')) {
    logger.debug('Twitchタブが更新されました', 'background', { 
      tabId,
      url: changeInfo.url
    });
  }
}

/**
 * メッセージハンドラーのマッピング
 */
const messageHandlers = {
  // 翻訳リクエスト
  'translate': async (request, sender, sendResponse) => {
    try {
      const settings = getSettings();
      
      // 翻訳が無効または初期化されていない場合
      if (!appState.initialized || !settings.enabled) {
        return { success: false, error: '翻訳機能が無効です' };
      }
      
      // APIキーが設定されていない場合
      if (!settings.apiKey) {
        return { success: false, error: 'APIキーが設定されていません' };
      }
      
      // 翻訳を実行
      const result = await translateText(request.text, request.options);
      return { success: true, translation: result };
    } catch (error) {
      // エラーを処理
      const errorInfo = errorHandler.handleError(error, {
        source: 'translator',
        code: 'translation_failed',
        details: `テキスト「${utils.truncateString(request.text, 50)}」の翻訳中にエラーが発生しました`
      });
      
      return { success: false, error: errorInfo.message };
    }
  },
  
  // コンテンツスクリプトからのメッセージ翻訳リクエスト
  'translateMessage': async (request, sender, sendResponse) => {
    try {
      logger.debug('メッセージ翻訳リクエストを受信しました', 'background', { 
        message: utils.truncateString(request.message, 50),
        tabId: sender.tab?.id
      });
      
      const settings = getSettings();
      
      // 翻訳が無効または初期化されていない場合
      if (!appState.initialized || !settings.enabled) {
        return { success: false, error: '翻訳機能が無効です' };
      }
      
      // APIキーが設定されていない場合
      if (!settings.apiKey) {
        return { success: false, error: 'APIキーが設定されていません' };
      }
      
      // 翻訳を実行
      const result = await translateText(
        request.message, 
        settings.apiKey,
        'auto'
      );
      
      if (!result.success) {
        throw new Error(result.error || '翻訳に失敗しました');
      }
      
      logger.debug('メッセージ翻訳が完了しました', 'background', { 
        original: utils.truncateString(request.message, 30),
        translation: utils.truncateString(result.translation, 30)
      });
      
      return { success: true, translation: result.translation };
    } catch (error) {
      // エラーを処理
      const errorInfo = errorHandler.handleError(error, {
        source: 'translator',
        code: 'translation_failed',
        details: `メッセージ「${utils.truncateString(request.message, 50)}」の翻訳中にエラーが発生しました`
      });
      
      logger.error('メッセージ翻訳に失敗しました', 'background', { 
        error: errorInfo.message,
        message: utils.truncateString(request.message, 50)
      });
      
      return { success: false, error: errorInfo.message };
    }
  },
  
  // 設定の取得
  'getSettings': async (request, sender, sendResponse) => {
    try {
      const settings = getSettings();
      return { success: true, settings };
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'storage_read_error',
        details: '設定の取得中にエラーが発生しました'
      });
      
      return { success: false, error: errorInfo.message };
    }
  },
  
  // 拡張機能の状態を取得
  'getStatus': async (request, sender, sendResponse) => {
    try {
      const settings = getSettings();
      
      return {
        success: true,
        status: {
          initialized: appState.initialized,
          enabled: settings.enabled,
          apiKeyValid: !!settings.apiKey,
          debugMode: settings.debugMode
        }
      };
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'internal_error',
        details: '拡張機能の状態取得中にエラーが発生しました'
      });
      
      return { success: false, error: errorInfo.message };
    }
  },
  
  // 拡張機能の有効/無効を切り替え
  'toggleEnabled': async (request, sender, sendResponse) => {
    try {
      const settings = getSettings();
      settings.enabled = request.enabled;
      
      // 設定を保存
      await chrome.storage.local.set({ translatorSettings: settings });
      
      // アプリケーションの状態を更新
      appState.translationEnabled = settings.enabled;
      
      // 他のタブに通知
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id !== sender.tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'settingsUpdated',
              settings
            }).catch(() => {
              // エラーは無視（タブが閉じられている可能性がある）
            });
          }
        });
      });
      
      logger.info(`翻訳機能を${settings.enabled ? '有効' : '無効'}にしました`, 'background');
      
      return { success: true };
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'storage_write_error',
        details: '設定の保存中にエラーが発生しました'
      });
      
      return { success: false, error: errorInfo.message };
    }
  },
  
  // APIキーを更新
  'updateApiKey': async (request, sender, sendResponse) => {
    try {
      const settings = getSettings();
      settings.apiKey = request.apiKey;
      
      // 設定を保存
      await chrome.storage.local.set({ translatorSettings: settings });
      
      // アプリケーションの状態を更新
      appState.apiKeyValid = !!settings.apiKey;
      
      // 他のタブに通知
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'apiKeyUpdated',
            hasKey: !!settings.apiKey
          }).catch(() => {
            // エラーは無視（タブが閉じられている可能性がある）
          });
        });
      });
      
      logger.info('APIキーを更新しました', 'background', { hasKey: !!settings.apiKey });
      
      return { success: true };
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'storage_write_error',
        details: 'APIキーの保存中にエラーが発生しました'
      });
      
      return { success: false, error: errorInfo.message };
    }
  },
  
  // キャッシュをクリア
  'clearCache': async (request, sender, sendResponse) => {
    try {
      // キャッシュをクリア
      const clearedItems = await clearCache();
      
      logger.info(`キャッシュをクリアしました (${clearedItems}アイテム)`, 'background');
      
      return { success: true, clearedItems };
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'cache_clear_error',
        details: 'キャッシュのクリア中にエラーが発生しました'
      });
      
      return { success: false, error: errorInfo.message };
    }
  },
  
  // 統計情報を取得
  'getStats': async (request, sender, sendResponse) => {
    try {
      const stats = await getStats();
      return { success: true, stats };
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'storage_read_error',
        details: '統計情報の取得中にエラーが発生しました'
      });
      
      return { success: false, error: errorInfo.message };
    }
  },
  
  // ログを取得
  'getLogs': async (request, sender, sendResponse) => {
    try {
      const count = request.count || 50;
      const minLevel = request.minLevel || logger.LOG_LEVELS.INFO;
      
      const logs = logger.getLogs(count, minLevel);
      return { success: true, logs };
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'internal_error',
        details: 'ログの取得中にエラーが発生しました'
      });
      
      return { success: false, error: errorInfo.message };
    }
  }
};

/**
 * メッセージハンドラー
 * @param {object} request リクエスト
 * @param {object} sender 送信者
 * @param {function} sendResponse レスポンス送信関数
 * @returns {boolean} 非同期処理を行うかどうか
 */
function handleMessage(request, sender, sendResponse) {
  try {
    // アクションが指定されていない場合
    if (!request || !request.action) {
      sendResponse({ success: false, error: '無効なリクエスト: アクションが指定されていません' });
      return false;
    }
    
    // ハンドラーが存在するか確認
    const handler = messageHandlers[request.action];
    if (!handler) {
      logger.warn(`不明なアクション: ${request.action}`, 'background');
      sendResponse({ success: false, error: `不明なアクション: ${request.action}` });
      return false;
    }
    
    // 非同期ハンドラーを実行
    handler(request, sender, sendResponse)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        const errorInfo = errorHandler.handleError(error, {
          source: 'background',
          code: 'message_handler_error',
          details: `メッセージハンドラー「${request.action}」でエラーが発生しました`
        });
        
        sendResponse({ success: false, error: errorInfo.message });
      });
    
    // 非同期レスポンスを有効にする
    return true;
  } catch (error) {
    const errorInfo = errorHandler.handleError(error, {
      source: 'background',
      code: 'message_handling_error',
      details: 'メッセージ処理中にエラーが発生しました'
    });
    
    sendResponse({ success: false, error: errorInfo.message });
    return false;
  }
}

// メッセージリスナーを登録
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 非同期レスポンスを有効にする
  const asyncResponse = handleMessage(request, sender, sendResponse);
  return asyncResponse;
});

// 拡張機能を初期化
initializeExtension();
