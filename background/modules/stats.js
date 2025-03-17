/**
 * 統計情報管理モジュール
 * 
 * 翻訳リクエスト数、キャッシュヒット数、API呼び出し数、エラー数などの
 * 統計情報を追跡し、保存・読み込み機能を提供します。
 */

// デフォルトの統計情報
const defaultStats = {
  totalRequests: 0,  // 総リクエスト数
  cacheHits: 0,      // キャッシュヒット数
  apiRequests: 0,    // API呼び出し数
  errors: 0,         // エラー数
  charactersTranslated: 0, // 翻訳された文字数
  lastReset: Date.now()    // 最終リセット時間
};

// 現在の統計情報
let stats = { ...defaultStats };

/**
 * 統計情報を読み込む
 * @returns {Promise<object>} 読み込まれた統計情報
 */
export async function loadStats() {
  try {
    const savedStats = await chrome.storage.local.get('translationStats');
    if (savedStats.translationStats) {
      stats = savedStats.translationStats;
    }
    return stats;
  } catch (error) {
    console.error('統計情報の読み込みに失敗:', error);
    return { ...defaultStats };
  }
}

/**
 * 現在の統計情報を取得
 * @param {number} cacheSize 現在のキャッシュサイズ（オプション）
 * @returns {object} 現在の統計情報
 */
export function getStats(cacheSize = null) {
  const currentStats = { ...stats };
  
  // キャッシュサイズが指定されていれば追加
  if (cacheSize !== null) {
    currentStats.cacheSize = cacheSize;
  }
  
  return currentStats;
}

/**
 * 統計情報を保存
 * @returns {Promise<boolean>} 保存に成功したかどうか
 */
export async function saveStats() {
  try {
    await chrome.storage.local.set({ translationStats: stats });
    return true;
  } catch (error) {
    console.error('統計情報の保存に失敗:', error);
    return false;
  }
}

/**
 * 統計情報をリセット
 * @returns {Promise<object>} リセット後の統計情報
 */
export async function resetStats() {
  stats = {
    totalRequests: 0,
    cacheHits: 0,
    apiRequests: 0,
    errors: 0,
    charactersTranslated: 0,
    lastReset: Date.now()
  };
  
  await saveStats();
  return stats;
}

/**
 * 総リクエスト数を増加
 */
export function incrementTotalRequests() {
  stats.totalRequests++;
  
  // 10回に1回自動保存
  if (stats.totalRequests % 10 === 0) {
    saveStats();
  }
}

/**
 * キャッシュヒット数を増加
 */
export function incrementCacheHits() {
  stats.cacheHits++;
}

/**
 * API呼び出し数を増加
 * @param {number} charCount 翻訳文字数
 */
export function incrementApiRequests(charCount = 0) {
  stats.apiRequests++;
  stats.charactersTranslated += charCount;
}

/**
 * エラー数を増加
 */
export function incrementErrors() {
  stats.errors++;
}
