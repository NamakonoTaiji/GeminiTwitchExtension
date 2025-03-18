// Twitch Gemini Translator: メインコンテンツスクリプト

// ユーティリティモジュールのインポート
import { 
  debounce, 
  saveToLocalStorage, 
  loadFromLocalStorage, 
  getDefaultSettings, 
  logError
} from '../utils/utils.js';

import {
  shouldTranslateBasedOnMode,
  extractMessageText,
  sendTranslationRequest,
  displayTranslation
} from '../utils/language.js';

import {
  findChatContainer,
  getAllExistingMessages,
  markExistingMessages,
  createMutationObserver,
  getMessageElement,
  getMessageId,
  createUrlChangeDetector,
  createAdvancedUrlChangeDetector,
  isTwitchChannelPage,
  extractChannelName
} from '../utils/domObserver.js';

import {
  setSessionFlag,
  getSessionFlag,
  removeSessionFlag,
  incrementSessionCounter,
  setChannelChangedFlag,
  hasChannelChanged,
  isExistingMessagesPreventionActive,
  checkContextInvalidationStatus,
  manageRetryCounter,
  setGracePeriodState,
  isInGracePeriod
} from '../utils/session.js';

console.log("Twitch Gemini Translator: コンテンツスクリプトが起動しました");

// 拡張機能の状態
let isEnabled = false;
let apiKeySet = false;
let observer = null;

// チャンネル切り替え後のグレースピリオドを管理
let gracePeriodTimer = null;
const GRACE_PERIOD_DURATION = 5000; // 5秒間

// 設定
let settings = getDefaultSettings();

// 翻訳済みコメントを追跡するMap
const translatedComments = new Map();

// URLの変更を監視するための高度なデテクタを作成
const urlChangeDetector = createAdvancedUrlChangeDetector(
  (previousUrl, currentUrl, source) => {
    console.log(`URL変更を検出: ${source}による変更 [${previousUrl} -> ${currentUrl}]`);
    
    // 新しいURLがチャンネルページかどうかを判定
    const isChannelPage = isTwitchChannelPage(currentUrl);
    
    if (isChannelPage) {
      // チャンネルページの場合のみ、チャンネル変更処理を実行
      setChannelChangedFlag(true);
      console.log("チャンネルページへの移動を検出しました");
      console.log("チャンネル変更フラグと既存メッセージ処理禁止フラグをセットしました");
      debouncedChannelChangeNotify(previousUrl, currentUrl);
    } else {
      // 非チャンネルページの場合は監視を停止
      console.log("非チャンネルページへの移動を検出しました。チャット監視を停止します");
      stopObserving();
    }
  },
  {
    // URL監視オプション
    checkInterval: 2000,       // 2秒間隔でポーリング
    useHistoryApi: true,       // History APIのオーバーライドを有効化
    useHashChange: true,       // ハッシュ変更イベントを監視
    usePopState: true,         // ブラウザの戻るボタン等のイベントを監視
    comparePathOnly: true,     // パス部分のみを比較（クエリパラメータやハッシュが変わるだけでは検出しない）
    debug: false               // デバッグ情報は表示しない
  }
);

