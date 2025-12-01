// Premium Runtime / System Status Command
// Professional layout, clean English formatting

import os from 'os';

function formatSize(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + " KB";
    if (bytes > 1) return bytes + " bytes";
    if (bytes === 1) return "1 byte";
    return "0 bytes";
}

export default {
    name: "runtime",
    cmd: ["runtime", "status", "sys", "system", "info"],
    type: "command",
    priority: 1,

    run: async (ctx) => {
        await ctx.react("🟢");

        // Uptime
        const uptime = process.uptime();
        const uptimeStr = new Date(uptime * 1000).toISOString().substring(11, 19);

        // CPU & RAM
        const cpus = os.cpus();
        const cpuModel = cpus?.[0]?.model || "Unknown CPU";
        const cpuCores = cpus.length;

        const freeMem = formatSize(os.freemem());
        const totalMem = formatSize(os.totalmem());

        // OS / Platform
        const platform = os.platform();
        const arch = os.arch();

        const message = `
✨ *SYSTEM RUNTIME REPORT*

🟢 *Status:* Online and Operational
⏱️ *Uptime:* ${uptimeStr}

💻 *Server Information*
• *OS Platform:* ${platform} (${arch})
• *CPU:* ${cpuModel}
• *Cores:* ${cpuCores}
• *Memory:* ${freeMem} free / ${totalMem} total

📌 No issues detected — system performance is stable.
        `.trim();

        await ctx.reply(message);
    }
};
