// node --test tests/  — DOM を使わないロジックの単体テスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuiz, normalize } from '../js/quiz-validator.js';
import { getUnitCandidates, SCHOOL_UNITS, unitById } from '../js/school-units.js';
import { scrubDeep, estimateQ, toPortalPayload } from '../js/kids-converter.js';
import { mockKids, buildKidsPrompt, parseJsonLoose } from '../js/ai.js';

const good = {
  q: 'ロボットのピコが ねじ434本を62本ずつ箱につめます。箱はいくつできますか。',
  a: ['6箱', '7箱', '8箱'], c: 1,
  hint: '62を60と見て、だいたいの数を考えよう。',
  job_title: '工場たんていの依頼', job_desc: '62×7=434。\n💡 考えるポイント：見当→確かめ', scenario: '工場でお手伝い。',
};

test('単元マスタは u001〜u053 の53件で連番', () => {
  assert.equal(SCHOOL_UNITS.length, 53);
  SCHOOL_UNITS.forEach((u, i) => assert.equal(u.id, `u${String(i + 1).padStart(3, '0')}`));
});

test('10月中旬の算数候補に「がい数」「わり算の筆算(2)」が入る', () => {
  const c = getUnitCandidates(new Date(2026, 9, 18), { subject: '算数' });
  const ids = c.map((x) => x.id);
  assert.ok(ids.includes('u007'));
  assert.ok(ids.includes('u006'));
  assert.equal(c[0].distance, 0);
});

test('年またぎ単元（u051 12/01〜01/30）は1月に学習中', () => {
  const c = getUnitCandidates(new Date(2027, 0, 15), { subject: '社会' });
  assert.equal(c.find((x) => x.id === 'u051')?.phase, '学習中');
});

test('良い類題は合格', () => {
  const r = validateQuiz(good, { originalText: '384÷48 の計算' });
  assert.equal(r.status, 'pass', JSON.stringify(r.checks.filter((c) => c.level !== 'ok')));
});

test('正解だけ1.4倍以上長いと不合格', () => {
  const r = validateQuiz({ ...good, a: ['6箱', '7箱できて、あまりはない', '8箱'] });
  assert.equal(r.status, 'fail');
  assert.equal(r.checks.find((c) => c.id === 'long_answer').level, 'fail');
});

test('hint に正解文字列が入ると不合格（全角・空白ゆれも検出）', () => {
  const r = validateQuiz({ ...good, hint: 'こたえは ７ 箱 だよ' });
  assert.equal(r.checks.find((c) => c.id === 'hint_leak').level, 'fail');
  assert.equal(normalize('７ 箱'), '7箱');
});

test('hint に正解の数値（2けた以上）が入ると不合格', () => {
  const q = { ...good, a: ['23こ', '33こ', '13こ'], c: 0, hint: '215から192をひくと23になるよ' };
  assert.equal(validateQuiz(q).checks.find((c) => c.id === 'hint_leak').level, 'fail');
});

test('job_desc に 💡 が無いと不合格', () => {
  assert.equal(validateQuiz({ ...good, job_desc: '解説のみ' }).status, 'fail');
});

test('c が範囲外・選択肢重複は不合格', () => {
  assert.equal(validateQuiz({ ...good, c: 5 }).status, 'fail');
  assert.equal(validateQuiz({ ...good, a: ['6箱', '6箱', '8箱'] }).status, 'fail');
});

test('元問題の丸写しは不合格', () => {
  const orig = '色紙158まいを24人で分けると1人何まいであまりは何まい';
  const r = validateQuiz({ ...good, q: '色紙158まいを24人で分けると1人何まいで、あまりは何まい？' }, { originalText: orig });
  assert.equal(r.checks.find((c) => c.id === 'copy').level, 'fail');
});

test('ふざけた誤答は警告', () => {
  const r = validateQuiz({ ...good, a: ['6箱', '7箱', 'しらない'] });
  assert.equal(r.checks.find((c) => c.id === 'joke').level, 'warn');
});

test('モック応答の類題はすべて合格', async () => {
  const res = await mockKids('test', { date: '2026-10-18', unitCandidates: getUnitCandidates(new Date(2026, 9, 18)) });
  for (const q of res.quizzes) {
    const orig = res.wrong_items.find((w) => w.no === q.source_no)?.summary;
    const r = validateQuiz(q, { originalText: orig });
    assert.notEqual(r.status, 'fail', JSON.stringify(r.checks.filter((c) => c.level !== 'ok')));
  }
});

test('scrubDeep は入れ子の文字列も置換', () => {
  const out = scrubDeep({ a: ['はなこさんは', { b: 'ひまわり小の先生' }] }, { learnerAliases: ['はなこ'], scrubTerms: ['ひまわり小'] });
  assert.deepEqual(out, { a: ['Learner-Aさんは', { b: '●●の先生' }] });
});

test('Q の目安計算', () => {
  assert.equal(estimateQ({ correct: 2, total: 3 }), 20);
  assert.equal(estimateQ({ correct: 3, total: 3 }), 50);
  assert.equal(estimateQ({ correct: 3, total: 3 }, { qPerCorrect: 5, qAllBonus: 0 }), 15);
});

test('ポータルJSONは Learner-A・選んだ単元IDで出る', async () => {
  const res = await mockKids('test', { date: '2026-10-18', unitCandidates: [] });
  const p = toPortalPayload('test', res, { unit: unitById('u007'), date: '2026-10-18' });
  assert.equal(p.learner, 'Learner-A');
  assert.equal(p.meetings[0].unit_id, 'u007');
  assert.equal(p.allowTests[0].unit_id, 'u007');
  assert.equal(p.meetings[0].learner, 'Learner-A');
});

test('こどもプロンプトに匿名化ルールと5分類が入る', () => {
  const t = buildKidsPrompt('test', { date: '2026-10-18', unitCandidates: [] });
  assert.match(t, /Learner-A/);
  assert.match(t, /A:理解 \/ B:記憶 \/ C:読み落とし \/ D:実行ミス \/ E:表現/);
  assert.match(t, /hint に答え/);
});

test('parseJsonLoose はコードフェンス付きでも読める', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"x":1}\n```'), { x: 1 });
  assert.deepEqual(parseJsonLoose('説明です {"x":2} 以上'), { x: 2 });
});
