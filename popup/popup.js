/**
 * Twitch Gemini Translator - ポップアップUI
 * 
 * 拡張機能のポップアップUIを制御するスクリプト
 */

import { loadSettings } from '../shared/settingsManager.js';
import { toggleTranslation } from '../shared/messaging.js';
import { 
  updateStatusText, 
  updateApiStatus, 
  openOptionsPage,
  onDOMReady
} from '../shared/ui/index.js';

// DOMが読み込まれたときの処理
onDOMReady(async () => {
  // 要素の取得
  const statusElement = document.getElementById('status');
  const apiStatusElement = document.getElementById('api-status');
  const enableTranslationCheckbox = document.getElementById('enableTranslation');
  const openOptionsButton = document.getElementById('openOptions');

  // 設定を読み込む
  const settings = await loadSettings();

  // UIを更新
  enableTranslationCheckbox.checked = settings.enabled;
  updateStatusText(statusElement, settings.enabled);
  updateApiStatus(apiStatusElement, settings.apiKey);

  // トグルスイッチのイベントリスナー
  enableTranslationCheckbox.addEventListener('change', async () => {
    const newEnabled = enableTranslationCheckbox.checked;
    
    try {
      // 翻訳機能の有効/無効を切り替え
      await toggleTranslation(newEnabled);
      
      // UI更新
      updateStatusText(statusElement, newEnabled);
    } catch (error) {
      console.error('翻訳機能の切り替え中にエラー:', error);
      
      // 失敗した場合は元の状態に戻す
      enableTranslationCheckbox.checked = !newEnabled;
      updateStatusText(statusElement, !newEnabled);
    }
  });

  // 設定ボタンのイベントリスナー
  openOptionsButton.addEventListener('click', openOptionsPage);
});
