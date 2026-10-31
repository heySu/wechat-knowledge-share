import { escapeHtml as esc, humanDate } from '../util.js';

const NAV = [
  { key: 'dashboard', href: '/admin', label: '概览' },
  { key: 'knowledge', href: '/admin/knowledge', label: '知识库' },
  { key: 'push', href: '/admin/push', label: '每日推送' },
  { key: 'simulator', href: '/admin/simulator', label: '回复调试' },
  { key: 'messages', href: '/admin/messages', label: '消息与数据' },
  { key: 'settings', href: '/admin/settings', label: '设置' },
];

export function layout({ title, subtitle = '', active = '', actions = '', body = '', config, flash = '' }) {
  const nav = NAV.map(
    (item) =>
      `<a class="nav-item${item.key === active ? ' active' : ''}" href="${item.href}">${item.label}</a>`,
  ).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(config.accountName)}</title>
<link rel="stylesheet" href="/static/admin.css">
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <a class="brand" href="/admin">
      <span class="brand-mark">知</span>
      <span class="brand-text"><strong>${esc(config.accountName)}</strong><small>知识订阅号后台</small></span>
    </a>
    <nav class="nav">${nav}</nav>
    <div class="side-status">
      <span class="status-dot ${config.mode === 'live' ? 'live' : ''}"></span>
      ${config.mode === 'live' ? '已连接公众号' : '模拟模式 · 未接入微信'}
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <div class="topbar-title">
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      </div>
      <div class="topbar-actions">${actions}</div>
    </header>
    ${flash}
    <div class="content">${body}</div>
  </main>
