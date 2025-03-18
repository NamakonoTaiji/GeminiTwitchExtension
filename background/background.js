/**
 * Twitch Gemini Translator - バックグラウンドスクリプト
 * 
 * 拡張機能のメインバックグラウンドプロセスを管理し、
 * メッセージハンドリング、初期化、イベント処理を行います。
 */

import { loadSettings, getSettings, saveSettings, updateSetting } from './modules/settings.js';
import { initializeCache, clearCache } from './modules/cache.js';
import { initializeRequestQueue } from './modules/requestQueue.js';
import { translateText } from './modules/translator.js';
import { loadStats, saveStats, getStats } from './modules/stats.js';
import logger from './modules/logger.js';
import errorHandler from './modules/errorHandler.js';
import utils from './modules/utils.js';
// Service Workerではdynamic importが使えないため、ローカルのurlUtilsを静的インポートする
import * as urlUtils from './modules/urlUtils.js';

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
async function handleTabUpdated(tabId, changeInfo, tab) {
  // URLが変更され、Twitchページの場合
  if (changeInfo.url && changeInfo.url.includes('twitch.tv')) {
    logger.debug('Twitchタブが更新されました', 'background', { 
      tabId,
      url: changeInfo.url
    });
    
    // 自動オン/オフ機能が有効かつAPIキーが設定されている場合
    const settings = getSettings();
    
    if (settings.autoToggle && settings.apiKey) {
      try {
        // 配信視聴ページかチェック
        const isStream = urlUtils.isStreamPage(changeInfo.url);
        
        // 現在の有効/無効状態を取得
        const currentEnabled = settings.enabled;
        
        // ログ出力を強化
        logger.info(`URL判定: ${changeInfo.url} => ${isStream ? '配信ページ' : '非配信ページ'} (現在: ${currentEnabled ? '有効' : '無効'})`, 'background');
        
        // 配信ページと拡張機能の状態が一致しない場合は更新
        if (isStream !== currentEnabled) {
          logger.info(`URL判定に基づいて拡張機能を${isStream ? '有効' : '無効'}にします`, 'background', {
            url: changeInfo.url,
            isStreamPage: isStream
          });
          
          // 設定を更新
          await updateSetting('enabled', isStream);
          
          // アプリケーションの状態を更新
          appState.translationEnabled = isStream;
          
          // タブに通知
          try {
            await chrome.tabs.sendMessage(tabId, {
              action: 'settingsUpdated',
              settings: {
                ...settings,
                enabled: isStream
              }
            });
            logger.debug('設定更新をタブに通知しました', 'background');
          } catch (error) {
            // タブがまだ準備できていない可能性があるため、後で再試行
            logger.debug('設定更新の通知に失敗しました。後で再試行します。', 'background');
            
            // 1秒後に再試行
            setTimeout(async () => {
              try {
                await chrome.tabs.sendMessage(tabId, {
                  action: 'settingsUpdated',
                  settings: {
                    ...settings,
                    enabled: isStream
                  }
                });
                logger.debug('設定更新の再試行が成功しました', 'background');
              } catch (retryError) {
                logger.debug('設定更新の再試行にも失敗しました', 'background');
              }
            }, 1000);
          }
        }
      } catch (error) {
        logger.error('URL判定と設定更新中にエラーが発生しました', 'background', { error });
      }
    }
  }
  
  // ページのロード完了時にも状態を確認
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('twitch.tv')) {
    // 後からロードされた場合にも状態を確認する
    const settings = getSettings();
    
    if (settings.autoToggle && settings.apiKey) {
      try {
        // 配信視聴ページかチェック
        const isStream = urlUtils.isStreamPage(tab.url);
        const currentEnabled = settings.enabled;
        
        if (isStream !== currentEnabled) {
          logger.info(`ページロード完了時に拡張機能を${isStream ? '有効' : '無効'}にします`, 'background', {
            url: tab.url,
            isStreamPage: isStream
          });
          
          await updateSetting('enabled', isStream);
          appState.translationEnabled = isStream;
          
          try {
            await chrome.tabs.sendMessage(tabId, {
              action: 'settingsUpdated',
              settings: {
                ...settings,
                enabled: isStream
              }
            });
          } catch (error) {
            logger.debug('ページロード完了時の設定更新通知に失敗しました', 'background');
          }
        }
      } catch (error) {
        logger.error('ページロード完了処理でエラーが発生しました', 'background', { error });
      }
    }
  }
}

