// kids-converter.js — こども学習 AI変換ハブ（KidsConverterWorkbench）
// 撮影画像 → ポータル JSON（meetings / allowTests / events / letters）・yumekawa 類題・ノート丸付け
//
// プライバシー境界:
//   - 画像は Base64 のまま analyze_kids に渡すだけ。ドライブ保存のコードパスは「作品アーカイブ（art）＋明示同意」だけ。
//   - 分析が終わったら（成功・失敗どちらでも）画像参照を破棄する。
//   - AIの応答は scrubDeep() で名前・学校名などを置換してから画面に出す。

import { getUnitCandidates, unitById, SUBJECTS } from './school-units.js';
import { validateQuiz, STATUS_LABEL, toYumekawaQuiz } from './quiz-validator.js';
import { HYPOTHESIS } from './ai.js';
import { buildKidsMarkdown, openInObsidian, saveToVault, fsSupported, downloadMarkdown, safeFileName } from './obsidian-export.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('sv-SE');

export const MODES = {
  test:     { icon: '📝', label: 'テスト分析',    desc: '採点済みテスト → 対策会議・allowTests・類題' },
  homework: { icon: '📒', label: '宿題分析',      desc: '宿題プリント → 対策会議・類題' },
  letter:   { icon: '📰', label: '学級通信・予定', desc: '配布物 → events・letters' },
  notebook: { icon: '✏️', label: 'ノート丸付け',  desc: '筆算・漢字 → ニコのコメント・Q' },
  art:      { icon: '🎨', label: '作品アーカイブ', desc: '工作・絵・観察 → 同意してドライブ保存' },
};

/** 文字列を再帰的に置換（名前 → Learner-A、その他の固有名 → ●●） */
export function scrubDeep(obj, { learnerAliases = [], scrubTerms = [] } = {}) {
  const a = learnerAliases.filter((x) => x && x.length >= 1).sort((x, y) => y.length - x.length);
  const t = scrubTerms.filter((x) => x && x.length >= 2).sort((x, y) => y.length - x.length);
  const fix = (s) => {
    let r = s;
    for (const n of a) r = r.split(n).join('Learner-A');
    for (const n of t) r = r.split(n).join('●●');
    return r;
  };
  const walk = (v) => {
    if (typeof v === 'string') return fix(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(obj);
}

/** 通貨Qの目安：正解1問ごと＋全問正解ボーナス＋直しポイント */
export function estimateQ(score, { qPerCorrect = 10, qAllBonus = 20 } = {}) {
  const c = Number(score?.correct) || 0, t = Number(score?.total) || 0;
  return c * qPerCorrect + (t > 0 && c === t ? qAllBonus : 0);
}

/** 保護者ポータル取り込み用 JSON（ポータル側の取りこみ仕様が変わったらここだけ直す） */
// ─── こども学習サポートポータル の 形（2026-10 時点の 本物の コレクション）に 合わせる ───
//   ポータルの「取りこみ」タブに 貼ると、各コレクションへ 追加される（同じ 内容を 2回 貼っても ふえない id）。
//   形の 正本：docs/DATA_CONTRACT.md（ここを 変えたら そちらも 直す）
export const PORTAL_KIND = 'mochi-mona-portal';
const SOURCE_LABEL = { test: 'テスト', homework: '宿題' };

/** テストの おこづかい（ポータルの きまり：満点の 60%以上 10円・90%以上 50円・100% 100円） */
export function testYen(score, full) {
  const p = full > 0 ? score / full : 0;
  return p >= 1 ? 100 : p >= 0.9 ? 50 : p >= 0.6 ? 10 : 0;
}
function addDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));

