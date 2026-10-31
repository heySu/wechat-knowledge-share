import { dateKeyInZone, minutesOf, timeKeyInZone } from '../util.js';
import { pushDaily } from './publisher.js';

/**
 * 每日定时推送。
 * 不用 cron 表达式（订阅号一天只推一次），每 20 秒轮询一次「今天是否已过推送时间」，
 * 用 settings.lastPushDate 做幂等，进程重启也不会重复推送。
 */
export function createScheduler({ store, client, config, logger = console }) {
  let timer = null;
  let running = false;

  async function tick() {
    if (running) return null;
    const now = new Date();
    const today = dateKeyInZone(now, config.timeZone);
    const nowMinutes = minutesOf(timeKeyInZone(now, config.timeZone));
    const targetMinutes = minutesOf(config.pushTime);

    if (nowMinutes < targetMinutes) return null;
    if (store.data.settings.lastPushDate === today) return null;

    running = true;
    try {
      const result = await pushDaily({
        store,
        client,
        config,
        count: config.pushCount,
        trigger: 'schedule',
      });
      logger.log(
        `[scheduler] ${today} 自动推送完成：${result.status}${result.error ? `（${result.error}）` : ''}`,
      );
      return result;
    } catch (err) {
      logger.error('[scheduler] 自动推送异常：', err);
      return null;
    } finally {
      running = false;
    }
  }

  return {
    start(intervalMs = 20_000) {
      if (timer) return;
      timer = setInterval(() => {
        tick().catch(() => {});
      }, intervalMs);
      timer.unref?.();
      tick().catch(() => {});
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    runNow: tick,
  };
}

/** 给后台展示「下次推送时间」 */
export function describeSchedule(config, now = new Date()) {
  const today = dateKeyInZone(now, config.timeZone);
  const nowMinutes = minutesOf(timeKeyInZone(now, config.timeZone));
  const target = minutesOf(config.pushTime);
  if (nowMinutes < target) return `今天 ${config.pushTime}（${today}）`;
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return `明天 ${config.pushTime}（${dateKeyInZone(tomorrow, config.timeZone)}）`;
}
