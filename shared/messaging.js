/**
 * メッセージング関連の共通関数
 * 
 * バックグラウンドスクリプトやタブ間の通信を担当します。
 */

import { ACTION } from './constants.js';

/**
 * バックグラウンドスクリプトにメッセージを送信
 * @param {object} message 送信するメッセージ
 * @returns {Promise<any>} バックグラウンドスクリプトからの応答
 */
export function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        // エラーチェック
        if (chrome.runtime.lastError) {
          console.error('バックグラウンドへのメッセージ送信エラー:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      });
    } catch (error) {
      console.error('メッセージング中の例外:', error);
      reject(error);
    }
  });
}

/**
 * Twitchタブに通知を送信
 * @param {object} message 送信するメッセージ
 * @returns {Promise<Array<object>>} 各タブへの送信結果
 */
export async function notifyTwitchTabs(message) {
  try {
    // Twitchタブを検索
    const tabs = await chrome.tabs.query({ url: '*://*.twitch.tv/*' });
    
    if (tabs.length === 0) {
      console.log('通知対象のTwitchタブがありません');
      return [];
    }
    
    console.log(`${tabs.length}個のTwitchタブに通知します`);
    
    // 各タブにメッセージを送信
    const results = await Promise.allSettled(tabs.map(async (tab) => {
      try {
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch (error) {
        console.error(`タブ${tab.id}へのメッセージ送信中にエラー:`, error);
        throw error;
      }
    }));
    
    // エラーをログに記録
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`タブ${tabs[index].id}への通知に失敗:`, result.reason);
      }
    });
    
    return results;
  } catch (error) {
    console.error('タブ通知処理中のエラー:', error);
    throw error;
  }
}

/**
 * 設定変更をバックグラウンドスクリプトとTwitchタブに通知
 * @returns {Promise<void>}
 */
export async function notifySettingsUpdated() {
  try {
    // バックグラウンドスクリプトに通知
    await sendMessageToBackground({ action: ACTION.SETTINGS_UPDATED });
    
    // Twitchタブに通知
    await notifyTwitchTabs({ action: ACTION.SETTINGS_UPDATED });
  } catch (error) {
    console.error('設定変更通知中のエラー:', error);
    throw error;
  }
}

/**
 * APIキーのテスト
 * @param {string} apiKey テストするAPIキー
 * @returns {Promise<object>} テスト結果
 */
export async function testApiKey(apiKey) {
  try {
    const response = await sendMessageToBackground({
      action: ACTION.TEST_API_KEY,
      apiKey
    });
    
    return response || { valid: false, error: '応答がありません' };
  } catch (error) {
    console.error('APIキーテスト中のエラー:', error);
    return { valid: false, error: error.message || 'テスト中に不明なエラーが発生しました' };
  }
}

/**
 * 現在のAPIキーの有効性をチェック
 * @returns {Promise<object>} チェック結果
 */
export async function checkApiKeyValidity() {
  try {
    const response = await sendMessageToBackground({
      action: ACTION.CHECK_API_KEY
    });
    
    return response || { valid: false, error: '応答がありません' };
  } catch (error) {
    console.error('APIキー検証中のエラー:', error);
    return { valid: false, error: error.message || '検証中に不明なエラーが発生しました' };
  }
}

/**
 * 翻訳機能の有効/無効を切り替え
 * @param {boolean} enabled 有効にするかどうか
 * @returns {Promise<void>}
 */
export async function toggleTranslation(enabled) {
  try {
    // 設定を更新
    await chrome.storage.sync.set({ enabled });
    
    // バックグラウンドに通知
    await sendMessageToBackground({ action: ACTION.SETTINGS_UPDATED });
    
    // Twitchタブに通知
    await notifyTwitchTabs({
      action: ACTION.TOGGLE_TRANSLATION,
      enabled
    });
  } catch (error) {
    console.error('翻訳機能の切り替え中にエラー:', error);
    throw error;
  }
}

/**
 * 統計情報を取得
 * @returns {Promise<object>} 統計情報
 */
export async function getStats() {
  try {
    const response = await sendMessageToBackground({
      action: ACTION.GET_STATS
    });
    
    return response?.stats || null;
  } catch (error) {
    console.error('統計情報の取得中にエラー:', error);
    return null;
  }
}

/**
 * 統計情報をリセット
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function resetStats() {
  try {
    const response = await sendMessageToBackground({
      action: ACTION.RESET_STATS
    });
    
    return response?.success || false;
  } catch (error) {
    console.error('統計情報のリセット中にエラー:', error);
    return false;
  }
}

/**
 * キャッシュをクリア
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function clearCache() {
  try {
    const response = await sendMessageToBackground({
      action: ACTION.CLEAR_CACHE
    });
    
    return response?.success || false;
  } catch (error) {
    console.error('キャッシュのクリア中にエラー:', error);
    return false;
  }
}
