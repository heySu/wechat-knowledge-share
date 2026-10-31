import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 极简 .env 解析器，避免为了一个配置引入第三方依赖 */
function parseDotEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value.replace(/\\n/g, '\n');
  }
  return out;
}

/** 读取 .env；已存在的真实环境变量优先级更高 */
export function loadEnvFile(file = path.join(ROOT_DIR, '.env')) {
  if (!fs.existsSync(file)) return {};
  const values = parseDotEnv(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return values;
}

/**
 * 生成运行时配置。
 * 优先级：overrides（测试用） > 环境变量 / .env > 默认值；
 * 后台「设置」保存的覆盖项会在启动后由 applyOverrides 覆盖上来。
 */
export function loadConfig(overrides = {}) {
  loadEnvFile();
  const env = { ...process.env, ...overrides };
  const port = Number(env.PORT || 3000);
  const mode = String(env.WECHAT_MODE || 'mock').toLowerCase() === 'live' ? 'live' : 'mock';

  return {
    port,
    host: env.HOST || '0.0.0.0',
    mode,
    appId: env.WECHAT_APPID || '',
    appSecret: env.WECHAT_SECRET || '',
    token: env.WECHAT_TOKEN || 'knowledge',
    adminPassword: env.ADMIN_PASSWORD || 'admin123',
    timeZone: env.TZ_NAME || 'Asia/Shanghai',
    pushTime: env.PUSH_TIME || '08:30',
    pushCount: Math.min(Math.max(Number(env.PUSH_COUNT || 3), 1), 8),
    accountName: env.ACCOUNT_NAME || '知识小站',
    publicBaseUrl: String(env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
    dataDir: env.DATA_DIR ? path.resolve(ROOT_DIR, env.DATA_DIR) : path.join(ROOT_DIR, 'data'),
    autoPublish: String(env.AUTO_PUBLISH || 'false').toLowerCase() === 'true',
    thumbMediaId: env.THUMB_MEDIA_ID || '',
    sessionSecret: env.SESSION_SECRET || env.ADMIN_PASSWORD || 'admin123',
  };
}

/** 后台「设置」页面可在线修改的字段白名单 */
export const EDITABLE_KEYS = [
  'mode',
  'appId',
  'appSecret',
  'token',
  'pushTime',
  'pushCount',
  'accountName',
  'publicBaseUrl',
  'autoPublish',
  'thumbMediaId',
];

/** 把后台保存的覆盖项合并进 config（就地修改） */
export function applyOverrides(config, overrides = {}) {
  for (const key of EDITABLE_KEYS) {
    const value = overrides[key];
    if (value === undefined || value === '') continue;
    if (key === 'pushCount') config.pushCount = Math.min(Math.max(Number(value) || 3, 1), 8);
    else if (key === 'autoPublish') config.autoPublish = value === true || value === 'true';
    else config[key] = value;
  }
  config.publicBaseUrl = String(config.publicBaseUrl || '').replace(/\/+$/, '');
  return config;
}

/** 校验并清洗后台提交的设置 */
export function sanitizeSettings(input = {}) {
  const out = {};
  const pick = (key) => (input[key] === undefined ? undefined : String(input[key]).trim());

  const mode = pick('mode');
  if (mode) out.mode = mode === 'live' ? 'live' : 'mock';

  const appId = pick('appId');
  if (appId !== undefined) out.appId = appId;
  const appSecret = pick('appSecret');
  if (appSecret !== undefined) out.appSecret = appSecret;
  const token = pick('token');
  if (token) out.token = token;
  const accountName = pick('accountName');
  if (accountName) out.accountName = accountName;

  const pushTime = pick('pushTime');
  if (pushTime !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(pushTime)) throw new Error('推送时间格式应为 HH:mm');
    out.pushTime = pushTime;
  }
  if (input.pushCount !== undefined) {
    const n = Number(input.pushCount);
    if (!Number.isFinite(n) || n < 1 || n > 8) throw new Error('每次推送条数应在 1-8 之间');
    out.pushCount = Math.floor(n);
  }

  const baseUrl = pick('publicBaseUrl');
  if (baseUrl) {
    if (!/^https?:\/\//i.test(baseUrl)) throw new Error('站点地址必须以 http:// 或 https:// 开头');
    out.publicBaseUrl = baseUrl.replace(/\/+$/, '');
  }

  if (input.autoPublish !== undefined) {
    out.autoPublish = input.autoPublish === true || input.autoPublish === 'true' || input.autoPublish === 'on';
  }
  const thumb = pick('thumbMediaId');
  if (thumb !== undefined) out.thumbMediaId = thumb;
  return out;
}
