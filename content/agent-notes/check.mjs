import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(here, '../../data/db.json');
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const items = db.knowledge
  .filter((k) => k.category === 'Agent 学习')
  .sort((a, b) => a.id - b.id);

for (const k of items) {
  console.log(
    [k.id, k.status, String(k.content.length).padStart(5), k.tags.join('/'), k.title].join('  '),
  );
}

console.log('---');
console.log('Agent 学习 条目:', items.length);
console.log('知识库总数:', db.knowledge.length, '| seq.knowledge:', db.seq.knowledge);
const missing = [14, 15, 16, 17, 18, 19, 20].filter((id) => !db.knowledge.some((k) => k.id === id));
console.log('缺失 id:', missing.length ? missing.join(',') : '无');
