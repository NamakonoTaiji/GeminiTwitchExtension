/**
 * 設定管理モジュール
 * 
 * 設定の読み込み、保存、検証などの機能を提供します。
 */

import { DEFAULT_SETTINGS, VALIDATION_RULES } from './constants.js';

/**
 * 設定を読み込む
 * @returns {Promise<object>} 読み込まれた設定
 */
export async function loadSettings() {
  try {
    console.log("UI: 設定を読み込み中...");
    
    // Chromeストレージから設定を取得
    const result = await chrome.storage.sync.get(null);
    
    // デフォルト設定をベースに、保存されている設定で上書き
    let currentSettings = { ...DEFAULT_SETTINGS };
    
    // 保存されている設定をマージ
    for (const key in result) {
      if (key in DEFAULT_SETTINGS) {
        currentSettings[key] = result[key];
      }
    }
    
    // 設定の検証
    currentSettings = validateSettings(currentSettings);
    
    console.log("UI: 設定を読み込みました:", {
      enabled: currentSettings.enabled,
      hasApiKey: !!currentSettings.apiKey,
      translationMode: currentSettings.translationMode,
    });
    
    return currentSettings;
  } catch (error) {
    console.error("UI: 設定の読み込み中にエラーが発生しました:", error);
    // エラー時はデフォルト設定を使用
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 設定を保存
 * @param {object} settings 保存する設定
 * @returns {Promise<object>} 保存された設定
 */
export async function saveSettings(settings) {
  try {
    console.log("UI: 設定を保存中...");
    
    // 設定を検証
    const validatedSettings = validateSettings(settings);
    
    // 保存する設定オブジェクトを作成（デフォルト値と同じ場合でも保存）
    // フロントエンドでは簡略化のためすべて保存
    await chrome.storage.sync.set(validatedSettings);
    
    console.log("UI: 設定を保存しました");
    
    // 保存した設定を返す
    return validatedSettings;
  } catch (error) {
    console.error("UI: 設定の保存中にエラーが発生しました:", error);
    throw error;
  }
}

/**
 * 特定の設定のみを更新
 * @param {string} key 設定キー
 * @param {any} value 設定値
 * @returns {Promise<object>} 更新された設定
 */
export async function updateSetting(key, value) {
  // 現在の設定を取得
  const currentSettings = await loadSettings();
  
  // 特定の設定のみを更新
  currentSettings[key] = value;
  
  // 更新した設定を保存
  return await saveSettings(currentSettings);
}

/**
 * 設定をリセット（APIキーは維持）
 * @returns {Promise<object>} リセットされた設定
 */
export async function resetSettings() {
  try {
    console.log("UI: 設定をリセット中...");
    
    // 現在の設定を取得
    const currentSettings = await loadSettings();
    
    // APIキーを保持
    const apiKey = currentSettings.apiKey;
    
    // デフォルト設定に戻す（APIキーは保持）
    const resetSettings = { ...DEFAULT_SETTINGS, apiKey };
    
    // 保存
    await chrome.storage.sync.set(resetSettings);
    
    console.log("UI: 設定をリセットしました");
    
    return resetSettings;
  } catch (error) {
    console.error("UI: 設定のリセット中にエラーが発生しました:", error);
    throw error;
  }
}

/**
 * 設定の検証と修正
 * @param {object} settings 検証する設定
 * @returns {object} 検証・修正された設定
 */
export function validateSettings(settings) {
  const validatedSettings = { ...settings };
  
  // 数値型の設定を検証
  for (const key in VALIDATION_RULES.numericRanges) {
    if (key in validatedSettings) {
      const { min, max } = VALIDATION_RULES.numericRanges[key];
      ensureNumericValue(validatedSettings, key, min, max);
    }
  }
  
  // 列挙型の設定を検証
  for (const key in VALIDATION_RULES.enumValues) {
    if (key in validatedSettings) {
      const validValues = VALIDATION_RULES.enumValues[key];
      ensureEnumValue(validatedSettings, key, validValues, DEFAULT_SETTINGS[key]);
    }
  }
  
  // 色の検証
  if ('textColor' in validatedSettings && !/^#[0-9A-F]{6}$/i.test(validatedSettings.textColor)) {
    validatedSettings.textColor = DEFAULT_SETTINGS.textColor;
  }
  
  if ('accentColor' in validatedSettings && !/^#[0-9A-F]{6}$/i.test(validatedSettings.accentColor)) {
    validatedSettings.accentColor = DEFAULT_SETTINGS.accentColor;
  }
  
  return validatedSettings;
}

/**
 * 数値型の設定を検証
 * @param {object} settings 設定オブジェクト
 * @param {string} key 設定キー
 * @param {number} min 最小値
 * @param {number} max 最大値
 */
function ensureNumericValue(settings, key, min, max) {
  let value = settings[key];
  
  // 文字列の場合は数値に変換
  if (typeof value === 'string') {
    value = parseInt(value, 10);
  }
  
  // 数値でない場合はデフォルト値を使用
  if (isNaN(value) || typeof value !== 'number') {
    settings[key] = DEFAULT_SETTINGS[key];
    return;
  }
  
  // 範囲外の場合は制限
  settings[key] = Math.max(min, Math.min(max, value));
}

/**
 * 列挙型の設定を検証
 * @param {object} settings 設定オブジェクト
 * @param {string} key 設定キー
 * @param {Array<string>} validValues 有効な値の配列
 * @param {string} defaultValue デフォルト値
 */
function ensureEnumValue(settings, key, validValues, defaultValue) {
  if (!validValues.includes(settings[key])) {
    settings[key] = defaultValue;
  }
}
