// school-units.js — 単元カレンダーマスタ（u001〜u053）
// ※ yumekawa 側 school-units.js のミラー。実データと差があれば yumekawa 側の内容で丸ごと置き換えてください。
//   start / end は学年度内の "MM-DD"（4月始まり）。年をまたぐ単元は end < start で表現できます。

export const SCHOOL_YEAR_START_MONTH = 4;

export const SCHOOL_UNITS = [
  // ── 算数 ──
  { id: 'u001', subject: '算数', title: '大きな数のしくみ',           start: '04-08', end: '04-24' },
  { id: 'u002', subject: '算数', title: '折れ線グラフと表',           start: '04-25', end: '05-16' },
  { id: 'u003', subject: '算数', title: 'わり算の筆算(1)',            start: '05-19', end: '06-13' },
  { id: 'u004', subject: '算数', title: '角の大きさ',                 start: '06-16', end: '07-04' },
  { id: 'u005', subject: '算数', title: '小数のしくみ',               start: '07-07', end: '09-12' },
  { id: 'u006', subject: '算数', title: 'わり算の筆算(2)',            start: '09-16', end: '10-10' },
  { id: 'u007', subject: '算数', title: 'がい数の表し方',             start: '10-14', end: '10-31' },
  { id: 'u008', subject: '算数', title: '計算のきまり',               start: '11-04', end: '11-14' },
  { id: 'u009', subject: '算数', title: '垂直・平行と四角形',         start: '11-17', end: '12-12' },
  { id: 'u010', subject: '算数', title: 'そろばん',                   start: '12-15', end: '12-19' },
  { id: 'u011', subject: '算数', title: '分数',                       start: '01-08', end: '01-23' },
  { id: 'u012', subject: '算数', title: '変わり方',                   start: '01-26', end: '02-06' },
  { id: 'u013', subject: '算数', title: '面積のくらべ方と表し方',     start: '02-09', end: '02-27' },
  { id: 'u014', subject: '算数', title: '小数のかけ算とわり算',       start: '03-02', end: '03-13' },
  { id: 'u015', subject: '算数', title: '直方体と立方体',             start: '03-09', end: '03-19' },
  { id: 'u016', subject: '算数', title: '調べ方と整理のしかた',       start: '10-01', end: '10-10' },
  // ── 国語 ──
  { id: 'u017', subject: '国語', title: '白いぼうし',                 start: '04-10', end: '04-30' },
  { id: 'u018', subject: '国語', title: '漢字辞典の使い方',           start: '05-07', end: '05-16' },
  { id: 'u019', subject: '国語', title: 'アップとルーズで伝える',     start: '05-19', end: '06-06' },
  { id: 'u020', subject: '国語', title: '一つの花',                   start: '06-09', end: '06-27' },
  { id: 'u021', subject: '国語', title: '新聞をつくろう',             start: '06-30', end: '07-18' },
  { id: 'u022', subject: '国語', title: 'ごんぎつね',                 start: '09-08', end: '10-03' },
  { id: 'u023', subject: '国語', title: '慣用句',                     start: '10-06', end: '10-17' },
  { id: 'u024', subject: '国語', title: '世界にほこる和紙',           start: '10-20', end: '11-14' },
  { id: 'u025', subject: '国語', title: '熟語の意味',                 start: '11-17', end: '11-28' },
  { id: 'u026', subject: '国語', title: 'ウナギのなぞを追って',       start: '12-01', end: '12-19' },
  { id: 'u027', subject: '国語', title: '初雪のふる日',               start: '01-13', end: '02-06' },
  { id: 'u028', subject: '国語', title: '漢字の組み立て',             start: '02-09', end: '02-20' },
  { id: 'u029', subject: '国語', title: '調べて話そう、生活調査隊',   start: '02-24', end: '03-17' },
  // ── 理科 ──
  { id: 'u030', subject: '理科', title: '季節と生き物（春）',         start: '04-08', end: '05-09' },
  { id: 'u031', subject: '理科', title: '天気と気温',                 start: '05-12', end: '05-30' },
  { id: 'u032', subject: '理科', title: '電流のはたらき',             start: '06-02', end: '06-27' },
  { id: 'u033', subject: '理科', title: '雨水のゆくえと地面のようす', start: '06-30', end: '07-18' },
  { id: 'u034', subject: '理科', title: '季節と生き物（夏）',         start: '07-07', end: '07-18' },
  { id: 'u035', subject: '理科', title: '月や星の動き',               start: '09-08', end: '10-03' },
  { id: 'u036', subject: '理科', title: 'とじこめた空気と水',         start: '10-06', end: '10-24' },
  { id: 'u037', subject: '理科', title: '季節と生き物（秋）',         start: '10-27', end: '11-07' },
  { id: 'u038', subject: '理科', title: '人の体のつくりと運動',       start: '11-10', end: '11-28' },
  { id: 'u039', subject: '理科', title: '物の体積と温度',             start: '12-01', end: '12-19' },
  { id: 'u040', subject: '理科', title: '物のあたたまり方',           start: '01-13', end: '02-06' },
  { id: 'u041', subject: '理科', title: 'すがたを変える水',           start: '02-09', end: '03-13' },
  // ── 社会 ──
  { id: 'u042', subject: '社会', title: 'わたしたちの県のようす',     start: '04-08', end: '04-25' },
  { id: 'u043', subject: '社会', title: '県の地形と土地利用',         start: '04-28', end: '05-16' },
  { id: 'u044', subject: '社会', title: '水はどこから',               start: '05-19', end: '06-06' },
  { id: 'u045', subject: '社会', title: '安全な水を守る取り組み',     start: '06-09', end: '06-20' },
  { id: 'u046', subject: '社会', title: 'ごみのゆくえ',               start: '06-23', end: '07-11' },
  { id: 'u047', subject: '社会', title: 'リサイクルとごみを減らす工夫', start: '07-14', end: '09-19' },
  { id: 'u048', subject: '社会', title: '地震からくらしを守る',       start: '09-22', end: '10-10' },
  { id: 'u049', subject: '社会', title: '風水害からくらしを守る',     start: '10-14', end: '10-31' },
  { id: 'u050', subject: '社会', title: '地いきに受けつがれる行事と文化財', start: '11-04', end: '11-28' },
  { id: 'u051', subject: '社会', title: '地いきの発展につくした先人', start: '12-01', end: '01-30' },
  { id: 'u052', subject: '社会', title: '伝統的な産業がさかんな地いき', start: '02-02', end: '02-27' },
  { id: 'u053', subject: '社会', title: '国際交流に取り組む地いき',   start: '03-02', end: '03-19' },
];

