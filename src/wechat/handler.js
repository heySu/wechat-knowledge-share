import { buildEventReply, buildTextReply } from '../services/reply.js';
import { truncate } from '../util.js';
import { buildTextReply as buildTextXml, extractReplyText, parseXml } from './xml.js';

function maskOpenid(openid) {
  const value = String(openid || '');
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** 组装一条「假装是微信发来的」文本消息，供后台调试使用 */
export function buildIncomingXml({ openid, content, toUser = 'gh_demo_account' }) {
  return [
    '<xml>',
    `<ToUserName><![CDATA[${toUser}]]></ToUserName>`,
    `<FromUserName><![CDATA[${openid}]]></FromUserName>`,
    `<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>`,
    '<MsgType><![CDATA[text]]></MsgType>',
    `<Content><![CDATA[${String(content).replace(/]]>/g, ']]]]><![CDATA[>')}]]></Content>`,
    '<MsgId>1000000001</MsgId>',
    '</xml>',
  ].join('');
}

/**
 * 处理一条来自微信服务器的消息，返回应回复的 XML（null 表示不回复）。
 * 这里是「业务总入口」：解析 → 分发 → 记录 → 组装回复。
 */
export function handleMessage({ store, config, rawXml, record = true, logger = console }) {
  const message = parseXml(rawXml);
  const from = String(message.FromUserName || '');
  const to = String(message.ToUserName || '');
  const type = String(message.MsgType || '');

  if (!from) throw new Error('消息中缺少 FromUserName，无法处理');

  const isKnown = Boolean(store.data.subscribers[from]);
  store.trackSubscriber(from);

  let result;
  if (type === 'text') {
    result = buildTextReply({ store, config, openid: from, content: message.Content });
  } else if (type === 'event') {
    const event = String(message.Event || '').toUpperCase();
    result = buildEventReply({ store, config, event, eventKey: message.EventKey });
    if (event === 'subscribe' && !isKnown) result.isNewSubscriber = true;
  } else if (type === 'image' || type === 'voice' || type === 'video' || type === 'shortvideo') {
    result = { text: '暂时只认得文字消息～发送「帮助」查看可以怎么用。' };
  } else if (type === 'location' || type === 'link') {
    result = { text: '收到了，不过这里只做知识分享，发送「随机」抽一条知识吧。' };
  } else {
    result = { text: '发送「帮助」查看使用方法。' };
  }

  if (result.session?.lastIds?.length) {
    store.setSession(from, { lastIds: result.session.lastIds });
  }

  if (record) {
    store.recordMessage({
      openid: maskOpenid(from),
      type,
      content: type === 'text' ? String(message.Content || '') : String(message.Event || type),
      reply: result.text ? truncate(result.text, 90) : '',
      matchedIds: result.matchedIds || [],
    });
    if (result.keywords?.length) store.recordKeywordHits(result.keywords);
  }

  if (!result.text) {
    if (result.unsubscribed) {
      delete store.data.subscribers[from];
      store.save();
    }
    return null;
  }

  return buildTextXml({ toUser: from, fromUser: to, content: result.text });
}

/** 后台「回复调试」：走完整链路，但把结果转成纯文本返回 */
export function simulateMessage({ store, config, openid = 'demo_openid', content }) {
  const rawXml = buildIncomingXml({ openid, content });
  const replyXml = handleMessage({ store, config, rawXml, record: false });
  return {
    reply: replyXml ? extractReplyText(replyXml) : '（这条消息不会触发回复）',
    xml: replyXml || '',
  };
}
