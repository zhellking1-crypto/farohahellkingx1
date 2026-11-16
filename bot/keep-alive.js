// ─── keep-alive: يمنع الاستضافات المجانية (Render) من إيقاف البوت بسبب الخمول ───
// الطلبات الداخلية (localhost) لا تُعيد ضبط مؤقت الخمول، لذلك نضرب الرابط العام للخدمة.
// إن لم يتوفر رابط عام يبقى الموديول خاملاً (آمن على VPS).
const http = require('http');
const https = require('https');

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const PING_TIMEOUT_MS = 30000;
const DEFAULT_PATH = '/health';

let keepAliveTimer = null;

function resolveTargetUrl(config = {}) {
  const explicit = typeof config.url === 'string' ? config.url.trim() : '';
  if (explicit) return explicit;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  if (process.env.RENDER_EXTERNAL_HOSTNAME) return `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  return '';
}

function buildUrl(base, path) {
  const trimmed = base.replace(/\/+$/, '');
  const suffix = path ? `/${String(path).replace(/^\/+/, '')}` : '';
  return `${trimmed}${suffix}`;
}

function ping(url) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      console.error(`[KAYDO KEEPALIVE] رابط غير صالح "${url}"`);
      resolve(false);
      return;
    }
    const client = parsed.protocol === 'http:' ? http : https;
    const request = client.get(url, { timeout: PING_TIMEOUT_MS }, (res) => {
      res.resume();
      console.log(`[KAYDO KEEPALIVE] 🔄 ping → ${res.statusCode}`);
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (e) => {
      console.log(`[KAYDO KEEPALIVE] ⚠️ ping failed: ${e.message || e}`);
      resolve(false);
    });
  });
}

function startKeepAlive(config = {}) {
  stopKeepAlive();
  if (config.enable === false) return;

  const target = resolveTargetUrl(config);
  if (!target) {
    console.log('[KAYDO KEEPALIVE] لا يوجد رابط عام (RENDER_EXTERNAL_URL أو keepAlive.url) — متوقف');
    return;
  }

  const intervalMs = config.intervalMs > 0 ? config.intervalMs : DEFAULT_INTERVAL_MS;
  const url = buildUrl(target, config.path || DEFAULT_PATH);
  console.log(`[KAYDO KEEPALIVE] 🟢 يعمل كل ${Math.round(intervalMs / 60000)} دقيقة → ${url}`);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await ping(url);
    } finally {
      running = false;
    }
  };

  keepAliveTimer = setInterval(tick, intervalMs);
  keepAliveTimer.unref();
  tick();
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

module.exports = { startKeepAlive, stopKeepAlive, resolveTargetUrl };
