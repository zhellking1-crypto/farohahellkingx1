// kaydo — تكرار رسالة كل X ثانية في نفس المحادثة
// kaydo الرسالة عدد_الثواني  → تشغيل
// kaydo off                  → إيقاف

const MIN_INTERVAL_SECONDS = 5;
const MAX_INTERVAL_SECONDS = 86400; // يوم كامل

const activeLoops = new Map(); // threadID -> { message, intervalMs, running }

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCommand(body) {
  const text = body.trim().replace(/^[kK][aA][yY][dD][oO]/, "kaydo");
  if (/^kaydo\s*(off|ايقاف|إيقاف)?$/iu.test(text)) {
    if (text === "kaydo") return null; // kaydo بدون شيء → رسالة الاستخدام
    return { action: "off" };
  }

  const match = text.match(/^kaydo\s+(.+)\s+(\d+)\s*$/u);
  if (!match) return null;

  const message = match[1].trim();
  const seconds = parseInt(match[2], 10);
  if (!message) return null;
  if (seconds < MIN_INTERVAL_SECONDS || seconds > MAX_INTERVAL_SECONDS) {
    return { action: "invalid", seconds };
  }
  return { action: "start", message, seconds };
}

async function loop(api, threadID) {
  const state = activeLoops.get(threadID);
  if (!state) return;
  const { message, intervalMs } = state;

  while (state.running) {
    try {
      await api.sendMessage(message, threadID);
      console.log(`[kaydo] 📤 أُرسلت الرسالة إلى ${threadID} — التكرار كل ${intervalMs / 1000}ث`);
    } catch (e) {
      console.error("[kaydo] خطأ في الإرسال:", e.message || e);
    }
    await sleep(intervalMs);
  }
}

module.exports = {
  name: "kaydo",

  async execute(api, event) {
    const threadID = String(event.threadID);
    const body = (event.body || "").trim();
    const parsed = parseCommand(body);

    if (!parsed) {
      await api.sendMessage(
        "𝑲𝑨𝒀𝑫𝑶 ✦ طريقة الاستخدام:\n" +
          "kaydo الرسالة عدد_الثواني\n\n" +
          "مثال: kaydo صباح الخير 120\n\n" +
          "للإيقاف: kaydo off",
        threadID,
      );
      return;
    }

    if (parsed.action === "invalid") {
      await api.sendMessage(
        `⚠️ الفاصل الزمني يجب أن يكون بين ${MIN_INTERVAL_SECONDS} و ${MAX_INTERVAL_SECONDS} ثانية.`,
        threadID,
      );
      return;
    }

    if (parsed.action === "off") {
      const state = activeLoops.get(threadID);
      if (state) {
        state.running = false;
        activeLoops.delete(threadID);
      }
      await api.sendMessage("۩ تم تعطيل 𝑲𝑨𝒀𝑫𝑶 متوقف عن تكرار رسالة مطلوبة", threadID);
      return;
    }

    // تشغيل — لو فيه تكرار قديم شغال نوقفه ونبدأ الجديد
    const old = activeLoops.get(threadID);
    if (old) old.running = false;

    const state = {
      message: parsed.message,
      intervalMs: parsed.seconds * 1000,
      running: true,
    };
    activeLoops.set(threadID, state);

    try {
      await api.sendMessage(parsed.message, threadID); // أول إرسال فوري
    } catch (e) {}
    loop(api, threadID);

    await api.sendMessage(
      `تم تفعيل KAYDO في المجموعة\nالفاصل: ${parsed.seconds} ثانية.\nللإيقاف: kaydo off`,
      threadID,
    );
  },

  isActive(threadID) {
    const state = activeLoops.get(String(threadID));
    return Boolean(state && state.running);
  },

  stopAll() {
    for (const [threadID, state] of activeLoops.entries()) {
      state.running = false;
    }
    activeLoops.clear();
  },

  resumeAll(api) {
    for (const [threadID, state] of activeLoops.entries()) {
      if (state.running) {
        console.log(`[kaydo] استئناف التكرار في ${threadID} بعد إعادة الاتصال`);
        loop(api, threadID);
      }
    }
  },
};
