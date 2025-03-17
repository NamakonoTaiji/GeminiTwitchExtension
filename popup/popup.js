document.addEventListener('DOMContentLoaded', async () => {
  const statusElement = document.getElementById('status');
  const apiStatusElement = document.getElementById('api-status');
  const enableTranslationCheckbox = document.getElementById('enableTranslation');
  const openOptionsButton = document.getElementById('openOptions');

  // 設定を読み込む
  const { enabled, apiKey } = await chrome.storage.sync.get({
    enabled: false,
    apiKey: ''
  });

  // UIを更新
  enableTranslationCheckbox.checked = enabled;
  updateStatusText(enabled);
  checkApiKey(apiKey);

  // トグルスイッチのイベントリスナー
  enableTranslationCheckbox.addEventListener('change', async () => {
    const newEnabled = enableTranslationCheckbox.checked;
    await chrome.storage.sync.set({ enabled: newEnabled });
    updateStatusText(newEnabled);
    
    // バックグラウンドスクリプトに設定更新を通知
    try {
      chrome.runtime.sendMessage({ action: 'settingsUpdated' });
    } catch (error) {
      console.error('バックグラウンド通知エラー:', error);
    }
    
    // content scriptに状態変更を通知
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.twitch.tv/*' });
      if (tabs.length > 0) {
        console.log(`${tabs.length}個のTwitchタブに通知します`);
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'toggleTranslation', enabled: newEnabled })
            .catch(err => console.error(`タブ${tab.id}への通知エラー:`, err));
        });
      } else {
        console.log('Twitchのタブが見つかりませんでした');
      }
    } catch (error) {
      console.error('Twitchタブ通知エラー:', error);
    }
  });

  // 設定ボタンのイベントリスナー
  openOptionsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ステータステキストの更新
  function updateStatusText(enabled) {
    statusElement.textContent = enabled ? '有効' : '無効';
    statusElement.className = enabled ? 'success' : '';
  }

  // APIキーのチェック
  async function checkApiKey(apiKey) {
    if (!apiKey) {
      apiStatusElement.textContent = 'Gemini API: キーが未設定です';
      apiStatusElement.className = 'error';
      return;
    }

    try {
      // バックグラウンドスクリプトにAPIキーチェックをリクエスト
      const response = await chrome.runtime.sendMessage({ action: 'checkApiKey' });
      
      if (response.valid) {
        apiStatusElement.textContent = 'Gemini API: 接続OK';
        apiStatusElement.className = 'success';
      } else {
        apiStatusElement.textContent = `Gemini API: ${response.error || 'エラー'}`;
        apiStatusElement.className = 'error';
      }
    } catch (error) {
      apiStatusElement.textContent = 'Gemini API: 確認できませんでした';
      apiStatusElement.className = 'error';
      console.error('API確認中のエラー:', error);
    }
  }
});
