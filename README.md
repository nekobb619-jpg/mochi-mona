# 🍡 Mochi Mona（モチ・モナ）

書画カメラ／Pixel で撮ったものを、

- **🌱 じぶん研究**：要約カード化 → Google ドライブ＆シート、Obsidian、NotebookLM へ
- **🎨 こども学習ハブ**：答案は保存せずに構造化 JSON だけ抽出 → 保護者ポータル／yumekawa へ

つなぐ、ビルド不要の Web アプリ＋GAS バックエンドです。

## 構成

```
mochi-mona/
├── index.html              メインUI（Tailwind CDN）
├── manifest.json           PWA（Pixel のホーム画面に追加）
├── icons/                  アイコン（svg / 192 / 512）
├── js/
│   ├── app.js              状態管理・画面切替・じぶん研究・設定
│   ├── api.js              GAS 通信（text/plain POST）＋ GAS 未接続時のローカル実装
│   ├── ai.js               プロンプト・Gemini 直接呼び出し・デモ用モック
│   ├── camera.js           書画カメラ 4K・180°・鉛筆くっきり・黒塗り/トリミング・2048px JPEG 圧縮
│   ├── kids-converter.js   こども学習ハブ（ポータル JSON / 類題 / 丸付け / 作品）
│   ├── quiz-validator.js   AGENTS.md 準拠チェッカー
│   ├── obsidian-export.js  obsidian:// 起動 ＆ File System Access API で .md 直接保存
│   └── school-units.js     単元マスタ u001〜u053（yumekawa のミラー）
├── gas/Code.gs             GAS バックエンド
└── tests/core.test.js      ロジックの単体テスト
```

`js/api.js` と `js/ai.js` は仕様書のファイル一覧に追加したものです（GAS 通信とプロンプトを app.js / kids-converter.js の両方から使うため分離）。

## 公開（GitHub Pages）

1. GitHub のリポジトリ → Settings → Pages
2. Source: Deploy from a branch ／ Branch: `main` ／ `/ (root)` → Save
3. 1〜2分後に `https://nekobb619-jpg.github.io/mochi-mona/` で開けます
4. Pixel では Chrome で開いて、メニュー →「ホーム画面に追加」

`index.html` をファイルとして直接開くと（file://）、Chrome の制限でカメラと JS モジュールが動きません。必ず https か localhost で開いてください。

## まず動かす（GAS なし・デモモード）

```bash
npm run serve        # → http://localhost:8080
```

- ES Modules とカメラは `file://` では動かないので、必ず localhost か https で開いてください。
- 設定が空ならサンプル応答（モック）で全画面が動きます。
- ⚙️ 設定で Gemini API キーとモデル名を入れると、ブラウザから直接 Gemini を呼びます（保存先は localStorage）。

## 本番（GAS 接続）

1. script.google.com で新規プロジェクト → `gas/Code.gs` を貼り付け
2. スクリプトプロパティに `GEMINI_API_KEY` / `GEMINI_MODEL_FAST` / `GEMINI_MODEL_DEEP`（どちらも **版固定**。`latest` はエラーにしています）
3. `setup()` を1回実行 → シート4枚・ドライブフォルダ・NotebookLM 用 Doc・`MOCHI_TOKEN` が作られ、ログに出ます
4. デプロイ → ウェブアプリ（実行: 自分 ／ アクセス: **全員**）
5. フロントの ⚙️ 設定に `/exec` URL と `MOCHI_TOKEN` を入力 → 「接続テスト」
6. 任意：`installInboxTrigger()` で `Mochi_Inbox` を15分おきに自動取込

任意プロパティ:
- `YUMEKAWA_SPREADSHEET_ID` … 設定すると `quiz_drafts` を yumekawa 側のスプレッドシートに書きます
- `INBOX_AUTO_NOTEBOOKLM=true` … Inbox 取込分も NotebookLM 用 Doc に追記

## 仕様書から変えた／決めたところ

| 項目 | 内容 |
|---|---|
| GAS のアクセス権 | 仕様書の「自分のみ」は GitHub Pages からの fetch が Google ログインへリダイレクトされて CORS で失敗するため、**「全員」＋合言葉トークン必須**にしました。トークンが無いリクエストはすべて拒否します。 |
| ポータル JSON の形 | 保護者ポータルの取りこみ仕様が手元に無いため `schema: "mochi-mona/portal-import@1"` で `meetings` / `allowTests` / `events` / `letters` / `q_awards` を出しています。形を合わせるときは `kids-converter.js` の `toPortalPayload()` だけ直せば済みます。 |
| yumekawa 類題の `c` | 正解の **0始まりインデックス** として扱っています。yumekawa 側が違う場合は `quiz-validator.js` と プロンプトの該当行を直してください。 |
| 単元マスタ | u001〜u053 は小4の一般的な単元で作った**仮データ**です。yumekawa の `school-units.js` で丸ごと置き換えてください（`id/subject/title/start/end` を使用）。 |
| Inbox 取込後のファイル | 成功分はカード画像として `Mochi_Media` へ移動、失敗分は `ERROR_` を付けて `Mochi_Inbox_Processed` へ移動（同じファイルで何度も失敗し続けないため）。 |
| こどもモードの PDF | 黒塗りできないため受け付けません（画像のみ）。 |
| 連続撮影（じぶん研究） | 複数ページは1枚のカードにまとめ、`drive_file_id` にカンマ区切りで全ページの ID を入れます。 |

## プライバシーの実装メモ

- `analyze_kids`（GAS）とこどもモードのフロントには DriveApp・保存処理への経路がありません。例外は「作品アーカイブ」＋同意チェック（`explicitConsent: true`）のみ。
- 分析が終わると成功・失敗にかかわらず Base64 への参照を破棄します。
- AI の応答は、設定④の「呼び名 → Learner-A」「伏せる語 → ●●」で再置換してから表示・保存します。
- ⚠️ 画像そのものは Gemini API には送られます。Gemini API の**無料枠ではデータが品質改善に使われる場合がある**ため、子どもの答案を扱うなら有料枠（Cloud Billing 有効）のキーを使うことを推奨します。

## チェック

```bash
npm run check   # 全 JS と Code.gs の構文チェック
npm test        # 単元推定・類題チェッカー・匿名化・ポータル JSON のテスト（17件）
```