export function toPortalPayload(mode, result, { unit, date }) {
  const base = { kind: PORTAL_KIND, schema: 'mochi-mona/portal-import@2', exported_at: new Date().toISOString(), learner: 'Learner-A', source: 'mochi-mona' };
  const r = result || {};
  if (mode === 'test' || mode === 'homework') {
    const unitId = unit?.id || r.allowTests?.[0]?.unit_id || '';
    const subject = unit?.subject || r.subject || '';
    const unitName = unit?.title || '';
    const tests = (r.allowTests || []).map((t) => ({ t, score: num(t.score), full: num(t.max_score) || 100 })).filter((x) => x.score !== null);
    const m = r.meeting;
    const meetings = m ? [{
      date: m.date || date, source: SOURCE_LABEL[mode], subject, unit: unitName, unit_id: unitId,
      did: m.did || (m.observations || [])[0] || '',
      hyps: (m.hypotheses || []).map((h) => ({ cls: h.code, text: [h.evidence, h.next_step ? '→ ' + h.next_step : ''].filter(Boolean).join(' ') })),
      child: (m.plan || []).join(' ／ '),
      check: m.check || '',
      checkDate: addDays(m.date || date, 7),
      adult: '', talk: [], proposals: [], result: null,
      score: tests[0] ? tests[0].score + ' / ' + tests[0].full : '',
      title: m.title || '', observations: m.observations || [],
      learner: 'Learner-A', from: 'mochi-mona',
    }] : [];
    const allowTests = mode === 'test' ? tests.map(({ t, score, full }) => ({
      date: t.date || date, subject: t.subject || subject, score, full, yen: testYen(score, full),
      note: [t.title, unitName].filter(Boolean).join(' / '), unit_id: unitId || t.unit_id || '', from: 'mochi-mona',
    })) : [];
    return { ...base, meetings, allowTests };
  }
  if (mode === 'letter') {
    return {
      ...base,
      events: (r.events || []).filter((e) => e && e.date && e.title).map((e) => ({
        date: e.date, title: e.title, kind: /テスト|検定/.test(e.title) ? 'テスト' : '行事',
        note: [e.note, (e.bring || []).length ? '持ち物：' + e.bring.join('・') : ''].filter(Boolean).join(' ／ '), from: 'mochi-mona',
      })),
      letters: (r.letters || []).map((l) => ({ date: l.date || date, no: l.no || '', title: l.title || '', points: l.points || [], from: 'mochi-mona' })),
    };
  }
  if (mode === 'notebook') {
    // Q は yumekawa の セーブデータに ある ので ポータルには 入らない（目安として 残すだけ）
    return { ...base, q_awards: [{ date, amount: r.q_estimate, reason: `ノート丸付け ${r.score?.correct}/${r.score?.total}`, kind: r.kind }] };
  }
  return base;
}

export class KidsConverter {
  constructor({ root, api, camera, getSettings, toast }) {
    Object.assign(this, { root, api, camera, getSettings, toast });
    this.mode = 'test';
    this.date = todayStr();
    this.subjectHint = '';
    this.images = [];       // [{ base64, mimeType, thumb, bytes }] — 分析後に破棄
    this.result = null;
    this.selectedUnitId = '';
    this.quizChecks = [];
    this.discarded = false;
    this.busy = false;
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('change', (e) => this._onChange(e));
    this.render();
  }

  // ───────── 状態 ─────────

  get unitCandidates() {
    return getUnitCandidates(new Date(this.date + 'T12:00:00'), { subject: this.subjectHint });
  }

  get selectedUnit() {
    return unitById(this.selectedUnitId) || null;
  }

  discardImages() {
    // Base64 文字列への参照をすべて断つ（GC 対象にする）
    for (const im of this.images) { im.base64 = null; im.dataUrl = null; }
    this.images = [];
  }

  /** カメラ/ファイルからの画像を受け取る（app.js からも呼ぶ） */
  addImages(pages) {
    if (!pages?.length) return;
    this.images.push(...pages);
    this.discarded = false;
    this.result = null;
    this.render();
  }

  // ───────── イベント ─────────

  async _onClick(e) {
    const t = e.target.closest('[data-k]');
    if (!t) return;
    const k = t.dataset.k;
    try {
      if (k === 'mode') { this.mode = t.dataset.mode; this.result = null; this.render(); }
      else if (k === 'camera') this.addImages(await this.camera.open({ title: `📷 ${MODES[this.mode].label}`, hint: '氏名欄・学校名は必ず黒塗りしてから確定してください' }));
      else if (k === 'pick') this.root.querySelector('[data-ref="file"]').click();
      else if (k === 'removeImg') { this.images.splice(Number(t.dataset.i), 1); this.render(); }
      else if (k === 'analyze') await this.analyze();
      else if (k === 'unit') { this.selectedUnitId = t.dataset.unit; this.render(); }
      else if (k === 'copyPortal') await this.copyPortal();
      else if (k === 'saveLog') await this.saveLog();
      else if (k === 'saveQuiz') await this.saveQuizDrafts();
      else if (k === 'revalidate') this.revalidate(Number(t.dataset.i));
      else if (k === 'copyQuiz') await this.copyQuizzes();
      else if (k === 'obsUri') await this.exportObsidian('uri');
      else if (k === 'obsVault') await this.exportObsidian('vault');
      else if (k === 'copyQ') await this.copyQAward();
      else if (k === 'saveArt') await this.saveArt();
      else if (k === 'reset') { this.discardImages(); this.result = null; this.discarded = false; this.render(); }
    } catch (err) {
      this.toast(err.message || String(err), 'error');
    }
  }

