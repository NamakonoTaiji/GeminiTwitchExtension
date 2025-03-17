/**
 * Twitch Gemini Translator 言語処理ユーティリティ
 * 
 * このファイルは、言語検出と翻訳処理に関連する共通機能を提供します。
 * 複数の場所で使用される言語関連の機能をまとめています。
 */

import { getJapaneseRatio, getEnglishRatio, getContentCharsCount } from './utils.js';

/**
 * 英語テキスト判定（シンプル版）
 * @param {string} text テキスト
 * @returns {boolean} 英語テキストかどうか
 */
export function isEnglishText(text) {
  // 簡易的な英語判定: アルファベットが50%以上を占めるか
  const englishRatio = getEnglishRatio(text);
  return englishRatio >= 0.5;
}

/**
 * テキストが翻訳対象かどうかを判定する
 * @param {string} text テキスト
 * @param {object} settings 設定オブジェクト
 * @returns {boolean} 翻訳対象かどうか
 */
export function shouldTranslate(text, settings) {
  // 空のテキストは翻訳しない
  if (!text || text.length === 0) {
    return false;
  }

  // 設定から閾値を取得
  const japaneseThreshold = settings.japaneseThreshold / 100;
  const englishThreshold = settings.englishThreshold / 100;

  // 文章の内容を分析
  const japaneseRatio = getJapaneseRatio(text);
  const englishRatio = getEnglishRatio(text);
  const contentChars = getContentCharsCount(text);
  
  // 日本語が多ければ翻訳しない
  if (japaneseRatio >= japaneseThreshold) {
    console.log(`日本語率: ${(japaneseRatio * 100).toFixed(1)}% - 翻訳しません`);
    return false;
  }

  // 英語が十分にあれば翻訳する
  if (englishRatio >= englishThreshold) {
    console.log(`英語率: ${(englishRatio * 100).toFixed(1)}% - 翻訳対象です`);
    return true;
  }

  // 内容がほとんどない場合（絵文字や記号だけなど）は翻訳しない
  if (contentChars < 3) {
    console.log("実質的な内容が少ないため翻訳しません");
    return false;
  }

  // 英語が日本語より多い場合は翻訳する
  const japaneseChars = japaneseRatio * text.length;
  const englishChars = englishRatio * text.length;
  if (englishChars > japaneseChars) {
    console.log("英語が日本語より多いため翻訳対象です");
    return true;
  }

  // デフォルトでは翻訳しない
  return false;
}

/**
 * 翻訳モードに基づいて翻訳すべきかどうかを判定
 * @param {string} text テキスト
 * @param {object} settings 設定オブジェクト
 * @returns {boolean} 翻訳対象かどうか
 */
export function shouldTranslateBasedOnMode(text, settings) {
  // 翻訳モードに応じて判定
  switch (settings.translationMode) {
    // すべてのメッセージを翻訳
    case "all":
      return true;

    // 英語メッセージのみ翻訳
    case "english":
      return isEnglishText(text);

    // 選択的翻訳（デフォルト）- 言語判定ロジックを使用
    case "selective":
    default:
      return shouldTranslate(text, settings);
  }
}

/**
 * メッセージテキストの抽出
 * @param {Element} messageElement メッセージ要素
 * @returns {string|null} 抽出されたテキストまたはnull
 */
export function extractMessageText(messageElement) {
  if (!messageElement) return null;

  // 新しいDOMパスを優先的に使用
  const textElement =
    messageElement.querySelector('[data-a-target="chat-message-text"]') ||
    messageElement.querySelector('[data-a-target="chat-line-message-body"] .text-fragment') ||
    messageElement.querySelector(".text-fragment");

  if (textElement) {
    return textElement.textContent.trim();
  }

  // バックアップ方法: テキストを含む可能性のある要素を探す
  const possibleTextContainers = [
    ".text-token",
    ".message-text",
    '[data-a-target="chat-line-message-body"]',
  ];

  for (const selector of possibleTextContainers) {
    const element = messageElement.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }

  return null;
}

