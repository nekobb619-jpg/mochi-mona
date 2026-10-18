// app.js — 状態管理・画面切替・じぶん研究（Personal Brain）・設定
import { createApi, connectionMode, getLocalNotebookBuffer } from './api.js';
import { DeskCameraModal } from './camera.js';
import { KidsConverter } from './kids-converter.js';
import { PARA, PARA_LABEL, ACTION_TAGS } from './ai.js';
import {
  buildPersonalMarkdown, openInObsidian, saveToVault, pickVault, getVaultName,
  fsSupported, downloadMarkdown, safeFileName,
} from './obsidian-export.js';

// ─────────────────────────────── 設定 ───────────────────────────────

const SETTINGS_KEY = 'mochi.settings';
const DEFAULTS = {
  gasUrl: '', token: '',
  geminiKey: '', modelFast: '', modelDeep: '',
  vaultName: '', vaultFolder: 'Mochi',
  kidsVaultName: 'AURA KIDS', kidsVaultFolder: 'Mochi/Learner-A',
  learnerAliases: [], scrubTerms: [],
  qPerCorrect: 10, qAllBonus: 20,
};
const LIST_KEYS = ['learnerAliases', 'scrubTerms'];
const NUM_KEYS = ['qPerCorrect', 'qAllBonus'];

let settings = loadSettings();
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function saveSettings(next) {
  settings = { ...settings, ...next };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
const getSettings = () => settings;

// ─────────────────────────────── 共通 ───────────────────────────────

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const splitTags = (s) => String(s || '').split(/[,、，]/).map((x) => x.trim()).filter(Boolean);

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  const color = { info: 'background:var(--ink);color:#fff', warn: 'background:var(--kinako);color:var(--ink)', error: 'background:#B4324A;color:#fff' }[type] || 'background:var(--ink);color:#fff';
  el.className = 'rounded-2xl px-4 py-3 shadow-lg text-sm';
  el.style.cssText = color;
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6500 : 3500);
}

const api = createApi(getSettings);
const camera = new DeskCameraModal();

const state = {
  mode: localStorage.getItem('mochi.mode') || 'personal',
  cards: [],
  para: 'all',
  query: '',
  genre: '',
  action: '',
  pending: null,   // { images, analysis }
  openCardId: null,
  chatBusy: false,
};

let kids = null;

// ─────────────────────────────── 画面切替 ───────────────────────────────

