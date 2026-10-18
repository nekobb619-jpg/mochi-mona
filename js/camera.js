// camera.js — DeskCameraModal：書画カメラ4K撮影・180度回転・鉛筆くっきり・黒塗りマスク/トリミング・送信用リサイズ
//
// 使い方:
//   const cam = new DeskCameraModal();
//   const pages = await cam.open({ title: '書画カメラ' });          // カメラから（連続撮影可）
//   const pages = await cam.editFiles(fileList, { title: '編集' }); // 選択した画像を黒塗り編集
//   → pages: [{ base64, mimeType, dataUrl, thumb, width, height, bytes }] / キャンセル時 null
//
// 原寸画像はこのモーダルの中だけで扱い、確定（export）後はキャンバスを width=0 にして破棄します。

export const EXPORT = {
  LONG_EDGE: 2048,
  TARGET_BYTES: 400 * 1024,
  QUALITIES: [0.86, 0.8, 0.74, 0.68, 0.6, 0.52],
  CONTRAST: 1.12,
  THUMB: 320,
};

const VIDEO_PRIMARY = { width: { ideal: 3840 }, height: { ideal: 2160 } };
const VIDEO_FALLBACK = { width: { ideal: 1920 }, height: { ideal: 1080 } };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function cloneCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
function freeCanvas(c) { if (c) { c.width = 0; c.height = 0; } }

