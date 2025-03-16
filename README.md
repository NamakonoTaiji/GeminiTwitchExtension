# Twitch Gemini Translator

TwitchのチャットコメントをリアルタイムでGoogle Gemini 2.0 Flash APIを使って日本語に翻訳するChrome拡張機能です。

## 機能

- Twitchチャット内の英語（または非日本語）コメントをリアルタイムで検出
- Google Gemini 2.0 Flash APIを使用した自然な日本語翻訳
- 翻訳結果をオリジナルコメントの下に表示
- 拡張機能の有効/無効を切り替え可能
- 複数の翻訳モード（選択的翻訳、すべて翻訳、英語のみ翻訳）
- 翻訳キャッシュによるAPI使用量の最適化
- カスタマイズ可能な表示設定（色、フォントサイズなど）

## インストール方法

### 開発版のインストール（ローカル）

1. このリポジトリをクローンまたはダウンロードします
2. Chromeブラウザで `chrome://extensions/` にアクセス
3. 右上の「デベロッパーモード」をオン
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. ダウンロードしたフォルダを選択

### 設定方法

1. Chrome拡張機能のアイコンをクリックしてポップアップを表示
2. 「設定」ボタンをクリック
3. Google AI StudioでGemini APIキーを取得し、設定ページに入力
4. 必要に応じて翻訳モードや表示設定をカスタマイズ
5. 「保存」ボタンをクリック
6. ポップアップからトグルスイッチをオンにして翻訳機能を有効化

## 使用方法

1. Twitchの配信ページに移動
2. 拡張機能が自動的にチャットを監視し、設定に基づいて翻訳を表示

## APIキーの取得方法

1. [Google AI Studio](https://ai.google.dev/)にアクセス
2. Googleアカウントでログイン（必要に応じて新規作成）
3. APIキーを作成
4. 作成したAPIキーを本拡張機能の設定ページに入力

## 開発者向け情報

### ファイル構成

- `manifest.json`: 拡張機能の設定ファイル
- `background/`: バックグラウンドスクリプトフォルダ
  - `background.js`: APIリクエストの処理や設定管理を行うスクリプト
- `content/`: コンテンツスクリプトフォルダ
  - `content.js`: Twitchページに注入され、チャットを監視するスクリプト
- `popup/`: ポップアップUIフォルダ
  - `popup.html`: ポップアップのHTML
  - `popup.css`: ポップアップのスタイル
  - `popup.js`: ポップアップの機能を実装するスクリプト
- `options/`: 設定ページフォルダ
  - `options.html`: 設定ページのHTML
  - `options.css`: 設定ページのスタイル
  - `options.js`: 設定機能を実装するスクリプト
- `icons/`: アイコンフォルダ

### 技術スタック

- JavaScript (ES6+)
- Chrome Extension API
- MutationObserver API
- Google Gemini 2.0 Flash API

## ライセンス

MITライセンス
