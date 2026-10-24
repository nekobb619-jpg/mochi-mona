// node --test tests/  — DOM を使わないロジックの単体テスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuiz, normalize, toYumekawaQuiz } from '../js/quiz-validator.js';
import { getUnitCandidates, SCHOOL_UNITS, unitById } from '../js/school-units.js';
import { scrubDeep, estimateQ, toPortalPayload, testYen, PORTAL_KIND } from '../js/kids-converter.js';
import { mockKids, buildKidsPrompt, parseJsonLoose } from '../js/ai.js';

const good = {
  q: 'ロボットのピコが ねじ434本を62本ずつ箱につめます。箱はいくつできますか。',
  a: ['6箱', '7箱', '8箱', '9箱'], c: 1,
  hint: '62を60と見て、だいたいの数を考えよう。',
  job_title: '工場たんていの依頼', job_desc: '62×7=434。\n💡 考えるポイント：見当→確かめ', scenario: '工場でお手伝い。',
};

test('単元マスタは u001〜u053 の53件で連番', () => {
  assert.equal(SCHOOL_UNITS.length, 53);
  SCHOOL_UNITS.forEach((u, i) => assert.equal(u.id, `u${String(i + 1).padStart(3, '0')}`));
});

test('10月なかばの算数候補：学習中の「2けたでわるわり算の筆算」(u007)「式と計算の順じょ」(u008)が先頭側、通年は後ろ', () => {
  const c = getUnitCandidates(new Date(2026, 9, 14), { subject: '算数' });
  const ids = c.map((x) => x.id);
  assert.ok(ids.includes('u007'));
  assert.ok(ids.includes('u008'));
  assert.equal(c[0].distance, 0);
  assert.equal(c.find((x) => x.id === 'u008').phase, '学習中');
  assert.equal(c.find((x) => x.id === 'u007').phase, '学習中');
});

test('id は yumekawa・ポータルと同じ（u007＝2けたでわるわり算の筆算、u010＝がい数）', () => {
  assert.equal(unitById('u007').title, '2けたでわるわり算の筆算');
  assert.equal(unitById('u010').title, 'がい数とその計算');
  assert.ok(unitById('u007').stages.includes('算数/わり算/hissan_2digit01'));
});

test('通年の単元（u050 外国語活動）は「通年」で、学習中の単元より後ろ', () => {
  const c = getUnitCandidates(new Date(2026, 10, 5), { subject: '英語' });
  assert.equal(c[0].id, 'u050');
  assert.equal(c[0].phase, '通年');
  const all = getUnitCandidates(new Date(2026, 10, 5), { limit: 60 });
  const firstAllYear = all.findIndex((x) => x.allYear);
  assert.ok(all.slice(0, firstAllYear).every((x) => x.distance < 30));
});

test('公開リポジトリなので単元名に地名を入れない', () => {
  assert.ok(SCHOOL_UNITS.every((u) => !/こまき|小牧/.test(u.title)));
});

test('良い類題は合格', () => {
  const r = validateQuiz(good, { originalText: '384÷48 の計算' });
  assert.equal(r.status, 'pass', JSON.stringify(r.checks.filter((c) => c.level !== 'ok')));
});

test('正解だけ1.4倍以上長いと不合格', () => {
  const r = validateQuiz({ ...good, a: ['6箱', '7箱できて、あまりはない', '8箱', '9箱'] });
  assert.equal(r.status, 'fail');
  assert.equal(r.checks.find((c) => c.id === 'long_answer').level, 'fail');
});

test('hint に正解文字列が入ると不合格（全角・空白ゆれも検出）', () => {
  const r = validateQuiz({ ...good, hint: 'こたえは ７ 箱 だよ' });
  assert.equal(r.checks.find((c) => c.id === 'hint_leak').level, 'fail');
  assert.equal(normalize('７ 箱'), '7箱');
});

