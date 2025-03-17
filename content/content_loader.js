/**
 * Twitch Gemini Translator - コンテンツローダー
 *
 * このスクリプトは、Twitchページに読み込まれ、チャットメッセージを監視し、
 * 翻訳機能を提供します。
 */

// 設定とデフォルト値
const DEFAULT_SETTINGS = {
  enabled: true,
  targetLanguage: "ja",
  showOriginal: true,
  translationDelay: 300,
  maxConcurrentRequests: 5,
  debugMode: false,
};

// アプリケーションの状態
const appState = {
  initialized: false,
  enabled: true,
  settings: { ...DEFAULT_SETTINGS },
  processingMessages: new Set(),
  observerActive: false,
  channelName: getChannelFromUrl(),
  lastMessageTime: 0,
  debugMode: true, // デバッグモードを有効化
};

// 翻訳済みメッセージのキャッシュ
const translatedMessages = new Map();

/**
 * デバッグログを出力
 * @param {string} message メッセージ
 * @param {any} data 追加データ
 */
function debugLog(message, data = null) {
  if (appState.debugMode) {
    if (data) {
      console.log(`[Twitch Translator Debug] ${message}`, data);
    } else {
      console.log(`[Twitch Translator Debug] ${message}`);
    }
  }
}

/**
 * 拡張機能を初期化
 */
async function initializeExtension() {
  try {
    console.log("[Twitch Translator] 初期化中...");
    
    // 設定を取得
    const response = await sendMessageToBackground("getSettings");
    if (response && response.success) {
      appState.settings = { ...DEFAULT_SETTINGS, ...response.settings };
      appState.debugMode = appState.settings.debugMode || true; // 常にデバッグモードを有効化（開発中）
    }
    
    // 拡張機能の状態を取得
    const statusResponse = await sendMessageToBackground("getStatus");
    if (statusResponse && statusResponse.success) {
      appState.enabled = statusResponse.status.enabled;
    }
    
    // 自動オン/オフ機能の確認
    if (appState.settings.autoToggle && appState.settings.apiKey) {
      // URL判定のためにバックグラウンドに確認
      const urlCheckResponse = await sendMessageToBackground("checkCurrentUrl", {
        url: window.location.href
      });
      
      if (urlCheckResponse && urlCheckResponse.success) {
        console.log(`[Twitch Translator] URL判定: ${window.location.href} => ${urlCheckResponse.isStreamPage ? '配信ページ' : '非配信ページ'}`);
        
        // URL判定に基づいてステータスを更新
        if (urlCheckResponse.isStreamPage !== appState.enabled) {
          console.log(`[Twitch Translator] URL判定に基づいて状態を更新: ${urlCheckResponse.isStreamPage ? '有効' : '無効'}に設定`);
          appState.enabled = urlCheckResponse.isStreamPage;
        }
      }
    }
    
    // 初期化完了
    appState.initialized = true;
    
    // 拡張機能が有効な場合は既存のメッセージを処理
    if (appState.enabled) {
      processExistingMessages();
      
      // チャット監視を開始
      startChatObserver();
    } else {
      console.log("[Twitch Translator] 拡張機能は非配信ページのため無効化されています")
    }
    
    console.log("[Twitch Translator] 初期化完了", {
      enabled: appState.enabled,
      settings: appState.settings,
    });
    
    return true;
  } catch (error) {
    console.error("[Twitch Translator] 初期化エラー:", error);
    return false;
  }
}

/**
 * バックグラウンドスクリプトにメッセージを送信
 * @param {string} action アクション名
 * @param {object} data 追加データ
 * @returns {Promise<object>} レスポンス
 */
function sendMessageToBackground(action, data = {}) {
  return new Promise((resolve, reject) => {
    try {
      debugLog(`バックグラウンドにメッセージを送信: ${action}`, data);

      chrome.runtime.sendMessage({ action, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            `[Twitch Translator] メッセージ送信エラー (${action}):`,
            chrome.runtime.lastError
          );
          reject(chrome.runtime.lastError);
        } else {
          debugLog(`バックグラウンドからの応答: ${action}`, response);
          resolve(response);
        }
      });
    } catch (error) {
      console.error(
        `[Twitch Translator] メッセージ送信例外 (${action}):`,
        error
      );
      reject(error);
    }
  });
}

