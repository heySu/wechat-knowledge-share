/**
 * 微信消息使用扁平的 XML（图文消息回复里才有嵌套的 <item>）。
 * 这里实现一个够用的极简解析器 + 构造函数，避免引入 xml2js 之类的依赖。
 */

const TOKEN_RE =
  /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:"[^"]*"|'[^']*'|[^>'"])*?)(\/?)>|([^<]+)/g;

function decodeEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function toValue(node, raw) {
  if (node.children.length > 0) {
    const obj = {};
    for (const child of node.children) {
      const value = toValue(child, child.text);
      if (obj[child.name] === undefined) obj[child.name] = value;
      else if (Array.isArray(obj[child.name])) obj[child.name].push(value);
      else obj[child.name] = [obj[child.name], value];
    }
    const text = String(raw || '').trim();
    if (text) obj['#text'] = text;
    return obj;
  }
  return decodeEntities(String(raw || '')).trim();
}

/** XML 文本 → 普通对象 */
export function parseXml(source) {
  const text = String(source || '');
  const root = { name: '#root', children: [], text: '' };
  const stack = [root];
  let match;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const [, cdata, closeName, openName, , selfClose, rawText] = match;
    const parent = stack[stack.length - 1];

    if (cdata !== undefined) {
      parent.text += cdata;
      continue;
    }
    if (closeName) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (openName) {
      const node = { name: openName, children: [], text: '' };
      parent.children.push(node);
      if (!selfClose) stack.push(node);
      continue;
    }
    if (rawText !== undefined) {
      parent.text += rawText;
    }
  }

  return root.children.length > 0 ? toValue(root.children[0], root.children[0].text) : {};
}

/** 构造文本回复 */
export function buildTextReply({ toUser, fromUser, content, createTime = Math.floor(Date.now() / 1000) }) {
  return [
    '<xml>',
    `<ToUserName><![CDATA[${cdata(toUser)}]]></ToUserName>`,
    `<FromUserName><![CDATA[${cdata(fromUser)}]]></FromUserName>`,
    `<CreateTime>${createTime}</CreateTime>`,
    '<MsgType><![CDATA[text]]></MsgType>',
    `<Content><![CDATA[${cdata(content)}]]></Content>`,
    '</xml>',
  ].join('');
}

/** 构造图文（news）回复 */
export function buildNewsReply({ toUser, fromUser, articles, createTime = Math.floor(Date.now() / 1000) }) {
  const items = articles
    .map(
      (article) => [
        '<item>',
        `<Title><![CDATA[${cdata(article.title)}]]></Title>`,
        `<Description><![CDATA[${cdata(article.description || '')}]]></Description>`,
        `<PicUrl><![CDATA[${cdata(article.picUrl || '')}]]></PicUrl>`,
        `<Url><![CDATA[${cdata(article.url)}]]></Url>`,
        '</item>',
      ].join(''),
    )
    .join('');
  return [
    '<xml>',
    `<ToUserName><![CDATA[${cdata(toUser)}]]></ToUserName>`,
    `<FromUserName><![CDATA[${cdata(fromUser)}]]></FromUserName>`,
    `<CreateTime>${createTime}</CreateTime>`,
    '<MsgType><![CDATA[news]]></MsgType>',
    `<ArticleCount>${articles.length}</ArticleCount>`,
    `<Articles>${items}</Articles>`,
    '</xml>',
  ].join('');
}

/** CDATA 里不能出现 "]]>"，拆开后仍是合法 XML */
export function cdata(value) {
  return String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
}

/** 从回复 XML 里取出纯文本，供后台「回复调试」展示 */
export function extractReplyText(xml) {
  const parsed = parseXml(xml);
  if (parsed.MsgType === 'text') return String(parsed.Content || '');
  if (parsed.MsgType === 'news') {
    const articles = parsed.Articles?.item;
    const list = Array.isArray(articles) ? articles : articles ? [articles] : [];
    return list.map((item) => `【${item.Title}】${item.Description || ''}`).join('\n');
  }
  return '';
}