</div>
<script src="/static/admin.js" defer></script>
</body>
</html>`;
}

export function flash(message, type = 'ok') {
  if (!message) return '';
  return `<div class="flash flash-${type === 'error' ? 'error' : 'ok'}" data-flash>${esc(message)}</div>`;
}

function stat(label, value, hint = '') {
  return `<div class="stat">
    <span class="stat-label">${esc(label)}</span>
    <strong class="stat-value">${esc(value)}</strong>
    ${hint ? `<span class="stat-hint">${esc(hint)}</span>` : ''}
  </div>`;
}

export function statusBadge(status) {
  if (status === 'published') return '<span class="badge badge-green">已发布</span>';
  if (status === 'draft') return '<span class="badge">草稿</span>';
  return `<span class="badge">${esc(status)}</span>`;
}

export function pushBadge(status) {
  const map = {
    mock: ['badge-blue', '模拟推送'],
    draft: ['badge-green', '已进草稿箱'],
    published: ['badge-green', '已发布'],
    failed: ['badge-red', '失败'],
    empty: ['badge', '无内容'],
  };
  const [cls, text] = map[status] || ['badge', status];
  return `<span class="badge ${cls}">${esc(text)}</span>`;
}

// ── 概览 ────────────────────────────────────────────────
export function dashboardPage({ config, stats, messages, pushes, schedule, accountCount }) {
  const body = `
  <section class="stats-grid">
    ${stat('知识条目', stats.total, `已发布 ${stats.published} · 草稿 ${stats.drafts}`)}
    ${stat('关注用户', stats.subscribers, '收到过消息的微信号')}
    ${stat('累计阅读', stats.views, '知识详情页浏览量')}
    ${stat('推送次数', stats.pushes, '含模拟推送')}
  </section>

  <section class="grid-2">
    <div class="card">
      <div class="card-head">
        <h2>每日推送</h2>
        <span class="badge ${config.mode === 'live' ? 'badge-green' : 'badge-blue'}">${config.mode === 'live' ? '真实接口' : '模拟模式'}</span>
      </div>
      <div class="kv">
        <div><span>下次推送</span><strong>${esc(schedule)}</strong></div>
        <div><span>上次推送</span><strong>${esc(humanDate(stats.lastPush, config.timeZone))}</strong></div>
        <div><span>每次条数</span><strong>${config.pushCount} 条</strong></div>
      </div>
      <div class="card-actions">
        <form method="post" action="/admin/api/push" class="inline">
          <input type="hidden" name="count" value="${config.pushCount}">
          <button class="btn btn-primary" type="submit">立即推送一次</button>
        </form>
        <a class="btn" href="/admin/push">预览与设置</a>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>知识库状态</h2></div>
      <div class="kv">
        <div><span>分类</span><strong>${accountCount.categories} 个</strong></div>
        <div><span>关键词命中</span><strong>${accountCount.hits} 次</strong></div>
        <div><span>最近一次消息</span><strong>${esc(accountCount.lastMessage)}</strong></div>
      </div>
      <div class="card-actions">
        <a class="btn btn-primary" href="/admin/knowledge/new">新增知识</a>
        <a class="btn" href="/admin/simulator">试试回复效果</a>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>最近推送</h2><a class="link" href="/admin/push">全部</a></div>
    ${
      pushes.length === 0
        ? '<p class="empty">还没有推送记录，点上面的「立即推送一次」生成一篇图文。</p>'
        : `<table class="table">
      <thead><tr><th>标题</th><th>状态</th><th>时间</th></tr></thead>
      <tbody>${pushes
        .map(
          (push) => `<tr>
            <td>${esc(push.title)}</td>
            <td>${pushBadge(push.status)}</td>
            <td class="muted">${esc(humanDate(push.at, config.timeZone))}</td>
          </tr>`,
        )
        .join('')}</tbody></table>`
    }
  </section>

  <section class="card">
    <div class="card-head"><h2>最近消息</h2><a class="link" href="/admin/messages">全部</a></div>
    ${
      messages.length === 0
        ? '<p class="empty">还没有粉丝消息。可以到「回复调试」里模拟一条。</p>'
        : `<table class="table">
      <thead><tr><th>用户</th><th>内容</th><th>回复</th><th>时间</th></tr></thead>
      <tbody>${messages
        .map(
          (msg) => `<tr>
            <td class="mono">${esc(msg.openid)}</td>
            <td>${esc(msg.content)}</td>
            <td class="muted clamp">${esc(msg.reply || '—')}</td>
            <td class="muted nowrap">${esc(humanDate(msg.at, config.timeZone))}</td>
          </tr>`,
        )
        .join('')}</tbody></table>`
    }
  </section>`;

  return layout({
    title: '概览',
    subtitle: '知识库、自动回复与每日推送的整体情况',
    active: 'dashboard',
    body,
    config,
    actions: '<a class="btn" href="/" target="_blank">访问前台站点</a>',
  });
}

// ── 知识库列表 ──────────────────────────────────────────
export function knowledgeListPage({ config, items, q, category, status, categories, notice = '' }) {
  const rows = items
    .map(
      (item) => `<tr>
        <td class="mono muted">#${item.id}</td>
        <td>
          <a class="title-link" href="/admin/knowledge/${item.id}">${esc(item.title)}</a>
          <div class="muted clamp">${esc(item.summary || item.content.slice(0, 60))}</div>
        </td>
        <td><span class="tag">${esc(item.category)}</span></td>
        <td>${statusBadge(item.status)}</td>
        <td class="num">${item.views}</td>
        <td class="num">${item.pushCount}</td>
        <td class="muted nowrap">${esc(humanDate(item.updatedAt, config.timeZone))}</td>
        <td class="row-actions">
          <a class="btn btn-sm" href="/admin/knowledge/${item.id}">编辑</a>
          <form method="post" action="/admin/knowledge/${item.id}/delete" class="inline" data-confirm="确定删除《${esc(item.title)}》？">
            <button class="btn btn-sm btn-danger" type="submit">删除</button>
          </form>
        </td>
      </tr>`,
    )
    .join('');

  const categoryOptions = ['', ...categories]
    .map(
      (name) =>
        `<option value="${esc(name)}"${name === category ? ' selected' : ''}>${esc(name || '全部分类')}</option>`,
    )
    .join('');

  const body = `
  ${notice ? flash(notice) : ''}
  <section class="card">
    <form class="toolbar" method="get" action="/admin/knowledge">
      <input class="input" type="search" name="q" value="${esc(q)}" placeholder="搜索标题、标签、正文…">
      <select class="input select" name="category">${categoryOptions}</select>
      <select class="input select" name="status">
        <option value="">全部状态</option>
        <option value="published"${status === 'published' ? ' selected' : ''}>已发布</option>
        <option value="draft"${status === 'draft' ? ' selected' : ''}>草稿</option>
      </select>
      <button class="btn" type="submit">筛选</button>
      <span class="spacer"></span>
      <a class="btn btn-primary" href="/admin/knowledge/new">+ 新增知识</a>
    </form>

    ${
      items.length === 0
        ? '<p class="empty">没有匹配的知识条目。</p>'
        : `<table class="table table-hover">
      <thead><tr><th>ID</th><th>标题</th><th>分类</th><th>状态</th><th class="num">阅读</th><th class="num">推送</th><th>更新</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    }
  </section>`;

  return layout({
    title: '知识库',
    subtitle: `共 ${items.length} 条${q ? `（关键词：${q}）` : ''}`,
    active: 'knowledge',
    body,
    config,
  });
}

