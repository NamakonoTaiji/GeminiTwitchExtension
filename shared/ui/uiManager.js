/**
 * UI管理モジュール
 * 
 * UI要素の更新と管理機能を提供します。
 */

import { UI, MESSAGE_TYPE } from '../constants.js';
import { checkApiKeyValidity } from '../messaging.js';

/**
 * ステータスメッセージを表示
 * @param {HTMLElement} element ステータスメッセージを表示する要素
 * @param {string} message 表示するメッセージ
 * @param {string} type メッセージのタイプ ('success', 'error', 'info', 'warning')
 * @param {number} [duration=5000] 表示時間（ミリ秒）
 */
export function showStatusMessage(element, message, type, duration = UI.STATUS_DISPLAY_TIME) {
  if (!element) return;
  
  element.textContent = message;
  element.className = `status-message ${type}`;
  
  // 指定時間後にメッセージを非表示
  setTimeout(() => {
    element.className = 'status-message';
  }, duration);
}

/**
 * 翻訳状態テキストを更新
 * @param {HTMLElement} statusElement ステータステキストを表示する要素
 * @param {boolean} enabled 有効状態
 */
export function updateStatusText(statusElement, enabled) {
  if (!statusElement) return;
  
  statusElement.textContent = enabled ? UI.TRANSLATION_STATUS.ENABLED : UI.TRANSLATION_STATUS.DISABLED;
  statusElement.className = enabled ? MESSAGE_TYPE.SUCCESS : '';
}

/**
 * API状態テキストを更新
 * @param {HTMLElement} apiStatusElement API状態テキストを表示する要素
 * @param {string} apiKey APIキー
 */
export async function updateApiStatus(apiStatusElement, apiKey) {
  if (!apiStatusElement) return;
  
  if (!apiKey) {
    apiStatusElement.textContent = UI.API_STATUS.MISSING_KEY;
    apiStatusElement.className = MESSAGE_TYPE.ERROR;
    return;
  }

  try {
    apiStatusElement.textContent = UI.API_STATUS.CHECKING;
    
    // APIキーの有効性をチェック
    const response = await checkApiKeyValidity();
    
    if (response.valid) {
      apiStatusElement.textContent = UI.API_STATUS.CONNECTION_OK;
      apiStatusElement.className = MESSAGE_TYPE.SUCCESS;
    } else {
      apiStatusElement.textContent = `Gemini API: ${response.error || 'エラー'}`;
      apiStatusElement.className = MESSAGE_TYPE.ERROR;
    }
  } catch (error) {
    apiStatusElement.textContent = UI.API_STATUS.CHECK_FAILED;
    apiStatusElement.className = MESSAGE_TYPE.ERROR;
    console.error('API確認中のエラー:', error);
  }
}

/**
 * APIキーの表示/非表示を管理
 * @param {HTMLInputElement} apiKeyInput APIキー入力要素
 * @param {HTMLButtonElement} toggleButton 表示切替ボタン
 * @param {string} actualApiKey 実際のAPIキー
 * @returns {string} 更新されたAPIキー
 */
export function handleApiKeyVisibility(apiKeyInput, toggleButton, actualApiKey) {
  if (!apiKeyInput || !toggleButton) return actualApiKey;
  
  const isMasked = apiKeyInput.getAttribute('data-masked') === 'true';
  
  if (isMasked) {
    // マスクを解除して実際のAPIキーを表示
    apiKeyInput.value = actualApiKey;
    apiKeyInput.setAttribute('data-masked', 'false');
    toggleButton.textContent = '非表示';
  } else {
    // APIキーをマスク表示
    if (actualApiKey) {
      apiKeyInput.value = '•'.repeat(Math.min(actualApiKey.length, 20));
      apiKeyInput.setAttribute('data-masked', 'true');
      toggleButton.textContent = '表示';
    }
  }
  
  return actualApiKey;
}

/**
 * 統計情報を表示
 * @param {object} stats 統計情報
 * @param {object} elements 表示要素のマッピング
 */
export function updateStatsDisplay(stats, elements) {
  if (!stats || !elements) return;
  
  // 統計表示を更新
  if (elements.totalRequests) {
    elements.totalRequests.textContent = stats.totalRequests.toLocaleString();
  }
  
  if (elements.cacheHits) {
    elements.cacheHits.textContent = stats.cacheHits.toLocaleString();
  }
  
  if (elements.apiRequests) {
    elements.apiRequests.textContent = stats.apiRequests.toLocaleString();
  }
  
  if (elements.errors) {
    elements.errors.textContent = stats.errors.toLocaleString();
  }
  
  if (elements.charactersTranslated) {
    elements.charactersTranslated.textContent = stats.charactersTranslated.toLocaleString();
  }
  
  if (elements.cacheSize) {
    elements.cacheSize.textContent = stats.cacheSize.toLocaleString();
  }
  
  if (elements.lastReset) {
    // 最終リセット日時を表示
    const lastReset = new Date(stats.lastReset);
    elements.lastReset.textContent = lastReset.toLocaleString();
  }
}

/**
 * スライダー値の表示を更新
 * @param {HTMLInputElement} sliderElement スライダー要素
 * @param {HTMLElement} valueElement 値表示要素
 * @param {string} [suffix='%'] 値の後に付ける単位
 */
export function setupSliderValueDisplay(sliderElement, valueElement, suffix = '%') {
  if (!sliderElement || !valueElement) return;
  
  // 初期表示を更新
  valueElement.textContent = `${sliderElement.value}${suffix}`;
  
  // スライダー変更時のイベントリスナー
  sliderElement.addEventListener('input', () => {
    valueElement.textContent = `${sliderElement.value}${suffix}`;
  });
}
