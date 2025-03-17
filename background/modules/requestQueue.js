/**
 * リクエストキューモジュール
 * 
 * 翻訳リクエストのキューを管理し、API呼び出しの制限を守りながら
 * 効率的に翻訳リクエストを処理します。
 */

import { getSettings } from './settings.js';
import { translateText } from './translator.js';

// キューの状態
const queue = [];
let isProcessing = false;

// デフォルト設定
const DEFAULT_MAX_CONCURRENT_REQUESTS = 3;
const DEFAULT_REQUEST_DELAY = 500; // ミリ秒

// キューの設定
let queueConfig = {
  maxConcurrentRequests: DEFAULT_MAX_CONCURRENT_REQUESTS,
  requestDelay: DEFAULT_REQUEST_DELAY
};

/**
 * リクエストキューを初期化
 * @param {object} config キューの設定
 * @param {number} config.maxConcurrentRequests 最大同時リクエスト数
 * @param {number} config.requestDelay リクエスト間の遅延（ミリ秒）
 * @returns {object} 初期化されたキューの設定
 */
export function initializeRequestQueue(config = {}) {
  queueConfig = {
    maxConcurrentRequests: config.maxConcurrentRequests || DEFAULT_MAX_CONCURRENT_REQUESTS,
    requestDelay: config.requestDelay || DEFAULT_REQUEST_DELAY
  };
  
  console.log("リクエストキューを初期化しました:", queueConfig);
  
  // キューをクリア
  if (queue.length > 0) {
    clearQueue();
  }
  
  return queueConfig;
}

/**
 * 翻訳リクエストをキューに追加
 * @param {string} text 翻訳するテキスト
 * @param {string} sourceLang ソース言語
 * @returns {Promise<object>} 翻訳結果
 */
export function enqueueTranslationRequest(text, sourceLang) {
  return new Promise((resolve, reject) => {
    if (!text || text.trim().length === 0) {
      reject(new Error("翻訳するテキストが空です"));
      return;
    }

    // リクエストをキューに追加
    queue.push({
      text,
      sourceLang,
      resolve,
      reject,
      timestamp: Date.now()
    });

    // キューの処理を開始（既に処理中でなければ）
    if (!isProcessing) {
      processQueue();
    }
  });
}

/**
 * キューを処理
 */
async function processQueue() {
  // 既に処理中の場合は何もしない
  if (isProcessing) {
    return;
  }

  // キューが空の場合は処理を終了
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const settings = getSettings();

  try {
    // 同時実行リクエスト数を設定から取得（デフォルト値を使用）
    const maxConcurrentRequests = queueConfig.maxConcurrentRequests;
    
    // リクエスト間の遅延を設定から取得（デフォルト値を使用）
    const requestDelay = queueConfig.requestDelay;

    // 処理するリクエストの数を決定
    const batchSize = Math.min(maxConcurrentRequests, queue.length);
    console.log(`キュー処理: ${queue.length}件中${batchSize}件を処理します`);

    // バッチ処理するリクエストを取得
    const batch = queue.splice(0, batchSize);

    // リクエストを並行処理
    const promises = batch.map(async (request, index) => {
      try {
        // リクエスト間の遅延を適用
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, requestDelay));
        }

        // 翻訳を実行
        const result = await translateText(
          request.text,
          settings.apiKey,
          request.sourceLang
        );

        // 結果を返す
        request.resolve(result);
        return result;
      } catch (error) {
        console.error("翻訳リクエスト処理エラー:", error);
        request.reject(error);
        return { success: false, error: error.message };
      }
    });

    // すべてのリクエストが完了するのを待つ
    await Promise.all(promises);

    // 次のバッチを処理
    isProcessing = false;
    
    // キューにまだリクエストがある場合は続けて処理
    if (queue.length > 0) {
      // 少し遅延を入れてから次のバッチを処理
      setTimeout(processQueue, requestDelay);
    }
  } catch (error) {
    console.error("キュー処理中のエラー:", error);
    isProcessing = false;
    
    // エラーが発生しても次のバッチを処理
    if (queue.length > 0) {
      setTimeout(processQueue, 1000); // エラー時は少し長めの遅延
    }
  }
}

/**
 * 現在のキューサイズを取得
 * @returns {number} キューサイズ
 */
export function getQueueSize() {
  return queue.length;
}

/**
 * キューをクリア
 * @returns {number} クリアされたリクエスト数
 */
export function clearQueue() {
  const queueSize = queue.length;
  
  // キュー内のすべてのリクエストをキャンセル
  queue.forEach(request => {
    request.reject(new Error("キューがクリアされました"));
  });
  
  // キューをクリア
  queue.length = 0;
  
  return queueSize;
}

/**
 * キューの状態を取得
 * @returns {object} キューの状態
 */
export function getQueueStatus() {
  return {
    size: queue.length,
    isProcessing,
    oldestRequest: queue.length > 0 ? Date.now() - queue[0].timestamp : null,
    config: { ...queueConfig }
  };
}
