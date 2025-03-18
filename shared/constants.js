/**
 * 拡張機能全体で使用される共通の定数を定義します
 */

// デフォルト設定
export const DEFAULT_SETTINGS = {
  // 基本設定
  enabled: false,                    // 翻訳機能の有効/無効
  apiKey: "",                        // Gemini APIキー
  autoToggle: true,                  // URLに基づいて自動的にON/OFF
  
  // 翻訳設定
  translationMode: "selective",      // 翻訳モード: selective（選択的）, all（すべて）, english（英語のみ）
  japaneseThreshold: 30,             // 日本語判定しきい値（%）
  englishThreshold: 50,              // 英語判定しきい値（%）
  processExistingMessages: false,    // 既存メッセージの処理
  
  // 表示設定
  displayPrefix: "🇯🇵",              // 翻訳テキストの接頭辞
  textColor: "#9b9b9b",              // 翻訳テキストの色
  accentColor: "#4db6ac",            // アクセントカラー
  fontSize: "medium",                // フォントサイズ: small, medium, large
  
  // キャッシュ設定
  useCache: true,                    // キャッシュ使用
  maxCacheAge: 24,                   // キャッシュ有効期間（時間）
  
  // API設定
  geminiModel: "gemini-2.0-flash-lite", // 使用するGeminiモデル: gemini-2.0-flash-lite, gemini-2.0-flash
  requestDelay: 100,                 // リクエスト間の遅延（ミリ秒）
  
  // 詳細設定
  debugMode: false,                  // デバッグモード
};

// メッセージタイプ
export const MESSAGE_TYPE = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning'
};

// アクション
export const ACTION = {
  TRANSLATE: 'translate',
  GET_SETTINGS: 'getSettings',
  TEST_API_KEY: 'testApiKey',
  CHECK_API_KEY: 'checkApiKey',
  SETTINGS_UPDATED: 'settingsUpdated',
  GET_STATS: 'getStats',
  RESET_STATS: 'resetStats',
  CLEAR_CACHE: 'clearCache',
  TOGGLE_TRANSLATION: 'toggleTranslation',
  CONTENT_SCRIPT_INITIALIZED: 'contentScriptInitialized',
  PING: 'ping'
};

// 設定キーの検証ルール
export const VALIDATION_RULES = {
  numericRanges: {
    japaneseThreshold: { min: 10, max: 50 },
    englishThreshold: { min: 30, max: 70 },
    maxCacheAge: { min: 1, max: 168 },
    requestDelay: { min: 0, max: 1000 }
  },
  enumValues: {
    translationMode: ['selective', 'all', 'english'],
    fontSize: ['small', 'medium', 'large'],
    geminiModel: ['gemini-2.0-flash-lite', 'gemini-2.0-flash']
  }
};

// UI関連の定数
export const UI = {
  STATUS_DISPLAY_TIME: 5000, // ステータスメッセージの表示時間（ミリ秒）
  API_STATUS: {
    CHECKING: 'Gemini API: チェック中...',
    MISSING_KEY: 'Gemini API: キーが未設定です',
    CONNECTION_OK: 'Gemini API: 接続OK',
    CONNECTION_ERROR: 'Gemini API: エラー',
    CHECK_FAILED: 'Gemini API: 確認できませんでした'
  },
  TRANSLATION_STATUS: {
    LOADING: '読み込み中...',
    ENABLED: '有効',
    DISABLED: '無効'
  }
};
