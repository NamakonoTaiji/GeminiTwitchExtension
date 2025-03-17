/**
 * Twitch Gemini Translator 共通ユーティリティ関数
 * 
 * このファイルは、アプリケーション全体で使用される共通の機能を提供します。
 * コードの重複を減らし、一貫性のある動作を確保します。
 */

/**
 * デバウンス関数 - 指定時間内の複数回の呼び出しを1回にまとめる
 * @param {Function} func 実行する関数
 * @param {number} delay 遅延時間(ms)
 * @returns {Function} デバウンスされた関数
 */
export function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

/**
 * 文字列を指定した長さに切り詰める
 * @param {string} str 切り詰める文字列
 * @param {number} maxLength 最大長
 * @param {string} suffix 切り詰めた場合に追加する接尾辞
 * @returns {string} 切り詰められた文字列
 */
export function truncateString(str, maxLength, suffix = '...') {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * ローカルストレージを使用して設定を保存する
 * @param {string} key 保存キー
 * @param {object} data 保存するデータ
 * @param {boolean} logSuccess 保存成功時にログを出力するかどうか
 * @returns {boolean} 保存に成功したかどうか
 */
export function saveToLocalStorage(key, data, logSuccess = true) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    if (logSuccess) {
      console.log(`"${key}"をローカルストレージに保存しました`);
    }
    return true;
  } catch (error) {
    console.warn(`"${key}"のローカルストレージへの保存に失敗しました:`, error);
    return false;
  }
}

/**
 * ローカルストレージから設定を読み込む
 * @param {string} key 読み込むキー
 * @param {object|null} defaultValue キーが存在しない場合のデフォルト値
 * @param {boolean} logSuccess 読み込み成功時にログを出力するかどうか
 * @returns {object|null} 読み込んだデータまたはデフォルト値
 */
export function loadFromLocalStorage(key, defaultValue = null, logSuccess = true) {
  try {
    const storedData = localStorage.getItem(key);
    if (!storedData) return defaultValue;
    
    const parsedData = JSON.parse(storedData);
    if (logSuccess) {
      console.log(`"${key}"をローカルストレージから読み込みました`);
    }
    return parsedData;
  } catch (error) {
    console.error(`"${key}"のローカルストレージからの読み込みに失敗しました:`, error);
    return defaultValue;
  }
}

/**
 * 拡張機能のコンテキストが有効かどうかを確認する
 * @returns {Promise<boolean>} コンテキストが有効な場合はtrue
 */
export function isExtensionContextValid() {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ action: "ping" }, response => {
        if (chrome.runtime.lastError) {
          console.warn("拡張機能コンテキストが無効です:", chrome.runtime.lastError);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (error) {
      console.error("拡張機能コンテキストチェック中のエラー:", error);
      resolve(false);
    }
  });
}

/**
 * 日本語の割合を計算する
 * @param {string} text 分析対象のテキスト
 * @returns {number} 日本語の割合（0～1）
 */
export function getJapaneseRatio(text) {
  if (!text || text.length === 0) return 0;
  const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
  return japaneseChars / text.length;
}

/**
 * 英語の割合を計算する
 * @param {string} text 分析対象のテキスト
 * @returns {number} 英語の割合（0～1）
 */
export function getEnglishRatio(text) {
  if (!text || text.length === 0) return 0;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  return englishChars / text.length;
}

/**
 * 記号とスペースを除いた文字数を取得する
 * @param {string} text 分析対象のテキスト
 * @returns {number} 内容のある文字数
 */
export function getContentCharsCount(text) {
  if (!text || text.length === 0) return 0;
  const symbolsAndSpaces = (text.match(/[\s\d\p{P}]/gu) || []).length;
  return text.length - symbolsAndSpaces;
}

/**
 * LRU (Least Recently Used) キャッシュの実装
 * メモリ使用量を抑えるため、一定サイズを超えると古いアイテムから削除する
 */
export class LRUCache {
  /**
   * @param {number} maxSize キャッシュの最大サイズ
   */
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * キャッシュから値を取得する
   * @param {string} key キャッシュキー
   * @returns {any|null} キャッシュされた値またはnull
   */
  get(key) {
    if (!this.cache.has(key)) return null;
    
    // アクセスしたアイテムを最新に移動
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * キャッシュに値を設定する
   * @param {string} key キャッシュキー
   * @param {any} value キャッシュする値
   */
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 最も古いエントリを削除
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
  }

  /**
   * キャッシュをクリアする
   */
  clear() {
    this.cache.clear();
  }

  /**
   * キャッシュのサイズを取得する
   * @returns {number} キャッシュされているアイテム数
   */
  get size() {
    return this.cache.size;
  }

  /**
   * キャッシュの内容をオブジェクトとして出力する
   * @returns {object} キャッシュの内容
   */
  toObject() {
    const obj = {};
    this.cache.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  /**
   * オブジェクトからキャッシュを復元する
   * @param {object} obj 復元するオブジェクト
   */
  fromObject(obj) {
    this.clear();
    Object.entries(obj).forEach(([key, value]) => {
      this.cache.set(key, value);
    });
  }
}

/**
 * URLからチャンネル名を抽出する
 * @param {string} url TwitchのURL
 * @returns {string} チャンネル名または"不明"
 */
export function extractChannelFromUrl(url) {
  const channelMatch = url.match(/twitch\.tv\/(\w+)/);
  return channelMatch ? channelMatch[1] : "不明";
}

/**
 * エラーログを出力する
 * @param {string} context エラーが発生したコンテキスト
 * @param {Error|string} error エラーオブジェクトまたはエラーメッセージ
 */
export function logError(context, error) {
  const errorMessage = error instanceof Error ? error.message : error;
  console.error(`${context}: ${errorMessage}`);
  
  if (error instanceof Error && error.stack) {
    console.debug(`スタックトレース: ${error.stack}`);
  }
}

/**
 * デフォルト設定を取得する
 * @returns {object} デフォルト設定
 */
export function getDefaultSettings() {
  return {
    apiKey: "",
    enabled: false,
    translationMode: "selective",
    japaneseThreshold: 30,
    englishThreshold: 50,
    displayPrefix: "🇯🇵",
    textColor: "#9b9b9b",
    accentColor: "#9147ff",
    fontSize: "medium",
    useCache: true,
    maxCacheAge: 24,
    processExistingMessages: false,
    requestDelay: 100,
  };
}
