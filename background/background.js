// Gemini API関連の定数
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// APIリクエストの管理
let pendingRequests = 0;
const MAX_CONCURRENT_REQUESTS = 5;
const requestQueue = [];

// 翻訳キャッシュ
const translationCache = new Map();
const MAX_CACHE_SIZE = 1000; // 最大キャッシュサイズ

// 設定データのデフォルト値
const defaultSettings = {
  apiKey: '',
  enabled: false,
  translationMode: 'selective',
  japaneseThreshold: 30,
  englishThreshold: 50,
  displayPrefix: '🇯🇵',
  textColor: '#9b9b9b',
  accentColor: '#9147ff',
  fontSize: 'medium',
  useCache: true, // キャッシュ機能の有効/無効
  maxCacheAge: 24, // キャッシュの有効期間（時間）
  processExistingMessages: false, // 既存コメントを処理するかどうか
  requestDelay: 100 // リクエスト間の最小遅延（ミリ秒）
};

// 設定データをロード
let settings = { ...defaultSettings };

// 統計情報
let stats = {
  totalRequests: 0,
  cacheHits: 0,
  apiRequests: 0,
  errors: 0,
  charactersTranslated: 0,
  lastReset: Date.now()
};

// 初期化処理
async function initialize() {
  // 保存された設定を読み込む
  const result = await chrome.storage.sync.get(defaultSettings);
  
  settings = result;
  console.log('Twitch Gemini Translator: バックグラウンドスクリプト初期化完了');
  console.log('現在の設定:', settings);
  
  // 統計情報を読み込む
  try {
    const savedStats = await chrome.storage.local.get('translationStats');
    if (savedStats.translationStats) {
      stats = savedStats.translationStats;
    }
  } catch (error) {
    console.error('統計情報の読み込みに失敗:', error);
  }
  
  // 古いキャッシュデータをロード
  if (settings.useCache) {
    try {
      const savedCache = await chrome.storage.local.get('translationCache');
      if (savedCache.translationCache) {
        const now = Date.now();
        const maxAge = settings.maxCacheAge * 60 * 60 * 1000; // 時間をミリ秒に変換
        
        // 期限内のキャッシュのみ復元
        Object.entries(savedCache.translationCache).forEach(([key, entry]) => {
          if (now - entry.timestamp < maxAge) {
            translationCache.set(key, entry);
          }
        });
        
        console.log(`${translationCache.size}件のキャッシュをロードしました`);
      }
    } catch (error) {
      console.error('キャッシュの読み込みに失敗:', error);
    }
  }
}

// キャッシュを保存
async function saveCache() {
  if (!settings.useCache || translationCache.size === 0) {
    return;
  }
  
  try {
    // MapオブジェクトをObjectに変換
    const cacheObject = {};
    translationCache.forEach((value, key) => {
      cacheObject[key] = value;
    });
    
    await chrome.storage.local.set({ translationCache: cacheObject });
    console.log(`${translationCache.size}件のキャッシュを保存しました`);
  } catch (error) {
    console.error('キャッシュの保存に失敗:', error);
  }
}

// 統計情報を保存
async function saveStats() {
  try {
    await chrome.storage.local.set({ translationStats: stats });
  } catch (error) {
    console.error('統計情報の保存に失敗:', error);
  }
}

// キャッシュからの翻訳取得
function getCachedTranslation(text, sourceLang) {
  if (!settings.useCache) {
    return null;
  }
  
  const cacheKey = `${sourceLang}:${text}`;
  const cachedEntry = translationCache.get(cacheKey);
  
  if (!cachedEntry) {
    return null;
  }
  
  // キャッシュの有効期限をチェック
  const now = Date.now();
  const maxAge = settings.maxCacheAge * 60 * 60 * 1000; // 時間をミリ秒に変換
  
  if (now - cachedEntry.timestamp > maxAge) {
    // 期限切れのキャッシュを削除
    translationCache.delete(cacheKey);
    return null;
  }
  
  // キャッシュヒットの統計を更新
  stats.totalRequests++;
  stats.cacheHits++;
  
  // キャッシュのタイムスタンプを更新（アクセス時間の更新）
  cachedEntry.timestamp = now;
  translationCache.set(cacheKey, cachedEntry);
  
  return cachedEntry.translation;
}

// キャッシュに翻訳を保存
function cacheTranslation(text, sourceLang, translationResult) {
  if (!settings.useCache || !translationResult.success) {
    return;
  }
  
  const cacheKey = `${sourceLang}:${text}`;
  
  // キャッシュが最大サイズに達した場合、最も古いエントリを削除
  if (translationCache.size >= MAX_CACHE_SIZE) {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    translationCache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    });
    
    if (oldestKey) {
      translationCache.delete(oldestKey);
    }
  }
  
  // 新しい翻訳をキャッシュに追加
  translationCache.set(cacheKey, {
    translation: translationResult,
    timestamp: Date.now()
  });
  
  // 30分ごとにキャッシュを保存
  const now = Date.now();
  if (now - lastCacheSave > 30 * 60 * 1000) {
    saveCache();
    lastCacheSave = now;
  }
}

