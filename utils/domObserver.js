/**
 * Twitch Gemini Translator DOM監視ユーティリティ
 * 
 * このファイルは、DOM要素の監視と操作に関連する共通機能を提供します。
 * MutationObserverの設定や要素探索などの機能をまとめています。
 */

/**
 * 指定されたURLがTwitchのチャンネルページかどうかを判定する
 * @param {string} url 判定するURL
 * @returns {boolean} チャンネルページならtrue、そうでなければfalse
 */
export function isTwitchChannelPage(url) {
  try {
    // URLを解析
    const urlObj = new URL(url);
    
    // トップレベルのパスセグメントを取得
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    
    // チャンネルページではないと判断するパターン
    const nonChannelPatterns = [
      'directory', 'settings', 'inventory', 'subscriptions',
      'wallet', 'friends', 'downloads', 'store', 'products',
      'turbo', 'prime', 'notifications', 'popout', 'videos',
      'clips', 'about', 'schedule', 'moderator', 'p'
    ];
    
    // 以下の条件を満たす場合、チャンネルページと判断
    // 1. パスが空ではない（トップページではない）
    // 2. 最初のパスセグメントが非チャンネルパターンに含まれない
    // 3. パスセグメントが1つ以上ある（チャンネル名が含まれている）
    return pathSegments.length > 0 && !nonChannelPatterns.includes(pathSegments[0]);
  } catch (error) {
    console.error('URL判定エラー:', error);
    return false; // エラーが発生した場合は安全側に値を返す
  }
}

/**
 * 指定されたURLからチャンネル名を抽出する
 * @param {string} url チャンネル名を抽出するURL
 * @returns {string|null} チャンネル名またはnull
 */
export function extractChannelName(url) {
  try {
    // URLを解析
    const urlObj = new URL(url);
    
    // パスをセグメントに分割
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    
    // チャンネルページでない場合はnullを返す
    if (!isTwitchChannelPage(url)) {
      return null;
    }
    
    // 最初のパスセグメントがチャンネル名
    return pathSegments.length > 0 ? pathSegments[0] : null;
  } catch (error) {
    console.error('チャンネル名抽出エラー:', error);
    return null;
  }
}

/**
 * Twitchチャットコンテナを探して返す
 * @returns {Element|null} チャットコンテナまたはnull
 */
export function findChatContainer() {
  // メインのチャットコンテナセレクタ
  return document.querySelector(
    '[data-test-selector="chat-scrollable-area__message-container"]'
  );
}

/**
 * すべての既存チャットメッセージを取得
 * @returns {Element[]} 既存メッセージの配列
 */
export function getAllExistingMessages() {
  const container = findChatContainer();
  if (!container) return [];
  
  return Array.from(container.children);
}

/**
 * 既存メッセージにフラグを設定する
 * @param {boolean} clearNewFlag _isNewMessageフラグを削除するか
 * @returns {number} 処理したメッセージ数
 */
export function markExistingMessages(clearNewFlag = true) {
  const messages = getAllExistingMessages();
  
  messages.forEach((element) => {
    // グレースピリオド中に読み込まれたメッセージには _isNewMessage フラグがあるかもしれないので削除
    if (clearNewFlag) {
      delete element._isNewMessage;
    }
    // 明示的に既存メッセージと記録
    element._isExistingMessage = true;
  });
  
  return messages.length;
}

/**
 * DOM変更を監視するためのMutationObserverを作成
 * @param {function} nodeProcessor 追加ノードを処理するコールバック関数
 * @param {number} requestDelay リクエスト間の最小遅延(ms)
 * @param {boolean} isInGracePeriod グレースピリオド中かどうか
 * @returns {MutationObserver} 設定済みのMutationObserver
 */
