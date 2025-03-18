/**
 * Twitch Gemini Translator - オプションページ
 * 
 * 拡張機能の設定ページを制御するスクリプト
 */

import { loadSettings, saveSettings, resetSettings } from '../shared/settingsManager.js';
import { 
  notifySettingsUpdated, 
  testApiKey,
  getStats,
  resetStats,
  clearCache
} from '../shared/messaging.js';
import { 
  showStatusMessage, 
  updateStatsDisplay,
  setupSliders,
  populateFormValues,
  getFormValues,
  setupApiKeyMasking,
  confirmAction,
  setTemporaryButtonState,
  startInterval,
  onDOMReady
} from '../shared/ui/index.js';
import { MESSAGE_TYPE } from '../shared/constants.js';

// DOMが読み込まれたときの処理
onDOMReady(async () => {
  // 要素のマッピング
  const elements = {
    // 設定要素
    apiKey: document.getElementById('apiKey'),
    enabled: document.getElementById('translationEnabled'),
    autoToggle: document.getElementById('autoToggle'),
    geminiModel: document.getElementById('geminiModel'),
    translationMode: document.getElementById('translationMode'),
    japaneseThreshold: document.getElementById('japaneseThreshold'),
    englishThreshold: document.getElementById('englishThreshold'),
    displayPrefix: document.getElementById('displayPrefix'),
    textColor: document.getElementById('textColor'),
    accentColor: document.getElementById('accentColor'),
    fontSize: document.getElementById('fontSize'),
    useCache: document.getElementById('useCache'),
    maxCacheAge: document.getElementById('maxCacheAge'),
    processExistingMessages: document.getElementById('processExistingMessages'),
    requestDelay: document.getElementById('requestDelay'),
    
    // 表示要素
    japaneseThresholdValue: document.getElementById('japaneseThresholdValue'),
    englishThresholdValue: document.getElementById('englishThresholdValue'),
    statusMessage: document.getElementById('status-message'),
    
    // ボタン
    toggleApiKeyVisibilityButton: document.getElementById('toggleApiKeyVisibility'),
    saveButton: document.getElementById('saveButton'),
    testButton: document.getElementById('testButton'),
    resetButton: document.getElementById('resetButton'),
    clearCacheButton: document.getElementById('clearCacheButton'),
    resetStatsButton: document.getElementById('resetStatsButton'),
    
    // 統計要素
    totalRequests: document.getElementById('totalRequests'),
    cacheHits: document.getElementById('cacheHits'),
    apiRequests: document.getElementById('apiRequests'),
    errors: document.getElementById('errors'),
    charactersTranslated: document.getElementById('charactersTranslated'),
    cacheSize: document.getElementById('cacheSize'),
    lastReset: document.getElementById('lastReset')
  };
  
  // 保存された設定を読み込む
  const settings = await loadSettings();
  
  // APIキーのマスク機能をセットアップ
  const apiKeyManager = setupApiKeyMasking(
    elements.apiKey, 
    elements.toggleApiKeyVisibilityButton, 
    settings.apiKey
  );
  
  // UIに設定値を反映
  populateFormValues(settings, elements);
  
  // スライダーと値表示を連動させる
  setupSliders([
    { slider: elements.japaneseThreshold, display: elements.japaneseThresholdValue },
    { slider: elements.englishThreshold, display: elements.englishThresholdValue }
  ]);
  
  // 保存ボタンのイベントリスナー
  elements.saveButton.addEventListener('click', async () => {
    try {
      // フォームから設定値を取得
      const formValues = getFormValues(elements);
      
      // APIキーを設定（マスク表示を考慮）
      formValues.apiKey = apiKeyManager.getApiKey();
      
      // 設定を保存
      await saveSettings(formValues);
      
      // 設定変更を通知
      await notifySettingsUpdated();
      
      // 成功メッセージを表示
      showStatusMessage(elements.statusMessage, '設定を保存しました', MESSAGE_TYPE.SUCCESS);
    } catch (error) {
      console.error('設定保存中のエラー:', error);
      showStatusMessage(elements.statusMessage, '設定の保存に失敗しました', MESSAGE_TYPE.ERROR);
    }
  });
  
  // APIテストボタンのイベントリスナー
  elements.testButton.addEventListener('click', async () => {
    const apiKey = apiKeyManager.getApiKey();
    
    if (!apiKey) {
      showStatusMessage(elements.statusMessage, 'APIキーを入力してください', MESSAGE_TYPE.ERROR);
      return;
    }
    
    // ボタンの状態を一時的に変更
    const originalState = setTemporaryButtonState(
      elements.testButton, 
      'テスト中...', 
      true, 
      10000, // 最大10秒
      null
    );
    
    try {
      // APIテストを実行
      const response = await testApiKey(apiKey);
      
      // ボタンを元に戻す
      setTemporaryButtonState(
        elements.testButton, 
        originalState.text, 
        originalState.disabled, 
        0, 
        null
      );
      
      if (response.valid) {
        showStatusMessage(elements.statusMessage, 'APIキーは有効です！接続に成功しました。', MESSAGE_TYPE.SUCCESS);
      } else {
        showStatusMessage(elements.statusMessage, `APIテストに失敗しました: ${response.error || '不明なエラー'}`, MESSAGE_TYPE.ERROR);
      }
    } catch (error) {
      // ボタンを元に戻す
      setTemporaryButtonState(
        elements.testButton, 
        originalState.text, 
        originalState.disabled, 
        0, 
        null
      );
      
      showStatusMessage(elements.statusMessage, 'APIテスト中にエラーが発生しました', MESSAGE_TYPE.ERROR);
      console.error('APIテスト中のエラー:', error);
    }
  });
  
  // リセットボタンのイベントリスナー
  elements.resetButton.addEventListener('click', async () => {
    if (confirmAction('すべての設定をデフォルトに戻しますか？APIキーは保持されます。')) {
      try {
        // 設定をリセット（APIキーは保持）
        const resetSettings = await resetSettings();
        
        // UIに反映
        populateFormValues(resetSettings, elements);
        
        // 設定変更を通知
        await notifySettingsUpdated();
        
        // 成功メッセージを表示
        showStatusMessage(elements.statusMessage, '設定をリセットしました', MESSAGE_TYPE.SUCCESS);
      } catch (error) {
        console.error('設定リセット中のエラー:', error);
        showStatusMessage(elements.statusMessage, '設定のリセットに失敗しました', MESSAGE_TYPE.ERROR);
      }
    }
  });
  
  // キャッシュクリアボタンのイベントリスナー
  elements.clearCacheButton.addEventListener('click', async () => {
    if (confirmAction('翻訳キャッシュをクリアしますか？')) {
      try {
        const success = await clearCache();
        
        if (success) {
          showStatusMessage(elements.statusMessage, 'キャッシュをクリアしました', MESSAGE_TYPE.SUCCESS);
          // 統計情報を再読み込み
          loadStats();
        } else {
          showStatusMessage(elements.statusMessage, 'キャッシュのクリアに失敗しました', MESSAGE_TYPE.ERROR);
        }
      } catch (error) {
        showStatusMessage(elements.statusMessage, 'キャッシュクリア中にエラーが発生しました', MESSAGE_TYPE.ERROR);
        console.error('キャッシュクリアエラー:', error);
      }
    }
  });
  
  // 統計リセットボタンのイベントリスナー
  elements.resetStatsButton.addEventListener('click', async () => {
    if (confirmAction('翻訳統計をリセットしますか？')) {
      try {
        const success = await resetStats();
        
        if (success) {
          showStatusMessage(elements.statusMessage, '統計情報をリセットしました', MESSAGE_TYPE.SUCCESS);
          // 統計情報を再読み込み
          loadStats();
        } else {
          showStatusMessage(elements.statusMessage, '統計情報のリセットに失敗しました', MESSAGE_TYPE.ERROR);
        }
      } catch (error) {
        showStatusMessage(elements.statusMessage, '統計リセット中にエラーが発生しました', MESSAGE_TYPE.ERROR);
        console.error('統計リセットエラー:', error);
      }
    }
  });
  
  // 統計情報を読み込む
  async function loadStats() {
    try {
      const stats = await getStats();
      
      if (stats) {
        // 統計表示を更新
        updateStatsDisplay(stats, elements);
      }
    } catch (error) {
      console.error('統計情報の読み込みに失敗:', error);
    }
  }
  
  // 初期ロード
  loadStats();
  
  // 30秒ごとに統計情報を更新
  startInterval(loadStats, 30000);
});