// チャンネル切り替え時の処理
function handleChannelChange(prevUrl, currentUrl) {
  // 監視を一度停止
  if (observer) {
    stopObserving();
    translatedComments.clear(); // 翻訳済みコメントをクリア
    console.log("チャンネル変更のため監視を一時停止、翻訳キャッシュをクリア");
  }

  // チャンネル名を抽出して記録
  const oldChannel = extractChannelName(prevUrl) || "不明";
  const newChannel = extractChannelName(currentUrl) || "不明";
  console.log(`チャンネル変更: ${oldChannel} -> ${newChannel}`);
  
  // URLの詳細情報をログ出力（高度なURL監視デテクタの機能を使用）
  if (urlChangeDetector && typeof urlChangeDetector.getUrlParts === 'function') {
    // 新しいURL情報を取得
    const urlInfo = urlChangeDetector.getUrlParts();
    console.log('新しいURL詳細情報:', {
      path: urlInfo.path,
      query: urlInfo.query,
      hash: urlInfo.hash,
      host: urlInfo.host
    });
  }
  
  // 現在のページがチャンネルページかどうか判定
  const isChannelPage = isTwitchChannelPage(currentUrl);
  console.log(`ページタイプ: ${isChannelPage ? 'チャンネルページ' : '非チャンネルページ'}`);
  
  if (!isChannelPage) {
    console.log('チャンネルページではないため、チャット監視はスキップします');
    return; // チャンネルページでない場合は処理を終了
  }

  // チャンネル切り替え関連フラグを設定
  setChannelChangedFlag(true);

  // グレースピリオドを開始
  setGracePeriodState(true);
  console.log(`グレースピリオド開始: ${GRACE_PERIOD_DURATION / 1000}秒間は新規コメントも翻訳しません`);

  // 既存のタイマーがあればクリア
  if (gracePeriodTimer) {
    clearTimeout(gracePeriodTimer);
  }

  // 新しいタイマーを設定
  gracePeriodTimer = setTimeout(() => {
    setGracePeriodState(false);
    console.log("グレースピリオド終了: チャンネル切り替え後の初期ロードが完了したと判断します");
    console.log("既存メッセージ処理禁止フラグは維持されます");

    // グレースピリオド終了時点で既に表示されているメッセージを全て「既存メッセージ」としてマークする
    if (observer) {
      console.log("グレースピリオド終了時点の既存メッセージをマークします");
      const markedCount = markExistingMessages(true);
      console.log(`${markedCount}個のメッセージを既存メッセージとしてマーク完了`);
    }
  }, GRACE_PERIOD_DURATION);

  // バックグラウンドスクリプトにチャンネル変更を通知
  try {
    chrome.runtime.sendMessage(
      {
        action: "channelChanged",
        from: prevUrl,
        to: currentUrl,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          logError("チャンネル変更通知エラー", chrome.runtime.lastError);
        } else {
          console.log("チャンネル変更通知完了:", response);

          // バックグラウンドから返された設定を適用することも可能
          if (response && response.settings) {
            console.log("バックグラウンドから設定を受信:", response.settings);
          }
        }
      }
    );
  } catch (error) {
    logError("チャンネル変更通知中のエラー", error);
  }

  // 少し待ってから再初期化（DOMの更新を待つ）
  setTimeout(() => {
    console.log("チャンネル変更後の再初期化を開始");
    debouncedReinitialize();
  }, 1500);
}

// デバウンス処理を適用した関数群
// 再初期化関数のデバウンス版
const debouncedReinitialize = debounce(async () => {
  // チャンネル変更フラグをチェック
  if (hasChannelChanged()) {
    console.log("デバウンス処理中のチャンネル変更を検出しました。既存メッセージ処理を確実に無効化します。");
  }
  console.log("デバウンス: 拡張機能の再初期化を開始...");

  // 現在のチャンネル情報をログ出力
  const currentUrl = location.href;
  const currentChannel = extractChannelName(currentUrl) || "不明";
  const isChannelPage = isTwitchChannelPage(currentUrl);
  
  console.log(`現在のURL: ${currentUrl}`);
  console.log(`ページタイプ: ${isChannelPage ? 'チャンネルページ' : '非チャンネルページ'}`);  
  console.log(`現在のチャンネル: ${currentChannel}`);
  
  // 非チャンネルページの場合は監視を停止
  if (!isChannelPage) {
    console.log('非チャンネルページのため、チャット監視は行いません');
    stopObserving();
    return; // 非チャンネルページの場合はここで終了
  }

  // 設定を再読み込み
  await updateSettings();

  // 現在の翻訳状態をログ出力
  console.log(`翻訳状態確認 - 有効: ${isEnabled}, APIキー: ${apiKeySet ? "設定済み" : "未設定"}`);
  console.log(`既存メッセージ処理設定: ${settings.processExistingMessages ? "有効" : "無効"}`);

  // 翻訳済みキャッシュをクリア
  const previousSize = translatedComments.size;
  translatedComments.clear();
  console.log(`チャンネル変更に伴い翻訳済みキャッシュをクリア (${previousSize} エントリ)`);

  // チャンネル遷移時には、既存メッセージ処理を一時的に無効化
  const originalSetting = settings.processExistingMessages;

  // 変更前の設定をログ出力
  console.log(`チャンネル切り替え時の既存メッセージ処理を強制無効化 (元設定: ${originalSetting})`);

  // 設定を一時的に置き換え
  const tempSettings = { ...settings };
  tempSettings.processExistingMessages = false;
  setSessionFlag("twitch_gemini_prevent_existing", true); // 既存メッセージ処理禁止フラグもセット
  settings = tempSettings;

  // 有効かつAPIキーがある場合のみ監視を再開
  if (isEnabled && apiKeySet) {
    console.log("チャンネル変更後の監視を再開 (既存メッセージ処理は無効)");
    debouncedStartObserving();

    // 元の設定を復元 (監視開始後に行うが、既存メッセージ処理は既に無効化済み)
    setTimeout(() => {
      tempSettings.processExistingMessages = originalSetting;
      settings = tempSettings;
      console.log(`設定を元に戻しました: 既存メッセージ処理=${settings.processExistingMessages ? "有効" : "無効"}`);
    }, 1000);
  } else {
    console.log("設定により監視は再開されません（無効か、APIキー未設定）");

    // 監視を再開しない場合も元の設定を復元
    tempSettings.processExistingMessages = originalSetting;
    settings = tempSettings;
  }
}, 500); // 500ミリ秒のデバウンス

