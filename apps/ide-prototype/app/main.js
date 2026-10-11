'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');
const store = require('./store');
const llm = require('./llm');
const tools = require('./tools');

let pty = null;
try { pty = require('@lydell/node-pty'); } catch (e) { console.error('node-pty unavailable', e.message); }

const IDE_APP = (() => {
  const c = [process.env.CLONE_IDE_APP, (() => { try { return fs.readFileSync(path.join(__dirname, 'ide-path.txt'), 'utf8').trim(); } catch { return ''; } })(), path.join(__dirname, '..', 'Clone IDE.app')].filter(Boolean);
  return c.find((p) => fs.existsSync(p)) || c[0];
})();
let win = null;
const S = () => store.get();
const uid = () => crypto.randomBytes(6).toString('hex');
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };

nativeTheme.themeSource = 'dark';

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 900, minHeight: 560,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 },
    backgroundColor: '#151515', title: 'Clone',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true, spellcheck: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Clone', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ]));
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => { killAllTerms(); if (process.platform !== 'darwin') app.quit(); });

// ---------- state ----------
const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { return await fn(...a); } catch (e) { return { __error: String(e && e.message || e) }; } });
const light = (c) => ({ id: c.id, title: c.title, repo: c.repo, pinned: c.pinned, unread: c.unread, running: !!running.get(c.id), updated: c.updated, created: c.created });

handle('state:get', () => ({ repos: S().repos, projects: S().projects || [], chats: S().chats.map(light), activeChat: S().activeChat, settings: { ...S().settings, apiKey: S().settings.apiKey ? '••••' : '' } }));
handle('repo:add', async (p) => {
  if (!p) { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }); if (r.canceled) return null; p = r.filePaths[0]; }
  if (!S().repos.find((r) => r.path === p)) { S().repos.push({ path: p, name: path.basename(p), added: Date.now() }); store.save(); }
  return p;
});
handle('repo:remove', (p) => { S().repos = S().repos.filter((r) => r.path !== p); store.save(); return true; });
handle('project:add', (name) => { S().projects = S().projects || []; S().projects.push({ id: uid(), name, created: Date.now() }); store.save(); return true; });
handle('settings:set', (patch) => { if (patch.apiKey === '••••') delete patch.apiKey; Object.assign(S().settings, patch); store.save(); return true; });
handle('models:list', async () => { try { return await llm.listModels(S().settings); } catch { return []; } });

// ---------- chats ----------
const running = new Map(); // chatId -> {abort, started}
const checkpoints = new Map(); // chatId -> Map(path -> original|null)
const getChat = (id) => S().chats.find((c) => c.id === id);

handle('chat:new', (repo) => {
  const c = { id: uid(), title: 'New chat', repo: repo || null, pinned: false, unread: false, created: Date.now(), updated: Date.now(), mode: 'agent', ui: [], history: [] };
  S().chats.unshift(c); S().activeChat = c.id; store.save(); return light(c);
});
handle('chat:get', (id) => { const c = getChat(id); if (!c) return null; S().activeChat = id; c.unread = false; store.save(); return { ...light(c), ui: c.ui, mode: c.mode, changes: (checkpoints.get(id) || new Map()).size }; });
handle('chat:pin', (id) => { const c = getChat(id); if (c) { c.pinned = !c.pinned; store.save(); } return true; });
handle('chat:rename', (id, title) => { const c = getChat(id); if (c) { c.title = title; store.save(); } return true; });
handle('chat:delete', (id) => { S().chats = S().chats.filter((c) => c.id !== id); if (S().activeChat === id) S().activeChat = null; store.save(); return true; });
handle('chat:stop', (id) => { const r = running.get(id); if (r) r.abort.abort(); return true; });
handle('chat:setMode', (id, mode) => { const c = getChat(id); if (c) { c.mode = mode; store.save(); } return true; });
handle('chat:revertAll', async (id) => {
  const m = checkpoints.get(id); if (!m) return 0; let n = 0;
  for (const [p, orig] of m) { try { if (orig === null) fs.rmSync(p, { force: true }); else fs.writeFileSync(p, orig); n++; } catch {} }
  checkpoints.delete(id); return n;
});
handle('chat:keepAll', (id) => { checkpoints.delete(id); return true; });

