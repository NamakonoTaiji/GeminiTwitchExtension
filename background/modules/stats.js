/**
 * 統計情報モジュール
 * 
 * 翻訳リクエストの統計情報を管理し、キャッシュヒット率、
 * APIリクエスト数、エラー率などの情報を提供します。
 */

// 統計情報の初期値
const DEFAULT_STATS = {
  // リクエスト統計
  totalRequests: 0,      // 総リクエスト数
  apiRequests: 0,        // API呼び出し数
  cacheHits: 0,          // キャッシュヒット数
  errors: 0,             // エラー数
  
  // 文字数統計
  totalCharacters: 0,    // 総文字数
  
  // エンジン統計
  engineStats: {
    gemini: 0,           // Gemini APIによる翻訳数
    chrome: 0,           // Chrome APIによる翻訳数
    cached: 0            // キャッシュからの取得数
  },
  
  // 時間統計
  startTime: Date.now(), // 統計開始時間
  lastReset: Date.now(), // 最後のリセット時間
  
  // 追加統計
  averageResponseTime: 0,  // 平均応答時間（ミリ秒）
  responseTimes: [],       // 応答時間の履歴（最大100件）
  lastErrors: [],          // 最近のエラー（最大10件）
};

// 現在の統計情報
let stats = { ...DEFAULT_STATS };

/**
 * 統計情報を読み込む
 * @returns {Promise<object>} 読み込まれた統計情報
 */
export async function loadStats() {
  try {
    console.log("統計情報を読み込み中...");
    
    // ストレージから統計情報を取得
    const result = await chrome.storage.local.get(["translationStats"]);
    
    if (!result.translationStats) {
      console.log("保存された統計情報が見つかりませんでした。新しい統計情報を作成します。");
      stats = { ...DEFAULT_STATS };
      return stats;
    }
    
    try {
      // 統計情報をパース
      let loadedStats;
      
      // 文字列の場合はJSONとしてパース、オブジェクトの場合はそのまま使用
      if (typeof result.translationStats === 'string') {
        loadedStats = JSON.parse(result.translationStats);
      } else {
        loadedStats = result.translationStats;
      }
      
      // デフォルト値をベースに、保存されている統計情報で上書き
      stats = { ...DEFAULT_STATS };
      
      // 保存されている統計情報をマージ
      for (const key in loadedStats) {
        if (key in DEFAULT_STATS) {
          stats[key] = loadedStats[key];
        }
      }
      
      console.log("統計情報を読み込みました:", {
        totalRequests: stats.totalRequests,
        cacheHits: stats.cacheHits,
        apiRequests: stats.apiRequests,
        errors: stats.errors,
      });
      
      return stats;
    } catch (parseError) {
      console.error("統計情報のパースに失敗しました:", parseError);
      stats = { ...DEFAULT_STATS };
      return stats;
    }
  } catch (error) {
    console.error("統計情報の読み込み中にエラーが発生しました:", error);
    stats = { ...DEFAULT_STATS };
    return stats;
  }
}

/**
 * 統計情報を保存
 * @returns {Promise<boolean>} 保存に成功したかどうか
 */
export async function saveStats() {
  try {
    // 統計情報をそのままオブジェクトとして保存
    await chrome.storage.local.set({ translationStats: stats });
    
    console.log("統計情報を保存しました");
    return true;
  } catch (error) {
    console.error("統計情報の保存中にエラーが発生しました:", error);
    return false;
  }
}

/**
 * 統計情報をリセット
 * @returns {Promise<object>} リセットされた統計情報
 */
export async function resetStats() {
  try {
    // 統計情報をリセット
    stats = { ...DEFAULT_STATS };
    stats.lastReset = Date.now();
    stats.startTime = Date.now();
    
    // リセットした統計情報を保存
    await saveStats();
    
    console.log("統計情報をリセットしました");
    return stats;
  } catch (error) {
    console.error("統計情報のリセット中にエラーが発生しました:", error);
    throw error;
  }
}

