/**
 * Twitch Gemini Translator セッション管理ユーティリティ
 * 
 * このファイルは、セッション管理やフラグ管理に関連する共通機能を提供します。
 * ブラウザのセッションストレージを活用した状態管理をサポートします。
 */

/**
 * セッションフラグの設定
 * @param {string} key フラグキー
 * @param {string|boolean|number} value フラグの値
 * @param {boolean} logAction ログに記録するかどうか
 */
export function setSessionFlag(key, value, logAction = true) {
  const stringValue = String(value);
  sessionStorage.setItem(key, stringValue);
  
  if (logAction) {
    console.log(`セッションフラグを設定: ${key} = ${stringValue}`);
  }
}

/**
 * セッションフラグの取得
 * @param {string} key フラグキー
 * @param {string|boolean|number|null} defaultValue デフォルト値
 * @returns {string|null} フラグの値またはnull
 */
export function getSessionFlag(key, defaultValue = null) {
  return sessionStorage.getItem(key) || defaultValue;
}

/**
 * セッションフラグの削除
 * @param {string} key フラグキー
 * @param {boolean} logAction ログに記録するかどうか
 */
export function removeSessionFlag(key, logAction = true) {
  sessionStorage.removeItem(key);
  
  if (logAction) {
    console.log(`セッションフラグを削除: ${key}`);
  }
}

/**
 * セッション数値カウンタの増加
 * @param {string} key カウンタキー
 * @param {number} increment 増加量
 * @param {boolean} logAction ログに記録するかどうか
 * @returns {number} 新しい値
 */
export function incrementSessionCounter(key, increment = 1, logAction = true) {
  const currentValue = parseInt(sessionStorage.getItem(key) || '0', 10);
  const newValue = currentValue + increment;
  sessionStorage.setItem(key, newValue.toString());
  
  if (logAction) {
    console.log(`セッションカウンタを増加: ${key} = ${newValue}`);
  }
  
  return newValue;
}

/**
 * チャンネル変更フラグの設定
 * このフラグは既存メッセージ処理の制御に使用される
 * @param {boolean} value フラグの値
 */
export function setChannelChangedFlag(value = true) {
  setSessionFlag("twitch_gemini_channel_changed", value);
  
  // 既存メッセージ処理禁止フラグも設定
  if (value) {
    setSessionFlag("twitch_gemini_prevent_existing", true);
  }
}

/**
 * チャンネル変更フラグの確認
 * @returns {boolean} チャンネル変更されたかどうか
 */
export function hasChannelChanged() {
  return getSessionFlag("twitch_gemini_channel_changed") === "true";
}

/**
 * 既存メッセージ処理禁止フラグの確認
 * @returns {boolean} 既存メッセージ処理が禁止されているかどうか
 */
export function isExistingMessagesPreventionActive() {
  return getSessionFlag("twitch_gemini_prevent_existing") === "true";
}

/**
 * コンテキスト無効化フラグの確認と更新
 * @returns {object} {isRecent: boolean, lastAttempt: number} 最近の試行があったかと最後の試行時間
 */
export function checkContextInvalidationStatus() {
  const now = Date.now();
  const contextInvalidatedFlag = getSessionFlag("twitch_gemini_context_invalidated");
  const lastAttempt = parseInt(contextInvalidatedFlag || "0", 10);
  
  // 最後の試行から30秒以上経過しているかどうか
  const isRecent = now - lastAttempt <= 30000;
  
  if (!isRecent) {
    // 最新の時間で更新
    setSessionFlag("twitch_gemini_context_invalidated", now.toString());
  }
  
  return { isRecent, lastAttempt, now };
}

/**
 * 再試行カウンタの管理
 * @param {boolean} reset リセットするかどうか
 * @returns {number} 現在の再試行回数
 */
export function manageRetryCounter(reset = false) {
  if (reset) {
    setSessionFlag("twitch_gemini_retry_count", "0");
    return 0;
  }
  
  return incrementSessionCounter("twitch_gemini_retry_count");
}

/**
 * グレースピリオド関連フラグをリセット
 */
export function resetGracePeriodFlags() {
  removeSessionFlag("twitch_gemini_in_grace_period");
}

/**
 * グレースピリオドの状態を設定
 * @param {boolean} inGracePeriod グレースピリオド中かどうか
 */
export function setGracePeriodState(inGracePeriod) {
  setSessionFlag("twitch_gemini_in_grace_period", inGracePeriod);
}

/**
 * グレースピリオド中かどうかを確認
 * @returns {boolean} グレースピリオド中かどうか
 */
export function isInGracePeriod() {
  return getSessionFlag("twitch_gemini_in_grace_period") === "true";
}