/**
 * 翻訳リクエストをバックグラウンドスクリプトに送信
 * @param {string} text 翻訳するテキスト
 * @param {string} sourceLang ソース言語 (デフォルト: "auto")
 * @param {function} handleContextInvalidated コンテキスト無効時の処理関数
 * @returns {Promise<object>} 翻訳結果
 */
export function sendTranslationRequest(text, sourceLang = "auto", handleContextInvalidated) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        { action: "translate", text, sourceLang },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "翻訳リクエストエラー:",
              chrome.runtime.lastError.message
            );

            // コンテキスト無効化エラーの場合は再初期化を試みる
            if (
              chrome.runtime.lastError.message.includes(
                "Extension context invalidated"
              ) && 
              typeof handleContextInvalidated === "function"
            ) {
              handleContextInvalidated();
            }

            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        }
      );
    } catch (error) {
      console.error("メッセージ送信エラー:", error);

      // 拡張機能コンテキストが無効になった場合の処理
      if (
        error.message &&
        error.message.includes("Extension context invalidated") && 
        typeof handleContextInvalidated === "function"
      ) {
        handleContextInvalidated();
      }

      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * 翻訳表示関数
 * @param {Element} messageElement メッセージ要素
 * @param {string} translatedText 翻訳されたテキスト
 * @param {string} engine 翻訳エンジン (デフォルト: "")
 * @param {object} settings 設定オブジェクト
 */
export function displayTranslation(messageElement, translatedText, engine = "", settings) {
  console.log(`翻訳表示: "${translatedText}"`);
  console.log(`翻訳エンジン: ${engine || "不明"}`);

  // 翻訳エンジンに応じた接頭辞を作成
  let prefix = settings.displayPrefix;
  if (engine === "gemini") {
    prefix = "🤖 " + prefix; // ロボットアイコン + 通常の接頭辞
  } else if (engine === "cached") {
    prefix = "💾 " + prefix; // ディスクアイコン + 通常の接頭辞
  }

  // 既に翻訳要素があれば更新
  let translationElement = messageElement.querySelector(
    ".twitch-gemini-translation"
  );

  if (translationElement) {
    translationElement.textContent = `${prefix} ${translatedText}`;
    return;
  }

  // 翻訳表示用の要素を作成
  translationElement = document.createElement("div");
  translationElement.className = "twitch-gemini-translation";
  translationElement.textContent = `${prefix} ${translatedText}`;

  // フォントサイズの設定
  let fontSize = "0.9em";
  switch (settings.fontSize) {
    case "small":
      fontSize = "0.8em";
      break;
    case "medium":
      fontSize = "0.9em";
      break;
    case "large":
      fontSize = "1.0em";
      break;
  }

  // スタイル設定
  translationElement.style.color = settings.textColor;
  translationElement.style.fontSize = fontSize;
  translationElement.style.marginTop = "4px";
  translationElement.style.marginLeft = "20px";
  translationElement.style.fontStyle = "italic";
  translationElement.style.padding = "2px 0";
  translationElement.style.borderLeft = `3px solid ${settings.accentColor}`;
  translationElement.style.paddingLeft = "8px";

  // 最適な挿入位置を探す
  // 1. メッセージコンテナ
  const messageContainer = messageElement.querySelector(
    ".chat-line__message-container"
  );

  // 2. サブコンテナ（確認された構造から）
  const subContainer = messageElement.querySelector(".cwtKyw");

  // 挿入先の決定
  const insertTarget = messageContainer || subContainer || messageElement;

  try {
    // 要素の最後に追加
    insertTarget.appendChild(translationElement);
    console.log("翻訳を表示しました");
  } catch (error) {
    console.error("翻訳表示エラー:", error);

    // 代替手段としてmessageElementの後に挿入
    try {
      if (messageElement.parentElement) {
        messageElement.parentElement.insertBefore(
          translationElement,
          messageElement.nextSibling
        );
        console.log("代替方法で翻訳を表示しました");
      }
    } catch (fallbackError) {
      console.error("翻訳表示の代替手段も失敗:", fallbackError);
    }
  }
}
