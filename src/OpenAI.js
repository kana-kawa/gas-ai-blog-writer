/**
 * OpenAI の Responses API で記事を生成する。
 * 構造化出力（JSON スキーマ）で { title, body_html, meta_description } だけを返させる。
 */
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';

const ARTICLE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '記事タイトル' },
    body_html: { type: 'string', description: '<h2> と <p> だけで書いた記事本文の HTML' },
    meta_description: { type: 'string', description: '検索結果に表示する 100〜120 字の説明文' },
  },
  required: ['title', 'body_html', 'meta_description'],
  additionalProperties: false,
};

/**
 * @return {{title: string, bodyHtml: string, metaDescription: string}}
 */
function generateArticle_(config, keyword, subKeywords) {
  if (config.mode === MODE.MOCK) {
    return mockArticle_(keyword, subKeywords);
  }

  const payload = {
    model: config.openaiModel,
    instructions: buildInstructions_(),
    input: buildUserMessage_(keyword, subKeywords),
    max_output_tokens: 16000,
    text: {
      format: {
        type: 'json_schema',
        name: 'article',
        strict: true,
        schema: ARTICLE_SCHEMA,
      },
    },
  };
  if (config.openaiReasoningEffort) {
    payload.reasoning = { effort: config.openaiReasoningEffort };
  }

  const json = fetchWithRetry_(OPENAI_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + config.openaiApiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  }, 'OpenAI');

  if (json.status === 'incomplete') {
    const reason = json.incomplete_details && json.incomplete_details.reason;
    throw new Error('OpenAI の生成が途中で止まりました（' + (reason || '理由不明') + '）。');
  }

  const text = extractOutputText_(json);
  let article;
  try {
    article = JSON.parse(text);
  } catch (e) {
    throw new Error('OpenAI の返答を JSON として読めませんでした：' + text.slice(0, 200));
  }
  if (!article.title || !article.body_html || !article.meta_description) {
    throw new Error('OpenAI の返答にタイトル・本文・メタディスクリプションのどれかがありません。');
  }
  return {
    title: article.title,
    bodyHtml: article.body_html,
    metaDescription: article.meta_description,
  };
}

/** Responses API の返答から本文テキストを取り出す。拒否された場合はエラーにする。 */
function extractOutputText_(json) {
  const parts = [];
  (json.output || []).forEach(function (item) {
    if (item.type !== 'message') return;
    (item.content || []).forEach(function (c) {
      if (c.type === 'output_text') parts.push(c.text);
      if (c.type === 'refusal') throw new Error('OpenAI が生成を断りました：' + c.refusal);
    });
  });
  if (parts.length === 0) throw new Error('OpenAI の返答に本文がありませんでした。');
  return parts.join('');
}

/**
 * HTTP リクエストを送り、JSON を返す。WordPress.js からも使う。
 * allowRetry が true のときだけ、429 と 5xx で 1 回やり直す。
 * 投稿の作成のように、2 回送ると 2 件できてしまう処理では false にする。
 */
function fetchWithRetry_(url, options, serviceName, allowRetry) {
  const maxAttempts = allowRetry === false ? 1 : 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    const body = res.getContentText();
    if (code >= 200 && code < 300) return parseJson_(body, serviceName);

    const retryable = code === 429 || code >= 500;
    if (retryable && attempt < maxAttempts) {
      Utilities.sleep(5000);
      continue;
    }
    throw new Error(serviceName + ' のエラー（HTTP ' + code + '）：' + summarizeError_(body));
  }
}

/**
 * 成功の返事を JSON として読む。セキュリティ用プラグインの画面など、
 * JSON 以外（HTML など）が返ってきたときは、理由が分かる日本語のエラーにする。
 */
function parseJson_(body, serviceName) {
  try {
    return JSON.parse(body);
  } catch (e) {
    throw new Error(serviceName + ' の返事をデータ（JSON）として読み取れませんでした。返事の先頭：' +
      body.slice(0, 200));
  }
}

function summarizeError_(body) {
  try {
    const j = JSON.parse(body);
    return (j.error && (j.error.message || j.error)) || j.message || body.slice(0, 200);
  } catch (e) {
    return body.slice(0, 200);
  }
}

/** mock モード用の記事。API を呼ばずに流れだけを確認する。 */
function mockArticle_(keyword, subKeywords) {
  Utilities.sleep(1000); // 「生成中」の表示を確認できるよう少し待つ
  const subs = subKeywords || '（サブキーワードなし）';
  return {
    title: '【お試し】' + keyword + 'について押さえておきたい3つのポイント',
    bodyHtml: [
      '<p>これは mock モードで作ったお試しの本文です。キーワード「' + keyword + '」、サブキーワード「' + subs + '」を受け取りました。</p>',
      '<h2>ポイント1</h2><p>ここに本文が入ります。</p>',
      '<h2>ポイント2</h2><p>ここに本文が入ります。</p>',
      '<h2>ポイント3</h2><p>ここに本文が入ります。【要確認】</p>',
      '<h2>まとめ：お試し</h2><p>ここにまとめが入ります。</p>',
    ].join('\n'),
    metaDescription: '【お試し】' + keyword + 'のメタディスクリプションです。mock モードでは AI を呼ばずに、この固定の文を返します。',
  };
}
