// ai.js — プロンプト定義・Gemini 直接呼び出し（デモ用）・サンプル応答モック
// ※ gas/Code.gs にも同じプロンプトを持たせています。片方を直したらもう片方も合わせてください。

export const ACTION_TAGS = ['あとで読む', '実践する', '調べる', '記事化', '資格勉強', 'アイデア', '買う・手配'];
export const PARA = ['inbox', 'projects', 'knowledge', 'archives'];
export const PARA_LABEL = { inbox: '📥 Inbox', projects: '🚀 Projects', knowledge: '📚 Knowledge', archives: '🗄 Archives' };

export const HYPOTHESIS = {
  A: '理解', B: '記憶', C: '読み落とし', D: '実行ミス', E: '表現',
};

// ─────────────────────────────── プロンプト ───────────────────────────────

export function buildPersonalPrompt() {
  return `あなたは個人ナレッジベース「Mochi Mona」の整理係です。添付の画像/PDF（書籍・資格テキスト・手書きメモ・手帳スケッチなど）を読み取り、次のJSONだけを返してください。

{
  "title": "内容がひと目でわかる日本語タイトル（30字以内）",
  "summary": ["要約1行目", "要約2行目", "要約3行目"],
  "raw_ocr": "読み取れた本文をできるだけ忠実に（改行は\\n）。手書きで読めない箇所は〔判読不可〕",
  "genre_tags": ["分野タグを1〜3個（例: 宅建, 3Dプリント, IoT, 英語, 経営）"],
  "action_tags": ["次から1〜2個: ${ACTION_TAGS.join(' / ')}"],
  "para_category": "inbox | projects | knowledge | archives のどれか（迷ったら inbox）"
}

ルール:
- 推測で内容を補わない。読み取れない部分は〔判読不可〕。
- 個人の電話番号・住所・口座番号などが写っていたら raw_ocr では〔個人情報〕に置き換える。
- JSON以外の文字は出力しない。`;
}

const KIDS_COMMON = `
【厳守ルール】
- 子どもは必ず「Learner-A」と表記する。氏名・学校名・クラス名・先生や友達の名前・地域名は、画像に写っていても出力に一切含めない。
- 診断名・能力ラベル（「〜障害」「〜が苦手な子」「能力が低い」等）は使わない。観察できた事実と、検証可能な仮説だけを書く。
- 読み取れない箇所は推測せず null または "読み取り不可" とする。
- 出力はJSONのみ。`;

const QUIZ_RULES = `
【類題（quizzes）のルール — yumekawa AGENTS.md 準拠】
- 誤答した問題ごとに1問ずつ、最大5問。
- 元の問題文・数値・登場物をそのまま使わない。必ず別のシチュエーション・別の数値のオリジナル問題にする。
- a は必ず4個（yumekawa は 4択）。全選択肢の文字数と文体（語尾）をそろえる。ふりがな・（ ）の補足を正解だけに付けない。「正解だけ長い」「ふざけた誤答」は禁止。誤答はよくある間違い（繰り上がり忘れ・位取りずれ等）から作る。
- c は正解のインデックス（0始まり）。
- hint に答えや答えの数値を書かない。考え方の方向だけを短く（40字程度）。
- job_desc には解説と「💡 考えるポイント」を必ず含める。
- job_title は依頼名（例: "計算たんていの依頼"）、scenario は1〜2文の状況設定。登場人物は架空の動物やロボットにする。`;

