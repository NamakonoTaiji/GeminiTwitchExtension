/**
 * ロギングモジュール
 * 
 * アプリケーション全体で一貫したロギングを提供し、
 * ログレベルの制御、フォーマット、出力先の管理を行います。
 */

// ログレベル定義
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// ログレベル名のマッピング
const LOG_LEVEL_NAMES = {
  [LOG_LEVELS.DEBUG]: 'DEBUG',
  [LOG_LEVELS.INFO]: 'INFO',
  [LOG_LEVELS.WARN]: 'WARN',
  [LOG_LEVELS.ERROR]: 'ERROR',
  [LOG_LEVELS.NONE]: 'NONE'
};

// デフォルト設定
const DEFAULT_CONFIG = {
  level: LOG_LEVELS.INFO,
  useColors: true,
  showTimestamp: true,
  showSource: true,
  maxEntries: 100,
};

// 現在の設定
let config = { ...DEFAULT_CONFIG };

// ログエントリの保存用配列
let logEntries = [];

/**
 * ロガーの設定を更新
 * @param {object} newConfig 新しい設定
 */
export function configure(newConfig = {}) {
  // 設定をマージ
  config = { ...config, ...newConfig };
  
  // ログレベルが文字列の場合は数値に変換
  if (typeof config.level === 'string') {
    const levelName = config.level.toUpperCase();
    for (const [key, value] of Object.entries(LOG_LEVELS)) {
      if (key === levelName) {
        config.level = value;
        break;
      }
    }
  }
  
  // 設定の検証
  if (typeof config.level !== 'number' || config.level < 0 || config.level > LOG_LEVELS.NONE) {
    config.level = DEFAULT_CONFIG.level;
  }
  
  // 最大エントリ数の検証
  if (typeof config.maxEntries !== 'number' || config.maxEntries < 0) {
    config.maxEntries = DEFAULT_CONFIG.maxEntries;
  }
  
  // 設定を適用
  trimLogEntries();
}

/**
 * ログエントリを追加
 * @param {number} level ログレベル
 * @param {string} message メッセージ
 * @param {string} source ソース
 * @param {object} data 追加データ
 * @private
 */
function addLogEntry(level, message, source, data) {
  // 現在のログレベルより低いレベルのログは記録しない
  if (level < config.level) {
    return;
  }
  
  // タイムスタンプ
  const timestamp = new Date();
  
  // ログエントリを作成
  const entry = {
    level,
    levelName: LOG_LEVEL_NAMES[level],
    message,
    timestamp,
    source: source || 'app',
    data
  };
  
  // ログエントリを保存
  logEntries.unshift(entry);
  
  // ログエントリの数を制限
  trimLogEntries();
  
  // コンソールに出力
  printToConsole(entry);
}

/**
 * ログエントリの数を制限
 * @private
 */
function trimLogEntries() {
  if (logEntries.length > config.maxEntries) {
    logEntries = logEntries.slice(0, config.maxEntries);
  }
}

/**
 * ログエントリをコンソールに出力
 * @param {object} entry ログエントリ
 * @private
 */
function printToConsole(entry) {
  // メッセージの構築
  let formattedMessage = '';
  
  // タイムスタンプ
  if (config.showTimestamp) {
    const timeString = entry.timestamp.toISOString().replace('T', ' ').replace('Z', '');
    formattedMessage += `[${timeString}] `;
  }
  
  // レベル
  formattedMessage += `[${entry.levelName}]`;
  
  // ソース
  if (config.showSource && entry.source) {
    formattedMessage += ` [${entry.source}]`;
  }
  
  // メッセージ
  formattedMessage += `: ${entry.message}`;
  
  // コンソールに出力
  switch (entry.level) {
    case LOG_LEVELS.DEBUG:
      console.debug(formattedMessage, entry.data || '');
      break;
    case LOG_LEVELS.INFO:
      console.info(formattedMessage, entry.data || '');
      break;
    case LOG_LEVELS.WARN:
      console.warn(formattedMessage, entry.data || '');
      break;
    case LOG_LEVELS.ERROR:
      console.error(formattedMessage, entry.data || '');
      break;
  }
}

/**
 * デバッグレベルのログを出力
 * @param {string} message メッセージ
 * @param {string} source ソース
 * @param {object} data 追加データ
 */
export function debug(message, source, data) {
  addLogEntry(LOG_LEVELS.DEBUG, message, source, data);
}

/**
 * 情報レベルのログを出力
 * @param {string} message メッセージ
 * @param {string} source ソース
 * @param {object} data 追加データ
 */
export function info(message, source, data) {
  addLogEntry(LOG_LEVELS.INFO, message, source, data);
}

/**
 * 警告レベルのログを出力
 * @param {string} message メッセージ
 * @param {string} source ソース
 * @param {object} data 追加データ
 */
export function warn(message, source, data) {
  addLogEntry(LOG_LEVELS.WARN, message, source, data);
}

/**
 * エラーレベルのログを出力
 * @param {string} message メッセージ
 * @param {string} source ソース
 * @param {object} data 追加データ
 */
export function error(message, source, data) {
  addLogEntry(LOG_LEVELS.ERROR, message, source, data);
}

/**
 * ログエントリを取得
 * @param {number} count 取得するエントリ数
 * @param {number} minLevel 最小ログレベル
 * @returns {Array} ログエントリの配列
 */
export function getLogEntries(count = 50, minLevel = LOG_LEVELS.DEBUG) {
  return logEntries
    .filter(entry => entry.level >= minLevel)
    .slice(0, count);
}

/**
 * ログをクリア
 */
export function clearLogs() {
  logEntries = [];
}

/**
 * 現在の設定を取得
 * @returns {object} 現在の設定
 */
export function getConfig() {
  return { ...config };
}

// デフォルト設定でロガーを初期化
configure();

// デフォルトエクスポート
export default {
  configure,
  debug,
  info,
  warn,
  error,
  getLogEntries,
  clearLogs,
  getConfig,
  LOG_LEVELS
};
