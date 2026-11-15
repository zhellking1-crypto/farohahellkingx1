"use strict";

const { callGroupMemberAction } = require("./Bankai");

const REMOVE_DELAY_MS = 1500;
const FACEBOOK_USER_NAME = "Facebook User";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeID(value) {
  if (value && typeof value === "object") {
    return String(value.id || value.userID || value.userFbId || "");
  }
  return String(value || "");
}

function isUnnamed(name) {
  const trimmed = String(name || "").trim();
  return trimmed === "" || trimmed === FACEBOOK_USER_NAME;
}

// يعتبر العضو معطلاً إذا لم يُرجع فيسبوك اسمه أو أرجع الاسم الافتراضي للحسابات المعطلة.
// نرفض العمل إذا لم تصل أسماء الأعضاء أصلاً، حتى لا نزيل أعضاء فعليين بسبب بيانات ناقصة.
function findDisabledMemberIDs(info, botID) {
  if (!info || !Array.isArray(info.participantIDs) || !info.userInfo) {
    throw new Error("تعذر قراءة أسماء أعضاء المجموعة.");
  }

  const entries = Array.isArray(info.userInfo)
    ? info.userInfo.map((user) => [normalizeID(user), user])
    : Object.entries(info.userInfo);
  const namesByID = new Map(
    entries.map(([id, user]) => [String(id), user && user.name]),
  );
  const adminIDs = new Set((info.adminIDs || []).map(normalizeID));

  return info.participantIDs
    .map((id) => String(id))
    .filter(
      (id) =>
        id &&
        id !== String(botID) &&
        !adminIDs.has(id) &&
        isUnnamed(namesByID.get(id)),
    );
}

module.exports = {
  name: "تنظيف",

  findDisabledMemberIDs,

  async execute(api, event) {
    const threadID = String(event.threadID || "");
    if (!threadID) return;

    if (event.isGroup === false) {
      await api.sendMessage("⚠️ هذا الأمر يعمل داخل المجموعات فقط.", threadID);
      return;
    }

    try {
      await api.sendMessage("🔍 جاري فحص أعضاء المجموعة...", threadID);
      const info = await api.getThreadInfo(threadID);
      const botID = api.getCurrentUserID ? api.getCurrentUserID() : "";
      const disabledIDs = findDisabledMemberIDs(info, botID);

      if (disabledIDs.length === 0) {
        await api.sendMessage("✅ لا توجد حسابات معطلة في المجموعة.", threadID);
        return;
      }

      await api.sendMessage(
        `🧹 وجدت ${disabledIDs.length} حسابًا معطلًا، جاري إزالتها...`,
        threadID,
      );

      let removedCount = 0;
      let failedCount = 0;
      for (let index = 0; index < disabledIDs.length; index++) {
        const uid = disabledIDs[index];
        try {
          await callGroupMemberAction(api, "remove", uid, threadID);
          removedCount++;
        } catch (error) {
          failedCount++;
          console.error(`[تنظيف] تعذرت إزالة ${uid}:`, error.message || error);
        }
        if (index < disabledIDs.length - 1) await sleep(REMOVE_DELAY_MS);
      }

      console.log(
        `[تنظيف] ✅ أُزيل ${removedCount} حسابًا معطلًا من ${threadID}، فشل ${failedCount}`,
      );
      await api.sendMessage(
        failedCount === 0
          ? `✅ تمت إزالة ${removedCount} حسابًا معطلًا من المجموعة.`
          : `⚠️ تمت إزالة ${removedCount} حسابًا معطلًا، وتعذرت إزالة ${failedCount}.`,
        threadID,
      );
    } catch (error) {
      console.error("[تنظيف] خطأ:", error.message || error);
      await api.sendMessage(
        `❌ تعذر تنظيف المجموعة: ${error.message || error}`,
        threadID,
      );
    }
  },
};