test('hint に正解の数値（2けた以上）が入ると不合格', () => {
  const q = { ...good, a: ['23こ', '33こ', '13こ', '43こ'], c: 0, hint: '215から192をひくと23になるよ' };
  assert.equal(validateQuiz(q).checks.find((c) => c.id === 'hint_leak').level, 'fail');
});

test('job_desc に 💡 が無いと不合格', () => {
  assert.equal(validateQuiz({ ...good, job_desc: '解説のみ' }).status, 'fail');
});

test('c が範囲外・選択肢重複は不合格', () => {
  assert.equal(validateQuiz({ ...good, c: 5 }).status, 'fail');
  assert.equal(validateQuiz({ ...good, a: ['6箱', '6箱', '8箱', '9箱'] }).status, 'fail');
});

test('元問題の丸写しは不合格', () => {
  const orig = '色紙158まいを24人で分けると1人何まいであまりは何まい';
  const r = validateQuiz({ ...good, q: '色紙158まいを24人で分けると1人何まいで、あまりは何まい？' }, { originalText: orig });
  assert.equal(r.checks.find((c) => c.id === 'copy').level, 'fail');
});

test('ふざけた誤答は警告', () => {
  const r = validateQuiz({ ...good, a: ['6箱', '7箱', '8箱', 'しらない'] });
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

test('ポータルJSON（テスト）はポータルの meetings / allowTests の形で出る', async () => {
  const res = await mockKids('test', { date: '2026-10-18', unitCandidates: [] });
  const p = toPortalPayload('test', res, { unit: unitById('u007'), date: '2026-10-18' });
  assert.equal(p.kind, PORTAL_KIND);
  assert.equal(p.learner, 'Learner-A');
  const m = p.meetings[0];
  assert.equal(m.unit_id, 'u007');
  assert.equal(m.unit, '2けたでわるわり算の筆算');
  assert.equal(m.source, 'テスト');
  assert.ok(m.did && m.child && m.check);
  assert.equal(m.checkDate, '2026-10-25');
  assert.equal(m.result, null);
  assert.ok(m.hyps.length && m.hyps.every((h) => /^[A-E]$/.test(h.cls) && h.text));
  const t = p.allowTests[0];
  assert.deepEqual([t.score, t.full, t.yen, t.unit_id], [80, 100, 10, 'u007']);
});

test('宿題は allowTests（おこづかいの 点数）を 出さない', async () => {
  const res = await mockKids('homework', { date: '2026-10-18', unitCandidates: [] });
  const p = toPortalPayload('homework', res, { unit: unitById('u007'), date: '2026-10-18' });
  assert.equal(p.allowTests.length, 0);
  assert.equal(p.meetings[0].source, '宿題');
});

test('テストの おこづかいは ポータルと 同じ きまり', () => {
  assert.deepEqual([testYen(59, 100), testYen(60, 100), testYen(90, 100), testYen(100, 100), testYen(50, 50)], [0, 10, 50, 100, 100]);
});

test('配布物は events（kind つき）と letters（no つき）に なる', async () => {
  const res = await mockKids('letter', { date: '2026-10-18', unitCandidates: [] });
  const p = toPortalPayload('letter', res, { date: '2026-10-18' });
  assert.ok(p.events.length && p.events.every((e) => e.date && e.title && ['行事', 'テスト'].includes(e.kind)));
  assert.ok(p.letters.every((l) => 'no' in l && Array.isArray(l.points)));
});

test('類題は yumekawa の 形（4択・scenario は 吹き出しの 配列）に なる', async () => {
  const res = await mockKids('test', { date: '2026-10-18', unitCandidates: [] });
  const y = toYumekawaQuiz(res.quizzes[0]);
  assert.equal(y.a.length, 4);
  assert.ok(Array.isArray(y.scenario) && y.scenario[0].msg);
  assert.ok(!('source_no' in y));
});

test('3択の 類題は 不合格（yumekawa は 4択）', () => {
  assert.equal(validateQuiz({ ...good, a: ['6箱', '7箱', '8箱'] }).status, 'fail');
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