// 監視開始関数のデバウンス版
const debouncedStartObserving = debounce(() => {
  if (observer) {
    console.log("デバウンス: すでにチャット監視中です");
    return;
  }

  console.log("デバウンス: チャット監視を開始します。");

  // チャットコンテナを探す
  setTimeout(findAndObserveChatContainer, 2000);
}, 300); // 300ミリ秒のデバウンス

// チャンネル変更通知のデバウンス版
const debouncedChannelChangeNotify = debounce((prevUrl, currentUrl) => {
  // チャンネル切り替え処理のメインロジックを呼び出し
  handleChannelChange(prevUrl, currentUrl);
}, 1000); // 1秒のデバウンス

// DOM完全ロード後に実行
document.addEventListener("DOMContentLoaded", initialize);

// ページロードが既に完了している場合の対応
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(initialize, 1000);
}

// 再初期化関数
async function reinitialize() {
  // デバウンスされた実装を呼び出し
  debouncedReinitialize();
}

// 初期化処理
async function initialize() {
  // URL変更検出を開始
  urlChangeDetector.start();
  console.log("Twitch Gemini Translator: 初期化開始");

  // 再度の初期化フラグをクリア
  removeSessionFlag("twitch_gemini_context_invalidated");

  // 後続の処理が失敗しても、直接ローカルストレージから読み込む
  let manuallyLoaded = false;

  try {
    // ローカルストレージから直接読み込み
    const storedSettings = loadFromLocalStorage("twitch_gemini_settings");
    if (storedSettings) {
      settings = storedSettings;
      isEnabled = settings.enabled;
      apiKeySet = !!settings.apiKey;
      console.log("初期化時にローカルストレージから設定を読み込みました");
      manuallyLoaded = true;
    }
  } catch (localStorageError) {
    logError("ローカルストレージからの設定読み込みに失敗しました", localStorageError);
  }

  // 設定を読み込む
  try {
    // ページのURLからチャンネル情報を取得してログに記録
    const currentUrl = location.href;
    const currentChannel = extractChannelName(currentUrl) || "チャンネル不明";
    const isChannelPage = isTwitchChannelPage(currentUrl);
    
    console.log(`現在のTwitchページ: ${currentUrl}`);
    console.log(`ページタイプ: ${isChannelPage ? 'チャンネルページ' : '非チャンネルページ'}`);
    console.log(`チャンネル名: ${currentChannel}`);

    // バックグラウンドスクリプトから設定を取得
    settings = await getSettings();

    isEnabled = settings.enabled;
    apiKeySet = !!settings.apiKey;

    console.log(`設定を読み込みました: 有効=${isEnabled}, APIキー設定済み=${apiKeySet ? "設定済み" : "未設定"}`);
    console.log("翻訳モード:", settings.translationMode);
    console.log("既存メッセージ処理:", settings.processExistingMessages ? "有効" : "無効");

    // 設定をローカルストレージに保存（コンテキスト無効化への対策）
    saveToLocalStorage("twitch_gemini_settings", settings);

    // バックグラウンドスクリプトに初期化完了を通知
    try {
      chrome.runtime.sendMessage(
        {
          action: "contentScriptInitialized",
          enabled: isEnabled,
          isChannelPage: isChannelPage
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn("初期化通知エラー:", chrome.runtime.lastError);
          } else {
            console.log("初期化通知が成功しました");
          }
        }
      );
    } catch (notifyError) {
      logError("初期化通知失敗", notifyError);
    }

    // 有効かつAPIキーがある場合、さらにチャンネルページの場合のみ監視開始
    if (isEnabled && apiKeySet && isChannelPage) {
      debouncedStartObserving();
    } else if (!isChannelPage) {
      console.log("現在のページはチャンネルページではないため、チャット監視は開始しません");
    } else if (!isEnabled) {
      console.log("機能が無効なため、チャット監視は開始しません");
    } else {
      console.log("APIキーが設定されていないため、チャット監視は開始しません");
    }
  } catch (error) {
    logError("設定読み込みエラー", error);

    // 拡張機能コンテキストが無効化されたエラーの場合
    if (error.message && error.message.includes("Extension context invalidated")) {
      console.warn("拡張機能コンテキストが無効になりました。ローカル設定を使用します。");

      // manuallyLoadedがtrueの場合、すでにローカルストレージから読み込み済み
      if (manuallyLoaded) {
        console.log("すでにローカルストレージから設定を読み込み済みです");
        if (isEnabled && apiKeySet) {
          debouncedStartObserving();
        }
        return; // ここで処理を終了
      }

      // ローカルストレージから設定を読み込む試み
      try {
        const storedSettings = loadFromLocalStorage("twitch_gemini_settings");
        if (storedSettings) {
          settings = storedSettings;
          isEnabled = settings.enabled;
          apiKeySet = !!settings.apiKey;
          console.log("ローカルストレージから設定を復元しました");

          if (isEnabled && apiKeySet) {
            debouncedStartObserving();
          }
          return; // 処理成功のため終了
        }
      } catch (localStorageError) {
        logError("ローカルストレージからの設定読み込みエラー", localStorageError);
      }

      // 30秒後に再初期化を試行
      setTimeout(() => {
        console.log("拡張機能コンテキストの再接続を試みます...");
        initialize();
      }, 30000);
    }

    // manuallyLoadedがtrueの場合、すでにローカルから読み込み済みのため終了
    if (manuallyLoaded) {
      return;
    }

    // デフォルトで無効に設定
    isEnabled = isEnabled || false;
    apiKeySet = apiKeySet || false;
  }
}

