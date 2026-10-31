import { safeEqual, sha1 } from '../util.js';

/** 微信服务器签名：token、timestamp、nonce 字典序排序后拼接做 sha1 */
export function computeSignature(token, timestamp, nonce) {
  return sha1([String(token), String(timestamp), String(nonce)].sort().join(''));
}

/**
 * 校验 GET /wechat 的接入请求。
 * @param {string} token 公众号后台填写的 Token
 * @param {Record<string,string>} query URL 查询参数
 */
export function verifySignature(token, query = {}) {
  const { signature, timestamp, nonce, echostr } = query;
  if (!signature || !timestamp || !nonce) return { ok: false, reason: '缺少签名参数' };
  const expected = computeSignature(token, timestamp, nonce);
  if (!safeEqual(signature, expected)) return { ok: false, reason: '签名不匹配' };
  return { ok: true, echostr: echostr || '' };
}