export function createMutationObserver(nodeProcessor, requestDelay = 100, isInGracePeriod = false) {
  // 引数からグレースピリオド状態を取得
  // isInGracePeriodは引数から渡されるため、その値を使用
  const gracePeriodActive = isInGracePeriod || false;
  return new MutationObserver((mutations) => {
    // 新規メッセージの処理間隔を開けるためのスロットリング
    const addedNodes = [];

    // 変更箇所から追加ノードを収集
    mutations.forEach((mutation) => {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            addedNodes.push(node);
          }
        });
      }
    });

    // 収集したノードを遅延を付けて処理
    addedNodes.forEach((node, index) => {
      setTimeout(() => {
        // グレースピリオド状態を参照
        const currentGracePeriod = gracePeriodActive;
        
        if (currentGracePeriod) {
          // グレースピリオド中はすべて既存メッセージとしてマーク
          node._isExistingMessage = true;
          // 新規メッセージフラグを明示的に削除
          delete node._isNewMessage;
          
          // デバッグ用にグレースピリオド中の既存メッセージと記録
          node._addedDuringGracePeriod = true;
        } else {
          // グレースピリオド中でない場合は新規メッセージ
          node._isNewMessage = true;
          // 既存メッセージフラグを明示的に削除
          delete node._isExistingMessage;
        }
        
        // ノード処理関数を呼び出し
        nodeProcessor(node);
      }, index * requestDelay); // リクエスト間の最小遅延
    });
  });
}

/**
 * メッセージ要素を特定
 * @param {Element} node 検査するノード
 * @returns {Element|null} メッセージ要素またはnull
 */
export function getMessageElement(node) {
  if (!node) return null;

  const isMessageElement = node.classList && node.classList.contains("chat-line__message");
  return isMessageElement ? node : node.querySelector(".chat-line__message");
}

/**
 * メッセージIDを取得
 * @param {Element} messageElement メッセージ要素
 * @returns {string} メッセージID
 */
export function getMessageId(messageElement) {
  if (!messageElement) return Date.now().toString();
  
  return messageElement.getAttribute("data-message-id") ||
         messageElement.getAttribute("id") ||
         Date.now().toString(); // 属性がない場合はタイムスタンプを使用
}

/**
 * 高度なURL変更検出機能を提供する
 * @param {Function} changeHandler URL変更時に呼び出すコールバック関数
 * @param {Object} options 設定オプション
 * @returns {Object} 監視制御API
 */
