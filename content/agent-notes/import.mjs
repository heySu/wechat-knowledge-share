// 把两期学习笔记写进 wechat-knowledge-share 的知识库（幂等：同名条目走更新）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../../src/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(here, '../../data/db.json');

const ENTRIES = [
  {
    md: '学习笔记-2026-10-31.md',
    title: '学习笔记 ｜ 10 月 31 日 · 把 Agent 拆开看',
    category: 'Agent 学习',
    tags: ['Agent', 'ReAct', '上下文工程', '工具设计', '评估'],
    summary:
      'Agent = 模型 + 工具 + 记忆 + 循环；从 ReAct 循环、上下文预算、工具设计到评估，一次把骨架拆完。',
  },
  {
    md: '学习笔记-2026-11-01.md',
    title: '学习笔记 ｜ 11 月 1 日 · 工具调用的三种翻车方式',
    category: 'Agent 学习',
    tags: ['Agent', '工具调用', '参数校验', 'schema', '失败模式'],
    summary:
      '单步 95 分走十步只剩 60 分；选错工具、参数幻觉、连环调用三种翻车，以及 schema / 运行时 / 提示词三道防线。',
  },
  {
    md: '学习笔记-2026-11-02.md',
    title: '学习笔记 ｜ 11 月 2 日 · 断了还能接着跑',
    category: 'Agent 学习',
    tags: ['Agent', '状态管理', 'checkpoint', '幂等', '长任务'],
    summary:
      '对话是流水账，状态是账本：状态放哪、写什么、怎么恢复，以及一个可以直接抄的 checkpoint 模板。',
  },
  {
    md: '学习笔记-2026-11-03.md',
    title: '学习笔记 ｜ 11 月 3 日 · Agent 的成本账',
    category: 'Agent 学习',
    tags: ['Agent', '成本', 'token', '缓存', '模型分级'],
    summary:
      'Agent 成本是平方量级：步数翻倍成本近四倍。三处最该省的地方——稳定前缀、砍不必要的步数、机械活用便宜模型。',
  },
  {
    md: '学习笔记-2026-11-04.md',
    title: '学习笔记 ｜ 11 月 4 日 · 从 demo 到上线',
    category: 'Agent 学习',
    tags: ['Agent', '权限', '审计', '灰度', '上线'],
    summary:
      'demo 关心能不能做到，上线关心做不到时会怎样：权限分层、审计留痕、灰度刹车，以及上线前必答的十个问题。',
  },
  {
    md: '学习笔记-2026-11-05.md',
    title: '学习笔记 ｜ 11 月 5 日 · 怎么证明它变好了',
    category: 'Agent 学习',
    tags: ['Agent', '评测', '回归测试', 'LLM-as-judge', '指标'],
    summary:
      '没有固定任务集的改动都是在赌：三层指标、20 条真实任务、规则加裁判加抽检的判定，以及能归因的回归对比。',
  },
  {
    md: '学习笔记-2026-11-06.md',
    title: '学习笔记 ｜ 11 月 6 日 · 一张 Agent 落地地图',
    category: 'Agent 学习',
    tags: ['Agent', '方法论', '决策地图', '体检表', '系列收尾'],
    summary:
      '七个阶段一张图，三个「什么时候」的判断，五道题的体检表：目标清楚、路径不清、结果可验，三条都满足才值得上 Agent。',
  },
];

if (!fs.existsSync(dbFile)) throw new Error(`找不到数据文件：${dbFile}`);

// 先备份，再动数据
const backup = dbFile.replace(/\.json$/, `.backup-${new Date().toISOString().slice(0, 10)}.json`);
if (!fs.existsSync(backup)) fs.copyFileSync(dbFile, backup);

const store = new Store(dbFile).load();
const report = [];

for (const entry of ENTRIES) {
  const raw = fs.readFileSync(path.join(here, entry.md), 'utf8').replace(/\r\n?/g, '\n');
  // 去掉正文里的 H1（标题由条目字段提供，避免文章页重复标题）
  const content = raw.replace(/^#\s+[^\n]*\n+/, '').trim() + '\n';

  const existing = store.data.knowledge.find((item) => item.title === entry.title);
  if (existing) {
    store.updateKnowledge(existing.id, {
      category: entry.category,
      tags: entry.tags,
      summary: entry.summary,
      content,
    });
    report.push({ id: existing.id, action: 'updated', title: entry.title, chars: content.length });
  } else {
    const created = store.createKnowledge({ ...entry, content, status: 'published' });
    report.push({ id: created.id, action: 'created', title: entry.title, chars: content.length });
  }
}

console.log(JSON.stringify({ dbFile, backup, report, total: store.data.knowledge.length }, null, 2));
