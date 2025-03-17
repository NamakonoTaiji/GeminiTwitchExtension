/**
 * Twitch Gemini Translator メッセージングモジュール
 * 
 * このモジュールは、バックグラウンドスクリプトとの通信を担当します。
 */

import { getLogger } from '../../utils/logger.js';
import { 
  handleError, 
  handleNetworkError,
  ErrorCategory,
  ErrorSeverity
} from '../../utils/errorHandler.js';

// ロガーのインスタンスを取得
const logger = getLogger('Messaging');

/**
 * バックグラウンドスクリプトにメッセージを送信する
 * @param {object} message 送信するメッセージ
 * @returns {Promise<object>} レスポンス
 */
export function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        // 拡張機能のコンテキストが無効化されていないか確認
        if (chrome.runtime.lastError) {
          const error = new Error(chrome.runtime.lastError.message);
          handleNetworkError(
            "バックグラウンドスクリプトへのメッセージ送信中にエラーが発生しました",
            error,
            ErrorSeverity.MEDIUM
          );
          reject(error);
          return;
        }
        
        // レスポンスがnullの場合はエラー
        if (!response) {
          const error = new Error("バックグラウンドスクリプトからの応答がありません");
          handleNetworkError(
            "バックグラウンドスクリプトからの応答がありません",
            error,
            ErrorSeverity.MEDIUM
          );
          reject(error);
          return;
        }
        
        // エラーレスポンスの場合
        if (response.error) {
          const error = new Error(response.error);
          handleNetworkError(
            "バックグラウンドスクリプトからエラーレスポンスを受信しました",
            error,
            ErrorSeverity.MEDIUM
          );
          reject(error);
          return;
        }
        
        // 成功レスポンスを返す
        resolve(response);
      });
    } catch (error) {
      handleNetworkError(
        "バックグラウンドスクリプトへのメッセージ送信に失敗しました",
        error,
        ErrorSeverity.HIGH
      );
      reject(error);
    }
  });
}

/**
 * バックグラウンドスクリプトにコンテキスト無効化を通知する
 * @returns {Promise<void>}
 */
export async function notifyContextInvalidation() {
  try {
    await sendMessageToBackground({
      action: "contextInvalidated",
      timestamp: Date.now()
    });
    
    logger.info("コンテキスト無効化をバックグラウンドスクリプトに通知しました。");
  } catch (error) {
    // エラーは既にhandleNetworkErrorで処理されているため、ここでは何もしない
    logger.error("コンテキスト無効化の通知に失敗しました。", error);
  }
}

/**
 * バックグラウンドスクリプトに翻訳リクエストを送信する
 * @param {string} text 翻訳するテキスト
 * @param {string} sourceLang ソース言語
 * @param {string} targetLang ターゲット言語
 * @returns {Promise<object>} 翻訳結果
 */
export async function requestTranslation(text, sourceLang = "auto", targetLang = "JA") {
  try {
    logger.debug(`翻訳リクエスト: "${text}" (${sourceLang} -> ${targetLang})`);
    
    const response = await sendMessageToBackground({
      action: "translate",
      text,
      sourceLang,
      targetLang
    });
    
    logger.debug("翻訳レスポンス:", response);
    return response;
  } catch (error) {
    handleNetworkError(
      "翻訳リクエスト中にエラーが発生しました",
      error,
      ErrorSeverity.MEDIUM
    );
    
    // エラー情報を含むレスポンスを返す
    return {
      success: false,
      error: error.message || "翻訳リクエスト中に不明なエラーが発生しました"
    };
  }
}

/**
 * バックグラウンドスクリプトに設定の更新を通知する
 * @param {object} settings 更新された設定
 * @returns {Promise<object>} レスポンス
 */
export async function notifySettingsUpdate(settings) {
  try {
    const response = await sendMessageToBackground({
      action: "settingsUpdated",
      settings
    });
    
    logger.info("設定更新をバックグラウンドスクリプトに通知しました。");
    return response;
  } catch (error) {
    handleNetworkError(
      "設定更新の通知中にエラーが発生しました",
      error,
      ErrorSeverity.LOW
    );
    
    return {
      success: false,
      error: error.message || "設定更新の通知中に不明なエラーが発生しました"
    };
  }
}

/**
 * バックグラウンドスクリプトにチャンネル変更を通知する
 * @param {string} previousChannel 以前のチャンネル
 * @param {string} currentChannel 現在のチャンネル
 * @returns {Promise<object>} レスポンス
 */
export async function notifyChannelChange(previousChannel, currentChannel) {
  try {
    const response = await sendMessageToBackground({
      action: "channelChanged",
      previousChannel,
      currentChannel,
      timestamp: Date.now()
    });
    
    logger.info(`チャンネル変更をバックグラウンドスクリプトに通知しました: ${previousChannel} -> ${currentChannel}`);
    return response;
  } catch (error) {
    handleNetworkError(
      "チャンネル変更の通知中にエラーが発生しました",
      error,
      ErrorSeverity.LOW
    );
    
    return {
      success: false,
      error: error.message || "チャンネル変更の通知中に不明なエラーが発生しました"
    };
  }
}