// バックグラウンドスクリプトから設定を取得
async function getSettings() {
  return new Promise(async (resolve) => {
    try {
      // まずローカルストレージから設定を読み込むことを試みる
      const localSettings = loadFromLocalStorage("twitch_gemini_settings");

      try {
        // 次にバックグラウンドスクリプトから設定を取得することを試みる
        chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            console.warn("設定取得中のエラー:", error);

            // エラー時はローカル設定を使用
            if (localSettings) {
              console.log("バックグラウンドからの設定取得に失敗しました。ローカル設定を使用します");
              resolve(localSettings);
            } else {
              console.log("ローカル設定がないため、デフォルト設定を使用します");
              resolve(getDefaultSettings());
            }
          } else {
            // 成功した場合はローカルストレージに保存
            saveToLocalStorage("twitch_gemini_settings", response);
            console.log("バックグラウンドから設定を取得し、ローカルに保存しました");
            resolve(response);
          }
        });
      } catch (messageError) {
        logError("設定取得リクエストの送信中にエラーが発生しました", messageError);

        // メッセージ送信自体が失敗した場合はローカル設定を使用
        if (localSettings) {
          console.log("バックグラウンドへのメッセージ送信に失敗しました。ローカル設定を使用します");
          resolve(localSettings);
        } else {
          console.log("ローカル設定がないため、デフォルト設定を使用します");
          resolve(getDefaultSettings());
        }
      }
    } catch (error) {
      // 最終フォールバック
      logError("設定読み込み中の致命的エラー", error);
      resolve(getDefaultSettings());
    }
  });
}

// チャットコンテナを検索して監視開始
function findAndObserveChatContainer() {
  console.log("Twitchチャットコンテナを検索中...");

  // 現在のページがチャンネルページか確認
  const currentUrl = location.href;
  const isChannelPage = isTwitchChannelPage(currentUrl);
  
  if (!isChannelPage) {
    console.log('現在のページはチャンネルページではないため、チャットコンテナ検索を中止します');
    return false;
  }

  // メインのチャットコンテナセレクタ
  const chatContainer = findChatContainer();

  if (chatContainer) {
    console.log("チャットコンテナを検出しました。監視を開始します。");
    observeChatMessages(chatContainer);
    return true;
  } else {
    console.log("Twitchチャットコンテナが見つかりません。後ほど再試行します。");
    setTimeout(findAndObserveChatContainer, 1000);
    return false;
  }
}

// チャットメッセージの監視を開始
function startObserving() {
  // チャンネル切り替え時は既存メッセージ処理を無効化するためのフラグを設定
  if (hasChannelChanged()) {
    console.log("❌ チャンネル切り替え検出: 既存メッセージ処理禁止フラグを設定");
    setSessionFlag("twitch_gemini_prevent_existing", true);
  }

  // デバウンスされた実装を呼び出し
  debouncedStartObserving();
}

