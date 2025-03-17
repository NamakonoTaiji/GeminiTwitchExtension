/**
 * Twitch Gemini Translator DOM監視ユーティリティ
 * 
 * このファイルは、DOM要素の監視と操作に関連する共通機能を提供します。
 * MutationObserverの設定や要素探索などの機能をまとめています。
 */

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
export function createMutationObserver(nodeProcessor, requestDelay, isInGracePeriod) {
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
        // グレースピリオド中に追加されたノードは「既存メッセージ」として分類する
        // グレースピリオドが終了している場合のみ「新規メッセージ」としてマーク
        if (!isInGracePeriod) {
          node._isNewMessage = true;
        } else {
          node._isExistingMessage = true;
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
 * チャンネル変更を検出するためのURL監視を設定
 * @param {function} changeHandler URLが変更されたときのコールバック
 * @param {number} checkInterval チェック間隔(ms)
 * @returns {object} {start: function, stop: function} 監視の開始と停止関数
 */
export function createUrlChangeDetector(changeHandler, checkInterval = 2000) {
  let lastUrl = location.href;
  let urlCheckInterval = null;
  
  // 監視開始関数
  const start = () => {
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
    }
    
    lastUrl = location.href;
    
    urlCheckInterval = setInterval(() => {
      const currentUrl = location.href;
      
      // URLが変更された場合
      if (currentUrl !== lastUrl) {
        const previousUrl = lastUrl;
        lastUrl = currentUrl;
        
        // コールバックを呼び出し
        changeHandler(previousUrl, currentUrl);
      }
    }, checkInterval);
    
    return lastUrl;
  };
  
  // 監視停止関数
  const stop = () => {
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }
  };
  
  return { start, stop, getCurrentUrl: () => lastUrl };
}