/**
 * チャットメッセージを監視するObserverを開始
 */
function startChatObserver() {
  if (appState.observerActive) return;

  debugLog("チャットコンテナの検索を開始");

  // チャットコンテナを取得（複数のセレクタを試行）
  const selectors = [
    ".chat-scrollable-area__message-container",
    ".chat-list--default",
    ".chat-list",
    '[data-test-selector="chat-scrollable-area__message-container"]',
    '[data-a-target="chat-scroller"]',
  ];

  let chatContainer = null;
  for (const selector of selectors) {
    chatContainer = document.querySelector(selector);
    if (chatContainer) {
      debugLog(`チャットコンテナを発見: ${selector}`);
      break;
    }
  }

  if (!chatContainer) {
    console.log(
      "[Twitch Translator] チャットコンテナが見つかりません。後で再試行します。"
    );
    setTimeout(startChatObserver, 2000);
    return;
  }

  // MutationObserverを作成
  const observer = new MutationObserver((mutations) => {
    if (!appState.enabled) return;

    debugLog(`変更を検出: ${mutations.length}個の変更`);

    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        debugLog(`子要素の追加を検出: ${mutation.addedNodes.length}個`);

        for (const node of mutation.addedNodes) {
          // 複数のクラス名パターンを試行
          const isMessage =
            (node.classList && node.classList.contains("chat-line__message")) ||
            (node.classList && node.classList.contains("chat-line")) ||
            (node.classList && node.classList.contains("message")) ||
            (node.nodeType === Node.ELEMENT_NODE &&
              node.querySelector(".chat-line__message")) ||
            (node.nodeType === Node.ELEMENT_NODE &&
              node.querySelector(".message"));

          if (isMessage) {
            debugLog("チャットメッセージを検出:", node);
            const messageElement =
              node.classList && node.classList.contains("chat-line__message")
                ? node
                : node.querySelector(".chat-line__message");

            if (messageElement) {
              processMessage(messageElement);
            } else {
              processMessage(node); // 直接ノードを処理
            }
          }
        }
      }
    }
  });

  // 監視を開始
  observer.observe(chatContainer, { childList: true, subtree: true });
  appState.observerActive = true;

  console.log("[Twitch Translator] チャット監視を開始しました");
}

/**
 * 既存のチャットメッセージを処理
 */
function processExistingMessages() {
  if (!appState.enabled) return;

  // 複数のセレクタを試行
  const selectors = [
    ".chat-line__message",
    ".chat-line",
    ".message",
    '[data-a-target="chat-line-message"]',
  ];

  let messages = [];
  for (const selector of selectors) {
    const found = document.querySelectorAll(selector);
    if (found && found.length > 0) {
      messages = found;
      debugLog(`既存メッセージを発見: ${selector} (${found.length}件)`);
      break;
    }
  }

  if (messages.length > 0) {
    console.log(
      `[Twitch Translator] ${messages.length}件の既存メッセージを処理します`
    );

    // 最新の20件のみ処理（パフォーマンスのため）
    const recentMessages = Array.from(messages).slice(-20);
    recentMessages.forEach((message) => {
      processMessage(message);
    });
  } else {
    debugLog("既存メッセージが見つかりませんでした");
  }
}

/**
 * チャットメッセージを処理
 * @param {Element} messageElement メッセージ要素
 */