// チャットメッセージの監視処理
function observeChatMessages(container) {
  console.log("チャットコンテナの監視を開始します");

  // 既存の監視があれば停止
  if (observer) {
    console.log("既存の監視を停止して再設定します");
    observer.disconnect();
  }

  // MutationObserverの設定
  observer = createMutationObserver(processChatMessage, settings.requestDelay, isInGracePeriod());

  // 監視を開始 - childListのみを監視
  observer.observe(container, { childList: true });
  console.log("監視を開始しました（childList: true）");

  // 現在のURLを保存（チャンネル変更検出用）
  const currentUrl = urlChangeDetector.getCurrentUrl();
  console.log(`現在のURL: ${currentUrl}`);

  // この関数が呼ばれた時点でのsettings.processExistingMessagesの値をキャプチャ
  let shouldProcessExisting = settings.processExistingMessages;

  // チャンネル切り替え時は既存メッセージ処理を明示的に無効化
  if (hasChannelChanged()) {
    console.log("チャンネル切り替え後の監視開始: 既存メッセージ処理を確実に無効化");
    shouldProcessExisting = false;
  }

  // チャンネル遷移直後の場合は、強制的に既存メッセージ処理を無効化
  if (hasChannelChanged() || isExistingMessagesPreventionActive()) {
    // 強制的に既存メッセージ処理を無効化
    console.log("既存メッセージ処理を強制無効化します (フラグ状態:", hasChannelChanged() ? "チャンネル変更あり" : "チャンネル変更なし", ")");
    shouldProcessExisting = false;
  }

  // 各種フラグのリセット処理
  if (hasChannelChanged()) {
    removeSessionFlag("twitch_gemini_channel_changed");
  }

  console.log(`既存メッセージ処理設定: ${shouldProcessExisting ? "有効" : "無効"} (元の設定: ${settings.processExistingMessages ? "有効" : "無効"})`);

  // 監視開始時の既存メッセージ処理
  // チャンネル変更直後は強制的に無効化されているが、それ以外のケースでユーザー設定を使用
  console.log(`既存メッセージ処理は${shouldProcessExisting ? "有効" : "無効"}です (ユーザー設定: ${settings.processExistingMessages ? "有効" : "無効"})`);

  // チャンネル切り替え時は、一律で既存メッセージ処理を無効化
  if (currentUrl !== urlChangeDetector.getCurrentUrl() || isExistingMessagesPreventionActive()) {
    console.log("⚠️ チャンネル切り替え検出または明示的な禁止フラグあり: 既存メッセージ処理を無効化します");
    shouldProcessExisting = false;
  }

  if (shouldProcessExisting) {
    console.log("既存のチャットメッセージを処理します...");
    const existingMessages = getAllExistingMessages();
    console.log(`${existingMessages.length}個の既存メッセージを処理します`);

    // 既存メッセージの処理間隔を開けてリクエストを分散させる
    existingMessages.forEach((element, index) => {
      // 既存メッセージとしてマーク（_isNewMessageプロパティは設定しない）
      setTimeout(() => {
        processChatMessage(element);
      }, index * settings.requestDelay); // ここで遅延を設定
    });
  } else {
    console.log("既存メッセージの翻訳は無効に設定されています。");
  }
}