// ── 知识编辑 ────────────────────────────────────────────
export function knowledgeFormPage({ config, item, categories, error = '' }) {
  const isNew = !item.id;
  const body = `
  ${flash(error, 'error')}
  <form method="post" action="/admin/knowledge/save" class="editor-grid" id="knowledge-form">
    <input type="hidden" name="id" value="${item.id || ''}">
    <section class="card editor-main">
      <div class="field">
        <label for="title">标题</label>
        <input class="input input-lg" id="title" name="title" value="${esc(item.title)}" placeholder="例如：锚定效应：为什么第一眼的价格决定了你的判断" required>
      </div>
      <div class="field">
        <label for="summary">摘要 <span class="muted">（出现在聊天回复和图文导读里，建议 60 字以内）</span></label>
        <textarea class="input" id="summary" name="summary" rows="2" placeholder="一句话说清这条知识的核心">${esc(item.summary)}</textarea>
      </div>
      <div class="field">
        <div class="field-head">
          <label for="content">正文（Markdown）</label>
          <button class="btn btn-sm" type="button" data-md-preview="#content" data-md-target="#md-preview">刷新预览</button>
        </div>
        <textarea class="input code-input" id="content" name="content" rows="18" placeholder="## 小标题&#10;&#10;正文段落…&#10;&#10;- 要点一&#10;- 要点二">${esc(item.content)}</textarea>
        <p class="hint">支持标题、列表、引用、代码块、加粗、链接、图片。推送时会自动转换成微信图文样式。</p>
      </div>
      <div class="field">
        <label>预览</label>
        <div class="md-preview" id="md-preview"><p class="muted">点击右上角「刷新预览」查看渲染效果。</p></div>
      </div>
    </section>

    <aside class="editor-side">
      <section class="card">
        <div class="field">
          <label for="category">分类</label>
          <input class="input" id="category" name="category" list="category-list" value="${esc(item.category)}" placeholder="认知偏误">
          <datalist id="category-list">${categories.map((name) => `<option value="${esc(name)}"></option>`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="tags">标签 <span class="muted">（逗号分隔）</span></label>
          <input class="input" id="tags" name="tags" value="${esc(item.tags.join(', '))}" placeholder="决策, 消费">
        </div>
        <div class="field">
          <label for="cover">封面图地址 <span class="muted">（可选）</span></label>
          <input class="input" id="cover" name="cover" value="${esc(item.cover)}" placeholder="https://…/cover.jpg">
        </div>
        <div class="field">
          <label for="status">状态</label>
          <select class="input select" id="status" name="status">
            <option value="published"${item.status !== 'draft' ? ' selected' : ''}>已发布（可被检索/推送）</option>
            <option value="draft"${item.status === 'draft' ? ' selected' : ''}>草稿（不对外）</option>
          </select>
        </div>
        <div class="card-actions stacked">
          <button class="btn btn-primary btn-block" type="submit">${isNew ? '创建知识' : '保存修改'}</button>
          <a class="btn btn-block" href="/admin/knowledge">返回列表</a>
        </div>
      </section>

      ${
        isNew
          ? ''
          : `<section class="card meta-card">
        <h3>数据</h3>
        <div class="kv small">
          <div><span>阅读</span><strong>${item.views}</strong></div>
          <div><span>推送</span><strong>${item.pushCount} 次</strong></div>
          <div><span>创建</span><strong>${esc(humanDate(item.createdAt, config.timeZone))}</strong></div>
          <div><span>更新</span><strong>${esc(humanDate(item.updatedAt, config.timeZone))}</strong></div>
        </div>
        <a class="link" href="/article/${item.id}" target="_blank">查看前台页面 →</a>
      </section>`
      }
    </aside>
  </form>`;

  return layout({
    title: isNew ? '新增知识' : '编辑知识',
    subtitle: isNew ? '添加一条可以被检索、被推送的知识' : `#${item.id} · ${item.title}`,
    active: 'knowledge',
    body,
    config,
  });
}

