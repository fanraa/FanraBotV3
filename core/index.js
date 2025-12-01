// core/index.js
// FanraBot Core Engine — Fix Menu & ListPlugins
// =============================================
import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import chokidar from 'chokidar';
import chalk from 'chalk';
import { EventEmitter } from 'events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

class Logger {
  constructor() {
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
    this.level = this.levels.debug; 
    this.logDir = path.join(ROOT, 'logs');
    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
  }

  getTime() { return new Date().toLocaleTimeString('id-ID', { hour12: false }); }
  stripAnsi(str) { return String(str).replace(/\x1B\[[0-9;]*[mK]/g, ''); }

  print(level, tag, message) {
    const time = chalk.gray(`[${this.getTime()}]`);
    let tagColor;
    switch (level) {
      case 'error': tagColor = chalk.bgRed.bold(` ${tag} `); break;
      case 'warn':  tagColor = chalk.bgYellow.black.bold(` ${tag} `); break;
      case 'info':  tagColor = chalk.bgBlue.bold(` ${tag} `); break;
      case 'debug': tagColor = chalk.bgGreen.black.bold(` ${tag} `); break;
      default:      tagColor = chalk.bgWhite.black(` ${tag} `);
    }
    console.log(`${time} ${tagColor} ${message}`);
    this.writeToFile(level, tag, message);
  }

  writeToFile(level, tag, msg) {
    try {
      const cleanMsg = this.stripAnsi(msg);
      const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${tag}] ${cleanMsg}\n`;
      const fileName = `${new Date().toISOString().split('T')[0]}.log`;
      fs.appendFileSync(path.join(this.logDir, fileName), line);
    } catch (e) {}
  }

  info(tag, ...msg) { this.print('info', tag, msg.join(' ')); }
  warn(tag, ...msg) { this.print('warn', tag, msg.join(' ')); }
  error(tag, ...msg) { this.print('error', tag, msg.join(' ')); }
  debug(tag, ...msg) { if (this.level <= this.levels.debug) this.print('debug', tag, msg.join(' ')); }
}

class ConfigManager {
  constructor() {
    this.botConfigPath = path.join(ROOT, 'config', 'bot.json');
    this.pluginConfigPath = path.join(ROOT, 'config', 'plugins.json');
    this.bot = {}; this.plugins = {};
  }
  
  async load() {
    try { this.bot = JSON.parse(await fsPromises.readFile(this.botConfigPath, 'utf-8')); } catch { this.bot = {}; }
    try { this.plugins = JSON.parse(await fsPromises.readFile(this.pluginConfigPath, 'utf-8')); } catch { this.plugins = {}; }
  }

  get(key, defaultValue = null) {
    const keys = key.split('.');
    let current = this.bot;
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) current = current[k];
      else return defaultValue;
    }
    return current ?? defaultValue;
  }
}

class PluginRegistry {
  constructor(logger) { this.plugins = new Map(); this.logger = logger; }
  register(pluginObj) {
    if (!pluginObj || typeof pluginObj !== 'object' || !pluginObj.name) return false;
    const { name, version = '1.0.0', type = 'utility', priority = 10 } = pluginObj;
    this.plugins.set(name, { ...pluginObj, version, type, priority, enabled: true });
    this.logger.debug('PLUGIN', `Loaded: ${name} v${version}`);
    return true;
  }
  list() { return Array.from(this.plugins.values()); }
}

export class BotCoreEngine {
  constructor() {
    this.logger = new Logger();
    this.config = new ConfigManager();
    this.registry = new PluginRegistry(this.logger);
    this.eventBus = new EventEmitter();
    this.cooldowns = new Map();
    
    this.usersFile = path.join(ROOT, 'data', 'users.json');
    this.settingsFile = path.join(ROOT, 'data', 'settings.json');

    this.users = new Map();
    this.settings = {}; 
    this.saveTimeout = null;

    this.mockWA = {}; 
    this.utils = { sleep: (ms) => new Promise(r => setTimeout(r, ms)) };

    this.startFileWatcher();
  }

  async loadDatabases() {
    try {
        if (!fs.existsSync(path.dirname(this.usersFile))) fs.mkdirSync(path.dirname(this.usersFile), { recursive: true });
        if (!fs.existsSync(this.usersFile)) await fsPromises.writeFile(this.usersFile, '{}');
        const raw = await fsPromises.readFile(this.usersFile, 'utf-8');
        const obj = JSON.parse(raw);
        for (const [k, v] of Object.entries(obj)) this.users.set(k, v);
        this.logger.info('DB', `Users Loaded: ${this.users.size}`);
    } catch(e) { this.users = new Map(); }

    try {
        if (!fs.existsSync(this.settingsFile)) {
            this.settings = { groupMode: true, privateMode: true, selfMessage: true };
            await fsPromises.writeFile(this.settingsFile, JSON.stringify(this.settings, null, 2));
        } else {
            const raw = await fsPromises.readFile(this.settingsFile, 'utf-8');
            this.settings = JSON.parse(raw);
        }
        this.logger.info('DB', `Settings Loaded.`);
    } catch(e) { 
        this.settings = { groupMode: true, privateMode: true, selfMessage: true }; 
    }
  }

  async saveData(force = false) {
    if (this.saveTimeout && !force) clearTimeout(this.saveTimeout);
    const doSave = async () => {
      try {
        await fsPromises.writeFile(this.usersFile, JSON.stringify(Object.fromEntries(this.users), null, 2));
        await fsPromises.writeFile(this.settingsFile, JSON.stringify(this.settings, null, 2));
      } catch (err) { this.logger.error('DB', 'Save failed:', err.message); }
    };
    if (force) await doSave(); else this.saveTimeout = setTimeout(doSave, 2000);
  }

  async registerUser(ctx) {
    if (!ctx || !ctx.senderNumber) return;
    const id = ctx.senderNumber;
    let user = this.users.get(id);
    const now = new Date().toISOString();
    
    const envOwner = process.env.OWNER_NUMBER ? String(process.env.OWNER_NUMBER).replace(/\D/g, '') : '';
    const incomingId = id.replace(/\D/g, ''); 
    
    let isOwner = false;
    if (envOwner === incomingId) isOwner = true;
    if (incomingId.startsWith('62') && envOwner.startsWith('0') && incomingId.slice(2) === envOwner.slice(1)) isOwner = true;
    if (incomingId.startsWith('0') && envOwner.startsWith('62') && incomingId.slice(1) === envOwner.slice(2)) isOwner = true;

    if (!user) {
        user = { id, name: ctx.pushName||'User', role: 'member', tokens: 10, interactions: 0, createdAt: now };
        this.users.set(id, user);
    }
    user.lastSeen = now;
    user.interactions++;
    
    if (isOwner) user.role = 'owner';
    else if (ctx.fromMe) user.role = 'bot';
    
    this.saveData();
    return user;
  }

  buildContext(rawEvent) {
    return {
      ...rawEvent,
      bot: this.mockWA,
      reply: async (text) => {
        try { return await this.mockWA.reply(rawEvent.chatId, text, { quoted: rawEvent.raw }); }
        catch(e) { this.logger.error('REPLY', `Failed: ${e.message}`); }
      },
      sendMessage: async (content) => {
         try { return await this.mockWA.sendMessage(rawEvent.chatId, content); }
         catch(e) { this.logger.error('SEND', `Failed: ${e.message}`); }
      },
      react: async (emoji) => {
         try { return await this.mockWA.react(rawEvent.chatId, emoji, rawEvent.raw); }
         catch(e) { this.logger.error('REACT', `Failed: ${e.message}`); }
      },
      config: this.config, logger: this.logger,
      user: this.users.get(rawEvent.senderNumber),
      settings: this.settings,
      updateSettings: (key, value) => {
          this.settings[key] = value;
          this.saveData(true); 
      },
      // --- [FIX] INI YANG HILANG SEHINGGA MENU ERROR ---
      listPlugins: () => this.registry.list(), 
      // -------------------------------------------------
    };
  }

  async dispatchEvent(eventName, rawData) {
    let ctx;
    if (eventName === 'message') {
        ctx = this.buildContext(rawData);
        try { ctx.user = await this.registerUser(ctx); } catch {}

        const body = (ctx.body || '').trim();
        const isCommand = /^[.!/#]/.test(body);
        const isOwner = ctx.user?.role === 'owner';
      
        if (isCommand) {
            const parts = body.slice(1).trim().split(/\s+/);
            const cmdName = parts[0].toLowerCase();
            ctx.command = cmdName;
            ctx.args = parts.slice(1);
            
            this.logger.info('CMD', `${cmdName} | ${ctx.pushName} | ${isOwner ? 'OWNER' : 'USER'}`);

            // === GLOBAL FILTER ===
            // CATATAN: Owner selalu di-bypass agar tidak terkunci
            if (!isOwner) {
                // Jika Group Mode OFF -> Member Grup tidak bisa pakai bot
                if (ctx.isGroup && !this.settings.groupMode) return;
                // Jika Private Mode OFF -> Member PC tidak bisa pakai bot
                if (!ctx.isGroup && !this.settings.privateMode) return;
                
                // Cooldown
                const cdKey = `${ctx.senderNumber}:${cmdName}`;
                const now = Date.now();
                if (this.cooldowns.has(cdKey) && now - this.cooldowns.get(cdKey) < 2000) return;
                this.cooldowns.set(cdKey, now);
            }

            const plugins = this.registry.list().filter(p => p.enabled && p.type === 'command');
            for (const p of plugins) {
                if ((Array.isArray(p.cmd) ? p.cmd : [p.cmd]).includes(cmdName)) {
                    try { await p.run({ ...ctx, plugin: p }); } 
                    catch (e) { 
                        this.logger.error('PLUGIN', `Error in ${p.name}:`, e.message); 
                        ctx.reply(`❌ System Error: ${e.message}`);
                    }
                }
            }
        }
    } else {
        ctx = { ...rawData, bot: this.mockWA };
    }
  }

  async loadPlugins() {
    const pluginsDir = path.join(ROOT, 'plugins');
    if (!fs.existsSync(pluginsDir)) return;
    const files = await fsPromises.readdir(pluginsDir).then(f => f.filter(x => x.endsWith('.js')));
    for (const f of files) {
        try {
            const module = await import(pathToFileURL(path.join(pluginsDir, f)).href);
            const plugin = module.default || module;
            if (plugin?.name) this.registry.register(plugin);
        } catch (e) { this.logger.error('LOAD', `Fail ${f}:`, e.message); }
    }
  }

  startFileWatcher() {
    chokidar.watch(path.join(ROOT, 'config')).on('change', () => this.config.load());
  }

  async start() {
    console.clear();
    this.logger.info('CORE', 'Starting Engine v4.6 (Menu Fix)...');
    await this.config.load();
    await this.loadDatabases(); 
    await this.loadPlugins();
    this.logger.info('CORE', 'Engine Ready!');
  }
}

const engine = new BotCoreEngine();
export default engine;
if (import.meta.url === `file://${process.argv[1]}`) engine.start();