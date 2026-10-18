// api.js — GAS Web App 通信 ＆ GAS未接続時のローカル実装（localStorage + Gemini直接 or モック）
import {
  buildPersonalPrompt, buildKidsPrompt, buildChatSystem,
  callGeminiDirect, mockPersonal, mockKids, mockChat,
} from './ai.js';

const LS = {
  cards: 'mochi.cards',
  drafts: 'mochi.quizDrafts',
  kidsLog: 'mochi.kidsLog',
  notebook: 'mochi.notebooklmBuffer',
  art: 'mochi.kidsArt',
};

const load = (k, d = []) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch (e) { throw new Error('ブラウザの保存容量がいっぱいです（デモモード）。古いカードを削除するかGASに接続してください'); }
};
const nowIso = () => new Date().toISOString();
const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 接続モード: 'gas' | 'gemini' | 'mock' */
export function connectionMode(s) {
  if (s.gasUrl) return 'gas';
  if (s.geminiKey && s.modelFast) return 'gemini';
  return 'mock';
}

export function createApi(getSettings) {
  async function call(action, payload = {}) {
    const s = getSettings();
    return connectionMode(s) === 'gas' ? callGas(s, action, payload) : callLocal(s, action, payload);
  }
  return { call, mode: () => connectionMode(getSettings()) };
}

// ─────────────────────────────── GAS ───────────────────────────────

async function callGas(s, action, payload) {
  let res;
  try {
    // text/plain にすることで「単純リクエスト」となり CORS プリフライトが発生しない（GASの定石）
    res = await fetch(s.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: s.token, action, payload }),
      redirect: 'follow',
    });
  } catch (e) {
    throw new Error('GASに接続できません。Webアプリの「アクセスできるユーザー」が「全員」になっているか確認してください');
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('GASの応答がJSONではありません（URL・デプロイ設定を確認）'); }
  if (!data.ok) throw new Error(data.error || 'GASエラー');
  return data.data;
}

// ─────────────────────────────── ローカル（デモ） ───────────────────────────────

async function ai(s, which, args, mockFn) {
  const model = which === 'deep' ? (s.modelDeep || s.modelFast) : s.modelFast;
  if (s.geminiKey && model) return callGeminiDirect({ apiKey: s.geminiKey, model, ...args });
  return mockFn();
}

async function callLocal(s, action, p) {
  switch (action) {
    case 'ping':
      return { mode: connectionMode(s) };

    case 'analyze_personal':
      return ai(s, 'fast', { prompt: buildPersonalPrompt(), images: p.images || [] }, mockPersonal);

    case 'save_personal': {
      const cards = load(LS.cards);
      const t = nowIso();
      const card = {
        id: newId('m'), created_at: t, updated_at: t,
        para_category: p.card.para_category || 'inbox',
        is_pinned: !!p.card.is_pinned,
        title: p.card.title || '無題',
        summary: p.card.summary || [],
        raw_ocr: p.card.raw_ocr || '',
        genre_tags: p.card.genre_tags || [],
        action_tags: p.card.action_tags || [],
        drive_file_id: '', drive_view_url: '',
        thumb: p.thumbDataUrl || '',
        notebooklm_synced: false,
      };
      if (p.syncNotebookLM) appendLocalNotebook(card);
      card.notebooklm_synced = !!p.syncNotebookLM;
      cards.unshift(card);
      save(LS.cards, cards);
      return card;
    }

    case 'list_personal':
      return load(LS.cards);

    case 'update_personal': {
      const cards = load(LS.cards);
      const i = cards.findIndex((c) => c.id === p.id);
      if (i < 0) throw new Error('カードが見つかりません');
      cards[i] = { ...cards[i], ...p.fields, updated_at: nowIso() };
      save(LS.cards, cards);
      return cards[i];
    }

    case 'delete_personal': {
      save(LS.cards, load(LS.cards).filter((c) => c.id !== p.id));
      return { deleted: p.id };
    }

    case 'append_notebooklm': {
      const cards = load(LS.cards);
      const c = cards.find((x) => x.id === p.id);
      if (!c) throw new Error('カードが見つかりません');
      appendLocalNotebook(c);
      c.notebooklm_synced = true;
      save(LS.cards, cards);
      return { appended: true, local: true };
    }

    case 'chat_personal': {
      const system = buildChatSystem(p.card);
      return {
        reply: await ai(s, 'deep', { prompt: p.message, history: p.history || [], system, json: false }, () => mockChat(p.message)),
      };
    }

    case 'analyze_kids': {
      const prompt = buildKidsPrompt(p.mode, p);
      const which = p.mode === 'test' || p.mode === 'homework' ? 'deep' : 'fast';
      return ai(s, which, { prompt, images: p.images || [] }, () => mockKids(p.mode, p));
    }

    case 'save_kids_log': {
      const log = load(LS.kidsLog);
      const row = { id: newId('k'), ...p.row, exported_to_portal: false };
      log.unshift(row);
      save(LS.kidsLog, log);
      return row;
    }

    case 'save_quiz_draft': {
      const drafts = load(LS.drafts);
      const rows = (p.drafts || []).map((d) => ({ draft_id: newId('q'), created_at: nowIso(), approved: false, ...d }));
      drafts.unshift(...rows);
      save(LS.drafts, drafts);
      return { saved: rows.length, rows };
    }

    case 'save_kids_art': {
      if (p.explicitConsent !== true) throw new Error('作品保存には保護者の明示的な同意が必要です');
      const art = load(LS.art);
      art.unshift({ id: newId('art'), created_at: nowIso(), title: p.title, kind: p.kind, description: p.description, thumb: p.thumbDataUrl || '' });
      save(LS.art, art.slice(0, 30));
      return { saved: true, local: true };
    }

    case 'sync_drive_inbox':
      throw new Error('ドライブInbox取込はGAS接続時のみ使えます（設定でGAS Web App URLを入力）');

    default:
      throw new Error('未対応のaction: ' + action);
  }
}

function appendLocalNotebook(card) {
  const buf = localStorage.getItem(LS.notebook) || '';
  const block = `\n\n## ${card.title}\n- 日付: ${new Date().toLocaleDateString('ja-JP')}\n- タグ: ${[...(card.genre_tags || []), ...(card.action_tags || [])].join(', ')}\n\n### 要約\n${(card.summary || []).map((x) => `- ${x}`).join('\n')}\n\n### OCR全文\n${card.raw_ocr || ''}\n\n---`;
  try { localStorage.setItem(LS.notebook, buf + block); } catch { /* 容量超過時は無視 */ }
}

/** デモモードで溜めた NotebookLM 用テキストを取得（.md ダウンロード用） */
export function getLocalNotebookBuffer() {
  return localStorage.getItem(LS.notebook) || '';
}

export function getLocalDrafts() { return load(LS.drafts); }
export function getLocalKidsLog() { return load(LS.kidsLog); }