  async _onChange(e) {
    const t = e.target;
    if (t.dataset.ref === 'file') {
      const files = [...t.files].filter((f) => f.type.startsWith('image/'));
      const pdfs = [...t.files].filter((f) => f.type === 'application/pdf');
      t.value = '';
      if (pdfs.length) this.toast('こどもモードはPDF非対応です（黒塗りできないため）。画像で取り込んでください', 'warn');
      if (files.length) this.addImages(await this.camera.editFiles(files, { title: '✂️ 送信前の黒塗り確認', hint: '氏名欄・学校名を黒塗りしてから確定' }));
    }
    if (t.dataset.ref === 'date') { this.date = t.value || todayStr(); this.render(); }
    if (t.dataset.ref === 'subject') { this.subjectHint = t.value; this.render(); }
    if (t.dataset.ref === 'quizSel') { /* チェック状態は保存時に読む */ }
  }

  // ───────── 分析 ─────────

  async analyze() {
    if (!this.images.length) return this.toast('先に撮影または画像を選択してください', 'warn');
    if (this.busy) return;
    this.busy = true;
    this.render();
    const s = this.getSettings();
    const unitCandidates = this.unitCandidates;
    const images = this.images.map((im) => ({ base64: im.base64, mimeType: im.mimeType }));
    try {
      let res = await this.api.call('analyze_kids', {
        mode: this.mode, date: this.date, subjectHint: this.subjectHint,
        unitCandidates: unitCandidates.map(({ id, subject, title, phase }) => ({ id, subject, title, phase })),
        images,
      });
      res = scrubDeep(res, s);
      if (this.mode === 'notebook') res.q_estimate = estimateQ(res.score, s);
      this.result = res;
      const firstUnit = res.unit_candidates?.[0]?.unit_id || res.allowTests?.[0]?.unit_id || unitCandidates[0]?.id || '';
      this.selectedUnitId = unitById(firstUnit) ? firstUnit : '';
      this._validateAll();
    } finally {
      images.length = 0;
      if (this.mode !== 'art') { this.discardImages(); this.discarded = true; }   // 作品は保存判断まで保持
      this.busy = false;
      this.render();
    }
  }

  _originalFor(quiz) {
    const w = (this.result?.wrong_items || []).find((x) => String(x.no) === String(quiz.source_no));
    return w?.summary || '';
  }

  _validateAll() {
    this.quizChecks = (this.result?.quizzes || []).map((q) => validateQuiz(q, { originalText: this._originalFor(q) }));
  }

  revalidate(i) {
    const ta = this.root.querySelector(`[data-ref="quizJson"][data-i="${i}"]`);
    try {
      const q = JSON.parse(ta.value);
      this.result.quizzes[i] = q;
      this.quizChecks[i] = validateQuiz(q, { originalText: this._originalFor(q) });
      this.render();
      this.toast(`類題${i + 1}を再検証しました：${STATUS_LABEL[this.quizChecks[i].status]}`);
    } catch {
      this.toast('JSONの形が正しくありません', 'error');
    }
  }

  // ───────── 出力 ─────────

  portalPayload() {
    return toPortalPayload(this.mode, this.result, { unit: this.selectedUnit, date: this.date });
  }

  async copyPortal() {
    await navigator.clipboard.writeText(JSON.stringify(this.portalPayload(), null, 2));
    this.toast('📋 ポータル用JSONをコピーしました');
  }

