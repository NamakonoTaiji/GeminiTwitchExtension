/**
 * 設定管理モジュール
 * 
 * 拡張機能の設定の読み込み、保存、デフォルト値の提供などを担当します。
 */

// 設定データのデフォルト値
export const defaultSettings = {
  apiKey: "",
  enabled: false,
  translationMode: "selective",
  japaneseThreshold: 30,
  englishThreshold: 50,
  displayPrefix: "🇯🇵",
  textColor: "#9b9b9b",
  accentColor: "#9147ff",
  fontSize: "medium",
  useCache: true, // キャッシュ機能の有効/無効
  maxCacheAge: 24, // キャッシュの有効期間（時間）
  processExistingMessages: false, // 既存コメントを処理するかどうか
  requestDelay: 100, // リクエスト間の最小遅延（ミリ秒）
  geminiModel: "gemini-2.0-flash-lite", // 使用するGeminiモデル
};

// 現在の設定（デフォルト値でプリロード）
let currentSettings = { ...defaultSettings };

/**
 * 設定を読み込む
 * @returns {Promise<object>} 読み込まれた設定
 */
export async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(defaultSettings);
    currentSettings = result;
    return currentSettings;
  } catch (error) {
    console.error("設定の読み込みに失敗:", error);
    return { ...defaultSettings };
  }
}

/**
 * 現在のロード済み設定を取得
 * @returns {object} 現在の設定
 */
export function getSettings() {
  return currentSettings;
}

/**
 * 設定を保存
 * @param {object} newSettings 保存する設定
 * @returns {Promise<boolean>} 保存に成功したかどうか
 */
export async function saveSettings(newSettings) {
  try {
    await chrome.storage.sync.set(newSettings);
    currentSettings = newSettings;
    return true;
  } catch (error) {
    console.error("設定の保存に失敗:", error);
    return false;
  }
}

/**
 * 設定を更新（一部のキーのみ）
 * @param {object} partialSettings 更新する設定の一部
 * @returns {Promise<boolean>} 更新に成功したかどうか
 */
export async function updateSettings(partialSettings) {
  try {
    const newSettings = { ...currentSettings, ...partialSettings };
    await chrome.storage.sync.set(newSettings);
    currentSettings = newSettings;
    return true;
  } catch (error) {
    console.error("設定の更新に失敗:", error);
    return false;
  }
}

/**
 * 設定をデフォルト値にリセット（APIキーを除く）
 * @returns {Promise<object>} リセット後の設定
 */
export async function resetSettings() {
  // APIキーは保持
  const apiKey = currentSettings.apiKey;
  const newSettings = { ...defaultSettings, apiKey };
  
  try {
    await saveSettings(newSettings);
    return newSettings;
  } catch (error) {
    console.error("設定のリセットに失敗:", error);
    return currentSettings;
  }
}