/**
 * 総リクエスト数をインクリメント
 */
export function incrementTotalRequests() {
  stats.totalRequests++;
}

/**
 * キャッシュヒット数をインクリメント
 */
export function incrementCacheHits() {
  stats.totalRequests++;
  stats.cacheHits++;
  stats.engineStats.cached++;
}

/**
 * APIリクエスト数をインクリメント
 * @param {number} characterCount 文字数
 */
export function incrementApiRequests(characterCount = 0) {
  stats.totalRequests++;
  stats.apiRequests++;
  
  if (characterCount > 0) {
    stats.totalCharacters += characterCount;
  }
}

/**
 * エラー数をインクリメント
 * @param {string} errorMessage エラーメッセージ
 */
export function incrementErrors(errorMessage = "不明なエラー") {
  stats.errors++;
  
  // エラー情報を記録（最大10件）
  const errorInfo = {
    message: errorMessage,
    timestamp: Date.now()
  };
  
  stats.lastErrors.unshift(errorInfo);
  if (stats.lastErrors.length > 10) {
    stats.lastErrors.pop();
  }
}

/**
 * 翻訳エンジンの使用回数をインクリメント
 * @param {string} engine 翻訳エンジン名
 */
export function incrementEngineUsage(engine) {
  if (engine in stats.engineStats) {
    stats.engineStats[engine]++;
  }
}

/**
 * 応答時間を記録
 * @param {number} responseTime 応答時間（ミリ秒）
 */
export function recordResponseTime(responseTime) {
  if (responseTime <= 0) return;
  
  // 応答時間を記録（最大100件）
  stats.responseTimes.unshift(responseTime);
  if (stats.responseTimes.length > 100) {
    stats.responseTimes.pop();
  }
  
  // 平均応答時間を計算
  if (stats.responseTimes.length > 0) {
    const sum = stats.responseTimes.reduce((acc, time) => acc + time, 0);
    stats.averageResponseTime = Math.round(sum / stats.responseTimes.length);
  }
}

/**
 * 統計情報を取得
 * @param {number} cacheSize 現在のキャッシュサイズ
 * @returns {object} 統計情報
 */
export function getStats(cacheSize = 0) {
  // 現在の時間
  const now = Date.now();
  
  // 経過時間（ミリ秒）
  const elapsedTime = now - stats.startTime;
  const elapsedSinceReset = now - stats.lastReset;
  
  // 日、時間、分、秒に変換
  const days = Math.floor(elapsedTime / (24 * 60 * 60 * 1000));
  const hours = Math.floor((elapsedTime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((elapsedTime % (60 * 60 * 1000)) / (60 * 1000));
  
  // キャッシュヒット率
  const cacheHitRate = stats.totalRequests > 0 
    ? (stats.cacheHits / stats.totalRequests * 100).toFixed(2) 
    : 0;
  
  // エラー率
  const errorRate = stats.totalRequests > 0 
    ? (stats.errors / stats.totalRequests * 100).toFixed(2) 
    : 0;
  
  return {
    // 基本統計
    totalRequests: stats.totalRequests,
    apiRequests: stats.apiRequests,
    cacheHits: stats.cacheHits,
    errors: stats.errors,
    
    // 文字数統計
    totalCharacters: stats.totalCharacters,
    
    // 計算統計
    cacheHitRate: `${cacheHitRate}%`,
    errorRate: `${errorRate}%`,
    
    // キャッシュ情報
    cacheSize: cacheSize,
    
    // エンジン統計
    engineStats: stats.engineStats,
    
    // 時間統計
    uptime: {
      days,
      hours,
      minutes,
      formatted: `${days}日 ${hours}時間 ${minutes}分`
    },
    
    // 応答時間
    averageResponseTime: stats.averageResponseTime.toFixed(2),
    
    // 最近のエラー
    recentErrors: stats.lastErrors.slice(0, 5)
  };
}
