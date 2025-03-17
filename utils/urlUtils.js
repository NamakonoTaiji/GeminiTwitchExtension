/**
 * URLユーティリティモジュール
 *
 * Twitch URLの分析と判定を行う関数群を提供します。
 */

/**
 * URLが配信視聴ページかどうかを判定
 * @param {string} url 判定するURL
 * @returns {boolean} 配信視聴ページの場合はtrue
 */
export function isStreamPage(url) {
  // 入力が空または定義されていない場合は非配信ページと判定
  if (!url) {
    return false;
  }
  
  try {
    // URLオブジェクトを作成
    const urlObj = new URL(url);

    // ホスト名がtwitch.tvであることを確認
    if (!urlObj.hostname.includes("twitch.tv")) {
      return false;
    }

    const pathname = urlObj.pathname.toLowerCase();

    // ホーム画面のパスは配信ページではない
    if (pathname === "/" || pathname === "") {
      return false;
    }

    // 特定の非配信ページパターン
    const nonStreamPathPatterns = [
      "/directory",      // ディレクトリページ
      "/settings",       // 設定ページ
      "/wallet",         // ウォレットページ
      "/drops",          // ドロップページ
      "/privacy",        // プライバシーページ
      "/following",      // フォロー中ページ
      "/search",         // 検索ページ
      "/subscriptions",  // サブスクリプションページ
      "/inventory",      // インベントリページ
      "/store",          // ストアページ
      "/games",          // ゲームページ
      "/downloads",      // ダウンロードページ
      "/events",         // イベントページ
      "/messages",       // メッセージページ
      "/turbo",          // Turbo ページ
      "/prime",          // Prime ページ
      "/p/",             // ポップアウトページ
      "/products",       // 製品ページ
      "/user",           // ユーザーページ
      "/notifications",  // 通知ページ
    ];

    // 特定の非配信ページとの一致をチェック
    for (const pattern of nonStreamPathPatterns) {
      // 完全一致の場合
      if (pathname === pattern) {
        return false;
      }
      
      // 前方一致の場合（パターン + '/'を含む場合）
      if (pathname.startsWith(pattern + "/")) {
        return false;
      }
    }

    // 特定のホスト名の除外（配信ページではないサブドメイン）
    const nonStreamSubdomains = ["dashboard", "dev", "blog", "help", "clips"];
    
    // サブドメインを取得
    const subdomain = urlObj.hostname.split('.')[0];
    
    // サブドメインが除外リストに含まれる場合
    if (nonStreamSubdomains.includes(subdomain)) {
      return false;
    }

    // 特定のパスパターンを含む場合
    const containsNonStreamPatterns = [
      "/clip/",    // クリップページ
      "/videos/",  // ビデオページ
      "/about/",   // アバウトページ
      "/schedule", // スケジュールページ
      "/chat",     // チャットポップアウト
    ];
    
    for (const pattern of containsNonStreamPatterns) {
      if (pathname.includes(pattern)) {
        return false;
      }
    }

    // パス名の先頭がチャンネル名を示す場合（ここまでで除外されていなければ）配信ページと判断
    return true;
  } catch (error) {
    // エラーが発生した場合はログ出力しないようにして非配信ページと判定
    return false;
  }
}

/**
 * URLからチャンネル名を取得
 * @param {string} url URL文字列
 * @returns {string} チャンネル名（取得できない場合は空文字）
 */
export function getChannelFromUrl(url) {
  try {
    const urlObj = new URL(url);
    // パスの最初のセグメントを取得
    const match = urlObj.pathname.match(/^\/([^\/]+)/);
    
    if (!match) {
      return "";
    }
    
    const potentialChannel = match[1];
    
    // 既知の非チャンネルパスは除外
    const nonChannelPaths = [
      "directory", "settings", "wallet", "drops", "privacy",
      "following", "search", "subscriptions", "inventory",
      "store", "games", "downloads", "events", "messages",
      "turbo", "prime", "p", "products", "user", "notifications"
    ];
    
    if (nonChannelPaths.includes(potentialChannel)) {
      return "";
    }
    
    return potentialChannel;
  } catch (error) {
    console.error("[Twitch Translator] チャンネル名取得エラー:", error);
    return "";
  }
}
