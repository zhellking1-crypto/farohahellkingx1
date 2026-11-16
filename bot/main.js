const fs = require("fs");
const path = require("path");
const { createRemoteControl } = require("./remote-control");
const { deleteBotMessageOnAdminReaction } = require("./message-reactions");

const ADMINS = new Set(["100078389536244"]);
const commands = new Map();

// عداد الرسائل لكل جروب — كل 568 رسالة يتفاعل البوت
const msgCounters = new Map();
const REACTION_EMOJIS = ["🖤", "🥒", "☠️", "💀", "🔥"];
const REACTION_MILESTONE = 568;

const BOT_NICKNAME = "᚜𝐅⃘𝐀𝐑𝐀⃕𝐇⃫ ⟢ᚘ⟢ 𝐋̶ؗ𝐎̲҇͟𝐑͐𝐃 𝐆𝐀̶𝐋̶ؗ𝐀̸𐇽⃜𝐗𝐘̅ ⃞⃟ ᚛ ⧺";

function isAdmin(senderID) {
  return ADMINS.has(String(senderID));
}

const remoteControl = createRemoteControl({ isAdmin });

function loadCommands() {
  const commandsPath = path.join(__dirname, "Commands");
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));
  commands.clear();
  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(commandsPath, file))];
      const cmd = require(path.join(commandsPath, file));
      commands.set(cmd.name, cmd);
      console.log(`[KAYDO] ✅ تم تحميل: ${cmd.name}`);
    } catch (e) {
      console.error(`[KAYDO] ❌ خطأ في تحميل ${file}:`, e.message);
    }
  }
  console.log(`[KAYDO] تم تحميل ${commands.size} أمر.`);
}

