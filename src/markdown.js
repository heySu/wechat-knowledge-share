import { escapeHtml } from './util.js';

/**
 * 轻量 Markdown → 微信友好 HTML 渲染器。
 * 公众号图文只认行内样式（<style> 标签会被过滤），所以这里所有样式都写成 style="..."。
 */

const S = {
  h1: 'font-size:22px;font-weight:700;line-height:1.5;margin:32px 0 14px;color:#111;',
  h2: 'font-size:20px;font-weight:700;line-height:1.5;margin:30px 0 12px;color:#111;',
  h3: 'font-size:18px;font-weight:700;line-height:1.5;margin:26px 0 10px;color:#111;',
  h4: 'font-size:16px;font-weight:700;line-height:1.5;margin:22px 0 10px;color:#222;',
  p: 'margin:0 0 18px;font-size:16px;line-height:1.9;color:#333;letter-spacing:.2px;',
  quote:
    'margin:0 0 18px;padding:12px 16px;border-left:3px solid #07c160;background:#f5fbf7;color:#4c5a52;font-size:15px;line-height:1.85;border-radius:4px;',
  list: 'margin:0 0 18px;padding-left:24px;font-size:16px;line-height:1.9;color:#333;',
  pre: 'background:#282c34;color:#e8eaed;padding:14px 16px;border-radius:8px;overflow-x:auto;margin:0 0 18px;font-size:13px;line-height:1.65;',
  code: 'background:#f2f3f5;color:#c7254e;padding:2px 5px;border-radius:4px;font-size:14px;font-family:Menlo,Consolas,monospace;',
  a: 'color:#07c160;text-decoration:none;border-bottom:1px solid rgba(7,193,96,.35);',
  img: 'display:block;max-width:100%;height:auto;margin:0 auto 18px;border-radius:8px;',
  hr: 'border:none;border-top:1px solid #ececec;margin:28px 0;',
  strong: 'font-weight:700;color:#111;',
};

function safeUrl(url) {
  const value = String(url || '').trim();
  if (/^(https?:\/\/|\/\/|\/|#|mailto:)/i.test(value)) return escapeHtml(value);
  return '#';
}

/** 行内语法：代码、图片、链接、粗体、斜体、删除线 */
export function renderInline(text) {
  const codes = [];
  let out = escapeHtml(text).replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, src) => {
    return `<img src="${safeUrl(src)}" alt="${alt}" style="${S.img}">`;
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, href) => {
    return `<a href="${safeUrl(href)}" style="${S.a}">${label}</a>`;
  });

  out = out.replace(/\*\*([^*\n]+)\*\*/g, `<strong style="${S.strong}">$1</strong>`);
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  out = out.replace(/\u0000(\d+)\u0000/g, (_, index) => {
    return `<code style="${S.code}">${codes[Number(index)]}</code>`;
  });
  return out;
}

const startsBlock = (line) =>
  /^(#{1,6}\s|```|>\s?|\s*[-*+]\s+|\s*\d+[.)]\s+|(\s*([-*_])\s*){3,}$)/.test(line);

/**
 * @param {string} source Markdown 文本
 * @param {{ base?: string }} [options] base 用于把相对链接补成绝对地址（公众号里必须绝对路径）
 */
export function renderMarkdown(source, options = {}) {
  const base = String(options.base || '').replace(/\/+$/, '');
  const text = String(source ?? '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const html = [];
  let i = 0;

  const abs = (url) => {
    const value = String(url || '');
    if (base && value.startsWith('/') && !value.startsWith('//')) return base + value;
    return value;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 代码块
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      i += 1;
      const buffer = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buffer.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结束的 ```
      html.push(
        `<pre style="${S.pre}"><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(buffer.join('\n'))}</code></pre>`,
      );
      continue;
    }

    // 标题
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      html.push(`<h${level} style="${S[`h${level}`]}">${renderInline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    // 分隔线
    if (/^(\s*([-*_])\s*){3,}$/.test(line)) {
      html.push(`<hr style="${S.hr}">`);
      i += 1;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buffer = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buffer.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote style="${S.quote}">${buffer.map((row) => renderInline(row)).join('<br>')}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      html.push(
        `<ul style="${S.list}">${items
          .map((item) => `<li style="margin:0 0 6px;">${renderInline(item)}</li>`)
          .join('')}</ul>`,
      );
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      html.push(
        `<ol style="${S.list}">${items
          .map((item) => `<li style="margin:0 0 6px;">${renderInline(item)}</li>`)
          .join('')}</ol>`,
      );
      continue;
    }

    // 独立图片：![alt](src)
    const imageOnly = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line.trim());
    if (imageOnly) {
      html.push(
        `<img src="${safeUrl(abs(imageOnly[2]))}" alt="${escapeHtml(imageOnly[1])}" style="${S.img}">`,
      );
      i += 1;
      continue;
    }

    // 普通段落：连续的普通行用 <br> 连接
    const buffer = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      buffer.push(lines[i]);
      i += 1;
    }
    html.push(`<p style="${S.p}">${buffer.map((row) => renderInline(row)).join('<br>')}</p>`);
  }

  return html.join('\n');
}

/** 去掉 Markdown 标记，供摘要 / 纯文本场景使用 */
export function stripMarkdown(source) {
  return String(source ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
