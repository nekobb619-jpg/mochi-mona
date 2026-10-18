/**
 * Mochi Mona — Google Apps Script バックエンド（Drive / Sheets / Docs / Gemini）
 *
 * ■ 初回セットアップ
 *   1. script.google.com で新規プロジェクトを作り、このファイルを Code.gs に貼り付け
 *   2. プロジェクトの設定 → スクリプト プロパティに以下を追加
 *        GEMINI_API_KEY     … Gemini API キー
 *        GEMINI_MODEL_FAST  … 版を固定したモデル名（"latest" 不可）
 *        GEMINI_MODEL_DEEP  … 版を固定したモデル名（"latest" 不可）
 *      （任意）YUMEKAWA_SPREADSHEET_ID … quiz_drafts を yumekawa のシートに書きたい場合
 *      （任意）INBOX_AUTO_NOTEBOOKLM  … "true" で Inbox 取込分も NotebookLM に追記
 *   3. エディタで setup() を1回実行（権限を承認）→ 実行ログに MOCHI_TOKEN とIDが出る
 *   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *        実行ユーザー: 自分 ／ アクセスできるユーザー: 全員
 *      ※「自分のみ」だと GitHub Pages 等からの fetch はログイン画面にリダイレクトされて失敗します。
 *        代わりに MOCHI_TOKEN（合言葉）で全リクエストを検証します。
 *   5. 表示された /exec URL と MOCHI_TOKEN をフロントの設定画面に入力
 *   6. （任意）installInboxTrigger() を実行すると Mochi_Inbox を15分おきに自動取込
 *
 * ■ プライバシー
 *   analyze_kids は画像を Gemini に渡すだけで DriveApp を一切呼びません。
 *   ドライブに子どもの画像を書くのは save_kids_art（explicitConsent === true）だけです。
 */

var VERSION = '1.0.0';
var PROPS = PropertiesService.getScriptProperties();

var SHEETS = {
  personal_db: ['id', 'created_at', 'updated_at', 'para_category', 'is_pinned', 'title', 'summary_json', 'raw_ocr',
                'genre_tags', 'action_tags', 'drive_file_id', 'drive_view_url', 'notebooklm_synced'],
  kids_meetings_log: ['id', 'date', 'source_type', 'subject', 'unit_id', 'allow_test_json', 'meeting_json',
                      'letter_events_json', 'exported_to_portal'],
  quiz_drafts: ['draft_id', 'created_at', 'target_stage_id', 'unit_id', 'quiz_json', 'validation_status', 'approved'],
  config: ['key', 'value', 'note'],
};

var FOLDERS = {
  DRIVE_MEDIA_FOLDER_ID: 'Mochi_Media',
  DRIVE_INBOX_FOLDER_ID: 'Mochi_Inbox',
  DRIVE_INBOX_DONE_FOLDER_ID: 'Mochi_Inbox_Processed',
  DRIVE_KIDS_ART_FOLDER_ID: 'Mochi_Kids_Art',
  DRIVE_NOTEBOOKLM_FOLDER_ID: 'Mochi_NotebookLM',
};

var ACTION_TAGS = ['あとで読む', '実践する', '調べる', '記事化', '資格勉強', 'アイデア', '買う・手配'];
var PARA = ['inbox', 'projects', 'knowledge', 'archives'];
var MAX_CELL = 45000;              // Sheets のセル上限 50,000 文字に対する余裕
var DOC_ROTATE_CHARS = 800000;     // NotebookLM 用ドキュメントがこれを超えたら次のドキュメントへ
var INBOX_MAX_BYTES = 14 * 1024 * 1024;
var INBOX_TIME_BUDGET_MS = 4.5 * 60 * 1000;

// ═══════════════════════════════ セットアップ ═══════════════════════════════