export const SUBJECTS = ['算数', '国語', '理科', '社会'];

export function unitById(id) {
  return SCHOOL_UNITS.find((u) => u.id === id) || null;
}

/** refDate を含む学年度の開始年（4月始まり） */
export function schoolYearOf(refDate = new Date()) {
  const y = refDate.getFullYear();
  return refDate.getMonth() + 1 >= SCHOOL_YEAR_START_MONTH ? y : y - 1;
}

/** "MM-DD" を refDate の学年度内の Date に変換 */
export function schoolYearDate(mmdd, refDate = new Date()) {
  const [m, d] = mmdd.split('-').map(Number);
  const sy = schoolYearOf(refDate);
  const year = m >= SCHOOL_YEAR_START_MONTH ? sy : sy + 1;
  return new Date(year, m - 1, d);
}

function dayDiff(a, b) {
  return Math.round((a - b) / 86400000);
}

/**
 * 日付から単元候補を返す（期間内=距離0、期間外は日数距離）。
 * テストは単元終了後に返ってくることが多いので、過去側は少し広めに見る。
 */
export function getUnitCandidates(date = new Date(), { subject = '', pastDays = 35, futureDays = 10, limit = 8 } = {}) {
  const ref = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return SCHOOL_UNITS
    .filter((u) => !subject || u.subject === subject)
    .map((u) => {
      const s = schoolYearDate(u.start, ref);
      let e = schoolYearDate(u.end, ref);
      if (e < s) e = new Date(e.getFullYear() + 1, e.getMonth(), e.getDate());
      let distance = 0;
      if (ref < s) distance = dayDiff(s, ref);          // まだ始まっていない
      else if (ref > e) distance = dayDiff(ref, e);     // 終わった
      const inWindow = (ref < s && distance <= futureDays) || (ref > e && distance <= pastDays) || distance === 0;
      return { ...u, distance, phase: distance === 0 ? '学習中' : ref < s ? 'これから' : '学習済み', inWindow };
    })
    .filter((u) => u.inWindow)
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ inWindow, ...u }) => u);
}
