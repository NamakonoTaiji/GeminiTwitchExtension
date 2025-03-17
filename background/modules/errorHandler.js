/**
 * エラーハンドリングモジュール
 * 
 * アプリケーション全体で一貫したエラー処理を提供し、
 * エラーのログ記録、通知、リカバリーを行います。
 */

import logger from './logger.js';
import { getSettings } from './settings.js';
import * as stats from './stats.js';

// エラータイプの定義
export const ERROR_TYPES = {
  NETWORK: 'network',
  API: 'api',
  TRANSLATION: 'translation',
  STORAGE: 'storage',
  PERMISSION: 'permission',
  VALIDATION: 'validation',
  INTERNAL: 'internal',
  UNKNOWN: 'unknown'
};

// エラーの重大度
export const ERROR_SEVERITY = {
  LOW: 'low',         // 軽微なエラー、ユーザーに影響なし
  MEDIUM: 'medium',   // 一部機能に影響するエラー
  HIGH: 'high',       // 主要機能に影響するエラー
  CRITICAL: 'critical' // アプリケーション全体に影響するエラー
};

// エラーコードのマッピング
const ERROR_CODES = {
  // ネットワークエラー
  'network_timeout': { type: ERROR_TYPES.NETWORK, severity: ERROR_SEVERITY.MEDIUM, message: 'ネットワークタイムアウト' },
  'network_offline': { type: ERROR_TYPES.NETWORK, severity: ERROR_SEVERITY.HIGH, message: 'ネットワーク接続がオフライン' },
  'network_error': { type: ERROR_TYPES.NETWORK, severity: ERROR_SEVERITY.MEDIUM, message: 'ネットワークエラー' },
  
  // API関連エラー
  'api_key_invalid': { type: ERROR_TYPES.API, severity: ERROR_SEVERITY.HIGH, message: 'APIキーが無効です' },
  'api_key_missing': { type: ERROR_TYPES.API, severity: ERROR_SEVERITY.HIGH, message: 'APIキーが設定されていません' },
  'api_quota_exceeded': { type: ERROR_TYPES.API, severity: ERROR_SEVERITY.HIGH, message: 'APIクォータを超過しました' },
  'api_rate_limited': { type: ERROR_TYPES.API, severity: ERROR_SEVERITY.MEDIUM, message: 'APIレート制限に達しました' },
  'api_server_error': { type: ERROR_TYPES.API, severity: ERROR_SEVERITY.MEDIUM, message: 'APIサーバーエラー' },
  
  // 翻訳関連エラー
  'translation_failed': { type: ERROR_TYPES.TRANSLATION, severity: ERROR_SEVERITY.MEDIUM, message: '翻訳に失敗しました' },
  'translation_timeout': { type: ERROR_TYPES.TRANSLATION, severity: ERROR_SEVERITY.MEDIUM, message: '翻訳がタイムアウトしました' },
  'translation_invalid_input': { type: ERROR_TYPES.TRANSLATION, severity: ERROR_SEVERITY.LOW, message: '無効な入力テキスト' },
  'translation_unsupported_language': { type: ERROR_TYPES.TRANSLATION, severity: ERROR_SEVERITY.MEDIUM, message: 'サポートされていない言語' },
  
  // ストレージ関連エラー
  'storage_read_error': { type: ERROR_TYPES.STORAGE, severity: ERROR_SEVERITY.MEDIUM, message: 'ストレージの読み取りエラー' },
  'storage_write_error': { type: ERROR_TYPES.STORAGE, severity: ERROR_SEVERITY.MEDIUM, message: 'ストレージの書き込みエラー' },
  'storage_quota_exceeded': { type: ERROR_TYPES.STORAGE, severity: ERROR_SEVERITY.MEDIUM, message: 'ストレージクォータを超過しました' },
  
  // 権限関連エラー
  'permission_denied': { type: ERROR_TYPES.PERMISSION, severity: ERROR_SEVERITY.HIGH, message: '権限が拒否されました' },
  
  // 検証エラー
  'validation_error': { type: ERROR_TYPES.VALIDATION, severity: ERROR_SEVERITY.LOW, message: '入力検証エラー' },
  
  // 内部エラー
  'internal_error': { type: ERROR_TYPES.INTERNAL, severity: ERROR_SEVERITY.HIGH, message: '内部エラー' },
  
  // 不明なエラー
  'unknown_error': { type: ERROR_TYPES.UNKNOWN, severity: ERROR_SEVERITY.MEDIUM, message: '不明なエラー' }
};

// 最近のエラー履歴
const errorHistory = {
  errors: [],
  maxSize: 50
};

/**
 * エラーを処理する
 * @param {string|Error} error エラーオブジェクトまたはエラーコード
 * @param {object} options 追加オプション
 * @returns {object} 処理されたエラー情報
 */
