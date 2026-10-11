'use strict';
// Agent tools implemented on node fs/child_process (no editor API), scoped to a repo root.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const TOOLS = [
  fn('read_file', 'Read a text file. Returns numbered lines.', { path: s('Path relative to the repo root'), start_line: n('Optional 1-based start'), end_line: n('Optional 1-based end') }, ['path']),
  fn('list_dir', 'List files and folders in a directory.', { path: s('Directory, "." for the repo root') }, ['path']),
  fn('grep', 'Search files for a regular expression. Returns file:line: text.', { pattern: s('JavaScript regex'), path: s('Optional sub-directory') }, ['pattern']),
  fn('edit_file', 'Replace one exact, unique occurrence of old_string with new_string in a file.', { path: s('File path'), old_string: s('Exact text to replace'), new_string: s('Replacement') }, ['path', 'old_string', 'new_string']),
  fn('write_file', 'Create or overwrite a file.', { path: s('File path'), content: s('Full content') }, ['path', 'content']),
  fn('run_command', 'Run a shell command in the repo root. May require user approval.', { command: s('Shell command'), background: { type: 'boolean', description: 'Start a long-running process (dev server) and return immediately' } }, ['command']),
];
function s(description) { return { type: 'string', description }; }
function n(description) { return { type: 'number', description }; }
function fn(name, description, properties, required) { return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } }; }

const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '.venv', '__pycache__']);

function abs(root, p) {
  const full = path.resolve(root, p || '.');
  return full;
}

function walk(root, dir, cb, depth = 0) {
  if (depth > 8) return;
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, p, cb, depth + 1); else if (cb(p) === false) return;
  }
}

async function exec(name, a, ctx) {
  const root = ctx.root;
  switch (name) {
    case 'read_file': {
      const lines = fs.readFileSync(abs(root, a.path), 'utf8').split('\n');
      const from = Math.max(1, a.start_line || 1), to = Math.min(lines.length, a.end_line || lines.length);
      const out = lines.slice(from - 1, to).map((l, i) => `${from + i}\t${l}`).join('\n');
      return out.length > 60000 ? out.slice(0, 60000) + '\n…(truncated)' : out;
    }
    case 'list_dir':
      return fs.readdirSync(abs(root, a.path || '.'), { withFileTypes: true }).filter((e) => !SKIP.has(e.name)).map((e) => e.name + (e.isDirectory() ? '/' : '')).sort().join('\n') || '(empty)';
    case 'grep': {
      const re = new RegExp(a.pattern, 'i'); const hits = [];
      walk(root, abs(root, a.path || '.'), (p) => {
        if (hits.length >= 80) return false;
        let st; try { st = fs.statSync(p); } catch { return; }
        if (st.size > 400000) return;
        let t; try { t = fs.readFileSync(p, 'utf8'); } catch { return; }
        if (t.includes('\u0000')) return;
        t.split('\n').forEach((l, i) => { if (hits.length < 80 && re.test(l)) hits.push(`${path.relative(root, p)}:${i + 1}: ${l.trim().slice(0, 200)}`); });
      });
      return hits.join('\n') || 'No matches.';
    }
    case 'edit_file': {
      const p = abs(root, a.path); const t = fs.readFileSync(p, 'utf8');
      const i = t.indexOf(a.old_string);
      if (i < 0) return 'ERROR: old_string not found. Re-read the file and copy the text exactly.';
      if (t.indexOf(a.old_string, i + 1) >= 0) {
        const lines = []; let k = -1; while ((k = t.indexOf(a.old_string, k + 1)) >= 0 && lines.length < 6) lines.push(t.slice(0, k).split('\n').length);
        return `ERROR: old_string matches ${lines.length}+ places (lines ${lines.join(', ')}). Include more surrounding lines so it is unique, or use write_file with the full new content.`;
      }
      ctx.checkpoint(p);
      fs.writeFileSync(p, t.slice(0, i) + a.new_string + t.slice(i + a.old_string.length));
      return 'OK: edited ' + a.path;
    }
    case 'write_file': {
      const p = abs(root, a.path); ctx.checkpoint(p);
      fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, a.content);
      return 'OK: wrote ' + a.path;
    }
    case 'run_command': {
      if (!ctx.autoRun && !(await ctx.approve(a.command))) return 'The user declined to run this command.';
      if (a.background) return ctx.spawnBackground(a.command);
      return await new Promise((res) => cp.exec(a.command, { cwd: root, timeout: 120000, maxBuffer: 4e6, env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' } }, (err, so, se) => {
        const out = (so || '') + (se ? '\n[stderr]\n' + se : '');
        res((err && err.killed ? '[timed out]\n' : '') + (err && err.code != null ? `[exit ${err.code}]\n` : '') + (out.length > 20000 ? out.slice(-20000) : out || '(no output)'));
      }));
    }
    default: return 'ERROR: unknown tool ' + name;
  }
}

function parseTextToolCalls(text) {
  const names = new Set(TOOLS.map((t) => t.function.name));
  const cleaned = text.replace(/<\/?tool_call>/g, '\n').replace(/```(?:json)?/g, '\n');
  const out = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && --depth === 0 && start >= 0) {
      try {
        const o = JSON.parse(cleaned.slice(start, i + 1)); const name = o.name || (o.function && o.function.name);
        const args = o.arguments || o.parameters || {};
        if (names.has(name)) out.push({ id: 'call_' + out.length + Date.now(), name, args: typeof args === 'string' ? args : JSON.stringify(args) });
      } catch { /* ignore */ }
      start = -1;
    }
  }
  return out;
}

module.exports = { TOOLS, exec, parseTextToolCalls, walk, SKIP };