/**
 * APIキーのテスト
 * @param {string} apiKey テストするAPIキー
 * @returns {Promise<object>} テスト結果
 */
async function testApiKey(apiKey) {
  try {
    // 設定からモデル情報を取得
    const settings = getSettings();
    const model = settings.geminiModel || 'gemini-2.0-flash-lite';
    
    // 簡単なテストを実行
    // まず自動翻訳テスト用テキストを作成
    const testText = "Hello, this is a test message for the Twitch Gemini Translator extension.";
    
    // 翻訳オプションを設定
    const translationOptions = {
      model: model,
      sourceLanguage: 'auto'
    };
    
    // 実際に翻訳をテスト
    logger.info(`APIキーのテストを開始します (モデル: ${model})`, 'background');
    
    // 設定を一時的に上書き
    const originalApiKey = settings.apiKey;
    settings.apiKey = apiKey;
    
    // 翻訳を実行
    const result = await translateText(testText, translationOptions);
    
    // 設定を元に戻す
    settings.apiKey = originalApiKey;
    
    if (result.success) {
      logger.info('APIキーのテストに成功しました', 'background', { 
        model: model,
        translation: result.translation
      });
      return { valid: true, translation: result.translation };
    } else {
      logger.error('APIキーのテストに失敗しました', 'background', { 
        error: result.error,
        model: model
      });
      return { valid: false, error: result.error };
    }
  } catch (error) {
    const errorInfo = errorHandler.handleError(error, {
      source: 'background',
      code: 'api_test_error',
      details: 'APIキーのテスト中にエラーが発生しました'
    });
    
    return { valid: false, error: errorInfo.message };
  }
}

/**
 * メッセージハンドラーのマッピング
 */
/**
 * URL変更処理を行う
 * @param {string} url URL
 * @param {number|null} tabId タブID
 */
async function handleUrlChange(url, tabId) {
  try {
    if (!url) {
      logger.warn('URL変更処理: URLが指定されていません', 'background');
      return;
    }
    
    // 自動オン/オフ機能が有効かつAPIキーが設定されている場合
    const settings = getSettings();
    
    if (settings.autoToggle && settings.apiKey) {
      // 配信視聴ページかチェック
      const isStream = urlUtils.isStreamPage(url);
      
      // 現在の有効/無効状態を取得
      const currentEnabled = settings.enabled;
      
      // ログ出力を強化
      logger.info(`URL判定: ${url} => ${isStream ? '配信ページ' : '非配信ページ'} (現在: ${currentEnabled ? '有効' : '無効'})`, 'background');
      
      // 配信ページと拡張機能の状態が一致しない場合は更新
      if (isStream !== currentEnabled) {
        logger.info(`URL判定に基づいて拡張機能を${isStream ? '有効' : '無効'}にします`, 'background', {
          url: url,
          isStreamPage: isStream
        });
        
        // 設定を更新
        await updateSetting('enabled', isStream);
        
        // アプリケーションの状態を更新
        appState.translationEnabled = isStream;
        
        // タブに通知（タブIDが指定されている場合のみ）
        if (tabId) {
          try {
            await chrome.tabs.sendMessage(tabId, {
              action: 'settingsUpdated',
              settings: {
                ...settings,
                enabled: isStream
              }
            });
            logger.debug('設定更新をタブに通知しました', 'background');
          } catch (error) {
            // エラーは無視（タブが閉じられているなど）
            logger.debug('設定更新の通知に失敗しました', 'background', { error: error.message });
          }
        }
      }
    }
  } catch (error) {
    errorHandler.handleError(error, {
      source: 'background',
      code: 'url_change_error',
      details: 'URL変更処理中にエラーが発生しました'
    });
    
    logger.error('URL変更処理エラー:', 'background', { error: error.message });
  }
}

