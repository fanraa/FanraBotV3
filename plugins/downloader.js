// plugins/downloader.js
// Universal Downloader (TikTok, IG, YT, FB, CapCut)
// Language: English
// ==================================================

export default {
    name: 'downloader',
    // Commands that trigger this plugin
    cmd: ['dl', 'download', 'tiktok', 'tt', 'ig', 'instagram', 'yt', 'youtube', 'fb', 'facebook', 'capcut', 'cp'], 
    type: 'command', 
    priority: 10,

    run: async (ctx) => {
        const { args, reply, sendMessage, react } = ctx;
        const url = args[0];

        // 1. Validation: Check if a link is provided
        if (!url) {
            return reply(`
Please provide a valid link after the command.

*Usage Examples:*
• \`.dl <link>\`
            `.trim());
        }

        // 2. Feedback: Processing
        await react('⏳');

        try {
            let result = null;

            // 3. Link Detection & Routing
            if (url.includes('tiktok.com')) result = await downloadTikTok(url);
            else if (url.includes('instagram.com')) result = await downloadInstagram(url);
            else if (url.includes('youtube.com') || url.includes('youtu.be')) result = await downloadYouTube(url);
            else if (url.includes('facebook.com') || url.includes('fb.watch')) result = await downloadFacebook(url);
            else if (url.includes('capcut.com')) result = await downloadCapCut(url);
            else return reply("❌ *Unknown Link.* Please use a valid TikTok, Instagram, YouTube, Facebook, or CapCut link.");

            // 4. Validate Result
            if (!result || !result.url) {
                return reply("❌ *Download Failed.* Media not found or the account might be private.");
            }

            // 5. Send Media
            const caption = `
✅ *DOWNLOAD SUCCESS*

📱 *Platform:* ${result.platform}
📝 *Title:* ${result.title || 'No Title'}

_Powered by FanraBot_
            `.trim();

            if (result.type === 'video') {
                await sendMessage({ video: { url: result.url }, caption }, { quoted: ctx.raw });
            } else {
                await sendMessage({ image: { url: result.url }, caption }, { quoted: ctx.raw });
            }

            await react('✅');

        } catch (e) {
            ctx.logger.error('DL', `Error: ${e.message}`);
            await react('❌');
            await reply(`❌ *Error Occurred:*\n_${e.message}_\n\n_Please try again later._`);
        }
    }
};

// --- HELPER FUNCTIONS (API Wrappers with Timeout) ---

// Helper to fetch with timeout (prevents bot from freezing)
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 15000 } = options; // Default 15 seconds
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
}

async function downloadTikTok(url) {
    try {
        const res = await fetchWithTimeout(`https://www.tikwm.com/api/?url=${url}&hd=1`);
        const data = await res.json();
        if (data.code !== 0) throw new Error("Video not found or Private");
        
        return { 
            platform: 'TikTok', 
            type: 'video', 
            url: data.data.play, 
            title: data.data.title 
        };
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'Request Timeout' : e.message); }
}

async function downloadInstagram(url) {
    try {
        const res = await fetchWithTimeout(`https://api.nyxs.pw/dl/instagram?url=${url}`);
        const data = await res.json();
        if (!data.status) throw new Error("API Error / Post Not Found");
        
        const media = data.result[0];
        return { 
            platform: 'Instagram', 
            type: media.type === 'image' ? 'image' : 'video', 
            url: media.url, 
            title: 'Instagram Post' 
        };
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'Request Timeout' : e.message); }
}

async function downloadYouTube(url) {
    try {
        const res = await fetchWithTimeout(`https://api.nyxs.pw/dl/yt-direct?url=${url}`);
        const data = await res.json();
        if (!data.status) throw new Error("API Error / Video Not Found");
        
        return { 
            platform: 'YouTube', 
            type: 'video', 
            url: data.result.url, 
            title: data.result.title 
        };
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'Request Timeout' : e.message); }
}

async function downloadFacebook(url) {
    try {
        const res = await fetchWithTimeout(`https://api.ryzendesu.vip/api/downloader/fbdl?url=${url}`);
        const data = await res.json();
        
        // Try to get HD, fallback to SD
        const v = data.data?.find(x => x.resolution === 'HD')?.url || data.data?.[0]?.url;
        
        if (!v) throw new Error("Video Not Found");
        
        return { 
            platform: 'Facebook', 
            type: 'video', 
            url: v, 
            title: 'Facebook Video' 
        };
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'Request Timeout' : e.message); }
}

async function downloadCapCut(url) {
    try {
        const res = await fetchWithTimeout(`https://api.ryzendesu.vip/api/downloader/capcut?url=${url}`);
        const data = await res.json();
        
        if (!data.url) throw new Error("Template Not Found");
        
        return { 
            platform: 'CapCut', 
            type: 'video', 
            url: data.url, 
            title: data.title 
        };
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'Request Timeout' : e.message); }
}