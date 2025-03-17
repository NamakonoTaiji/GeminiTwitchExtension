/**
 * Twitch Gemini Translator: メインコンテンツスクリプト（リファクタリング版）
 * 
 * このスクリプトは、Twitchチャットメッセージをリアルタイムで翻訳するための
 * コンテンツスクリプトのメインエントリーポイントです。
 */

// Chrome API ブリッジ
// コンテンツスクリプトとの通信を行うためのブリッジ
const chromeBridge = {
  // リクエストIDの生成
  _requestCounter: 0,
  _callbacks: new Map(),
  
  // リクエストIDを生成
  _generateRequestId() {
    return `req_${Date.now()}_${this._requestCounter++}`;
  },
  
  // メッセージリスナーを初期化
  _initializeListeners() {
    window.addEventListener('message', (event) => {
      // 同一オリジンからのメッセージのみを処理
      if (event.source !== window) return;
      
      // コンテンツスクリプトからのメッセージのみを処理
      if (!event.data || !event.data.from || event.data.from !== 'TWITCH_GEMINI_TRANSLATOR_CONTENT_SCRIPT') return;
      
      // リクエストIDに対応するコールバックを取得
      const callback = this._callbacks.get(event.data.requestId);
      if (!callback) return;
      
      // コールバックを実行して削除
      callback(event.data);
      this._callbacks.delete(event.data.requestId);
    });
  },
  
  // chrome.runtime.sendMessageの代替
  runtime: {
    sendMessage(message, callback) {
      const requestId = chromeBridge._generateRequestId();
      
      // コールバックを登録
      if (callback) {
        chromeBridge._callbacks.set(requestId, (data) => {
          if (data.type === 'CHROME_RUNTIME_RESPONSE') {
            callback(data.response);
          }
        });
      }
      
      // メッセージを送信
      window.postMessage({
        from: 'TWITCH_GEMINI_TRANSLATOR',
        type: 'CHROME_RUNTIME_SEND_MESSAGE',
        requestId: requestId,
        message: message
      }, '*');
    }
  },
  
  // chrome.storage.localの代替
  storage: {
    local: {
      get(keys, callback) {
        const requestId = chromeBridge._generateRequestId();
        
        // コールバックを登録
        if (callback) {
          chromeBridge._callbacks.set(requestId, (data) => {
            if (data.type === 'CHROME_STORAGE_RESPONSE') {
              callback(data.result);
            }
          });
        }
        
        // メッセージを送信
        window.postMessage({
          from: 'TWITCH_GEMINI_TRANSLATOR',
          type: 'CHROME_STORAGE_GET',
          requestId: requestId,
          keys: keys
        }, '*');
      },
      
      set(items, callback) {
        const requestId = chromeBridge._generateRequestId();
        
        // コールバックを登録
        if (callback) {
          chromeBridge._callbacks.set(requestId, (data) => {
            if (data.type === 'CHROME_STORAGE_RESPONSE' && data.success) {
              callback();
            }
          });
        }
        
        // メッセージを送信
        window.postMessage({
          from: 'TWITCH_GEMINI_TRANSLATOR',
          type: 'CHROME_STORAGE_SET',
          requestId: requestId,
          items: items
        }, '*');
      }
    }
  }
};

// リスナーを初期化
chromeBridge._initializeListeners();

// chrome オブジェクトを上書き
if (typeof chrome === 'undefined') {
  window.chrome = {
    runtime: chromeBridge.runtime,
    storage: chromeBridge.storage
  };
} else {
  // 既存のchromeオブジェクトがある場合は拡張
  if (!chrome.runtime) chrome.runtime = chromeBridge.runtime;
  if (!chrome.storage) chrome.storage = chromeBridge.storage;
}

// ユーティリティモジュールのインポート
import { getLogger, LogLevel } from '/utils/logger.js';
import { 
  handleError, 
  handleNetworkError, 
  handleTranslationError, 
  handleExtensionError,
  ErrorCategory,
  ErrorSeverity
} from '/utils/errorHandler.js';
import { getCachedTranslation, cacheTranslation } from '/background/modules/cache.js';
import { debounce } from '/utils/utils.js';
import { createUrlChangeDetector } from '/utils/domObserver.js';
import {
  initializeDomManager,
  observeChatMessages,
  stopObservingChat,
  processChatMessage,
  processPastMessages
} from '/content/modules/domManager.js';
import {
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings
} from '/content/modules/settingsManager.js';
import {
  sendTranslationRequest,
  sendApiKeyUpdateNotification,
  sendToggleEnabledNotification,
  sendClearCacheRequest
} from '/content/modules/messaging.js';
import {
  shouldTranslateMessage,
  detectLanguage,
  displayTranslation
} from '/content/modules/messageProcessor.js';

