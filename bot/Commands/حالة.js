function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const pad = (value) => String(value).padStart(2, "0");

  return `${pad(days)}D • ${pad(hours)}H • ${pad(minutes)}M`;
}

module.exports = {
  name: "حالة",

  async execute(api, event) {
    const threadID = String(event.threadID);
    const uptime = formatUptime(process.uptime());

    const message = [
      "|🩸 𓆩 𝑭𝑨𝑹𝑨𝑯 𓆪 🩸|",
      "  ☠️ 𝑲𝑨𝒀𝑫𝑶 𝑺𝒀𝑺𝑻𝑬𝑴",
      "◈ CONNECTION : ONLINE",
      "◈ STATUS : ACTIVE",
      `◈ UPTIME : ${uptime}`,
      "◈ SERVICE : MESSENGER",
      "| ⛧ 𝑭𝑨𝑹𝑨𝑯 𝑺𝒀𝑵𝑫𝑰𝑪𝑨𝑻𝑬 ⛧ |",
      "|🩸 ━━━━━━━━━━━━━ 🩸|",
    ].join("\n");

    await api.sendMessage(message, threadID);
  },
};
