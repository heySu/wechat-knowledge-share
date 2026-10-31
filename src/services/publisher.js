import fs from 'node:fs';
import path from 'node:path';
import { renderMarkdown } from '../markdown.js';
import { dateKeyInZone, escapeHtml, truncate } from '../util.js';
import { articleUrl, pickForPush, summaryOf } from './knowledge.js';

const CN_DATE = (dateKey) => {
  const [, month, day] = String(dateKey).split('-');
  return `${Number(month)} 月 ${Number(day)} 日`;
};

/** 把若干知识点组装成一篇「每日知识」图文 */
export function buildDailyArticle({ config, items, dateKey }) {
  const sections = items.map((item, index) => {
    const label = String(index + 1).padStart(2, '0');
    const body = renderMarkdown(item.content, { base: config.publicBaseUrl });
    return [
      '<section style="margin:0 0 26px;">',
      `<p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;color:#07c160;font-weight:700;">${label} / ${escapeHtml(item.category)}</p>`,
      `<h2 style="margin:0 0 10px;font-size:20px;line-height:1.5;color:#111;font-weight:700;">${escapeHtml(item.title)}</h2>`,
      body,
      `<p style="margin:0 0 8px;font-size:13px;color:#999;">`,
      `<a href="${escapeHtml(articleUrl(config, item.id))}" style="color:#07c160;text-decoration:none;">收藏这篇 →</a>`,
      `</p>`,
      '</section>',
    ].join('');
  });

  const content = [
    '<section style="padding:2px 0 8px;">',
    `<p style="margin:0 0 6px;font-size:13px;color:#8a8a8a;">${escapeHtml(config.accountName)} · 每日精选</p>`,
    `<p style="margin:0 0 22px;font-size:15px;line-height:1.8;color:#666;">今天挑了 ${items.length} 个知识点，每个都值得花 3 分钟。</p>`,
    '</section>',
    sections.join(
      '<hr style="border:none;border-top:1px dashed #e6e6e6;margin:28px 0;">',
    ),
    '<hr style="border:none;border-top:1px solid #eee;margin:28px 0 18px;">',
    '<p style="margin:0;font-size:13px;line-height:1.9;color:#9a9a9a;">',
    `喜欢今天的内容，点个「在看」；回复关键词可以随时检索知识库。<br>`,
    `—— ${escapeHtml(config.accountName)}`,
    '</p>',
  ].join('');

  return {
    title: truncate(`每日知识 ｜ ${CN_DATE(dateKey)}`, 60),
    author: config.accountName,
    digest: truncate(items.map((item) => item.title).join(' / '), 110),
    content,
    content_source_url: articleUrl(config, items[0].id),
    thumb_media_id: config.thumbMediaId || '',
    need_open_comment: 0,
    only_fans_can_comment: 0,
  };
}

/** 生成可独立打开的预览页，便于本地检查排版 */
export function buildPreviewPage(article) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(article.title)}</title>
<style>
body{margin:0;background:#f2f3f5;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}
.phone{max-width:420px;margin:0 auto;background:#fff;min-height:100vh;padding:22px 20px 40px;box-sizing:border-box;}
.meta{font-size:13px;color:#8a8a8a;margin-bottom:6px}
h1{font-size:22px;line-height:1.5;margin:0 0 6px}
</style></head><body><div class="phone">
<p class="meta">${escapeHtml(article.author)}</p>
<h1>${escapeHtml(article.title)}</h1>
${article.content}
</div></body></html>`;
}

function writeOutbox(dataDir, dateKey, html) {
  const dir = path.join(dataDir, 'outbox');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  const file = path.join(dir, `${dateKey}-${stamp}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

/**
 * 执行一次「每日推送」。
 * mock 模式：只生成本地预览文件并记录一条历史；
 * live 模式：调用草稿箱接口（可选再提交发布）。
 */
export async function pushDaily({ store, client, config, count, category = 'all', trigger = 'manual' }) {
  const dateKey = dateKeyInZone(new Date(), config.timeZone);
  const limit = Math.min(Math.max(Number(count) || config.pushCount, 1), 8);
  const items = pickForPush(store, limit, { category });

  if (items.length === 0) {
    return { ok: false, status: 'empty', error: '知识库里还没有已发布的内容', items: [] };
  }

  const article = buildDailyArticle({ config, items, dateKey });
  const previewFile = writeOutbox(config.dataDir, dateKey, buildPreviewPage(article));

  let status = 'mock';
  let mediaId = null;
  let error = null;

  if (!client.isMock) {
    try {
      const draft = await client.addDraft([article]);
      mediaId = draft.media_id;
      status = 'draft';
      if (config.autoPublish) {
        await client.submitPublish(mediaId);
        status = 'published';
      }
    } catch (err) {
      status = 'failed';
      error = err.message;
    }
  }

  const record = store.addPush({
    date: dateKey,
    title: article.title,
    status,
    mode: client.isMock ? 'mock' : 'live',
    trigger,
    articleIds: items.map((item) => item.id),
    mediaId,
    error,
    previewFile: path.relative(config.dataDir, previewFile),
  });

  if (status === 'failed') {
    // 失败也记下当天已尝试，避免定时器每 20 秒重试一次把接口打爆
    store.data.settings.lastPushDate = dateKey;
    store.save();
  } else {
    store.markPushed(items.map((item) => item.id), dateKey);
  }

  return { ok: status !== 'failed', status, error, article, items, record, previewFile };
}

/** 只生成预览，不落推送记录（后台预览按钮用） */
export function previewDaily({ store, config, count, category = 'all' }) {
  const dateKey = dateKeyInZone(new Date(), config.timeZone);
  const limit = Math.min(Math.max(Number(count) || config.pushCount, 1), 8);
  const items = pickForPush(store, limit, { category });
  const article = items.length ? buildDailyArticle({ config, items, dateKey }) : null;
  return { items, article, dateKey };
}

export { summaryOf };