function setup() {
  var log = [];
  // スプレッドシート
  var ssId = PROPS.getProperty('SPREADSHEET_ID');
  var ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.create('Mochi Mona DB');
  PROPS.setProperty('SPREADSHEET_ID', ss.getId());
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = SHEETS[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var def = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  log.push('SPREADSHEET_ID=' + ss.getId());

  // フォルダ（親フォルダ Mochi Mona の下にまとめる）
  var rootId = PROPS.getProperty('DRIVE_ROOT_FOLDER_ID');
  var root = rootId ? DriveApp.getFolderById(rootId) : DriveApp.createFolder('Mochi Mona');
  PROPS.setProperty('DRIVE_ROOT_FOLDER_ID', root.getId());
  DriveApp.getFileById(ss.getId()).moveTo(root);
  Object.keys(FOLDERS).forEach(function (key) {
    if (PROPS.getProperty(key)) return;
    var f = root.createFolder(FOLDERS[key]);
    PROPS.setProperty(key, f.getId());
    log.push(key + '=' + f.getId());
  });

  // NotebookLM 用ドキュメント
  if (!PROPS.getProperty('DRIVE_NOTEBOOKLM_DOC_ID')) {
    var doc = createKnowledgeDoc_(1);
    log.push('DRIVE_NOTEBOOKLM_DOC_ID=' + doc.getId());
  }

  // 合言葉トークン
  if (!PROPS.getProperty('MOCHI_TOKEN')) PROPS.setProperty('MOCHI_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  log.push('MOCHI_TOKEN=' + PROPS.getProperty('MOCHI_TOKEN'));

  writeConfigSheet_();
  ['GEMINI_API_KEY', 'GEMINI_MODEL_FAST', 'GEMINI_MODEL_DEEP'].forEach(function (k) {
    if (!PROPS.getProperty(k)) log.push('⚠️ スクリプトプロパティ ' + k + ' が未設定です');
  });
  Logger.log(log.join('\n'));
  return log;
}

function createKnowledgeDoc_(n) {
  var doc = DocumentApp.create('Mochi_Knowledge_Master' + (n > 1 ? '_' + n : ''));
  doc.getBody().appendParagraph('Mochi Knowledge Master' + (n > 1 ? ' #' + n : '')).setHeading(DocumentApp.ParagraphHeading.TITLE);
  doc.getBody().appendParagraph('Mochi Mona が自動追記する NotebookLM ソース用ドキュメントです。');
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(prop_('DRIVE_NOTEBOOKLM_FOLDER_ID', true)));
  PROPS.setProperty('DRIVE_NOTEBOOKLM_DOC_ID', doc.getId());
  PROPS.setProperty('NOTEBOOKLM_DOC_SEQ', String(n));
  return doc;
}

/** config シートに「秘密でない設定」を見える化（APIキーとトークンは書かない） */
function writeConfigSheet_() {
  var sh = sheet_('config');
  var keys = ['GEMINI_MODEL_FAST', 'GEMINI_MODEL_DEEP', 'DRIVE_MEDIA_FOLDER_ID', 'DRIVE_INBOX_FOLDER_ID',
              'DRIVE_NOTEBOOKLM_DOC_ID', 'DRIVE_KIDS_ART_FOLDER_ID', 'YUMEKAWA_SPREADSHEET_ID'];
  var rows = keys.map(function (k) { return [k, PROPS.getProperty(k) || '', '値の正はスクリプトプロパティ']; });
  rows.push(['GEMINI_API_KEY', PROPS.getProperty('GEMINI_API_KEY') ? '（設定済み・非表示）' : '（未設定）', '']);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).clearContent();
  sh.getRange(2, 1, rows.length, 3).setValues(rows);
}

function installInboxTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncDriveInboxTrigger') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncDriveInboxTrigger').timeBased().everyMinutes(15).create();
  Logger.log('Mochi_Inbox を15分おきに取り込むトリガーを設定しました');
}

function syncDriveInboxTrigger() {
  var r = syncDriveInbox_({});
  Logger.log(JSON.stringify(r));
}

// ═══════════════════════════════ HTTP ═══════════════════════════════

function doGet(e) {
  return json_({ ok: true, data: { service: 'mochi-mona', version: VERSION } });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkToken_(req.token)) return json_({ ok: false, error: 'unauthorized（合言葉トークンが違います）' });
    var handler = HANDLERS[req.action];
    if (!handler) return json_({ ok: false, error: 'unknown action: ' + req.action });
    return json_({ ok: true, data: handler(req.payload || {}) });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