// チャットメッセージの処理
async function processChatMessage(messageNode) {
  // 拡張機能が無効またはAPIキーが設定されていない場合はスキップ
  if (!isEnabled) {
    // デバッグ情報を追加
    console.debug("翻訳機能が無効のため、処理をスキップします。現在の状態:", {
      isEnabled,
      apiKeySet,
    });
    return;
  }

  // 既存メッセージ（_isNewMessageがないか_isExistingMessageがある）でかつ、既存メッセージ処理が無効な場合はスキップ
  if (!messageNode._isNewMessage || messageNode._isExistingMessage) {
    // 以下の条件で既存メッセージをスキップ
    if (
      !settings.processExistingMessages ||
      hasChannelChanged() ||
      isExistingMessagesPreventionActive()
    ) {
      return;
    }
  }

  // グレースピリオド中は新規メッセージも処理しない
  if (isInGracePeriod()) {
    // console.debug('グレースピリオド中のため処理をスキップします');
    return;
  }

  if (!apiKeySet) {
    console.debug("APIキーが設定されていないため、処理をスキップします。");
    return;
  }

  // メッセージノードが要素ノードでなければスキップ
  if (messageNode.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  // 自分が追加した翻訳要素ならスキップ
  if (
    messageNode.classList &&
    messageNode.classList.contains("twitch-gemini-translation")
  ) {
    return;
  }

  // メッセージ要素を特定
  const messageElement = getMessageElement(messageNode);
  if (!messageElement) {
    return; // メッセージ要素がない場合はスキップ
  }

  // メッセージIDの取得
  const messageId = getMessageId(messageElement);

  // 既に処理済みならスキップ
  if (translatedComments.has(messageId)) {
    return;
  }

  // メッセージテキストを取得
  let messageText = extractMessageText(messageElement);
  if (!messageText) {
    return; // テキストがない場合はスキップ
  }

  // 翻訳モードに応じて翻訳するかどうかを判定
  if (!shouldTranslateBasedOnMode(messageText, settings)) {
    return; // 翻訳対象外はスキップ
  }

  console.log(`翻訳対象メッセージを検出: "${messageText}"`);

  try {
    // 翻訳リクエストを送信
    // 翻訳モードがallの場合は言語自動検出、それ以外は英語と仮定
    const sourceLang = settings.translationMode === "all" ? "auto" : "EN";
    const translationResult = await sendTranslationRequest(
      messageText,
      sourceLang,
      handleContextInvalidated
    );

    if (translationResult && translationResult.success) {
      // 翻訳エンジンの確認とデバッグ情報
      console.log(
        "翻訳結果:",
        JSON.stringify({
          success: translationResult.success,
          engine: translationResult.engine || "エンジン情報なし",
        })
      );

      // 翻訳結果を表示 (翻訳エンジン情報を渡す)
      displayTranslation(
        messageElement,
        translationResult.translatedText,
        translationResult.engine,
        settings
      );

      // 処理済みとしてマーク
      translatedComments.set(messageId, true);
    } else if (translationResult) {
      // エラーメッセージをコンソールに出力
      logError("翻訳エラー", translationResult.error);

      // 翻訳機能が無効になっている場合は、一時的に無効化
      if (
        translationResult.error &&
        translationResult.error.includes("翻訳機能が無効")
      ) {
        console.warn(
          "バックグラウンドで翻訳機能が無効になっています。ローカル状態を更新します。"
        );
        isEnabled = false; // ローカル状態を更新

        // 30秒後に設定を再読み込み
        setTimeout(async () => {
          console.log("設定の再読み込みを試みます...");
          await updateSettings();
        }, 30000);
      }

      // エラーが続く場合、拡張機能が無効になっている可能性がある
      if (
        translationResult.error &&
        translationResult.error.includes("Extension context invalidated")
      ) {
        console.warn(
          "拡張機能コンテキストが無効になりました。監視を停止します。"
        );
        stopObserving();
        return;
      }
    }
  } catch (error) {
    logError("翻訳リクエスト中のエラー", error);

    // 重大なエラーの場合は監視を停止
    if (
      error.message &&
      error.message.includes("Extension context invalidated")
    ) {
      console.warn(
        "拡張機能コンテキストが無効になりました。監視を停止します。"
      );
      stopObserving();
    }
  }
}

// チャットメッセージの監視を停止
function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
    console.log("Twitchチャットの監視を停止しました");
  }

  // 翻訳キャッシュをクリア
  if (translatedComments.size > 0) {
    const cacheSize = translatedComments.size;
    translatedComments.clear();
    console.log(`翻訳キャッシュをクリアしました（${cacheSize}件）`);
  }
  
  // グレースピリオドタイマーをクリア
  if (gracePeriodTimer) {
    clearTimeout(gracePeriodTimer);
    gracePeriodTimer = null;
    console.log("グレースピリオドタイマーをクリアしました");
  }
  
  // グレースピリオド状態をリセット
  if (isInGracePeriod()) {
    setGracePeriodState(false);
    console.log("グレースピリオド状態をリセットしました");
  }

  // URL監視は継続
  if (urlChangeDetector && typeof urlChangeDetector.isActive === 'function' && !urlChangeDetector.isActive()) {
    // URL監視が停止していた場合は再開始
    urlChangeDetector.start();
    console.log("URL変更監視を再開始しました");
  } else {
    console.log("URL変更検出は継続中です");
  }
  
  // チャンネル変更フラグをクリアするかどうかを判断
  const currentUrl = location.href;
  const isChannelPage = isTwitchChannelPage(currentUrl);
  
  if (!isChannelPage && hasChannelChanged()) {
    // 非チャンネルページに移動した場合はフラグをクリア
    removeSessionFlag("twitch_gemini_channel_changed");
    console.log("非チャンネルページのため、チャンネル変更フラグをクリアしました");
  }
}

