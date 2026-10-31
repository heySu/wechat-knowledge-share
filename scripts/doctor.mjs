#!/usr/bin/env node
/**
 * 接入自检：模拟微信服务器对这个程序做一遍「握手 + 发消息」，
 * 用来判断服务器配置/域名/Token 有没有填对。
 *
 *   node scripts/doctor.mjs                      # 检查 .env 里的 PUBLIC_BASE_URL
 *   node scripts/doctor.mjs http://127.0.0.1:3000 # 检查指定地址
 */
import { loadConfig } from '../src/config.js';
import { WechatClient } from '../src/wechat/client.js';
import { computeSignature } from '../src/wechat/signature.js';
import { buildIncomingXml } from '../src/wechat/handler.js';
import { parseXml } from '../src/wechat/xml.js';

const config = loadConfig();
const target = (process.argv[2] || config.publicBaseUrl || `http://127.0.0.1:${config.port}`).replace(/\/+$/, '');
const TIMEOUT = 8000;

const results = [];

function record(ok, label, detail = '') {
  results.push({ ok, label, detail });
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${label}${detail ? `  ${detail}` : ''}`);
}

function signedQuery(extra = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = Math.random().toString(36).slice(2, 10);
  return new URLSearchParams({
    signature: computeSignature(config.token, timestamp, nonce),
    timestamp,
    nonce,
    ...extra,
  });
}

function explain(error) {
  const message = String(error?.message || error);
  if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
    return '连不上：服务没启动、端口没放行，或域名解析到了别处';
  }
  if (message.includes('certificate') || message.includes('CERT')) return 'HTTPS 证书有问题';
  if (message.includes('timeout') || message.includes('aborted')) return '超时：微信要求 5 秒内响应';
  return message;
}

async function main() {
  console.log('');
  console.log(`  自检目标：${target}`);
  console.log(`  运行模式：${config.mode}    Token：${config.token.slice(0, 3)}***`);
  console.log('');

  // 1. 服务是否活着
  try {
    const response = await fetch(`${target}/healthz`, { signal: AbortSignal.timeout(TIMEOUT) });
    const data = await response.json();
    record(response.ok && data.ok === true, 'GET /healthz 服务可访问', `mode=${data.mode}`);
  } catch (error) {
    record(false, 'GET /healthz 服务可访问', explain(error));
  }

  // 2. 公众号接入握手（等价于公众平台点「提交」时微信发来的请求）
  try {
    const query = signedQuery({ echostr: 'doctor-echostr' });
    const response = await fetch(`${target}/wechat?${query}`, { signal: AbortSignal.timeout(TIMEOUT) });
    const text = (await response.text()).trim();
    record(
      response.status === 200 && text === 'doctor-echostr',
      'GET /wechat 签名握手',
      response.status === 200 ? `回显 ${text.slice(0, 20)}` : `HTTP ${response.status}`,
    );
  } catch (error) {
    record(false, 'GET /wechat 签名握手', explain(error));
  }

  // 3. 模拟粉丝发一条消息，看能不能拿到回复
  try {
    const query = signedQuery();
    const response = await fetch(`${target}/wechat?${query}`, {
      method: 'POST',
      headers: { 'content-type': 'text/xml' },
      body: buildIncomingXml({ openid: 'o_doctor_check', content: '帮助' }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const reply = parseXml(await response.text());
    record(
      response.status === 200 && Boolean(reply.Content),
      'POST /wechat 自动回复',
      reply.Content ? String(reply.Content).split('\n')[0].slice(0, 20) : `HTTP ${response.status}`,
    );
  } catch (error) {
    record(false, 'POST /wechat 自动回复', explain(error));
  }

  // 4. 真实模式下顺便验一下 AppID / IP 白名单
  if (config.mode === 'live') {
    if (!config.appId || !config.appSecret) {
      record(false, '微信接口凭证', '缺少 AppID / AppSecret');
    } else {
      try {
        const client = new WechatClient(config);
        const token = await client.getAccessToken(true);
        record(true, '获取 access_token', `${token.slice(0, 8)}…`);
      } catch (error) {
        const hint = error.errcode === 40164 ? '（服务器出口 IP 不在白名单）' : '';
        record(false, '获取 access_token', `${error.message}${hint}`);
      }
    }
  }

  const failed = results.filter((item) => !item.ok);
  console.log('');
  if (failed.length === 0) {
    console.log('  全部通过：把这个地址填到公众平台「服务器配置」的 URL 即可：');
    console.log(`  ${target}/wechat     Token: ${config.token}`);
  } else {
    console.log(`  有 ${failed.length} 项没通过，先解决上面打 ✗ 的再回公众平台点「启用」。`);
  }
  console.log('');
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
