/**
 * Twitch Gemini Translator キャッシュモジュール
 * 
 * このモジュールは、翻訳結果のキャッシュ機能を提供します。
 * メモリ使用量を制限するためのLRU（Least Recently Used）アルゴリズムを実装しています。
 */

import { getLogger } from './logger.js';

// ロガーのインスタンスを取得
const logger = getLogger('Cache');

/**
 * LRU (Least Recently Used) キャッシュの実装
 * メモリ使用量を抑えるため、一定サイズを超えると古いアイテムから削除する
 */
export class LRUCache {
  /**
   * @param {number} maxSize キャッシュの最大サイズ
   * @param {string} name キャッシュの名前（ログ出力用）
   */
  constructor(maxSize = 1000, name = 'Default') {
    this.maxSize = maxSize;
    this.name = name;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
    
    logger.debug(`キャッシュを初期化しました: ${name} (最大サイズ: ${maxSize})`);
  }

  /**
   * キャッシュから値を取得する
   * @param {string} key キャッシュキー
   * @returns {any|null} キャッシュされた値またはnull
   */
  get(key) {
    if (!this.cache.has(key)) {
      this.stats.misses++;
      return null;
    }
    
    // アクセスしたアイテムを最新に移動
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    
    this.stats.hits++;
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
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      
      logger.debug(`キャッシュから古いエントリを削除: ${oldestKey}`);
    }
    
    this.cache.set(key, value);
    this.stats.sets++;
  }

  /**
   * キャッシュをクリアする
   */
  clear() {
    const oldSize = this.cache.size;
    this.cache.clear();
    
    logger.debug(`キャッシュをクリアしました: ${this.name} (削除されたエントリ数: ${oldSize})`);
    
    // 統計情報もリセット
    this.resetStats();
  }

  /**
   * 統計情報をリセットする
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
    
    logger.debug(`キャッシュ統計情報をリセットしました: ${this.name}`);
  }

  /**
   * キャッシュのサイズを取得する
   * @returns {number} キャッシュされているアイテム数
   */
  get size() {
    return this.cache.size;
  }

  /**
   * キャッシュのヒット率を計算する
   * @returns {number} ヒット率（0～1）
   */
  get hitRate() {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * キャッシュの統計情報を取得する
   * @returns {object} 統計情報
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.hitRate,
      name: this.name
    };
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
    
    logger.debug(`キャッシュを復元しました: ${this.name} (エントリ数: ${this.cache.size})`);
  }

  /**
   * キャッシュの内容をローカルストレージに保存する
   * @param {string} storageKey ストレージキー
   * @returns {boolean} 保存に成功したかどうか
   */
  saveToLocalStorage(storageKey) {
    try {
      const data = {
        entries: this.toObject(),
        stats: this.stats,
        maxSize: this.maxSize,
        name: this.name,
        timestamp: new Date().toISOString()
      };
      
      localStorage.setItem(storageKey, JSON.stringify(data));
      logger.debug(`キャッシュをローカルストレージに保存しました: ${storageKey}`);
      return true;
    } catch (error) {
      logger.error(`キャッシュのローカルストレージへの保存に失敗しました: ${storageKey}`, error);
      return false;
    }
  }

  /**
   * ローカルストレージからキャッシュを読み込む
   * @param {string} storageKey ストレージキー
   * @returns {boolean} 読み込みに成功したかどうか
   */
  loadFromLocalStorage(storageKey) {
    try {
      const storedData = localStorage.getItem(storageKey);
      if (!storedData) {
        logger.debug(`ローカルストレージにキャッシュが見つかりませんでした: ${storageKey}`);
        return false;
      }
      
      const data = JSON.parse(storedData);
      
      // キャッシュエントリを復元
      if (data.entries) {
        this.fromObject(data.entries);
      }
      
      // 統計情報を復元
      if (data.stats) {
        this.stats = data.stats;
      }
      
      // 最大サイズを更新（必要に応じて）
      if (data.maxSize && data.maxSize !== this.maxSize) {
        this.maxSize = data.maxSize;
      }
      
      logger.debug(`キャッシュをローカルストレージから読み込みました: ${storageKey} (タイムスタンプ: ${data.timestamp || '不明'})`);
      return true;
    } catch (error) {
      logger.error(`キャッシュのローカルストレージからの読み込みに失敗しました: ${storageKey}`, error);
      return false;
    }
  }
}

// デフォルトのキャッシュインスタンスをエクスポート
export const translationCache = new LRUCache(500, 'TranslationCache');