function setMode(mode) {
  state.mode = mode;
  localStorage.setItem('mochi.mode', mode);
  document.body.dataset.mode = mode;
  document.querySelectorAll('.dango-side').forEach((b) => {
    if (b.dataset.mode === mode) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#mode-title').textContent = mode === 'kids' ? 'こども学習ハブ' : 'じぶん研究';
  document.querySelector('meta[name="theme-color"]').content = '#F3EDEF';
  $('#personal-panel').classList.toggle('hidden', mode !== 'personal');
  $('#kids-panel').classList.toggle('hidden', mode !== 'kids');
  if (mode === 'kids' && !kids) {
    kids = new KidsConverter({ root: $('#kids-panel'), api, camera, getSettings, toast });
  }
}

function renderConnBadge() {
  const m = connectionMode(settings);
  const map = {
    gas: ['GAS', '#5E9E4E', 'GASにつながっています'],
    gemini: ['お試し', '#D9A43A', 'Geminiを直接使用中（保存はこの端末だけ）'],
    mock: ['サンプル', '#B9AFAC', 'サンプル応答で動いています。設定でGASにつなげます'],
  }[m];
  $('#conn-text').textContent = map[0];
  $('#conn-dot').style.background = map[1];
  $('#conn-badge').title = map[2];
}

// ─────────────────────────────── 取り込み ───────────────────────────────

async function onCamera() {
  if (state.mode === 'kids') return kids.addImages(await camera.open({ title: '📷 こども学習ハブ', hint: '氏名欄・学校名は必ず黒塗りしてから確定してください' }));
  const pages = await camera.open({ title: '📷 じぶん研究', hint: 'Spaceキーで連続撮影 → まとめて1枚のカードになります' });
  if (pages?.length) startAnalyze(pages);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function onFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  if (state.mode === 'kids') {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (imgs.length < files.length) toast('こどもモードはPDF非対応です（黒塗りできないため）', 'warn');
    if (imgs.length) kids.addImages(await camera.editFiles(imgs, { title: '✂️ 送信前の黒塗り確認' }));
    return;
  }
  const images = files.filter((f) => f.type.startsWith('image/'));
  const pdfs = files.filter((f) => f.type === 'application/pdf');
  const pages = [];
  if (images.length) {
    const edited = await camera.editFiles(images, { title: '✂️ トリミング・黒塗り（不要ならそのまま確定）' });
    if (!edited) return;
    pages.push(...edited);
  }
  for (const pdf of pdfs) {
    if (pdf.size > 15 * 1024 * 1024) { toast(`${pdf.name} は15MBを超えるためスキップしました`, 'warn'); continue; }
    pages.push({ base64: await fileToBase64(pdf), mimeType: 'application/pdf', thumb: '', bytes: pdf.size, name: pdf.name });
  }
  if (pages.length) startAnalyze(pages);
}

function openCaptureSheet() {
  const kidsMode = state.mode === 'kids';
  $('#capture-title').textContent = kidsMode ? 'こどもの宿題・テストを取り込む' : 'じぶん研究に取り込む';
  $('#cap-inbox').classList.toggle('hidden', kidsMode);
  $('#cap-file-sub').textContent = kidsMode ? '写真から（名前を黒塗りしてから送ります）' : 'ギャラリーやファイルから（PDFも可）';
  $('#file-input').accept = kidsMode ? 'image/*' : 'image/*,application/pdf';
  $('#capture-sheet').showModal();
}

async function onCaptureChoice(choice) {
  const sheet = $('#capture-sheet');
  if (choice === 'file') { $('#file-input').click(); sheet.close(); return; }
  sheet.close();
  if (choice === 'camera') return onCamera();
  if (choice === 'inbox') return onInbox();
}

async function onInbox() {
  toast('ドライブのInboxを取り込んでいます…');
  try {
    const r = await api.call('sync_drive_inbox', {});
    toast(`☁️ ${r.processed} 件をカード化しました${r.remaining ? `（残り ${r.remaining} 件は次回）` : ''}${r.errors?.length ? `／失敗 ${r.errors.length} 件` : ''}`);
    await loadCards();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─────────────────────────────── 分析 → 保存 ───────────────────────────────

async function startAnalyze(pages) {
  const dlg = $('#analyze-modal');
  state.pending = { images: pages, analysis: null };
  $('#an-thumbs').innerHTML = pages.map((p) => p.thumb
    ? `<img src="${p.thumb}" class="h-20 rounded-xl flex-none" alt="">`
    : `<div class="h-20 w-16 rounded-xl flex-none grid place-items-center text-xs well">PDF</div>`).join('');
  $('#an-loading').classList.remove('hidden');
  $('#an-loading').textContent = '読み取り中…（10〜30秒ほど）';
  $('#an-body').classList.add('hidden');
  $('#an-save').disabled = true;
  $('#an-demo').classList.add('hidden');
  if (!dlg.open) dlg.showModal();
  try {
    const a = await api.call('analyze_personal', { images: pages.map(({ base64, mimeType }) => ({ base64, mimeType })) });
    state.pending.analysis = a;
    $('#an-title').value = a.title || '';
    $('#an-summary').value = (a.summary || []).join('\n');
    $('#an-para').innerHTML = PARA.map((p) => `<option value="${p}" ${p === (a.para_category || 'inbox') ? 'selected' : ''}>${PARA_LABEL[p]}</option>`).join('');
    $('#an-genre').value = (a.genre_tags || []).join(', ');
    $('#an-action').value = (a.action_tags || []).join(', ');
    $('#an-ocr').value = a.raw_ocr || '';
    $('#an-notebooklm').checked = (a.para_category === 'knowledge');
    $('#an-pin').checked = false;
    $('#an-demo').classList.toggle('hidden', connectionMode(settings) !== 'mock');
    $('#an-loading').classList.add('hidden');
    $('#an-body').classList.remove('hidden');
    $('#an-save').disabled = false;
  } catch (e) {
    $('#an-loading').textContent = `読み取れませんでした：${e.message}`;
  }
}

async function savePending() {
  const p = state.pending;
  if (!p?.analysis) return;
  const card = {
    title: $('#an-title').value.trim() || '無題',
    summary: $('#an-summary').value.split('\n').map((x) => x.trim()).filter(Boolean),
    para_category: $('#an-para').value,
    genre_tags: splitTags($('#an-genre').value),
    action_tags: splitTags($('#an-action').value),
    raw_ocr: $('#an-ocr').value,
    is_pinned: $('#an-pin').checked,
  };
  const stamp = new Date().toLocaleDateString('sv-SE');
  const payload = {
    card,
    images: p.images.map((im, i) => ({
      base64: im.base64, mimeType: im.mimeType,
      filename: `${stamp}_${safeFileName(card.title, 'mochi')}${p.images.length > 1 ? `_p${i + 1}` : ''}.${im.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`,
    })),
    syncNotebookLM: $('#an-notebooklm').checked,
    thumbDataUrl: p.images[0]?.thumb || '',
  };
  try {
    await api.call('save_personal', payload);
    state.pending = null;
    toast(`🍡 「${card.title}」を保存しました${payload.syncNotebookLM ? '（NotebookLM追記済み）' : ''}`);
    await loadCards();
  } catch (e) {
    toast(`保存に失敗: ${e.message}`, 'error');
    $('#analyze-modal').showModal();   // 入力内容を残したまま開き直す
  }
}

// ─────────────────────────────── 一覧 ───────────────────────────────

async function loadCards() {
  try {
    state.cards = (await api.call('list_personal', {})) || [];
  } catch (e) {
    state.cards = [];
    toast(`一覧の取得に失敗: ${e.message}`, 'error');
  }
  renderBoard();
}

function thumbOf(c) {
  if (c.thumb) return c.thumb;
  const id = String(c.drive_file_id || '').split(',')[0];
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w480` : '';
}

function filteredCards() {
  const q = state.query.toLowerCase();
  return state.cards
    .filter((c) => state.para === 'all' || (state.para === 'pinned' ? c.is_pinned : c.para_category === state.para))
    .filter((c) => !state.genre || (c.genre_tags || []).includes(state.genre))
    .filter((c) => !state.action || (c.action_tags || []).includes(state.action))
    .filter((c) => !q || [c.title, ...(c.summary || []), c.raw_ocr, ...(c.genre_tags || []), ...(c.action_tags || [])].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at)));
}

function renderBoard() {
  const counts = { all: state.cards.length, pinned: state.cards.filter((c) => c.is_pinned).length };
  PARA.forEach((p) => (counts[p] = state.cards.filter((c) => c.para_category === p).length));
  const tabs = [['all', 'すべて'], ['pinned', '📌 ピン'], ...PARA.map((p) => [p, PARA_LABEL[p]])];
  $('#para-tabs').innerHTML = tabs.map(([k, label]) =>
    `<button data-para="${k}" class="chip" role="tab" aria-pressed="${state.para === k}">${label}<span class="cnt">${counts[k]}</span></button>`).join('');

  const genres = [...new Set(state.cards.flatMap((c) => c.genre_tags || []))].sort();
  const actions = [...new Set([...ACTION_TAGS.filter((a) => state.cards.some((c) => (c.action_tags || []).includes(a))), ...state.cards.flatMap((c) => c.action_tags || [])])];
  const chip = (kind, v, on) => `<button data-${kind}="${esc(v)}" class="chip" aria-pressed="${on}">${esc(v)}</button>`;
  $('#tag-filters').innerHTML = `
    ${genres.length ? `<div class="scroll-x items-center"><span class="text-xs flex-none pr-1" style="color:var(--ink-2)">ジャンル</span>${genres.map((g) => chip('genre', g, state.genre === g)).join('')}</div>` : ''}
    ${actions.length ? `<div class="scroll-x items-center"><span class="text-xs flex-none pr-1" style="color:var(--ink-2)">次にやること</span>${actions.map((a) => chip('action', a, state.action === a)).join('')}</div>` : ''}`;

  const list = filteredCards();
  $('#empty-state').classList.toggle('hidden', state.cards.length > 0);
  $('#card-grid').innerHTML = list.map((c) => {
    const t = thumbOf(c);
    return `
    <button data-card="${esc(c.id)}" class="tile ${c.is_pinned ? 'pinned' : ''}">
      <div class="ph">${t
        ? `<img src="${esc(t)}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🍡',style:'font-size:2rem'}))">`
        : '<span style="font-size:2rem">🍡</span>'}</div>
      <div class="p-3">
        <div class="font-bold text-[.92rem] leading-snug line-clamp-2">${esc(c.title)}</div>
        <div class="mt-1.5 flex flex-wrap gap-1">
          ${(c.genre_tags || []).slice(0, 2).map((g) => `<span class="tag tag-g">${esc(g)}</span>`).join('')}
          ${(c.action_tags || []).slice(0, 1).map((g) => `<span class="tag tag-a">${esc(g)}</span>`).join('')}
        </div>
        <div class="mt-1.5 text-[.7rem] flex gap-2" style="color:var(--ink-2)">
          <span>${esc(String(c.created_at).slice(5, 10).replace('-', '/'))}</span>
          <span>${(PARA_LABEL[c.para_category] || '').replace(/^\S+\s/, '')}</span>
          ${c.notebooklm_synced ? '<span title="NotebookLMに追記済み">📚</span>' : ''}
        </div>
      </div>
    </button>`;
  }).join('');
  if (state.cards.length && !list.length) $('#card-grid').innerHTML = '<p class="col-span-full py-10 text-center text-sm" style="color:var(--ink-2)">この条件のカードはありません。絞り込みを外してみてください。</p>';
}

// ─────────────────────────────── カード詳細 ───────────────────────────────

const chatKey = (id) => `mochi.chat.${id}`;
const loadChat = (id) => { try { return JSON.parse(localStorage.getItem(chatKey(id)) || '[]'); } catch { return []; } };
const saveChat = (id, h) => { try { localStorage.setItem(chatKey(id), JSON.stringify(h.slice(-40))); } catch {} };

function openCard(id) {
  state.openCardId = id;
  renderCardDetail();
  const dlg = $('#card-modal');
  if (!dlg.open) dlg.showModal();
}

function currentCard() { return state.cards.find((c) => c.id === state.openCardId); }

function renderCardDetail() {
  const c = currentCard();
  if (!c) return;
  const t = thumbOf(c);
  const chat = loadChat(c.id);
  const ids = String(c.drive_file_id || '').split(',').filter(Boolean);
  $('#card-detail').innerHTML = `
    <div class="flex items-start gap-2">
      <input data-field="title" value="${esc(c.title)}" aria-label="タイトル" class="flex-1 min-w-0 text-lg font-bold bg-transparent rounded-lg px-1 -mx-1 border border-transparent focus:border-[color:var(--line)] focus:outline-none">
      <button data-cd="pin" class="w-9 h-9 rounded-full flex-none ${c.is_pinned ? '' : 'btn-soft'}" style="${c.is_pinned ? 'background:var(--sakura);color:#fff' : ''}" aria-pressed="${c.is_pinned}" aria-label="ピン留め">📌</button>
      <button data-cd="close" class="w-9 h-9 rounded-full btn-soft flex-none" aria-label="閉じる">✕</button>
    </div>
    <div class="text-xs mt-1" style="color:var(--ink-2)">${esc(String(c.created_at).slice(0, 10))}${c.notebooklm_synced ? '　NotebookLM追記済み' : ''}</div>

    <div class="grid md:grid-cols-5 gap-5 mt-4">
      <div class="md:col-span-2 space-y-4">
        ${t ? `<img src="${esc(t)}" referrerpolicy="no-referrer" class="w-full rounded-2xl well" alt="" onerror="this.style.display='none'">` : ''}
        ${c.drive_view_url ? `<a href="${esc(c.drive_view_url)}" target="_blank" rel="noopener" class="text-xs underline" style="color:var(--accent-d)">元の画像をドライブで開く${ids.length > 1 ? `（${ids.length}ページ）` : ''}</a>` : ''}
        <ul class="space-y-1.5 text-sm">${(c.summary || []).map((x) => `<li class="well px-3 py-2">${esc(x)}</li>`).join('')}</ul>
        <div class="grid grid-cols-3 gap-2">
          <label class="lbl col-span-3 sm:col-span-1">置き場所<select data-field="para_category" class="field">${PARA.map((p) => `<option value="${p}" ${p === c.para_category ? 'selected' : ''}>${PARA_LABEL[p]}</option>`).join('')}</select></label>
          <label class="lbl col-span-3 sm:col-span-1">ジャンル<input data-field="genre_tags" value="${esc((c.genre_tags || []).join(', '))}" class="field"></label>
          <label class="lbl col-span-3 sm:col-span-1">次にやること<input data-field="action_tags" value="${esc((c.action_tags || []).join(', '))}" class="field"></label>
        </div>
        <details><summary class="text-sm cursor-pointer" style="color:var(--ink-2)">読み取った本文</summary>
          <pre class="whitespace-pre-wrap text-xs well p-3 mt-1 max-h-64 overflow-auto">${esc(c.raw_ocr)}</pre></details>
        <div class="flex flex-wrap gap-2">
          <button data-cd="obsUri" class="btn btn-line btn-sm">Obsidianで開く</button>
          <button data-cd="obsVault" class="btn btn-line btn-sm">.mdで保存</button>
          <button data-cd="copyMd" class="btn btn-line btn-sm">Markdownをコピー</button>
          <button data-cd="nlm" class="btn btn-sm ${c.notebooklm_synced ? 'btn-soft' : 'btn-ink'}">${c.notebooklm_synced ? 'NotebookLMにもう一度追記' : 'NotebookLMに追記'}</button>
          <button data-cd="delete" class="btn btn-sm btn-soft" style="color:#B4324A">削除</button>
        </div>
      </div>

      <div class="md:col-span-3 flex flex-col well p-3 min-h-[20rem]">
        <div class="text-sm font-bold mb-2">このカードについて相談する</div>
        <div id="chat-log" class="flex-1 overflow-auto space-y-2 max-h-[45vh]">
          ${chat.map((m) => `<div class="${m.role === 'user' ? 'ml-10' : 'mr-10 bg-white'} rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap" style="${m.role === 'user' ? 'background:var(--accent-l)' : ''}">${esc(m.text)}</div>`).join('')
            || '<p class="text-xs leading-relaxed" style="color:var(--ink-2)">撮った内容を前提に質問できます。<br>例：「要点を暗記カード5枚にして」「似ている制度との違いを表にして」</p>'}
          ${state.chatBusy ? '<div class="mr-10 bg-white rounded-2xl px-3 py-2 text-sm" style="color:var(--ink-2)">考えています…</div>' : ''}
        </div>
        <form id="chat-form" class="flex gap-2 mt-2 items-end">
          <textarea id="chat-input" rows="2" class="field text-sm flex-1" placeholder="質問を入力（Ctrl+Enterでも送信）"></textarea>
          <button class="btn btn-accent" ${state.chatBusy ? 'disabled' : ''}>送信</button>
        </form>
      </div>
    </div>`;
  const log = $('#chat-log');
  log.scrollTop = log.scrollHeight;
}

async function updateCard(fields) {
  const c = currentCard();
  if (!c) return;
  Object.assign(c, fields);
  try {
    const updated = await api.call('update_personal', { id: c.id, fields });
    if (updated) Object.assign(c, updated);
  } catch (e) { toast(`更新に失敗: ${e.message}`, 'error'); }
  renderBoard();
}

async function sendChat(text) {
  const c = currentCard();
  if (!c || !text.trim() || state.chatBusy) return;
  const history = loadChat(c.id);
  history.push({ role: 'user', text });
  saveChat(c.id, history);
  state.chatBusy = true;
  renderCardDetail();
  try {
    const { reply } = await api.call('chat_personal', {
      id: c.id,
      card: { title: c.title, summary: c.summary, raw_ocr: c.raw_ocr },
      history: history.slice(0, -1).slice(-20),
      message: text,
    });
    history.push({ role: 'model', text: reply });
    saveChat(c.id, history);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    state.chatBusy = false;
    renderCardDetail();
  }
}

async function onCardAction(act) {
  const c = currentCard();
  if (!c) return;
  const md = () => buildPersonalMarkdown(c);
  const name = `${String(c.created_at).slice(0, 10)} ${safeFileName(c.title)}`;
  const folder = (settings.vaultFolder || 'Mochi').replace(/\/$/, '');
  switch (act) {
    case 'close': $('#card-modal').close(); return;
    case 'pin': await updateCard({ is_pinned: !c.is_pinned }); renderCardDetail(); return;
    case 'copyMd': await navigator.clipboard.writeText(md()); toast('Markdownをコピーしました'); return;
    case 'obsUri': {
      const r = await openInObsidian({ vault: settings.vaultName, path: `${folder}/${name}`, content: md() });
      if (r === 'clipboard') toast('長文のためクリップボード経由でObsidianに渡しました');
      return;
    }
    case 'obsVault':
      if (!fsSupported()) { downloadMarkdown(name, md()); return; }
      toast(`📓 保存しました: ${await saveToVault(`${folder}/${name}.md`, md(), 'personal')}`);
      return;
    case 'nlm': {
      const r = await api.call('append_notebooklm', { id: c.id, card: c });
      c.notebooklm_synced = true;
      toast(r?.local ? '📚 デモ用バッファに追記しました（設定画面から保存できます）' : '📚 NotebookLM用ドキュメントに追記しました');
      renderCardDetail(); renderBoard();
      return;
    }
    case 'delete':
      if (!confirm(`「${c.title}」を削除しますか？（ドライブの画像は残ります）`)) return;
      await api.call('delete_personal', { id: c.id });
      state.cards = state.cards.filter((x) => x.id !== c.id);
      localStorage.removeItem(chatKey(c.id));
      $('#card-modal').close();
      renderBoard();
      toast('削除しました');
  }
}

// ─────────────────────────────── 設定画面 ───────────────────────────────

async function openSettings() {
  const f = $('#settings-form');
  for (const [k, v] of Object.entries(settings)) {
    if (f.elements[k]) f.elements[k].value = Array.isArray(v) ? v.join(', ') : v;
  }
  const [p, k] = await Promise.all([getVaultName('personal').catch(() => ''), getVaultName('kids').catch(() => '')]);
  $('#vault-names').textContent = fsSupported() ? `個人: ${p || '未選択'} ／ こども: ${k || '未選択'}` : 'このブラウザは直接保存に未対応（.mdダウンロードになります）';
  $('#settings-modal').showModal();
}

function readSettingsForm() {
  const f = $('#settings-form');
  const next = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (!f.elements[k]) continue;
    const v = f.elements[k].value.trim();
    next[k] = LIST_KEYS.includes(k) ? splitTags(v) : NUM_KEYS.includes(k) ? Number(v) || 0 : v;
  }
  for (const k of ['modelFast', 'modelDeep']) {
    if (/latest/i.test(next[k])) toast(`${k} に "latest" が含まれています。本番では版を固定したモデル名にしてください`, 'warn');
  }
  return next;
}

// ─────────────────────────────── 起動 ───────────────────────────────

function bind() {
  document.querySelectorAll('.dango-side').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#btn-capture').addEventListener('click', openCaptureSheet);
  $('#capture-sheet').addEventListener('click', (e) => {
    if (e.target === $('#capture-sheet')) return $('#capture-sheet').close();   // 背景タップで閉じる
    const b = e.target.closest('[data-cap]');
    if (!b) return;
    if (b.dataset.cap === 'close') return $('#capture-sheet').close();
    onCaptureChoice(b.dataset.cap).catch((err) => toast(err.message, 'error'));
  });
  $('#file-input').addEventListener('change', (e) => { const fl = [...e.target.files]; e.target.value = ''; onFiles(fl).catch((err) => toast(err.message, 'error')); });
  $('#conn-badge').addEventListener('click', () => toast($('#conn-badge').title));
  for (const id of ['card-modal', 'settings-modal']) {   // 背景タップで閉じる
    $('#' + id).addEventListener('click', (e) => { if (e.target.id === id) e.target.close(); });
  }
  $('#btn-settings').addEventListener('click', openSettings);

  $('#search').addEventListener('input', (e) => { state.query = e.target.value; renderBoard(); });
  $('#para-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-para]'); if (b) { state.para = b.dataset.para; renderBoard(); } });
  $('#tag-filters').addEventListener('click', (e) => {
    const g = e.target.closest('[data-genre]'), a = e.target.closest('[data-action]');
    if (g) state.genre = state.genre === g.dataset.genre ? '' : g.dataset.genre;
    if (a) state.action = state.action === a.dataset.action ? '' : a.dataset.action;
    renderBoard();
  });
  $('#card-grid').addEventListener('click', (e) => { const c = e.target.closest('[data-card]'); if (c) openCard(c.dataset.card); });

  $('#analyze-modal').addEventListener('close', () => {
    if ($('#analyze-modal').returnValue === 'default') savePending();
    $('#analyze-modal').returnValue = '';
  });

  const cd = $('#card-detail');
  cd.addEventListener('click', (e) => { const b = e.target.closest('[data-cd]'); if (b) onCardAction(b.dataset.cd).catch((err) => toast(err.message, 'error')); });
  cd.addEventListener('change', (e) => {
    const f = e.target.dataset.field;
    if (!f) return;
    const v = e.target.value;
    updateCard({ [f]: f.endsWith('_tags') ? splitTags(v) : v });
  });
  cd.addEventListener('submit', (e) => { e.preventDefault(); const t = $('#chat-input'); sendChat(t.value); });
  cd.addEventListener('keydown', (e) => {
    if (e.target.id === 'chat-input' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendChat(e.target.value); }
  });

  $('#settings-modal').addEventListener('close', () => {
    if ($('#settings-modal').returnValue === 'default') {
      const before = connectionMode(settings);
      saveSettings(readSettingsForm());
      renderConnBadge();
      toast('設定を保存しました');
      if (before !== connectionMode(settings) || before === 'gas') loadCards();
      if (kids) kids.render();
    }
    $('#settings-modal').returnValue = '';
  });
  document.querySelectorAll('[data-pick-vault]').forEach((b) => b.addEventListener('click', async () => {
    try { const n = await pickVault(b.dataset.pickVault); toast(`📂 ${n} を選択しました`); openSettings(); }
    catch (e) { if (e.name !== 'AbortError') toast(e.message, 'error'); }
  }));
  $('#btn-test-conn').addEventListener('click', async () => {
    const tmp = { ...settings, ...readSettingsForm() };
    const prev = settings;
    settings = tmp;
    try { const r = await api.call('ping', {}); toast(`接続OK：${JSON.stringify(r)}`); }
    catch (e) { toast(`接続NG：${e.message}`, 'error'); }
    finally { settings = prev; }
  });
  $('#btn-nb-download').addEventListener('click', () => {
    const t = getLocalNotebookBuffer();
    if (!t) return toast('デモ用バッファは空です', 'warn');
    downloadMarkdown('Mochi_Knowledge_Master', `# Mochi Knowledge Master（デモ）${t}`);
  });
}

bind();
setMode(state.mode);
renderConnBadge();
loadCards();