async function handleMessage(api, event) {
  if (!event) return;

  const body = (event.body || "").trim();
  const threadID = String(event.threadID);
  const senderID = String(event.senderID || "");

  console.log(
    `[KAYDO] 📩 رسالة من ${senderID} في ${threadID}: "${body.substring(0, 60)}"`,
  );

  if (/^كايدو\s+(?:تشغيل|ايقاف|إيقاف)$/u.test(body)) {
    const kaydoCommand = commands.get("كايدو");
    if (kaydoCommand) {
      kaydoCommand
        .execute(api, event, isAdmin)
        .catch((e) =>
          console.error("[KAYDO] خطأ في أمر كايدو:", e.message || e),
        );
    }
    return;
  }

  const kaydoCommand = commands.get("كايدو");
  if (kaydoCommand && typeof kaydoCommand.handleMessage === "function") {
    const handledByKaydo = await kaydoCommand
      .handleMessage(api, event)
      .catch((e) => {
        console.error("[KAYDO] خطأ في رد كايدو:", e.message || e);
        return false;
      });
    if (handledByKaydo) return;
  }

  if (isAdmin(senderID)) {
    const timerCmd = commands.get("المؤقت");
    if (timerCmd && typeof timerCmd.handleReply === "function") {
      const handled = await timerCmd
        .handleReply(api, event)
        .catch((e) => {
          console.error("[KAYDO] خطأ في المؤقت:", e.message || e);
          return false;
        });
      if (handled) return;
    }

    const handled = await remoteControl
      .handleMessage(api, event, commands)
      .catch((e) => {
        console.error("[KAYDO] خطأ في التحكم عن بُعد:", e.message || e);
        return true;
      });
    if (handled) return;
  }

  if (body === "اوامر" || body === "أوامر") {
    if (!isAdmin(senderID)) return;
    remoteControl
      .startMenu(api, event, commands)
      .catch((e) =>
        console.error("[KAYDO] خطأ في قائمة الأوامر:", e.message || e),
      );
    return;
  }

  if (body === "حالة") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("حالة");
    if (cmd) {
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في أمر حالة:", e.message || e),
        );
    }
    return;
  }

  // سجّل الرسالة فور وصولها حتى يكون عدّاد الأربع ثوانٍ مبنياً
  // على ترتيب وصول الرسائل، وليس على وقت انتهاء أي رد تلقائي آخر.
  const mahoragaCmd = commands.get("ماهوراغا");
  const isMahoragaControl =
    body === "ماهوراغا" ||
    body === "ماهوراغا ايقاف" ||
    body === "ماهوراغا إيقاف";
  if (
    mahoragaCmd &&
    mahoragaCmd.handleIncomingMessage &&
    (!isMahoragaControl || !isAdmin(senderID))
  ) {
    mahoragaCmd.handleIncomingMessage(api, event);
  }

  // عداد 568 — يتفاعل على الرسالة رقم 568 وكل مضاعفاتها
  if (event.messageID && event.isGroup !== false) {
    const prev = msgCounters.get(threadID) || 0;
    const next = prev + 1;
    msgCounters.set(threadID, next);
    if (next % REACTION_MILESTONE === 0) {
      const emoji =
        REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];
      console.log(
        `[KAYDO] 🎯 رسالة #${next} في ${threadID} — تفاعل بـ ${emoji}`,
      );
      try {
        await api.setMessageReaction(emoji, event.messageID);
      } catch (e) {
        console.error("[KAYDO] خطأ في التفاعل:", e.message || e);
      }
    }
  }

  // الرد التلقائي — يعمل دائماً قبل فحص الأوامر (ليس بالإدمن فقط)
  const replyCmd = commands.get("رد");
  if (replyCmd && replyCmd.checkAutoReply) {
    await replyCmd
      .checkAutoReply(api, event)
      .catch((e) =>
        console.error("[KAYDO] خطأ في checkAutoReply:", e.message),
      );
  }

  // أوامر محمية: يستخدمها الإدمن فقط
  if (/^تغير جريدة(?:\s|$)/u.test(body)) {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("تغير جريدة");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في تغير جريدة:", e.message || e),
        );
    return;
  }

  if (body === "قصف" || body === "قصف ايقاف" || body === "قصف إيقاف") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("قصف");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) => console.error("[KAYDO] خطأ في قصف:", e.message));
    return;
  }

  if (
    body.startsWith("كاتش ") ||
    body.startsWith("مجموعة ") ||
    body.startsWith("جروب ")
  ) {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("كاتش");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في كاتش/مجموعة:", e.message),
        );
    return;
  }

  if (
    body === "ماهوراغا" ||
    body === "ماهوراغا ايقاف" ||
    body === "ماهوراغا إيقاف"
  ) {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("ماهوراغا");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في ماهوراغا:", e.message || e),
        );
    return;
  }

  if (body === "حذف كاتش") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("حذف كاتش");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في حذف كاتش:", e.message || e),
        );
    return;
  }

  if (body.startsWith("رد ") || body === "رد قائمة") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("رد");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) => console.error("[KAYDO] خطأ في رد:", e.message));
    return;
  }

  if (body === "بانكاي" || body.startsWith("بانكاي ")) {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("بانكاي");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في بانكاي:", e.message || e),
        );
    return;
  }

  if (body === "السياجين") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("السياجين");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في السياجين:", e.message || e),
        );
    return;
  }

  if (body === "تثبيت" || body === "تثبيت ايقاف" || body === "تثبيت إيقاف") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("تثبيت");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في تثبيت:", e.message || e),
        );
    return;
  }

  if (body === "تنظيف") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("تنظيف");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في تنظيف:", e.message || e),
        );
    return;
  }

  if (body === "المؤقت") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("المؤقت");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) =>
          console.error("[KAYDO] خطأ في المؤقت:", e.message || e),
        );
    return;
  }

  if (body === "ايقاف يوت" || body === "إيقاف يوت" || body === "تشغيل يوت") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("يوت");
    if (!cmd || typeof cmd.setEnabled !== "function") {
      await api.sendMessage("❌ تعذر تحميل إعدادات أمر يوت.", threadID);
      return;
    }
    const enabled = body === "تشغيل يوت";
    cmd.setEnabled(api, event, enabled).catch(async (e) => {
      console.error("[KAYDO] خطأ في تغيير حالة يوت:", e.message || e);
      await api
        .sendMessage("❌ لم أستطع حفظ حالة أمر يوت.", threadID)
        .catch(() => {});
    });
    return;
  }

  if (body.startsWith("يوت ")) {
    const cmd = commands.get("يوت");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) => console.error("[KAYDO] خطأ في يوت:", e.message));
    return;
  }

  if (body === "ايقاف تيك" || body === "إيقاف تيك" || body === "تشغيل تيك") {
    if (!isAdmin(senderID)) return;
    const cmd = commands.get("تيك");
    if (!cmd || typeof cmd.setEnabled !== "function") {
      await api.sendMessage("❌ تعذر تحميل إعدادات أمر تيك.", threadID);
      return;
    }
    const enabled = body === "تشغيل تيك";
    cmd.setEnabled(api, event, enabled).catch(async (e) => {
      console.error("[KAYDO] خطأ في تغيير حالة تيك:", e.message || e);
      await api
        .sendMessage("❌ لم أستطع حفظ حالة أمر تيك.", threadID)
        .catch(() => {});
    });
    return;
  }

  if (body.startsWith("تيك ")) {
    const cmd = commands.get("تيك");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) => console.error("[KAYDO] خطأ في تيك:", e.message));
    return;
  }

  if (/^owner$/iu.test(body)) {
    const cmd = commands.get("Owner");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) => console.error("[KAYDO] خطأ في Owner:", e.message || e));
    return;
  }

  if (/^kaydo(?:\s|$)/i.test(body)) {
    const cmd = commands.get("kaydo");
    if (cmd)
      cmd
        .execute(api, event)
        .catch((e) => console.error("[KAYDO] خطأ في أمر kaydo:", e.message || e));
    return;
  }

}