// ロガーの初期化
const logger = getLogger('Content');

// アプリケーションの状態
const appState = {
  initialized: false,
  observing: false,
  enabled: false,
  urlChangeDetector: null,
  settings: null,
  retryCount: 0,
  maxRetries: 5,
  retryDelay: 2000, // ミリ秒
};

/**
 * デバウンスされた初期化関数
 * 短時間に複数回呼び出されても1回だけ実行される
 */
const debouncedInitialize = debounce(async () => {
  try {
    await initialize();
  } catch (error) {
    handleError(error, ErrorCategory.INITIALIZATION, ErrorSeverity.HIGH, 'コンテンツスクリプトの初期化中にエラーが発生しました');
  }
}, 500);

/**
 * デバウンスされた設定更新関数
 */
const debouncedUpdateSettings = debounce(async () => {
  try {
    logger.info('設定の更新を開始します...');
    await updateSettings();
    logger.info('設定の更新が完了しました');
  } catch (error) {
    handleError(error, ErrorCategory.SETTINGS, ErrorSeverity.MEDIUM, '設定の更新中にエラーが発生しました');
  }
}, 500);

/**
 * デバウンスされたコンテキスト無効化ハンドラ
 */
const debouncedHandleContextInvalidated = debounce(() => {
  logger.warn('拡張機能コンテキストが無効になりました。再接続を試みます...');
  
  // 再試行カウンターをインクリメント
  appState.retryCount++;
  
  if (appState.retryCount <= appState.maxRetries) {
    logger.info(`再接続を試みています (${appState.retryCount}/${appState.maxRetries})...`);
    
    // 遅延して再初期化
    setTimeout(() => {
      debouncedInitialize();
    }, appState.retryDelay * appState.retryCount);
  } else {
    logger.error(`最大再試行回数 (${appState.maxRetries}) に達しました。再接続を停止します。`);
  }
}, 1000);

/**
 * コンテキスト無効化時の処理
 */
function handleContextInvalidated() {
  // アプリケーションの状態をリセット
  appState.initialized = false;
  appState.observing = false;
  
  // 監視を停止
  try {
    stopObservingChat();
  } catch (error) {
    // エラーは無視（既に停止している可能性がある）
  }
  
  // デバウンスされた処理を呼び出し
  debouncedHandleContextInvalidated();
}

/**
 * 拡張機能の初期化
 */
async function initialize() {
  try {
    logger.info('コンテンツスクリプトの初期化を開始します...');
    
    // 既に初期化されている場合は何もしない
    if (appState.initialized) {
      logger.info('コンテンツスクリプトは既に初期化されています');
      return;
    }
    
    // 設定の読み込み
    await loadSettings();
    appState.settings = getSettings();
    
    // URL変更検出器の初期化
    appState.urlChangeDetector = createUrlChangeDetector();
    
    // DOM管理モジュールの初期化
    initializeDomManager();
    
    // 拡張機能の有効/無効状態を設定
    appState.enabled = appState.settings.enabled;
    
    // 有効な場合はチャット監視を開始
    if (appState.enabled) {
      observeChatMessages();
      appState.observing = true;
      
      // 既存のメッセージを処理
      processPastMessages();
    }
    
    // 初期化完了
    appState.initialized = true;
    appState.retryCount = 0;
    
    logger.info('コンテンツスクリプトの初期化が完了しました');
  } catch (error) {
    handleError(error, ErrorCategory.INITIALIZATION, ErrorSeverity.HIGH, 'コンテンツスクリプトの初期化中にエラーが発生しました');
    throw error;
  }
}

/**
 * メッセージリスナーのセットアップ
 */
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      logger.debug('メッセージを受信しました:', message);
      
      // メッセージタイプに基づいて処理
      switch (message.action) {
        case 'settingsUpdated':
          handleSettingsUpdate(message.settings, sendResponse);
          return true; // 非同期レスポンスを有効化
          
        case 'toggleEnabled':
          handleToggleEnabled(message.enabled, sendResponse);
          return true; // 非同期レスポンスを有効化
          
        case 'apiKeyUpdated':
          handleApiKeyUpdate(message.hasKey, sendResponse);
          return true; // 非同期レスポンスを有効化
          
        case 'clearCache':
          handleClearCache(sendResponse);
          return true; // 非同期レスポンスを有効化
          
        default:
          logger.warn('不明なメッセージアクション:', message.action);
          sendResponse({ success: false, error: '不明なアクション' });
      }
    } catch (error) {
      handleError(error, ErrorCategory.MESSAGING, ErrorSeverity.MEDIUM, 'メッセージ処理中にエラーが発生しました');
      sendResponse({ success: false, error: error.message });
    }
    
    return false; // 同期レスポンス
  });
}