async function processMessage(messageElement) {
  if (!appState.enabled || !messageElement) return;

  try {
    debugLog("メッセージ処理開始:", messageElement);

    // メッセージIDを取得
    const messageId =
      messageElement.id ||
      messageElement.getAttribute("data-message-id") ||
      Date.now().toString();

    // 既に処理中または処理済みの場合はスキップ
    if (
      appState.processingMessages.has(messageId) ||
      messageElement.querySelector(".twitch-translator-translation")
    ) {
      debugLog(`メッセージはすでに処理中または処理済み: ${messageId}`);
      return;
    }

    // 処理中としてマーク
    appState.processingMessages.add(messageId);

    // メッセージテキストを取得（複数のセレクタを試行）
    const selectors = [
      ".chat-line__message-container",
      ".message-container",
      ".chat-line__message",
      ".message",
    ];

    let messageContainer = null;
    for (const selector of selectors) {
      messageContainer =
        messageElement.querySelector(selector) ||
        (messageElement.classList &&
        messageElement.classList.contains(selector.substring(1))
          ? messageElement
          : null);
      if (messageContainer) {
        debugLog(`メッセージコンテナを発見: ${selector}`);
        break;
      }
    }

    if (!messageContainer) {
      debugLog("メッセージコンテナが見つかりません", messageElement);
      appState.processingMessages.delete(messageId);
      return;
    }

    // ユーザー名を取得（複数のセレクタを試行）
    const usernameSelectors = [
      ".chat-author__display-name",
      ".chat-author",
      ".username",
      '[data-a-target="chat-message-username"]',
    ];

    let username = "不明なユーザー";
    for (const selector of usernameSelectors) {
      const usernameElement = messageElement.querySelector(selector);
      if (usernameElement) {
        username = usernameElement.textContent.trim();
        debugLog(`ユーザー名を発見: ${username} (${selector})`);
        break;
      }
    }

    // メッセージ本文を取得（複数のセレクタを試行）
    const messageBodySelectors = [
      ".text-fragment",
      ".message-text",
      ".chat-line__message-body",
      '[data-a-target="chat-message-text"]',
    ];

    let messageBody = null;
    for (const selector of messageBodySelectors) {
      messageBody = messageElement.querySelector(selector);
      if (messageBody) {
        debugLog(`メッセージ本文を発見: ${selector}`);
        break;
      }
    }

    if (!messageBody) {
      debugLog("メッセージ本文が見つかりません", messageElement);
      appState.processingMessages.delete(messageId);
      return;
    }

    const messageText = messageBody.textContent.trim();
    if (!messageText || messageText.length < 2) {
      debugLog(`メッセージ本文が空または短すぎます: "${messageText}"`);
      appState.processingMessages.delete(messageId);
      return;
    }

    debugLog(`処理するメッセージ: ${username} - "${messageText}"`);

    // キャッシュをチェック
    if (translatedMessages.has(messageText)) {
      debugLog(
        "キャッシュから翻訳を取得:",
        translatedMessages.get(messageText)
      );
      displayTranslation(messageElement, translatedMessages.get(messageText));
      appState.processingMessages.delete(messageId);
      return;
    }

    // 翻訳リクエスト
    try {
      debugLog("翻訳リクエストを送信:", messageText);
      const response = await sendMessageToBackground("translateMessage", {
        message: messageText,
      });

      if (response && response.success) {
        // 翻訳をキャッシュ
        translatedMessages.set(messageText, response.translation);
        debugLog("翻訳結果を受信:", response.translation);

        // 表示オプションを設定
        const displayOptions = {
          model: response.model || "Gemini",
          sourceLanguage: response.sourceLanguage || "unknown",
        };

        // 翻訳を表示
        displayTranslation(
          messageElement,
          response.translation,
          displayOptions
        );
      } else {
        console.warn(
          "[Twitch Translator] 翻訳エラー:",
          response?.error || "不明なエラー"
        );
      }
    } catch (error) {
      console.error("[Twitch Translator] 翻訳リクエスト例外:", error);
    }

    // 処理完了
    appState.processingMessages.delete(messageId);
  } catch (error) {
    console.error("[Twitch Translator] メッセージ処理エラー:", error);
  }
}

/**
 * 翻訳を表示
 * @param {Element} messageElement メッセージ要素
 * @param {string} translation 翻訳テキスト
 * @param {object} options 表示オプション
 */
