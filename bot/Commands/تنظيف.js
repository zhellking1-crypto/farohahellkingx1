"use strict";

const { callGroupMemberAction } = require("./Bankai");

const CHECK_INTERVAL_MS = 3000;
const RETRY_DELAY_MS = 1500;
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

function listReviewableMemberIDs(info, botID) {
  if (!info || !Array.isArray(info.participantIDs)) {
    throw new Error("تعذر قراءة أعضاء المجموعة.");
  }
  const adminIDs = new Set((info.adminIDs || []).map(normalizeID));
  return info.participantIDs
    .map((id) => String(id))
    .filter((id) => id && id !== String(botID) && !adminIDs.has(id));
}

function isGhostProfile(profiles, uid) {
  const profile = profiles && profiles[uid];
  return !profile || isUnnamed(profile.name);
}

function lookupUserInfo(api, uid) {
  return new Promise((resolve, reject) => {
    const pending = api.getUserInfo(uid, (error, data) =>
      error ? reject(error) : resolve(data),
    );
    if (pending && typeof pending.then === "function") {
      pending.then(resolve, reject);
    }
  });
}

async function fetchProfile(api, uid) {
  try {
    return await lookupUserInfo(api, uid);
  } catch {
    await sleep(RETRY_DELAY_MS);
    return lookupUserInfo(api, uid);
  }
}

module.exports = {
  name: "تنظيف",

  isGhostProfile,
  listReviewableMemberIDs,

  async execute(api, event) {
    const threadID = String(event.threadID || "");
    if (!threadID) return;

    if (event.isGroup === false) {
      await api.sendMessage("⚠️ هذا الأمر يعمل داخل المجموعات فقط.", threadID);
      return;
    }

    try {
      const botID = api.getCurrentUserID ? api.getCurrentUserID() : "";
      await api.sendMessage("🔍 جاري فحص حسابات أعضاء المجموعة واحدًا واحدًا...", threadID);
      const memberIDs = listReviewableMemberIDs(
        await api.getThreadInfo(threadID),
        botID,
      );

      if (memberIDs.length === 0) {
        await api.sendMessage("✅ لا يوجد أعضاء يمكن فحصهم في المجموعة.", threadID);
        return;
      }

      let removedCount = 0;
      let failedCount = 0;
      for (let index = 0; index < memberIDs.length; index++) {
        const uid = memberIDs[index];
        let profiles = null;
        try {
          profiles = await fetchProfile(api, uid);
        } catch (error) {
          console.error(`[تنظيف] تعذر الوصول إلى حساب ${uid}:`, error.message || error);
        }

        if (!profiles || isGhostProfile(profiles, uid)) {
          try {
            await callGroupMemberAction(api, "remove", uid, threadID);
            removedCount++;
          } catch (error) {
            failedCount++;
            console.error(`[تنظيف] تعذرت إزالة ${uid}:`, error.message || error);
          }
        }

        if (index < memberIDs.length - 1) await sleep(CHECK_INTERVAL_MS);
      }

      console.log(
        `[تنظيف] ✅ أُزيل ${removedCount} حسابًا معطلًا من ${threadID}، فشل ${failedCount}`,
      );
      await api.sendMessage(
        failedCount === 0
          ? `✅ انتهى الفحص. تمت إزالة ${removedCount} حسابًا معطلًا من المجموعة.`
          : `⚠️ انتهى الفحص. تمت إزالة ${removedCount} حسابًا معطلًا، وتعذرت إزالة ${failedCount}.`,
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
