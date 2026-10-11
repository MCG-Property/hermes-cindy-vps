'use strict';
const vscode = require('vscode');
const cp = require('child_process');
const path = require('path');
const { streamChat } = require('./llm');

const enc = new TextEncoder();
const dec = new TextDecoder();

const TOOLS = [
  fn('read_file', 'Read a text file from the workspace. Returns numbered lines.', { path: s('Workspace-relative or absolute path'), start_line: n('Optional 1-based start'), end_line: n('Optional 1-based end') }, ['path']),
  fn('list_dir', 'List files and folders in a directory.', { path: s('Directory path, "." for the workspace root') }, ['path']),
  fn('grep', 'Search workspace files for a regular expression. Returns file:line: text.', { pattern: s('JavaScript regex'), glob: s('Optional glob such as src/**/*.ts') }, ['pattern']),
  fn('edit_file', 'Replace one exact occurrence of old_string with new_string in a file. old_string must be unique; include enough context.', { path: s('File path'), old_string: s('Exact text to replace'), new_string: s('Replacement text') }, ['path', 'old_string', 'new_string']),
  fn('write_file', 'Create or overwrite a file with the given content.', { path: s('File path'), content: s('Full file content') }, ['path', 'content']),
  fn('run_command', 'Run a shell command in the workspace root and return its output. The user may be asked to approve it.', { command: s('Shell command') }, ['command']),
];
function s(description) { return { type: 'string', description }; }
function n(description) { return { type: 'number', description }; }
function fn(name, description, properties, required) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

function root() {
  const f = vscode.workspace.workspaceFolders;
  return f && f[0] ? f[0].uri : null;
}
function resolve(p) {
  const r = root();
  if (path.isAbsolute(p)) return vscode.Uri.file(p);
  if (!r) throw new Error('Open a folder first.');
  return vscode.Uri.joinPath(r, p);
}
async function readText(uri) {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) return open.getText();
  return dec.decode(await vscode.workspace.fs.readFile(uri));
}

// Applies text to a file through the editor so it participates in undo and shows as a dirty edit.
async function writeViaEditor(uri, text) {
  let exists = true;
  try { await vscode.workspace.fs.stat(uri); } catch { exists = false; }
  if (!exists) {
    await vscode.workspace.fs.writeFile(uri, enc.encode(text));
    return;
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  const we = new vscode.WorkspaceEdit();
  we.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), text);
  await vscode.workspace.applyEdit(we);
  await doc.save();
}

class Checkpoints {
  constructor() { this.map = new Map(); }
  async remember(uri) {
    const k = uri.toString();
    if (this.map.has(k)) return;
    try { this.map.set(k, { uri, text: await readText(uri) }); } catch { this.map.set(k, { uri, text: null }); }
  }
  async revertAll() {
    for (const { uri, text } of this.map.values()) {
      if (text === null) { try { await vscode.workspace.fs.delete(uri); } catch {} } else await writeViaEditor(uri, text);
    }
    const n = this.map.size; this.map.clear(); return n;
  }
  get size() { return this.map.size; }
}