export function createAdvancedUrlChangeDetector(changeHandler, options = {}) {
  // デフォルトオプション
  const defaultOptions = {
    checkInterval: 2000,         // ポーリング間隔（0で無効）
    useHistoryApi: true,         // History APIをオーバーライドするか
    useHashChange: true,         // hashchangeイベントを監視するか
    usePopState: true,           // popstateイベントを監視するか
    comparePathOnly: false,      // パス部分のみを比較するか
    debug: false                 // デバッグモード
  };
  
  // オプションをマージ
  const config = { ...defaultOptions, ...options };
  
  // 状態管理
  let lastUrl = location.href;
  let lastPath = location.pathname;
  let urlCheckInterval = null;
  let isActive = false;
  
  // URL解析ユーティリティ
  function parseUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return {
        full: parsedUrl.href,
        path: parsedUrl.pathname,
        query: parsedUrl.search,
        hash: parsedUrl.hash,
        host: parsedUrl.host
      };
    } catch (error) {
      console.error('URL解析エラー:', error);
      return { full: url, path: '', query: '', hash: '', host: '' };
    }
  }
  
  // URLの重要な部分を比較
  function isUrlChanged(currentUrl) {
    if (config.comparePathOnly) {
      // パス部分のみを比較
      return location.pathname !== lastPath;
    }
    // 完全なURLを比較
    return currentUrl !== lastUrl;
  }
  
  // イベントがトリガーされたときに共通して実行する処理
  function handleUrlChange(source = 'unknown') {
    try {
      const currentUrl = location.href;
      const currentPath = location.pathname;
      
      // URLの重要な部分が変更された場合のみ処理
      if (isUrlChanged(currentUrl)) {
        const previousUrl = lastUrl;
        const previousPath = lastPath;
        
        // 現在のURLを更新
        lastUrl = currentUrl;
        lastPath = currentPath;
        
        // デバッグログ
        if (config.debug) {
          console.log(`URL変更検出 [source: ${source}]:`, {
            previous: parseUrl(previousUrl),
            current: parseUrl(currentUrl)
          });
        }
        
        // コールバックを呼び出し
        changeHandler(previousUrl, currentUrl, source);
      }
    } catch (error) {
      console.error('URL変更ハンドリングエラー:', error);
    }
  }
  
  // 各イベントソース用のハンドラー
  const handlers = {
    pushState: () => handleUrlChange('pushState'),
    replaceState: () => handleUrlChange('replaceState'),
    popstate: () => handleUrlChange('popState'),
    hashchange: () => handleUrlChange('hashChange'),
    polling: () => handleUrlChange('polling')
  };
  
  // History APIのオーバーライド関数
  function overrideHistoryApi() {
    // まだオーバーライドされていない場合のみ実行
    if (window._historyApiOverridden) {
      if (config.debug) {
        console.log('History APIは既にオーバーライドされています');
      }
      return;
    }
    
    try {
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      // pushStateをオーバーライド
      history.pushState = function(...args) {
        const result = originalPushState.apply(this, args);
        window.dispatchEvent(new CustomEvent('locationchangepushstate'));
        return result;
      };
      
      // replaceStateをオーバーライド
      history.replaceState = function(...args) {
        const result = originalReplaceState.apply(this, args);
        window.dispatchEvent(new CustomEvent('locationchangereplacestate'));
        return result;
      };
      
      // フラグを設定して二重オーバーライドを防止
      window._historyApiOverridden = true;
      
      if (config.debug) {
        console.log('History APIのオーバーライドが完了しました');
      }
    } catch (error) {
      console.error('History APIオーバーライドエラー:', error);
    }
  }
  
  // 監視開始関数
  const start = () => {
    if (isActive) {
      if (config.debug) {
        console.log('URL変更検出は既に有効です');
      }
      return lastUrl;
    }
    
    if (config.debug) {
      console.log('URL変更検出を開始します', config);
    }
    
    // History APIをオーバーライド（設定で有効な場合）
    if (config.useHistoryApi) {
      overrideHistoryApi();
    }
    
    // 現在のURLを記録
    lastUrl = location.href;
    lastPath = location.pathname;
    
    // 各種イベントリスナーを設定
    if (config.usePopState) {
      window.addEventListener('popstate', handlers.popstate);
    }
    
    if (config.useHashChange) {
      window.addEventListener('hashchange', handlers.hashchange);
    }
    
    if (config.useHistoryApi) {
      window.addEventListener('locationchangepushstate', handlers.pushState);
      window.addEventListener('locationchangereplacestate', handlers.replaceState);
    }
    
    // フォールバックとしてのインターバルチェック
    if (config.checkInterval > 0) {
      urlCheckInterval = setInterval(handlers.polling, config.checkInterval);
    }
    
    isActive = true;
    return lastUrl;
  };
  
  // 監視停止関数
  const stop = () => {
    if (!isActive) {
      if (config.debug) {
        console.log('URL変更検出は既に停止しています');
      }
      return;
    }
    
    if (config.debug) {
      console.log('URL変更検出を停止します');
    }
    
    // イベントリスナーを削除
    if (config.usePopState) {
      window.removeEventListener('popstate', handlers.popstate);
    }
    
    if (config.useHashChange) {
      window.removeEventListener('hashchange', handlers.hashchange);
    }
    
    if (config.useHistoryApi) {
      window.removeEventListener('locationchangepushstate', handlers.pushState);
      window.removeEventListener('locationchangereplacestate', handlers.replaceState);
    }
    
    // インターバル監視を停止
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }
    
    isActive = false;
  };
  
  // URLの各部分を取得するユーティリティ
  const getUrlParts = () => parseUrl(lastUrl);
  
  return { 
    start, 
    stop, 
    getCurrentUrl: () => lastUrl,
    getCurrentPath: () => lastPath,
    getUrlParts,
    isActive: () => isActive,
    refresh: () => {
      lastUrl = location.href;
      lastPath = location.pathname;
      return lastUrl;
    }
  };
}

/**
 * チャンネル変更を検出するためのURL監視を設定（レガシー互換性）
 * 内部的には高度な実装を使用します
 * @param {function} changeHandler URLが変更されたときのコールバック
 * @param {number} checkInterval チェック間隔(ms)
 * @returns {object} {start: function, stop: function} 監視の開始と停止関数
 */
export function createUrlChangeDetector(changeHandler, checkInterval = 2000) {
  // 下位互換性のために3つ目の引数を捨てる関数を作成
  const compatHandler = (prevUrl, currentUrl, _source) => {
    changeHandler(prevUrl, currentUrl);
  };
  
  // 内部で新しい実装を使用
  const detector = createAdvancedUrlChangeDetector(compatHandler, { 
    checkInterval,
    debug: false // デフォルトでデバッグは無効
  });
  
  // 元のAPIと互換性のあるインターフェースを返す
  return {
    start: detector.start,
    stop: detector.stop,
    getCurrentUrl: detector.getCurrentUrl
  };
}