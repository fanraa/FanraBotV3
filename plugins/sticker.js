// plugins/sticker.js
// Enhanced Sticker Generator — Image Only Mode (Video is Premium)
// ===============================================================
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

export default {
    name: "sticker",
    cmd: ["s", "sticker", "stiker", "sg"],
    type: "command",
    priority: 2,

    run: async (ctx) => {
        try {
            const { raw, reply, react, sendMessage, args, user, config } = ctx;
            const msg = raw?.message;
            const quoted = msg?.extendedTextMessage?.contextInfo?.quotedMessage;

            const isImage = msg?.imageMessage || quoted?.imageMessage;
            const isVideo = msg?.videoMessage || quoted?.videoMessage;
            
            // 1. Cek Media
            if (!isImage && !isVideo) {
                return reply("❌ *No Media Found*.\nSend an *image/video* with caption *.s* or reply an image/video using *.s*");
            }

            await react("⏳");

            const mediaType = isImage ? "image" : "video";
            const mediaMessage = msg?.imageMessage || quoted?.imageMessage || msg?.videoMessage || quoted?.videoMessage;

            // 2. [NEW LOGIC] BLOCK VIDEO (PREMIUM ACCESS ONLY)
            if (mediaType === "video") {
                await react("🔒");
                return reply(`
⚠️ Only For Premium Users`.trim());
            }
            
            // --- HANYA LANJUT JIKA MEDIA ADALAH IMAGE ---

            // 3. Custom Pack Name Logic
            const defaultPackName = config.get("botName") || "FanraBot";
            const customPack = args.join(' ').trim();
            const packName = customPack || defaultPackName;
            const authorName = user?.name || "User";

            // Download media (Image only now)
            const stream = await downloadContentFromMessage(mediaMessage, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (buffer.length > 5 * 1024 * 1024) {
                 return reply("❌ Image is too large (Max 5MB).");
            }

            // Create sticker (Image)
            const sticker = new Sticker(buffer, {
                pack: packName,
                author: authorName,
                type: StickerTypes.FULL,
                categories: ["🎉", "🤩"],
                quality: 60,
                background: "transparent",
            });

            const stickerBuffer = await sticker.toBuffer();

            await sendMessage({ sticker: stickerBuffer }, { quoted: raw });
            await react("✅");

        } catch (error) {
            ctx.logger.error("STICKER", `Error: ${error.message}`);
            // Jika ada error pada gambar statis
            await ctx.reply(`❌ *Sticker Failed:*\n_Reason: ${error.message}_`);
        }
    }
};