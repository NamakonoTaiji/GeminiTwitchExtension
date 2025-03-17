/**
 * キャッシュ管理モジュール
 * 
 * 翻訳結果のキャッシュの保存、取得、有効期限管理などの機能を提供します。
 */

import { getSettings } from './settings.js';
import { incrementCacheHits, incrementTotalRequests } from './stats.js';

// キャッシュのデフォルト設定
const DEFAULT_CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24時間（ミリ秒）
const DEFAULT_MAX_CACHE_SIZE = 1000; // 最大キャッシュエントリ数

// キャッシュオブジェクト
let translationCache = {};
let cacheInitialized = false;

/**
 * キャッシュキーを生成
 * @param {string} text 元のテキスト
 * @param {string} sourceLang ソース言語
 * @returns {string} キャッシュキー
 */
function generateCacheKey(text, sourceLang) {
  return `${sourceLang}:${text}`;
}

/**
 * キャッシュからの翻訳結果の取得
 * @param {string} text 元のテキスト
 * @param {string} sourceLang ソース言語
 * @returns {object|null} キャッシュされた翻訳結果、またはnull
 */
export function getCachedTranslation(text, sourceLang) {
  if (!text) return null;
  
  const settings = getSettings();
  
  // キャッシュが無効の場合はnullを返す
  if (!settings.useCache) {
    return null;
  }
  
  // キャッシュが初期化されていない場合は初期化
  if (!cacheInitialized) {
    loadCache();
    return null; // 初回は常にnullを返す（非同期ロードのため）
  }
  
  const cacheKey = generateCacheKey(text, sourceLang);
  const cachedItem = translationCache[cacheKey];
  
  // キャッシュアイテムが存在しない場合はnullを返す
  if (!cachedItem) {
    return null;
  }
  
  // 有効期限切れの場合はキャッシュから削除してnullを返す
  if (Date.now() > cachedItem.expiresAt) {
    console.log(`キャッシュ期限切れ: "${text.substring(0, 20)}..."`);
    delete translationCache[cacheKey];
    return null;
  }
  
  // キャッシュヒットをカウント
  incrementCacheHits();
  
  // 最終アクセス時間を更新
  cachedItem.lastAccessed = Date.now();
  
  return cachedItem.data;
}

/**
 * 翻訳結果をキャッシュに保存
 * @param {string} text 元のテキスト
 * @param {string} sourceLang ソース言語
 * @param {object} translationResult 翻訳結果
 */
export function cacheTranslation(text, sourceLang, translationResult) {
  if (!text || !translationResult || !translationResult.success) {
    return;
  }
  
  const settings = getSettings();
  
  // キャッシュが無効の場合は何もしない
  if (!settings.useCache) {
    return;
  }
  
  // キャッシュが初期化されていない場合は初期化
  if (!cacheInitialized) {
    loadCache();
    return; // 初期化中は保存しない
  }
  
  const cacheKey = generateCacheKey(text, sourceLang);
  const now = Date.now();
  
  // キャッシュ有効期限を設定（設定から取得、またはデフォルト値を使用）
  const cacheExpiration = settings.cacheExpiration || DEFAULT_CACHE_EXPIRATION;
  
  // キャッシュアイテムを作成
  translationCache[cacheKey] = {
    data: translationResult,
    createdAt: now,
    lastAccessed: now,
    expiresAt: now + cacheExpiration,
  };
  
  // キャッシュサイズが上限を超えた場合は古いアイテムを削除
  pruneCache();
  
  // 定期的にキャッシュを保存
  scheduleCacheSave();
}

/**
 * キャッシュサイズが上限を超えた場合に古いアイテムを削除
 */
function pruneCache() {
  const settings = getSettings();
  const maxCacheSize = settings.maxCacheSize || DEFAULT_MAX_CACHE_SIZE;
  const cacheSize = Object.keys(translationCache).length;
  
  if (cacheSize <= maxCacheSize) {
    return;
  }
  
  console.log(`キャッシュサイズ (${cacheSize}) が上限 (${maxCacheSize}) を超えました。古いアイテムを削除します。`);
  
  // キャッシュアイテムを最終アクセス時間でソート
  const sortedItems = Object.entries(translationCache).sort(
    ([, a], [, b]) => a.lastAccessed - b.lastAccessed
  );
  
  // 削除する数を計算（上限の20%を削除）
  const itemsToRemove = Math.ceil((cacheSize - maxCacheSize) + (maxCacheSize * 0.2));
  
  // 古いアイテムから順に削除
  for (let i = 0; i < itemsToRemove && i < sortedItems.length; i++) {
    const [key] = sortedItems[i];
    delete translationCache[key];
  }
  
  console.log(`${itemsToRemove}個のキャッシュアイテムを削除しました。新しいサイズ: ${Object.keys(translationCache).length}`);
}