const approvals = new Map();
ipcMain.on('approve:answer', (_e, { id, ok }) => { const r = approvals.get(id); if (r) { approvals.delete(id); r(ok); } });
const bg = new Map(); // chatId -> [{pid, command, log}]

function rulesFor(root) {
  if (!root) return '';
  const parts = [];
  for (const n of ['.clonerules', '.cursorrules', 'AGENTS.md', 'CLAUDE.md']) { try { parts.push(`# ${n}\n` + fs.readFileSync(path.join(root, n), 'utf8').slice(0, 8000)); } catch {} }
  try { const d = path.join(root, '.cursor', 'rules'); for (const f of fs.readdirSync(d)) if (/\.mdc?$/.test(f)) parts.push(`# .cursor/rules/${f}\n` + fs.readFileSync(path.join(d, f), 'utf8').slice(0, 6000)); } catch {}
  return parts.length ? '\n\nProject rules (follow them):\n' + parts.join('\n\n') : '';
}
function systemPrompt(chat) {
  const base = `You are Clone, a precise coding agent. Repository: ${chat.repo || '(none selected)'}. Be concise. Use fenced code blocks with language tags.`;
  const agent = `\nYou are in AGENT mode with tools to read, search and edit files and run commands. Explore first, make minimal exact edits with edit_file, verify when sensible, and finish with a short summary. To run a dev server use run_command with background=true and tell the user the URL.`;
  const plan = `\nYou are in PLAN mode: do not edit files. Explore with read-only tools, then write a concise step-by-step plan.`;
  const ask = `\nYou are in ASK mode: answer questions about the code; do not edit files.`;
  return base + (chat.mode === 'agent' ? agent : chat.mode === 'plan' ? plan : ask) + rulesFor(chat.repo);
}

