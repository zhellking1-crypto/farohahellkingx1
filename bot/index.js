// ─── kaydo — محرك البوت: لا يفصل أبداً ولا يفقد الكوكيز ───
// أهم درس من GoatBot-Pro: أخطاء الاتصال المؤقتة (MQTT/شبكة) لا تستدعي
// إعادة تسجيل دخول — لأن تكرار الدخول من نفس الآي بي هو ما يفتعل حظر
// الكوكيز. إعادة الدخول فقط عند موت الجلسة فعلاً (فحص mbasic).
let botApi = null;
let msgEmitter = null;
let isRestarting = false;
let reconnectAttempts = 0;
let heartbeatInterval = null;
let sessionExpired = false;

process.on('uncaughtException', (err) => {
  console.error('[KAYDO] 🔴 خطأ غير متوقع:', err && err.message ? err.message : String(err));
  console.log('[KAYDO] 🟢 استمرار... إعادة الاتصال خلال 10 ثواني');
  scheduleRestart(10000);
});

process.on('unhandledRejection', (reason) => {
  console.error('[KAYDO] 🔴 وعد غير معالج:', reason && reason.message ? reason.message : String(reason));
  console.log('[KAYDO] 🟢 استمرار...');
});

process.on('SIGTERM', () => {
  console.log('[KAYDO] ⚠️ استلمت SIGTERM — البوت يتجاهلها ويكمل');
});

process.on('SIGHUP', () => {
  console.log('[KAYDO] ⚠️ استلمت SIGHUP — البوت يتجاهلها ويكمل');
});

const fs = require('fs');
const path = require('path');
const express = require('express');
const { login } = require('ws3-fca');
const { loadCommands, handleMessage, handleEvent, commands } = require('./main');
const {
  startCookieManager,
  stopCookieManager,
  saveAppState,
  getCookieStatus,
  restoreBackupIfMainMissing,
  USER_AGENT,
} = require('./cookie-manager');

const PORT = process.env.PORT || 3000;
const app = express();

// UserAgent ثابت لكل الاتصالات — تغيّر الجهاز المفاجئ هو ما يطلق حماية فيسبوك
process.env.UA = USER_AGENT;

