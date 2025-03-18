/**
 * フォーム管理モジュール
 * 
 * フォーム要素の値の設定・取得などの機能を提供します。
 */

import { DEFAULT_SETTINGS } from '../constants.js';

/**
 * 設定値をフォーム要素に設定
 * @param {object} settings 設定
 * @param {object} elements フォーム要素のマッピング
 * @param {Function} [onComplete] 設定完了時のコールバック
 */
export function populateFormValues(settings, elements, onComplete) {
  // 各フォーム要素に値を設定
  for (const key in elements) {
    const element = elements[key];
    
    if (!element) continue;
    
    // 要素のタイプによって処理を変える
    if (element.type === 'checkbox') {
      element.checked = settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
    } 
    else if (element.type === 'range' || element.type === 'number') {
      element.value = settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
    } 
    else if (element.tagName === 'SELECT') {
      element.value = settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
    } 
    else {
      // テキスト入力などの場合
      element.value = settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
    }
  }
  
  // 完了時のコールバックがあれば実行
  if (typeof onComplete === 'function') {
    onComplete();
  }
}

/**
 * フォーム要素から設定値を取得
 * @param {object} elements フォーム要素のマッピング
 * @returns {object} 設定オブジェクト
 */
export function getFormValues(elements) {
  const values = {};
  
  // 各フォーム要素から値を取得
  for (const key in elements) {
    const element = elements[key];
    
    if (!element) continue;
    
    // 要素のタイプによって処理を変える
    if (element.type === 'checkbox') {
      values[key] = element.checked;
    } 
    else if (element.type === 'range' || element.type === 'number') {
      values[key] = parseFloat(element.value);
      
      // 数値でなければデフォルト値を使用
      if (isNaN(values[key])) {
        values[key] = DEFAULT_SETTINGS[key];
      }
    } 
    else {
      // テキスト入力、セレクトなどの場合
      values[key] = element.value;
    }
  }
  
  return values;
}

/**
 * APIキー入力フィールドのマスク機能をセットアップ
 * @param {HTMLInputElement} apiKeyInput APIキー入力要素
 * @param {HTMLButtonElement} toggleButton 表示切替ボタン
 * @param {string} initialApiKey 初期APIキー
 * @returns {object} マスク管理用のオブジェクト
 */
export function setupApiKeyMasking(apiKeyInput, toggleButton, initialApiKey) {
  if (!apiKeyInput) return { getApiKey: () => initialApiKey };
  
  let actualApiKey = initialApiKey || '';
  
  // 初期表示
  if (actualApiKey) {
    apiKeyInput.value = '•'.repeat(Math.min(actualApiKey.length, 20));
    apiKeyInput.setAttribute('data-masked', 'true');
    
    if (toggleButton) {
      toggleButton.textContent = '表示';
    }
  } else {
    apiKeyInput.value = '';
    apiKeyInput.setAttribute('data-masked', 'false');
    
    if (toggleButton) {
      toggleButton.textContent = '非表示';
    }
  }
  
  // APIキー入力フィールドのフォーカスイベント
  apiKeyInput.addEventListener('focus', () => {
    // マスクされている場合は、フォーカス時に空にする
    if (apiKeyInput.getAttribute('data-masked') === 'true') {
      apiKeyInput.value = '';
      apiKeyInput.setAttribute('data-masked', 'false');
      if (toggleButton) {
        toggleButton.textContent = '非表示';
      }
    }
  });
  
  // APIキー入力フィールドの変更イベント
  apiKeyInput.addEventListener('input', () => {
    // 入力中はマスク解除状態を維持
    actualApiKey = apiKeyInput.value.trim();
    apiKeyInput.setAttribute('data-masked', 'false');
  });
  
  // トグルボタンのイベントリスナー
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
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
    });
  }
  
  // APIキーを取得するメソッドを含むオブジェクトを返す
  return {
    getApiKey: () => {
      // マスクされている場合は保存されているAPIキーを返す
      // マスクされていない場合は入力値を返す
      return apiKeyInput.getAttribute('data-masked') === 'true' ? 
        actualApiKey : apiKeyInput.value.trim();
    }
  };
}

/**
 * スライダーと値表示を連動させる
 * @param {Array<{slider: HTMLInputElement, display: HTMLElement, suffix: string}>} sliderConfigs 
 */
export function setupSliders(sliderConfigs) {
  sliderConfigs.forEach(config => {
    const { slider, display, suffix = '%' } = config;
    
    if (!slider || !display) return;
    
    // 初期表示を更新
    display.textContent = `${slider.value}${suffix}`;
    
    // スライダー変更時のイベントリスナー
    slider.addEventListener('input', () => {
      display.textContent = `${slider.value}${suffix}`;
    });
  });
}
