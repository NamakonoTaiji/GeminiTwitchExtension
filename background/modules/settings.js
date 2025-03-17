/**
 * 設定管理モジュール
 * 
 * 拡張機能の設定を管理し、設定の読み込み、保存、リセット機能を提供します。
 */

// デフォルト設定
const DEFAULT_SETTINGS = {
  // 基本設定
  enabled: false,                   // 翻訳機能の有効/無効
  apiKey: "",                       // Gemini APIキー
  autoToggle: true,                 // URLに基づいて自動的にON/OFF
  
  // 翻訳設定
  translationMode: "selective",      // 翻訳モード: selective（選択的）, all（すべて）, english（英語のみ）
  japaneseThreshold: 30,            // 日本語判定しきい値（%）
  englishThreshold: 50,             // 英語判定しきい値（%）
  processExistingMessages: false,   // 既存メッセージの処理
  
  // 表示設定
  displayPrefix: "🇯🇵",             // 翻訳テキストの接頭辞
  textColor: "#9b9b9b",             // 翻訳テキストの色
  accentColor: "#4db6ac",           // アクセントカラー
  fontSize: "medium",               // フォントサイズ: small, medium, large
  
  // キャッシュ設定
  useCache: true,                   // キャッシュ使用
  maxCacheAge: 24,                  // キャッシュ有効期間（時間）
  
  // API設定
  geminiModel: "gemini-2.0-flash-lite", // 使用するGeminiモデル: gemini-2.0-flash-lite, gemini-2.0-flash
  requestDelay: 100,                // リクエスト間の遅延（ミリ秒）
  
  // 詳細設定
  debugMode: false,                 // デバッグモード
};

// 現在の設定
let currentSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

/**
 * 設定を読み込む
 * @returns {Promise<object>} 読み込まれた設定
 */
export async function loadSettings() {
  try {
    console.log("設定を読み込み中...");
    
    // Chromeストレージから設定を取得
    const result = await chrome.storage.sync.get(null);
    
    // デフォルト設定をベースに、保存されている設定で上書き
    currentSettings = { ...DEFAULT_SETTINGS };
    
    // 保存されている設定をマージ
    for (const key in result) {
      if (key in DEFAULT_SETTINGS) {
        currentSettings[key] = result[key];
      }
    }
    
    // 設定の検証
    validateSettings();
    
    console.log("設定を読み込みました:", {
      enabled: currentSettings.enabled,
      hasApiKey: !!currentSettings.apiKey,
      translationMode: currentSettings.translationMode,
    });
    
    settingsLoaded = true;
    return currentSettings;
  } catch (error) {
    console.error("設定の読み込み中にエラーが発生しました:", error);
    // エラー時はデフォルト設定を使用
    currentSettings = { ...DEFAULT_SETTINGS };
    settingsLoaded = true;
    return currentSettings;
  }
}

/**
 * 設定の検証と修正
 */
function validateSettings() {
  // 数値型の設定を検証
  ensureNumericValue('japaneseThreshold', 10, 50);
  ensureNumericValue('englishThreshold', 30, 70);
  ensureNumericValue('maxCacheAge', 1, 168);
  ensureNumericValue('requestDelay', 0, 1000);
  
  // 列挙型の設定を検証
  ensureEnumValue('translationMode', ['selective', 'all', 'english'], 'selective');
  ensureEnumValue('fontSize', ['small', 'medium', 'large'], 'medium');
  ensureEnumValue('geminiModel', ['gemini-2.0-flash-lite', 'gemini-2.0-flash'], 'gemini-2.0-flash-lite');
  
  // 色の検証
  if (!/^#[0-9A-F]{6}$/i.test(currentSettings.textColor)) {
    currentSettings.textColor = DEFAULT_SETTINGS.textColor;
  }
  
  if (!/^#[0-9A-F]{6}$/i.test(currentSettings.accentColor)) {
    currentSettings.accentColor = DEFAULT_SETTINGS.accentColor;
  }
}

/**
 * 数値型の設定を検証
 * @param {string} key 設定キー
 * @param {number} min 最小値
 * @param {number} max 最大値
 */