function handleEvent(api, event) {
  if (!event) return;

  if (event.type === "message_reaction") {
    deleteBotMessageOnAdminReaction(api, event, isAdmin)
      .then((deleted) => {
        if (deleted) {
          console.log(
            `[KAYDO] 🗑️ حُذفت رسالتي بعد تفاعل المشرف بـ🪯 في ${event.threadID}`,
          );
        }
      })
      .catch((e) =>
        console.error(
          "[KAYDO] تعذّر حذف الرسالة بعد التفاعل:",
          e.message || e,
        ),
      );
  }

  // طباعة الحدث للتشخيص
  const logType = event.logMessageType || event.type || "";
  if (logType !== "read_receipt") {
    console.log(
      `[KAYDO] 📌 حدث: type=${event.type} | logType=${logType}`,
    );
  }

  const catchCmd = commands.get("كاتش");
  const pinCmd = commands.get("تثبيت");

  // حماية الكنيات — حدث تغيير الكنية
  if (catchCmd && logType === "log:user-nickname") {
    catchCmd.handleNicknameEvent(api, event);
  }

  // حماية اسم المجموعة — حدث تغيير الاسم
  if (catchCmd && logType === "log:thread-name") {
    catchCmd.handleGroupNameEvent(api, event);
  }

  // حماية صورة المجموعة — حدث تغيير صورة المجموعة
  const normalizedLogType = String(logType).toLowerCase();
  const eventDetails = [
    event.type,
    event.logMessageType,
    event.logMessageBody,
    JSON.stringify(event.logMessageData || {}),
  ]
    .join(" ")
    .toLowerCase();
  const isGroupImageEvent =
    /image|photo|picture|change_thread_image|thread_image|threadimage/.test(
      `${normalizedLogType} ${eventDetails}`,
    );
  if (isGroupImageEvent && pinCmd && pinCmd.handleGroupImageEvent) {
    pinCmd.handleGroupImageEvent(api, event);
  }

  // بوت التحق بالمجموعة — حدث انضمام
  if (logType === "log:subscribe") {
    const threadID = String(event.threadID);
    const logData = event.logMessageData || {};
    const addedParticipants = logData.addedParticipants || [];
    const botID = api.getCurrentUserID ? api.getCurrentUserID() : null;

    if (
      botID &&
      addedParticipants.some(
        (p) => String(p.userFbId || p.userID || p.id || "") === String(botID),
      )
    ) {
      console.log(
        `[KAYDO] ✅ تمت إضافتي إلى المجموعة ${threadID} — جاري تعيين الكنية...`,
      );
      setTimeout(async () => {
        try {
          await api.nickname(BOT_NICKNAME, threadID, String(botID));
          console.log(
            `[KAYDO] ✅ تم تعيين الكنية في المجموعة ${threadID}`,
          );
        } catch (e) {
          console.error(
            `[KAYDO] خطأ في تعيين الكنية بعد الانضمام:`,
            e.message || e,
          );
        }
      }, 2000);
    }

    const kaydoCommand = commands.get("كايدو");
    if (kaydoCommand && typeof kaydoCommand.handleJoinEvent === "function") {
      kaydoCommand.handleJoinEvent(api, event).catch((e) =>
        console.error("[KAYDO] خطأ في ترحيب كايدو:", e.message || e),
      );
    }
  }
}

module.exports = { loadCommands, handleMessage, handleEvent, commands };
