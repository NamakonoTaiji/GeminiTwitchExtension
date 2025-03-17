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
    // 翻訳用のプロンプトを作成
    // 文脈を理解して翻訳するようにプロンプトを設計
    const prompt = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Translate the following ${
                sourceLang === "auto" ? "text" : sourceLang + " text"
              } to Japanese. This is a Twitch livestream chat message that may contain internet slang, gaming terms, emotes, abbreviations, and stream-specific expressions.

Please consider:
- Preserve memes, jokes, and cultural references when possible
- Keep emotes and symbols as they are
- Use equivalent Japanese internet/streaming slang where appropriate
- Maintain the casual, conversational tone of streaming culture
- Translate abbreviations to their Japanese equivalents when possible

Only return the Japanese translation without any explanations or notes:

${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3, // 少し上げて創造性を高める
        topP: 0.9,
        topK: 40,
      },
    };

    // 設定から使用するモデルを取得
    const settings = getSettings();
    const model = settings.geminiModel || "gemini-2.0-flash-lite";

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
        errorMessage = errorData.error.message || errorMessage;
      } catch (e) {
        // エラーレスポンスのパースに失敗した場合は無視
      }

      console.error("Gemini API エラー:", errorMessage);
      return {
        success: false,
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

      // 翻訳結果
      const result = {
        success: true,
        translatedText: translatedText,
        detectedLanguage: sourceLang === "auto" ? "auto-detected" : sourceLang,
        engine: "gemini",
      };

      return result;
    } else {
      incrementErrors();
      console.error("Gemini API から有効な翻訳結果が返されませんでした:", data);
      return {
        success: false,
        error: "翻訳結果の取得に失敗しました",
      };
    }
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
 * テキストを翻訳（キャッシュチェック付き）
 * @param {string} text 翻訳するテキスト
 * @param {string} apiKey Gemini APIキー
 * @param {string} sourceLang ソース言語 (デフォルト: "auto")
 * @returns {Promise<object>} 翻訳結果
 */
export async function translateText(text, apiKey, sourceLang = "auto") {
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

  // Gemini APIで翻訳を実行
  const translationResult = await translateWithGeminiAPI(text, apiKey, sourceLang);

  // 翻訳結果が成功した場合はキャッシュに保存
  if (translationResult && translationResult.success) {
    cacheTranslation(text, sourceLang, translationResult);
  }

  return translationResult || { success: false, error: "翻訳に失敗しました" };
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

    // テスト用にデフォルトモデルを使用
    const model = "gemini-2.0-flash-lite";

    // Gemini APIエンドポイントとAPIキーを組み合わせたURL
    const apiUrl = `${GEMINI_API_BASE}${model}${GEMINI_API_GENERATE}?key=${apiKey}`;

    // テストリクエストを送信
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prompt),
    });

    console.log(`APIテストレスポンスステータス: ${response.status}`);

    // レスポンスをチェック
    if (!response.ok) {
      // エラーの詳細を取得
      let errorDetails = "";
      try {
        const errorData = await response.json();
        errorDetails = errorData.error.message || `ステータスコード: ${response.status}`;
      } catch (jsonError) {
        errorDetails = `レスポンスの解析に失敗: ${jsonError.message}`;
      }

      console.error(`APIキーテスト失敗:`, errorDetails);
      return { valid: false, error: errorDetails };
    }

    // レスポンスをJSON解析
    const data = await response.json();

    // 翻訳結果を確認
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      console.log("APIキーは有効です");
      return { valid: true };
    } else {
      console.error("APIキーテスト: 無効なレスポンス形式", data);
      return { valid: false, error: "翻訳結果が不正な形式です" };
    }
  } catch (error) {
    console.error("APIキーテスト中のエラー:", error);
    return { valid: false, error: error.message };
  }
}
