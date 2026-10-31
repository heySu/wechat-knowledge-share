import { applyOverrides, sanitizeSettings } from '../config.js';
import { renderMarkdown } from '../markdown.js';
import { pushDaily, previewDaily } from '../services/publisher.js';
import { describeSchedule } from '../services/scheduler.js';
import { hmac, safeEqual } from '../util.js';
import { buildDefaultMenu } from '../wechat/client.js';
import { simulateMessage } from '../wechat/handler.js';
import { flash, knowledgeFormPage, knowledgeListPage, loginPage, messagesPage, pushPage, settingsPage, simulatorPage, dashboardPage } from './ui.js';

const COOKIE_NAME = 'wk_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;
const TIPS = [
  { cmd: '随机', desc: '随机返回一条知识' },
  { cmd: '今日', desc: '返回今天推送的那几条' },
  { cmd: '关键词', desc: '检索标题/标签/摘要/正文' },
  { cmd: '1-9', desc: '查看上一次搜索结果的第 N 条' },
  { cmd: '帮助', desc: '显示指令菜单' },
];

/** 登录失败计数（进程内），防止后台密码被暴力破解 */
const loginFails = new Map();

function tooManyFailures(ip) {
  const record = loginFails.get(ip);
  if (!record) return false;
  if (Date.now() > record.resetAt) {
    loginFails.delete(ip);
    return false;
  }
  return record.count >= LOGIN_MAX_FAILS;
}

function noteFailure(ip) {
  const now = Date.now();
  const record = loginFails.get(ip);
  if (!record || now > record.resetAt) {
    loginFails.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  record.count += 1;
}

function issueToken(config) {
  const expires = Date.now() + SESSION_MS;
  return `${expires}.${hmac(String(expires), config.sessionSecret)}`;
}

function readToken(config, cookieHeader = '') {
  const match = new RegExp(`${COOKIE_NAME}=([^;]+)`).exec(cookieHeader);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  const index = raw.indexOf('.');
  if (index === -1) return null;
  const expires = raw.slice(0, index);
  const signature = raw.slice(index + 1);
  if (!/^\d+$/.test(expires)) return null;
  if (Number(expires) < Date.now()) return null;
  return safeEqual(signature, hmac(expires, config.sessionSecret)) ? raw : null;
}

function setCookie(res, config, value) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  ];
  if (String(config.publicBaseUrl).startsWith('https://')) attrs.push('Secure');
  res.setHeader('set-cookie', attrs.join('; '));
}