app.get('/', (req, res) => {
  res.json({
    status: botApi ? '🟢 kaydo يعمل' : '🔴 جاري إعادة الاتصال...',
    bot: 'kaydo',
    loggedIn: !!botApi,
    uptime: Math.floor(process.uptime()) + ' ثانية',
    reconnectAttempts,
    sessionExpired,
    cookies: getCookieStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/ping', (req, res) => res.send('pong - kaydo حي ويعمل'));

app.get('/cookies', (req, res) => {
  res.json(getCookieStatus());
});

app.get('/testsend', async (req, res) => {
  const threadID = req.query.thread;
  if (!threadID || !botApi) return res.status(400).json({ error: 'bot not ready' });
  try {
    await botApi.sendMessage('💀 تجريبة إرسال', threadID);
    res.json({ success: true, threadID });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/updatecookies', express.json(), (req, res) => {
  const appstatePath = path.join(__dirname, 'appstate.json');
  try {
    const cookies = req.body;
    if (!Array.isArray(cookies) || cookies.length === 0)
      return res.status(400).json({ error: 'Invalid cookies format.' });
    const tmpPath = appstatePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(cookies, null, 2));
    fs.renameSync(tmpPath, appstatePath);
    console.log('[KAYDO] ✅ تم تحديث الكوكيز عبر HTTP');
    res.json({ success: true, message: 'Cookies updated. Reconnecting...' });
    sessionExpired = true;
    scheduleRestart(3000);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[KAYDO] 🌐 خادم Uptime يعمل على المنفذ ${PORT}`);
});

// ─── Heartbeat كل 30 ثانية ───
function startHeartbeat(api) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    try {
      if (api && api.getCurrentUserID) {
        api.getCurrentUserID();
        console.log('[KAYDO] 💓 Heartbeat');
      }
    } catch (e) {
      console.error('[KAYDO] ⚠️ Heartbeat failed:', e.message);
    }
  }, 30000);
}

// ─── تنظيف الذاكرة كل 10 دقائق ───
function startMemorySweeper(api) {
  setInterval(() => {
    try {
      if (api && api._msgQueue && Array.isArray(api._msgQueue)) api._msgQueue = [];
      if (api && api._messageCache) {
        const keys = Object.keys(api._messageCache);
        if (keys.length > 50) keys.slice(0, keys.length - 50).forEach(k => delete api._messageCache[k]);
      }
      if (api && api._threadCache) {
        const keys = Object.keys(api._threadCache);
        if (keys.length > 20) keys.slice(0, keys.length - 20).forEach(k => delete api._threadCache[k]);
      }
      if (typeof global.gc === 'function') global.gc();
      console.log('[KAYDO] 🟢 تنظيف الذاكرة');
    } catch (e) {}
  }, 10 * 60 * 1000);
}

// ─── المحرك الرئيسي ───
function startBot() {
  if (isRestarting) return;

  restoreBackupIfMainMissing();

  const appstatePath = path.join(__dirname, 'appstate.json');

  if (!fs.existsSync(appstatePath)) {
    console.error('[KAYDO] ❌ appstate.json غير موجود — إعادة المحاولة بعد 30 ثانية');
    setTimeout(startBot, 30000);
    return;
  }

  let appstate;
  try {
    appstate = JSON.parse(fs.readFileSync(appstatePath, 'utf8'));
  } catch (e) {
    console.error('[KAYDO] ❌ خطأ في قراءة appstate.json:', e.message, '— إعادة بعد 30 ثانية');
    setTimeout(startBot, 30000);
    return;
  }

  console.log('[KAYDO] 🚀 جاري تسجيل الدخول...');

  login(
    { appState: appstate, userAgent: USER_AGENT },
    {
      listenEvents: true,
      selfListen: false,
      autoMarkDelivery: false,
      autoMarkRead: false,
      forceLogin: false,
      autoReconnect: true,
      online: true,
      userAgent: USER_AGENT,
      // لا يعيد تسجيل الدخول تلقائياً عند أي خطأ — نقرر نحن متى نعيد
      autoLogin: false,
    },
    (err, api) => {
      if (err) {
        const errStr = JSON.stringify(err);
        console.error('[KAYDO] ❌ فشل تسجيل الدخول:', errStr);
        const errMsg = String(err.message || err.error || errStr);

        if (errMsg.includes('retrieving userID') || errMsg.includes('blocked') || errMsg.includes('unknown location') || errMsg.includes('checkpoint')) {
          console.log('[KAYDO] 🔴 checkpoint أو حظر — إعادة بعد 5 دقائق (بدون تكرار سريع حتى لا يزداد الحظر)');
          isRestarting = false;
          setTimeout(startBot, 5 * 60 * 1000);
          return;
        }

        reconnectAttempts++;
        const delay = Math.min(15000 * reconnectAttempts, 120000);
        console.log(`[KAYDO] ⏳ إعادة بعد ${delay / 1000}ث (محاولة ${reconnectAttempts})`);
        isRestarting = false;
        setTimeout(startBot, delay);
        return;
      }

      console.log('[KAYDO] ✅ تم تسجيل الدخول!');
      isRestarting = false;
      reconnectAttempts = 0;
      sessionExpired = false;
      botApi = api;

      // حفظ فوري وآمن للكوكيز المحدثة
      saveAppState(api, 'بعد تسجيل الدخول');

      const ctx = api.ctx;
      if (ctx && ctx.lastSeqId) {
        ctx.firstListen = true;
        console.log(`[KAYDO] 🔑 Sequence ID: ${ctx.lastSeqId}`);
      }

      loadCommands();
      startListening(api);
      startHeartbeat(api);
      startMemorySweeper(api);
      startCookieManager(api, {
        onExpire: () => {
          // موت الجلسة فقط هو ما يستدعي إعادة دخول كاملة
          sessionExpired = true;
          scheduleRestart(5000);
        },
      });

      try {
        const qasf = commands.get('قصف');
        if (qasf && qasf.resumeAll) qasf.resumeAll(api);
      } catch (e) {
        console.error('[KAYDO] خطأ في استئناف الحمايات:', e.message);
      }

      console.log('[KAYDO] 🤖 بوت "kaydo" يعمل — لا يفصل أبداً');
    }
  );
}

// ─── مستمع الأحداث ───
async function startListening(api) {
  try {
    const callback = (err, event) => {
      if (err) {
        console.error('[KAYDO] ⚠️ خطأ في الاستماع:', JSON.stringify(err));
        const errMsg = String(err.message || err.error || err);

        // درس GoatBot-Pro: انقطاع MQTT المؤقت ليس موت جلسة.
        // إعادة الدخول الكاملة هنا هي ما يفتعل حظر الكوكيز.
        if (
          errMsg.includes('Connection refused') ||
          errMsg.includes('Server unavailable') ||
          errMsg.includes('ECONNRESET') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('network')
        ) {
          console.log('[KAYDO] 🟡 انقطاع مؤقت — autoReconnect سيعيد الاتصال، بدون إعادة دخول');
          return;
        }

        if (errMsg.includes('Not logged in') || errMsg.includes('sequence ID') || errMsg.includes('appstate') || errMsg.includes('Failed to get')) {
          sessionExpired = true;
          scheduleRestart(15000);
        } else {
          scheduleRestart(5000);
        }
        return;
      }

      if (!event) return;
      try {
        const type = event.type || 'unknown';
        const threadID = String(event.threadID || '');
        const senderID = String(event.senderID || '');
        const body = (event.body || '').substring(0, 50);
        if (type !== 'typ' && type !== 'read_receipt') {
          console.log(`[KAYDO] 📩 type=${type} thread=${threadID} sender=${senderID} body="${body}"`);
        }
        if (type === 'message' || type === 'message_reply') {
          handleMessage(api, event);
        } else {
          handleEvent(api, event);
        }
      } catch (e) {
        console.error('[KAYDO] ⚠️ خطأ في معالجة الحدث:', e.message);
      }
    };

    msgEmitter = await api.listenMqtt(callback);
    console.log('[KAYDO] 👂 البوت يستمع...');
  } catch (e) {
    console.error('[KAYDO] ❌ استثناء في startListening:', e.message);
    scheduleRestart(10000);
  }
}

// ─── جدولة إعادة الاتصال ───
function scheduleRestart(delay) {
  if (isRestarting) return;
  isRestarting = true;

  try { if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; } } catch (e) {}
  try { if (msgEmitter && typeof msgEmitter.stop === 'function') msgEmitter.stop(); } catch (e) {}
  try {
    const pin = commands.get('تثبيت');
    if (pin && pin.stopAll) pin.stopAll();
  } catch (e) {}
  try { stopCookieManager(); } catch (e) {}

  msgEmitter = null;
  botApi = null;

  reconnectAttempts++;
  const actualDelay = Math.min(delay * Math.max(reconnectAttempts, 1), 120000);
  console.log(`[KAYDO] ⏳ إعادة الاتصال بعد ${actualDelay / 1000}ث (محاولة ${reconnectAttempts})`);

  setTimeout(() => {
    isRestarting = false;
    startBot();
  }, actualDelay);
}

startBot();
