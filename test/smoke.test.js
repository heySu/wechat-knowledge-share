import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { renderMarkdown } from '../src/markdown.js';
import { createServer } from '../src/server.js';
import { Store } from '../src/store.js';
import { WechatClient } from '../src/wechat/client.js';
import { computeSignature } from '../src/wechat/signature.js';
import { buildIncomingXml } from '../src/wechat/handler.js';
import { parseXml } from '../src/wechat/xml.js';

const TOKEN = 'test-token';
const silent = { log() {}, warn() {}, error() {} };

function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wks-test-'));
  const config = loadConfig({
    DATA_DIR: dir,
    PORT: '0',
    ADMIN_PASSWORD: 'pass123',
    WECHAT_TOKEN: TOKEN,
    WECHAT_MODE: 'mock',
    PUBLIC_BASE_URL: 'http://127.0.0.1:9999',
    PUSH_TIME: '23:59',
    TZ_NAME: 'Asia/Shanghai',
  });
  const store = new Store(path.join(config.dataDir, 'db.json')).load();
  store.createKnowledge({
    title: '复利效应',
    category: '经济学',
    tags: '复利,理财',
    summary: '时间比收益率更重要',
    content: '## 复利\n\n**时间**是最重要的变量。',
  });
  store.createKnowledge({
    title: '睡眠周期',
    category: '健康',
    tags: '睡眠,REM',
    summary: '90 分钟一个周期',
    content: '深睡与 REM 交替出现，在浅睡期醒来最清醒。',
  });
  const client = new WechatClient(config);
  const server = createServer({ config, store, client, logger: silent });
  return { config, store, client, server, dir };
}

const app = boot();
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;

test.after(() => {
  app.server.close();
});

function signedQuery(extra = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = '1234567890';
  const signature = computeSignature(TOKEN, timestamp, nonce);
  return new URLSearchParams({ signature, timestamp, nonce, ...extra }).toString();
}

async function login() {
  const response = await fetch(`${base}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: 'pass123' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 302);
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.length > 0, '登录后应下发 cookie');
  return cookies[0].split(';')[0];
}

test('GET /wechat 校验签名并回显 echostr', async () => {
  const response = await fetch(`${base}/wechat?${signedQuery({ echostr: 'hello-wechat' })}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'hello-wechat');
});

test('GET /wechat 签名错误时返回 401', async () => {
  const response = await fetch(`${base}/wechat?signature=bad&timestamp=1&nonce=2&echostr=x`);
  assert.equal(response.status, 401);
});

test('POST /wechat 关键词命中知识并回复文本', async () => {
  const xml = buildIncomingXml({ openid: 'o_test_user_001', content: '复利' });
  const response = await fetch(`${base}/wechat?${signedQuery()}`, {
    method: 'POST',
    headers: { 'content-type': 'text/xml' },
    body: xml,
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  const reply = parseXml(text);
  assert.equal(reply.MsgType, 'text');
  assert.match(reply.Content, /复利效应/);
  assert.match(reply.Content, /http:\/\/127\.0\.0\.1:9999\/article\//);
});

test('POST /wechat 发送「随机」总能拿到一条知识', async () => {
  const xml = buildIncomingXml({ openid: 'o_test_user_002', content: '随机' });
  const response = await fetch(`${base}/wechat?${signedQuery()}`, {
    method: 'POST',
    headers: { 'content-type': 'text/xml' },
    body: xml,
  });
  const reply = parseXml(await response.text());
  assert.equal(reply.MsgType, 'text');
  assert.ok(reply.Content.includes('《'), '回复应包含知识标题');
});

test('多条搜索结果后可用序号查看详情', async () => {
  const openid = 'o_test_user_003';
  const first = await fetch(`${base}/wechat?${signedQuery()}`, {
    method: 'POST',
    headers: { 'content-type': 'text/xml' },
    body: buildIncomingXml({ openid, content: '周期 复利' }),
  });
  assert.equal(first.status, 200);

  const pick = await fetch(`${base}/wechat?${signedQuery()}`, {
    method: 'POST',
    headers: { 'content-type': 'text/xml' },
    body: buildIncomingXml({ openid, content: '1' }),
  });
  const reply = parseXml(await pick.text());
  assert.match(reply.Content, /阅读全文/);
});

test('知识详情页可以打开并累计阅读', async () => {
  const item = app.store.findKnowledge(1);
  const response = await fetch(`${base}/article/${item.id}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /复利效应/);
  assert.ok(app.store.findKnowledge(item.id).views >= 1);
});

test('未登录访问后台会跳转登录页', async () => {
  const response = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/login');
});

test('登录后可以访问后台并看到知识库', async () => {
  const cookie = await login();
  const response = await fetch(`${base}/admin/knowledge`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /复利效应/);
  assert.match(html, /睡眠周期/);
});

test('Markdown 预览接口返回微信友好的行内样式', async () => {
  const cookie = await login();
  const response = await fetch(`${base}/admin/api/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-requested-with': 'fetch' },
    body: JSON.stringify({ markdown: '## 标题\n\n- 一\n- 二\n\n<script>alert(1)</script>' }),
  });
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.match(data.html, /<h2 style="/);
  assert.match(data.html, /<ul style="/);
  assert.ok(!data.html.includes('<script>'), '必须转义脚本标签');
});

test('模拟模式推送会写入 outbox 与推送历史', async () => {
  const cookie = await login();
  const before = app.store.recentPushes().length;
  const response = await fetch(`${base}/admin/api/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, accept: 'application/json' },
    body: new URLSearchParams({ count: '2', category: 'all', go: '1' }),
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.status, 'mock');
  assert.equal(app.store.recentPushes().length, before + 1);

  const push = app.store.recentPushes()[0];
  const outbox = path.join(app.config.dataDir, push.previewFile);
  assert.ok(fs.existsSync(outbox), '应生成本地预览文件');
  const html = fs.readFileSync(outbox, 'utf8');
  assert.match(html, /每日知识/);
});

test('推送后条目会记录推送次数，便于轮换', async () => {
  const items = app.store.allKnowledge();
  assert.ok(items.some((item) => item.pushCount > 0));
});

test('parseXml 能解析 CDATA 与嵌套节点', () => {
  const parsed = parseXml(
    '<xml><ToUserName><![CDATA[gh_1]]></ToUserName><MsgType><![CDATA[text]]></MsgType><Content>a &amp; b</Content></xml>',
  );
  assert.equal(parsed.ToUserName, 'gh_1');
  assert.equal(parsed.Content, 'a & b');
});

test('renderMarkdown 保留代码块并转义 HTML', () => {
  const html = renderMarkdown('```js\nconst a = 1 < 2;\n```');
  assert.match(html, /<pre style="/);
  assert.match(html, /1 &lt; 2/);
});