/**
 * 設定更新の処理
 * @param {object} newSettings 新しい設定
 * @param {function} sendResponse レスポンス関数
 */
async function handleSettingsUpdate(newSettings, sendResponse) {
  try {
    logger.info('設定の更新を処理しています...');
    
    // 設定を更新
    await updateSettings(newSettings);
    appState.settings = getSettings();
    
    // 有効/無効状態が変更された場合
    if (appState.enabled !== appState.settings.enabled) {
      appState.enabled = appState.settings.enabled;
      
      if (appState.enabled && !appState.observing) {
        // 有効になった場合は監視を開始
        observeChatMessages();
        appState.observing = true;
        
        // 既存のメッセージを処理
        processPastMessages();
      } else if (!appState.enabled && appState.observing) {
        // 無効になった場合は監視を停止
        stopObservingChat();
        appState.observing = false;
      }
    }
    
    logger.info('設定の更新が完了しました');
    sendResponse({ success: true });
  } catch (error) {
    handleError(error, ErrorCategory.SETTINGS, ErrorSeverity.MEDIUM, '設定の更新中にエラーが発生しました');
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * 有効/無効切り替えの処理
 * @param {boolean} enabled 有効/無効
 * @param {function} sendResponse レスポンス関数
 */
async function handleToggleEnabled(enabled, sendResponse) {
  try {
    logger.info(`拡張機能の有効/無効を切り替えています: ${enabled}`);
    
    // 設定を更新
    appState.settings.enabled = enabled;
    await saveSettings(appState.settings);
    
    // アプリケーションの状態を更新
    appState.enabled = enabled;
    
    if (enabled && !appState.observing) {
      // 有効になった場合は監視を開始
      observeChatMessages();
      appState.observing = true;
      
      // 既存のメッセージを処理
      processPastMessages();
    } else if (!enabled && appState.observing) {
      // 無効になった場合は監視を停止
      stopObservingChat();
      appState.observing = false;
    }
    
    // 他のタブに通知
    sendToggleEnabledNotification(enabled);
    
    logger.info(`拡張機能の有効/無効を切り替えました: ${enabled}`);
    sendResponse({ success: true });
  } catch (error) {
    handleError(error, ErrorCategory.SETTINGS, ErrorSeverity.MEDIUM, '有効/無効の切り替え中にエラーが発生しました');
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * APIキー更新の処理
 * @param {boolean} hasKey APIキーが設定されているかどうか
 * @param {function} sendResponse レスポンス関数
 */
async function handleApiKeyUpdate(hasKey, sendResponse) {
  try {
    logger.info(`APIキーの更新を処理しています: ${hasKey ? '設定済み' : '未設定'}`);
    
    // 設定を更新
    await updateSettings();
    appState.settings = getSettings();
    
    logger.info('APIキーの更新が完了しました');
    sendResponse({ success: true });
  } catch (error) {
    handleError(error, ErrorCategory.SETTINGS, ErrorSeverity.MEDIUM, 'APIキーの更新中にエラーが発生しました');
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * キャッシュクリアの処理
 * @param {function} sendResponse レスポンス関数
 */
async function handleClearCache(sendResponse) {
  try {
    logger.info('キャッシュのクリアを処理しています...');
    
    // キャッシュクリアリクエストを送信
    const result = await sendClearCacheRequest();
    
    if (result.success) {
      logger.info(`キャッシュがクリアされました: ${result.clearedItems}アイテム`);
    } else {
      logger.warn('キャッシュのクリアに失敗しました:', result.error);
    }
    
    sendResponse({ success: result.success, clearedItems: result.clearedItems });
  } catch (error) {
    handleError(error, ErrorCategory.CACHE, ErrorSeverity.LOW, 'キャッシュのクリア中にエラーが発生しました');
    sendResponse({ success: false, error: error.message });
  }
}

// メッセージリスナーをセットアップ
setupMessageListeners();

// 初期化を実行
initialize();