var HANDLERS = {
  ping: function () { return { mode: 'gas', version: VERSION, fast: PROPS.getProperty('GEMINI_MODEL_FAST') || '(未設定)', deep: PROPS.getProperty('GEMINI_MODEL_DEEP') || '(未設定)' }; },
  analyze_personal: analyzePersonal_,
  save_personal: savePersonal_,
  list_personal: listPersonal_,
  update_personal: updatePersonal_,
  delete_personal: deletePersonal_,
  append_notebooklm: appendNotebookLMById_,
  chat_personal: chatPersonal_,
  analyze_kids: analyzeKids_,
  save_kids_log: saveKidsLog_,
  save_quiz_draft: saveQuizDraft_,
  save_kids_art: saveKidsArt_,
  sync_drive_inbox: syncDriveInbox_,
};

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  var expected = PROPS.getProperty('MOCHI_TOKEN');
  if (!expected || !token || String(token).length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ String(token).charCodeAt(i);
  return diff === 0;
}

function prop_(key, required) {
  var v = PROPS.getProperty(key);
  if (required && !v) throw new Error('スクリプトプロパティ ' + key + ' が未設定です（setup() を実行してください）');
  return v;
}

// ═══════════════════════════════ Sheets ヘルパ ═══════════════════════════════

function sheet_(name, spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId || prop_('SPREADSHEET_ID', true));
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function appendRows_(sh, objs) {
  if (!objs.length) return;
  var h = headers_(sh);
  var rows = objs.map(function (o) { return h.map(function (k) { return o[k] === undefined ? '' : o[k]; }); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, h.length).setValues(rows);
}

function readRows_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var h = headers_(sh);
  return sh.getRange(2, 1, last - 1, h.length).getValues().map(function (r, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = r[j]; });
    return o;
  });
}

