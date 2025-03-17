/**
 * リクエストキュー管理モジュール
 * 
 * 翻訳リクエストのキュー管理と並行処理の制御を担当します。
 */

import { getSettings } from './settings.js';
import { translateText } from './translator.js';

// APIリクエストの管理
let pendingRequests = 0;
const MAX_CONCURRENT_REQUESTS = 5;
const requestQueue = [];

/**
 * 翻訳リクエストをキューに追加
 * @param {string} text 翻訳するテキスト
 * @param {string} sourceLang ソース言語
 * @returns {Promise<object>} 翻訳結果を解決するPromise
 */
export function enqueueTranslationRequest(text, sourceLang = 'auto') {
  return new Promise((resolve, reject) => {
    // 新しいリクエストをキューに追加
    requestQueue.push({
      text,
      sourceLang,
      resolve,
      reject
    });
    
    // キューの処理を開始
    processQueue();
  });
}

/**
 * リクエストキューの処理
 * @private
 */
function processQueue() {
  const settings = getSettings();
  
  if (pendingRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
    const nextRequest = requestQueue.shift();
    pendingRequests++;
    
    translateText(nextRequest.text, settings.apiKey, nextRequest.sourceLang)
      .then(result => {
        nextRequest.resolve(result);
      })
      .catch(error => {
        nextRequest.reject(error);
      })
      .finally(() => {
        pendingRequests--;
        // 次のリクエストを処理
        processQueue();
      });
  }
}

/**
 * 現在のキュー情報を取得
 * @returns {object} キューの状態
 */
export function getQueueStatus() {
  return {
    pendingRequests,
    queueLength: requestQueue.length,
    maxConcurrent: MAX_CONCURRENT_REQUESTS
  };
}

/**
 * キュー内のすべてのリクエストをキャンセル
 * @param {string} reason キャンセル理由
 */
export function cancelAllRequests(reason = '翻訳リクエストがキャンセルされました') {
  const canceled = requestQueue.length;
  
  // キュー内のすべてのリクエストを拒否
  requestQueue.forEach(request => {
    request.reject(new Error(reason));
  });
  
  // キューをクリア
  requestQueue.length = 0;
  
  return canceled;
}
