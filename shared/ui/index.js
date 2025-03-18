/**
 * UI関連の共通処理をまとめたモジュール
 */

export * from './uiManager.js';
export * from './formManager.js';

/**
 * オプションページを開く
 */
export function openOptionsPage() {
  chrome.runtime.openOptionsPage();
}

/**
 * 確認ダイアログを表示
 * @param {string} message 確認メッセージ
 * @returns {boolean} 確認結果
 */
export function confirmAction(message) {
  return confirm(message);
}

/**
 * 定期的に処理を実行
 * @param {Function} callback 実行する関数
 * @param {number} interval 実行間隔（ミリ秒）
 * @returns {number} インターバルID
 */
export function startInterval(callback, interval) {
  // 初回実行
  callback();
  
  // 定期実行
  return setInterval(callback, interval);
}

/**
 * ボタンの状態を一時的に変更
 * @param {HTMLButtonElement} button ボタン要素
 * @param {string} text 変更後のテキスト
 * @param {boolean} disabled 無効にするかどうか
 * @param {number} duration 持続時間（ミリ秒）
 * @param {object} originalState 元の状態（テキストと無効状態）
 */
export function setTemporaryButtonState(button, text, disabled, duration, originalState) {
  if (!button) return;
  
  // 元の状態を保存
  const original = originalState || {
    text: button.textContent,
    disabled: button.disabled
  };
  
  // 状態を変更
  button.textContent = text;
  button.disabled = disabled;
  
  // 指定時間後に元の状態に戻す
  setTimeout(() => {
    button.textContent = original.text;
    button.disabled = original.disabled;
  }, duration);
  
  return original;
}

/**
 * DOMContentLoadedイベントを待ってコールバックを実行
 * @param {Function} callback 実行する関数
 */
export function onDOMReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}
