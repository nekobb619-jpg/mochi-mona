// obsidian-export.js — Markdown 生成 ＆ obsidian:// URI 起動 ＆ File System Access API でローカルVaultへ直接保存

const URI_MAX = 7000; // これを超える content は URI に載せず、クリップボード経由にする
const IDB_NAME = 'mochi-mona';
const IDB_STORE = 'handles';

// ─────────────────────────────── Markdown ───────────────────────────────

const yamlStr = (v) => `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
const yamlList = (arr) => `[${(arr || []).map(yamlStr).join(', ')}]`;
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD（ローカル時刻）

export function safeFileName(s, fallback = 'note') {
  const t = String(s || '').replace(/[\\/:*?"<>|#^\[\]\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return t || fallback;
}

export function buildPersonalMarkdown(card) {
  const date = (card.created_at || '').slice(0, 10) || today();
  const fm = [
    '---',
    'type: mochi-card',
    `date: ${date}`,
    `title: ${yamlStr(card.title)}`,
    `para: ${card.para_category || 'inbox'}`,
    `tags: ${yamlList([...(card.genre_tags || []), ...(card.action_tags || [])].map((t) => String(t).replace(/\s+/g, '_')))}`,
    `mochi_id: ${card.id || ''}`,
    card.drive_view_url ? `source: ${yamlStr(card.drive_view_url)}` : null,
    '---',
  ].filter(Boolean).join('\n');
  return `${fm}

# ${card.title}

## 3行要約
${(card.summary || []).map((x) => `- ${x}`).join('\n')}

${card.drive_view_url ? `[元画像（Google ドライブ）](${card.drive_view_url})\n\n` : ''}## メモ
-

## OCR全文
${card.raw_ocr || ''}
`;
}

/** こども学習ハブの結果 → Markdown（名前は持たない。learner: Learner-A 固定） */
export function buildKidsMarkdown(mode, result, { date = today(), unit } = {}) {
  const typeMap = { test: 'kids-test', homework: 'kids-homework', letter: 'kids-letter', notebook: 'kids-notebook', art: 'kids-art' };
  const fm = [
    '---',
    `type: ${typeMap[mode] || 'kids'}`,
    `date: ${date}`,
    'learner: Learner-A',
    unit ? `unit_id: ${unit.id}` : null,
    unit ? `subject: ${unit.subject}` : null,
    'source: mochi-mona',
    '---',
  ].filter(Boolean).join('\n');

  let body = '';
  if (mode === 'test' || mode === 'homework') {
    const t = result.allowTests?.[0] || {};
    const m = result.meeting || {};
    body = `# ${m.title || t.title || '学習記録'}

- 単元: ${unit ? `${unit.id} ${unit.title}` : '未確定'}
- 得点: ${t.score ?? '-'} / ${t.max_score ?? '-'}

## 見えたこと
${(m.observations || []).map((x) => `- ${x}`).join('\n')}

## つまずき仮説
${(m.hypotheses || []).map((h) => `- **${h.code}:${h.label}** — ${h.evidence}\n  - 次の一手: ${h.next_step}`).join('\n')}

## 1週間プラン
${(m.plan || []).map((x) => `- [ ] ${x}`).join('\n')}

## 類題下書き
${(result.quizzes || []).map((q, i) => `${i + 1}. ${q.q}`).join('\n')}
`;
  } else if (mode === 'letter') {
    body = `# 配布物メモ

## 予定
${(result.events || []).map((e) => `- ${e.date} ${e.title}${e.note ? `（${e.note}）` : ''}${e.bring?.length ? ` 持ち物: ${e.bring.join('、')}` : ''}`).join('\n')}

## 要点
${(result.letters || []).map((l) => `### ${l.title}\n${(l.points || []).map((p) => `- ${p}`).join('\n')}`).join('\n\n')}
`;
  } else if (mode === 'notebook') {
    body = `# ノート丸付け（${result.kind === 'kanji' ? '漢字' : '筆算'}）

- 正解: ${result.score?.correct ?? '-'} / ${result.score?.total ?? '-'}
- 獲得Q（目安）: ${result.q_estimate ?? '-'}

| No | 問題 | こたえ | 判定 | メモ |
|---|---|---|---|---|
${(result.items || []).map((it) => `| ${it.no} | ${it.problem} | ${it.learner_answer} | ${it.correct ? '⭕' : '✖ ' + (it.mistake_type || '')} | ${it.comment || ''} |`).join('\n')}

> ニコ: ${result.niko_comment || ''}
`;
  } else if (mode === 'art') {
    body = `# ${result.title}\n\n- 種類: ${result.kind}\n\n${result.description}\n\n> ニコ: ${result.niko_comment || ''}\n`;
  }
  return `${fm}\n\n${body}`;
}

// ─────────────────────────────── obsidian:// URI ───────────────────────────────

/**
 * Obsidian の new アクションで開く。長文は URI 上限に掛かるのでクリップボード経由に切り替える。
 * @returns {Promise<'uri'|'clipboard'>}
 */
export async function openInObsidian({ vault, path, content }) {
  if (!vault) throw new Error('設定で Vault 名を入力してください');
  const base = `obsidian://new?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/, ''))}`;
  const full = `${base}&content=${encodeURIComponent(content)}`;
  if (full.length <= URI_MAX) {
    window.location.href = full;
    return 'uri';
  }
  await navigator.clipboard.writeText(content);
  window.location.href = `${base}&clipboard=true`;
  return 'clipboard';
}

// ─────────────────────────────── File System Access API ───────────────────────────────

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res) => {
    const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => res(null);
  });
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => res(true);
    tx.onerror = () => res(false);
  });
}

export const fsSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Vault フォルダを選び直す（key ごとに別Vaultを覚えられる: 'personal' / 'kids'） */
export async function pickVault(key = 'personal') {
  if (!fsSupported()) throw new Error('このブラウザは File System Access API に未対応です（PCのChrome/Edgeで使えます）');
  const handle = await window.showDirectoryPicker({ id: `mochi-vault-${key}`, mode: 'readwrite' });
  await idbSet(`vault-${key}`, handle);
  return handle.name;
}

export async function getVaultName(key = 'personal') {
  const h = await idbGet(`vault-${key}`).catch(() => null);
  return h?.name || '';
}

async function getVault(key) {
  let handle = await idbGet(`vault-${key}`);
  if (!handle) { await pickVault(key); handle = await idbGet(`vault-${key}`); }
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) !== 'granted' && (await handle.requestPermission(opts)) !== 'granted') {
    throw new Error('Vault フォルダへの書き込みが許可されませんでした');
  }
  return handle;
}

/**
 * Vault 内の relPath（例: "Mochi/2026-10-18 タイトル.md"）へ保存。既存なら " (2)" を付ける。
 * @returns {Promise<string>} 実際に保存したパス
 */
export async function saveToVault(relPath, content, key = 'personal') {
  const root = await getVault(key);
  const parts = relPath.split('/').filter(Boolean);
  let fileName = parts.pop();
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  const stem = fileName.replace(/\.md$/, '');
  for (let i = 1; i < 50; i++) {
    const name = i === 1 ? `${stem}.md` : `${stem} (${i}).md`;
    try { await dir.getFileHandle(name); } catch { fileName = name; break; }
  }
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
  return [root.name, ...parts, fileName].join('/');
}

/** File System Access API が無い環境向け：.md をダウンロード */
export function downloadMarkdown(fileName, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
