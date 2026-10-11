'use strict';
// Tiny JSON store under ~/.clone-ide/ (projects, chats, settings).
const fs = require('fs');
const os = require('os');
const path = require('path');
const dir = path.join(os.homedir(), '.clone-ide');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'agents.json');
const DEFAULT = {
  settings: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5-coder:7b', apiKey: '', autoRun: false },
  repos: [], chats: [], activeChat: null,
};
let state;
try { state = { ...DEFAULT, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { state = JSON.parse(JSON.stringify(DEFAULT)); }
let t = null;
function save() { clearTimeout(t); t = setTimeout(() => fs.writeFileSync(file, JSON.stringify(state, null, 1)), 150); }
module.exports = { get: () => state, save, dir };