export function registerAdminRoutes(router, deps) {
  const { config, store, client, logger } = deps;

  const guard = (handler) => (ctx) => {
    const token = readToken(config, ctx.req.headers.cookie || '');
    if (!token) {
      if (ctx.method === 'GET') {
        ctx.redirect('/admin/login');
        return;
      }
      ctx.json(401, { ok: false, error: '登录已过期，请重新登录' });
      return;
    }
    return handler(ctx);
  };

  // ── 登录 ──────────────────────────────────────────────
  router.get('/admin/login', (ctx) => {
    if (readToken(config, ctx.req.headers.cookie || '')) {
      ctx.redirect('/admin');
      return;
    }
    ctx.html(200, loginPage({ config }));
  });

  router.post('/admin/login', (ctx) => {
    const ip = ctx.req.socket.remoteAddress || 'unknown';
    if (tooManyFailures(ip)) {
      ctx.html(429, loginPage({ config, error: '尝试次数过多，请 10 分钟后再试' }));
      return;
    }

    const password = String(ctx.body.password || '');
    if (!safeEqual(password, config.adminPassword)) {
      noteFailure(ip);
      logger.warn(`[admin] 登录失败，来源 ${ip}`);
      ctx.html(401, loginPage({ config, error: '密码不正确' }));
      return;
    }

    loginFails.delete(ip);
    setCookie(ctx.res, config, issueToken(config));
    ctx.redirect('/admin');
  });

  router.get('/admin/logout', (ctx) => {
    ctx.res.setHeader('set-cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    ctx.redirect('/admin/login');
  });

  // ── 概览 ──────────────────────────────────────────────
  router.get('/admin', guard((ctx) => {
    const stats = store.stats();
    const messages = store.recentMessages(8);
    const pushes = store.recentPushes(5);
    const hits = Object.values(store.data.keywordHits).reduce((sum, n) => sum + n, 0);

    ctx.html(
      200,
      dashboardPage({
        config,
        stats,
        messages,
        pushes,
        schedule: describeSchedule(config),
        accountCount: {
          categories: store.categories().length,
          hits,
          lastMessage: messages[0]?.content ? `「${messages[0].content}」` : '还没有',
        },
      }),
    );
  }));

  // ── 知识库 ────────────────────────────────────────────
  router.get('/admin/knowledge', guard((ctx) => {
    const q = String(ctx.query.q || '').trim();
    const category = String(ctx.query.category || '').trim();
    const status = String(ctx.query.status || '').trim();

    let items = store.allKnowledge();
    if (q) {
      const needle = q.toLowerCase();
      items = items.filter((item) =>
        [item.title, item.summary, item.content, item.category, item.tags.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }
    if (category) items = items.filter((item) => item.category === category);
    if (status) items = items.filter((item) => item.status === status);

    ctx.html(
      200,
      knowledgeListPage({
        config,
        items,
        q,
        category,
        status,
        categories: store.categories(),
        notice: ctx.query.saved ? '已保存' : ctx.query.deleted ? '已删除' : '',
      }),
    );
  }));

  router.get('/admin/knowledge/new', guard((ctx) => {
    ctx.html(
      200,
      knowledgeFormPage({
        config,
        item: {
          id: '',
          title: '',
          category: String(ctx.query.category || ''),
          tags: [],
          summary: '',
          content: '',
          cover: '',
          status: 'published',
        },
        categories: store.categories(),
      }),
    );
  }));

  router.get('/admin/knowledge/:id', guard((ctx) => {
    const item = store.findKnowledge(ctx.params.id);
    if (!item) {
      ctx.redirect('/admin/knowledge');
      return;
    }
    ctx.html(200, knowledgeFormPage({ config, item, categories: store.categories() }));
  }));

  router.post('/admin/knowledge/save', guard((ctx) => {
    const form = ctx.body;
    const id = String(form.id || '').trim();
    const payload = {
      title: form.title,
      category: form.category,
      tags: form.tags,
      summary: form.summary,
      content: form.content,
      cover: form.cover,
      status: form.status === 'draft' ? 'draft' : 'published',
    };

    try {
      if (id) {
        if (!store.findKnowledge(id)) throw new Error('条目不存在');
        store.updateKnowledge(id, payload);
        ctx.redirect(`/admin/knowledge/${id}`);
      } else {
        if (!String(form.title || '').trim()) throw new Error('标题不能为空');
        const created = store.createKnowledge(payload);
        ctx.redirect(`/admin/knowledge/${created.id}`);
      }
    } catch (err) {
      ctx.html(
        400,
        knowledgeFormPage({
          config,
          item: { id, ...payload, tags: String(form.tags || '').split(/[,，\s]+/).filter(Boolean) },
          categories: store.categories(),
          error: err.message,
        }),
      );
    }
  }));

  router.post('/admin/knowledge/:id/delete', guard((ctx) => {
    store.deleteKnowledge(ctx.params.id);
    ctx.redirect('/admin/knowledge?deleted=1');
  }));

  // ── 推送 ──────────────────────────────────────────────
  router.get('/admin/push', guard((ctx) => {
    const count = Number(ctx.query.count || config.pushCount);
    const category = String(ctx.query.category || 'all');
    const preview = previewDaily({ store, config, count, category });
    ctx.html(
      200,
      pushPage({
        config,
        preview,
        history: store.recentPushes(12),
        categories: store.categories(),
        category,
        count,
        schedule: describeSchedule(config),
        notice: ctx.query.pushed ? `推送结果：${ctx.query.pushed}` : '',
      }),
    );
  }));

  router.post('/admin/api/push', guard(async (ctx) => {
    const count = Number(ctx.body.count || config.pushCount);
    const category = String(ctx.body.category || 'all');
    const result = await pushDaily({
      store,
      client,
      config,
      count,
      category,
      trigger: 'manual',
    });

    if (ctx.wantsJson) {
      ctx.json(result.ok ? 200 : 500, {
        ok: result.ok,
        status: result.status,
        error: result.error,
        title: result.article?.title,
        items: (result.items || []).map((item) => ({ id: item.id, title: item.title })),
      });
      return;
    }
    const flag = result.ok ? result.status : 'failed';
    ctx.redirect(`/admin/push?pushed=${encodeURIComponent(flag)}`);
  }));

  // ── 回复调试 ──────────────────────────────────────────
  const renderSimulator = (ctx, content = '', reply = '') => {
    ctx.html(200, simulatorPage({ config, content, reply, tips: TIPS }));
  };

  router.get('/admin/simulator', guard((ctx) => {
    const content = String(ctx.query.content || '').trim();
    if (content) {
      const { reply } = simulateMessage({ store, config, content });
      renderSimulator(ctx, content, reply);
      return;
    }
    renderSimulator(ctx);
  }));
  router.post('/admin/simulator', guard((ctx) => {
    const content = String(ctx.body.content || '').trim();
    if (!content) {
      renderSimulator(ctx);
      return;
    }
    const { reply } = simulateMessage({ store, config, content });
    renderSimulator(ctx, content, reply);
  }));

  // ── 消息与数据 ────────────────────────────────────────
  router.get('/admin/messages', guard((ctx) => {
    ctx.html(
      200,
      messagesPage({
        config,
        messages: store.recentMessages(100),
        keywords: store.topKeywords(12),
      }),
    );
  }));

  // ── 设置 ──────────────────────────────────────────────
  router.get('/admin/settings', guard((ctx) => {
    ctx.html(
      200,
      settingsPage({
        config,
        saved: Boolean(ctx.query.saved),
        calls: client.recentCalls(10),
      }),
    );
  }));

  router.post('/admin/settings', guard((ctx) => {
    try {
      const settings = sanitizeSettings(ctx.body);
      store.data.configOverrides = { ...store.data.configOverrides, ...settings };
      store.save();
      applyOverrides(config, settings);
      ctx.redirect('/admin/settings?saved=1');
    } catch (err) {
      ctx.html(
        400,
        settingsPage({
          config,
          error: err.message,
          calls: client.recentCalls(10),
        }),
      );
    }
  }));

  // ── JSON 小接口 ───────────────────────────────────────
  router.post('/admin/api/preview', guard((ctx) => {
    const html = renderMarkdown(String(ctx.body.markdown || ''), { base: config.publicBaseUrl });
    ctx.json(200, { ok: true, html });
  }));

  router.post('/admin/api/test-wechat', guard(async (ctx) => {
    try {
      const result = await client.selfTest();
      ctx.json(200, result);
    } catch (err) {
      ctx.json(200, { ok: false, message: err.message });
    }
  }));

  router.post('/admin/api/menu', guard(async (ctx) => {
    try {
      const result = await client.createMenu(buildDefaultMenu(config));
      if (ctx.wantsJson) {
        ctx.json(200, { ok: true, mock: Boolean(result.mock), message: '菜单已同步' });
        return;
      }
      ctx.redirect('/admin/settings?menu=1');
    } catch (err) {
      if (ctx.wantsJson) ctx.json(200, { ok: false, message: err.message });
      else ctx.redirect('/admin/settings?menu=0');
    }
  }));

  return { flash };
}
