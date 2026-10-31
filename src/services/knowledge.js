import { stripMarkdown } from '../markdown.js';
import { truncate } from '../util.js';

export function articleUrl(config, id) {
  return `${config.publicBaseUrl}/article/${id}`;
}

/**
 * 关键词检索：优先「全部词命中」（AND），一个有结果都没有时退化成「任一词命中」（OR），
 * 避免「睡眠 周期」这类多词查询直接空手而归。
 * 中文不做分词，直接用子串匹配——对短关键词（如「复利」「睡眠」）效果足够好。
 */
export function searchKnowledge(store, rawQuery, { limit = 6, includeDrafts = false } = {}) {
  const query = String(rawQuery || '').trim();
  if (!query) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  const pool = includeDrafts ? store.allKnowledge() : store.publishedKnowledge();

  const rank = (requireAll) => {
    const scored = [];
    for (const item of pool) {
      const fields = {
        title: String(item.title || '').toLowerCase(),
        tags: item.tags.join(' ').toLowerCase(),
        category: String(item.category || '').toLowerCase(),
        summary: String(item.summary || '').toLowerCase(),
        content: String(item.content || '').toLowerCase(),
      };
      let total = 0;
      let matched = 0;

      for (const term of terms) {
        let score = 0;
        if (fields.title.includes(term)) score += 10;
        if (fields.tags.includes(term)) score += 6;
        if (fields.category.includes(term)) score += 4;
        if (fields.summary.includes(term)) score += 3;
        if (fields.content.includes(term)) score += 1;
        if (score > 0) {
          matched += 1;
          total += score;
        }
      }

      if (matched === 0) continue;
      if (requireAll && matched < terms.length) continue;
      total += Math.min((item.views || 0) / 200, 2);
      scored.push({ item, score: total });
    }
    scored.sort((a, b) => b.score - a.score || b.item.id - a.item.id);
    return scored;
  };

  let scored = rank(true);
  if (scored.length === 0 && terms.length > 1) scored = rank(false);
  return scored.slice(0, limit).map((entry) => entry.item);
}

/** 随机取 n 条，可排除指定 id（避免「随机」总是抽到同一条） */
export function randomKnowledge(store, count = 1, { exclude = [] } = {}) {
  const excluded = new Set(exclude.map(Number));
  const pool = store.publishedKnowledge().filter((item) => !excluded.has(item.id));
  const picked = [];
  const copy = [...pool];
  while (picked.length < count && copy.length > 0) {
    const index = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(index, 1)[0]);
  }
  return picked;
}

/**
 * 挑选今天的推送内容：优先推「最久没推过」的条目，
 * 并尽量让分类不重复，避免每天都是同一种知识。
 */
export function pickForPush(store, count = 3, { category = 'all' } = {}) {
  const pool = store
    .publishedKnowledge()
    .filter((item) => category === 'all' || item.category === category)
    .sort((a, b) => {
      const aTime = a.lastPushedAt ? Date.parse(a.lastPushedAt) : 0;
      const bTime = b.lastPushedAt ? Date.parse(b.lastPushedAt) : 0;
      return aTime - bTime || a.id - b.id;
    });

  const picked = [];
  const usedCategories = new Set();

  // 第一轮：每个分类最多取一条
  for (const item of pool) {
    if (picked.length >= count) break;
    if (usedCategories.has(item.category)) continue;
    picked.push(item);
    usedCategories.add(item.category);
  }
  // 第二轮：分类不够用时，按「最久未推送」补齐
  for (const item of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}

export function summaryOf(item, length = 80) {
  const text = item.summary || stripMarkdown(item.content);
  return truncate(text, length);
}

/**
 * 把 Markdown 正文压成适合微信聊天窗口的纯文本预览：
 * 保留段落与列表的分行，去掉标题符号 / 强调标记 / 链接语法。
 */
export function plainPreview(markdown, maxChars = 240) {
  const lines = String(markdown || '')
    .replace(/```[\s\S]*?```/g, '')
    .split('\n');
  const out = [];
  let total = 0;

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;

    if (/^#{1,6}\s+/.test(line)) line = line.replace(/^#{1,6}\s+/, '');
    else if (/^[-*+]\s+/.test(line)) line = `· ${line.replace(/^[-*+]\s+/, '')}`;
    else if (/^>\s?/.test(line)) line = line.replace(/^>\s?/, '');

    line = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!line) continue;

    if (total + line.length > maxChars) {
      if (out.length === 0) out.push(truncate(line, maxChars));
      break;
    }
    out.push(line);
    total += line.length;
  }

  return out.slice(0, 6).join('\n');
}

/** 单条知识的文本回复（微信聊天窗口里的卡片） */
export function replyCard(item, config) {
  const preview = plainPreview(item.content, 240);
  const parts = [
    `📚 《${item.title}》`,
    '',
    `🏷 ${item.category}${item.tags.length ? ` · ${item.tags.join(' / ')}` : ''}`,
    '',
  ];
  if (preview) parts.push(preview, '');
  parts.push(`👉 阅读全文：${articleUrl(config, item.id)}`);
  return parts.join('\n');
}

/** 多条搜索结果的列表回复 */
export function replyList(items, query) {
  const head = `为你找到 ${items.length} 条与「${truncate(query, 12)}」相关的知识：`;
  const rows = items.map((item, index) => `${index + 1}. 《${item.title}》${item.category ? ` — ${item.category}` : ''}`);
  return [head, '', ...rows, '', '回复序号查看全文，或发送「随机」来一条。'].join('\n');
}