/**
 * キャッシュを定期的に保存するスケジューリング
 */
let cacheSaveTimeout = null;
function scheduleCacheSave() {
  // 既存のタイムアウトをクリア
  if (cacheSaveTimeout) {
    clearTimeout(cacheSaveTimeout);
  }
  
  // 30秒後にキャッシュを保存
  cacheSaveTimeout = setTimeout(() => {
    saveCache();
    cacheSaveTimeout = null;
  }, 30000);
}

/**
 * キャッシュサイズを取得
 * @returns {number} キャッシュエントリ数
 */
export function getCacheSize() {
  return Object.keys(translationCache).length;
}

/**
 * キャッシュをクリア
 * @returns {number} クリア前のキャッシュサイズ
 */
export function clearCache() {
  const previousSize = getCacheSize();
  
  // キャッシュをクリア
  translationCache = {};
  
  // キャッシュの保存
  saveCache(true);
  
  return previousSize;
}

/**
 * キャッシュを保存
 * @param {boolean} force 強制保存フラグ
 */
export async function saveCache(force = false) {
  const settings = getSettings();
  
  // キャッシュが無効で、強制保存でない場合は何もしない
  if (!settings.useCache && !force) {
    return 0;
  }
  
  // 保存するキャッシュアイテムを準備
  const cacheData = {};
  let count = 0;
  
  // 有効期限内のアイテムのみを保存
  const now = Date.now();
  Object.entries(translationCache).forEach(([key, item]) => {
    if (now < item.expiresAt) {
      cacheData[key] = item;
      count++;
    }
  });
  
  // キャッシュが空の場合は何もしない
  if (count === 0 && !force) {
    return 0;
  }
  
  try {
    // キャッシュをストレージに保存（オブジェクトとして直接保存）
    await chrome.storage.local.set({ translationCache: cacheData });
    console.log(`キャッシュを保存しました (${count}アイテム)`);
    return count;
  } catch (error) {
    console.error("キャッシュの保存に失敗:", error);
    return 0;
  }
}

/**
 * キャッシュをロード
 * @returns {Promise<number>} ロードされたキャッシュエントリ数
 */
export async function loadCache() {
  try {
    const settings = getSettings();
    
    // キャッシュが無効の場合は空のキャッシュを設定
    if (!settings.useCache) {
      translationCache = {};
      cacheInitialized = true;
      return 0;
    }
    
    // ストレージからキャッシュを読み込み
    const data = await chrome.storage.local.get(["translationCache"]);
    
    // キャッシュデータが存在しない場合は空のキャッシュを設定
    if (!data.translationCache) {
      translationCache = {};
      cacheInitialized = true;
      return 0;
    }
    
    // キャッシュデータを取得（文字列の場合はパース、オブジェクトの場合はそのまま使用）
    let storedCache;
    if (typeof data.translationCache === 'string') {
      try {
        storedCache = JSON.parse(data.translationCache);
      } catch (parseError) {
        console.error("キャッシュのパースに失敗:", parseError);
        translationCache = {};
        cacheInitialized = true;
        return 0;
      }
    } else {
      storedCache = data.translationCache;
    }
    
    // 有効期限内のアイテムのみを読み込み
    const now = Date.now();
    let count = 0;
    
    translationCache = {};
    Object.entries(storedCache).forEach(([key, item]) => {
      if (now < item.expiresAt) {
        translationCache[key] = item;
        count++;
      }
    });
    
    cacheInitialized = true;
    console.log(`キャッシュを読み込みました (${count}アイテム)`);
    
    return count;
  } catch (error) {
    console.error("キャッシュの読み込みに失敗:", error);
    translationCache = {};
    cacheInitialized = true;
    return 0;
  }
}

/**
 * キャッシュの初期化
 * @returns {Promise<boolean>} 初期化が成功したかどうか
 */
export async function initializeCache() {
  try {
    const count = await loadCache();
    console.log(`キャッシュを初期化しました (${count}アイテム)`);
    return true;
  } catch (error) {
    console.error("キャッシュの初期化に失敗:", error);
    translationCache = {};
    cacheInitialized = true;
    return false;
  }
}