  async saveLog() {
    const r = this.result, u = this.selectedUnit;
    const p = this.portalPayload();
    const row = {
      date: this.date,
      source_type: { test: 'テスト', homework: '宿題', letter: '配布物', notebook: 'ノート' }[this.mode],
      subject: u?.subject || r.subject || '',
      unit_id: u?.id || '',
      allow_test_json: JSON.stringify(p.allowTests || p.q_awards || []),
      meeting_json: JSON.stringify(p.meetings || []),
      letter_events_json: JSON.stringify(this.mode === 'letter' ? { events: p.events, letters: p.letters } : {}),
    };
    await this.api.call('save_kids_log', { row });
    this.toast('💾 kids_meetings_log に記録しました');
  }

  _selectedQuizIdx() {
    return [...this.root.querySelectorAll('[data-ref="quizSel"]')].filter((x) => x.checked).map((x) => Number(x.dataset.i));
  }

  async saveQuizDrafts() {
    const idx = this._selectedQuizIdx();
    if (!idx.length) return this.toast('保存する類題にチェックを入れてください', 'warn');
    const fails = idx.filter((i) => this.quizChecks[i]?.status === 'fail');
    if (fails.length) return this.toast(`⛔ 不合格の類題（${fails.map((i) => i + 1).join(', ')}）は保存できません。JSONを直して再検証してください`, 'error');
    const stage = this.root.querySelector('[data-ref="stageId"]')?.value.trim() || '';
    const drafts = idx.map((i) => {
      const quiz = toYumekawaQuiz(this.result.quizzes[i]);
      return {
        target_stage_id: stage,
        unit_id: this.selectedUnit?.id || '',
        quiz_json: JSON.stringify(quiz),
        validation_status: this.quizChecks[i].status,
      };
    });
    const res = await this.api.call('save_quiz_draft', { drafts });
    this.toast(`📝 quiz_drafts に ${res.saved ?? drafts.length} 問保存しました（approved=false）`);
  }

  async copyQuizzes() {
    const idx = this._selectedQuizIdx();
    const list = (idx.length ? idx : (this.result.quizzes || []).map((_, i) => i)).map((i) => {
      return toYumekawaQuiz(this.result.quizzes[i]);
    });
    await navigator.clipboard.writeText(JSON.stringify(list, null, 2));
    this.toast('類題JSON（yumekawa形式）をコピーしました');
  }

  async copyQAward() {
    await navigator.clipboard.writeText(JSON.stringify(this.portalPayload(), null, 2));
    this.toast(`💰 ${this.result.q_estimate}Q の記録JSONをコピーしました`);
  }

  async exportObsidian(how) {
    const md = buildKidsMarkdown(this.mode, this.result, { date: this.date, unit: this.selectedUnit });
    const title = this.result.meeting?.title || this.result.title || MODES[this.mode].label;
    const name = `${this.date} ${safeFileName(title)}`;
    const s = this.getSettings();
    const folder = (s.kidsVaultFolder || 'Mochi/Learner-A').replace(/\/$/, '');
    if (how === 'uri') {
      const r = await openInObsidian({ vault: s.kidsVaultName || s.vaultName, path: `${folder}/${name}`, content: md });
      if (r === 'clipboard') this.toast('長文のためクリップボード経由でObsidianに渡しました');
    } else if (fsSupported()) {
      const p = await saveToVault(`${folder}/${name}.md`, md, 'kids');
      this.toast(`📓 保存しました: ${p}`);
    } else {
      downloadMarkdown(name, md);
    }
  }

  async saveArt() {
    const ok = this.root.querySelector('[data-ref="artConsent"]')?.checked;
    if (!ok) return this.toast('保存するには「保護者として保存に同意」にチェックしてください', 'warn');
    if (!this.images.length) return this.toast('保存する画像がありません', 'warn');
    const r = this.result || {};
    const im = this.images[0];
    await this.api.call('save_kids_art', {
      explicitConsent: true,
      title: safeFileName(r.title || '作品'),
      kind: r.kind || '',
      description: r.description || '',
      date: this.date,
      image: { base64: im.base64, mimeType: im.mimeType },
      thumbDataUrl: im.thumb,
    });
    this.discardImages();
    this.discarded = true;
    this.toast('🎨 作品を Mochi_Kids_Art に保存しました');
    this.render();
  }

  // ───────── 描画 ─────────