// コンテキスト無効化時の処理 - これもデバウンス
const debouncedHandleContextInvalidated = debounce(() => {
  console.warn(
    "デバウンス: 拡張機能コンテキストが無効になりました。自動再接続を試みます。"
  );

  // 現在のURLを保存
  const currentUrl = location.href;

  // 監視を停止
  if (observer) {
    observer.disconnect();
    observer = null;
    console.log("監視を停止しました");
  }

  // ローカルストレージの設定を確認
  let localSettings = loadFromLocalStorage("twitch_gemini_settings");

  // コンテキスト無効化ステータスを確認
  const { isRecent, lastAttempt, now } = checkContextInvalidationStatus();

  // 再試行回数を増やす
  const retryCount = manageRetryCounter();

  // 最後の試行から30秒以上経過している場合のみ再試行
  if (!isRecent) {
    // URLチェックも再開
    urlChangeDetector.start();

    // 再試行回数に応じて遅延を調整
    const delayTime = Math.min(retryCount * 1000, 10000); // 最大1万ミリ秒まで

    // 遅延を設定して再初期化を試行
    console.log(
      `${
        delayTime / 1000
      }秒後に再初期化を試行します... (試行回数: ${retryCount})`
    );

    setTimeout(() => {
      // ローカル設定があれば先に適用
      if (localSettings) {
        settings = localSettings;
        isEnabled = settings.enabled;
        apiKeySet = !!settings.apiKey;
        console.log("ローカル設定を適用しました");

        // 設定に基づいて監視を再開するか判断
        if (isEnabled && apiKeySet) {
          console.log("設定に基づいて監視を再開します");
          debouncedStartObserving();
        }
      }

      // 今のページがまだTwitchか確認
      if (location.href.includes("twitch.tv") && location.href === currentUrl) {
        console.log("再初期化を実行します");
        initialize(); // 通常の初期化も実行
      } else {
        console.log("ページが変わったため再初期化をキャンセルしました");
      }
    }, delayTime);
  } else {
    console.log(
      `最近再初期化を試行したため、再試行をスキップします (前回: ${new Date(
        lastAttempt
      ).toLocaleTimeString()})`
    );
  }
}, 1000); // 1秒のデバウンス

// コンテキスト無効化時の処理の非デバウンス版 (デバウンス版を呼び出す)
function handleContextInvalidated() {
  debouncedHandleContextInvalidated();
}

// 設定を更新 - デバウンス対応
const debouncedUpdateSettings = debounce(async () => {
  try {
    console.log("デバウンス: 設定の再取得を開始...");
    const oldEnabled = isEnabled; // 更新前の状態を保存
    const oldProcessExisting = settings
      ? settings.processExistingMessages
      : false; // 更新前の既存メッセージ処理設定

    // 設定を再取得
    settings = await getSettings();
    isEnabled = settings.enabled;
    apiKeySet = !!settings.apiKey;

    // 既存メッセージ処理設定の変更をログ出力
    if (settings.processExistingMessages !== oldProcessExisting) {
      console.log(
        `既存メッセージ処理設定の変更: ${oldProcessExisting} -> ${settings.processExistingMessages}`
      );
    }

    console.log("設定を更新しました");
    console.log(`有効状態: ${oldEnabled} -> ${isEnabled}`);
    console.log(`APIキー: ${apiKeySet ? "設定済み" : "未設定"}`);

    // 設定をローカルストレージに保存（コンテキスト無効化への対策）
    saveToLocalStorage("twitch_gemini_settings", settings);

    // 有効/無効状態に応じて監視を開始/停止
    if (isEnabled && apiKeySet) {
      if (!observer) {
        console.log("監視を開始します...");
        debouncedStartObserving();
      } else {
        console.log("既に監視中です");
      }
    } else {
      if (observer) {
        console.log("監視を停止します...");
        stopObserving();
      } else {
        console.log("監視は既に停止しています");
      }
    }
  } catch (error) {
    logError("設定更新エラー", error);

    // 拡張機能コンテキストが無効化されたエラーの場合
    if (
      error.message &&
      error.message.includes("Extension context invalidated")
    ) {
      console.warn(
        "拡張機能コンテキストが無効になりました。再接続を試みます..."
      );

      // ローカルストレージから設定を読み込む
      try {
        const storedSettings = loadFromLocalStorage("twitch_gemini_settings");
        if (storedSettings) {
          settings = storedSettings;
          isEnabled = settings.enabled;
          apiKeySet = !!settings.apiKey;
          console.log("ローカルストレージから設定を復元しました");
        }
      } catch (localStorageError) {
        logError("ローカルストレージからの設定読み込みエラー", localStorageError);
      }
    }
  }
}, 300); // 300ミリ秒のデバウンス

