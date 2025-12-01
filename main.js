// main.js
// WhatsApp Bot Runner — Final Fix (Session Creator)
// ================================================
import 'dotenv/config';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import chalk from 'chalk';
import engine from './core/index.js';
import { createRequire } from 'module';
import fs from 'fs'; // <--- Wajib ada untuk baca/buat folder

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-terminal');
const lib = require('@whiskeysockets/baileys');

function getBaileysFunction(key) { return lib[key] || lib.default?.[key] || lib.default?.default?.[key]; }
const makeWASocket = lib.default?.default || lib.default || lib;
const useMultiFileAuthState = getBaileysFunction('useMultiFileAuthState');
const DisconnectReason = getBaileysFunction('DisconnectReason');
const fetchLatestBaileysVersion = getBaileysFunction('fetchLatestBaileysVersion');
const jidNormalizedUser = getBaileysFunction('jidNormalizedUser');
const Browsers = getBaileysFunction('Browsers');

const SESSION_DIR = process.env.SESSION_DIR || 'session';
const localLogger = pino({ level: 'fatal' });

// --- [FIX] AUTO CREATE SESSION FOLDER ---
// Ini yang memperbaiki error ENOENT
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Helper Serializer Pesan (Anti-Crash)
const serialize = (m, sock) => {
  if (!m || !m.messages?.[0]) return null;
  const msg = m.messages[0];
  if (!msg.message) return null; // Safety check
  if (msg.key?.remoteJid === 'status@broadcast') return null;
  
  const key = msg.key;
  const chatId = key.remoteJid;
  const isGroup = chatId.endsWith('@g.us');
  let senderRaw = isGroup ? key.participant : chatId;
  const sender = jidNormalizedUser(senderRaw || ''); 
  
  const type = Object.keys(msg.message).find(k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo');
  
  let body = '';
  if (type === 'conversation') body = msg.message.conversation;
  else if (type === 'extendedTextMessage') body = msg.message.extendedTextMessage?.text;
  else if (type === 'imageMessage') body = msg.message.imageMessage?.caption;
  else if (type === 'videoMessage') body = msg.message.videoMessage?.caption;
  
  return { 
    raw: msg, key, id: key.id, chatId, sender, 
    senderNumber: sender.split('@')[0], pushName: msg.pushName || 'User', 
    isGroup, fromMe: key.fromMe, type, body: body || '' 
  };
};

class WhatsAppClient {
  constructor() { this.sock = null; }

  async start() {
    // Session Auth
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();
    
    this.sock = makeWASocket({
      version, 
      logger: localLogger, 
      printQRInTerminal: false, 
      auth: state,
      browser: Browsers.ubuntu('FanraBot Manager'), 
      syncFullHistory: false,
      generateHighQualityLinkPreview: true
    });

    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', (u) => this.handleConnection(u));
    this.sock.ev.on('messages.upsert', (m) => this.handleMessages(m));
  }

  async handleConnection({ connection, lastDisconnect, qr }) {
    if (qr) {
        console.clear();
        console.log(chalk.yellow('⚠️ SCAN QR CODE SEKARANG ⚠️'));
        qrcode.generate(qr, { small: true });
    }
    
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
          console.log(chalk.red('❌ Sesi Logged Out. Hapus folder session dan scan ulang.'));
          process.exit(1);
      } else {
          this.start();
      }
    } else if (connection === 'open') {
      engine.logger.info('CONN', chalk.green('WhatsApp Connected! 🚀'));
      this.injectToEngine();

      const settings = engine.settings; 
      if (settings.selfMessage !== false) {
          const botId = jidNormalizedUser(this.sock.user.id);
          const dashboardText = `
🤖 *FANRABOT ONLINE*
===================
✅ *Status System:*
• Group Mode: ${settings.groupMode ? 'ON' : 'OFF'}
• Private Mode: ${settings.privateMode ? 'ON' : 'OFF'}

_Bot berhasil terhubung dan siap digunakan._
          `.trim();
          
          try { await this.sock.sendMessage(botId, { text: dashboardText }); } catch (e) {}
      }
    }
  }

  async handleMessages({ messages, type }) {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        const meta = serialize({ messages: [m] }, this.sock);
        if (meta) await engine.dispatchEvent('message', meta);
      } catch (e) {}
    }
  }

  injectToEngine() {
    engine.mockWA = {
      sock: this.sock,
      reply: (jid, text, opts = {}) => this.sock.sendMessage(jid, { text }, { quoted: opts.quoted }),
      sendMessage: (jid, content, opts = {}) => this.sock.sendMessage(jid, content, opts),
      react: (jid, emoji, quoted) => this.sock.sendMessage(jid, { react: { text: emoji, key: quoted?.key } }),
      deleteMessage: (key) => this.sock.sendMessage(key.remoteJid, { delete: key })
    };
  }
}

(async () => { await engine.start(); await new WhatsAppClient().start(); })();