"use strict";

// فحص الجلسة بفترات عشوائية (±40%) بدل فترات ثابتة يمكن لفيسبوك رصدها كنمط آلي.
const BASE_CHECK_MINUTES = 25;
const JITTER_RATIO = 0.4;

let generation = 0;
let timer = null;

function humanDelay(baseMs) {
  const spread = baseMs * JITTER_RATIO;
  return Math.round(baseMs - spread + Math.random() * spread * 2);
}

function startHumanizer(checkSession) {
  stopHumanizer();
  const id = ++generation;
  const baseMs = BASE_CHECK_MINUTES * 60 * 1000;

  const loop = async () => {
    if (id !== generation) return;
    try {
      await checkSession();
    } catch (error) {
      console.error('[HUMANIZER] خطأ في فحص الجلسة:', error.message || error);
    }
    if (id === generation) timer = setTimeout(loop, humanDelay(baseMs));
  };

  timer = setTimeout(loop, humanDelay(baseMs));
  console.log(`[HUMANIZER] 🧍 فحص الجلسة بفترات عشوائية حول ${BASE_CHECK_MINUTES} دقيقة`);
}

function stopHumanizer() {
  generation++;
  if (timer) clearTimeout(timer);
  timer = null;
}

module.exports = { startHumanizer, stopHumanizer };