/** 鉛筆くっきりフィルタ：輝度化 → 背景を白に飛ばし、線を濃く（レベル補正＋ガンマ） */
export function pencilFilter(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  // ヒストグラムから黒点/白点を推定（上位・下位を少し切る）
  const hist = new Uint32Array(256);
  const step = Math.max(1, Math.floor(d.length / 4 / 200000)) * 4;
  let n = 0;
  for (let i = 0; i < d.length; i += step) {
    hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++; n++;
  }
  let acc = 0, black = 0, white = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.01) { black = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.25) { white = v; break; } } // 紙が大半なので白側は広めに切る
  if (white - black < 40) { black = Math.max(0, white - 120); }
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let x = (v - black) / Math.max(1, white - black);
    x = Math.min(1, Math.max(0, x));
    lut[v] = Math.round(Math.pow(x, 1.6) * 255); // ガンマで中間調（薄い鉛筆）を濃く
  }
  for (let i = 0; i < d.length; i += 4) {
    const y = lut[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0];
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function applyOp(canvas, op) {
  if (op.t === 'rot180') {
    const c = makeCanvas(canvas.width, canvas.height);
    const ctx = c.getContext('2d');
    ctx.translate(c.width, c.height);
    ctx.rotate(Math.PI);
    ctx.drawImage(canvas, 0, 0);
    freeCanvas(canvas);
    return c;
  }
  if (op.t === 'pencil') return pencilFilter(canvas);
  if (op.t === 'mask') {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(op.x, op.y, op.w, op.h);
    return canvas;
  }
  if (op.t === 'crop') {
    const c = makeCanvas(op.w, op.h);
    c.getContext('2d').drawImage(canvas, op.x, op.y, op.w, op.h, 0, 0, op.w, op.h);
    freeCanvas(canvas);
    return c;
  }
  return canvas;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
function canvasToBlob(c, type, q) {
  return new Promise((res) => c.toBlob(res, type, q));
}

/** 送信用に縮小（長辺2048px）・コントラスト強調・JPEG圧縮（〜400KB目標） */
export async function exportCanvas(src, opts = {}) {
  const longEdge = opts.longEdge || EXPORT.LONG_EDGE;
  const scale = Math.min(1, longEdge / Math.max(src.width, src.height));
  // 大きく縮める時は半分ずつ段階縮小して文字のジャギーを抑える
  let cur = src, w = src.width, h = src.height;
  const tw = Math.round(src.width * scale), th = Math.round(src.height * scale);
  const temps = [];
  while (w / 2 > tw) {
    w = Math.round(w / 2); h = Math.round(h / 2);
    const t = makeCanvas(w, h);
    const tctx = t.getContext('2d');
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(cur, 0, 0, w, h);
    temps.push(t); cur = t;
  }
  const out = makeCanvas(tw, th);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if ('filter' in ctx) ctx.filter = `contrast(${opts.contrast ?? EXPORT.CONTRAST})`;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(cur, 0, 0, tw, th);
  temps.forEach(freeCanvas);

  let blob = null;
  for (const q of EXPORT.QUALITIES) {
    blob = await canvasToBlob(out, 'image/jpeg', q);
    if (blob && blob.size <= (opts.targetBytes || EXPORT.TARGET_BYTES)) break;
  }
  const dataUrl = await blobToBase64(blob);

  const ts = Math.min(1, EXPORT.THUMB / Math.max(tw, th));
  const tc = makeCanvas(tw * ts, th * ts);
  tc.getContext('2d').drawImage(out, 0, 0, tc.width, tc.height);
  const thumb = tc.toDataURL('image/jpeg', 0.7);
  freeCanvas(tc); freeCanvas(out);

  return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', dataUrl, thumb, width: tw, height: th, bytes: blob.size };
}

export class DeskCameraModal {
  constructor() {
    this.root = null;
    this.stream = null;
    this.pages = [];      // { original, rendered, ops: [] }
    this.current = -1;
    this.rotateLive = false;
    this.pencilOnCapture = false;
    this.tool = 'mask';
    this._resolve = null;
    this._onKey = this._onKey.bind(this);
  }

  // ───────── 公開API ─────────

  async open({ title = '📷 書画カメラ', hint = '' } = {}) {
    this._mount(title, hint);
    this._setStage('live');
    await this._startStream();
    return new Promise((r) => (this._resolve = r));
  }

  async editFiles(files, { title = '✂️ 黒塗り・トリミング', hint = '' } = {}) {
    this._mount(title, hint);
    for (const f of files) {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => null);
      if (!bmp) continue;
      const c = makeCanvas(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close?.();
      this.pages.push({ original: c, rendered: cloneCanvas(c), ops: [] });
    }
    if (!this.pages.length) { this._close(null); throw new Error('画像を読み込めませんでした'); }
    this.current = 0;
    this._setStage('edit');
    return new Promise((r) => (this._resolve = r));
  }

  // ───────── DOM ─────────

  _mount(title, hint) {
    this.pages = []; this.current = -1;
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-50 bg-stone-900/90 flex flex-col text-stone-100';
    el.innerHTML = `
      <div class="flex items-center gap-2 px-3 py-2 bg-stone-900 border-b border-stone-700">
        <div class="font-bold">${title}</div>
        <div class="text-xs text-stone-400 truncate flex-1" data-ref="hint">${hint}</div>
        <button data-act="cancel" class="px-3 py-1.5 rounded-lg bg-stone-700 hover:bg-stone-600 text-sm">✕ やめる</button>
      </div>

      <!-- 撮影ステージ -->
      <div data-stage="live" class="flex-1 min-h-0 flex flex-col">
        <div class="flex-1 min-h-0 relative flex items-center justify-center bg-black">
          <video data-ref="video" autoplay playsinline muted class="max-w-full max-h-full"></video>
          <div data-ref="flash" class="absolute inset-0 bg-white opacity-0 pointer-events-none transition-opacity duration-150"></div>
          <div data-ref="res" class="absolute top-2 left-2 text-xs bg-black/60 px-2 py-1 rounded"></div>
        </div>
        <div class="flex flex-wrap items-center gap-2 px-3 py-2 bg-stone-900">
          <select data-ref="device" class="bg-stone-800 rounded-lg px-2 py-1.5 text-sm max-w-[14rem]"></select>
          <button data-act="rotLive" class="px-3 py-1.5 rounded-lg bg-stone-700 text-sm">🔄 180°</button>
          <label class="flex items-center gap-1 text-sm"><input type="checkbox" data-ref="pencilLive"> ✏️ 鉛筆くっきり</label>
          <div class="flex-1"></div>
          <button data-act="shutter" class="w-[72px] h-[72px] rounded-full bg-white border-[6px] border-stone-300 shadow-lg active:scale-95" title="Space キーでも撮影" aria-label="撮影"></button>
          <div class="flex-1"></div>
          <button data-act="toEdit" class="px-4 py-2 rounded-lg bg-[#B9506E] font-bold text-sm disabled:opacity-40" disabled>次へ：黒塗り確認 →</button>
        </div>
      </div>

      <!-- 編集ステージ -->
      <div data-stage="edit" class="flex-1 min-h-0 flex flex-col hidden">
        <div class="flex flex-wrap items-center gap-2 px-3 py-2 bg-stone-900 text-sm">
          <div class="flex rounded-lg overflow-hidden">
            <button data-tool="mask" class="px-3 py-1.5 bg-stone-700">⬛ 黒塗り</button>
            <button data-tool="crop" class="px-3 py-1.5 bg-stone-700">✂️ トリミング</button>
          </div>
          <button data-act="rot" class="px-3 py-1.5 rounded-lg bg-stone-700">🔄 180°</button>
          <button data-act="pencil" class="px-3 py-1.5 rounded-lg bg-stone-700">✏️ 鉛筆くっきり</button>
          <button data-act="undo" class="px-3 py-1.5 rounded-lg bg-stone-700">↩︎ 戻す</button>
          <button data-act="delPage" class="px-3 py-1.5 rounded-lg bg-stone-700">🗑 このページ削除</button>
          <button data-act="backLive" class="px-3 py-1.5 rounded-lg bg-stone-700" data-ref="backLive">📷 撮り足す</button>
          <div class="text-xs text-stone-400">ドラッグで範囲指定（氏名欄・写り込んだ手など）</div>
        </div>
        <div class="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-stone-800 p-2">
          <div class="relative inline-block" data-ref="stageBox">
            <canvas data-ref="view" class="block max-w-full max-h-[calc(100vh-14rem)] h-auto w-auto"></canvas>
            <canvas data-ref="overlay" class="absolute inset-0 w-full h-full" style="touch-action:none;cursor:crosshair"></canvas>
          </div>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 bg-stone-900">
          <div class="text-xs text-stone-400" data-ref="pageInfo"></div>
          <div class="flex-1"></div>
          <button data-act="done" class="px-4 py-2 rounded-lg bg-[#B9506E] font-bold text-sm">✅ この内容で確定</button>
        </div>
      </div>

      <!-- ページ一覧 -->
      <div class="flex gap-2 overflow-x-auto px-3 py-2 bg-stone-950 min-h-[5.5rem]" data-ref="strip"></div>
      <div data-ref="busy" class="hidden absolute inset-0 bg-black/50 flex items-center justify-center text-lg">処理中…</div>
    `;
    document.body.appendChild(el);
    this.root = el;
    this.$ = (sel) => el.querySelector(`[data-ref="${sel}"]`);
    el.addEventListener('click', (e) => this._onClick(e));
    this.$('device').addEventListener('change', () => this._startStream(this.$('device').value));
    this.$('pencilLive').addEventListener('change', (e) => (this.pencilOnCapture = e.target.checked));
    document.addEventListener('keydown', this._onKey);
    this._bindPointer();
    this._selectTool('mask');
  }

  _setStage(stage) {
    this.stage = stage;
    this.root.querySelectorAll('[data-stage]').forEach((s) => s.classList.toggle('hidden', s.dataset.stage !== stage));
    if (stage === 'edit') {
      this.$('backLive').classList.toggle('hidden', !this._liveCapable);
      this._renderView();
    }
    this._renderStrip();
  }

  _onKey(e) {
    if (e.key === 'Escape') { this._close(null); return; }
    if (this.stage === 'live' && (e.code === 'Space' || e.key === 'Enter') && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) {
      e.preventDefault();
      this._capture();
    }
    if (this.stage === 'edit' && (e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this._undo(); }
  }

  async _onClick(e) {
    const t = e.target.closest('[data-act],[data-tool],[data-page]');
    if (!t) return;
    if (t.dataset.tool) return this._selectTool(t.dataset.tool);
    if (t.dataset.page !== undefined) {
      this.current = Number(t.dataset.page);
      if (this.stage !== 'edit') this._setStage('edit'); else { this._renderView(); this._renderStrip(); }
      return;
    }
    switch (t.dataset.act) {
      case 'cancel': return this._close(null);
      case 'shutter': return this._capture();
      case 'rotLive':
        this.rotateLive = !this.rotateLive;
        this.$('video').style.transform = this.rotateLive ? 'rotate(180deg)' : '';
        t.classList.toggle('bg-[#B9506E]', this.rotateLive);
        return;
      case 'toEdit': if (this.pages.length) { this.current = this.current < 0 ? 0 : this.current; this._setStage('edit'); } return;
      case 'backLive': this._setStage('live'); return;
      case 'rot': return this._pushOp({ t: 'rot180' });
      case 'pencil': return this._pushOp({ t: 'pencil' });
      case 'undo': return this._undo();
      case 'delPage': return this._deletePage();
      case 'done': return this._finish();
    }
  }

  // ───────── カメラ ─────────

  async _startStream(deviceId) {
    this._stopStream();
    // 端末指定がなければ外側（背面）カメラを優先：Pixel では背面、PCでは書画カメラ/ウェブカメラがそのまま選ばれる
    const base = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('このブラウザ/環境ではカメラが使えません（https または localhost で開いてください）');
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { ...base, ...VIDEO_PRIMARY }, audio: false });
      } catch {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { ...base, ...VIDEO_FALLBACK }, audio: false });
      }
      this._liveCapable = true;
      const v = this.$('video');
      v.srcObject = this.stream;
      await v.play().catch(() => {});
      const s = this.stream.getVideoTracks()[0]?.getSettings?.() || {};
      this.$('res').textContent = `${s.width || v.videoWidth}×${s.height || v.videoHeight}`;
      await this._fillDevices(s.deviceId);
    } catch (err) {
      this._liveCapable = false;
      this.$('res').textContent = '';
      this.$('hint').textContent = `⚠️ ${err.message || err}（「画像・PDFを選択」からも取り込めます）`;
    }
  }

  async _fillDevices(activeId) {
    const sel = this.$('device');
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    sel.innerHTML = devs.map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === activeId ? 'selected' : ''}>${d.label || 'カメラ ' + (i + 1)}</option>`).join('');
  }

  _stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  _capture() {
    const v = this.$('video');
    if (!v.videoWidth) return;
    const c = makeCanvas(v.videoWidth, v.videoHeight);
    const ctx = c.getContext('2d');
    if (this.rotateLive) { ctx.translate(c.width, c.height); ctx.rotate(Math.PI); }
    ctx.drawImage(v, 0, 0);
    const page = { original: c, rendered: cloneCanvas(c), ops: [] };
    if (this.pencilOnCapture) { page.ops.push({ t: 'pencil' }); page.rendered = pencilFilter(page.rendered); }
    this.pages.push(page);
    this.current = this.pages.length - 1;
    const f = this.$('flash');
    f.style.opacity = '0.8';
    setTimeout(() => (f.style.opacity = '0'), 120);
    this.root.querySelector('[data-act="toEdit"]').disabled = false;
    this._renderStrip();
  }

  // ───────── 編集 ─────────

  _selectTool(tool) {
    this.tool = tool;
    this.root?.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('bg-[#B9506E]', b.dataset.tool === tool));
  }

  _page() { return this.pages[this.current]; }

  _renderView() {
    const p = this._page();
    if (!p) return;
    const view = this.$('view'), ov = this.$('overlay');
    view.width = ov.width = p.rendered.width;
    view.height = ov.height = p.rendered.height;
    view.getContext('2d').drawImage(p.rendered, 0, 0);
    ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
    const masks = p.ops.filter((o) => o.t === 'mask').length;
    this.$('pageInfo').textContent = `ページ ${this.current + 1}/${this.pages.length} ・ ${p.rendered.width}×${p.rendered.height} ・ 黒塗り ${masks}か所`;
  }

  _pushOp(op) {
    const p = this._page();
    if (!p) return;
    p.ops.push(op);
    p.rendered = applyOp(p.rendered, op);
    this._renderView();
    this._renderStrip();
  }

  _undo() {
    const p = this._page();
    if (!p || !p.ops.length) return;
    p.ops.pop();
    freeCanvas(p.rendered);
    let c = cloneCanvas(p.original);
    for (const op of p.ops) c = applyOp(c, op);
    p.rendered = c;
    this._renderView();
    this._renderStrip();
  }

  _deletePage() {
    const p = this._page();
    if (!p) return;
    freeCanvas(p.original); freeCanvas(p.rendered);
    this.pages.splice(this.current, 1);
    if (!this.pages.length) {
      this.current = -1;
      if (this._liveCapable) this._setStage('live'); else this._close(null);
      return;
    }
    this.current = Math.min(this.current, this.pages.length - 1);
    this._renderView();
    this._renderStrip();
  }

  _bindPointer() {
    const ov = this.$('overlay');
    let start = null;
    const toImg = (e) => {
      const r = ov.getBoundingClientRect();
      return {
        x: Math.min(ov.width, Math.max(0, ((e.clientX - r.left) / r.width) * ov.width)),
        y: Math.min(ov.height, Math.max(0, ((e.clientY - r.top) / r.height) * ov.height)),
      };
    };
    const rectOf = (a, b) => ({
      x: Math.round(Math.min(a.x, b.x)), y: Math.round(Math.min(a.y, b.y)),
      w: Math.round(Math.abs(a.x - b.x)), h: Math.round(Math.abs(a.y - b.y)),
    });
    ov.addEventListener('pointerdown', (e) => {
      if (!this._page()) return;
      ov.setPointerCapture(e.pointerId);
      start = toImg(e);
    });
    ov.addEventListener('pointermove', (e) => {
      if (!start) return;
      const r = rectOf(start, toImg(e));
      const ctx = ov.getContext('2d');
      const lw = Math.max(2, ov.width / 400);
      ctx.clearRect(0, 0, ov.width, ov.height);
      if (this.tool === 'mask') {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, ov.width, ov.height);
        ctx.clearRect(r.x, r.y, r.w, r.h);
      }
      ctx.setLineDash([lw * 4, lw * 3]);
      ctx.lineWidth = lw;
      ctx.strokeStyle = '#E98FA7';
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    });
    const end = (e) => {
      if (!start) return;
      const r = rectOf(start, toImg(e));
      start = null;
      ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
      const min = Math.max(6, ov.width / 300);
      if (r.w < min || r.h < min) return;
      this._pushOp({ t: this.tool === 'crop' ? 'crop' : 'mask', ...r });
    };
    ov.addEventListener('pointerup', end);
    ov.addEventListener('pointercancel', () => { start = null; ov.getContext('2d').clearRect(0, 0, ov.width, ov.height); });
  }

  _renderStrip() {
    const strip = this.$('strip');
    if (!strip) return;
    strip.innerHTML = this.pages.map((p, i) => {
      const t = makeCanvas(120, (120 * p.rendered.height) / p.rendered.width);
      t.getContext('2d').drawImage(p.rendered, 0, 0, t.width, t.height);
      const url = t.toDataURL('image/jpeg', 0.6);
      freeCanvas(t);
      const masks = p.ops.filter((o) => o.t === 'mask').length;
      return `<button data-page="${i}" class="relative shrink-0 rounded-md overflow-hidden border-2 ${i === this.current ? 'border-[#E98FA7]' : 'border-transparent'}">
        <img src="${url}" class="h-16 w-auto block" alt="ページ${i + 1}">
        <span class="absolute bottom-0 left-0 text-[10px] bg-black/70 px-1">${i + 1}${masks ? ' ⬛' + masks : ''}</span></button>`;
    }).join('') || '<div class="text-xs text-stone-500 self-center">撮影したページがここに並びます（Spaceキーで連続撮影）</div>';
  }

  async _finish() {
    if (!this.pages.length) return;
    this.$('busy').classList.remove('hidden');
    try {
      const out = [];
      for (const p of this.pages) out.push(await exportCanvas(p.rendered));
      this._close(out);
    } catch (err) {
      this.$('busy').classList.add('hidden');
      alert('画像の書き出しに失敗しました: ' + (err.message || err));
    }
  }

  _close(result) {
    this._stopStream();
    document.removeEventListener('keydown', this._onKey);
    for (const p of this.pages) { freeCanvas(p.original); freeCanvas(p.rendered); }
    this.pages = [];
    this.root?.remove();
    this.root = null;
    const r = this._resolve;
    this._resolve = null;
    r?.(result);
  }
}
