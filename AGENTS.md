# AGENTS.md — Mochi Mona 開発ルール（Claude Code / Codex 共通）

このファイルは、どの AI・どのチャットで作業しても同じ前提に立つための「最初に読む1枚」です。
`CLAUDE.md` は このファイルを読むよう 指示するだけの ファイルです（内容は ここに 一本化）。

## 1. これは何か
- **Mochi Mona（モチ・モナ）**：書画カメラ／スマホで撮った紙を AI で整理する、保護者用の Web アプリ。
  - 🌱 **じぶん研究**：本・資格・メモ → 要約カード → Google ドライブ＆シート、Obsidian、NotebookLM。
  - 🎨 **こども学習ハブ**：テスト・宿題・配布物・ノート → **画像は保存せず** 構造化 JSON だけ作る → 既存の こども学習システムへ 渡す。
- 公開 URL：https://nekobb619-jpg.github.io/mochi-mona/ （`main` に入ると GitHub Pages に そのまま 出る）
- 管理：保護者（リポジトリの 持ち主）。変更は **ブランチ → PR** で 出し、保護者が マージする。

## 2. つながる 既存システム（ここを 壊さないことが 最優先）
| システム | 役割 | Mochi Mona との 関係 |
|---|---|---|
| **yumekawa**（`nekobb619-jpg/yumekawa`、GitHub Pages＋GAS） | 子どもが 毎日 使う 学習アプリ（4年生） | 単元マスタの **正本**（`js/school-units.js`）。類題は yumekawa の 問題の 形で 渡す |
| **こども学習サポートポータル**（claude.ai の 非公開ページ） | 保護者の 作戦ボード（対策会議・単元カレンダー・おこづかい帳 など） | Mochi Mona の「ポータル用 JSON」を「取りこみ」タブに 貼ると 取りこめる |
| **Obsidian Vault**（`nekobb619-jpg/myobsidianvault`） | 方針・手順・ログ | このプロジェクトの メモは `30_Projects/mochi-mona/README.md` |
| **接続ボード**（claude.ai の 非公開ページ https://claude.ai/artifact/9Y3um3sCryh5SBDd6pYvRt ） | Mochi Mona × yumekawa の 決めること・作業・PR・データの 流れ | 保護者が 決めた ことは ここに ある。作業の 前に 読み、終わったら 状態を 更新する |

データの 形（コレクション名・フィールド）の 正本は **[docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md)**。
形を 変えるときは、DATA_CONTRACT・`js/kids-converter.js`・テスト・相手側（ポータル／yumekawa）を **同じ PR で** そろえる。

## 3. 絶対ルール（プライバシー）
- 子どもは **`Learner-A`** と 書く。名前・学校名・クラス・先生や 友だちの 名前・**地名**を、コード・データ・プロンプト・テスト・コミットに 入れない。
  - **このリポジトリは 公開**。単元名に 地名が 入る ときは 消してから 入れる（`tools/sync-school-units.mjs` の `MASK`）。
- こどもモードの テスト・宿題・配布物・通知表の **画像は どこにも 保存しない**（ドライブ・シート・localStorage すべて）。解析後は 参照を 捨てる。
  - 例外は「作品アーカイブ」＋保護者の 同意チェック（`explicitConsent: true`）の ときだけ。
- 画像そのものは Gemini API に 送られる。無料枠は 品質改善に 使われる ことが あるので、答案を 扱うなら 有料枠の キーを 使う（README に 記載）。
- 診断名・能力ラベルを 出さない。「仮説（A 理解／B 記憶／C 読み落とし／D 実行ミス／E 表現）」と「次の一手」まで。
- API キー・合言葉トークン・GAS の URL を コミットしない（設定画面 → localStorage、GAS は スクリプトプロパティ）。

## 4. 実装の 決まりごと
- **ビルドなし**の 素の HTML／ES Modules／Tailwind CDN。`file://` では 動かない（`npm run serve` → http://localhost:8080）。
- **プロンプトは 2か所に ある**：`js/ai.js`（ブラウザ直結・デモ用）と `gas/Code.gs`（本番）。**片方を 直したら もう片方も 同じに する。**
- **モデル名は 直書き しない**：GAS の スクリプトプロパティ `GEMINI_MODEL_FAST` ／ `GEMINI_MODEL_DEEP`。`latest` は エラーに して いる（版固定）。
- **単元マスタ**：`js/school-units.js` は yumekawa の ミラー。手で 書きかえず `node tools/sync-school-units.mjs <yumekawa>/js/school-units.js` で 作り直す。
  id（u001〜u053）は yumekawa・ポータルと 共通の キー。**番号を 振り直さない。**
- **類題**：yumekawa の 4択（`a` は 4つ、`c` は 0始まり）。保存・コピー時に `toYumekawaQuiz()` で `scenario` を `[{name, icon, msg}]` に する。
  `quiz-validator.js` は yumekawa AGENTS.md 3.5（ヒントに 答えを 書かない・正解だけ 長く しない・ふざけた 誤答なし・元問題の 丸写し禁止・解説に 💡 考えるポイント）を 機械で 見る。
  - **あまりの ある わり算に「同じ 数で わっても 商は 変わらない」性質を 使う 類題は 作らない**（あまりは 変わる。例：72÷28＝2あまり16、18÷7＝2あまり4）。
- GAS への リクエストは `Content-Type: text/plain` の JSON（CORS プリフライト回避）。GAS は「全員」公開＋合言葉トークン必須。

## 5. 作業の 流れ
1. `main` から ブランチを 切る（例：`claude/xxxx`）。
2. 変更 → `npm run check`（全 JS と Code.gs の 構文）→ `npm test`（ロジックの テスト）。
3. 画面を 変えたら `npm run serve` で 開いて 確認（PC 1366px と スマホ 412px）。
4. PR に「何を 変えたか・確かめた こと・GAS の 貼りかえが 要るか」を 書く。
5. **GAS（`gas/Code.gs`）を 変えた PR** は、保護者が script.google.com に 全文を 貼りかえて「デプロイを管理 → 新バージョン」が 必要。PR に その旨を 必ず 書く。
6. Vault の `30_Projects/mochi-mona/README.md` の「進捗ログ」に 1行 足す。

## 6. いま わかって いる 未解決（2026-10-18）
- ノート丸付けの Q は「目安」を 出すだけ。yumekawa の Q を 実際に ふやす 経路は 未実装（yumekawa 側の GAS 変更が 必要）。
- `quiz_drafts`（Mochi Mona）と yumekawa の `question_drafts`（既存の レビュー用シート）は 別物。いまは「類題 JSON を コピー → Claude の セッションで レビューして 追加」で 運用。
- 画面の 見た目は、Claude の クラウド環境からは Tailwind CDN・github.io に つながらず 確認できない。手元の ブラウザで 見る。
