/**
 * 翻訳APIモジュール
 * 
 * GeminiAPIを使用した翻訳機能を提供します。
 */

import { getSettings } from './settings.js';
import { incrementApiRequests, incrementErrors } from './stats.js';
import { getCachedTranslation, cacheTranslation } from './cache.js';

// Gemini API関連の定数
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const GEMINI_API_GENERATE = ":generateContent";

// 翻訳用プロンプトテンプレート
const TRANSLATION_PROMPT_TEMPLATE = `Translate the following {{SOURCE_LANG}} to Japanese. This is a Twitch livestream chat message that may contain internet slang, gaming terms, emotes, abbreviations, and stream-specific expressions.

Please consider:
- Preserve memes, jokes, and cultural references when possible
- Keep emotes and symbols as they are
- Use equivalent Japanese internet/streaming slang where appropriate
- Maintain the casual, conversational tone of streaming culture
- Translate abbreviations to their Japanese equivalents when possible

Only return the Japanese translation without any explanations or notes:

{{TEXT}}`;

/**
 * 翻訳用プロンプトを作成
 * @param {string} text 翻訳するテキスト
 * @param {string} sourceLang ソース言語
 * @returns {object} プロンプトオブジェクト
 */
function createTranslationPrompt(text, sourceLang) {
  const langDisplay = sourceLang === "auto" ? "text" : `${sourceLang} text`;
  
  const promptText = TRANSLATION_PROMPT_TEMPLATE
    .replace('{{SOURCE_LANG}}', langDisplay)
    .replace('{{TEXT}}', text);
    
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      topP: 0.9,
      topK: 40,
    },
  };
}

/**
 * Gemini APIを使用してテキストを翻訳
 * @param {string} text 翻訳するテキスト
 * @param {string} apiKey Gemini APIキー
 * @param {string} sourceLang ソース言語 (デフォルト: "EN")
 * @returns {Promise<object>} 翻訳結果
 */
export async function translateWithGeminiAPI(text, apiKey, sourceLang = "EN") {
  // APIキーが空の場合はエラー
  if (!apiKey) {
    incrementErrors();
    return { success: false, error: "APIキーが設定されていません" };
  }

  try {
    // 設定から使用するモデルを取得
    const settings = getSettings();
    const model = settings.geminiModel || "gemini-2.0-flash-lite";
    
    // 翻訳用のプロンプトを作成
    const prompt = createTranslationPrompt(text, sourceLang);

    // Gemini APIエンドポイントとAPIキーを組み合わせたURL
    const apiUrl = `${GEMINI_API_BASE}${model}${GEMINI_API_GENERATE}?key=${apiKey}`;

    console.log(`Gemini API リクエスト送信先: ${GEMINI_API_BASE}${model}${GEMINI_API_GENERATE}`);

    // Gemini APIにリクエスト
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prompt),
    });

    // レスポンスのステータスをログに記録
    console.log(`Gemini API レスポンスステータス: ${response.status}`);

    // エラーチェック
    if (!response.ok) {
      incrementErrors();
      let errorMessage = `エラーステータス: ${response.status}`;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // エラーレスポンスのパースに失敗した場合は無視
        console.warn("エラーレスポンスのパースに失敗:", e);
      }

      console.error("Gemini API エラー:", errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    // レスポンスを解析
    const data = await response.json();
    return extractTranslationFromResponse(data, sourceLang);
  } catch (error) {
    incrementErrors();
    console.error("翻訳中のエラー:", error);
    return {
      success: false,
      error: error.message || "翻訳中に予期せぬエラーが発生しました",
    };
  }
}

/**
 * APIレスポンスから翻訳結果を抽出
 * @param {object} data APIレスポンスデータ
 * @param {string} sourceLang ソース言語
 * @returns {object} 翻訳結果オブジェクト
 */