function displayTranslation(messageElement, translation, options = {}) {
  if (!messageElement || !translation) return;

  try {
    debugLog("翻訳を表示:", translation);

    // 設定の取得とデフォルト値の設定
    const displaySettings = {
      prefix: appState.settings.displayPrefix || "🇯🇵",
      textColor: appState.settings.textColor || "#9b9b9b",
      accentColor: appState.settings.accentColor || "#4db6ac",
      fontSize: appState.settings.fontSize || "medium",
      ...options,
    };

    // フォントサイズを決定
    let fontSizeValue = "0.9em";
    switch (displaySettings.fontSize) {
      case "small":
        fontSizeValue = "0.8em";
        break;
      case "medium":
        fontSizeValue = "0.9em";
        break;
      case "large":
        fontSizeValue = "1em";
        break;
    }

    // 翻訳エンジン情報を取得
    const modelInfo = options.model || "Gemini";

    // 既に翻訳が表示されている場合は更新
    const existingTranslation = messageElement.querySelector(
      ".twitch-translator-translation"
    );
    if (existingTranslation) {
      existingTranslation.textContent = `${displaySettings.prefix} ${translation}`;
      debugLog("既存の翻訳を更新しました");
      return;
    }

    // 翻訳表示要素を作成
    const translationElement = document.createElement("div");
    translationElement.className = "twitch-translator-translation";
    translationElement.textContent = `${displaySettings.prefix} ${translation}`;

    // スタイルを設定
    translationElement.style.color = displaySettings.textColor;
    translationElement.style.fontSize = fontSizeValue;
    translationElement.style.marginTop = "4px";
    translationElement.style.marginLeft = "20px";
    translationElement.style.fontStyle = "italic";
    translationElement.style.padding = "2px 0";
    translationElement.style.borderLeft = `3px solid ${displaySettings.accentColor}`;
    translationElement.style.paddingLeft = "8px";

    // メッセージコンテナを取得（複数のセレクタを試行）
    const containerSelectors = [
      ".chat-line__message-container",
      ".message-container",
      ".chat-line__message",
      ".message",
    ];

    let messageContainer = null;
    for (const selector of containerSelectors) {
      messageContainer =
        messageElement.querySelector(selector) ||
        (messageElement.classList &&
        messageElement.classList.contains(selector.substring(1))
          ? messageElement
          : null);
      if (messageContainer) {
        debugLog(`翻訳表示用コンテナを発見: ${selector}`);
        break;
      }
    }

    if (messageContainer) {
      // 翻訳を挿入
      messageContainer.appendChild(translationElement);
      debugLog("翻訳を挿入しました");
    } else {
      // 代替手段としてメッセージ要素の後に掛ける
      try {
        if (messageElement.parentElement) {
          messageElement.parentElement.insertBefore(
            translationElement,
            messageElement.nextSibling
          );
          debugLog("代替手段で翻訳を挿入しました");
        } else {
          debugLog("翻訳表示用コンテナが見つかりません", messageElement);
        }
      } catch (error) {
        console.error("[Twitch Translator] 代替手段での翻訳挿入エラー:", error);
      }
    }
  } catch (error) {
    console.error("[Twitch Translator] 翻訳表示エラー:", error);
  }
}

/**
 * URLからチャンネル名を取得
 * @returns {string} チャンネル名
 */
function getChannelFromUrl() {
  const match = location.pathname.match(/^\/([^\/]+)/);
  return match ? match[1] : "";
}

/**
 * ページURLの変更を監視
 */
function watchForUrlChanges() {
  let lastUrl = location.href;

  // 定期的にURLをチェック
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;

      // チャンネル名を更新
      appState.channelName = getChannelFromUrl();

      // 監視を再開
      appState.observerActive = false;
      setTimeout(() => {
        startChatObserver();
        processExistingMessages();
      }, 1000);

      console.log("[Twitch Translator] ページが変更されました:", location.href);
    }
  }, 2000);
}

/**
 * バックグラウンドからのメッセージを処理
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    debugLog("バックグラウンドからメッセージを受信:", message);

    if (message.action === "settingsUpdated") {
      // 設定が更新された
      appState.settings = { ...DEFAULT_SETTINGS, ...message.settings };
      appState.enabled = message.settings.enabled;
      appState.debugMode = appState.settings.debugMode || true; // 常にデバッグモードを有効化（開発中）
      console.log(
        "[Twitch Translator] 設定が更新されました",
        appState.settings
      );
      sendResponse({ success: true });
    } else if (message.action === "apiKeyUpdated") {
      // APIキーが更新された
      console.log("[Twitch Translator] APIキーが更新されました");
      sendResponse({ success: true });
    }
  } catch (error) {
    console.error("[Twitch Translator] メッセージ処理エラー:", error);
    sendResponse({ success: false, error: error.message });
  }

  return true; // 非同期レスポンスを有効化
});

// 拡張機能を初期化
console.log("[Twitch Translator] コンテンツローダーを起動します");
initializeExtension();

// URL変更監視を開始
watchForUrlChanges();

// 初期化が失敗した場合のフォールバック
setTimeout(() => {
  if (!appState.initialized) {
    console.log("[Twitch Translator] 初期化タイムアウト - 再試行します");
    initializeExtension();
  }
}, 5000);
