/**
 * キャッシュ管理モジュール
 * 
 * 翻訳結果のキャッシュの保存、取得、有効期限管理などの機能を提供します。
 */

import { getSettings } from './settings.js';
import { incrementCacheHits, incrementTotalRequests } from './stats.js';

// 翻訳キャッシュ
const translationCache = new Map();
const MAX_CACHE_SIZE = 1000; // 最大キャッシュサイズ

// 最後にキャッシュを保存した時間
let lastCacheSave = Date.now();

/**
 * キャッシュを読み込む
 * @returns {Promise<number>} 読み込まれたキャッシュエントリの数
 */
export async function loadCache() {
  const settings = getSettings();
  
  if (!settings.useCache) {
    return 0;
  }
  
  try {
    const savedCache = await chrome.storage.local.get('translationCache');
    if (!savedCache.translationCache) {
      return 0;
    }
    
    const now = Date.now();
    const maxAge = settings.maxCacheAge * 60 * 60 * 1000; // 時間をミリ秒に変換
    
    // 期限内のキャッシュのみ復元
    let restoredCount = 0;
    Object.entries(savedCache.translationCache).forEach(([key, entry]) => {
      if (now - entry.timestamp < maxAge) {
        translationCache.set(key, entry);
        restoredCount++;
      }
    });
    
    console.log(`${restoredCount}件のキャッシュをロードしました`);
    return restoredCount;
  } catch (error) {
    console.error('キャッシュの読み込みに失敗:', error);
    return 0;
  }
}

/**
 * キャッシュを保存
 * @param {boolean} force 強制保存するかどうか
 * @returns {Promise<boolean>} 保存に成功したかどうか
 */
export async function saveCache(force = false) {
  const settings = getSettings();
  
  if (!settings.useCache || translationCache.size === 0) {
    return false;
  }
  
  // 30分ごとに保存、または強制保存
  const now = Date.now();
  if (!force && now - lastCacheSave < 30 * 60 * 1000) {
    return false;
  }
  
  try {
    // MapオブジェクトをObjectに変換
    const cacheObject = {};
    translationCache.forEach((value, key) => {
      cacheObject[key] = value;
    });
    
    await chrome.storage.local.set({ translationCache: cacheObject });
    console.log(`${translationCache.size}件のキャッシュを保存しました`);
    
    lastCacheSave = now;
    return true;
  } catch (error) {
    console.error('キャッシュの保存に失敗:', error);
    return false;
  }
}

/**
 * キャッシュからの翻訳取得
 * @param {string} text 元のテキスト
 * @param {string} sourceLang ソース言語
 * @returns {object|null} キャッシュされた翻訳結果またはnull
 */
export function getCachedTranslation(text, sourceLang) {
  const settings = getSettings();
  
  if (!settings.useCache) {
    return null;
  }
  
  const cacheKey = `${sourceLang}:${text}`;
  const cachedEntry = translationCache.get(cacheKey);
  
  if (!cachedEntry) {
    return null;
  }
  
  // キャッシュの有効期限をチェック
  const now = Date.now();
  const maxAge = settings.maxCacheAge * 60 * 60 * 1000; // 時間をミリ秒に変換
  
  if (now - cachedEntry.timestamp > maxAge) {
    // 期限切れのキャッシュを削除
    translationCache.delete(cacheKey);
    return null;
  }
  
  // キャッシュヒットの統計を更新
  incrementTotalRequests();
  incrementCacheHits();
  
  // キャッシュのタイムスタンプを更新（アクセス時間の更新）
  cachedEntry.timestamp = now;
  translationCache.set(cacheKey, cachedEntry);
  
  // キャッシュからの結果にはエンジン情報を追加
  const result = cachedEntry.translation;
  if (result && !result.engine) {
    result.engine = 'cached';
  }
  
  return result;
}

/**
 * キャッシュに翻訳を保存
 * @param {string} text 元のテキスト
 * @param {string} sourceLang ソース言語
 * @param {object} translationResult 翻訳結果
 * @returns {boolean} 保存に成功したかどうか
 */
export function cacheTranslation(text, sourceLang, translationResult) {
  const settings = getSettings();
  
  if (!settings.useCache || !translationResult.success) {
    return false;
  }
  
  const cacheKey = `${sourceLang}:${text}`;
  
  // キャッシュが最大サイズに達した場合、最も古いエントリを削除
  if (translationCache.size >= MAX_CACHE_SIZE) {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    translationCache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    });
    
    if (oldestKey) {
      translationCache.delete(oldestKey);
    }
  }
  
  // 新しい翻訳をキャッシュに追加
  translationCache.set(cacheKey, {
    translation: translationResult,
    timestamp: Date.now()
  });
  
  // 30分ごとにキャッシュを保存
  const now = Date.now();
  if (now - lastCacheSave > 30 * 60 * 1000) {
    saveCache();
  }
  
  return true;
}

/**
 * キャッシュをクリア
 * @returns {number} クリアされたエントリ数
 */
export function clearCache() {
  const previousSize = translationCache.size;
  translationCache.clear();
  
  try {
    chrome.storage.local.remove('translationCache');
  } catch (error) {
    console.error('キャッシュ削除中のエラー:', error);
  }
  
  return previousSize;
}

/**
 * 現在のキャッシュサイズを取得
 * @returns {number} キャッシュされているエントリ数
 */
export function getCacheSize() {
  return translationCache.size;
}
