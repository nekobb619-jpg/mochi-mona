# DATA_CONTRACT — Mochi Mona と 既存システムの あいだの データの 形

ここが **正本**。形を 変えるときは、この ファイル・`js/kids-converter.js`・`tests/core.test.js`・相手側（ポータル／yumekawa）を 同じ PR で そろえる。
学習者は いつも `Learner-A`。名前・学校・地名は 入れない。

---

## 1. 単元 id（3か所 共通の キー）
- 正本：yumekawa `js/school-units.js` の `window.SCHOOL_UNITS`（＝ポータルの 単元カレンダー `units`）。
- Mochi Mona：`js/school-units.js` の `SCHOOL_UNITS`（`tools/sync-school-units.mjs` で 生成）。

```js
{ id: "u007", subject: "算数", title: "2けたでわるわり算の筆算", start: "09-01", end: "10-23",
  allYear?: true,                      // 通年（yumekawa の term "0"）
  stages: ["算数/わり算/hissan_2digit01", ...] }  // yumekawa の ステージ id（類題の 置き場所の 候補）
```
- 教科：算数・国語・理科・社会・探究・英語。
- 期間を 直す ときは ポータル → yumekawa → Mochi Mona（sync）の 順に そろえる。

---

## 2. ポータル用 JSON（「📋 ポータル用JSONをコピー」→ ポータルの「取りこみ」タブに 貼る）

```json
{
  "kind": "mochi-mona-portal",
  "schema": "mochi-mona/portal-import@2",
  "exported_at": "2026-10-18T10:00:00.000Z",
  "learner": "Learner-A",
  "source": "mochi-mona",
  "meetings":   [ ... ],
  "allowTests": [ ... ],
  "events":     [ ... ],
  "letters":    [ ... ]
}
```
ポータルは `kind === "mochi-mona-portal"` を 見て、下の 各配列を 同じ 名前の コレクションへ 入れる。
**同じ 内容を 2回 貼っても ふえない**よう、ポータル側で 内容から id を 作る（`mm-<種類>-<ハッシュ>`）。

### meetings（対策会議）— テスト・宿題
| フィールド | 意味 | ポータルでの 使い方 |
|---|---|---|
| `date` | YYYY-MM-DD | 会議の 日付 |
| `source` | `テスト` / `宿題` | もとに なった もの |
| `subject` | 算数 など | 教科 |
| `unit` / `unit_id` | 単元名 / u0xx | 単元 |
| `did` | できたこと（1文） | 「できたこと」 |
| `hyps` | `[{ cls: "A"〜"E", text }]` | つまずきの 仮説（A 理解・B 記憶・C 読み落とし・D 実行ミス・E 表現） |
| `child` | 子どもと する こと（次の一手） | 「子どもとすること」 |
| `check` / `checkDate` | 1週間後に 見る こと / その 日（date＋7日） | 確認の 日が 来ると ホームに 出る |
| `adult`, `talk`, `proposals` | 空で 渡す（保護者が ポータルで 書く） | |
| `result` | `null` | 確認後に 保護者が「続ける／変えてみる／やめる」 |
| `score` | `"80 / 100"`（テストのみ） | 表示用 |
| `title`, `observations`, `learner`, `from` | 参考（ポータルは 表示しない 項目も ある） | |

### allowTests（おこづかい帳の テスト点数）— テストのみ
`{ date, subject, score, full, yen, note, unit_id, from }`
- `yen` は ポータルの きまり：満点の 60%以上 10円・90%以上 50円・100% 100円（いちばん 高い 1つ）。`kids-converter.js` の `testYen()`。
- 点数が 読めなかった テストは 入れない。

### events（学校の 予定）— 配布物
`{ date, title, kind: "行事" | "テスト", note, from }`（`note` に 時間・服装・持ち物を まとめる）

### letters（学級通信の 要点）— 配布物
`{ date, no, title, points: [..], from }`（`no` は 号数。わからなければ 空文字）

### ポータルに 入らない もの
- `q_awards`（ノート丸付けの Q の 目安）：Q は yumekawa の セーブデータに あるため。いまは 記録用。

---

## 3. yumekawa 用の 類題（「類題JSONをコピー」／ `quiz_drafts` シートの `quiz_json`）

yumekawa の `js/quizzes/*.js` の 1問と 同じ 形（`toYumekawaQuiz()` で 変換）：
```json
{ "q": "問題文", "a": ["4つの", "選択肢", "を", "そろえる"], "c": 1,
  "hint": "答えを 書かない ヒント", "job_title": "〇〇の依頼",
  "job_desc": "解説…\n💡 考えるポイント：…",
  "scenario": [{ "name": "ニコ", "icon": "🦄", "msg": "状況の 1〜2文" }] }
```
- `quiz_drafts` の 列：`draft_id | created_at | target_stage_id | unit_id | quiz_json | validation_status | approved`
  - `target_stage_id` は yumekawa の ステージ id（単元の `stages[0]` が 初期値）。
- yumekawa に 入れる 前に、Claude が yumekawa AGENTS.md 3.5 で もう一度 見る（自動では 入らない）。
- yumekawa の 既存の 下書きシート `question_drafts`（Gemini 週次生成）とは 別。合流は 未定。

---

## 4. 変更履歴
- 2026-10-18 `portal-import@2`：ポータルの 本物の フィールド名に 合わせた（@1 は Mochi Mona 独自の 形で、ポータルに 取りこめなかった）。単元マスタを yumekawa の 正本に 差しかえ。類題を 4択・scenario 配列に。
