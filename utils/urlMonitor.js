/**
 * URL監視モジュール
 * 
 * SPAのURL変更を検出するための複数のメカニズムを提供します。
 * - History API (`pushState`, `replaceState`) のオーバーライド
 * - `popstate` イベントの監視
 * - ハッシュ変更の監視
 * - 定期的なURL確認（ポーリング）
 */

// モジュールの状態
const state = {
  initialized: false,
  lastDetectedUrl: window.location.href,
  lastCheckedUrl: window.location.href,
  callbacks: [],
  pollingInterval: null,
  pollingFrequency: 1000, // 1秒ごとのポーリング
  debug: false
};

/**
 * URLモニターを初期化
 * @param {Object} options 初期化オプション
 * @param {Function} [options.onUrlChanged] URL変更時のコールバック
 * @param {number} [options.pollingFrequency=1000] ポーリング頻度（ミリ秒）
 * @param {boolean} [options.debug=false] デバッグモード
 */
export function initUrlMonitor(options = {}) {
  // 二重初期化を防止
  if (state.initialized) {
    console.log('[UrlMonitor] 既に初期化されています');
    return;
  }
  
  // オプションを設定
  if (options.onUrlChanged) {
    state.callbacks.push(options.onUrlChanged);
  }
  
  if (options.pollingFrequency) {
    state.pollingFrequency = options.pollingFrequency;
  }
  
  state.debug = options.debug || false;
  
  // History APIをオーバーライド
  overrideHistoryApi();
  
  // イベントリスナーを設定
  setupEventListeners();
  
  // ポーリングを開始
  startUrlPolling();
  
  state.initialized = true;
  debugLog('URL監視を開始しました', { initialUrl: state.lastDetectedUrl });
}

/**
 * URL変更時にコールバックを呼び出す
 * @param {string} url 変更後のURL
 * @param {string} method 検出方法
 */
function notifyUrlChanged(url, method) {
  // URLが変更されていない場合は無視
  if (url === state.lastDetectedUrl) {
    return;
  }
  
  debugLog(`URL変更を検出: ${state.lastDetectedUrl} -> ${url} (${method})`);
  
  // 最後に検出したURLを更新
  state.lastDetectedUrl = url;
  
  // 登録されたコールバックを呼び出し
  state.callbacks.forEach(callback => {
    try {
      callback(url, method);
    } catch (error) {
      console.error('[UrlMonitor] コールバック実行エラー:', error);
    }
  });
  
  // バックグラウンドスクリプトに通知
  notifyBackgroundScript(url, method);
}

/**
 * バックグラウンドスクリプトにURL変更を通知
 * @param {string} url 変更後のURL
 * @param {string} method 検出方法
 */
function notifyBackgroundScript(url, method) {
  try {
    chrome.runtime.sendMessage({
      action: 'urlChanged',
      url,
      method,
      timestamp: Date.now()
    }).catch(error => {
      // エラーはログのみ（拡張機能のコンテキストが無効になっている可能性）
      debugLog('バックグラウンドへの通知エラー:', error);
    });
  } catch (error) {
    debugLog('バックグラウンドへの通知例外:', error);
  }
}

/**
 * History APIをオーバーライド
 */
function overrideHistoryApi() {
  try {
    // オリジナルのメソッドを保存
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    // pushStateをオーバーライド
    history.pushState = function(state, title, url) {
      // オリジナルのメソッドを呼び出す
      originalPushState.apply(this, arguments);
      
      // URL変更を通知
      if (url) {
        // 相対URLの場合は絶対URLに変換
        const absoluteUrl = new URL(url, window.location.origin).href;
        notifyUrlChanged(absoluteUrl, 'pushState');
      } else {
        notifyUrlChanged(window.location.href, 'pushState');
      }
    };
    
    // replaceStateをオーバーライド
    history.replaceState = function(state, title, url) {
      // オリジナルのメソッドを呼び出す
      originalReplaceState.apply(this, arguments);
      
      // URL変更を通知
      if (url) {
        // 相対URLの場合は絶対URLに変換
        const absoluteUrl = new URL(url, window.location.origin).href;
        notifyUrlChanged(absoluteUrl, 'replaceState');
      } else {
        notifyUrlChanged(window.location.href, 'replaceState');
      }
    };
    
    debugLog('History APIをオーバーライドしました');
  } catch (error) {
    console.error('[UrlMonitor] History APIオーバーライドエラー:', error);
  }
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
  try {
    // popstateイベント（戻る/進むボタン）
    window.addEventListener('popstate', () => {
      notifyUrlChanged(window.location.href, 'popstate');
    });
    
    // hashchangeイベント（ハッシュ変更）
    window.addEventListener('hashchange', () => {
      notifyUrlChanged(window.location.href, 'hashchange');
    });
    
    debugLog('イベントリスナーを設定しました');
  } catch (error) {
    console.error('[UrlMonitor] イベントリスナー設定エラー:', error);
  }
}

/**
 * 定期的なURL確認（ポーリング）を開始
 */
function startUrlPolling() {
  // 既存のポーリングをクリア
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
  }
  
  // 新しいポーリングを開始
  state.pollingInterval = setInterval(() => {
    const currentUrl = window.location.href;
    
    // ポーリングの最終チェックからURLが変わっている場合
    if (currentUrl !== state.lastCheckedUrl) {
      state.lastCheckedUrl = currentUrl;
      
      // 最後に検出したURLと異なる場合のみ通知
      if (currentUrl !== state.lastDetectedUrl) {
        notifyUrlChanged(currentUrl, 'polling');
      }
    }
  }, state.pollingFrequency);
  
  debugLog(`URL ポーリングを開始しました (${state.pollingFrequency}ms)`);
}

/**
 * URLモニターにコールバックを追加
 * @param {Function} callback URL変更時に呼び出すコールバック
 */
export function addUrlChangeCallback(callback) {
  if (typeof callback === 'function') {
    state.callbacks.push(callback);
    debugLog('URLコールバックを追加しました');
  }
}

/**
 * URLモニターからコールバックを削除
 * @param {Function} callback 削除するコールバック
 */
export function removeUrlChangeCallback(callback) {
  const index = state.callbacks.indexOf(callback);
  if (index !== -1) {
    state.callbacks.splice(index, 1);
    debugLog('URLコールバックを削除しました');
  }
}

/**
 * URLモニターを停止
 */
export function stopUrlMonitor() {
  if (!state.initialized) {
    return;
  }
  
  // ポーリングをクリア
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }
  
  // History APIのオーバーライドを解除（難しいため、実装しない）
  
  // イベントリスナーは削除しない（誤動作の可能性を避けるため）
  
  state.initialized = false;
  debugLog('URL監視を停止しました');
}

/**
 * デバッグログを出力
 * @param {string} message メッセージ
 * @param {any} data 追加データ
 */
function debugLog(message, data = null) {
  if (state.debug) {
    if (data) {
      console.log(`[UrlMonitor] ${message}`, data);
    } else {
      console.log(`[UrlMonitor] ${message}`);
    }
  }
}
