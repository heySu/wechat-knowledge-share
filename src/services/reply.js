import { dateKeyInZone, truncate } from '../util.js';
import { randomKnowledge, replyCard, replyList, searchKnowledge } from './knowledge.js';

const HELP = (config) =>
  [
    `📖 「${config.accountName}」使用指南`,
    '',
    '· 发送「随机」——随机推送一条知识',
    '· 发送「今日」——查看今天的知识卡片',
    '· 发送关键词——检索知识库（如：复利、睡眠）',
    '· 发送「搜索 关键词」——精确检索',
    '· 回复数字 1-9——查看上一条搜索结果',
    '· 发送「帮助」——显示本菜单',
    '',
    '每天 ' + config.pushTime + ' 自动推送一条精选知识，不见不散。',
  ].join('\n');

const WELCOME = (config) =>
  [
    `🎉 欢迎关注「${config.accountName}」`,
    '',
    '每天用 3 分钟，讲清一个知识点。',
    '',
    '你可以：',
    '· 发送「随机」，先来一条试试',
    '· 发送任意关键词，检索知识库',
    '· 发送「帮助」，查看完整指令',
  ].join('\n');

export function buildHelp(config) {
  return HELP(config);
}

export function buildWelcome(config) {
  return WELCOME(config);
}

const isRandom = (text) => /^(随机|来一条|来一个|随机知识|随便|抽一条)[。!！]?$/.test(text);
const isHelp = (text) => /^(帮助|help|菜单|使用说明|说明|\?|？)[。!！]?$/i.test(text);
const isToday = (text) => /^(今日|今天|每日|今日知识|今天学什么)[。!！]?$/.test(text);
const isSearch = (text) => /^(搜索|搜|查|找)[\s:：]+(.+)$/.test(text);

/** 今天的推送内容；还没推过就用「今天将要推的」预览 */
function todayItems(store, config) {
  const today = dateKeyInZone(new Date(), config.timeZone);
  const push = store.recentPushes(10).find((item) => item.date === today && Array.isArray(item.articleIds));
  if (push) {
    const items = push.articleIds.map((id) => store.findKnowledge(id)).filter(Boolean);
    if (items.length > 0) return { items, pushed: true };
  }
  return { items: [], pushed: false };
}

/**
 * 文本消息 → 回复内容。
 * 纯函数式：只读 store，不产生副作用（记录日志由调用方负责）。
 */
export function buildTextReply({ store, config, openid, content }) {
  const text = String(content || '').trim();

  if (!text) return { text: HELP(config) };
  if (isHelp(text)) return { text: HELP(config) };
  if (isRandom(text)) {
    const [item] = randomKnowledge(store, 1);
    if (!item) return { text: '知识库还是空的，先去后台添加几条知识吧～' };
    return { text: replyCard(item, config), matchedIds: [item.id] };
  }

  if (isToday(text)) {
    const { items } = todayItems(store, config);
    if (items.length === 0) {
      return {
        text: `⏰ 今天 ${config.pushTime} 的知识卡片还没推出来，\n先发「随机」抽一条吧～`,
      };
    }
    if (items.length === 1) {
      return { text: replyCard(items[0], config), matchedIds: [items[0].id], keywords: [] };
    }
    const rows = items.map((item, index) => `${index + 1}. 《${item.title}》${item.category ? ` — ${item.category}` : ''}`);
    return {
      text: [`📅 今天推送的 ${items.length} 条知识：`, '', ...rows, '', '回复序号查看全文，或发送「随机」来一条。'].join('\n'),
      matchedIds: items.map((item) => item.id),
      session: { lastIds: items.map((item) => item.id) },
    };
  }

  // 回复序号：命中上一次的搜索结果
  const numberMatch = /^(?:第)?([1-9])[条个]?$/.exec(text);
  if (numberMatch) {
    const session = store.getSession(openid);
    const ids = session?.lastIds || [];
    const id = ids[Number(numberMatch[1]) - 1];
    const item = id ? store.findKnowledge(id) : null;
    if (item) return { text: replyCard(item, config), matchedIds: [item.id] };
    return { text: '没有找到对应的条目，发送关键词重新搜索试试～' };
  }

  let keyword = text;
  const searchMatch = isSearch(text);
  if (searchMatch) keyword = searchMatch[2].trim();

  if (keyword.length > 30) keyword = keyword.slice(0, 30);
  const results = searchKnowledge(store, keyword, { limit: 6, includeDrafts: false });

  if (results.length === 0) {
    const [fallback] = randomKnowledge(store, 1);
    return {
      text: [
        `没有找到与「${truncate(text, 20)}」相关的知识。`,
        '',
        '换个说法试试，比如「复利」「睡眠」「思维」。',
        fallback ? `或者先看这条：《${fallback.title}》—— 回复「随机」获取全文。` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      keywords: [keyword],
    };
  }

  if (results.length === 1) {
    return {
      text: replyCard(results[0], config),
      matchedIds: [results[0].id],
      keywords: [keyword],
    };
  }

  return {
    text: replyList(results, keyword),
    matchedIds: results.map((item) => item.id),
    keywords: [keyword],
    session: { lastIds: results.map((item) => item.id) },
  };
}

/** 事件消息：关注 / 取消关注 / 菜单点击 */
export function buildEventReply({ store, config, event, eventKey }) {
  if (event === 'subscribe') {
    return { text: WELCOME(config), isNewSubscriber: true };
  }
  if (event === 'unsubscribe') {
    return { text: null, unsubscribed: true };
  }
  if (event === 'CLICK') {
    if (eventKey === 'MENU_TODAY') return buildTextReply({ store, config, openid: '', content: '今日' });
    if (eventKey === 'MENU_RANDOM') return buildTextReply({ store, config, openid: '', content: '随机' });
    if (eventKey === 'MENU_HELP') return { text: HELP(config) };
  }
  if (event === 'SCAN' || event === 'VIEW') {
    return { text: WELCOME(config) };
  }
  return { text: HELP(config) };
}
