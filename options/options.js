document.addEventListener('DOMContentLoaded', async () => {
  // 要素の取得
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyVisibilityButton = document.getElementById('toggleApiKeyVisibility');
  const saveButton = document.getElementById('saveButton');
  const testButton = document.getElementById('testButton');
  const resetButton = document.getElementById('resetButton');
  const statusMessage = document.getElementById('status-message');
  const translationEnabledCheckbox = document.getElementById('translationEnabled');
  const autoToggleCheckbox = document.getElementById('autoToggle');
  const geminiModelSelect = document.getElementById('geminiModel');
  const translationModeSelect = document.getElementById('translationMode');
  const japaneseThresholdInput = document.getElementById('japaneseThreshold');
  const japaneseThresholdValue = document.getElementById('japaneseThresholdValue');
  const englishThresholdInput = document.getElementById('englishThreshold');
  const englishThresholdValue = document.getElementById('englishThresholdValue');
  const displayPrefixInput = document.getElementById('displayPrefix');
  const textColorInput = document.getElementById('textColor');
  const accentColorInput = document.getElementById('accentColor');
  const fontSizeSelect = document.getElementById('fontSize');
  const useCacheCheckbox = document.getElementById('useCache');
  const maxCacheAgeInput = document.getElementById('maxCacheAge');
  const clearCacheButton = document.getElementById('clearCacheButton');
  const resetStatsButton = document.getElementById('resetStatsButton');
  
  // 統計要素の取得
  const totalRequestsElement = document.getElementById('totalRequests');
  const cacheHitsElement = document.getElementById('cacheHits');
  const apiRequestsElement = document.getElementById('apiRequests');
  const errorsElement = document.getElementById('errors');
  const charactersTranslatedElement = document.getElementById('charactersTranslated');
  const cacheSizeElement = document.getElementById('cacheSize');
  const lastResetElement = document.getElementById('lastReset');
  
  // 設定のデフォルト値
  const defaultSettings = {
    apiKey: '',
    enabled: false,
    autoToggle: true, // URLに基づいて自動的にON/OFFする機能
    translationMode: 'selective',
    japaneseThreshold: 30,
    englishThreshold: 50,
    displayPrefix: '🇯🇵',
    textColor: '#9b9b9b',
    accentColor: '#9147ff',
    fontSize: 'medium',
    useCache: true,
    maxCacheAge: 24,
    processExistingMessages: false, // 既存コメントを処理するかどうか（デフォルトはfalse）
    requestDelay: 100, // リクエスト間の最小遅延（ミリ秒）
    geminiModel: 'gemini-2.0-flash-lite' // 使用するGeminiモデル: 'gemini-2.0-flash-lite', 'gemini-2.0-flash'
  };
  
  // 保存された設定を読み込む
  const settings = await chrome.storage.sync.get(defaultSettings);
  
  // 実際のAPIキーを保持する変数
  let actualApiKey = settings.apiKey;
  
  // UIを初期状態に設定
  if (actualApiKey) {
    // APIキーをマスク表示
    apiKeyInput.value = '•'.repeat(Math.min(actualApiKey.length, 20));
    apiKeyInput.setAttribute('data-masked', 'true');
  } else {
    apiKeyInput.value = '';
    apiKeyInput.setAttribute('data-masked', 'false');
  }
  translationEnabledCheckbox.checked = settings.enabled;
  autoToggleCheckbox.checked = settings.autoToggle !== undefined ? settings.autoToggle : true;
  translationModeSelect.value = settings.translationMode;
  japaneseThresholdInput.value = settings.japaneseThreshold;
  japaneseThresholdValue.textContent = `${settings.japaneseThreshold}%`;
  englishThresholdInput.value = settings.englishThreshold;
  englishThresholdValue.textContent = `${settings.englishThreshold}%`;
  displayPrefixInput.value = settings.displayPrefix;
  textColorInput.value = settings.textColor;
  accentColorInput.value = settings.accentColor;
  fontSizeSelect.value = settings.fontSize;
  useCacheCheckbox.checked = settings.useCache;
  maxCacheAgeInput.value = settings.maxCacheAge;
  
  // 新しい設定オプションのUI初期化
  const processExistingMessagesCheckbox = document.getElementById('processExistingMessages');
  const requestDelayInput = document.getElementById('requestDelay');
  
  if (processExistingMessagesCheckbox) {
    processExistingMessagesCheckbox.checked = settings.processExistingMessages;
  }
  
  if (requestDelayInput) {
    requestDelayInput.value = settings.requestDelay;
  }
  
  if (geminiModelSelect) {
    geminiModelSelect.value = settings.geminiModel || 'gemini-2.0-flash-lite';
  }
  
  // 統計情報を読み込む
  loadStats();
  
  // スライダー値の表示を更新
  japaneseThresholdInput.addEventListener('input', () => {
    japaneseThresholdValue.textContent = `${japaneseThresholdInput.value}%`;
  });
  
  englishThresholdInput.addEventListener('input', () => {
    englishThresholdValue.textContent = `${englishThresholdInput.value}%`;
  });
  
  // APIキー表示切替ボタンのイベントリスナー
  if (toggleApiKeyVisibilityButton) {
    toggleApiKeyVisibilityButton.addEventListener('click', () => {
      const isMasked = apiKeyInput.getAttribute('data-masked') === 'true';
      
      if (isMasked) {
        // マスクを解除して実際のAPIキーを表示
        apiKeyInput.value = actualApiKey;
        apiKeyInput.setAttribute('data-masked', 'false');
        toggleApiKeyVisibilityButton.textContent = '非表示';
      } else {
        // APIキーをマスク表示
        if (actualApiKey) {
          apiKeyInput.value = '•'.repeat(Math.min(actualApiKey.length, 20));
          apiKeyInput.setAttribute('data-masked', 'true');
          toggleApiKeyVisibilityButton.textContent = '表示';
        }
      }
    });
  }
  
  // APIキー入力フィールドのフォーカスイベント
  apiKeyInput.addEventListener('focus', () => {
    // マスクされている場合は、フォーカス時に空にする
    if (apiKeyInput.getAttribute('data-masked') === 'true') {
      apiKeyInput.value = '';
      apiKeyInput.setAttribute('data-masked', 'false');
      if (toggleApiKeyVisibilityButton) {
        toggleApiKeyVisibilityButton.textContent = '非表示';
      }
    }
  });
  
  // APIキー入力フィールドの変更イベント
  apiKeyInput.addEventListener('input', () => {
    // 入力中はマスク解除状態を維持
    actualApiKey = apiKeyInput.value.trim();
    apiKeyInput.setAttribute('data-masked', 'false');
  });
  
  // 保存ボタンのイベントリスナー
  saveButton.addEventListener('click', async () => {
    // 現在の入力値を取得（マスクされていない場合は入力値、マスクされている場合は保存済みの値）
    const apiKeyToSave = apiKeyInput.getAttribute('data-masked') === 'true' ? 
      actualApiKey : apiKeyInput.value.trim();
    
    // 新しい設定を作成
    const newSettings = {
      apiKey: apiKeyToSave,
      enabled: translationEnabledCheckbox.checked,
      autoToggle: autoToggleCheckbox.checked,
      translationMode: translationModeSelect.value,
      japaneseThreshold: parseInt(japaneseThresholdInput.value),
      englishThreshold: parseInt(englishThresholdInput.value),
      displayPrefix: displayPrefixInput.value,
      textColor: textColorInput.value,
      accentColor: accentColorInput.value,
      fontSize: fontSizeSelect.value,
      useCache: useCacheCheckbox.checked,
      maxCacheAge: parseInt(maxCacheAgeInput.value),
      processExistingMessages: document.getElementById('processExistingMessages')?.checked || false,
      requestDelay: parseInt(document.getElementById('requestDelay')?.value || '100'),
      geminiModel: geminiModelSelect.value || 'gemini-2.0-flash-lite'
    };
    
    // 設定を保存
    await chrome.storage.sync.set(newSettings);
    
    // ステータスメッセージを表示
    showStatusMessage('設定を保存しました', 'success');
    
    // バックグラウンドスクリプトに設定変更を通知
    chrome.runtime.sendMessage({ action: 'settingsUpdated' });
    
    // アクティブなTwitchタブに通知
    notifyActiveTabs();
  });
  
  // APIテストボタンのイベントリスナー
  testButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatusMessage('APIキーを入力してください', 'error');
      return;
    }
    
    // テスト中表示
    testButton.disabled = true;
    testButton.textContent = 'テスト中...';
    
    try {
      // APIテストを実行
      const response = await testGeminiApi(apiKey);
      
      // テスト完了、ボタンを元に戻す
      testButton.disabled = false;
      testButton.textContent = 'APIテスト';
      
      if (response.valid) {
        showStatusMessage('APIキーは有効です！接続に成功しました。', 'success');
      } else {
        showStatusMessage(`APIテストに失敗しました: ${response.error || '不明なエラー'}`, 'error');
      }
    } catch (error) {
      // エラー発生時、ボタンを元に戻す
      testButton.disabled = false;
      testButton.textContent = 'APIテスト';
      
      showStatusMessage('APIテスト中にエラーが発生しました', 'error');
      console.error('APIテスト中のエラー:', error);
    }
  });
  
  // リセットボタンのイベントリスナー
  resetButton.addEventListener('click', async () => {
    if (confirm('すべての設定をデフォルトに戻しますか？APIキーは保持されます。')) {
      // APIキーを保持
      const apiKey = apiKeyInput.value;
      
      // 設定をデフォルトに戻す（APIキーは保持）
      const resetSettings = { ...defaultSettings, apiKey };
      await chrome.storage.sync.set(resetSettings);
      
      // UIを更新
      translationEnabledCheckbox.checked = resetSettings.enabled;
      translationModeSelect.value = resetSettings.translationMode;
      japaneseThresholdInput.value = resetSettings.japaneseThreshold;
      japaneseThresholdValue.textContent = `${resetSettings.japaneseThreshold}%`;
      englishThresholdInput.value = resetSettings.englishThreshold;
      englishThresholdValue.textContent = `${resetSettings.englishThreshold}%`;
      displayPrefixInput.value = resetSettings.displayPrefix;
      textColorInput.value = resetSettings.textColor;
      accentColorInput.value = resetSettings.accentColor;
      fontSizeSelect.value = resetSettings.fontSize;
      useCacheCheckbox.checked = resetSettings.useCache;
      maxCacheAgeInput.value = resetSettings.maxCacheAge;
      
      // 新しい設定オプションのUI更新
      if (processExistingMessagesCheckbox) {
        processExistingMessagesCheckbox.checked = resetSettings.processExistingMessages;
      }
      
      if (requestDelayInput) {
        requestDelayInput.value = resetSettings.requestDelay;
      }
      
      if (geminiModelSelect) {
        geminiModelSelect.value = resetSettings.geminiModel || 'gemini-2.0-flash-lite';
      }
      
      // ステータスメッセージを表示
      showStatusMessage('設定をリセットしました', 'success');
      
      // バックグラウンドスクリプトに設定変更を通知
      chrome.runtime.sendMessage({ action: 'settingsUpdated' });
      
      // アクティブなTwitchタブに通知
      notifyActiveTabs();
    }
  });
  
  // キャッシュクリアボタンのイベントリスナー
  clearCacheButton.addEventListener('click', async () => {
    if (confirm('翻訳キャッシュをクリアしますか？')) {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'clearCache' });
        
        if (response.success) {
          showStatusMessage('キャッシュをクリアしました', 'success');
          // 統計情報を再読み込み
          loadStats();
        } else {
          showStatusMessage('キャッシュのクリアに失敗しました', 'error');
        }
      } catch (error) {
        showStatusMessage('キャッシュクリア中にエラーが発生しました', 'error');
        console.error('キャッシュクリアエラー:', error);
      }
    }
  });
  
  // 統計リセットボタンのイベントリスナー
  resetStatsButton.addEventListener('click', async () => {
    if (confirm('翻訳統計をリセットしますか？')) {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'resetStats' });
        
        if (response.success) {
          showStatusMessage('統計情報をリセットしました', 'success');
          // 統計情報を再読み込み
          loadStats();
        } else {
          showStatusMessage('統計情報のリセットに失敗しました', 'error');
        }
      } catch (error) {
        showStatusMessage('統計リセット中にエラーが発生しました', 'error');
        console.error('統計リセットエラー:', error);
      }
    }
  });
  
  // 統計情報を読み込む
  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStats' });
      
      if (response.success && response.stats) {
        const stats = response.stats;
        
        // 統計表示を更新
        totalRequestsElement.textContent = stats.totalRequests.toLocaleString();
        cacheHitsElement.textContent = stats.cacheHits.toLocaleString();
        apiRequestsElement.textContent = stats.apiRequests.toLocaleString();
        errorsElement.textContent = stats.errors.toLocaleString();
        charactersTranslatedElement.textContent = stats.charactersTranslated.toLocaleString();
        cacheSizeElement.textContent = stats.cacheSize.toLocaleString();
        
        // 最終リセット日時を表示
        const lastReset = new Date(stats.lastReset);
        lastResetElement.textContent = lastReset.toLocaleString();
      }
    } catch (error) {
      console.error('統計情報の読み込みに失敗:', error);
    }
  }
  
  // アクティブなTwitchタブに設定変更を通知
  async function notifyActiveTabs() {
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.twitch.tv/*' });
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated' });
      });
    } catch (error) {
      console.error('Twitchタブへの通知エラー:', error);
    }
  }
  
  // ステータスメッセージの表示
  function showStatusMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    
    // 5秒後にメッセージを非表示にする
    setTimeout(() => {
      statusMessage.className = 'status-message';
    }, 5000);
  }
  
  // Gemini APIのテスト
  async function testGeminiApi(apiKey) {
    try {
      // バックグラウンドスクリプトにAPIテストをリクエスト
      return await chrome.runtime.sendMessage({ 
        action: 'testApiKey', 
        apiKey 
      });
    } catch (error) {
      console.error('APIテスト中のエラー:', error);
      return { valid: false, error: error.message };
    }
  }
  
  // 30秒ごとに統計情報を更新
  setInterval(loadStats, 30000);
});