function findRow_(sh, idKey, id) {
  var h = headers_(sh);
  var col = h.indexOf(idKey) + 1;
  if (col < 1 || sh.getLastRow() < 2) return -1;
  var hit = sh.getRange(2, col, sh.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : -1;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function nowIso_() { return new Date().toISOString(); }
function newId_(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function clip_(s) { s = String(s || ''); return s.length > MAX_CELL ? s.slice(0, MAX_CELL) + '…（以下省略）' : s; }
function splitTags_(s) { return String(s || '').split(/\s*,\s*/).filter(String); }
function joinTags_(a) { return (a || []).map(function (x) { return String(x).replace(/,/g, '、'); }).join(', '); }

// ═══════════════════════════════ Gemini ═══════════════════════════════

/**
 * @param {'GEMINI_MODEL_FAST'|'GEMINI_MODEL_DEEP'} modelKey
 * @param {object} opt { prompt, images:[{base64,mimeType}], json:boolean, history:[{role,text}], system }
 */
function gemini_(modelKey, opt) {
  var key = prop_('GEMINI_API_KEY', true);
  var model = prop_(modelKey, true);
  if (/latest/i.test(model)) throw new Error(modelKey + ' に "latest" は使わず、版を固定したモデル名を指定してください');
  var parts = [{ text: opt.prompt }];
  (opt.images || []).forEach(function (im) { parts.push({ inline_data: { mime_type: im.mimeType, data: im.base64 } }); });
  var contents = (opt.history || []).map(function (h) {
    return { role: h.role === 'model' ? 'model' : 'user', parts: [{ text: String(h.text || '') }] };
  });
  contents.push({ role: 'user', parts: parts });
  var body = {
    contents: contents,
    generationConfig: opt.json === false ? { temperature: 0.7 } : { temperature: 0.3, responseMimeType: 'application/json' },
  };
  if (opt.system) body.systemInstruction = { parts: [{ text: opt.system }] };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  var res, code, data;
  for (var attempt = 0; attempt < 3; attempt++) {
    res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
      payload: JSON.stringify(body), muteHttpExceptions: true,
    });
    code = res.getResponseCode();
    if (code !== 429 && code < 500) break;
    Utilities.sleep(1500 * (attempt + 1));
  }
  try { data = JSON.parse(res.getContentText()); } catch (e) { data = {}; }
  if (code !== 200) throw new Error('Gemini ' + code + ': ' + ((data.error && data.error.message) || 'error'));
  var cand = (data.candidates || [])[0];
  var text = ((cand && cand.content && cand.content.parts) || []).map(function (p) { return p.text || ''; }).join('');
  if (!text) throw new Error('Gemini から空の応答（安全フィルタの可能性）');
  return opt.json === false ? text : parseJsonLoose_(text);
}

function parseJsonLoose_(text) {
  var t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch (e) {}
  var s = t.indexOf('{'), e2 = t.lastIndexOf('}');
  if (s >= 0 && e2 > s) { try { return JSON.parse(t.slice(s, e2 + 1)); } catch (e3) {} }
  throw new Error('AIの応答をJSONとして読めませんでした');
}

// ═══════════════════════════════ プロンプト（js/ai.js と同内容） ═══════════════════════════════

function personalPrompt_() {
  return 'あなたは個人ナレッジベース「Mochi Mona」の整理係です。添付の画像/PDF（書籍・資格テキスト・手書きメモ・手帳スケッチなど）を読み取り、次のJSONだけを返してください。\n\n' +
    '{\n  "title": "内容がひと目でわかる日本語タイトル（30字以内）",\n  "summary": ["要約1行目", "要約2行目", "要約3行目"],\n' +
    '  "raw_ocr": "読み取れた本文をできるだけ忠実に（改行は\\n）。手書きで読めない箇所は〔判読不可〕",\n' +
    '  "genre_tags": ["分野タグを1〜3個（例: 宅建, 3Dプリント, IoT, 英語, 経営）"],\n' +
    '  "action_tags": ["次から1〜2個: ' + ACTION_TAGS.join(' / ') + '"],\n' +
    '  "para_category": "inbox | projects | knowledge | archives のどれか（迷ったら inbox）"\n}\n\n' +
    'ルール:\n- 推測で内容を補わない。読み取れない部分は〔判読不可〕。\n' +
    '- 個人の電話番号・住所・口座番号などが写っていたら raw_ocr では〔個人情報〕に置き換える。\n- JSON以外の文字は出力しない。';
}

var KIDS_COMMON_ = '\n【厳守ルール】\n' +
  '- 子どもは必ず「Learner-A」と表記する。氏名・学校名・クラス名・先生や友達の名前・地域名は、画像に写っていても出力に一切含めない。\n' +
  '- 診断名・能力ラベル（「〜障害」「〜が苦手な子」「能力が低い」等）は使わない。観察できた事実と、検証可能な仮説だけを書く。\n' +
  '- 読み取れない箇所は推測せず null または "読み取り不可" とする。\n- 出力はJSONのみ。';

var QUIZ_RULES_ = '\n【類題（quizzes）のルール — yumekawa AGENTS.md 準拠】\n' +
  '- 誤答した問題ごとに1問ずつ、最大5問。\n' +
  '- 元の問題文・数値・登場物をそのまま使わない。必ず別のシチュエーション・別の数値のオリジナル問題にする。\n' +
  '- a は必ず4個（yumekawa は 4択）。全選択肢の文字数と文体（語尾）をそろえる。ふりがな・（ ）の補足を正解だけに付けない。「正解だけ長い」「ふざけた誤答」は禁止。誤答はよくある間違い（繰り上がり忘れ・位取りずれ等）から作る。\n' +
  '- c は正解のインデックス（0始まり）。\n' +
  '- hint に答えや答えの数値を書かない。考え方の方向だけを短く（40字程度）。\n' +
  '- job_desc には解説と「💡 考えるポイント」を必ず含める。\n' +
  '- job_title は依頼名（例: "計算たんていの依頼"）、scenario は1〜2文の状況設定。登場人物は架空の動物やロボットにする。';

function kidsPrompt_(mode, p) {
  var date = p.date;
  var units = (p.unitCandidates || []).map(function (u) { return u.id + ': [' + u.subject + '] ' + u.title + '（' + u.phase + '）'; }).join('\n') || '（候補なし）';
  var head = 'あなたは小学4年生の家庭学習サポーターです。今日は ' + date + ' です。';

  if (mode === 'test' || mode === 'homework') {
    var st = mode === 'test' ? 'テスト' : '宿題';
    return head + '\n添付は' + st + 'の画像です。採点結果・誤答を読み取り、保護者ポータル用データと類題を作ってください。\n' +
      (p.subjectHint ? '教科のヒント: ' + p.subjectHint + '\n' : '') +
      '\n【単元候補（日付から推定）】\n' + units + '\n\n次のJSONだけを返してください:\n' +
      '{\n  "source_type": "' + st + '",\n  "subject": "算数|国語|理科|社会",\n' +
      '  "unit_candidates": [{"unit_id": "u0xx", "title": "単元名", "confidence": 0.0〜1.0, "reason": "根拠"}],   // 第1〜第3候補\n' +
      '  "allowTests": [{"date": "' + date + '", "subject": "", "unit_id": "", "title": "テスト名", "score": 数値またはnull, "max_score": 数値またはnull,\n' +
      '                  "items": [{"no": "大問-小問", "correct": true|false, "topic": "何をきく問題か"}]}],\n' +
      '  "meeting": {\n    "date": "' + date + '", "learner": "Learner-A", "title": "対策会議のタイトル",\n' +
      '    "did": "できたこと（1文。まず よい ところから）",\n' +
      '    "observations": ["事実として見えたこと"],\n' +
      '    "hypotheses": [{"code": "A|B|C|D|E", "label": "理解|記憶|読み落とし|実行ミス|表現", "evidence": "どの問題のどんな跡からそう考えたか", "next_step": "家でできる確かめ方・手立て"}],\n' +
      '    "plan": ["次の1週間の小さな行動（子どもと いっしょに する こと）"],\n' +
      '    "check": "1週間後に 何を 見れば 手立てが 効いたか わかるか（1文）"\n  },\n' +
      '  "wrong_items": [{"no": "", "summary": "元の問題の要点（数値含む）", "learner_answer_summary": "", "correct_concept": "正しい考え方"}],\n' +
      '  "quizzes": [{"q": "", "a": ["", "", "", ""], "c": 0, "hint": "", "job_title": "", "job_desc": "", "scenario": "", "source_no": "対応する wrong_items の no"}]\n}\n' +
      'つまずき仮説は A:理解 / B:記憶 / C:読み落とし / D:実行ミス / E:表現 の5分類で。\n' + QUIZ_RULES_ + '\n' + KIDS_COMMON_;
  }
  if (mode === 'letter') {
    return head + '\n添付は学校の配布物（学級通信・行事予定表など）の画像です。保護者が知るべき予定と要点だけを抜き出してください。\n' +
      '次のJSONだけを返してください:\n{\n' +
      '  "letters": [{"date": "発行日 YYYY-MM-DD または null", "title": "通信のタイトル（固有名詞は伏せる）", "points": ["要点（持ち物・提出物・お願い事項など）"]}],\n' +
      '  "events": [{"date": "YYYY-MM-DD", "title": "行事名", "note": "時間・服装など", "bring": ["持ち物"]}]\n}\n' +
      '- 年が書かれていない日付は ' + date + ' を基準に最も近い未来の日付として補完し、note に「年は推定」と書く。\n' +
      '- 学校名・先生名・児童名・電話番号・URLは書かない。\n' + KIDS_COMMON_;
  }
  if (mode === 'notebook') {
    return head + '\n添付は Learner-A が紙のノートに書いた筆算または漢字練習の画像です。1問ずつ丸付けしてください。\n' +
      '筆算では位取り・繰り上がり/繰り下がり・九九・写し間違いまで見て、どこでずれたかを特定してください。\n' +
      '漢字では、とめ・はね・はらい・画の多い少ない・形の似た字との取り違えを見てください。\n' +
      '次のJSONだけを返してください:\n{\n  "kind": "hissan|kanji",\n' +
      '  "items": [{"no": 1, "problem": "問題（例: 345×27）", "learner_answer": "読み取った答え", "correct_answer": "正しい答え", "correct": true|false,\n' +
      '             "mistake_type": null または "位取り|繰り上がり|繰り下がり|九九|写し間違い|とめはね|画数|字形の取り違え|その他", "comment": "どこで何がずれたか（短く）"}],\n' +
      '  "score": {"correct": 数, "total": 数},\n' +
      '  "niko_comment": "相棒キャラ『ニコ』の口調（明るく、語尾に「〜だよ！」「〜してみよう！」）で、できたところを具体的にほめてから、直すポイントを1つだけ伝える（120字以内）"\n}\n' + KIDS_COMMON_;
  }
  if (mode === 'art') {
    return head + '\n添付は Learner-A の作品（工作・絵画・観察記録など）です。アーカイブ用の情報を作ってください。\n' +
      '{"title": "作品タイトル（20字以内）", "kind": "工作|絵画|観察記録|その他", "description": "見てわかること（2文）", "niko_comment": "ニコ口調のほめコメント（80字以内）"}\n' + KIDS_COMMON_;
  }
  throw new Error('unknown mode: ' + mode);
}

// ═══════════════════════════════ じぶん研究 ═══════════════════════════════

function analyzePersonal_(p) {
  if (!p.images || !p.images.length) throw new Error('画像がありません');
  return gemini_('GEMINI_MODEL_FAST', { prompt: personalPrompt_(), images: p.images });
}

function normalizeCard_(c) {
  return {
    title: String(c.title || '無題').slice(0, 200),
    summary: Array.isArray(c.summary) ? c.summary.map(String) : [],
    raw_ocr: String(c.raw_ocr || ''),
    genre_tags: Array.isArray(c.genre_tags) ? c.genre_tags : [],
    action_tags: Array.isArray(c.action_tags) ? c.action_tags : [],
    para_category: PARA.indexOf(c.para_category) >= 0 ? c.para_category : 'inbox',
    is_pinned: !!c.is_pinned,
  };
}

/** @param p { card, images:[{base64,mimeType,filename}], syncNotebookLM, _driveFiles?:[File] } */
function savePersonal_(p) {
  var card = normalizeCard_(p.card || {});
  var files = p._driveFiles || [];
  if (!files.length) {
    var folder = DriveApp.getFolderById(prop_('DRIVE_MEDIA_FOLDER_ID', true));
    files = (p.images || []).map(function (im, i) {
      var blob = Utilities.newBlob(Utilities.base64Decode(im.base64), im.mimeType, im.filename || ('mochi_' + Date.now() + '_' + i + '.jpg'));
      return folder.createFile(blob);
    });
  }
  var t = nowIso_();
  var row = {
    id: newId_('m'), created_at: t, updated_at: t,
    para_category: card.para_category, is_pinned: card.is_pinned,
    title: card.title, summary_json: JSON.stringify(card.summary), raw_ocr: clip_(card.raw_ocr),
    genre_tags: joinTags_(card.genre_tags), action_tags: joinTags_(card.action_tags),
    drive_file_id: files.map(function (f) { return f.getId(); }).join(','),
    drive_view_url: files.length ? files[0].getUrl() : '',
    notebooklm_synced: false,
  };
  if (p.syncNotebookLM) {
    appendNotebookLM_(rowToCard_(row));
    row.notebooklm_synced = true;
  }
  withLock_(function () { appendRows_(sheet_('personal_db'), [row]); });
  return rowToCard_(row);
}

function rowToCard_(r) {
  var summary = [];
  try { summary = JSON.parse(r.summary_json || '[]'); } catch (e) { summary = String(r.summary_json || '').split('\n'); }
  return {
    id: String(r.id),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    para_category: String(r.para_category || 'inbox'),
    is_pinned: r.is_pinned === true || String(r.is_pinned).toUpperCase() === 'TRUE',
    title: String(r.title || ''),
    summary: summary,
    raw_ocr: String(r.raw_ocr || ''),
    genre_tags: splitTags_(r.genre_tags),
    action_tags: splitTags_(r.action_tags),
    drive_file_id: String(r.drive_file_id || ''),
    drive_view_url: String(r.drive_view_url || ''),
    notebooklm_synced: r.notebooklm_synced === true || String(r.notebooklm_synced).toUpperCase() === 'TRUE',
  };
}

function listPersonal_(p) {
  var rows = readRows_(sheet_('personal_db'));
  var limit = Math.min(Number(p.limit) || 500, 2000);
  return rows.slice(-limit).reverse().map(rowToCard_);
}

function updatePersonal_(p) {
  var allowed = ['title', 'para_category', 'is_pinned', 'genre_tags', 'action_tags', 'summary', 'raw_ocr'];
  return withLock_(function () {
    var sh = sheet_('personal_db');
    var rowNo = findRow_(sh, 'id', p.id);
    if (rowNo < 0) throw new Error('カードが見つかりません: ' + p.id);
    var h = headers_(sh);
    var vals = sh.getRange(rowNo, 1, 1, h.length).getValues()[0];
    var obj = {};
    h.forEach(function (k, i) { obj[k] = vals[i]; });
    Object.keys(p.fields || {}).forEach(function (k) {
      if (allowed.indexOf(k) < 0) return;
      var v = p.fields[k];
      if (k === 'genre_tags' || k === 'action_tags') obj[k] = joinTags_(v);
      else if (k === 'summary') obj.summary_json = JSON.stringify(v || []);
      else if (k === 'raw_ocr') obj.raw_ocr = clip_(v);
      else if (k === 'para_category') obj[k] = PARA.indexOf(v) >= 0 ? v : 'inbox';
      else if (k === 'is_pinned') obj[k] = !!v;
      else obj[k] = String(v).slice(0, 200);
    });
    obj.updated_at = nowIso_();
    sh.getRange(rowNo, 1, 1, h.length).setValues([h.map(function (k) { return obj[k]; })]);
    return rowToCard_(obj);
  });
}

function deletePersonal_(p) {
  return withLock_(function () {
    var sh = sheet_('personal_db');
    var rowNo = findRow_(sh, 'id', p.id);
    if (rowNo < 0) throw new Error('カードが見つかりません');
    sh.deleteRow(rowNo);   // ドライブの画像は消さない（誤削除防止）
    return { deleted: p.id };
  });
}

function chatPersonal_(p) {
  var card = p.card || {};
  var system = 'あなたは TORO2 の壁打ち相手です。以下のカード（撮影した資料）の内容を踏まえて、質問に日本語で具体的に答えてください。資料に無いことは「資料には無いが」と区別して述べること。\n\n' +
    '# カード: ' + (card.title || '') + '\n## 要約\n' + (card.summary || []).join('\n') + '\n## 本文（OCR）\n' + String(card.raw_ocr || '').slice(0, 30000);
  var reply = gemini_('GEMINI_MODEL_DEEP', { prompt: String(p.message || ''), history: (p.history || []).slice(-20), system: system, json: false });
  return { reply: reply };
}

// ═══════════════════════════════ NotebookLM 連携 ═══════════════════════════════

function appendNotebookLM_(card) {
  var docId = prop_('DRIVE_NOTEBOOKLM_DOC_ID', true);
  var doc = DocumentApp.openById(docId);
  var body = doc.getBody();
  if (body.getText().length > DOC_ROTATE_CHARS) {
    doc.saveAndClose();
    var seq = Number(PROPS.getProperty('NOTEBOOKLM_DOC_SEQ') || 1) + 1;
    doc = createKnowledgeDoc_(seq);
    doc = DocumentApp.openById(doc.getId());
    body = doc.getBody();
  }
  var H = DocumentApp.ParagraphHeading;
  body.appendParagraph(card.title).setHeading(H.HEADING2);
  body.appendParagraph('日付: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd') +
    ' ／ タグ: ' + (card.genre_tags || []).concat(card.action_tags || []).join(', ') +
    (card.drive_view_url ? ' ／ 元画像: ' + card.drive_view_url : ''));
  body.appendParagraph('要約').setHeading(H.HEADING3);
  (card.summary || []).forEach(function (s) { body.appendListItem(s); });
  body.appendParagraph('OCR全文').setHeading(H.HEADING3);
  body.appendParagraph(String(card.raw_ocr || '（本文なし）'));
  body.appendHorizontalRule();
  doc.saveAndClose();
  return docId;
}

