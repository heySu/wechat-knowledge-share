import path from 'node:path';
import { applyOverrides, loadConfig } from './config.js';
import { SEED_KNOWLEDGE } from './seed-data.js';
import { createScheduler } from './services/scheduler.js';
import { createServer } from './server.js';
import { Store } from './store.js';
import { WechatClient } from './wechat/client.js';

const logger = console;
const config = loadConfig();
const store = new Store(path.join(config.dataDir, 'db.json')).load();

// 后台「设置」里保存的覆盖项优先级最高
applyOverrides(config, store.data.configOverrides);

// 首次启动灌入示例知识，方便直接看到效果
if (store.allKnowledge().length === 0 && String(process.env.SEED || 'on').toLowerCase() !== 'off') {
  for (const item of SEED_KNOWLEDGE) store.createKnowledge(item);
  logger.log(`[init] 已写入 ${SEED_KNOWLEDGE.length} 条示例知识，可在后台修改或删除`);
}

const client = new WechatClient(config, { logger });
const server = createServer({ config, store, client, logger });
const scheduler = createScheduler({ store, client, config, logger });

server.listen(config.port, config.host, () => {
  const base = config.publicBaseUrl || `http://localhost:${config.port}`;
  config.publicBaseUrl = base;

  logger.log('');
  logger.log('  知识订阅号后台已启动');
  logger.log(`  前台站点   ${base}/`);
  logger.log(`  管理后台   ${base}/admin`);
  logger.log(`  公众号回调 ${base}/wechat`);
  logger.log(`  运行模式   ${config.mode === 'live' ? '真实模式（会调用微信接口）' : '模拟模式（不请求微信服务器）'}`);
  logger.log(`  每日推送   ${config.pushTime} · 每次 ${config.pushCount} 条`);
  logger.log(`  数据文件   ${path.join(config.dataDir, 'db.json')}`);
  logger.log('');

  if (config.mode === 'live' && config.adminPassword === 'admin123') {
    logger.warn('  ⚠ 当前仍是默认后台密码 admin123，请立刻在 .env 中修改 ADMIN_PASSWORD');
  }
  scheduler.start();
});

function shutdown(signal) {
  logger.log(`\n[${signal}] 正在关闭…`);
  scheduler.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