export function handleError(error, options = {}) {
  // エラー情報を初期化
  const errorInfo = {
    timestamp: Date.now(),
    code: 'unknown_error',
    message: '不明なエラーが発生しました',
    details: null,
    source: options.source || 'app',
    type: ERROR_TYPES.UNKNOWN,
    severity: ERROR_SEVERITY.MEDIUM,
    handled: false,
    stack: null
  };
  
  // エラーコードが文字列の場合
  if (typeof error === 'string') {
    errorInfo.code = error;
    const errorDef = ERROR_CODES[error] || ERROR_CODES.unknown_error;
    errorInfo.type = errorDef.type;
    errorInfo.severity = errorDef.severity;
    errorInfo.message = errorDef.message;
    errorInfo.details = options.details || null;
  }
  // エラーオブジェクトの場合
  else if (error instanceof Error) {
    errorInfo.message = error.message;
    errorInfo.stack = error.stack;
    errorInfo.details = options.details || error.message;
    
    // エラーコードの推測
    if (error.name === 'TypeError') {
      errorInfo.code = 'internal_error';
      errorInfo.type = ERROR_TYPES.INTERNAL;
    } else if (error.name === 'NetworkError' || error.message.includes('network')) {
      errorInfo.code = 'network_error';
      errorInfo.type = ERROR_TYPES.NETWORK;
    } else if (error.message.includes('timeout')) {
      errorInfo.code = 'network_timeout';
      errorInfo.type = ERROR_TYPES.NETWORK;
    } else if (error.message.includes('quota')) {
      errorInfo.code = 'api_quota_exceeded';
      errorInfo.type = ERROR_TYPES.API;
    } else if (error.message.includes('rate limit')) {
      errorInfo.code = 'api_rate_limited';
      errorInfo.type = ERROR_TYPES.API;
    } else if (error.message.includes('key')) {
      errorInfo.code = 'api_key_invalid';
      errorInfo.type = ERROR_TYPES.API;
    }
    
    // エラーコードが設定されていれば適用
    if (options.code && ERROR_CODES[options.code]) {
      errorInfo.code = options.code;
      const errorDef = ERROR_CODES[options.code];
      errorInfo.type = errorDef.type;
      errorInfo.severity = errorDef.severity;
    }
  }
  // その他のオブジェクトの場合
  else if (typeof error === 'object') {
    errorInfo.details = JSON.stringify(error);
    errorInfo.message = options.message || 'オブジェクトエラー';
    
    // エラーコードが設定されていれば適用
    if (options.code && ERROR_CODES[options.code]) {
      errorInfo.code = options.code;
      const errorDef = ERROR_CODES[options.code];
      errorInfo.type = errorDef.type;
      errorInfo.severity = errorDef.severity;
      errorInfo.message = errorDef.message;
    }
  }
  
  // ソースを設定
  if (options.source) {
    errorInfo.source = options.source;
  }
  
  // エラーをログに記録
  logError(errorInfo);
  
  // エラー統計を更新
  stats.incrementErrors(errorInfo.message);
  
  // エラー履歴に追加
  addToErrorHistory(errorInfo);
  
  // エラーを通知（重大度に応じて）
  if (errorInfo.severity === ERROR_SEVERITY.HIGH || errorInfo.severity === ERROR_SEVERITY.CRITICAL) {
    notifyError(errorInfo);
  }
  
  // エラーを処理済みとしてマーク
  errorInfo.handled = true;
  
  return errorInfo;
}

/**
 * エラーをログに記録
 * @param {object} errorInfo エラー情報
 * @private
 */
function logError(errorInfo) {
  const settings = getSettings();
  const debugMode = settings.debugMode || false;
  
  // エラーメッセージを構築
  const errorMessage = `${errorInfo.message} (${errorInfo.code})`;
  
  // エラーの詳細情報
  const errorDetails = {
    code: errorInfo.code,
    type: errorInfo.type,
    severity: errorInfo.severity,
    details: errorInfo.details,
    timestamp: errorInfo.timestamp
  };
  
  // スタックトレースがあれば追加
  if (errorInfo.stack && debugMode) {
    errorDetails.stack = errorInfo.stack;
  }
  
  // ロガーでエラーを記録
  logger.error(errorMessage, errorInfo.source, errorDetails);
  
  // デバッグモードの場合はコンソールにも出力
  if (debugMode) {
    console.error('エラー詳細:', errorInfo);
  }
}

/**
 * エラーを通知
 * @param {object} errorInfo エラー情報
 * @private
 */
function notifyError(errorInfo) {
  // 重大なエラーのみ通知
  if (errorInfo.severity !== ERROR_SEVERITY.HIGH && errorInfo.severity !== ERROR_SEVERITY.CRITICAL) {
    return;
  }
  
  // 設定を取得
  const settings = getSettings();
  
  // デバッグモードでない場合は通知しない
  if (!settings.debugMode) {
    return;
  }
  
  // 通知を作成
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon-128.png',
      title: `Twitch Translator エラー: ${errorInfo.code}`,
      message: errorInfo.message,
      priority: 2
    });
  } catch (e) {
    console.error('通知の作成に失敗:', e);
  }
}

/**
 * エラー履歴に追加
 * @param {object} errorInfo エラー情報
 * @private
 */
function addToErrorHistory(errorInfo) {
  // エラー履歴に追加
  errorHistory.errors.unshift(errorInfo);
  
  // 履歴サイズを制限
  if (errorHistory.errors.length > errorHistory.maxSize) {
    errorHistory.errors = errorHistory.errors.slice(0, errorHistory.maxSize);
  }
}

/**
 * エラー履歴を取得
 * @param {number} count 取得するエラー数
 * @returns {Array} エラー履歴
 */
export function getErrorHistory(count = 10) {
  return errorHistory.errors.slice(0, count);
}

/**
 * エラー履歴をクリア
 */
export function clearErrorHistory() {
  errorHistory.errors = [];
}

/**
 * エラーを作成
 * @param {string} code エラーコード
 * @param {string} message エラーメッセージ
 * @param {object} details エラーの詳細
 * @returns {Error} 作成されたエラー
 */
export function createError(code, message, details = null) {
  const error = new Error(message || ERROR_CODES[code]?.message || 'エラーが発生しました');
  error.code = code;
  error.details = details;
  return error;
}

/**
 * エラーコードの情報を取得
 * @param {string} code エラーコード
 * @returns {object|null} エラーコードの情報
 */
export function getErrorInfo(code) {
  return ERROR_CODES[code] || null;
}

// デフォルトエクスポート
export default {
  handleError,
  getErrorHistory,
  clearErrorHistory,
  createError,
  getErrorInfo,
  ERROR_TYPES,
  ERROR_SEVERITY
};
