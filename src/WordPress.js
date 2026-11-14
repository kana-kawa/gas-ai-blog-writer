/**
 * WordPress の REST API に送る内容を組み立て、下書きを作る。
 * 認証はアプリケーションパスワード（ユーザー → プロフィール → アプリケーションパスワード で発行）。
 *
 * メタディスクリプションは excerpt（抜粋）として送る。
 * SEO プラグイン（Yoast など）の専用欄に入れる場合は、プラグインごとの項目名に合わせて追加する。
 */

/**
 * 送信ペイロードを作る。必ず下書き（status: 'draft'）にし、自動で公開はしない。
 * @return {{title: string, content: string, status: string, excerpt: string}}
 */
function buildWpPayload_(article) {
  return {
    title: article.title,
    content: article.bodyHtml,
    status: 'draft',
    excerpt: article.metaDescription,
  };
}

/**
 * 送信ペイロードを実行ログに出す（Apps Script エディタの「実行数」で確認できる）。
 * 認証情報はペイロードに含まれないので、ログにも出ない。
 */
function logWpPayload_(row, payload, sent) {
  // %s で数値を渡すと「2.0」と表示されるため、文字列をつなげて渡す
  Logger.log(
    '[WordPress 送信ペイロード] 行 ' + row + '（' + (sent ? 'WordPress に送信' : '送信していません') + '）\n' +
    JSON.stringify(payload, null, 2)
  );
}

/**
 * 下書きを作る。live モードのときだけ呼ばれる。
 * @return {{id: number, editUrl: string}}
 */
function createDraft_(config, payload) {
  const auth = Utilities.base64Encode(config.wpUser + ':' + config.wpAppPassword);
  const json = fetchWithRetry_(config.wpBaseUrl + '/wp-json/wp/v2/posts', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Basic ' + auth },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  }, 'WordPress', false); // 送り直すと下書きが 2 件できることがあるので、やり直さない

  if (!json.id) throw new Error('WordPress の返答に投稿 ID がありませんでした。');
  return {
    id: json.id,
    editUrl: config.wpBaseUrl + '/wp-admin/post.php?post=' + json.id + '&action=edit',
  };
}