// ── 每日推送 ────────────────────────────────────────────
export function pushPage({ config, preview, history, categories, category, count, schedule, notice = '' }) {
  const previewFrame = preview.article
    ? `<iframe class="preview-frame" title="图文预览" srcdoc="${esc(articlePreviewHtml(preview.article))}"></iframe>`
    : '<p class="empty">还没有可推送的内容，先去知识库添加并发布几条。</p>';

  const categoryOptions = ['all', ...categories]
    .map(
      (name) =>
        `<option value="${esc(name)}"${name === category ? ' selected' : ''}>${name === 'all' ? '全部分类' : esc(name)}</option>`,
    )
    .join('');

  const body = `
  ${notice ? flash(notice) : ''}
  <section class="card">
    <div class="card-head">
      <h2>推送设置</h2>
      <span class="muted">每天 ${config.pushTime} 自动推送 · 下次 ${esc(schedule)}</span>
    </div>
    <form class="toolbar" method="get" action="/admin/push">
      <label class="inline-label">条数
        <select class="input select" name="count">
          ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === Number(count) ? ' selected' : ''}>${n} 条</option>`).join('')}
        </select>
      </label>
      <label class="inline-label">分类
        <select class="input select" name="category">${categoryOptions}</select>
      </label>
      <button class="btn" type="submit">重新生成预览</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="submit" formaction="/admin/api/push" formmethod="post" name="go" value="1">
        立即推送
      </button>
    </form>
    <p class="hint">${
      config.mode === 'live'
        ? '真实模式：会调用草稿箱接口把图文存进公众号草稿箱，需先在素材库上传封面并填写 media_id。'
        : '模拟模式：不会请求微信服务器，只在后台生成预览文件（data/outbox），可以放心点。'
    }</p>
  </section>

  <section class="card">
    <div class="card-head"><h2>图文预览</h2><span class="muted">${esc(preview.article?.title || '')}</span></div>
    ${previewFrame}
  </section>

  <section class="card">
    <div class="card-head"><h2>推送历史</h2></div>
    ${
      history.length === 0
        ? '<p class="empty">暂无记录。</p>'
        : `<table class="table">
      <thead><tr><th>标题</th><th>状态</th><th>条数</th><th>触发</th><th>时间</th></tr></thead>
      <tbody>${history
        .map(
          (push) => `<tr>
            <td>${esc(push.title)}${push.error ? `<div class="muted">${esc(push.error)}</div>` : ''}</td>
            <td>${pushBadge(push.status)}</td>
            <td class="num">${(push.articleIds || []).length}</td>
            <td class="muted">${push.trigger === 'schedule' ? '定时' : '手动'}</td>
            <td class="muted nowrap">${esc(humanDate(push.at, config.timeZone))}</td>
          </tr>`,
        )
        .join('')}</tbody></table>`
    }
  </section>`;

  return layout({
    title: '每日推送',
    subtitle: '把知识库里的内容组装成一篇图文，定时或手动推送',
    active: 'push',
    body,
    config,
  });
}

function articlePreviewHtml(article) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
body{margin:0;padding:20px 18px 40px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#fff;color:#333}
.meta{font-size:13px;color:#8a8a8a;margin:0 0 4px}
h1{font-size:20px;line-height:1.5;margin:0 0 18px}
</style></head><body>
<p class="meta">${esc(article.author)}</p><h1>${esc(article.title)}</h1>
${article.content}
</body></html>`;
}

// ── 回复调试 ────────────────────────────────────────────
export function simulatorPage({ config, content = '', reply = '', tips = [] }) {
  const body = `
  <section class="card">
    <div class="card-head"><h2>模拟粉丝发消息</h2><span class="muted">走完整的消息处理链路，不写入消息记录</span></div>
    <form method="post" action="/admin/simulator" class="simulator-form">
      <input class="input input-lg" name="content" value="${esc(content)}" placeholder="试试：随机 / 今日 / 复利 / 帮助 / 2" autofocus>
      <button class="btn btn-primary" type="submit">发送</button>
    </form>
    <div class="chips">
      ${['随机', '今日', '帮助', '复利', '睡眠', '搜索 思维']
        .map((text) => `<form method="post" action="/admin/simulator" class="inline"><input type="hidden" name="content" value="${text}"><button class="chip" type="submit">${text}</button></form>`)
        .join('')}
    </div>
  </section>

  ${
    content
      ? `<section class="chat">
      <div class="bubble from-user">${esc(content)}</div>
      <div class="bubble from-account">${esc(reply).replace(/\n/g, '<br>')}</div>
    </section>`
      : ''
  }

  <section class="card">
    <div class="card-head"><h2>指令说明</h2></div>
    <div class="kv small">
      ${tips.map((tip) => `<div><span class="mono">${esc(tip.cmd)}</span><strong>${esc(tip.desc)}</strong></div>`).join('')}
    </div>
  </section>`;

  return layout({
    title: '回复调试',
    subtitle: '没有公众号也能先看粉丝会收到什么',
    active: 'simulator',
    body,
    config,
  });
}

