/**
 * Twitch Gemini Translator ロギングモジュール
 * 
 * このモジュールは、アプリケーション全体で一貫したロギング機能を提供します。
 * 異なるログレベルをサポートし、コンテキスト情報の追加やフォーマット機能を備えています。
 */

/**
 * ログレベルの定義
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// デフォルトのログレベル（開発中はDEBUG、本番環境ではINFO推奨）
let globalLogLevel = LogLevel.DEBUG;

// ロガーインスタンスのキャッシュ
const loggers = new Map();

/**
 * グローバルログレベルを設定する
 * @param {number} level 設定するログレベル
 */
export function setGlobalLogLevel(level) {
  if (level >= LogLevel.DEBUG && level <= LogLevel.NONE) {
    globalLogLevel = level;
    console.log(`グローバルログレベルを設定しました: ${getLogLevelName(level)}`);
  } else {
    console.error(`無効なログレベルです: ${level}`);
  }
}

/**
 * ログレベル名を取得する
 * @param {number} level ログレベル
 * @returns {string} ログレベル名
 */
export function getLogLevelName(level) {
  switch (level) {
    case LogLevel.DEBUG: return 'DEBUG';
    case LogLevel.INFO: return 'INFO';
    case LogLevel.WARN: return 'WARN';
    case LogLevel.ERROR: return 'ERROR';
    case LogLevel.NONE: return 'NONE';
    default: return 'UNKNOWN';
  }
}

/**
 * タイムスタンプを生成する
 * @returns {string} 現在時刻のフォーマット済み文字列
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * ロガークラス
 */
class Logger {
  /**
   * @param {string} name ロガー名
   * @param {number} level このロガーのログレベル（未指定時はグローバル設定を使用）
   */
  constructor(name, level = null) {
    this.name = name;
    this.level = level !== null ? level : globalLogLevel;
  }

  /**
   * このロガーのログレベルを設定する
   * @param {number} level 設定するログレベル
   */
  setLevel(level) {
    if (level >= LogLevel.DEBUG && level <= LogLevel.NONE) {
      this.level = level;
    } else {
      console.error(`無効なログレベルです: ${level}`);
    }
  }

  /**
   * メッセージをフォーマットする
   * @param {string} level ログレベル名
   * @param {string} message メッセージ
   * @returns {string} フォーマット済みメッセージ
   */
  formatMessage(level, message) {
    return `[${getTimestamp()}] [${level}] [${this.name}] ${message}`;
  }

  /**
   * 指定されたレベルでログを出力する
   * @param {number} level ログレベル
   * @param {string} levelName ログレベル名
   * @param {string} message メッセージ
   * @param {...any} args 追加の引数
   */
  log(level, levelName, message, ...args) {
    if (level >= this.level) {
      const formattedMessage = this.formatMessage(levelName, message);
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage, ...args);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage, ...args);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage, ...args);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage, ...args);
          break;
      }
    }
  }

  /**
   * DEBUGレベルのログを出力する
   * @param {string} message メッセージ
   * @param {...any} args 追加の引数
   */
  debug(message, ...args) {
    this.log(LogLevel.DEBUG, 'DEBUG', message, ...args);
  }

  /**
   * INFOレベルのログを出力する
   * @param {string} message メッセージ
   * @param {...any} args 追加の引数
   */
  info(message, ...args) {
    this.log(LogLevel.INFO, 'INFO', message, ...args);
  }

  /**
   * WARNレベルのログを出力する
   * @param {string} message メッセージ
   * @param {...any} args 追加の引数
   */
  warn(message, ...args) {
    this.log(LogLevel.WARN, 'WARN', message, ...args);
  }

  /**
   * ERRORレベルのログを出力する
   * @param {string} message メッセージ
   * @param {...any} args 追加の引数
   */
  error(message, ...args) {
    this.log(LogLevel.ERROR, 'ERROR', message, ...args);
  }
}

/**
 * 名前付きロガーを取得する
 * @param {string} name ロガー名
 * @param {number} level ログレベル（オプション）
 * @returns {Logger} ロガーインスタンス
 */
export function getLogger(name, level = null) {
  if (!loggers.has(name)) {
    loggers.set(name, new Logger(name, level));
  } else if (level !== null) {
    // 既存のロガーのレベルを更新
    loggers.get(name).setLevel(level);
  }
  
  return loggers.get(name);
}

/**
 * すべてのロガーのログレベルをリセットする
 * @param {number} level 設定するログレベル（未指定時はグローバル設定を使用）
 */
export function resetAllLoggers(level = null) {
  const targetLevel = level !== null ? level : globalLogLevel;
  loggers.forEach(logger => {
    logger.setLevel(targetLevel);
  });
}

// デフォルトのロガーをエクスポート
export const defaultLogger = getLogger('Default');

// 簡易アクセス用の関数
export const debug = (message, ...args) => defaultLogger.debug(message, ...args);
export const info = (message, ...args) => defaultLogger.info(message, ...args);
export const warn = (message, ...args) => defaultLogger.warn(message, ...args);
export const error = (message, ...args) => defaultLogger.error(message, ...args);