// 最後にキャッシュを保存した時間
let lastCacheSave = Date.now();

// Gemini APIを使用してテキストを翻訳
async function translateText(text, apiKey, sourceLang = 'EN') {
  // 統計情報を更新
  stats.totalRequests++;
  
  // キャッシュをチェック
  const cachedResult = getCachedTranslation(text, sourceLang);
  if (cachedResult) {
    return cachedResult;
  }
  
  // API呼び出しの統計を更新
  stats.apiRequests++;
  stats.charactersTranslated += text.length;
  
  // APIキーが空の場合はエラー
  if (!apiKey) {
    stats.errors++;
    return { success: false, error: 'APIキーが設定されていません' };
  }
  
  try {
    // 翻訳用のプロンプトを作成
    // 文脈を理解して翻訳するようにプロンプトを設計
    const prompt = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Translate the following ${sourceLang === 'auto' ? 'text' : sourceLang + ' text'} to Japanese. Preserve the original meaning, tone, and nuance. Only return the Japanese translation without any explanations or notes:

${text}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40
      }
    };
    
    // Gemini APIエンドポイントとAPIキーを組み合わせたURL
    const apiUrl = `${GEMINI_API_ENDPOINT}?key=${apiKey}`;
    
    console.log(`Gemini API リクエスト送信先: ${GEMINI_API_ENDPOINT}`);
    
    // Gemini APIにリクエスト
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(prompt)
    });
    
    // レスポンスのステータスをログに記録
    console.log(`Gemini API レスポンスステータス: ${response.status}`);
    
    // エラーチェック
    if (!response.ok) {
      stats.errors++;
      let errorMessage = `エラーステータス: ${response.status}`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error.message || errorMessage;
      } catch (e) {
        // エラーレスポンスのパースに失敗した場合は無視
      }
      
      console.error('Gemini API エラー:', errorMessage);
      return { 
        success: false, 
        error: errorMessage
      };
    }
    
    // レスポンスを解析
    const data = await response.json();
    
    // 翻訳結果を抽出
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      
      const translatedText = data.candidates[0].content.parts[0].text.trim();
      
      // 翻訳結果
      const result = {
        success: true,
        translatedText: translatedText,
        detectedLanguage: sourceLang === 'auto' ? 'auto-detected' : sourceLang
      };
      
      // 翻訳結果をキャッシュに保存
      cacheTranslation(text, sourceLang, result);
      
      // 統計情報を保存（10回に1回）
      if (stats.totalRequests % 10 === 0) {
        saveStats();
      }
      
      return result;
    } else {
      stats.errors++;
      console.error('Gemini API から有効な翻訳結果が返されませんでした:', data);
      return { 
        success: false, 
        error: '翻訳結果の取得に失敗しました' 
      };
    }
  } catch (error) {
    stats.errors++;
    console.error('翻訳中のエラー:', error);
    return { 
      success: false, 
      error: error.message || '翻訳中に予期せぬエラーが発生しました' 
    };
  }
}

// APIキーのテスト
async function testApiKey(apiKey) {
  try {
    // サンプルテキストで翻訳をテスト
    console.log(`APIキーテスト: ${apiKey.substring(0, 5)}...`);
    
    // 簡単なテスト翻訳を実行
    const prompt = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Translate the following English text to Japanese: Hello, this is a test."
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40
      }
    };
    
    // Gemini APIエンドポイントとAPIキーを組み合わせたURL
    const apiUrl = `${GEMINI_API_ENDPOINT}?key=${apiKey}`;
    
    // テストリクエストを送信
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(prompt)
    });
    
    console.log(`APIテストレスポンスステータス: ${response.status}`);
    
    // レスポンスをチェック
    if (!response.ok) {
      // エラーの詳細を取得
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = errorData.error.message || `ステータスコード: ${response.status}`;
      } catch (jsonError) {
        errorDetails = `レスポンスの解析に失敗: ${jsonError.message}`;
      }
      
      console.error(`APIキーテスト失敗:`, errorDetails);
      return { valid: false, error: errorDetails };
    }
    
    // レスポンスをJSON解析
    const data = await response.json();
    
    // 翻訳結果を確認
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      
      console.log('APIキーは有効です');
      return { valid: true };
    } else {
      console.error('APIキーテスト: 無効なレスポンス形式', data);
      return { valid: false, error: '翻訳結果が不正な形式です' };
    }
  } catch (error) {
    console.error('APIキーテスト中のエラー:', error);
    return { valid: false, error: error.message };
  }
}

