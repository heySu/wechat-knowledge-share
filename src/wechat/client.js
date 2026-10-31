import { randomToken } from '../util.js';

const API_BASE = 'https://api.weixin.qq.com';

export class WechatError extends Error {
  constructor(message, { errcode, errmsg, api } = {}) {
    super(message);
    this.name = 'WechatError';
    this.errcode = errcode;
    this.errmsg = errmsg;
    this.api = api;
  }
}

/**
 * 公众号接口客户端。
 *
 * mock 模式：不发任何网络请求，只把调用写进内存日志并返回假数据，
 *          配合 outbox 目录让本地也能看到「推送出去的长什么样」。
 * live 模式：真实调用 access_token / 草稿箱 / 发布 / 菜单 / 群发接口。
 */
export class WechatClient {
  constructor(config, { logger = console } = {}) {
    this.config = config;
    this.logger = logger;
    this.cache = null;
    this.calls = [];
  }

  get isMock() {
    return this.config.mode !== 'live';
  }

  #record(api, body) {
    this.calls.unshift({ api, at: new Date().toISOString(), body });
    if (this.calls.length > 50) this.calls.length = 50;
  }

  async getAccessToken(force = false) {
    if (this.isMock) return 'MOCK_ACCESS_TOKEN';
    if (!this.config.appId || !this.config.appSecret) {
      throw new WechatError('未配置 AppID / AppSecret，无法调用微信接口');
    }
    if (!force && this.cache && Date.now() < this.cache.expiresAt) return this.cache.token;

    const url = new URL(`${API_BASE}/cgi-bin/token`);
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', this.config.appId);
    url.searchParams.set('secret', this.config.appSecret);

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await response.json();
    if (!data.access_token) {
      throw new WechatError(`获取 access_token 失败：${data.errcode} ${data.errmsg}`, {
        errcode: data.errcode,
        errmsg: data.errmsg,
        api: 'cgi-bin/token',
      });
    }
    this.cache = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(data.expires_in - 300, 60) * 1000,
    };
    return this.cache.token;
  }

  /** 统一调用入口：mock 直接返回假数据，live 走真实 HTTP */
  async call(pathname, { method = 'POST', body, query = {} } = {}) {
    if (this.isMock) {
      this.#record(pathname, body);
      return {
        errcode: 0,
        errmsg: 'ok',
        mock: true,
        media_id: `mock_media_${randomToken(6)}`,
        msg_id: `mock_msg_${randomToken(6)}`,
        menu: query,
      };
    }

    const token = await this.getAccessToken();
    const url = new URL(`${API_BASE}${pathname}`);
    for (const [key, value] of Object.entries({ ...query, access_token: token })) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json; charset=utf-8' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();

    if (data.errcode && data.errcode !== 0) {
      if ([40001, 40014, 42001].includes(data.errcode)) this.cache = null;
      throw new WechatError(`微信接口返回错误：${data.errcode} ${data.errmsg}`, {
        errcode: data.errcode,
        errmsg: data.errmsg,
        api: pathname,
      });
    }
    this.#record(pathname, body);
    return data;
  }

  /** 新增草稿，返回 media_id */
  async addDraft(articles) {
    return this.call('/cgi-bin/draft/add', { body: { articles } });
  }

  /** 提交发布（仅认证号可用） */
  async submitPublish(mediaId) {
    return this.call('/cgi-bin/freepublish/submit', { body: { media_id: mediaId } });
  }

  /** 群发图文（订阅号每天 1 次，且需要认证） */
  async massSendNews(mediaId) {
    return this.call('/cgi-bin/message/mass/sendall', {
      body: { filter: { is_to_all: true }, mpnews: { media_id: mediaId }, msgtype: 'mpnews' },
    });
  }

  /** 创建自定义菜单 */
  async createMenu(button) {
    return this.call('/cgi-bin/menu/create', { body: { button } });
  }

  /** 查询自定义菜单（用于后台「检查菜单」） */
  async getMenu() {
    return this.call('/cgi-bin/menu/get', { method: 'GET' });
  }

  /** 连通性自检：拉取 access_token（会同时验证 IP 白名单） */
  async selfTest() {
    if (this.isMock) {
      return { ok: true, mock: true, message: '当前为模拟模式，未请求微信服务器' };
    }
    const token = await this.getAccessToken(true);
    return { ok: true, mock: false, message: `access_token 获取成功（${token.slice(0, 8)}…）` };
  }

  /** 最近一次调用记录，后台「设置」页可见 */
  recentCalls(limit = 10) {
    return this.calls.slice(0, limit);
  }
}

/** 生成菜单结构：两个 click 项 + 一个二级菜单 */
export function buildDefaultMenu(config) {
  return [
    { type: 'click', name: '今日知识', key: 'MENU_TODAY' },
    { type: 'click', name: '随机一条', key: 'MENU_RANDOM' },
    {
      name: '更多',
      sub_button: [
        { type: 'view', name: '知识库', url: `${config.publicBaseUrl}/` },
        { type: 'click', name: '使用帮助', key: 'MENU_HELP' },
      ],
    },
  ];
}