function extractTranslationFromResponse(data, sourceLang) {
  // 翻訳結果を抽出
  if (
    data.candidates &&
    data.candidates.length > 0 &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts.length > 0
  ) {
    const translatedText = data.candidates[0].content.parts[0].text.trim();

    // 翻訳結果
    return {
      success: true,
      translation: translatedText, 
      detectedLanguage: sourceLang === "auto" ? "auto-detected" : sourceLang,
      engine: "gemini",
    };
  } else {
    incrementErrors();
    console.error("Gemini API から有効な翻訳結果が返されませんでした:", data);
    return {
      success: false,
      error: "翻訳結果の取得に失敗しました",
    };
  }
}

/**
 * テキストを翻訳（キャッシュチェック付き）
 * @param {string} text 翻訳するテキスト
 * @param {string} apiKey Gemini APIキー
 * @param {string} sourceLang ソース言語 (デフォルト: "auto")
 * @returns {Promise<object>} 翻訳結果
 */
export async function translateText(text, apiKey, sourceLang = "auto") {
  // 入力検証
  if (!text || text.trim().length === 0) {
    return {
      success: false,
      error: "翻訳するテキストが空です",
    };
  }

  // キャッシュをチェック
  const cachedResult = getCachedTranslation(text, sourceLang);
  if (cachedResult) {
    return cachedResult;
  }

  // APIキーがない場合はエラー
  if (!apiKey) {
    return {
      success: false,
      error: "Gemini APIキーが設定されていません",
    };
  }

  // API呼び出しの統計を更新
  incrementApiRequests(text.length);

  try {
    // Gemini APIで翻訳を実行
    const translationResult = await translateWithGeminiAPI(text, apiKey, sourceLang);

    // 翻訳結果が成功した場合はキャッシュに保存
    if (translationResult && translationResult.success) {
      cacheTranslation(text, sourceLang, translationResult);
    }

    return translationResult;
  } catch (error) {
    console.error("翻訳中にエラーが発生しました:", error);
    incrementErrors();
    return {
      success: false,
      error: error.message || "翻訳処理中にエラーが発生しました",
    };
  }
}

/**
 * APIキーのテスト
 * @param {string} apiKey テストするAPIキー
 * @returns {Promise<object>} テスト結果
 */
export async function testApiKey(apiKey) {
  try {
    // サンプルテキストで翻訳をテスト
    console.log(`APIキーテスト: ${apiKey.substring(0, 5)}...`);

    // 設定から使用するモデルを取得
    const settings = getSettings();
    const model = settings.geminiModel || "gemini-2.0-flash-lite";

    // 簡単なテスト翻訳を実行
    const prompt = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Translate the following English text to Japanese: Hello, this is a test.",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
      },
    };

    // Gemini APIエンドポイントとAPIキーを組み合わせたURL
    const apiUrl = `${GEMINI_API_BASE}${model}${GEMINI_API_GENERATE}?key=${apiKey}`;

    // Gemini APIにリクエスト
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prompt),
    });

    // エラーチェック
    if (!response.ok) {
      let errorMessage = `エラーステータス: ${response.status}`;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // エラーレスポンスのパースに失敗した場合は無視
      }

      console.error("APIキーテストエラー:", errorMessage);
      return {
        valid: false,
        error: errorMessage,
      };
    }

    // レスポンスを解析
    const data = await response.json();

    // 翻訳結果を抽出
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      const translatedText = data.candidates[0].content.parts[0].text.trim();
      console.log("APIキーテスト成功:", translatedText);

      return {
        valid: true,
        translatedText: translatedText,
      };
    } else {
      console.error("APIキーテスト: 有効な翻訳結果が返されませんでした");
      return {
        valid: false,
        error: "有効な翻訳結果が返されませんでした",
      };
    }
  } catch (error) {
    console.error("APIキーテスト中のエラー:", error);
    return {
      valid: false,
      error: error.message || "APIキーのテスト中に予期せぬエラーが発生しました",
    };
  }
}