  render() {
    const m = MODES[this.mode];
    const units = this.unitCandidates;
    const isTest = this.mode === 'test' || this.mode === 'homework';
    this.root.innerHTML = `
      <section class="space-y-3">
        <div class="scroll-x" role="tablist" aria-label="何を取り込むか">
          ${Object.entries(MODES).map(([k, v]) => `
            <button data-k="mode" data-mode="${k}" class="chip" role="tab" aria-pressed="${k === this.mode}">${v.icon} ${v.label}</button>`).join('')}
        </div>

        <div class="panel p-4 space-y-4">
          <div>
            <div class="font-bold">${m.icon} ${m.label}</div>
            <div class="text-xs mt-0.5" style="color:var(--ink-2)">${m.desc}</div>
          </div>

          <div class="flex flex-wrap gap-2">
            <label class="lbl">日付<input type="date" data-ref="date" value="${this.date}" class="field"></label>
            ${isTest ? `<label class="lbl">教科<select data-ref="subject" class="field">
                <option value="">おまかせ</option>
                ${SUBJECTS.map((s) => `<option ${s === this.subjectHint ? 'selected' : ''}>${s}</option>`).join('')}
              </select></label>` : ''}
          </div>

          <div class="flex gap-2 overflow-x-auto pb-1">
            ${this.images.map((im, i) => `
              <div class="relative flex-none">
                <img src="${im.thumb}" class="h-24 rounded-xl" alt="取り込んだ画像${i + 1}">
                <button data-k="removeImg" data-i="${i}" class="absolute top-1 right-1 w-6 h-6 rounded-full text-xs" style="background:var(--ink);color:#fff" aria-label="この画像を外す">✕</button>
              </div>`).join('')}
            <button data-k="camera" class="flex-none h-24 w-24 rounded-xl grid place-items-center text-xs text-center" style="border:2px dashed var(--line);color:var(--ink-2)"><span><span class="block text-2xl">📷</span>撮る</span></button>
            <button data-k="pick" class="flex-none h-24 w-24 rounded-xl grid place-items-center text-xs text-center" style="border:2px dashed var(--line);color:var(--ink-2)"><span><span class="block text-2xl">🖼️</span>写真から</span></button>
            <input type="file" data-ref="file" accept="image/*" multiple class="hidden">
          </div>
          ${this.discarded && !this.images.length ? '<p class="text-xs" style="color:var(--yomogi-d)">分析に使った画像は消しました。ドライブには保存していません。</p>' : ''}

          ${isTest && units.length ? `
          <details class="text-xs">
            <summary class="cursor-pointer" style="color:var(--ink-2)">この時期の単元候補（AIへのヒント）</summary>
            <div class="flex flex-wrap gap-1 mt-2">${units.map((u) => `<span class="tag" style="background:var(--yomogi-l);color:var(--yomogi-d)">${u.id} ${esc(u.title)}・${u.phase}</span>`).join('')}</div>
          </details>` : ''}

          <button data-k="analyze" ${this.busy || !this.images.length ? 'disabled' : ''} class="btn btn-accent w-full py-3 text-base">
            ${this.busy ? '分析しています…' : this.images.length ? `${m.label}をする` : 'まず画像を取り込んでください'}</button>
          <p class="text-[.72rem] leading-relaxed" style="color:var(--ink-2)">🔒 ${this.mode === 'art'
            ? '作品画像は、下で「保存に同意」した時だけドライブ（Mochi_Kids_Art）に保存します。'
            : '画像はドライブに保存せず、分析が終わったら消します。結果の名前は Learner-A で表示します。'}</p>
        </div>

        <div data-ref="result">${this.result ? this._renderResult() : ''}</div>
      </section>`;
  }

  _actions(extra = '') {
    return `<div class="flex flex-wrap gap-2 pt-3 mt-1 border-t" style="border-color:var(--line)">
      ${this.mode !== 'art' ? `<button data-k="copyPortal" class="btn btn-accent">ポータル用JSONをコピー</button>
      <button data-k="saveLog" class="btn btn-ink">記録シートに保存</button>` : ''}
      ${extra}
      <button data-k="obsUri" class="btn btn-line">Obsidianで開く</button>
      <button data-k="obsVault" class="btn btn-line">.mdで保存</button>
      <button data-k="reset" class="btn btn-soft">次の1枚へ</button>
    </div>`;
  }

