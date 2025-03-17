/**
 * ユーティリティモジュール
 * 
 * アプリケーション全体で使用される共通のユーティリティ関数を提供します。
 */

import logger from './logger.js';

/**
 * 指定した時間だけ待機する
 * @param {number} ms 待機時間（ミリ秒）
 * @returns {Promise<void>} 待機完了後に解決されるPromise
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * オブジェクトの深いコピーを作成
 * @param {object} obj コピー元オブジェクト
 * @returns {object} コピーされたオブジェクト
 */
export function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 文字列を切り詰める
 * @param {string} str 元の文字列
 * @param {number} maxLength 最大長
 * @param {string} suffix 省略記号
 * @returns {string} 切り詰められた文字列
 */
export function truncateString(str, maxLength = 100, suffix = '...') {
  if (!str || str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 指定された関数を一定時間内に一度だけ実行する（デバウンス）
 * @param {Function} func 実行する関数
 * @param {number} wait 待機時間（ミリ秒）
 * @returns {Function} デバウンスされた関数
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 指定された関数の実行を制限する（スロットル）
 * @param {Function} func 実行する関数
 * @param {number} limit 制限時間（ミリ秒）
 * @returns {Function} スロットルされた関数
 */
export function throttle(func, limit = 300) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * 非同期関数の実行を再試行する
 * @param {Function} asyncFn 非同期関数
 * @param {number} maxRetries 最大再試行回数
 * @param {number} delay 再試行間の遅延（ミリ秒）
 * @param {number} backoffFactor 遅延の増加係数
 * @returns {Promise<any>} 関数の実行結果
 */
export async function retry(asyncFn, maxRetries = 3, delay = 1000, backoffFactor = 2) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const waitTime = delay * Math.pow(backoffFactor, attempt);
        logger.warn(`再試行中... 試行 ${attempt + 1}/${maxRetries}`, 'utils', { error: error.message });
        await sleep(waitTime);
      }
    }
  }
  
  throw lastError;
}

/**
 * 言語を検出する（簡易版）
 * @param {string} text 検出対象のテキスト
 * @returns {string} 検出された言語コード（'ja', 'en', 'unknown'）
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string') {
    return 'unknown';
  }
  
  // 日本語の文字範囲
  const japaneseRegex = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/;
  
  // 英語の文字範囲（基本的にASCII文字）
  const englishRegex = /^[a-zA-Z0-9\s.,!?;:()\[\]{}'"<>@#$%^&*_\-+=|\\\/`~]*$/;
  
  // 文字数をカウント
  const totalChars = text.length;
  let japaneseChars = 0;
  
  for (let i = 0; i < totalChars; i++) {
    if (japaneseRegex.test(text[i])) {
      japaneseChars++;
    }
  }
  
  // 日本語文字の割合を計算
  const japaneseRatio = japaneseChars / totalChars;
  
  // 判定
  if (japaneseRatio > 0.2) {
    return 'ja';
  } else if (englishRegex.test(text)) {
    return 'en';
  } else {
    return 'unknown';
  }
}

/**
 * 文字列がURLかどうかを判定
 * @param {string} str 判定する文字列
 * @returns {boolean} URLの場合はtrue
 */
export function isUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * 文字列がJSONかどうかを判定
 * @param {string} str 判定する文字列
 * @returns {boolean} JSONの場合はtrue
 */
export function isJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * 文字列をハッシュ化
 * @param {string} str ハッシュ化する文字列
 * @returns {string} ハッシュ値
 */
export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit整数に変換
  }
  return hash.toString(16);
}

/**
 * 現在のタイムスタンプを取得
 * @returns {number} UNIXタイムスタンプ（ミリ秒）
 */
export function getTimestamp() {
  return Date.now();
}

/**
 * 日時を指定された形式にフォーマット
 * @param {Date|number} date 日時オブジェクトまたはタイムスタンプ
 * @param {string} format フォーマット
 * @returns {string} フォーマットされた日時文字列
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  const d = date instanceof Date ? date : new Date(date);
  
  const replacements = {
    'YYYY': d.getFullYear().toString(),
    'MM': (d.getMonth() + 1).toString().padStart(2, '0'),
    'DD': d.getDate().toString().padStart(2, '0'),
    'HH': d.getHours().toString().padStart(2, '0'),
    'mm': d.getMinutes().toString().padStart(2, '0'),
    'ss': d.getSeconds().toString().padStart(2, '0'),
    'SSS': d.getMilliseconds().toString().padStart(3, '0')
  };
  
  let result = format;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(key, value);
  }
  
  return result;
}

/**
 * 指定された範囲内のランダムな整数を生成
 * @param {number} min 最小値（含む）
 * @param {number} max 最大値（含む）
 * @returns {number} ランダムな整数
 */
export function randomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 配列をシャッフル
 * @param {Array} array シャッフルする配列
 * @returns {Array} シャッフルされた配列
 */
export function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 配列を指定されたサイズのチャンクに分割
 * @param {Array} array 分割する配列
 * @param {number} chunkSize チャンクサイズ
 * @returns {Array} チャンクの配列
 */
export function chunkArray(array, chunkSize) {
  if (!array || !Array.isArray(array)) {
    return [];
  }
  
  const result = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
}

// デフォルトエクスポート
export default {
  sleep,
  deepCopy,
  truncateString,
  debounce,
  throttle,
  retry,
  detectLanguage,
  isUrl,
  isJson,
  hashString,
  getTimestamp,
  formatDate,
  randomInt,
  shuffleArray,
  chunkArray
};