// URL変更のデバウンス処理（500ミリ秒）
const debouncedUrlChangeHandler = utils.debounce(async (url, tabId) => {
  await handleUrlChange(url, tabId);
}, 500);

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
  
  // 現在のURL判定
  'checkCurrentUrl': async (request, sender, sendResponse) => {
    try {
      if (!request.url) {
        return { success: false, error: 'URLが指定されていません' };
      }
      
      // URLが配信ページかどうかを判定
      const isStreamPage = urlUtils.isStreamPage(request.url);
      
      logger.debug(`URL判定リクエスト: ${request.url} => ${isStreamPage ? '配信ページ' : '非配信ページ'}`, 'background');
      
      return { success: true, isStreamPage };
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'url_check_error',
        details: 'URL判定中にエラーが発生しました'
      });
      
      logger.error('URL判定エラー:', 'background', { error: errorInfo.message });
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
      
      // 翻訳オプションを設定
      const translationOptions = {
        model: settings.geminiModel,
        sourceLanguage: request.sourceLanguage || 'auto',
        targetLanguage: 'ja'
      };
      
      // 翻訳を実行
      const result = await translateText(request.message, translationOptions);
      
      if (!result.success) {
        throw new Error(result.error || '翻訳に失敗しました');
      }
      
      logger.debug('メッセージ翻訳が完了しました', 'background', { 
        original: utils.truncateString(request.message, 30),
        translation: utils.truncateString(result.translation, 30),
        model: settings.geminiModel
      });
      
      return { 
        success: true, 
        translation: result.translation,
        sourceLanguage: result.detectedLanguage || 'unknown',
        model: settings.geminiModel
      };
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
  },
  
  // URL変更の通知
  'urlChanged': async (request, sender, sendResponse) => {
    try {
      if (!request.url) {
        return { success: false, error: 'URLが指定されていません' };
      }
      
      logger.debug(`URL変更通知を受信: ${request.url}`, 'background', { 
        tabId: sender.tab?.id,
        method: request.method || 'unknown'
      });
      
      // デバウンス処理を呼び出し（応答はすぐに返す）
      debouncedUrlChangeHandler(request.url, sender.tab?.id);
      
      return { success: true };
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'url_change_error',
        details: 'URL変更処理中にエラーが発生しました'
      });
      
      return { success: false, error: errorInfo.message };
    }
  },
  
  // APIキーのテスト
  'testApiKey': async (request, sender, sendResponse) => {
    try {
      // APIキーが空の場合はエラー
      if (!request.apiKey) {
        return { valid: false, error: 'APIキーが指定されていません' };
      }
      
      // APIキーのテストを実行
      const result = await testApiKey(request.apiKey);
      return result;
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'api_test_error',
        details: 'APIキーのテスト中にエラーが発生しました'
      });
      
      return { valid: false, error: errorInfo.message };
    }
  },
  
  // 現在のAPIキーのチェック
  'checkApiKey': async (request, sender, sendResponse) => {
    try {
      const settings = getSettings();
      
      // APIキーが空の場合はエラー
      if (!settings.apiKey) {
        return { valid: false, error: 'APIキーが設定されていません' };
      }
      
      // APIキーのテストを実行
      const result = await testApiKey(settings.apiKey);
      return result;
    } catch (error) {
      const errorInfo = errorHandler.handleError(error, {
        source: 'background',
        code: 'api_test_error',
        details: '現在のAPIキーのチェック中にエラーが発生しました'
      });
      
      return { valid: false, error: errorInfo.message };
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
