const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const YTDL_PATH = 'yt-dlp';
const TIKTOK_STATE_PATH = path.join(__dirname, '..', 'data', 'tiktok-state.json');

function cleanup(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {}
}

function createAvailability(statePath) {
  return {
    isEnabled() {
      try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (typeof state.enabled !== 'boolean') {
          throw new Error('حالة تيك المحفوظة غير صالحة.');
        }
        return state.enabled;
      } catch (error) {
        if (error.code === 'ENOENT') return true;
        throw error;
      }
    },

    setEnabled(enabled) {
      if (typeof enabled !== 'boolean') {
        throw new TypeError('حالة تيك يجب أن تكون تشغيلًا أو إيقافًا.');
      }

      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        fs.writeFileSync(
          temporaryPath,
          JSON.stringify({ enabled }, null, 2),
          { mode: 0o600 },
        );
        fs.renameSync(temporaryPath, statePath);
      } catch (error) {
        try {
          if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
        } catch (cleanupError) {}
        throw new Error(`تعذر حفظ حالة تيك: ${error.message}`);
      }
    },
  };
}

function downloadTikTokVideo(query, outFile) {
  return new Promise((resolve, reject) => {
    const safeQuery = query.replace(/"/g, '\\"').replace(/`/g, '');

    const cmd = `"${YTDL_PATH}" --no-playlist -o "${outFile}" "tiktoksearch1:${safeQuery}"`;

    console.log(`[تيك] تنفيذ: ${cmd}`);

    exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
        resolve();
      } else if (err) {
        console.error(`[تيك] yt-dlp stderr:`, stderr || err.message);
        reject(new Error(stderr || err.message));
      } else {
        reject(new Error('الملف لم يُنشأ'));
      }
    });
  });
}

function createTiktokCommand({
  statePath = TIKTOK_STATE_PATH,
  downloadTikTokVideo: downloadImpl = downloadTikTokVideo,
} = {}) {
  const availability = createAvailability(statePath);

  return {
    name: 'تيك',

    isEnabled: availability.isEnabled,

    async setEnabled(api, event, enabled) {
      availability.setEnabled(enabled);
      const message = enabled
        ? '✅ تم تشغيل تيك. يمكن للجميع استخدام «تيك [اسم]».'
        : '⛔ تم إيقاف تيك. البوت لن يرد على أي بحث تيك.';
      try {
        await api.sendMessage(message, String(event.threadID));
      } catch (error) {
        console.error('[تيك] تعذر إرسال تأكيد تغيير الحالة:', error.message || error);
      }
    },

    async execute(api, event) {
      const threadID = String(event.threadID);
      const body = (event.body || '').trim();

      if (!body.startsWith('تيك ')) return;

      const query = body.slice('تيك '.length).trim();

      if (!query) {
        try {
          await api.sendMessage(
            '⚠️ مثال: تيك محمد رمضان',
            threadID
          );
        } catch (e) {}
        return;
      }

      try {
        if (!availability.isEnabled()) {
          return;
        }
      } catch (error) {
        console.error('[تيك] تعذر قراءة الحالة:', error.message || error);
        return;
      }

      try {
        await api.sendMessage(
          `🎬 جاري البحث عن فيديو تيك توك: "${query}"...`,
          threadID
        );
      } catch (e) {}

      const tmpDir = path.join(__dirname, '..', 'tmp');
      const outFile = path.join(
        tmpDir,
        'tik-' + Date.now() + '.mp4'
      );

      try {
        fs.mkdirSync(tmpDir, { recursive: true });
      } catch (e) {}

      try {
        await downloadImpl(query, outFile);

        const sizeMB = (
          fs.statSync(outFile).size / (1024 * 1024)
        ).toFixed(2);

        console.log(
          `[تيك] إرسال فيديو (${sizeMB} MB) إلى ${threadID}`
        );

        await api.sendMessage(
          {
            attachment: fs.createReadStream(outFile)
          },
          threadID
        );

      } catch (err) {
        console.error(`[تيك] فشل:`, err.message);
        try {
          await api.sendMessage(
            '❌ لم يُعثر على الفيديو أو فشل التحميل، جرب اسماً آخر.',
            threadID
          );
        } catch (e) {}
      } finally {
        cleanup(outFile);
      }
    }
  };
}

module.exports = createTiktokCommand();
module.exports.createTiktokCommand = createTiktokCommand;