  _renderResult() {
    const r = this.result;
    const demo = r._demo ? '<span class="tag" style="background:#FFF3D6;color:#8A5A00">サンプル応答</span>' : '';
    if (this.mode === 'test' || this.mode === 'homework') return this._renderTest(r, demo);
    if (this.mode === 'letter') return this._renderLetter(r, demo);
    if (this.mode === 'notebook') return this._renderNotebook(r, demo);
    return this._renderArt(r, demo);
  }

  _renderTest(r, demo) {
    const t = r.allowTests?.[0] || {};
    const m = r.meeting || {};
    const cands = r.unit_candidates?.length ? r.unit_candidates : this.unitCandidates.slice(0, 3).map((u) => ({ unit_id: u.id, title: u.title, confidence: null, reason: '日付から推定' }));
    return `
    <div class="panel p-4 space-y-5">
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2"><h3 class="font-bold text-lg leading-snug">${esc(m.title || t.title || '分析結果')}</h3>${demo}</div>
          <div class="text-xs mt-0.5" style="color:var(--ink-2)">${esc(t.title || '')}</div>
        </div>
        <div class="text-right flex-none">
          <div class="num text-4xl leading-none" style="color:var(--yomogi-d)">${t.score ?? '–'}</div>
          <div class="text-xs" style="color:var(--ink-2)">/ ${t.max_score ?? '–'}点</div>
        </div>
      </div>

      <div>
        <div class="text-sm font-bold mb-1.5">単元を選ぶ</div>
        <div class="grid sm:grid-cols-3 gap-2">
          ${cands.slice(0, 3).map((c, i) => {
            const on = c.unit_id === this.selectedUnitId;
            return `<button data-k="unit" data-unit="${esc(c.unit_id)}" aria-pressed="${on}" class="text-left rounded-2xl px-3 py-2 text-sm border-2" style="border-color:${on ? 'var(--yomogi)' : 'var(--line)'};background:${on ? 'var(--yomogi-l)' : '#fff'}">
              <div class="text-[.7rem]" style="color:var(--ink-2)">第${i + 1}候補${c.confidence != null ? `・${Math.round(c.confidence * 100)}%` : ''}</div>
              <div class="font-bold">${esc(c.unit_id)} ${esc(unitById(c.unit_id)?.title || c.title || '')}</div>
              <div class="text-[.7rem]" style="color:var(--ink-2)">${esc(c.reason || '')}</div>
            </button>`;
          }).join('')}
        </div>
      </div>

      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <div class="text-sm font-bold mb-1">問題ごと</div>
          <ul class="text-sm space-y-1">${(t.items || []).map((it) => `<li class="flex gap-2"><span class="w-5 text-center">${it.correct ? '⭕' : '✖️'}</span><span class="w-10 flex-none" style="color:var(--ink-2)">${esc(it.no)}</span><span>${esc(it.topic)}</span></li>`).join('')}</ul>
        </div>
        <div>
          ${m.did ? `<div class="text-sm font-bold mb-1">できたこと</div><p class="text-sm mb-2">${esc(m.did)}</p>` : ''}
          <div class="text-sm font-bold mb-1">見えたこと</div>
          <ul class="text-sm space-y-1 list-disc pl-5">${(m.observations || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        </div>
      </div>

      <div>
        <div class="text-sm font-bold mb-1.5">つまずきの見立て</div>
        <div class="space-y-2">${(m.hypotheses || []).map((h) => `
          <div class="well p-3 text-sm flex gap-3">
            <span class="num w-8 h-8 flex-none rounded-full grid place-items-center" style="background:var(--yomogi);color:#fff">${esc(h.code)}</span>
            <div><b>${esc(h.label || HYPOTHESIS[h.code] || '')}</b>　${esc(h.evidence)}
              <div class="mt-1" style="color:var(--yomogi-d)">家でやること：${esc(h.next_step)}</div></div>
          </div>`).join('')}</div>
        ${(m.plan || []).length ? `<ul class="text-sm mt-2 space-y-1">${m.plan.map((x) => `<li>☐ ${esc(x)}</li>`).join('')}</ul>` : ''}
        ${m.check ? `<div class="text-sm mt-2" style="color:var(--ink-2)">1週間後に 見ること：${esc(m.check)}</div>` : ''}
      </div>

      ${this._renderQuizzes(r)}
      ${this._actions()}
    </div>`;
  }

