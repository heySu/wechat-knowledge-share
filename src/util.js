import crypto from 'node:crypto';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML 转义，所有外部输入落到页面前都必须经过它 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function nowIso() {
  return new Date().toISOString();
}

/** 标签既接受数组，也接受「逗号 / 空格」分隔的字符串 */
export function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags ?? '').split(/[,，\s]+/);
  const result = [];
  for (const raw of list) {
    const tag = String(raw).trim();
    if (tag && !result.includes(tag)) result.push(tag);
  }
  return result.slice(0, 12);
}

/** 指定时区下的 YYYY-MM-DD */
export function dateKeyInZone(date = new Date(), timeZone = 'Asia/Shanghai') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** 指定时区下的 HH:mm */
export function timeKeyInZone(date = new Date(), timeZone = 'Asia/Shanghai') {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function humanDate(iso, timeZone = 'Asia/Shanghai') {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function truncate(text, len = 100) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= len ? s : `${s.slice(0, len)}…`;
}

export function sha1(...parts) {
  return crypto.createHash('sha1').update(parts.join('')).digest('hex');
}

export function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** 简单的分钟数换算，用于比较 "08:30" 这类时间 */
export function minutesOf(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map((n) => Number(n) || 0);
  return h * 60 + m;
}
