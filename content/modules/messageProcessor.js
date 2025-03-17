/**
 * Twitch Gemini Translator メッセージ処理モジュール
 * 
 * このモジュールは、Twitchチャットメッセージの処理と翻訳を担当します。
 */

import { getLogger } from '../../utils/logger.js';
import { 
  handleError, 
  handleTranslationError, 
  handleExtensionError 
} from '../../utils/errorHandler.js';
import { translationCache } from '../../utils/cache.js';
import { 
  shouldTranslateBasedOnMode,
  extractMessageText,
  sendTranslationRequest,
  displayTranslation
} from '../../utils/language.js';
import {
  getMessageElement,
  getMessageId
} from '../../utils/domObserver.js';
import {
  hasChannelChanged,
  isExistingMessagesPreventionActive,
  isInGracePeriod
} from '../../utils/session.js';

// ロガーのインスタンスを取得
const logger = getLogger('MessageProcessor');

/**
 * チャットメッセージの処理
 * @param {Element} messageNode メッセージノード
 * @param {object} settings 設定オブジェクト
 * @param {boolean} isEnabled 翻訳が有効かどうか
 * @param {boolean} apiKeySet APIキーが設定されているかどうか
 * @param {Map} translatedComments 翻訳済みコメントを追跡するMap
 * @param {function} handleContextInvalidated コンテキスト無効化時の処理関数
 * @param {function} stopObserving 監視停止関数
 * @returns {Promise<boolean>} 処理が成功したかどうか
 */
export async function processChatMessage(
  messageNode, 
  settings, 
  isEnabled, 
  apiKeySet, 
  translatedComments,
  handleContextInvalidated,
  stopObserving
) {
  // 拡張機能が無効またはAPIキーが設定されていない場合はスキップ
  if (!isEnabled) {
    logger.debug("翻訳機能が無効のため、処理をスキップします。現在の状態:", {
      isEnabled,
      apiKeySet,
    });
    return false;
  }

  // 既存メッセージ（_isNewMessageがないか_isExistingMessageがある）でかつ、既存メッセージ処理が無効な場合はスキップ
  if (!messageNode._isNewMessage || messageNode._isExistingMessage) {
    // 以下の条件で既存メッセージをスキップ
    if (
      !settings.processExistingMessages ||
      hasChannelChanged() ||
      isExistingMessagesPreventionActive()
    ) {
      return false;
    }
  }

  // グレースピリオド中は新規メッセージも処理しない
  if (isInGracePeriod()) {
    return false;
  }

  if (!apiKeySet) {
    logger.debug("APIキーが設定されていないため、処理をスキップします。");
    return false;
  }

  // メッセージノードが要素ノードでなければスキップ
  if (messageNode.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  // 自分が追加した翻訳要素ならスキップ
  if (
    messageNode.classList &&
    messageNode.classList.contains("twitch-gemini-translation")
  ) {
    return false;
  }

  // メッセージ要素を特定
  const messageElement = getMessageElement(messageNode);
  if (!messageElement) {
    return false; // メッセージ要素がない場合はスキップ
  }

  // メッセージIDの取得
  const messageId = getMessageId(messageElement);

  // 既に処理済みならスキップ
  if (translatedComments.has(messageId)) {
    return false;
  }

  // メッセージテキストを取得
  let messageText = extractMessageText(messageElement);
  if (!messageText) {
    return false; // テキストがない場合はスキップ
  }

  // 翻訳モードに応じて翻訳するかどうかを判定
  if (!shouldTranslateBasedOnMode(messageText, settings)) {
    return false; // 翻訳対象外はスキップ
  }

  logger.info(`翻訳対象メッセージを検出: "${messageText}"`);

  // キャッシュをチェック
  const cacheKey = `${messageText}_${settings.targetLanguage || 'JA'}`;
  const cachedTranslation = translationCache.get(cacheKey);
  
  if (cachedTranslation) {
    logger.info("キャッシュから翻訳を取得しました");
    
    // キャッシュされた翻訳を表示
    displayTranslation(
      messageElement,
      cachedTranslation.translatedText,
      'cached', // キャッシュから取得したことを示す
      settings
    );
    
    // 処理済みとしてマーク
    translatedComments.set(messageId, true);
    return true;
  }

  try {
    // 翻訳リクエストを送信
    // 翻訳モードがallの場合は言語自動検出、それ以外は英語と仮定
    const sourceLang = settings.translationMode === "all" ? "auto" : "EN";
    const translationResult = await sendTranslationRequest(
      messageText,
      sourceLang,
      handleContextInvalidated
    );

    if (translationResult && translationResult.success) {
      // 翻訳エンジンの確認とデバッグ情報
      logger.info(
        "翻訳結果:",
        JSON.stringify({
          success: translationResult.success,
          engine: translationResult.engine || "エンジン情報なし",
        })
      );

      // 翻訳結果をキャッシュに保存
      translationCache.set(cacheKey, {
        translatedText: translationResult.translatedText,
        timestamp: Date.now(),
        engine: translationResult.engine
      });

      // 翻訳結果を表示 (翻訳エンジン情報を渡す)
      displayTranslation(
        messageElement,
        translationResult.translatedText,
        translationResult.engine,
        settings
      );

      // 処理済みとしてマーク
      translatedComments.set(messageId, true);
      return true;
    } else if (translationResult) {
      // エラーメッセージをログに出力
      handleTranslationError("翻訳エラー", translationResult.error);

      // 翻訳機能が無効になっている場合は、一時的に無効化
      if (
        translationResult.error &&
        translationResult.error.includes("翻訳機能が無効")
      ) {
        logger.warn(
          "バックグラウンドで翻訳機能が無効になっています。ローカル状態を更新します。"
        );
        return false;
      }

      // エラーが続く場合、拡張機能が無効になっている可能性がある
      if (
        translationResult.error &&
        translationResult.error.includes("Extension context invalidated")
      ) {
        logger.warn(
          "拡張機能コンテキストが無効になりました。監視を停止します。"
        );
        stopObserving();
        return false;
      }
    }
  } catch (error) {
    handleTranslationError("翻訳リクエスト中のエラー", error);

    // 重大なエラーの場合は監視を停止
    if (
      error.message &&
      error.message.includes("Extension context invalidated")
    ) {
      logger.warn(
        "拡張機能コンテキストが無効になりました。監視を停止します。"
      );
      stopObserving();
    }
    return false;
  }

  return false;
}
