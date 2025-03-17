/**
 * Twitch Gemini Translator - Background Service Worker
 * 
 * バックグラウンドプロセスを提供し、翻訳リクエストの処理、
 * 設定の管理、キャッシュの管理、統計情報の追跡などを行います。
 */

// モジュールのインポート
import * as Settings from './modules/settings.js';
import * as Stats from './modules/stats.js';
import * as Cache from './modules/cache.js';
import * as Translator from './modules/translator.js';
import * as RequestQueue from './modules/requestQueue.js';

// メッセージリスナーの設定
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 翻訳リクエスト
  if (message.action === "translate") {
    handleTranslateRequest(message, sendResponse);
    return true; // 非同期応答のために必要
  }

  // 設定の取得
  else if (message.action === "getSettings") {
    sendResponse(Settings.getSettings());
    return true;
  }

  // APIキーのテスト
  else if (message.action === "testApiKey") {
    Translator.testApiKey(message.apiKey).then(sendResponse);
    return true; // 非同期応答のために必要
  }

  // 現在のAPIキーの有効性チェック
  else if (message.action === "checkApiKey") {
    handleCheckApiKey(sendResponse);
    return true; // 非同期応答のために必要
  }

  // 設定更新の通知
  else if (message.action === "settingsUpdated") {
    handleSettingsUpdated(sendResponse);
    return true;
  }

  // 翻訳統計の取得
  else if (message.action === "getStats") {
    sendResponse({
      success: true,
      stats: Stats.getStats(Cache.getCacheSize())
    });
    return true;
  }

  // 統計情報のリセット
  else if (message.action === "resetStats") {
    Stats.resetStats().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  // キャッシュのクリア
  else if (message.action === "clearCache") {
    const previousSize = Cache.clearCache();
    console.log(`キャッシュをクリアしました (前: ${previousSize} エントリ)`);
    sendResponse({
      success: true,
      message: `キャッシュをクリアしました (${previousSize} エントリ)`,
    });
    return true;
  }

  // Content Scriptからの初期化通知
  else if (message.action === "contentScriptInitialized") {
    handleContentScriptInitialized(message, sendResponse);
    return true;
  }

  // Pingリクエスト - 拡張機能コンテキストの有効性確認用
  else if (message.action === "ping") {
    const settings = Settings.getSettings();
    sendResponse({ 
      success: true, 
      message: "pong",
      debug: {
        cacheSize: Cache.getCacheSize(),
        enabled: settings.enabled,
        processExistingMessages: settings.processExistingMessages,
        timestamp: Date.now()
      }
    });
    return true;
  }
  
  // チャンネル変更通知
  else if (message.action === "channelChanged") {
    handleChannelChanged(message, sendResponse);
    return true;
  }
});

/**
 * 翻訳リクエストの処理
 * @param {object} message メッセージオブジェクト
 * @param {function} sendResponse 応答コールバック
 */