function appendNotebookLMById_(p) {
  var sh = sheet_('personal_db');
  var rowNo = findRow_(sh, 'id', p.id);
  if (rowNo < 0) throw new Error('カードが見つかりません');
  var h = headers_(sh);
  var vals = sh.getRange(rowNo, 1, 1, h.length).getValues()[0];
  var obj = {};
  h.forEach(function (k, i) { obj[k] = vals[i]; });
  var docId = appendNotebookLM_(rowToCard_(obj));
  sh.getRange(rowNo, h.indexOf('notebooklm_synced') + 1).setValue(true);
  return { appended: true, docId: docId };
}

// ═══════════════════════════════ こども学習ハブ ═══════════════════════════════
// ここから下の analyze_kids では DriveApp を一切使わない（画像はメモリ上で Gemini に渡して終わり）

function analyzeKids_(p) {
  var modes = ['test', 'homework', 'letter', 'notebook', 'art'];
  if (modes.indexOf(p.mode) < 0) throw new Error('mode が不正です');
  if (!p.images || !p.images.length) throw new Error('画像がありません');
  var modelKey = (p.mode === 'test' || p.mode === 'homework') ? 'GEMINI_MODEL_DEEP' : 'GEMINI_MODEL_FAST';
  var images = p.images;
  p.images = null;
  try {
    return gemini_(modelKey, { prompt: kidsPrompt_(p.mode, p), images: images });
  } finally {
    images.length = 0;
  }
}

