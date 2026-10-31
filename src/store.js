import fs from 'node:fs';
import path from 'node:path';
import { normalizeTags, nowIso } from './util.js';

const MESSAGE_LIMIT = 300;
const PUSH_LIMIT = 100;
const KEYWORD_LIMIT = 300;

function blankData() {
  return {
    version: 1,
    seq: { knowledge: 0 },
    knowledge: [],
    subscribers: {},
    sessions: {},
    messages: [],
    pushes: [],
    keywordHits: {},
    settings: { lastPushDate: null, lastPushAt: null, lastPushTitle: null },
    configOverrides: {},
  };
}

/**
 * 单文件 JSON 存储。
 * 知识条目的量级（几千条以内）完全扛得住，而且备份就是复制一个文件；
 * 如需换 MySQL / SQLite，只要替换本类对外暴露的方法即可。
 */
export class Store {
  constructor(file) {
    this.file = file;
    this.data = blankData();
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) {
      const raw = fs.readFileSync(this.file, 'utf8');
      try {
        this.data = JSON.parse(raw);
      } catch (err) {
        throw new Error(`数据文件解析失败：${this.file}\n${err.message}`);
      }
    }
    this.#migrate();
    this.save();
    return this;
  }

  #migrate() {
    const base = blankData();
    for (const key of Object.keys(base)) {
      if (this.data[key] === undefined) this.data[key] = base[key];
    }
    for (const key of Object.keys(base.seq)) {
      if (typeof this.data.seq[key] !== 'number') this.data.seq[key] = 0;
    }
    for (const item of this.data.knowledge) {
      item.tags = normalizeTags(item.tags);
      item.views = Number(item.views) || 0;
      item.pushCount = Number(item.pushCount) || 0;
      item.cover = item.cover || '';
      item.summary = item.summary || '';
    }
  }

  /** 原子写入：先写临时文件再 rename，避免进程中断写坏数据 */
  save() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  nextId(key) {
    this.data.seq[key] = (Number(this.data.seq[key]) || 0) + 1;
    return this.data.seq[key];
  }

  // ── 知识库 ────────────────────────────────────────────
  allKnowledge() {
    return this.data.knowledge;
  }

  publishedKnowledge() {
    return this.data.knowledge.filter((item) => item.status === 'published');
  }

  findKnowledge(id) {
    return this.data.knowledge.find((item) => item.id === Number(id)) || null;
  }

  createKnowledge(input = {}) {
    const now = nowIso();
    const item = {
      id: this.nextId('knowledge'),
      title: String(input.title || '').trim(),
      category: String(input.category || '未分类').trim() || '未分类',
      tags: normalizeTags(input.tags),
      summary: String(input.summary || '').trim(),
      content: String(input.content || ''),
      cover: String(input.cover || '').trim(),
      status: input.status === 'draft' ? 'draft' : 'published',
      views: 0,
      pushCount: 0,
      lastPushedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    if (!item.title) throw new Error('标题不能为空');
    this.data.knowledge.unshift(item);
    this.save();
    return item;
  }

  updateKnowledge(id, patch = {}) {
    const item = this.findKnowledge(id);
    if (!item) return null;
    if (patch.title !== undefined) {
      const title = String(patch.title).trim();
      if (!title) throw new Error('标题不能为空');
      item.title = title;
    }
    if (patch.category !== undefined) item.category = String(patch.category).trim() || '未分类';
    if (patch.tags !== undefined) item.tags = normalizeTags(patch.tags);
    if (patch.summary !== undefined) item.summary = String(patch.summary).trim();
    if (patch.content !== undefined) item.content = String(patch.content);
    if (patch.cover !== undefined) item.cover = String(patch.cover).trim();
    if (patch.status !== undefined) item.status = patch.status === 'draft' ? 'draft' : 'published';
    item.updatedAt = nowIso();
    this.save();
    return item;
  }

  deleteKnowledge(id) {
    const index = this.data.knowledge.findIndex((item) => item.id === Number(id));
    if (index === -1) return false;
    this.data.knowledge.splice(index, 1);
    this.save();
    return true;
  }

  touchView(id) {
    const item = this.findKnowledge(id);
    if (!item) return;
    item.views += 1;
    this.save();
  }

  /** 推送成功后回写状态，下一轮优先推送更久没出现过的条目 */
  markPushed(ids, dateKey = null) {
    const at = nowIso();
    for (const id of ids) {
      const item = this.findKnowledge(id);
      if (!item) continue;
      item.pushCount += 1;
      item.lastPushedAt = at;
    }
    this.data.settings.lastPushAt = at;
    this.data.settings.lastPushDate = dateKey || at.slice(0, 10);
    this.save();
  }

  categories() {
    const set = new Set();
    for (const item of this.data.knowledge) if (item.category) set.add(item.category);
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }

  // ── 订阅者与消息 ──────────────────────────────────────
  trackSubscriber(openid, { isNew = false } = {}) {
    if (!openid) return null;
    const now = nowIso();
    const existing = this.data.subscribers[openid];
    if (!existing) {
      this.data.subscribers[openid] = { firstSeenAt: now, lastSeenAt: now, msgCount: 1 };
      this.save();
      return this.data.subscribers[openid];
    }
    existing.lastSeenAt = now;
    existing.msgCount = (existing.msgCount || 0) + 1;
    if (isNew) existing.firstSeenAt = now;
    this.save();
    return existing;
  }

  subscriberCount() {
    return Object.keys(this.data.subscribers).length;
  }

  recordMessage(entry) {
    const message = { id: this.nextId('message'), at: nowIso(), ...entry };
    this.data.messages.unshift(message);
    if (this.data.messages.length > MESSAGE_LIMIT) {
      this.data.messages.length = MESSAGE_LIMIT;
    }
    this.save();
    return message;
  }

  recentMessages(limit = 30) {
    return this.data.messages.slice(0, limit);
  }

  recordKeywordHits(keywords = []) {
    const hits = this.data.keywordHits;
    for (const raw of keywords) {
      const key = String(raw || '').trim().toLowerCase();
      if (!key || key.length > 24) continue;
      hits[key] = (hits[key] || 0) + 1;
    }
    const keys = Object.keys(hits);
    if (keys.length > KEYWORD_LIMIT) {
      keys
        .sort((a, b) => hits[a] - hits[b])
        .slice(0, keys.length - KEYWORD_LIMIT)
        .forEach((key) => delete hits[key]);
    }
    this.save();
  }

  topKeywords(limit = 10) {
    return Object.entries(this.data.keywordHits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([keyword, count]) => ({ keyword, count }));
  }

  // ── 会话（记住用户上一次的搜索结果，用于「回复序号」） ──
  getSession(openid) {
    return this.data.sessions[openid] || null;
  }

  setSession(openid, session) {
    if (!openid) return;
    this.data.sessions[openid] = { ...session, at: nowIso() };
    this.save();
  }

  // ── 推送记录 ──────────────────────────────────────────
  addPush(record) {
    const push = { id: this.nextId('push'), at: nowIso(), ...record };
    this.data.pushes.unshift(push);
    if (this.data.pushes.length > PUSH_LIMIT) this.data.pushes.length = PUSH_LIMIT;
    this.save();
    return push;
  }

  recentPushes(limit = 10) {
    return this.data.pushes.slice(0, limit);
  }

  // ── 统计 ──────────────────────────────────────────────
  stats() {
    const knowledge = this.data.knowledge;
    return {
      total: knowledge.length,
      published: knowledge.filter((item) => item.status === 'published').length,
      drafts: knowledge.filter((item) => item.status === 'draft').length,
      views: knowledge.reduce((sum, item) => sum + (item.views || 0), 0),
      subscribers: this.subscriberCount(),
      messages: this.data.messages.length,
      pushes: this.data.pushes.length,
      lastPush: this.data.settings.lastPushAt,
      lastPushDate: this.data.settings.lastPushDate,
    };
  }
}
