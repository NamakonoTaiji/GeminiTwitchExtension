/**
 * Twitch Gemini Translator エラーハンドリングモジュール
 * 
 * このモジュールは、アプリケーション全体で一貫したエラー処理を提供します。
 * エラーのログ記録、分類、通知などの機能を実装しています。
 */

import { getLogger } from './logger.js';

// ロガーのインスタンスを取得
const logger = getLogger('ErrorHandler');

/**
 * エラーカテゴリの定義
 */
export const ErrorCategory = {
  NETWORK: 'network',
  API: 'api',
  TRANSLATION: 'translation',
  STORAGE: 'storage',
  DOM: 'dom',
  EXTENSION: 'extension',
  UNKNOWN: 'unknown'
};

/**
 * エラーの重大度レベルの定義
 */
export const ErrorSeverity = {
  LOW: 'low',         // 軽微なエラー、ユーザー体験にほとんど影響なし
  MEDIUM: 'medium',   // 一部機能に影響するエラー
  HIGH: 'high',       // 主要機能に影響するエラー
  CRITICAL: 'critical' // アプリケーション全体に影響する致命的なエラー
};

/**
 * エラー情報を構造化するクラス
 */
export class ErrorInfo {
  /**
   * @param {string} message エラーメッセージ
   * @param {Error|string|object} originalError 元のエラーオブジェクト
   * @param {string} category エラーカテゴリ
   * @param {string} severity エラーの重大度
   * @param {object} context 追加コンテキスト情報
   */
  constructor(message, originalError = null, category = ErrorCategory.UNKNOWN, 
              severity = ErrorSeverity.MEDIUM, context = {}) {
    this.message = message;
    this.originalError = originalError;
    this.category = category;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date();
    this.stack = originalError && originalError.stack ? originalError.stack : new Error().stack;
  }

  /**
   * エラー情報を文字列として整形
   * @returns {string} 整形されたエラー情報
   */
  toString() {
    return `[${this.category.toUpperCase()}] ${this.message} (重大度: ${this.severity})`;
  }

  /**
   * ログ出力用にオブジェクトを整形
   * @returns {object} ログ出力用のオブジェクト
   */
  toLogObject() {
    return {
      message: this.message,
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      originalError: this.originalError ? (this.originalError.message || String(this.originalError)) : null
    };
  }
}

/**
 * エラーを処理する関数
 * @param {string} message エラーメッセージ
 * @param {Error|string|object} error 元のエラーオブジェクト
 * @param {string} category エラーカテゴリ
 * @param {string} severity エラーの重大度
 * @param {object} context 追加コンテキスト情報
 * @returns {ErrorInfo} 処理されたエラー情報
 */
export function handleError(message, error = null, category = ErrorCategory.UNKNOWN, 
                            severity = ErrorSeverity.MEDIUM, context = {}) {
  // エラー情報を構造化
  const errorInfo = new ErrorInfo(message, error, category, severity, context);
  
  // エラーの重大度に応じてログレベルを選択
  switch (severity) {
    case ErrorSeverity.LOW:
      logger.debug(errorInfo.toString(), errorInfo.toLogObject());
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn(errorInfo.toString(), errorInfo.toLogObject());
      break;
    case ErrorSeverity.HIGH:
    case ErrorSeverity.CRITICAL:
      logger.error(errorInfo.toString(), errorInfo.toLogObject());
      break;
    default:
      logger.warn(errorInfo.toString(), errorInfo.toLogObject());
  }

  // 拡張機能のコンテキスト無効化エラーを特別に処理
  if (error && (
      (error.message && error.message.includes('Extension context invalidated')) ||
      (typeof error === 'string' && error.includes('Extension context invalidated'))
  )) {
    errorInfo.category = ErrorCategory.EXTENSION;
    errorInfo.severity = ErrorSeverity.HIGH;
    logger.error('拡張機能コンテキストが無効になりました', errorInfo.toLogObject());
  }

  return errorInfo;
}

/**
 * ネットワークエラーを処理する関数
 * @param {string} message エラーメッセージ
 * @param {Error|string|object} error 元のエラーオブジェクト
 * @param {object} context 追加コンテキスト情報
 * @returns {ErrorInfo} 処理されたエラー情報
 */
export function handleNetworkError(message, error, context = {}) {
  return handleError(message, error, ErrorCategory.NETWORK, ErrorSeverity.MEDIUM, context);
}

/**
 * API関連エラーを処理する関数
 * @param {string} message エラーメッセージ
 * @param {Error|string|object} error 元のエラーオブジェクト
 * @param {object} context 追加コンテキスト情報
 * @returns {ErrorInfo} 処理されたエラー情報
 */
export function handleApiError(message, error, context = {}) {
  return handleError(message, error, ErrorCategory.API, ErrorSeverity.MEDIUM, context);
}

/**
 * 翻訳関連エラーを処理する関数
 * @param {string} message エラーメッセージ
 * @param {Error|string|object} error 元のエラーオブジェクト
 * @param {object} context 追加コンテキスト情報
 * @returns {ErrorInfo} 処理されたエラー情報
 */
export function handleTranslationError(message, error, context = {}) {
  return handleError(message, error, ErrorCategory.TRANSLATION, ErrorSeverity.MEDIUM, context);
}

/**
 * ストレージ関連エラーを処理する関数
 * @param {string} message エラーメッセージ
 * @param {Error|string|object} error 元のエラーオブジェクト
 * @param {object} context 追加コンテキスト情報
 * @returns {ErrorInfo} 処理されたエラー情報
 */
export function handleStorageError(message, error, context = {}) {
  return handleError(message, error, ErrorCategory.STORAGE, ErrorSeverity.MEDIUM, context);
}

/**
 * DOM操作関連エラーを処理する関数
 * @param {string} message エラーメッセージ
 * @param {Error|string|object} error 元のエラーオブジェクト
 * @param {object} context 追加コンテキスト情報
 * @returns {ErrorInfo} 処理されたエラー情報
 */
export function handleDomError(message, error, context = {}) {
  return handleError(message, error, ErrorCategory.DOM, ErrorSeverity.LOW, context);
}

/**
 * 拡張機能関連エラーを処理する関数
 * @param {string} message エラーメッセージ
 * @param {Error|string|object} error 元のエラーオブジェクト
 * @param {object} context 追加コンテキスト情報
 * @returns {ErrorInfo} 処理されたエラー情報
 */
export function handleExtensionError(message, error, context = {}) {
  return handleError(message, error, ErrorCategory.EXTENSION, ErrorSeverity.HIGH, context);
}
