/**
 * シートの列定義とステータスの読み書き。
 * 列番号は 1 始まり（SpreadsheetApp の getRange に合わせる）。
 */
const COL = {
  KEYWORD: 1,      // A キーワード
  SUB_KEYWORD: 2,  // B サブキーワード
  STATUS: 3,       // C ステータス
  TITLE: 4,        // D タイトル
  WP_URL: 5,       // E WordPress URL
  GENERATED_AT: 6, // F 生成日時
  NOTE: 7,         // G メモ・エラー内容
  BODY: 8,         // H 本文（HTML）
  META: 9,         // I メタディスクリプション
};

const HEADERS = [
  'キーワード', 'サブキーワード', 'ステータス', 'タイトル',
  'WordPress URL', '生成日時', 'メモ・エラー内容', '本文（HTML）', 'メタディスクリプション',
];

const STATUS = {
  PENDING: '未生成',
  GENERATING: '生成中',
  GENERATED: '生成済み',   // シートに書き出した（WordPress には送っていない）
  DRAFTED: '下書き保存',   // live モードで WordPress に下書き保存した
  ERROR: 'エラー',
  PUBLISHED: '公開済み',
};

/** 生成の対象にするステータス（空欄も未生成として扱う） */
const TARGET_STATUSES = ['', STATUS.PENDING, STATUS.ERROR];

const HEADER_ROW = 1;

/**
 * 見出しとステータスのプルダウンを整える。何度実行しても結果は同じ。
 */
function setupSheet() {
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.getRange(HEADER_ROW, 1, 1, HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight('bold');
  sheet.setFrozenRows(HEADER_ROW);

  const lastRow = Math.max(sheet.getMaxRows(), HEADER_ROW + 1);
  statusRange_(sheet).setDataValidation(buildStatusRule_());

  // 本文とメタディスクリプションは折り返さず 1 行で表示する（行が縦に伸びないように）。
  // 全文はセルを選ぶと数式バーで見られる。
  sheet.getRange(HEADER_ROW + 1, COL.BODY, lastRow - HEADER_ROW, 2)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sheet.setColumnWidth(COL.BODY, 300);
  sheet.setColumnWidth(COL.META, 300);
  SpreadsheetApp.getUi().alert('シートの初期設定が終わりました。');
}

/** C 列（ステータス）の 2 行目から最後の行まで */
function statusRange_(sheet) {
  const lastRow = Math.max(sheet.getMaxRows(), HEADER_ROW + 1);
  return sheet.getRange(HEADER_ROW + 1, COL.STATUS, lastRow - HEADER_ROW, 1);
}

/** ステータスのプルダウン（一覧にない値は入力できない） */
function buildStatusRule_() {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(STATUS), true)
    .setAllowInvalid(false)
    .build();
}

/**
 * ステータスのプルダウンに足りない値があれば、作り直す。
 * コードを更新して新しいステータスが増えたのに「シートを初期設定」をやり直していないと、
 * ステータスを書き込むときにエラーになるため、生成の前に毎回確かめる。
 * プルダウンが設定されていない場合は何もしない（どんな値でも書き込めるため）。
 */
function ensureStatusRule_(sheet) {
  const range = statusRange_(sheet);
  const rule = range.getDataValidation(); // 範囲の左上（2 行目）のルール
  if (!rule) return;
  if (rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return;
  const allowed = rule.getCriteriaValues()[0] || [];
  const missing = Object.values(STATUS).filter(function (s) { return allowed.indexOf(s) === -1; });
  if (missing.length > 0) range.setDataValidation(buildStatusRule_());
}

/** 1 行分のデータを読む */
function readRow_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  return {
    row: row,
    keyword: String(values[COL.KEYWORD - 1]).trim(),
    subKeywords: String(values[COL.SUB_KEYWORD - 1]).trim(),
    status: String(values[COL.STATUS - 1]).trim(),
  };
}

function setStatus_(sheet, row, status) {
  sheet.getRange(row, COL.STATUS).setValue(status);
  SpreadsheetApp.flush(); // 「生成中」をすぐ画面に出す
}

/** 生成結果を書き込む。result = { title, url, note, body, metaDescription, status } */
function writeResult_(sheet, row, result) {
  sheet.getRange(row, COL.TITLE, 1, COL.META - COL.TITLE + 1).setValues([[
    result.title || '',
    result.url || '',
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
    result.note || '',
    result.body || '',
    result.metaDescription || '',
  ]]);
  setStatus_(sheet, row, result.status);
}

function writeError_(sheet, row, message) {
  sheet.getRange(row, COL.GENERATED_AT, 1, 2).setValues([[
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
    message,
  ]]);
  setStatus_(sheet, row, STATUS.ERROR);
}