// リクエストキューの処理
function processQueue() {
  if (pendingRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
    const nextRequest = requestQueue.shift();
    pendingRequests++;
    
    translateText(nextRequest.text, settings.apiKey, nextRequest.sourceLang)
      .then(result => {
        nextRequest.resolve(result);
      })
      .catch(error => {
        nextRequest.reject(error);
      })
      .finally(() => {
        pendingRequests--;
        // 次のリクエストを処理
        processQueue();
      });
  }
}

// 統計情報のリセット
function resetStats() {
  stats = {
    totalRequests: 0,
    cacheHits: 0,
    apiRequests: 0,
    errors: 0,
    charactersTranslated: 0,
    lastReset: Date.now()
  };
  
  saveStats();
}

// メッセージリスナーの設定
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 翻訳リクエスト
  if (message.action === 'translate') {
    // キャッシュチェックを先に行う
    const cachedResult = getCachedTranslation(message.text, message.sourceLang || 'auto');
    if (cachedResult) {
      sendResponse(cachedResult);
      return true;
    }
    
    // 翻訳が無効の場合はエラーを返す
    if (!settings.enabled) {
      // エラーログに詳細情報を追加
      console.warn('翻訳機能が無効になっています。現在のsettings:', settings);
      sendResponse({ success: false, error: '翻訳機能が無効になっています' });
      return true;
    }
    
    // APIキーが設定されていない場合はエラーを返す
    if (!settings.apiKey) {
      sendResponse({ success: false, error: 'Gemini APIキーが設定されていません' });
      return true;
    }

    // 新しいリクエストをキューに追加
    const promise = new Promise((resolve, reject) => {
      requestQueue.push({
        text: message.text,
        sourceLang: message.sourceLang || 'auto',
        resolve,
        reject
      });
    });
    
    // キューの処理を開始
    processQueue();
    
    // 非同期で応答を返す
    promise.then(sendResponse).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // 非同期応答のために必要
  }
  
  // 設定の取得
  else if (message.action === 'getSettings') {
    sendResponse(settings);
    return true;
  }
  
  // APIキーのテスト
  else if (message.action === 'testApiKey') {
    testApiKey(message.apiKey).then(sendResponse);
    return true; // 非同期応答のために必要
  }
  
  // 現在のAPIキーの有効性チェック
  else if (message.action === 'checkApiKey') {
    if (!settings.apiKey) {
      sendResponse({ valid: false, error: 'APIキーが設定されていません' });
    } else {
      testApiKey(settings.apiKey).then(sendResponse);
    }
    return true; // 非同期応答のために必要
  }
  
  // 設定更新の通知
  else if (message.action === 'settingsUpdated') {
    // 設定を再ロード
    initialize();
    
    // 設定更新時のデバッグ情報の追加
    console.log('設定が更新されました:', { 
      enabled: settings.enabled, 
      hasApiKey: !!settings.apiKey,
      translationMode: settings.translationMode
    });
    
    // 現在のセッションIDを記録して、同期問題を回避
    const sessionId = Date.now().toString();
    chrome.storage.local.set({ 'settingsSessionId': sessionId });
    
    sendResponse({ success: true, sessionId });
    return true;
  }
  
  // 翻訳統計の取得
  else if (message.action === 'getStats') {
    sendResponse({
      success: true,
      stats: {
        ...stats,
        cacheSize: translationCache.size
      }
    });
    return true;
  }
  
  // 統計情報のリセット
  else if (message.action === 'resetStats') {
    resetStats();
    sendResponse({ success: true });
    return true;
  }
  
  // キャッシュのクリア
  else if (message.action === 'clearCache') {
    translationCache.clear();
    chrome.storage.local.remove('translationCache');
    sendResponse({ 
      success: true, 
      message: 'キャッシュをクリアしました' 
    });
    return true;
  }
  
  // Content Scriptからの初期化通知
  else if (message.action === 'contentScriptInitialized') {
    console.log('Content Scriptが初期化されました。有効状態:', message.enabled);
    // 必要に応じてsettingsの再同期を行うことも可能
    sendResponse({ success: true });
    return true;
  }
  
  // Pingリクエスト - 拡張機能コンテキストの有効性確認用
  else if (message.action === 'ping') {
    sendResponse({ success: true, message: 'pong' });
    return true;
  }
});

// 拡張機能のアンロード時にキャッシュを保存
chrome.runtime.onSuspend.addListener(() => {
  saveCache();
  saveStats();
});

// 1時間ごとにキャッシュと統計情報を保存
setInterval(() => {
  saveCache();
  saveStats();
}, 60 * 60 * 1000);

// 初期化の実行
initialize();
