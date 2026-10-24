// yumekawa の js/school-units.js（正本）から、このリポジトリの js/school-units.js を作り直す。
//   使い方：node tools/sync-school-units.mjs ../yumekawa/js/school-units.js
//   - id・期間・教科・ステージは そのまま。term "0" は allYear: true。
//   - 公開リポジトリなので、MASK の 語（地名など）は 単元名から 消す。
import fs from 'node:fs';
import vm from 'node:vm';

const src = process.argv[2];
if (!src) { console.error('yumekawa の js/school-units.js の パスを 指定してください'); process.exit(1); }
const MASK = ['こまき'];

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(src, 'utf8'), ctx);
const units = ctx.window.SCHOOL_UNITS || [];
if (!units.length) { console.error('SCHOOL_UNITS が 読めませんでした'); process.exit(1); }

const clean = (t) => MASK.reduce((s, w) => s.split(w).join(''), t).replace(/\s+/g, ' ').trim();
const rows = units.map((u) => '  { id: ' + JSON.stringify(u.id) + ', subject: ' + JSON.stringify(u.subject) + ', title: ' + JSON.stringify(clean(u.name)) +
  ', start: ' + JSON.stringify(u.from.slice(5)) + ', end: ' + JSON.stringify(u.to.slice(5)) + (u.term === '0' ? ', allYear: true' : '') +
  ', stages: ' + JSON.stringify(u.stages || []) + ' },');

const target = new URL('../js/school-units.js', import.meta.url);
const old = fs.readFileSync(target, 'utf8');
const start = old.indexOf('export const SCHOOL_UNITS = [');
const end = old.indexOf('];', start) + 2;
fs.writeFileSync(target, old.slice(0, start) + 'export const SCHOOL_UNITS = [\n' + rows.join('\n') + '\n];' + old.slice(end));
console.log(rows.length + ' 単元を 書き出しました');