export function buildKidsPrompt(mode, { date, unitCandidates = [], subjectHint = '' } = {}) {
  const units = unitCandidates.map((u) => `${u.id}: [${u.subject}] ${u.title}（${u.phase}）`).join('\n') || '（候補なし）';
  const head = `あなたは小学4年生の家庭学習サポーターです。今日は ${date} です。`;

  if (mode === 'test' || mode === 'homework') {
    const st = mode === 'test' ? 'テスト' : '宿題';
    return `${head}
添付は${st}の画像です。採点結果・誤答を読み取り、保護者ポータル用データと類題を作ってください。
${subjectHint ? `教科のヒント: ${subjectHint}\n` : ''}
【単元候補（日付から推定）】
${units}

次のJSONだけを返してください:
{
  "source_type": "${st}",
  "subject": "算数|国語|理科|社会",
  "unit_candidates": [{"unit_id": "u0xx", "title": "単元名", "confidence": 0.0〜1.0, "reason": "根拠"}],   // 第1〜第3候補
  "allowTests": [{"date": "${date}", "subject": "", "unit_id": "", "title": "テスト名", "score": 数値またはnull, "max_score": 数値またはnull,
                  "items": [{"no": "大問-小問", "correct": true|false, "topic": "何をきく問題か"}]}],
  "meeting": {
    "date": "${date}", "learner": "Learner-A", "title": "対策会議のタイトル",
    "did": "できたこと（1文。まず よい ところから）",
    "observations": ["事実として見えたこと"],
    "hypotheses": [{"code": "A|B|C|D|E", "label": "理解|記憶|読み落とし|実行ミス|表現", "evidence": "どの問題のどんな跡からそう考えたか", "next_step": "家でできる確かめ方・手立て"}],
    "plan": ["次の1週間の小さな行動（子どもと いっしょに する こと）"],
    "check": "1週間後に 何を 見れば 手立てが 効いたか わかるか（1文）"
  },
  "wrong_items": [{"no": "", "summary": "元の問題の要点（数値含む）", "learner_answer_summary": "", "correct_concept": "正しい考え方"}],
  "quizzes": [{"q": "", "a": ["", "", "", ""], "c": 0, "hint": "", "job_title": "", "job_desc": "", "scenario": "", "source_no": "対応する wrong_items の no"}]
}
つまずき仮説は A:理解 / B:記憶 / C:読み落とし / D:実行ミス / E:表現 の5分類で。
${QUIZ_RULES}
${KIDS_COMMON}`;
  }

  if (mode === 'letter') {
    return `${head}
添付は学校の配布物（学級通信・行事予定表など）の画像です。保護者が知るべき予定と要点だけを抜き出してください。
次のJSONだけを返してください:
{
  "letters": [{"date": "発行日 YYYY-MM-DD または null", "title": "通信のタイトル（固有名詞は伏せる）", "points": ["要点（持ち物・提出物・お願い事項など）"]}],
  "events": [{"date": "YYYY-MM-DD", "title": "行事名", "note": "時間・服装など", "bring": ["持ち物"]}]
}
- 年が書かれていない日付は ${date} を基準に最も近い未来の日付として補完し、note に「年は推定」と書く。
- 学校名・先生名・児童名・電話番号・URLは書かない。
${KIDS_COMMON}`;
  }

  if (mode === 'notebook') {
    return `${head}
添付は Learner-A が紙のノートに書いた筆算または漢字練習の画像です。1問ずつ丸付けしてください。
筆算では位取り・繰り上がり/繰り下がり・九九・写し間違いまで見て、どこでずれたかを特定してください。
漢字では、とめ・はね・はらい・画の多い少ない・形の似た字との取り違えを見てください。
次のJSONだけを返してください:
{
  "kind": "hissan|kanji",
  "items": [{"no": 1, "problem": "問題（例: 345×27）", "learner_answer": "読み取った答え", "correct_answer": "正しい答え", "correct": true|false,
             "mistake_type": null または "位取り|繰り上がり|繰り下がり|九九|写し間違い|とめはね|画数|字形の取り違え|その他", "comment": "どこで何がずれたか（短く）"}],
  "score": {"correct": 数, "total": 数},
  "niko_comment": "相棒キャラ『ニコ』の口調（明るく、語尾に「〜だよ！」「〜してみよう！」）で、できたところを具体的にほめてから、直すポイントを1つだけ伝える（120字以内）"
}
${KIDS_COMMON}`;
  }

  if (mode === 'art') {
    return `${head}
添付は Learner-A の作品（工作・絵画・観察記録など）です。アーカイブ用の情報を作ってください。
{"title": "作品タイトル（20字以内）", "kind": "工作|絵画|観察記録|その他", "description": "見てわかること（2文）", "niko_comment": "ニコ口調のほめコメント（80字以内）"}
${KIDS_COMMON}`;
  }
  throw new Error('unknown mode: ' + mode);
}

