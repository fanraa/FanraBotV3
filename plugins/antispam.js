// plugins/antispam.js
// 🛡️ ANTI-SPAM & ANTI-VIRTEX (NO MERCY EDITION)
// Target: SEMUA (Admin, Owner, Member) - Tanpa Pengecualian
// =========================================================

// Map untuk menyimpan data spam user
const spamMap = new Map();

export default {
  name: "antispam",
  version: "2.2.0-STRICT",
  priority: 0, // Wajib dijalankan paling awal sebelum plugin lain

  events: {
    message: async (ctx) => {
      try {
        if (!ctx.isGroup || !ctx.body) return;

        const { sender, chatId, body, isFromMe } = ctx;
        
        // Safety: Bot tidak boleh menge-kick dirinya sendiri (akan error API)
        if (isFromMe) return;

        const now = Date.now();
        const keyId = `${chatId}:${sender}`;

        // ==========================================
        // 1. ANTI-VIRTEX / VIRUS (Langsung Eksekusi)
        // ==========================================
        const isVirtex = 
          body.length > 10000 || // Teks kepanjangan
          /(.)\1{50,}/.test(body) || // Karakter berulang parah
          /[\u0300-\u036f]{15,}/.test(body) || // Simbol setan/zalgo
          /[\u202a-\u202e]/.test(body); // Karakter pembalik teks (RTL)

        if (isVirtex) {
           ctx.logger.warn('SECURITY', `☣️ VIRTEX detected from ${ctx.pushName}`);
           
           // A. Hapus pesan virus
           await ctx.deleteMessage(ctx.key);
           
           // B. KICK PELAKU (Tanpa Pengecualian)
           await ctx.bot.sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch((e)=>{
               ctx.logger.error('SECURITY', `Gagal kick virtex (Mungkin dia Creator/Bot bukan Admin): ${e.message}`);
           });
           
           // C. Info Grup
           await ctx.sendMessage({ 
             text: `☣️ @${ctx.senderNumber} *VIRUS DETECTED* \nUser kicked. No mercy.`, 
             mentions: [sender] 
           });
           return; 
        }

        // ==========================================
        // 2. ANTI-SPAM (Batch Logic)
        // ==========================================
        
        // [MODIFIKASI] Bagian Pengecualian Admin/Owner DIHAPUS DISINI.
        // Sekarang kode langsung lanjut ke logika hitung spam.

        // Ambil data user dari RAM
        let userData = spamMap.get(keyId) || { 
            lastMsg: '', 
            count: 0, 
            msgKeys: [], 
            lastTime: 0 
        };

        // Reset hitungan jika pesan BEDA atau jeda waktu > 8 detik
        // (Artinya kalau ngetik manual pelan-pelan aman, tapi kalau copy-paste cepat kena)
        if (userData.lastMsg !== body || (now - userData.lastTime > 8000)) {
            userData = { 
                lastMsg: body, 
                count: 1, 
                msgKeys: [ctx.key], 
                lastTime: now 
            };
        } else {
            // Jika pesan SAMA persis dan CEPAT (< 8 detik)
            userData.count++;
            userData.lastTime = now;
            userData.msgKeys.push(ctx.key); 
        }

        // Simpan data terbaru
        spamMap.set(keyId, userData);

        // --- LOGIKA HUKUMAN BERTAHAP ---

        // A. Pesan ke 1-4: Masih Aman
        if (userData.count < 5) {
            return; 
        }

        // B. Pesan ke-5: PERINGATAN KERAS + HAPUS PESAN SEBELUMNYA
        if (userData.count === 5) {
            ctx.logger.warn('SPAM', `⚠️ SPAM WARNING (5x) to ${ctx.pushName}`);
            
            // Bersihkan sampah spam sebelumnya agar grup bersih
            for (const key of userData.msgKeys) {
                try { await ctx.deleteMessage(key); } catch {}
            }
            
            // Kosongkan list kunci pesan agar hemat memori
            userData.msgKeys = []; 
            spamMap.set(keyId, userData);

            await ctx.sendMessage({
                text: `⚠️ *ANTI-SPAM WARNING* (@${ctx.senderNumber})\nAnda terdeteksi spam 5x.\nLanjut = *KICK*.`,
                mentions: [sender]
            });
            return;
        }

        // C. Pesan ke 6-9: HAPUS TANPA BABIBU
        if (userData.count > 5 && userData.count < 10) {
            await ctx.deleteMessage(ctx.key);
            return;
        }

        // D. Pesan ke-10: EKSEKUSI MATI (KICK)
        if (userData.count >= 10) {
            ctx.logger.warn('SPAM', `🚫 KICKING SPAMMER: ${ctx.pushName} (${ctx.senderNumber})`);
            
            // Hapus pesan terakhir
            await ctx.deleteMessage(ctx.key);
            
            await ctx.sendMessage({ 
                text: `🚫 *SPAM LIMIT EXCEEDED*\nAturan adalah aturan. Selamat tinggal @${ctx.senderNumber}. 👋`,
                mentions: [sender]
            });
            
            // Eksekusi Kick (Tanpa pandang bulu)
            await ctx.bot.sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch((e) => {
                 // Error biasanya terjadi jika target adalah Pembuat Grup (Creator)
                 // Karena WhatsApp melarang Admin (Bot) menge-kick Creator.
                 ctx.reply(`❌ Gagal Kick: Target mungkin Creator Grup atau Bot bukan Admin.`);
            });
            
            // Hapus data spammer dari memori
            spamMap.delete(keyId);
            return;
        }

      } catch (e) {
        ctx.logger.error('ANTISPAM', e.message);
      }
    }
  }
}