function ensureNumericValue(key, min, max) {
  let value = currentSettings[key];
  
  // 文字列の場合は数値に変換
  if (typeof value === 'string') {
    value = parseInt(value, 10);
  }
  
  // 数値でない場合はデフォルト値を使用
  if (isNaN(value) || typeof value !== 'number') {
    currentSettings[key] = DEFAULT_SETTINGS[key];
    return;
  }
  
  // 範囲外の場合は制限
  currentSettings[key] = Math.max(min, Math.min(max, value));
}

/**
 * 列挙型の設定を検証
 * @param {string} key 設定キー
 * @param {Array<string>} validValues 有効な値の配列
 * @param {string} defaultValue デフォルト値
 */
function ensureEnumValue(key, validValues, defaultValue) {
  if (!validValues.includes(currentSettings[key])) {
    currentSettings[key] = defaultValue;
  }
}

/**
 * 配列型の設定を検証
 * @param {string} key 設定キー
 */
function ensureArrayValue(key) {
  if (!Array.isArray(currentSettings[key])) {
    currentSettings[key] = DEFAULT_SETTINGS[key];
  }
}

/**
 * 現在の設定を取得
 * @returns {object} 現在の設定
 */
export function getSettings() {
  // 設定がまだ読み込まれていない場合は読み込む
  if (!settingsLoaded) {
    loadSettings();
    // 非同期読み込みの間はデフォルト設定を返す
    return { ...DEFAULT_SETTINGS };
  }
  
  return { ...currentSettings };
}

/**
 * 設定を保存
 * @param {object} newSettings 新しい設定
 * @returns {Promise<object>} 保存された設定
 */
export async function saveSettings(newSettings) {
  try {
    console.log("設定を保存中...");
    
    // 現在の設定と新しい設定をマージ
    const mergedSettings = { ...currentSettings, ...newSettings };
    
    // 設定を検証
    currentSettings = mergedSettings;
    validateSettings();
    
    // 保存する設定オブジェクトを作成（デフォルト値と同じ場合は保存しない）
    const settingsToSave = {};
    for (const key in currentSettings) {
      // デフォルト値と異なる場合のみ保存
      if (JSON.stringify(currentSettings[key]) !== JSON.stringify(DEFAULT_SETTINGS[key])) {
        settingsToSave[key] = currentSettings[key];
      }
    }
    
    // Chromeストレージに保存
    await chrome.storage.sync.set(settingsToSave);
    
    console.log("設定を保存しました");
    
    // 保存した設定を返す
    return { ...currentSettings };
  } catch (error) {
    console.error("設定の保存中にエラーが発生しました:", error);
    throw error;
  }
}

/**
 * 設定をリセット
 * @returns {Promise<object>} リセットされた設定
 */
export async function resetSettings() {
  try {
    console.log("設定をリセット中...");
    
    // APIキーを保持
    const apiKey = currentSettings.apiKey;
    
    // デフォルト設定に戻す（APIキーは保持）
    currentSettings = { ...DEFAULT_SETTINGS, apiKey };
    
    // Chromeストレージをクリア
    await chrome.storage.sync.clear();
    
    // APIキーのみ保存
    if (apiKey) {
      await chrome.storage.sync.set({ apiKey });
    }
    
    console.log("設定をリセットしました");
    
    return { ...currentSettings };
  } catch (error) {
    console.error("設定のリセット中にエラーが発生しました:", error);
    throw error;
  }
}

/**
 * 特定の設定を更新
 * @param {string} key 設定キー
 * @param {any} value 設定値
 * @returns {Promise<object>} 更新された設定
 */
export async function updateSetting(key, value) {
  // 無効な設定キーの場合はエラー
  if (!(key in DEFAULT_SETTINGS)) {
    throw new Error(`無効な設定キー: ${key}`);
  }
  
  // 設定を更新
  const newSettings = { [key]: value };
  return await saveSettings(newSettings);
}

/**
 * デフォルト設定を取得
 * @returns {object} デフォルト設定
 */
export function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}