export function buildChatSystem(card) {
  return `あなたは TORO2 の壁打ち相手です。以下のカード（撮影した資料）の内容を踏まえて、質問に日本語で具体的に答えてください。資料に無いことは「資料には無いが」と区別して述べること。

# カード: ${card.title}
## 要約
${(card.summary || []).join('\n')}
## 本文（OCR）
${String(card.raw_ocr || '').slice(0, 30000)}`;
}

// ─────────────────────────────── JSON 抽出 ───────────────────────────────

export function parseJsonLoose(text) {
  if (typeof text !== 'string') return text;
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch {}
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(t.slice(s, e + 1)); } catch {}
  }
  throw new Error('AIの応答をJSONとして読めませんでした');
}

// ─────────────────────────────── Gemini 直接呼び出し（GAS未接続時） ───────────────────────────────

export async function callGeminiDirect({ apiKey, model, prompt, images = [], json = true, history = [], system = '' }) {
  if (!apiKey || !model) throw new Error('Gemini APIキーとモデル名を設定してください');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const userParts = [{ text: prompt }, ...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } }))];
  const contents = [
    ...history.map((h) => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.text }] })),
    { role: 'user', parts: userParts },
  ];
  const body = {
    contents,
    generationConfig: { temperature: json ? 0.3 : 0.7, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data?.error?.message || res.statusText}`);
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini から空の応答（安全フィルタの可能性）');
  return json ? parseJsonLoose(text) : text;
}

// ─────────────────────────────── モック（APIキー無しでも全機能を確認できる） ───────────────────────────────

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mockPersonal() {
  await wait(700);
  return {
    title: '【デモ】宅建業法：35条書面の記載事項',
    summary: [
      '重要事項説明（35条書面）は契約成立前に宅建士が説明する。',
      '記名は宅建士、説明時は宅建士証の提示が必要。',
      '37条書面との違い（交付時期・記載事項）が頻出ポイント。',
    ],
    raw_ocr: '（デモ応答）重要事項の説明等\n第35条 宅地建物取引業者は、宅地若しくは建物の売買…\n〔判読不可〕',
    genre_tags: ['宅建', '業法'],
    action_tags: ['資格勉強'],
    para_category: 'knowledge',
  };
}

export async function mockChat(message) {
  await wait(600);
  return `（デモ応答）「${message.slice(0, 40)}」について：カードの要約から考えると、まず37条書面との違いを表にして整理するのがおすすめです。Gemini APIキーかGAS URLを設定すると実際のAIが答えます。`;
}

export async function mockKids(mode, { date, unitCandidates = [] }) {
  await wait(900);
  const u = unitCandidates[0] || { id: 'u006', subject: '算数', title: 'わり算の筆算(2)' };
  if (mode === 'test' || mode === 'homework') {
    return {
      source_type: mode === 'test' ? 'テスト' : '宿題',
      subject: u.subject,
      unit_candidates: unitCandidates.slice(0, 3).map((x, i) => ({ unit_id: x.id, title: x.title, confidence: [0.72, 0.18, 0.1][i], reason: i === 0 ? '日付が学習期間内で問題内容が一致（デモ）' : '時期が近い（デモ）' })),
      allowTests: [{ date, subject: u.subject, unit_id: u.id, title: `${u.title} まとめテスト（デモ）`, score: 80, max_score: 100,
        items: [
          { no: '1-1', correct: true, topic: '2けた÷2けた' },
          { no: '1-2', correct: false, topic: '3けた÷2けた（商の見当）' },
          { no: '2-1', correct: false, topic: '文章題（あまりの扱い）' },
        ] }],
      meeting: {
        date, learner: 'Learner-A', title: `${u.title}：商の見当と文章題（デモ）`,
        did: '2けた÷2けたの 計算は 自分で 見当を つけて とけて いる（デモ）',
        observations: ['計算問題はほぼ正解', '商の見当を立てる問題で1回ずれた', '文章題で、あまりを答えに入れていない'],
        hypotheses: [
          { code: 'D', label: '実行ミス', evidence: '1-2 で仮商を立てた後の引き算で1ずれている', next_step: '仮商を立てたら「かけて戻す」確認を声に出して1問やってみる' },
          { code: 'C', label: '読み落とし', evidence: '2-1 で「あまりはいくつ」の問いに商だけ答えている', next_step: '問題文の「きかれていること」に線を引く練習を3問' },
        ],
        plan: ['仮商チェック3問×3日', '文章題の「きかれていること」に線を引く'],
        check: '宿題の 文章題で、あまりまで 答えて いるか（デモ）',
      },
      wrong_items: [
        { no: '1-2', summary: '384÷48 の計算', learner_answer_summary: '7', correct_concept: '仮商7→48×7=336、残り48でもう1つ入る→8' },
        { no: '2-1', summary: '色紙158まいを24人で分けると1人何まいであまりは何まい', learner_answer_summary: '6まい', correct_concept: '商6あまり14。あまりも答える' },
      ],
      quizzes: [
        { q: 'ロボットのピコが、ねじ 434本を 62本ずつ箱につめます。箱はいくつできますか。', a: ['6箱', '7箱', '8箱', '9箱'], c: 1,
          hint: '62を60と見て、だいたいいくつ入るか見当をつけてから、かけて確かめよう。',
          job_title: '工場たんていの依頼', job_desc: '62×7=434 なので、ちょうど7箱。仮の商を立てたら、かけ算で元の数に戻るか確かめるとずれに気づけます。\n💡 考えるポイント：「見当→かけて確かめ→直す」の3ステップ',
          scenario: 'ねじ工場で箱づめのお手伝い。', source_no: '1-2' },
        { q: 'うさぎのミミが、どんぐり 215こを 32こずつふくろに入れます。ふくろは何ふくろできて、何こあまりますか。', a: ['6ふくろ、23こあまり', '6ふくろ、33こあまり', '7ふくろ、9こあまり', '5ふくろ、55こあまり'], c: 0,
          hint: 'あまりが わる数より小さくなっているか、さいごに確かめよう。',
          job_title: '森のどんぐり係', job_desc: '32×6=192、215−192=23。あまり23は32より小さいのでOK。\n💡 考えるポイント：答えは「いくつできるか」と「いくつあまるか」の2つ',
          scenario: '冬じたくのどんぐり分け。', source_no: '2-1' },
      ],
      _demo: true,
    };
  }
  if (mode === 'letter') {
    const d = new Date(date);
    const plus = (n) => new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
    return {
      letters: [{ date, title: '学年だより 11月号（デモ）', points: ['音読カードは毎週金曜提出', '寒くなるので上着に記名を', '持久走の練習が始まります'] }],
      events: [
        { date: plus(5), title: '社会科見学', note: '弁当・水筒（デモ）', bring: ['弁当', '水筒', '筆記用具'] },
        { date: plus(12), title: '持久走大会', note: '体操服で登校（デモ）', bring: ['体操服', 'タオル'] },
      ],
      _demo: true,
    };
  }
  if (mode === 'notebook') {
    return {
      kind: 'hissan',
      items: [
        { no: 1, problem: '236×14', learner_answer: '3304', correct_answer: '3304', correct: true, mistake_type: null, comment: '位をそろえてきれいに書けている' },
        { no: 2, problem: '418×26', learner_answer: '10768', correct_answer: '10868', correct: false, mistake_type: '繰り上がり', comment: '418×6 の十の位で繰り上がり1を足し忘れ' },
        { no: 3, problem: '507×32', learner_answer: '16224', correct_answer: '16224', correct: true, mistake_type: null, comment: '0のある位もばっちり' },
      ],
      score: { correct: 2, total: 3 },
      niko_comment: '0が入った507×32、ばっちりだよ！位もきれいにそろってるね。2問目は十の位の「くり上がり1」をたし忘れちゃったみたい。小さく書いた1に○をつけてからたしてみよう！',
      _demo: true,
    };
  }
  if (mode === 'art') {
    return { title: '秋の葉っぱコラージュ（デモ）', kind: '工作', description: '色づいた葉を重ねて動物の形を作っている。茶色と赤のグラデーションが工夫されている。', niko_comment: '葉っぱの色の順番がすごくきれい！しっぽのふわふわ感、まねしたくなるよ！', _demo: true };
  }
  throw new Error('unknown mode');
}