function saveKidsLog_(p) {
  var r = p.row || {};
  var row = {
    id: newId_('k'),
    date: String(r.date || ''),
    source_type: String(r.source_type || ''),
    subject: String(r.subject || ''),
    unit_id: /^u\d{3}$/.test(r.unit_id || '') ? r.unit_id : '',
    allow_test_json: clip_(r.allow_test_json || '[]'),
    meeting_json: clip_(r.meeting_json || '[]'),
    letter_events_json: clip_(r.letter_events_json || '{}'),
    exported_to_portal: false,
  };
  withLock_(function () { appendRows_(sheet_('kids_meetings_log'), [row]); });
  return row;
}

function saveQuizDraft_(p) {
  var drafts = p.drafts || [];
  if (!drafts.length) throw new Error('保存する類題がありません');
  var rows = drafts.map(function (d) {
    if (d.validation_status === 'fail') throw new Error('不合格（fail）の類題は保存できません');
    JSON.parse(d.quiz_json);   // 壊れたJSONは弾く
    return {
      draft_id: newId_('q'), created_at: nowIso_(),
      target_stage_id: String(d.target_stage_id || ''), unit_id: String(d.unit_id || ''),
      quiz_json: clip_(d.quiz_json), validation_status: String(d.validation_status || ''), approved: false,
    };
  });
  var target = PROPS.getProperty('YUMEKAWA_SPREADSHEET_ID');
  withLock_(function () { appendRows_(sheet_('quiz_drafts', target || null), rows); });
  return { saved: rows.length, spreadsheet: target ? 'yumekawa' : 'mochi' };
}

