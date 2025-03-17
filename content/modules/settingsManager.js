/**
 * Twitch Gemini Translator 設定管理モジュール
 * 
 * このモジュールは、拡張機能の設定の管理と保存を担当します。
 */

import { getLogger } from '../../utils/logger.js';
import { 
  handleError, 
  handleStorageError,
  ErrorCategory,
  ErrorSeverity
} from '../../utils/errorHandler.js';
import {
  saveToLocalStorage,
  loadFromLocalStorage,
  getDefaultSettings
} from '../../utils/utils.js';

// ロガーのインスタンスを取得
const logger = getLogger('SettingsManager');

// 設定のキャッシュ
let cachedSettings = null;

/**
 * 設定を読み込む
 * @returns {Promise<object>} 設定オブジェクト
 */
export async function loadSettings() {
  try {
    // キャッシュがあればそれを返す
    if (cachedSettings) {
      return cachedSettings;
    }

    // ストレージから設定を読み込む
    const settings = await loadFromLocalStorage('settings');
    
    // 設定がなければデフォルト設定を返す
    if (!settings) {
      logger.info("保存された設定が見つからないため、デフォルト設定を使用します。");
      cachedSettings = getDefaultSettings();
      return cachedSettings;
    }
    
    // 設定をキャッシュして返す
    logger.info("設定を読み込みました。");
    cachedSettings = settings;
    return settings;
  } catch (error) {
    handleStorageError(
      "設定の読み込み中にエラーが発生しました",
      error,
      ErrorSeverity.MEDIUM
    );
    
    // エラー時はデフォルト設定を返す
    return getDefaultSettings();
  }
}

/**
 * 設定を保存する
 * @param {object} settings 保存する設定
 * @returns {Promise<boolean>} 保存に成功したかどうか
 */
export async function saveSettings(settings) {
  try {
    // 設定を保存
    await saveToLocalStorage('settings', settings);
    
    // キャッシュを更新
    cachedSettings = settings;
    
    logger.info("設定を保存しました。");
    return true;
  } catch (error) {
    handleStorageError(
      "設定の保存中にエラーが発生しました",
      error,
      ErrorSeverity.MEDIUM
    );
    return false;
  }
}

/**
 * 設定の一部を更新する
 * @param {object} partialSettings 更新する設定の一部
 * @returns {Promise<object>} 更新後の設定
 */
export async function updateSettings(partialSettings) {
  try {
    // 現在の設定を読み込む
    const currentSettings = await loadSettings();
    
    // 設定を更新
    const updatedSettings = {
      ...currentSettings,
      ...partialSettings
    };
    
    // 更新された設定を保存
    await saveSettings(updatedSettings);
    
    logger.info("設定を更新しました:", partialSettings);
    return updatedSettings;
  } catch (error) {
    handleStorageError(
      "設定の更新中にエラーが発生しました",
      error,
      ErrorSeverity.MEDIUM
    );
    return null;
  }
}

/**
 * APIキーが設定されているかどうかを確認する
 * @returns {Promise<boolean>} APIキーが設定されているかどうか
 */
export async function checkApiKeyStatus() {
  try {
    // 設定を読み込む
    const settings = await loadSettings();
    
    // APIキーが設定されているかどうかを確認
    const hasGeminiKey = settings.geminiApiKey && settings.geminiApiKey.trim() !== '';
    const hasDeepLKey = settings.deepLApiKey && settings.deepLApiKey.trim() !== '';
    
    // 少なくとも1つのAPIキーが設定されていればtrue
    return hasGeminiKey || hasDeepLKey;
  } catch (error) {
    handleStorageError(
      "APIキー状態の確認中にエラーが発生しました",
      error,
      ErrorSeverity.LOW
    );
    return false;
  }
}

/**
 * 設定をリセットする
 * @returns {Promise<object>} リセット後の設定
 */
export async function resetSettings() {
  try {
    // デフォルト設定を取得
    const defaultSettings = getDefaultSettings();
    
    // デフォルト設定を保存
    await saveSettings(defaultSettings);
    
    logger.info("設定をリセットしました。");
    return defaultSettings;
  } catch (error) {
    handleStorageError(
      "設定のリセット中にエラーが発生しました",
      error,
      ErrorSeverity.MEDIUM
    );
    return null;
  }
}