async function titleFor(chat, text) {
  chat.title = text.replace(/\s+/g, ' ').slice(0, 48);
  send('chat:event', { chatId: chat.id, type: 'title', title: chat.title });
  try {
    const t = await llm.chatOnce({ ...S().settings, temperature: 0.2, messages: [{ role: 'system', content: 'Write a 2-5 word title for this coding task. Output only the title, no quotes or punctuation.' }, { role: 'user', content: text.slice(0, 600) }] });
    const clean = t.replace(/["'.\n]/g, '').trim();
    if (clean && clean.length < 60) { chat.title = clean; send('chat:event', { chatId: chat.id, type: 'title', title: clean }); }
  } catch {}
  store.save();
}

handle('chat:send', async ({ chatId, text, attachments = [], model }) => {
  const chat = getChat(chatId); if (!chat) throw new Error('chat not found');
  if (running.has(chatId)) return false;
  const opts = { ...S().settings, ...(model ? { model } : {}) };
  let content = text;
  const blocks = attachments.map((a) => `<attached ${a.kind} name="${a.name}">\n${a.text}\n</attached>`);
  if (blocks.length) content = blocks.join('\n') + '\n\n' + text;
  chat.history.push({ role: 'user', content });
  chat.ui.push({ id: uid(), role: 'user', text, attachments: attachments.map((a) => a.name), ts: Date.now() });
  const turn = { id: uid(), role: 'assistant', text: '', steps: [], ts: Date.now(), worked: 0 };
  chat.ui.push(turn); chat.updated = Date.now();
  const first = chat.ui.filter((m) => m.role === 'user').length === 1;
  if (first) titleFor(chat, text);
  const ac = new AbortController(); const started = Date.now();
  running.set(chatId, { abort: ac, started });
  send('chat:event', { chatId, type: 'turn_start', turnId: turn.id });
  const emit = (ev) => send('chat:event', { chatId, ...ev });
  const messages = [{ role: 'system', content: systemPrompt(chat) }, ...chat.history];
  const cps = checkpoints.get(chatId) || new Map(); checkpoints.set(chatId, cps);
  const ctx = {
    root: chat.repo || process.cwd(), autoRun: S().settings.autoRun,
    checkpoint: (p) => { if (!cps.has(p)) { try { cps.set(p, fs.readFileSync(p, 'utf8')); } catch { cps.set(p, null); } } },
    approve: (command) => new Promise((res) => { const id = uid(); approvals.set(id, res); emit({ type: 'approve', id, command }); }),
    spawnBackground: (command) => {
      const child = cp.spawn('/bin/zsh', ['-lc', command], { cwd: chat.repo || undefined, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const entry = { pid: child.pid, command, log: '' }; (bg.get(chatId) || bg.set(chatId, []).get(chatId)).push(entry);
      const onData = (d) => { entry.log = (entry.log + d).slice(-8000); const m = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s]*/.exec(entry.log); if (m && !entry.opened) { entry.opened = true; emit({ type: 'browser_open', url: m[0].replace(/[\x1b\u001b]\[[0-9;]*m/g, '') }); } };
      child.stdout.on('data', onData); child.stderr.on('data', onData); child.unref();
      emit({ type: 'bg', count: bg.get(chatId).length });
      return new Promise((res) => setTimeout(() => res(`Started in background (pid ${child.pid}). Output so far:\n${entry.log.slice(-2000) || '(none yet)'}`), 4000));
    },
  };
  const tl = chat.mode === 'agent' ? tools.TOOLS : chat.mode === 'plan' ? tools.TOOLS.filter((t) => ['read_file', 'list_dir', 'grep'].includes(t.function.name)) : null;
  try {
    for (let step = 0; step < 30; step++) {
      let t = '', calls = [], held = false, decided = false, sent = 0;
      const looks = (s) => /^(<tool_call>|```(json)?\s*\{|\{)/.test(s.trim());
      const flush = () => { if (t.length > sent) { const d = t.slice(sent); sent = t.length; turn.text += d; emit({ type: 'text', text: d }); } };
      for await (const ev of llm.streamChat({ ...opts, messages, tools: tl, signal: ac.signal })) {
        if (ev.type === 'text') { t += ev.text; if (!decided && t.trim().length >= 12) { decided = true; held = tl ? looks(t) : false; } if (decided && !held) flush(); }
        else if (ev.type === 'done') calls = ev.toolCalls;
      }
      if (!decided) { decided = true; held = tl ? looks(t) : false; }
      if (!held) flush(); else if (!calls.length) { const p = tools.parseTextToolCalls(t); if (p.length) { calls = p; t = ''; } else flush(); } else t = '';
      const am = { role: 'assistant', content: t || null };
      if (calls.length) am.tool_calls = calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }));
      messages.push(am);
      if (!calls.length) break;
      for (const c of calls) {
        let args = {}; try { args = JSON.parse(c.args || '{}'); } catch {}
        const st = { id: c.id, name: c.name, args }; turn.steps.push(st); emit({ type: 'tool', step: st });
        let r; try { r = await tools.exec(c.name, args, ctx); } catch (e) { r = 'ERROR: ' + (e && e.message || e); }
        st.result = String(r).slice(0, 4000); emit({ type: 'tool_result', id: c.id, result: st.result });
        const url = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/.exec(String(r)); if (url) emit({ type: 'browser_open', url: url[0] });
        messages.push({ role: 'tool', tool_call_id: c.id, content: String(r) });
        if (ac.signal.aborted) break;
      }
      if (ac.signal.aborted) break;
    }
    chat.history = messages.slice(1);
  } catch (e) {
    if (!ac.signal.aborted) { turn.error = String(e && e.message || e); emit({ type: 'error', message: turn.error }); }
  } finally {
    running.delete(chatId);
    turn.worked = Math.round((Date.now() - started) / 1000); chat.updated = Date.now();
    if (win && !win.isFocused()) chat.unread = true;
    store.save();
    emit({ type: 'turn_end', worked: turn.worked, changes: cps.size });
  }
  return true;
});

// ---------- files / git / ide ----------
const SKIP = tools.SKIP;
handle('fs:tree', (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !(e.name === '.git' || e.name === '.DS_Store')).map((e) => ({ name: e.name, dir: e.isDirectory(), path: path.join(dir, e.name) })).sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name)));
handle('fs:read', (p) => { const st = fs.statSync(p); if (st.size > 1.5e6) return { big: true }; const t = fs.readFileSync(p, 'utf8'); return t.includes('\u0000') ? { binary: true } : { text: t }; });
handle('fs:write', (p, t) => { fs.writeFileSync(p, t); return true; });
handle('fs:find', (root, q) => { const out = []; const ql = q.toLowerCase(); tools.walk(root, root, (p) => { if (path.basename(p).toLowerCase().includes(ql) || path.relative(root, p).toLowerCase().includes(ql)) out.push(p); return out.length < 60; }); return out; });
const git = (cwd, args) => new Promise((res) => cp.execFile('git', args, { cwd, maxBuffer: 8e6 }, (e, so) => res(so || '')));
handle('git:changes', async (cwd) => {
  const st = await git(cwd, ['status', '--porcelain']); const num = await git(cwd, ['diff', 'HEAD', '--numstat']);
  const stats = {}; num.split('\n').filter(Boolean).forEach((l) => { const [a, d, f] = l.split('\t'); stats[f] = { add: +a || 0, del: +d || 0 }; });
  return st.split('\n').filter(Boolean).map((l) => ({ status: l.slice(0, 2).trim() || '?', file: l.slice(3), ...(stats[l.slice(3)] || {}) }));
});
handle('git:diff', async (cwd, file) => (await git(cwd, ['diff', 'HEAD', '--', file])) || (await git(cwd, ['diff', '--no-index', '/dev/null', file])));
handle('ide:open', (repo, file) => { if (!fs.existsSync(IDE_APP)) throw new Error('Clone IDE.app not found'); cp.spawn('open', ['-n', IDE_APP, '--args', ...(repo ? [repo] : []), ...(file ? [file] : [])], { detached: true, stdio: 'ignore' }).unref(); return true; });
handle('shell:openExternal', (u) => shell.openExternal(u));
handle('shell:reveal', (p) => shell.showItemInFolder(p));
handle('dialog:attach', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] }); if (r.canceled) return []; return r.filePaths.map((p) => { let text = ''; try { text = fs.readFileSync(p, 'utf8').slice(0, 60000); } catch {} return { kind: 'file', name: path.basename(p), text }; }); });

// ---------- terminals ----------
const terms = new Map();
function killAllTerms() { for (const t of terms.values()) try { t.kill(); } catch {} terms.clear(); }
handle('term:create', ({ cwd, cols, rows }) => {
  if (!pty) throw new Error('terminal unavailable');
  const id = uid(); const sh = process.env.SHELL || '/bin/zsh';
  const t = pty.spawn(sh, ['-l'], { name: 'xterm-256color', cols: cols || 80, rows: rows || 24, cwd: cwd && fs.existsSync(cwd) ? cwd : require('os').homedir(), env: { ...process.env, TERM: 'xterm-256color' } });
  t.onData((d) => send('term:data', { id, data: d })); t.onExit(() => { terms.delete(id); send('term:exit', { id }); });
  terms.set(id, t); return id;
});
ipcMain.on('term:write', (_e, { id, data }) => { const t = terms.get(id); if (t) t.write(data); });
ipcMain.on('term:resize', (_e, { id, cols, rows }) => { const t = terms.get(id); if (t) try { t.resize(cols, rows); } catch {} });
handle('term:kill', (id) => { const t = terms.get(id); if (t) t.kill(); terms.delete(id); return true; });