function saveKidsArt_(p) {
  if (p.explicitConsent !== true) throw new Error('作品保存には保護者の明示的な同意（explicitConsent）が必要です');
  if (!p.image || !p.image.base64) throw new Error('画像がありません');
  var folder = DriveApp.getFolderById(prop_('DRIVE_KIDS_ART_FOLDER_ID', true));
  var name = 'art_' + String(p.date || '').replace(/-/g, '') + '_' + String(p.title || 'work').replace(/[\\\/:*?"<>|]/g, ' ').slice(0, 40) + '.jpg';
  var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.image.base64), p.image.mimeType || 'image/jpeg', name));
  file.setDescription(['Learner-A', p.kind || '', p.description || ''].join(' / '));
  return { saved: true, fileId: file.getId() };
}

// ═══════════════════════════════ Drive Inbox 取込（Pixel 11 → Mochi_Inbox） ═══════════════════════════════
// ※ Inbox は「じぶん研究」専用。子どもの答案はここに入れない運用にしてください。

function syncDriveInbox_(p) {
  var started = Date.now();
  var inbox = DriveApp.getFolderById(prop_('DRIVE_INBOX_FOLDER_ID', true));
  var done = DriveApp.getFolderById(prop_('DRIVE_INBOX_DONE_FOLDER_ID', true));
  var media = DriveApp.getFolderById(prop_('DRIVE_MEDIA_FOLDER_ID', true));
  var autoNlm = String(PROPS.getProperty('INBOX_AUTO_NOTEBOOKLM')).toLowerCase() === 'true';
  var it = inbox.getFiles();
  var processed = 0, remaining = 0, errors = [], cards = [];
  while (it.hasNext()) {
    var f = it.next();
    var mime = f.getMimeType();
    if (!(mime.indexOf('image/') === 0 || mime === 'application/pdf')) continue;
    if (Date.now() - started > INBOX_TIME_BUDGET_MS) { remaining++; continue; }
    try {
      if (f.getSize() > INBOX_MAX_BYTES) throw new Error('14MB超のためスキップ');
      var blob = f.getBlob();
      var analysis = gemini_('GEMINI_MODEL_FAST', {
        prompt: personalPrompt_(),
        images: [{ base64: Utilities.base64Encode(blob.getBytes()), mimeType: mime }],
      });
      f.moveTo(media);
      var card = savePersonal_({ card: analysis, _driveFiles: [f], syncNotebookLM: autoNlm });
      cards.push(card.id);
      processed++;
    } catch (err) {
      errors.push({ file: f.getName(), error: String(err.message || err) });
      try { f.setName('ERROR_' + f.getName()); f.moveTo(done); } catch (e) {}
    }
  }
  return { processed: processed, remaining: remaining, errors: errors, cards: cards };
}