// ── 消息与数据 ──────────────────────────────────────────
export function messagesPage({ config, messages, keywords }) {
  const max = keywords[0]?.count || 1;
  const bars = keywords
    .map(
      (entry) => `<div class="bar-row">
        <span class="bar-label">${esc(entry.keyword)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max((entry.count / max) * 100, 6)}%"></span></span>
        <span class="bar-value">${entry.count}</span>
      </div>`,
    )
    .join('');

  const body = `
  <section class="card">
    <div class="card-head"><h2>热门关键词</h2><span class="muted">粉丝最近在搜什么</span></div>
    ${keywords.length ? bars : '<p class="empty">还没有命中记录。粉丝发来关键词后，这里会显示热度排行。</p>'}
  </section>

  <section class="card">
    <div class="card-head"><h2>消息流水</h2><span class="muted">最多保留最近 300 条</span></div>
    ${
      messages.length === 0
        ? '<p class="empty">还没有收到消息。粉丝给公众号发消息后，会出现在这里（「回复调试」里的模拟不会计入）。</p>'
        : `<table class="table">
      <thead><tr><th>用户</th><th>类型</th><th>内容</th><th>命中</th><th>回复</th><th>时间</th></tr></thead>
      <tbody>${messages
        .map(
          (msg) => `<tr>
            <td class="mono">${esc(msg.openid)}</td>
            <td class="muted">${esc(msg.type)}</td>
            <td>${esc(msg.content)}</td>
            <td class="muted">${(msg.matchedIds || []).map((id) => `#${id}`).join(' ') || '—'}</td>
            <td class="muted clamp">${esc(msg.reply || '—')}</td>
            <td class="muted nowrap">${esc(humanDate(msg.at, config.timeZone))}</td>
          </tr>`,
        )
        .join('')}</tbody></table>`
    }
  </section>`;

  return layout({
    title: '消息与数据',
    subtitle: '粉丝消息流水与关键词热度',
    active: 'messages',
    body,
    config,
  });
}

// ── 设置 ────────────────────────────────────────────────
export function settingsPage({ config, saved = false, message = '', error = '', calls = [] }) {
  const modeRadio = (value, label, hint) => `
    <label class="radio-card${config.mode === value ? ' checked' : ''}">
      <input type="radio" name="mode" value="${value}"${config.mode === value ? ' checked' : ''}>
      <span><strong>${label}</strong><small>${hint}</small></span>
    </label>`;

  const body = `
  ${saved ? flash(message || '设置已保存') : ''}
  ${error ? flash(error, 'error') : ''}

  <form method="post" action="/admin/settings" class="settings-form">
    <section class="card">
      <div class="card-head"><h2>运行模式</h2></div>
      <div class="radio-group">
        ${modeRadio('mock', '模拟模式', '不请求微信服务器，适合本地先把内容和交互打磨好')}
        ${modeRadio('live', '真实模式', '调用公众号接口：草稿箱、发布、菜单、群发')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>公众号凭证</h2><span class="muted">在「公众平台 → 设置与开发 → 基本配置」获取</span></div>
      <div class="form-grid">
        <div class="field">
          <label for="appId">AppID</label>
          <input class="input" id="appId" name="appId" value="${esc(config.appId)}" placeholder="wx1234567890abcdef">
        </div>
        <div class="field">
          <label for="appSecret">AppSecret</label>
          <input class="input" id="appSecret" name="appSecret" type="password" value="${esc(config.appSecret)}" placeholder="只在服务器本地保存">
        </div>
        <div class="field">
          <label for="token">服务器 Token</label>
          <input class="input" id="token" name="token" value="${esc(config.token)}" placeholder="必须与公众平台填写的一致">
        </div>
        <div class="field">
          <label for="publicBaseUrl">站点公网地址</label>
          <input class="input" id="publicBaseUrl" name="publicBaseUrl" value="${esc(config.publicBaseUrl)}" placeholder="https://kb.example.com">
        </div>
      </div>
      <p class="hint">服务器配置（URL）填：<code>${esc(config.publicBaseUrl)}/wechat</code>，Token 与上面一致，消息加解密选「明文模式」。</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>内容与推送</h2></div>
      <div class="form-grid">
        <div class="field">
          <label for="accountName">账号名称</label>
          <input class="input" id="accountName" name="accountName" value="${esc(config.accountName)}">
        </div>
        <div class="field">
          <label for="pushTime">每日推送时间</label>
          <input class="input" id="pushTime" name="pushTime" type="time" value="${esc(config.pushTime)}">
        </div>
        <div class="field">
          <label for="pushCount">每次推送条数</label>
          <input class="input" id="pushCount" name="pushCount" type="number" min="1" max="8" value="${config.pushCount}">
        </div>
        <div class="field">
          <label for="thumbMediaId">封面素材 media_id</label>
          <input class="input" id="thumbMediaId" name="thumbMediaId" value="${esc(config.thumbMediaId)}" placeholder="真实模式必填">
        </div>
      </div>
      <label class="check"><input type="checkbox" name="autoPublish" value="true"${config.autoPublish ? ' checked' : ''}> 创建草稿后立即提交发布（仅认证号可用）</label>
    </section>

    <div class="sticky-actions">
      <button class="btn btn-primary" type="submit">保存设置</button>
      <button class="btn" type="button" data-test-wechat>测试连接</button>
      <span class="muted" id="test-result"></span>
    </div>
  </form>

  <section class="card">
    <div class="card-head"><h2>接入步骤</h2></div>
    <ol class="steps">
      <li>准备一台能被公网访问的服务器（或先用内网穿透），把本项目跑起来。</li>
      <li>公众平台 → 设置与开发 → 基本配置：获取 AppID / AppSecret，把服务器 IP 加入 <strong>IP 白名单</strong>。</li>
      <li>设置与开发 → 基本配置 → 服务器配置：URL 填 <code>${esc(config.publicBaseUrl)}/wechat</code>，Token 与上面一致，随机生成 EncodingAESKey，消息加解密方式选「明文模式」。</li>
      <li>提交并启用，微信会请求一次 <code>GET /wechat</code> 校验签名，通过即接入成功。</li>
      <li>在「素材库」上传一张封面图，拿到 <code>media_id</code> 填到上面；再把模式切到「真实模式」。</li>
      <li>「每日推送」里点一次推送，去公众号后台「草稿箱」确认排版，再手动发表（订阅号每天 1 次群发机会）。</li>
    </ol>
  </section>

  <section class="card">
    <div class="card-head"><h2>最近接口调用</h2><span class="muted">仅保留最近 10 条</span></div>
    ${
      calls.length === 0
        ? '<p class="empty">还没有调用记录。</p>'
        : `<table class="table">
      <thead><tr><th>接口</th><th>时间</th></tr></thead>
      <tbody>${calls
        .map(
          (call) => `<tr><td class="mono">${esc(call.api)}</td><td class="muted">${esc(humanDate(call.at, config.timeZone))}</td></tr>`,
        )
        .join('')}</tbody></table>`
    }
  </section>`;

  return layout({
    title: '设置',
    subtitle: '公众号凭证、推送策略与接入指引',
    active: 'settings',
    body,
    config,
    actions: `<a class="btn" href="/admin/logout">退出登录</a>`,
  });
}

// ── 登录 ────────────────────────────────────────────────
export function loginPage({ config, error = '' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>登录 · ${esc(config.accountName)}</title>
<link rel="stylesheet" href="/static/admin.css">
</head>
<body class="login-body">
  <form class="login-card" method="post" action="/admin/login">
    <span class="brand-mark lg">知</span>
    <h1>${esc(config.accountName)}</h1>
    <p class="muted">知识订阅号管理后台</p>
    ${error ? `<div class="flash flash-error">${esc(error)}</div>` : ''}
    <div class="field">
      <label for="password">访问密码</label>
      <input class="input input-lg" id="password" name="password" type="password" autofocus required>
    </div>
    <button class="btn btn-primary btn-block" type="submit">进入后台</button>
    <p class="hint">密码在 .env 的 ADMIN_PASSWORD 中配置</p>
  </form>
</body>
</html>`;
}
