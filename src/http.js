import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function send(res, status, body, headers = {}) {
  if (res.writableEnded) return;
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''), 'utf8');
  res.writeHead(status, { 'content-length': buffer.length, ...headers });
  res.end(buffer);
}

export function sendHtml(res, status, html) {
  send(res, status, html, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
}

export function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
}

export function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  send(res, status, text, { 'content-type': contentType, 'cache-control': 'no-store' });
}

export function redirect(res, location, status = 302) {
  if (res.writableEnded) return;
  res.writeHead(status, { location });
  res.end();
}

/** 读取请求体（默认限制 1MB，微信消息一般只有几 KB） */
export function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体超过限制'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** 同时支持 JSON 与表单提交 */
export function parseBody(raw, contentType = '') {
  const text = String(raw || '').trim();
  if (!text) return {};
  if (/application\/json/i.test(contentType)) {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
  const out = {};
  for (const [key, value] of new URLSearchParams(text)) out[key] = value;
  return out;
}

/** 仅允许从 public 目录读取静态文件，防止路径穿越 */
export function serveStatic(res, publicDir, pathname) {
  const relative = decodeURIComponent(pathname.replace(/^\/static\/?/, ''));
  const target = path.resolve(publicDir, relative);
  if (!target.startsWith(path.resolve(publicDir) + path.sep)) {
    sendText(res, 403, 'Forbidden');
    return true;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    sendText(res, 404, 'Not Found');
    return true;
  }
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'public, max-age=300',
  });
  fs.createReadStream(target).pipe(res);
  return true;
}
