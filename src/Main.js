/**
 * メニューから呼ばれる処理。
 * GAS の 1 回の実行は 6 分までなので、4 分半を過ぎたら残りの行を残して終える。
 */
const TIME_BUDGET_MS = 4.5 * 60 * 1000;

/** メニュー「選択した行の記事を生成」 */
function generateSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const rows = [];
  sheet.getActiveRangeList().getRanges().forEach(function (range) {
    for (let r = range.getRow(); r <= range.getLastRow(); r++) {
      if (r > HEADER_ROW && rows.indexOf(r) === -1) rows.push(r);
    }
  });
  if (rows.length === 0) {
    SpreadsheetApp.getUi().alert('記事を生成したい行（2 行目以降）を選択してから実行してください。');
    return;
  }
  run_(sheet, rows.sort(function (a, b) { return a - b; }));
}

/** メニュー「未生成の記事をまとめて生成」 */
function generatePendingRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  const rows = [];
  if (lastRow > HEADER_ROW) {
    const values = sheet.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, COL.STATUS).getValues();
    values.forEach(function (v, i) {
      const keyword = String(v[COL.KEYWORD - 1]).trim();
      const status = String(v[COL.STATUS - 1]).trim();
      if (keyword && TARGET_STATUSES.indexOf(status) !== -1) rows.push(HEADER_ROW + 1 + i);
    });
  }
  if (rows.length === 0) {
    SpreadsheetApp.getUi().alert('ステータスが「未生成」または「エラー」の行はありません。');
    return;
  }
  run_(sheet, rows);
}

function run_(sheet, rows) {
  const ui = SpreadsheetApp.getUi();
  const config = getConfig_();
  const problem = validateConfig_(config);
  if (problem) {
    ui.alert(problem);
    return;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    ui.alert('ほかの生成処理が実行中です。終わってからもう一度実行してください。');
    return;
  }

  const started = Date.now();
  const summary = { done: 0, failed: 0, skipped: 0, left: 0 };
  try {
    ensureStatusRule_(sheet);
    for (let i = 0; i < rows.length; i++) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        summary.left = rows.length - i;
        break;
      }
      const outcome = processRow_(sheet, rows[i], config);
      summary[outcome]++;
    }
  } finally {
    lock.releaseLock();
  }

  const lines = [
    'モード：' + config.mode,
    '完了：' + summary.done + ' 件',
    'エラー：' + summary.failed + ' 件（G 列に理由があります）',
  ];
  if (summary.skipped) lines.push('対象外：' + summary.skipped + ' 件（キーワードが空、または生成済み）');
  if (summary.left) lines.push('', '時間切れのため ' + summary.left + ' 件が残っています。もう一度実行してください。');
  ui.alert(lines.join('\n'));
}

/**
 * 1 行を処理する。
 * @return {'done'|'failed'|'skipped'}
 */
function processRow_(sheet, row, config) {
  const data = readRow_(sheet, row);
  if (!data.keyword || TARGET_STATUSES.indexOf(data.status) === -1) return 'skipped';

  setStatus_(sheet, row, STATUS.GENERATING);
  try {
    const article = generateArticle_(config, data.keyword, data.subKeywords);
    const counts = '本文 ' + countChars_(article.bodyHtml) + ' 字／メタ ' + article.metaDescription.length + ' 字';
    const result = {
      title: article.title,
      body: article.bodyHtml,
      metaDescription: article.metaDescription,
    };

    // どのモードでも送信ペイロードを作ってログに出す。WordPress に送るのは live モードだけ。
    const payload = buildWpPayload_(article);
    const sent = config.mode === MODE.LIVE;
    logWpPayload_(row, payload, sent);

    if (sent) {
      result.url = createDraft_(config, payload).editUrl;
      result.status = STATUS.DRAFTED;
      result.note = counts;
    } else {
      result.status = STATUS.GENERATED;
      result.note = config.mode + ' モード（WordPress には送信していません）／' + counts;
    }
    writeResult_(sheet, row, result);
    return 'done';
  } catch (e) {
    console.error('行 ' + row + ' の生成に失敗', e);
    writeError_(sheet, row, e.message);
    return 'failed';
  }
}

/** HTML タグを除いた文字数（空白・改行は数えない） */
function countChars_(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s/g, '').length;
}