async function execTool(name, args, ctx) {
  switch (name) {
    case 'read_file': {
      const text = await readText(resolve(args.path));
      const lines = text.split('\n');
      const a = Math.max(1, args.start_line || 1), b = Math.min(lines.length, args.end_line || lines.length);
      const out = lines.slice(a - 1, b).map((l, i) => `${a + i}\t${l}`).join('\n');
      return out.length > 60000 ? out.slice(0, 60000) + '\n…(truncated)' : out;
    }
    case 'list_dir': {
      const entries = await vscode.workspace.fs.readDirectory(resolve(args.path || '.'));
      return entries.sort().map(([nm, t]) => nm + (t === vscode.FileType.Directory ? '/' : '')).join('\n') || '(empty)';
    }
    case 'grep': {
      const re = new RegExp(args.pattern, 'i');
      const files = await vscode.workspace.findFiles(args.glob || '**/*', '**/{node_modules,.git,dist,out,build}/**', 2000);
      const hits = [];
      for (const f of files) {
        if (hits.length >= 80) break;
        let t; try { t = await readText(f); } catch { continue; }
        if (t.length > 400000 || t.includes('\u0000')) continue;
        t.split('\n').forEach((l, i) => { if (hits.length < 80 && re.test(l)) hits.push(`${vscode.workspace.asRelativePath(f)}:${i + 1}: ${l.trim().slice(0, 200)}`); });
      }
      return hits.join('\n') || 'No matches.';
    }
    case 'edit_file': {
      const uri = resolve(args.path);
      const text = await readText(uri);
      const first = text.indexOf(args.old_string);
      if (first < 0) return 'ERROR: old_string not found. Re-read the file and copy the text exactly.';
      if (text.indexOf(args.old_string, first + 1) >= 0) return 'ERROR: old_string appears more than once; include more surrounding context.';
      await ctx.checkpoints.remember(uri);
      await writeViaEditor(uri, text.slice(0, first) + args.new_string + text.slice(first + args.old_string.length));
      ctx.onEdit && ctx.onEdit(uri);
      return 'OK: edited ' + args.path;
    }
    case 'write_file': {
      const uri = resolve(args.path);
      await ctx.checkpoints.remember(uri);
      await writeViaEditor(uri, args.content);
      ctx.onEdit && ctx.onEdit(uri);
      return 'OK: wrote ' + args.path;
    }
    case 'run_command': {
      const auto = vscode.workspace.getConfiguration('cloneAi').get('agent.autoRunCommands');
      if (!auto) {
        const pick = await vscode.window.showWarningMessage('Agent wants to run:\n' + args.command, { modal: true }, 'Run');
        if (pick !== 'Run') return 'The user declined to run this command.';
      }
      const cwd = root() ? root().fsPath : undefined;
      return await new Promise((res) => {
        cp.exec(args.command, { cwd, timeout: 120000, maxBuffer: 4 * 1024 * 1024 }, (err, so, se) => {
          const out = (so || '') + (se ? '\n[stderr]\n' + se : '');
          res(((err && err.killed) ? '[timed out]\n' : '') + (err && err.code != null ? `[exit ${err.code}]\n` : '') + (out.length > 20000 ? out.slice(-20000) : out || '(no output)'));
        });
      });
    }
    default: return 'ERROR: unknown tool ' + name;
  }
}

function parseTextToolCalls(text) {
  const names = new Set(TOOLS.map((t) => t.function.name));
  const cleaned = text.replace(/<\/?tool_call>/g, '\n').replace(/```(?:json)?/g, '\n');
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && --depth === 0 && start >= 0) {
      try {
        const o = JSON.parse(cleaned.slice(start, i + 1));
        const name = o.name || (o.function && o.function.name);
        const args = o.arguments || o.parameters || (o.function && o.function.arguments) || {};
        if (names.has(name)) out.push({ id: 'call_' + out.length + '_' + Date.now(), name, args: typeof args === 'string' ? args : JSON.stringify(args) });
      } catch { /* not JSON */ }
      start = -1;
    }
  }
  return out;
}

// Runs the tool loop. emit(ev) reports progress to the UI. Returns the updated message list.
async function runAgent({ llm, messages, emit, signal, checkpoints, maxSteps = 25 }) {
  const ctx = { checkpoints, onEdit: (uri) => emit({ type: 'edited', file: vscode.workspace.asRelativePath(uri) }) };
  for (let step = 0; step < maxSteps; step++) {
    let text = '', calls = [], held = false, decided = false, sent = 0;
    const looksLikeToolJson = (t) => /^(<tool_call>|```(json)?\s*\{|\{)/.test(t.trim());
    const flush = () => { if (text.length > sent) { emit({ type: 'text', text: text.slice(sent) }); sent = text.length; } };
    for await (const ev of streamChat({ ...llm, messages, tools: TOOLS, signal })) {
      if (ev.type === 'text') {
        text += ev.text;
        // Some local models print the tool call as JSON text instead of using tool_calls: hold such output back.
        if (!decided && text.trim().length >= 12) { decided = true; held = looksLikeToolJson(text); }
        if (decided && !held) flush();
      } else if (ev.type === 'done') calls = ev.toolCalls;
    }
    if (!decided) { decided = true; held = looksLikeToolJson(text); }
    if (!held) flush();
    else if (!calls.length) {
      const parsed = parseTextToolCalls(text);
      if (parsed.length) { calls = parsed; text = ''; } else flush();
    } else text = '';
    const am = { role: 'assistant', content: text || null };
    if (calls.length) am.tool_calls = calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }));
    messages.push(am);
    if (!calls.length) return messages;
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.args || '{}'); } catch { /* handled below */ }
      emit({ type: 'tool', id: c.id, name: c.name, args });
      let result;
      try { result = await execTool(c.name, args, ctx); } catch (e) { result = 'ERROR: ' + (e && e.message || e); }
      emit({ type: 'tool_result', id: c.id, name: c.name, result: String(result).slice(0, 4000) });
      messages.push({ role: 'tool', tool_call_id: c.id, content: String(result) });
      if (signal && signal.aborted) return messages;
    }
  }
  emit({ type: 'text', text: '\n\n_Stopped after reaching the step limit._' });
  return messages;
}

module.exports = { runAgent, Checkpoints, TOOLS };