// 設定更新の非デバウンス版（デバウンス版を呼び出す）
async function updateSettings() {
  return debouncedUpdateSettings();
}

// メッセージリスナーの設定
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log("メッセージを受信しました:", message.action);

    // 翻訳の有効/無効切り替え
    if (message.action === "toggleTranslation") {
      isEnabled = message.enabled;
      console.log(`翻訳機能の切り替え: ${isEnabled ? "有効" : "無効"}`);

      if (isEnabled && apiKeySet) {
        debouncedStartObserving();
      } else {
        stopObserving();
      }

      sendResponse({ success: true });
    }

    // 設定更新の通知
    else if (message.action === "settingsUpdated") {
      console.log("設定更新の通知を受信しました");
      debouncedUpdateSettings();
      sendResponse({ success: true });
    }

    return true;
  } catch (error) {
    logError("メッセージ処理中のエラー", error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
});

// 拡張機能のコンテキスト変更を監視
// 拡張機能が再読み込みされた場合に当処理を再度実行するため
(() => {
  // 拡張機能の初期化状態を確認する関数
  function checkExtensionContext() {
    try {
      // ダミーメッセージを送信してコンテキストが有効か確認
      chrome.runtime.sendMessage({ action: "ping" }, (response) => {
        if (chrome.runtime.lastError) {
          // エラーが発生した場合、ログに記録して再試行
          console.warn("コンテキスト確認中のエラー:", chrome.runtime.lastError);
          debouncedHandleContextInvalidated(); // デバウンスされたコンテキスト無効化処理を呼び出す
        } else {
          // 当関数が終了する前にエラーが発生しなければコンテキストは有効
          // 次回の確認をスケジュール
          const nextCheckTime = isEnabled ? 15000 : 60000; // 有効時は15秒ごと、無効時は1分ごと

          // デバッグ情報があれば、設定の一貫性をさらにチェック
          if (response && response.debug) {
            const backendSettings = response.debug;
            if (backendSettings.enabled !== isEnabled) {
              console.warn(
                "フロントエンドとバックグラウンドの設定が異なります:",
                {
                  frontend: isEnabled,
                  backend: backendSettings.enabled,
                }
              );

              // 設定の不一致があれば再同期を試行
              debouncedUpdateSettings();
            }
          }

          setTimeout(checkExtensionContext, nextCheckTime);
        }
      });
    } catch (error) {
      // エラーが発生した場合、拡張機能の再初期化を試みる
      console.warn(
        "拡張機能コンテキストが変更されました。再初期化します。",
        error
      );

      // 監視を停止
      stopObserving();

      // 外部リソースの参照をクリア
      observer = null;
      translatedComments.clear();

      // 再初期化の試行回数のカウント
      const retryCount = manageRetryCounter();

      // 一定回数以上失敗した場合は長い間隔を空ける
      const delayTime = retryCount > 3 ? 30000 : 3000;

      // 再初期化
      setTimeout(() => {
        console.log(
          "拡張機能の再初期化を試みます...(試行回数:" + retryCount + ")"
        );
        // ローカルストレージから設定を読み込み直す
        try {
          // 直接ローカルストレージから設定を取得する
          const storedSettings = loadFromLocalStorage("twitch_gemini_settings");
          if (storedSettings) {
            settings = storedSettings;
            isEnabled = settings.enabled;
            apiKeySet = !!settings.apiKey;
            console.log("ローカルストレージから設定を直接読み込みました");

            // 有効かつAPIキーがあれば再度監視開始
            if (isEnabled && apiKeySet) {
              debouncedStartObserving();
            }
          }
        } catch (localStorageError) {
          logError("直接読み込み中のエラー", localStorageError);
        }

        // 通常の初期化も実行
        initialize();
      }, delayTime);

      // 次回のチェックを短い間隔で再実行
      setTimeout(checkExtensionContext, 5000);
    }
  }

  // コンテキスト確認を開始
  setTimeout(() => {
    // カウンタをリセット
    manageRetryCounter(true);
    
    // URL変更監視の状態を確認
    if (urlChangeDetector && typeof urlChangeDetector.isActive === 'function' && !urlChangeDetector.isActive()) {
      console.log('URL変更監視が非アクティブです。再開始します。');
      urlChangeDetector.start();
    }
    
    // URL監視の現在の情報をログ出力
    if (urlChangeDetector && typeof urlChangeDetector.getUrlParts === 'function') {
      const urlInfo = urlChangeDetector.getUrlParts();
      console.log('現在のURL情報:', urlInfo);
    }
    
    checkExtensionContext();
  }, 5000); // 初回の確認は5秒後
})();
