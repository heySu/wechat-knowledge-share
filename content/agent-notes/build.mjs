// 把 source*.md 组装成「每日图文」格式：预览页 + 可粘贴的正文 + 知识库用的 Markdown
// 样式完全复用 wechat-knowledge-share 的渲染器，保证和实际推送一致。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../src/markdown.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNT = '知识小站';

const ISSUES = [
  {
    src: 'source-01.md',
    title: '学习笔记 ｜ 10 月 31 日 · 把 Agent 拆开看',
    label: 'Agent 学习笔记 01',
    intro:
      '今天只讲一件事：Agent 凭什么能自己把事干完。约 3200 字，读完 8 分钟；赶时间可以先看文末的「今日三句话」。',
    mdOut: '学习笔记-2026-10-31.md',
    previewOut: 'preview-01.html',
  },
  {
    src: 'source-02.md',
    title: '学习笔记 ｜ 11 月 1 日 · 工具调用的三种翻车方式',
    label: 'Agent 学习笔记 02',
    intro:
      '接着昨天：Agent 为什么常常「答得挺像，事没办成」。约 2200 字，读完 6 分钟；重点看第 5 节的三道防线。',
    mdOut: '学习笔记-2026-11-01.md',
    previewOut: 'preview-02.html',
  },
  {
    src: 'source-03.md',
    title: '学习笔记 ｜ 11 月 2 日 · 断了还能接着跑',
    label: 'Agent 学习笔记 03',
    intro:
      '跑完一次不难，难的是中断之后还能接着跑。约 2100 字，读完 6 分钟；第 6 节有一个可以直接抄的 checkpoint 提示词。',
    mdOut: '学习笔记-2026-11-02.md',
    previewOut: 'preview-03.html',
  },
  {
    src: 'source-04.md',
    title: '学习笔记 ｜ 11 月 3 日 · Agent 的成本账',
    label: 'Agent 学习笔记 04',
    intro:
      '同一个任务，有人花 2 分，有人花 2 块。约 2000 字，读完 5 分钟；第 6 节有一个可以直接用的记账方式。',
    mdOut: '学习笔记-2026-11-03.md',
    previewOut: 'preview-04.html',
  },
  {
    src: 'source-05.md',
    title: '学习笔记 ｜ 11 月 4 日 · 从 demo 到上线',
    label: 'Agent 学习笔记 05',
    intro:
      '前四期讲让它跑对，这期讲怎么让它在真实环境里不闯祸。约 2000 字，读完 6 分钟；第 5 节有十道上线前必答的题。',
    mdOut: '学习笔记-2026-11-04.md',
    previewOut: 'preview-05.html',
  },
  {
    src: 'source-06.md',
    title: '学习笔记 ｜ 11 月 5 日 · 怎么证明它变好了',
    label: 'Agent 学习笔记 06',
    intro:
      '「感觉这次好多了」不是结论。约 2000 字，读完 6 分钟；第 3 节有可以直接抄的任务集结构。',
    mdOut: '学习笔记-2026-11-05.md',
    previewOut: 'preview-06.html',
  },
  {
    src: 'source-07.md',
    title: '学习笔记 ｜ 11 月 6 日 · 一张 Agent 落地地图',
    label: 'Agent 学习笔记 07',
    intro:
      '前六期拉直成一张图：七个阶段、三个判断、一张体检表。约 1600 字，读完 5 分钟，也是整个系列的目录。',
    mdOut: '学习笔记-2026-11-06.md',
    previewOut: 'preview-07.html',
  },
];

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const footerHtml = (issue) =>
  [
    '<hr style="border:none;border-top:1px solid #eee;margin:28px 0 18px;">',
    '<p style="margin:0;font-size:13px;line-height:1.9;color:#9a9a9a;">',
    '喜欢今天的内容，点个「在看」；回复「agent」可以随时取回这一期的完整清单。<br>',
    `—— ${ACCOUNT}　每日一篇，把 Agent 拆开看`,
    '</p>',
  ].join('');

function build(issue) {
  const raw = fs
    .readFileSync(path.join(here, issue.src), 'utf8')
    .replace(/\r\n?/g, '\n');

  const parts = raw.split(/^::: (.+)$/m);
  parts.shift();
  const sections = [];
  for (let i = 0; i < parts.length; i += 2) {
    sections.push({ label: parts[i].trim(), md: parts[i + 1].replace(/^\n+/, '').trimEnd() });
  }

  const sectionHtml = sections
    .map(
      ({ label, md }) =>
        '<section style="margin:0 0 26px;">' +
        `<p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;color:#07c160;font-weight:700;">${escapeHtml(label)}</p>` +
        renderMarkdown(md) +
        '</section>',
    )
    .join('<hr style="border:none;border-top:1px dashed #e6e6e6;margin:28px 0;">');

  const introHtml =
    '<section style="padding:2px 0 8px;">' +
    `<p style="margin:0 0 6px;font-size:13px;color:#8a8a8a;">${ACCOUNT} · ${escapeHtml(issue.label)}</p>` +
    `<p style="margin:0 0 22px;font-size:15px;line-height:1.8;color:#666;">${escapeHtml(issue.intro)}</p>` +
    '</section>';

  const content = introHtml + sectionHtml + footerHtml(issue);

  const preview = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(issue.title)}</title>
<style>
body{margin:0;background:#f2f3f5;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}
.phone{max-width:420px;margin:0 auto;background:#fff;min-height:100vh;padding:22px 20px 40px;box-sizing:border-box;}
.meta{font-size:13px;color:#8a8a8a;margin-bottom:6px}
h1{font-size:22px;line-height:1.5;margin:0 0 6px}
</style></head><body><div class="phone">
<p class="meta">${ACCOUNT}</p>
<h1>${escapeHtml(issue.title)}</h1>
${content}
</div></body></html>`;

  const knowledgeMd =
    ('# ' + issue.title + '\n\n' + raw.replace(/^:::.+$/gm, ''))
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n';

  fs.writeFileSync(path.join(here, issue.previewOut), preview, 'utf8');
  fs.writeFileSync(path.join(here, issue.mdOut), knowledgeMd, 'utf8');

  const plain = knowledgeMd.replace(/[#>*`~-]/g, ' ').replace(/\s+/g, '');
  return {
    src: issue.src,
    md: issue.mdOut,
    sections: sections.length,
    chars: plain.length,
    titleChars: [...issue.title].length,
  };
}

console.log(JSON.stringify(ISSUES.map(build), null, 2));