  _renderQuizzes(r) {
    const qs = r.quizzes || [];
    if (!qs.length) return '';
    const badge = { pass: 'background:var(--yomogi-l);color:var(--yomogi-d)', warn: 'background:#FFF3D6;color:#8A5A00', fail: 'background:#FBE3E8;color:#B4324A' };
    return `
    <div class="pt-1">
      <div class="flex flex-wrap items-end gap-2 mb-2">
        <div>
          <div class="text-sm font-bold">yumekawa 用の類題</div>
          <div class="text-[.72rem]" style="color:var(--ink-2)">AGENTS.md のルールで自動チェック済み</div>
        </div>
        <div class="flex-1"></div>
        <label class="lbl">yumekawa の ステージID<input data-ref="stageId" list="mm-stage-ids" class="field !py-1.5 w-64" value="${esc(this.selectedUnit?.stages?.[0] || '')}" placeholder="例: 算数/わり算/hissan_2digit01"></label>
        <datalist id="mm-stage-ids">${(this.selectedUnit?.stages || []).map((sid) => `<option value="${esc(sid)}">`).join('')}</datalist>
      </div>
      <div class="space-y-3">
        ${qs.map((q, i) => {
          const v = this.quizChecks[i] || { status: 'warn', checks: [] };
          const { source_no, ...plain } = q;
          return `
          <div class="rounded-2xl border p-3" style="border-color:var(--line)">
            <div class="flex items-start gap-2">
              <input type="checkbox" data-ref="quizSel" data-i="${i}" ${v.status !== 'fail' ? 'checked' : ''} class="mt-1.5 w-4 h-4" aria-label="類題${i + 1}を選ぶ">
              <div class="flex-1 min-w-0">
                <div class="text-[.72rem]" style="color:var(--ink-2)">${esc(q.job_title)}・${esc(q.scenario)}</div>
                <div class="font-bold text-sm leading-relaxed">${esc(q.q)}</div>
                <ol class="text-sm mt-1 space-y-0.5">${(q.a || []).map((a, j) => `<li style="${j === Number(q.c) ? 'color:var(--yomogi-d);font-weight:700' : ''}">${'ABCD'[j]}. ${esc(a)} <span class="text-[.7rem]" style="color:var(--ink-2)">${[...String(a)].length}字</span></li>`).join('')}</ol>
                <div class="text-xs mt-1" style="color:var(--ink-2)">ヒント：${esc(q.hint)}</div>
              </div>
              <span class="tag whitespace-nowrap !text-xs !px-2 !py-1" style="${badge[v.status]}">${STATUS_LABEL[v.status]}</span>
            </div>
            <details class="mt-2">
              <summary class="text-xs cursor-pointer" style="color:var(--ink-2)">チェック結果・JSONを直す</summary>
              <ul class="text-xs mt-1 space-y-0.5">${v.checks.map((c) => `<li>${{ ok: '✅', warn: '⚠️', fail: '⛔' }[c.level]} ${esc(c.label)} <span style="color:var(--ink-2)">${esc(c.detail)}</span></li>`).join('')}</ul>
              <textarea data-ref="quizJson" data-i="${i}" rows="8" class="field mt-2 font-mono text-xs">${esc(JSON.stringify({ ...plain, source_no }, null, 2))}</textarea>
              <button data-k="revalidate" data-i="${i}" class="btn btn-ink btn-sm mt-1">もう一度チェック</button>
            </details>
          </div>`;
        }).join('')}
      </div>
      <div class="flex flex-wrap gap-2 mt-2">
        <button data-k="saveQuiz" class="btn btn-accent">選んだ類題を quiz_drafts に保存</button>
        <button data-k="copyQuiz" class="btn btn-line">JSONをコピー</button>
      </div>
    </div>`;
  }