async function handleTranslateRequest(message, sendResponse) {
  const settings = Settings.getSettings();
  
  // キャッシュチェックを先に行う
  const cachedResult = Cache.getCachedTranslation(
    message.text,
    message.sourceLang || "auto"
  );
  if (cachedResult) {
    // キャッシュ結果にエンジン情報がない場合は追加
    if (!cachedResult.engine) {
      cachedResult.engine = "cached";
    }
    
    // デバッグ情報を追加
    console.log(`キャッシュヒット: "${message.text.substring(0, 20)}..."`);
    
    sendResponse(cachedResult);
    return;
  }

  // 翻訳が無効の場合はエラーを返す
  if (!settings.enabled) {
    // エラーログに詳細情報を追加
    console.warn("翻訳機能が無効になっています。現在のsettings:", settings);
    sendResponse({ success: false, error: "翻訳機能が無効になっています" });
    return;
  }

  // APIキーが設定されていない場合はエラーを返す
  if (!settings.apiKey) {
    sendResponse({
      success: false,
      error: "Gemini APIキーが設定されていません",
    });
    return;
  }

  // キューにリクエストを追加
  try {
    const result = await RequestQueue.enqueueTranslationRequest(
      message.text,
      message.sourceLang || "auto"
    );
    sendResponse(result);
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * APIキーの有効性チェック処理
 * @param {function} sendResponse 応答コールバック
 */
function handleCheckApiKey(sendResponse) {
  const settings = Settings.getSettings();
  
  if (!settings.apiKey) {
    sendResponse({ valid: false, error: "APIキーが設定されていません" });
  } else {
    Translator.testApiKey(settings.apiKey).then(sendResponse);
  }
}

/**
 * 設定更新通知の処理
 * @param {function} sendResponse 応答コールバック
 */
async function handleSettingsUpdated(sendResponse) {
  // 設定を再ロード
  await Settings.loadSettings();
  const settings = Settings.getSettings();

  // 設定更新時のデバッグ情報の追加
  console.log("設定が更新されました:", {
    enabled: settings.enabled,
    hasApiKey: !!settings.apiKey,
    translationMode: settings.translationMode,
  });

  // 現在のセッションIDを記録して、同期問題を回避
  const sessionId = Date.now().toString();
  try {
    await chrome.storage.local.set({ settingsSessionId: sessionId });
  } catch (error) {
    console.error("セッションID保存エラー:", error);
  }

  sendResponse({ success: true, sessionId });
}

/**
 * Content Script初期化通知の処理
 * @param {object} message メッセージオブジェクト
 * @param {function} sendResponse 応答コールバック
 */
async function handleContentScriptInitialized(message, sendResponse) {
  console.log("Content Scriptが初期化されました。有効状態:", message.enabled);
  
  // 設定を再ロード - タブ間の状態一貫性を強化
  try {
    await Settings.loadSettings();
    const settings = Settings.getSettings();
    console.log('初期化通知を受けて設定を再ロードしました');
    
    sendResponse({ 
      success: true, 
      settings: {
        enabled: settings.enabled,
        processExistingMessages: settings.processExistingMessages
      }
    });
  } catch (error) {
    console.error('初期化通知処理中のエラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * チャンネル変更通知の処理
 * @param {object} message メッセージオブジェクト
 * @param {function} sendResponse 応答コールバック
 */
function handleChannelChanged(message, sendResponse) {
  console.log(`チャンネル変更通知を受信: ${message.from} -> ${message.to}`);
  const settings = Settings.getSettings();
  
  // チャンネルごとの翻訳履歴管理を将来実装する場合はここで処理
  sendResponse({ 
    success: true,
    settings: {
      enabled: settings.enabled,
      processExistingMessages: settings.processExistingMessages
    }
  });
}

// 拡張機能のアンロード時にキャッシュと統計情報を保存
chrome.runtime.onSuspend.addListener(() => {
  console.log("拡張機能が停止されます。キャッシュと統計情報を保存します。");
  Cache.saveCache(true);
  Stats.saveStats();
});

// 定期的にキャッシュと統計情報を保存する関数
function schedulePeriodicalSaves() {
  // 1時間ごとにキャッシュと統計情報を保存
  setInterval(() => {
    Cache.saveCache();
    Stats.saveStats();
  }, 60 * 60 * 1000);
}

// 初期化処理
async function initialize() {
  try {
    console.log("Twitch Gemini Translator: バックグラウンドスクリプト初期化開始");
    
    // 設定を読み込む
    await Settings.loadSettings();
    const settings = Settings.getSettings();
    console.log("設定を読み込みました:", settings);
    
    // 統計情報を読み込む
    await Stats.loadStats();
    
    // キャッシュを読み込む
    if (settings.useCache) {
      await Cache.loadCache();
    }
    
    // 定期保存をスケジュール
    schedulePeriodicalSaves();
    
    console.log("Twitch Gemini Translator: バックグラウンドスクリプト初期化完了");
  } catch (error) {
    console.error("初期化中にエラーが発生しました:", error);
  }
}

// 初期化の実行
initialize();
