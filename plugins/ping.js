// Premium Ping Command
// Clean, professional, and English-based version

import os from 'os';

export default {
    name: "ping",
    cmd: ["ping", "speed", "p"],
    type: "command",
    priority: 1,

    run: async (ctx) => {
        const start = Date.now();
        await ctx.react("⚡");

        const latency = Date.now() - start;
        const cpuCores = os.cpus().length;
        const ramTotal = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);

        const msg = `
🚀 *PING STATUS*

⚡ *Latency:* ${latency}ms
🖥️ *CPU Cores:* ${cpuCores}
💾 *Total RAM:* ${ramTotal} GB

System is running normally.
        `.trim();

        await ctx.reply(msg);
    }
};
