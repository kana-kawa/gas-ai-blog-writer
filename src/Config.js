/**
 * 設定はスクリプトプロパティに保存する（API キーをコードに書かないため）。
 * Apps Script エディタの「プロジェクトの設定 → スクリプト プロパティ」で登録する。
 */
const MODE = {
  // どのモードでも、本文とメタディスクリプションをシートに書き、WordPress の送信ペイロードをログに出す。
  MOCK: 'mock',       // AI も WordPress も呼ばない（動作確認用）
  AI_ONLY: 'ai_only', // AI だけ呼ぶ。WordPress には送らない（デモ・動作確認用）
  LIVE: 'live',       // AI で生成し、WordPress に下書き保存する
};

const DEFAULT_MODEL = 'gpt-6.1-sol';

/** モードごとに必要な設定 */
const REQUIRED_KEYS = {
  mock: [],
  ai_only: ['OPENAI_API_KEY'],
  live: ['OPENAI_API_KEY', 'WP_BASE_URL', 'WP_USER', 'WP_APP_PASSWORD'],
};

function getConfig_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const mode = (p.MODE || MODE.MOCK).trim();
  return {
    mode: mode,
    openaiApiKey: (p.OPENAI_API_KEY || '').trim(),
    openaiModel: (p.OPENAI_MODEL || DEFAULT_MODEL).trim(),
    openaiReasoningEffort: (p.OPENAI_REASONING_EFFORT || '').trim(),
    wpBaseUrl: (p.WP_BASE_URL || '').trim().replace(/\/+$/, ''),
    wpUser: (p.WP_USER || '').trim(),
    wpAppPassword: (p.WP_APP_PASSWORD || '').trim(),
    _raw: p,
  };
}

/**
 * 設定に足りないものがあれば、日本語のメッセージを返す。問題なければ null。
 */
function validateConfig_(config) {
  if (!REQUIRED_KEYS[config.mode]) {
    return 'MODE の値「' + config.mode + '」が正しくありません。mock / ai_only / live のどれかを設定してください。';
  }
  const missing = REQUIRED_KEYS[config.mode].filter(function (key) {
    return !(config._raw[key] || '').trim();
  });
  if (missing.length > 0) {
    return 'MODE=' + config.mode + ' で必要な設定が足りません：' + missing.join('、') +
      '\n「プロジェクトの設定 → スクリプト プロパティ」で登録してください。';
  }
  // パスワードは送信のたびに付くので、暗号化される https のサイトにだけ送る
  if (config.mode === MODE.LIVE && !/^https:\/\//i.test(config.wpBaseUrl)) {
    return 'WP_BASE_URL は https:// で始まる URL にしてください（今の値：' + config.wpBaseUrl + '）。' +
      '\nhttp:// のサイトに送ると、パスワードが暗号化されずに送られてしまいます。';
  }
  return null;
}

/** メニュー「現在の設定を確認」。キーの中身は表示しない。 */
function showConfigStatus() {
  const c = getConfig_();
  const mark = function (v) { return v ? '設定済み' : '未設定'; };
  const lines = [
    'MODE：' + c.mode,
    'OPENAI_MODEL：' + c.openaiModel,
    'OPENAI_API_KEY：' + mark(c.openaiApiKey),
    'WP_BASE_URL：' + (c.wpBaseUrl || '未設定'),
    'WP_USER：' + mark(c.wpUser),
    'WP_APP_PASSWORD：' + mark(c.wpAppPassword),
  ];
  const problem = validateConfig_(c);
  lines.push('', problem ? '⚠ ' + problem : 'このモードで実行できます。');
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}
