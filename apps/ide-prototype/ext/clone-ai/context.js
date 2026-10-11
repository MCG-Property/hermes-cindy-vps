'use strict';
const vscode = require('vscode');
const cp = require('child_process');

const dec = new TextDecoder();

async function rulesText() {
  const f = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!f) return '';
  const names = vscode.workspace.getConfiguration('cloneAi').get('rules.files') || [];
  const parts = [];
  for (const n of names) {
    try { parts.push(`# ${n}\n` + dec.decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(f.uri, n))).slice(0, 8000)); } catch { /* absent */ }
  }
  try {
    const dir = vscode.Uri.joinPath(f.uri, '.cursor', 'rules');
    for (const [nm] of await vscode.workspace.fs.readDirectory(dir)) {
      if (/\.mdc?$/.test(nm)) parts.push(`# .cursor/rules/${nm}\n` + dec.decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, nm))).slice(0, 6000));
    }
  } catch { /* absent */ }
  return parts.length ? '\n\nProject rules (follow them):\n' + parts.join('\n\n') : '';
}

function systemPrompt(mode, rules) {
  const ws = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  const base = `You are Clone AI, a precise coding assistant built into the Clone IDE editor. Workspace: ${ws ? ws.uri.fsPath : '(no folder open)'}. Be concise. Use fenced code blocks with the language tag; when proposing a change to a specific file, put the path on the first line of the block as a comment or in the fence info like \`\`\`ts path=src/a.ts.`;
  const agent = `\n\nYou are in AGENT mode: you can call tools to read, search and edit files and run commands. Explore before editing, make minimal edits with edit_file (exact unique old_string), verify with commands when sensible, and summarise what you changed at the end.`;
  return base + (mode === 'agent' ? agent : '') + rules;
}

function activeContext() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return null;
  const doc = ed.document;
  const sel = ed.selection;
  return {
    file: vscode.workspace.asRelativePath(doc.uri),
    language: doc.languageId,
    selection: sel.isEmpty ? null : { text: doc.getText(sel), startLine: sel.start.line + 1, endLine: sel.end.line + 1 },
    cursorLine: sel.active.line + 1,
  };
}

async function fileAttachment(uri) {
  let text;
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  text = open ? open.getText() : dec.decode(await vscode.workspace.fs.readFile(uri));
  return { kind: 'file', name: vscode.workspace.asRelativePath(uri), text: text.slice(0, 60000) };
}

async function pickMention() {
  const items = [
    { label: '$(git-commit) Git diff', kind: 'git' },
    { label: '$(warning) Problems (open file)', kind: 'problems' },
    { label: '$(selection) Current selection', kind: 'selection' },
  ];
  const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,dist,out,build,.venv}/**', 800);
  for (const f of files) items.push({ label: '$(file) ' + vscode.workspace.asRelativePath(f), kind: 'file', uri: f });
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Add context (@)', matchOnDescription: true });
  if (!pick) return null;
  if (pick.kind === 'file') return fileAttachment(pick.uri);
  if (pick.kind === 'git') {
    const cwd = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
    const out = await new Promise((r) => cp.exec('git diff HEAD', { cwd, maxBuffer: 4e6 }, (e, so) => r(so || '')));
    return { kind: 'git', name: 'git diff', text: out.slice(0, 60000) || '(no changes)' };
  }
  if (pick.kind === 'problems') {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return null;
    const d = vscode.languages.getDiagnostics(ed.document.uri).map((x) => `L${x.range.start.line + 1}: ${x.message}`).join('\n');
    return { kind: 'problems', name: 'problems', text: d || '(none)' };
  }
  const c = activeContext();
  return c && c.selection ? { kind: 'selection', name: `${c.file}:${c.selection.startLine}-${c.selection.endLine}`, text: c.selection.text } : null;
}

module.exports = { rulesText, systemPrompt, activeContext, fileAttachment, pickMention };
