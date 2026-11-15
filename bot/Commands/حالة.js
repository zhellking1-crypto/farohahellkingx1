function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${days}D • ${hours}H • ${minutes}M • ${secs}S`;
}

function formatCheckTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

module.exports = {
  name: "حالة",

  async execute(api, event) {
    const threadID = String(event.threadID);
    const uptime = formatUptime(process.uptime());
    const checkTime = formatCheckTime(new Date());

    const message = [
      "| ━━━━━━━ 𖤐 ━━━━━━━ |",
      "       𓆩 𝑭𝑨𝑹𝑨𝑯 𓆪",
      "        𝑲𝑨𝒀𝑫𝑶 𝑺𝒀𝑺𝑻𝑬𝑴",
      "| ━━━━━━━━━━━━━━━━━ |",
      "",
      "╭━━━━━━━━━━━━━━━━━━╮",
      " ┊ 𝑪𝒐𝒏𝒏𝒆𝒄𝒕𝒊𝒐𝒏 : ONLINE",
      "⛧ ┊ 𝑺𝒚𝒔𝒕𝒆𝒎 : FULLY ACTIVE",
      ` ┊ 𝑼𝒑𝒕𝒊𝒎𝒆 : ${uptime}`,
      " ┊ 𝑺𝒆𝒓𝒗𝒊𝒄𝒆 : FACEBOOK MESSENGER",
      ` ┊ 𝑪𝒉𝒆𝒄𝒌 𝑻𝒊𝒎𝒆 : ${checkTime}`,
      "╰━━━━━━━━━━━━━━━━━━╯",
      "",
      "    ⛧ 𝑭𝑨𝑹𝑨𝑯 𝑺𝒀𝑵𝑫𝑰𝑪𝑨𝑻𝑬 ⛧",
      "| ━━━━━━━ 𖤐 ━━━━━━━ |",
    ].join("\n");

    await api.sendMessage(message, threadID);
  },
};
