"use strict";

const { createZedAssistant } = require("../zed-assistant");

const COMMAND_PATTERN = /^كايدو\s+(تشغيل|ايقاف|إيقاف)$/u;

function createKaydoCommand(options = {}) {
  const assistant = options.assistant || createZedAssistant(options);

  return {
    name: "كايدو",

    async execute(api, event, isAdmin) {
      const body = String(event.body || "").trim();
      const match = COMMAND_PATTERN.exec(body);
      if (!match) return false;

      const threadID = String(event.threadID || "");
      if (!threadID) return false;
      if (event.isGroup === false) {
        await api.sendMessage("⚠️ أوامر كايدو تعمل داخل المجموعات فقط.", threadID);
        return true;
      }

      if (typeof isAdmin !== "function" || !isAdmin(String(event.senderID || ""))) {
        await api.sendMessage("⚠️ أمر كايدو متاح لمشرفي البوت فقط.", threadID);
        return true;
      }

      const enabled = match[1] === "تشغيل";
      const changed = assistant.setEnabled(threadID, enabled);
      const message = enabled
        ? changed
          ? "✅ تم تشغيل كايدو في هذه المجموعة. سيرد عند منشنه ويرحب بالأعضاء الجدد."
          : "ℹ️ كايدو يعمل بالفعل في هذه المجموعة."
        : changed
          ? "⏹️ تم إيقاف كايدو في هذه المجموعة؛ لن يرد على المنشن أو يرسل ترحيبًا."
          : "ℹ️ كايدو متوقف بالفعل في هذه المجموعة.";
      await api.sendMessage(message, threadID);
      return true;
    },

    handleMessage(api, event) {
      return assistant.handleMessage(api, event);
    },

    handleJoinEvent(api, event) {
      return assistant.handleJoinEvent(api, event);
    },

    isEnabled(threadID) {
      return assistant.isEnabled(threadID);
    },
  };
}

const command = createKaydoCommand();
module.exports = { ...command, createKaydoCommand };
