import { escapeHtml as esc, humanDate } from '../util.js';
import { renderMarkdown } from '../markdown.js';

const shell = ({ title, description, config, body, extraHead = '' }) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="/static/site.css">
${extraHead}
</head>
<body>
<header class="site-header">
  <a class="site-brand" href="/"><span class="mark">知</span>${esc(config.accountName)}</a>
  <nav class="site-nav"><a href="/">知识库</a><a href="/admin">后台</a></nav>
</header>
<main class="site-main">${body}</main>
<footer class="site-footer">
  <p>${esc(config.accountName)} · 每天用 3 分钟，讲清一个知识点</p>
  <p class="tiny">在微信里搜索并关注「${esc(config.accountName)}」，发送关键词即可检索</p>
</footer>
</body>
</html>`;

export function landingPage({ config, items, q, categories, category }) {
  const cards = items
    .map(
      (item) => `<a class="card" href="/article/${item.id}">
      <span class="chip">${esc(item.category)}</span>
      <h2>${esc(item.title)}</h2>
      <p>${esc(item.summary || '')}</p>
      <span class="meta">${esc(humanDate(item.updatedAt, config.timeZone))} · ${item.views} 次阅读</span>
    </a>`,
    )
    .join('');

  const chips = ['', ...categories]
    .map(
      (name) => `<a class="filter${name === category ? ' active' : ''}" href="/?${new URLSearchParams({
        ...(q ? { q } : {}),
        ...(name ? { category: name } : {}),
      }).toString()}">${esc(name || '全部')}</a>`,
    )
    .join('');

  const body = `
  <section class="hero">
    <p class="eyebrow">每日知识 · ${items.length} 篇在架</p>
    <h1>把复杂的道理，讲成 3 分钟能懂的话</h1>
    <p class="lede">关注公众号后，发送任意关键词即可检索；每天 ${esc(config.pushTime)} 还会自动推送一条精选知识。</p>
    <form class="search" method="get" action="/">
      <input type="search" name="q" value="${esc(q)}" placeholder="搜索：复利、睡眠、思维模型…">
      <button type="submit">搜索</button>
    </form>
  </section>

  <div class="filters">${chips}</div>

  ${
    q && items.length === 0
      ? `<p class="empty">没有找到与「${esc(q)}」相关的内容，换个关键词试试。</p>`
      : `<section class="cards">${cards || '<p class="empty">知识库还是空的，去后台添加第一条吧。</p>'}</section>`
  }`;

  return shell({
    title: `${config.accountName} · 知识库`,
    description: `${config.accountName} 的知识分享站点，每天一个知识点。`,
    config,
    body,
  });
}

export function articlePage({ config, item, html }) {
  // 摘要是正文开头时不再重复展示，避免正文第一段出现两遍
  const normalize = (text) => String(text || '').replace(/\s+/g, '');
  const showSummary = Boolean(item.summary) && !normalize(item.content).includes(normalize(item.summary));

  const body = `
  <article class="article">
    <a class="back" href="/">← 返回知识库</a>
    <div class="article-meta">
      <span class="chip">${esc(item.category)}</span>
      <span>${esc(humanDate(item.updatedAt, config.timeZone))}</span>
      <span>${item.views} 次阅读</span>
    </div>
    <h1>${esc(item.title)}</h1>
    ${showSummary ? `<p class="article-summary">${esc(item.summary)}</p>` : ''}
    <div class="article-body">${html}</div>
    ${
      item.tags.length
        ? `<div class="article-tags">${item.tags.map((tag) => `<span>#${esc(tag)}</span>`).join('')}</div>`
        : ''
    }
    <div class="article-cta">
      <p>关注公众号「${esc(config.accountName)}」，发送关键词随时检索。</p>
    </div>
  </article>`;

  return shell({
    title: `${item.title} · ${config.accountName}`,
    description: item.summary || item.title,
    config,
    body,
  });
}

export function notFoundPage({ config }) {
  return shell({
    title: '页面不存在',
    description: '404',
    config,
    body: `<div class="empty-page"><h1>404</h1><p>这条知识可能已经下架了。</p><a class="btn" href="/">回到知识库</a></div>`,
  });
}

export { renderMarkdown };