  _renderLetter(r, demo) {
    return `
    <div class="panel p-4 space-y-4">
      <div class="flex items-center gap-2"><h3 class="font-bold text-lg">配布物から取り出した予定</h3>${demo}</div>
      <ul class="space-y-2">${(r.events || []).map((e) => `
        <li class="flex gap-3 items-start">
          <div class="well px-2 py-1 text-center flex-none w-16"><div class="num text-lg leading-none">${esc(String(e.date || '').slice(5).replace('-', '/'))}</div></div>
          <div class="text-sm"><b>${esc(e.title)}</b> <span style="color:var(--ink-2)">${esc(e.note || '')}</span>
            ${e.bring?.length ? `<div class="text-xs mt-0.5" style="color:var(--ink-2)">持ち物：${e.bring.map(esc).join('、')}</div>` : ''}</div>
        </li>`).join('') || '<li class="text-sm" style="color:var(--ink-2)">予定は見つかりませんでした</li>'}</ul>
      ${(r.letters || []).map((l) => `<div class="well p-3 text-sm"><b>${esc(l.title)}</b> <span class="text-xs" style="color:var(--ink-2)">${esc(l.date || '')}</span>
        <ul class="list-disc pl-5 mt-1 space-y-0.5">${(l.points || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}
      ${this._actions()}
    </div>`;
  }

  _renderNotebook(r, demo) {
    return `
    <div class="panel p-4 space-y-4">
      <div class="flex items-center gap-2"><h3 class="font-bold text-lg">ノート丸付け（${r.kind === 'kanji' ? '漢字' : '筆算'}）</h3>${demo}</div>
      <div class="flex gap-3 items-stretch">
        <div class="flex-1 rounded-2xl p-3 text-sm leading-relaxed" style="background:var(--yomogi-l)">
          <div class="text-xs font-bold mb-0.5" style="color:var(--yomogi-d)">ニコより</div>${esc(r.niko_comment)}
        </div>
        <div class="flex-none rounded-2xl px-4 py-2 text-center grid place-items-center" style="background:#FBF1D9">
          <div><div class="num text-4xl leading-none" style="color:#9A6B00">${r.q_estimate ?? 0}<span class="text-lg">Q</span></div>
          <div class="text-[.7rem] mt-1" style="color:var(--ink-2)">${r.score?.correct ?? '-'}/${r.score?.total ?? '-'}問 正解</div></div>
        </div>
      </div>
      <div class="space-y-1.5">
        ${(r.items || []).map((it) => `
        <div class="flex items-start gap-3 text-sm py-1.5 border-b" style="border-color:var(--line)">
          <span class="w-6 text-center">${it.correct ? '⭕' : '✖️'}</span>
          <span class="w-24 flex-none font-bold">${esc(it.problem)}</span>
          <span class="w-20 flex-none">${esc(it.learner_answer)}${!it.correct && it.correct_answer ? `<span class="block text-xs" style="color:var(--yomogi-d)">正 ${esc(it.correct_answer)}</span>` : ''}</span>
          <span class="text-xs flex-1" style="color:var(--ink-2)">${it.mistake_type ? `<b>${esc(it.mistake_type)}</b>　` : ''}${esc(it.comment)}</span>
        </div>`).join('')}
      </div>
      ${this._actions(`<button data-k="copyQ" class="btn" style="background:var(--kinako);color:var(--ink)">Qの記録JSONをコピー</button>`)}
    </div>`;
  }

  _renderArt(r, demo) {
    return `
    <div class="panel p-4 space-y-3">
      <div class="flex items-center gap-2"><h3 class="font-bold text-lg">${esc(r.title)}</h3>${demo}</div>
      <div class="text-sm">${esc(r.kind)}　${esc(r.description)}</div>
      <div class="rounded-2xl p-3 text-sm" style="background:var(--yomogi-l)"><span class="text-xs font-bold" style="color:var(--yomogi-d)">ニコより</span><br>${esc(r.niko_comment)}</div>
      ${this.images.length ? `
      <label class="flex items-start gap-2 text-sm rounded-2xl p-3" style="background:#FBF1D9">
        <input type="checkbox" data-ref="artConsent" class="mt-1"> 保護者として、この作品の画像を Google ドライブ（Mochi_Kids_Art）に保存することに同意します
      </label>
      <button data-k="saveArt" class="btn btn-accent">作品をドライブに保存</button>` : '<p class="text-sm" style="color:var(--ink-2)">保存済み、または画像は消去済みです。</p>'}
      ${this._actions()}
    </div>`;
  }
}
