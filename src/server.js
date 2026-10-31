import http from 'node:http';
import path from 'node:path';
import { ROOT_DIR } from './config.js';
import { parseBody, readBody, serveStatic, sendHtml, sendJson, sendText } from './http.js';
import { renderMarkdown } from './markdown.js';
import { articlePage, landingPage, notFoundPage } from './web/site.js';
import { registerAdminRoutes } from './web/admin.js';
import { handleMessage } from './wechat/handler.js';
import { verifySignature } from './wechat/signature.js';

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

/** 极简路由：支持 /a/:id 形式的参数 */
export function createRouter() {
  const routes = [];

  const add = (method, pattern, handler) => {
    const keys = [];
    const source = pattern.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler });
  };

  return {
    get: (pattern, handler) => add('GET', pattern, handler),
    post: (pattern, handler) => add('POST', pattern, handler),
    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const match = route.regex.exec(pathname);
        if (!match) continue;
        const params = {};
        route.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(match[index + 1]);
        });
        return { handler: route.handler, params };
      }
      return null;
    },
  };
}

function errorPage(title, detail) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${title}</title><link rel="stylesheet" href="/static/site.css"></head>
<body><div class="empty-page"><h1>${title}</h1><p>${detail}</p><a class="btn" href="/">回到首页</a></div></body></html>`;
}

export function createServer({ config, store, client, logger = console }) {
  const router = createRouter();
  registerAdminRoutes(router, { config, store, client, logger });

  // ── 公众号接入校验 ────────────────────────────────────
  router.get('/wechat', (ctx) => {
    const result = verifySignature(config.token, ctx.query);
    if (!result.ok) {
      logger.warn(`[wechat] 签名校验失败：${result.reason}`);
      sendText(ctx.res, 401, 'invalid signature');
      return;
    }
    sendText(ctx.res, 200, result.echostr);
  });

  // ── 接收粉丝消息 ──────────────────────────────────────
  router.post('/wechat', (ctx) => {
    const check = verifySignature(config.token, ctx.query);
    if (!check.ok) {
      logger.warn(`[wechat] 消息签名校验失败：${check.reason}`);
      sendText(ctx.res, 401, 'invalid signature');
      return;
    }
    try {
      const reply = handleMessage({ store, config, rawXml: ctx.raw, logger });
      if (reply) sendText(ctx.res, 200, reply, 'application/xml; charset=utf-8');
      else sendText(ctx.res, 200, 'success');
    } catch (err) {
      logger.error('[wechat] 处理消息失败', err);
      // 返回 success 避免微信重复推送同一条消息
      sendText(ctx.res, 200, 'success');
    }
  });

  // ── 前台站点 ──────────────────────────────────────────
  router.get('/healthz', (ctx) => {
    ctx.json(200, { ok: true, mode: config.mode, uptime: Math.round(process.uptime()) });
  });

  router.get('/', (ctx) => {
    const q = String(ctx.query.q || '').trim();
    const category = String(ctx.query.category || '').trim();
    let items = store.publishedKnowledge();
    if (category) items = items.filter((item) => item.category === category);
    if (q) {
      const needle = q.toLowerCase();
      items = items.filter((item) =>
        [item.title, item.summary, item.content, item.tags.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }
    ctx.html(200, landingPage({ config, items, q, category, categories: store.categories() }));
  });

  router.get('/article/:id', (ctx) => {
    const item = store.findKnowledge(ctx.params.id);
    if (!item || item.status !== 'published') {
      ctx.html(404, notFoundPage({ config }));
      return;
    }
    store.touchView(item.id);
    const html = renderMarkdown(item.content, { base: config.publicBaseUrl });
    ctx.html(200, articlePage({ config, item, html }));
  });

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    } catch {
      sendText(res, 400, 'Bad Request');
      return;
    }

    try {
      if (req.method === 'GET' && url.pathname.startsWith('/static/')) {
        serveStatic(res, PUBLIC_DIR, url.pathname);
        return;
      }

      const route = router.match(req.method, url.pathname);
      if (!route) {
        sendHtml(res, 404, notFoundPage({ config }));
        return;
      }

      const raw = req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req);
      const body = parseBody(raw, req.headers['content-type'] || '');
      const accept = String(req.headers.accept || '');
      const query = Object.fromEntries(url.searchParams.entries());

      const ctx = {
        req,
        res,
        method: req.method,
        params: route.params,
        query,
        body,
        raw,
        config,
        store,
        client,
        wantsJson: /application\/json/i.test(accept) || req.headers['x-requested-with'] === 'fetch',
        html(status, html) {
          sendHtml(res, status, html);
        },
        json(status, data) {
          sendJson(res, status, data);
        },
        text(status, text) {
          sendText(res, status, text);
        },
        redirect(location) {
          res.writeHead(302, { location });
          res.end();
        },
      };

      await route.handler(ctx);
    } catch (err) {
      logger.error('[server] 未捕获异常', err);
      if (!res.headersSent) {
        sendHtml(res, 500, errorPage('服务器出错了', '请查看终端日志定位问题。'));
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  return server;
}

export { sendHtml, sendJson, sendText };
