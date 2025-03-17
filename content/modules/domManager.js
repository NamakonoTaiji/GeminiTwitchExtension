/**
 * Twitch Gemini Translator DOM管理モジュール
 * 
 * このモジュールは、Twitchチャットコンテナの監視と操作を担当します。
 */

import { getLogger } from '../../utils/logger.js';
import { 
  handleError, 
  handleExtensionError,
  ErrorCategory,
  ErrorSeverity
} from '../../utils/errorHandler.js';
import {
  findChatContainer,
  getAllExistingMessages,
  markExistingMessages,
  createMutationObserver
} from '../../utils/domObserver.js';
import {
  setSessionFlag,
  removeSessionFlag,
  incrementSessionCounter,
  setGracePeriodState
} from '../../utils/session.js';
import { processChatMessage } from './messageProcessor.js';

// ロガーのインスタンスを取得
const logger = getLogger('DOMManager');

/**
 * チャットコンテナの監視を開始
 * @param {object} settings 設定オブジェクト
 * @param {boolean} isEnabled 翻訳が有効かどうか
 * @param {boolean} apiKeySet APIキーが設定されているかどうか
 * @param {Map} translatedComments 翻訳済みコメントを追跡するMap
 * @param {function} handleContextInvalidated コンテキスト無効化時の処理関数
 * @returns {MutationObserver|null} 作成されたオブザーバーまたはnull
 */
export function startObserving(
  settings, 
  isEnabled, 
  apiKeySet, 
  translatedComments,
  handleContextInvalidated
) {
  // 既に監視中なら何もしない
  if (getSessionFlag('isObserving')) {
    logger.debug("既に監視中です。重複監視を防止します。");
    return null;
  }

  try {
    // チャットコンテナを取得
    const chatContainer = findChatContainer();
    if (!chatContainer) {
      logger.warn("チャットコンテナが見つかりませんでした。監視を開始できません。");
      return null;
    }

    logger.info("チャットコンテナを発見しました。監視を開始します。");

    // 既存メッセージを処理
    if (settings.processExistingMessages) {
      processExistingMessages(
        chatContainer, 
        settings, 
        isEnabled, 
        apiKeySet, 
        translatedComments,
        handleContextInvalidated
      );
    }

    // グレースピリオド状態を取得
    const inGracePeriod = isInGracePeriod();
    
    // 監視を開始
    const observer = createMutationObserver(async (addedNodes) => {
      // 監視中フラグが立っていない場合は処理しない
      if (!getSessionFlag('isObserving')) {
        logger.debug("監視中フラグがオフのため、変更を処理しません。");
        return;
      }

      // 追加されたノードを処理
      for (const node of addedNodes) {
        // 新規メッセージとしてマーク
        node._isNewMessage = true;
        
        // メッセージを処理
        await processChatMessage(
          node, 
          settings, 
          isEnabled, 
          apiKeySet, 
          translatedComments,
          handleContextInvalidated,
          () => stopObserving(observer)
        );
      }
    });

    // チャットコンテナの監視を開始
    observer.observe(chatContainer, {
      childList: true,
      subtree: true,
    });

    // 監視中フラグをセット
    setSessionFlag('isObserving', true);
    logger.info("チャットコンテナの監視を開始しました。");

    return observer;
  } catch (error) {
    handleExtensionError(
      "チャットコンテナの監視開始中にエラーが発生しました",
      error,
      ErrorCategory.DOM,
      ErrorSeverity.HIGH
    );
    return null;
  }
}

/**
 * チャットコンテナの監視を停止
 * @param {MutationObserver} observer 停止するオブザーバー
 */
export function stopObserving(observer) {
  if (!observer) {
    logger.debug("オブザーバーが存在しないため、停止処理をスキップします。");
    return;
  }

  try {
    // オブザーバーを切断
    observer.disconnect();
    
    // 監視中フラグを解除
    removeSessionFlag('isObserving');
    
    logger.info("チャットコンテナの監視を停止しました。");
  } catch (error) {
    handleExtensionError(
      "チャットコンテナの監視停止中にエラーが発生しました",
      error,
      ErrorCategory.DOM,
      ErrorSeverity.MEDIUM
    );
  }
}

/**
 * 既存メッセージの処理
 * @param {Element} chatContainer チャットコンテナ
 * @param {object} settings 設定オブジェクト
 * @param {boolean} isEnabled 翻訳が有効かどうか
 * @param {boolean} apiKeySet APIキーが設定されているかどうか
 * @param {Map} translatedComments 翻訳済みコメントを追跡するMap
 * @param {function} handleContextInvalidated コンテキスト無効化時の処理関数
 */
export async function processExistingMessages(
  chatContainer, 
  settings, 
  isEnabled, 
  apiKeySet, 
  translatedComments,
  handleContextInvalidated
) {
  try {
    // 既存メッセージ処理中フラグをセット
    setSessionFlag('processingExistingMessages', true);
    
    // 既存メッセージを取得
    const existingMessages = getAllExistingMessages(chatContainer);
    
    if (existingMessages.length > 0) {
      logger.info(`${existingMessages.length}件の既存メッセージを処理します。`);
      
      // 既存メッセージとしてマーク
      markExistingMessages(existingMessages);
      
      // カウンターをインクリメント
      incrementSessionCounter('existingMessagesProcessed');
      
      // 各メッセージを処理
      for (const message of existingMessages) {
        await processChatMessage(
          message, 
          settings, 
          isEnabled, 
          apiKeySet, 
          translatedComments,
          handleContextInvalidated,
          () => {} // 既存メッセージ処理中は監視停止しない
        );
      }
      
      logger.info("既存メッセージの処理が完了しました。");
    } else {
      logger.debug("処理すべき既存メッセージがありませんでした。");
    }
  } catch (error) {
    handleExtensionError(
      "既存メッセージの処理中にエラーが発生しました",
      error,
      ErrorCategory.DOM,
      ErrorSeverity.MEDIUM
    );
  } finally {
    // 既存メッセージ処理中フラグを解除
    removeSessionFlag('processingExistingMessages');
  }
}

/**
 * チャンネル変更時の処理
 * @param {string} previousUrl 以前のURL
 * @param {string} currentUrl 現在のURL
 * @param {MutationObserver} observer 現在のオブザーバー
 * @param {Map} translatedComments 翻訳済みコメントを追跡するMap
 * @param {number} gracePeriodDuration グレースピリオドの期間（ミリ秒）
 * @param {function} startObservingFunc 監視を再開する関数
 * @returns {Promise<void>}
 */
export async function handleChannelChange(
  previousUrl, 
  currentUrl, 
  observer, 
  translatedComments,
  gracePeriodDuration,
  startObservingFunc
) {
  logger.info(`チャンネル変更を検出: ${previousUrl} -> ${currentUrl}`);
  
  // 監視中なら停止
  if (observer) {
    stopObserving(observer);
    translatedComments.clear(); // 翻訳済みコメントをクリア
    logger.debug("翻訳済みコメントをクリアしました。");
  }
  
  // グレースピリオドを設定
  setGracePeriodState(true);
  logger.debug(`${gracePeriodDuration}msのグレースピリオドを開始します。`);
  
  // グレースピリオド後にフラグをリセットし監視を再開
  return new Promise((resolve) => {
    setTimeout(() => {
      setGracePeriodState(false);
      logger.debug("グレースピリオドが終了しました。");
      
      // グレースピリオド終了後に監視を再開
      if (typeof startObservingFunc === 'function') {
        startObservingFunc();
        logger.debug("グレースピリオド終了後に監視を再開しました。");
      }
      
      resolve();
    }, gracePeriodDuration);
  });
}
