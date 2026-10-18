// school-units.js — 単元カレンダーマスタ（u001〜u053）
// ★ 正本は yumekawa の js/school-units.js（＝こども学習サポートポータルの単元カレンダー）。ここはそのミラー。
//   id は yumekawa・ポータルと共通のキーなので、勝手に番号を振り直さない。期間を直したら3か所（ポータル・yumekawa・ここ）をそろえる。
//   作り直し：node tools/sync-school-units.mjs /path/to/yumekawa/js/school-units.js
//   start / end は学年度内の "MM-DD"（4月始まり）。allYear: true は通年の単元（候補の後ろに回す）。
//   stages は yumekawa のステージ id（類題の target_stage_id の候補）。公開リポジトリなので地名は入れない。

export const SCHOOL_YEAR_START_MONTH = 4;

export const SCHOOL_UNITS = [
  { id: "u001", subject: "算数", title: "角とその大きさ", start: "04-08", end: "04-24", stages: ["算数/角度/kakudo01","算数/角度/kakudo_zu01","算数/角度/setsumei01"] },
  { id: "u002", subject: "算数", title: "折れ線グラフ", start: "04-20", end: "05-08", stages: ["算数/グラフ/oresen01","算数/グラフ/oresen_yomi01"] },
  { id: "u003", subject: "算数", title: "1けたでわるわり算の筆算", start: "05-08", end: "05-29", stages: ["算数/わり算/hissan_amari01","算数/わり算/hissan_3keta01","算数/わり算/hissan_amari02","算数/わり算/warizan301"] },
  { id: "u004", subject: "算数", title: "一億をこえる数", start: "05-25", end: "06-10", stages: ["算数/大きな数/ookazu01"] },
  { id: "u005", subject: "算数", title: "垂直・平行と四角形", start: "06-08", end: "06-30", stages: ["算数/図形/suichoku_heikou01","算数/図形/shikakukei_bunrui01","算数/図形/taikakusen01"] },
  { id: "u006", subject: "算数", title: "小数（しくみ・たし算ひき算）", start: "06-24", end: "07-17", stages: ["算数/小数/shosu01","算数/小数/shosu_keisan01"] },
  { id: "u007", subject: "算数", title: "2けたでわるわり算の筆算", start: "09-01", end: "10-23", stages: ["算数/わり算/hissan_2digit01","算数/わり算/warizan_challenge01","算数/わり算/nakama_wake01"] },
  { id: "u008", subject: "算数", title: "式と計算の順じょ", start: "09-24", end: "10-16", stages: ["算数/式と計算/keisan_junjo01"] },
  { id: "u009", subject: "算数", title: "面積", start: "10-14", end: "10-30", stages: ["算数/面積/menseki_1","算数/面積/menseki_2","算数/面積/menseki_3"] },
  { id: "u010", subject: "算数", title: "がい数とその計算", start: "11-02", end: "11-18", stages: ["算数/がい数/gaisu01"] },
  { id: "u011", subject: "算数", title: "小数のかけ算・わり算", start: "11-16", end: "12-18", stages: [] },
  { id: "u012", subject: "算数", title: "調べ方と整理のしかた", start: "01-12", end: "01-22", stages: ["探究/データ/data01"] },
  { id: "u013", subject: "算数", title: "分数", start: "01-25", end: "02-10", stages: ["算数/分数/bunsu01"] },
  { id: "u014", subject: "算数", title: "変わり方", start: "02-08", end: "02-19", stages: [] },
  { id: "u015", subject: "算数", title: "直方体と立方体", start: "02-17", end: "03-10", stages: [] },
  { id: "u016", subject: "理科", title: "春の生き物", start: "04-08", end: "04-30", stages: ["理科/季節と生き物/kisetsu01"] },
  { id: "u017", subject: "理科", title: "天気と1日の気温", start: "05-01", end: "05-22", stages: [] },
  { id: "u018", subject: "理科", title: "地面を流れる水のゆくえ", start: "05-11", end: "05-29", stages: ["理科/雨水/amamizu01"] },
  { id: "u019", subject: "理科", title: "電気のはたらき", start: "06-01", end: "06-30", stages: ["理科/電気/denki01"] },
  { id: "u020", subject: "理科", title: "夏の生き物・夏の夜空", start: "07-01", end: "07-17", stages: ["理科/星/hoshi01","理科/季節と生き物/kisetsu01"] },
  { id: "u021", subject: "理科", title: "月や星の動き", start: "09-01", end: "09-30", stages: ["理科/星/hoshi01","理科/星/kansatsu01"] },
  { id: "u022", subject: "理科", title: "とじこめた空気や水", start: "09-14", end: "10-02", stages: ["理科/空気と水/kuki_mizu01"] },
  { id: "u023", subject: "理科", title: "ヒトの体のつくりと運動", start: "10-01", end: "10-30", stages: ["理科/体/karada01"] },
  { id: "u024", subject: "理科", title: "秋の生き物", start: "11-02", end: "11-20", stages: ["理科/季節と生き物/kisetsu01"] },
  { id: "u025", subject: "理科", title: "ものの温度と体積", start: "11-09", end: "12-18", stages: [] },
  { id: "u026", subject: "理科", title: "冬の夜空・冬の生き物", start: "01-08", end: "01-29", stages: ["理科/季節と生き物/kisetsu01","理科/星/kansatsu01"] },
  { id: "u027", subject: "理科", title: "もののあたたまり方", start: "01-12", end: "02-05", stages: ["理科/あたたまり方/atatamari01"] },
  { id: "u028", subject: "理科", title: "水のすがた", start: "02-01", end: "02-26", stages: ["理科/水のすがた/sugata01"] },
  { id: "u029", subject: "理科", title: "水のゆくえ（蒸発・結露）", start: "03-01", end: "03-19", stages: ["理科/水のすがた/sugata02"] },
  { id: "u030", subject: "理科", title: "生き物の1年間", start: "03-01", end: "03-19", stages: ["理科/季節と生き物/kisetsu01"] },
  { id: "u031", subject: "理科", title: "実験の計画（通年）", start: "04-08", end: "03-19", allYear: true, stages: ["理科/実験計画/exp_design01"] },
  { id: "u032", subject: "社会", title: "わたしたちの県", start: "04-08", end: "05-08", stages: ["社会/愛知/aichi01","社会/都道府県/todofuken01","社会/都道府県/todofuken02","社会/都道府県/kenchou01","社会/地図/nairiku01","社会/地図/chizuyomi01"] },
  { id: "u033", subject: "社会", title: "水はどこから", start: "05-11", end: "06-12", stages: ["社会/水道/josuijo01"] },
  { id: "u034", subject: "社会", title: "ごみのしょりと利用", start: "06-15", end: "07-17", stages: ["社会/ごみ/gomi01"] },
  { id: "u035", subject: "社会", title: "自然災害からくらしを守る", start: "09-01", end: "09-30", stages: ["社会/防災/bousai01","社会/防災/saigai02"] },
  { id: "u036", subject: "社会", title: "きょう土の伝統・文化と先人たち", start: "10-01", end: "12-18", stages: ["社会/先人/senjin01","社会/愛知/aichi02"] },
  { id: "u037", subject: "社会", title: "特色ある地いきと人々のくらし", start: "01-08", end: "03-19", stages: ["社会/愛知/aichi02"] },
  { id: "u038", subject: "国語", title: "物語「白いぼうし」", start: "04-08", end: "04-30", stages: ["国語/読解/kosoado01"] },
  { id: "u039", subject: "国語", title: "説明文（結果と考察）", start: "05-01", end: "06-19", stages: ["国語/論理/inga01"] },
  { id: "u040", subject: "国語", title: "漢字辞典・都道府県の漢字", start: "06-15", end: "07-10", stages: ["国語/漢字/kanji01","国語/漢字/onyomi_kunyomi01","社会/都道府県/todofuken01"] },
  { id: "u041", subject: "国語", title: "物語「一つの花」（修飾語）", start: "10-01", end: "10-23", stages: ["国語/修飾語/shushoku01"] },
  { id: "u042", subject: "国語", title: "物語「ごんぎつね」（情景）", start: "10-19", end: "11-20", stages: ["国語/読解/dokkai6_01","国語/読解/monogatari01"] },
  { id: "u043", subject: "国語", title: "いろいろな意味を表す漢字", start: "11-09", end: "11-27", stages: ["国語/漢字/tsukaiwake01"] },
  { id: "u044", subject: "国語", title: "説明文の要約", start: "12-01", end: "12-18", stages: ["国語/論理/equal01"] },
  { id: "u045", subject: "国語", title: "熟語のでき方", start: "01-08", end: "01-29", stages: ["国語/漢字/jukugo01"] },
  { id: "u046", subject: "国語", title: "筆者の考えと自分の考え", start: "01-18", end: "02-05", stages: ["国語/論理/tairitsu01"] },
  { id: "u047", subject: "国語", title: "読点の打ち方・作文", start: "02-01", end: "02-26", stages: ["国語/言葉/setsuzoku01"] },
  { id: "u048", subject: "国語", title: "慣用句・ことば（通年）", start: "04-08", end: "03-19", allYear: true, stages: ["国語/慣用句/kanyoku01","国語/ローマ字/romaji301"] },
  { id: "u049", subject: "国語", title: "漢字（4年・漢検7級）", start: "04-08", end: "03-19", allYear: true, stages: ["漢検/7級/dai1kai","漢検/7級/dai2kai","国語/漢字/tsukaiwake01"] },
  { id: "u050", subject: "英語", title: "外国語活動（通年）", start: "04-08", end: "03-19", allYear: true, stages: ["英語/あいさつ/english401","英語/曜日と天気/english403","英語/時刻/english404","英語/文房具/english405","英語/学校の場所/english406","英語/一日の生活/english407","英語/メニュー/english402"] },
  { id: "u051", subject: "探究", title: "総合（テーマ探究）【環境】未来の地球を守ろう", start: "04-08", end: "03-19", allYear: true, stages: ["社会/ごみ/gomi01","社会/水道/josuijo01","探究/調べ方/shirabe01","探究/データ/data01"] },
  { id: "u052", subject: "探究", title: "総合（情報教育）プログラミング・情報モラル", start: "04-08", end: "03-19", allYear: true, stages: ["探究/プログラミング/prog01","探究/プログラミング/prog02","探究/情報/net_ethics01","探究/情報/net_ethics02"] },
  { id: "u053", subject: "探究", title: "総合（My探究）「夢☆チャレンジ」科", start: "04-08", end: "03-19", allYear: true, stages: ["探究/設計/engineering01","探究/調べ方/shirabe01","探究/分岐図解/bunki01","探究/分岐図解/bunki02"] },
];

export const SUBJECTS = ['算数', '国語', '理科', '社会', '探究', '英語'];

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
      // 通年の 単元は いつでも「学習中」なので、期間が はっきりした 単元の 後ろに 回す（距離 30 あつかい）
      if (u.allYear) return { ...u, distance: 30, phase: '通年', inWindow: true };
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
