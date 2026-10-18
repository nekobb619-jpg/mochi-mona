// quiz-validator.js — yumekawa AGENTS.md 準拠の類題チェッカー（DOM非依存・Node でもテスト可）
//
// 想定フォーマット（yumekawa js/quizzes/*.js 互換）:
//   { q, a: [選択肢...], c: 正解インデックス(0始まり), hint, job_title, job_desc, scenario }
//
// level: 'fail' = 保存不可レベル / 'warn' = 人の目で確認 / 'ok'

export const RULES = {
  LONG_ANSWER_RATIO: 1.4,     // 正解の文字数 ÷ 他選択肢の平均 がこれ以上なら NG
  MIN_CHOICES: 3,
  MAX_CHOICES: 4,
  SIMILARITY_WARN: 0.55,      // 元問題との文字バイグラム類似度
  STYLE_LEN_SPREAD: 2.2,      // 最長/最短 選択肢の比率がこれ超えで警告
  MAX_HINT_LEN: 80,
};

const JOKE_PATTERNS = [/わからない|しらない|知らない|ひみつ|てきとう|適当|ぜんぶ|全部ちがう|なし$|笑|www|？？|!!|ふざけ|うんこ|ばかり/];

/** 比較用の正規化：全角英数→半角、空白・句読点・記号除去、小文字化 */
export function normalize(s) {
  return String(s ?? '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s　、。，．,.・!！?？「」『』（）()\[\]【】:：;；〜~ー\-]/g, '')
    .toLowerCase();
}

/** 表示上の文字数（サロゲートペアも1文字） */
export function charLen(s) {
  return [...String(s ?? '').trim()].length;
}

function bigrams(s) {
  const t = normalize(s);
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

export function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function numbersIn(s) {
  return (normalize(s).match(/\d+(?:\.\d+)?/g) || []).filter((n) => n.length >= 2 || Number(n) >= 10);
}

function endingStyle(s) {
  const t = String(s).trim();
  if (/です$|ます$|でした$|ました$/.test(t)) return 'desu';
  if (/[。．.]$/.test(t)) return 'period';
  if (/^[\d０-９.,．，\s]+[a-zA-Zぁ-んァ-ン一-龥㎝㎡cmkgLmL％%]*$/.test(t)) return 'number';
  return 'plain';
}

/**
 * @param {object} quiz
 * @param {object} ctx  { originalText?: string }  元の問題文（誤答問題の要約など）
 * @returns {{ status: 'pass'|'warn'|'fail', checks: Array<{id,label,level,detail}> }}
 */
export function validateQuiz(quiz, ctx = {}) {
  const checks = [];
  const add = (id, label, level, detail = '') => checks.push({ id, label, level, detail });

  // ── 1. 形式 ──
  const required = ['q', 'a', 'c', 'hint', 'job_title', 'job_desc', 'scenario'];
  const missing = required.filter((k) => quiz?.[k] === undefined || quiz?.[k] === null || quiz?.[k] === '');
  if (missing.length) add('fields', '必須項目', 'fail', `不足: ${missing.join(', ')}`);
  else add('fields', '必須項目', 'ok');

  const choices = Array.isArray(quiz?.a) ? quiz.a.map((x) => String(x ?? '')) : [];
  if (choices.length < RULES.MIN_CHOICES || choices.length > RULES.MAX_CHOICES) {
    add('choices_count', '選択肢の数', 'fail', `${choices.length}個（${RULES.MIN_CHOICES}〜${RULES.MAX_CHOICES}個）`);
  } else add('choices_count', '選択肢の数', 'ok', `${choices.length}個`);

  const c = Number(quiz?.c);
  const cValid = Number.isInteger(c) && c >= 0 && c < choices.length;
  if (!cValid) add('answer_index', '正解インデックス c', 'fail', `c=${quiz?.c} が選択肢範囲外`);
  else add('answer_index', '正解インデックス c', 'ok');

  const normChoices = choices.map(normalize);
  const dup = normChoices.some((x, i) => x && normChoices.indexOf(x) !== i);
  const empty = normChoices.some((x) => !x);
  if (dup || empty) add('choices_unique', '選択肢の重複・空欄', 'fail', dup ? '同じ選択肢があります' : '空の選択肢があります');
  else add('choices_unique', '選択肢の重複・空欄', 'ok');

  if (cValid && choices.length >= 2) {
    const answer = choices[c];
    const ansLen = charLen(answer);

    // ── 2. 正解だけ長い（最重要チェック） ──
    const others = choices.filter((_, i) => i !== c).map(charLen);
    const avg = others.reduce((s, n) => s + n, 0) / others.length;
    const ratio = avg > 0 ? ansLen / avg : Infinity;
    if (ratio >= RULES.LONG_ANSWER_RATIO) {
      add('long_answer', '正解だけ長くない', 'fail', `正解 ${ansLen}字 ／ 他平均 ${avg.toFixed(1)}字（×${ratio.toFixed(2)} ≥ ${RULES.LONG_ANSWER_RATIO}）`);
    } else add('long_answer', '正解だけ長くない', 'ok', `×${ratio.toFixed(2)}`);

    // 正解だけ最長かつ他と差が大きい（比率未満でも目立つケース）
    const lens = choices.map(charLen);
    const maxLen = Math.max(...lens), minLen = Math.min(...lens);
    if (minLen > 0 && maxLen / minLen > RULES.STYLE_LEN_SPREAD) {
      add('len_spread', '選択肢の長さのばらつき', 'warn', `最短${minLen}字〜最長${maxLen}字`);
    } else add('len_spread', '選択肢の長さのばらつき', 'ok');

    // ── 3. hint に正解が入っていない ──
    const hintN = normalize(quiz?.hint);
    const ansN = normalize(answer);
    if (ansN && hintN.includes(ansN)) {
      add('hint_leak', 'ヒントに正解が入っていない', 'fail', `hint に「${answer}」が含まれています`);
    } else {
      // 正解が数値を含むなら、その数値単体がヒントにあるかも見る
      const ansNums = numbersIn(answer);
      const leaked = ansNums.filter((n) => hintN.includes(n));
      if (leaked.length) add('hint_leak', 'ヒントに正解が入っていない', 'fail', `hint に正解の数値 ${leaked.join(', ')} が含まれています`);
      else add('hint_leak', 'ヒントに正解が入っていない', 'ok');
    }

    // ── 4. 文体のそろい ──
    const styles = new Set(choices.map(endingStyle));
    if (styles.size > 1) add('style', '選択肢の文体そろえ', 'warn', `語尾の形がそろっていません（${[...styles].join(' / ')}）`);
    else add('style', '選択肢の文体そろえ', 'ok');

    // ── 5. ふざけた誤答 ──
    const joke = choices.filter((x, i) => i !== c && JOKE_PATTERNS.some((re) => re.test(x)));
    if (joke.length) add('joke', 'ふざけた誤答がない', 'warn', `要確認: ${joke.join(' / ')}`);
    else add('joke', 'ふざけた誤答がない', 'ok');
  }

  // ── 6. hint の長さ・job_desc の中身 ──
  if (charLen(quiz?.hint) > RULES.MAX_HINT_LEN) add('hint_len', 'ヒントの長さ', 'warn', `${charLen(quiz?.hint)}字（${RULES.MAX_HINT_LEN}字以内推奨）`);
  else add('hint_len', 'ヒントの長さ', 'ok');

  if (!String(quiz?.job_desc ?? '').includes('💡')) add('job_desc_point', 'job_desc に「💡 考えるポイント」', 'fail', '💡 が見つかりません');
  else add('job_desc_point', 'job_desc に「💡 考えるポイント」', 'ok');

  // ── 7. 元問題の丸写しでない ──
  if (ctx.originalText) {
    const sim = similarity(quiz?.q, ctx.originalText);
    const origNums = numbersIn(ctx.originalText);
    const qNums = new Set(numbersIn(quiz?.q));
    const sameNums = origNums.length > 0 && origNums.every((n) => qNums.has(n));
    if (sim >= RULES.SIMILARITY_WARN) add('copy', '元問題の丸写しでない', 'fail', `類似度 ${(sim * 100).toFixed(0)}%`);
    else if (sameNums) add('copy', '元問題の丸写しでない', 'warn', `元問題と同じ数値（${origNums.join(', ')}）を使っています`);
    else add('copy', '元問題の丸写しでない', 'ok', `類似度 ${(sim * 100).toFixed(0)}%`);
  }

  // ── 8. 匿名化（Learner-A 以外の呼びかけ） ──
  const allText = [quiz?.q, quiz?.scenario, quiz?.job_desc, quiz?.hint].join(' ');
  if (/(さん|くん|ちゃん)(が|は|の|に|へ|と|、)/.test(allText) && !/Learner-A/.test(allText)) {
    add('anon', '実在人物名らしき表記', 'warn', '「〜さん/くん」があります。架空の登場人物か確認してください');
  } else add('anon', '実在人物名らしき表記', 'ok');

  const status = checks.some((x) => x.level === 'fail') ? 'fail' : checks.some((x) => x.level === 'warn') ? 'warn' : 'pass';
  return { status, checks };
}

export function validateQuizzes(list = [], ctxFor = () => ({})) {
  return list.map((q, i) => ({ quiz: q, ...validateQuiz(q, ctxFor(q, i)) }));
}

export const STATUS_LABEL = { pass: '✅ 合格', warn: '⚠️ 要確認', fail: '⛔ 不合格' };
