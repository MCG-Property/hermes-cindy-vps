'use strict';
const vscode = require('vscode');
const { chatOnce, fim, stripFence } = require('./llm');
const ctxm = require('./context');

let getLlmRef = null;
function init(getLlm) { getLlmRef = getLlm; }

const addedDeco = vscode.window.createTextEditorDecorationType({
  isWholeLine: true,
  backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  overviewRulerColor: new vscode.ThemeColor('editorGutter.addedBackground'),
  overviewRulerLane: vscode.OverviewRulerLane.Left,
});

// ----- Cmd+K: inline edit with accept / reject / retry --------------------------------------
let pending = null; // {uri, original, range, instruction, selectionText}
const lensEmitter = new vscode.EventEmitter();

function setPending(p) {
  pending = p;
  vscode.commands.executeCommand('setContext', 'cloneAi.hasPendingEdit', !!p);
  lensEmitter.fire();
}

const lensProvider = {
  onDidChangeCodeLenses: lensEmitter.event,
  provideCodeLenses(doc) {
    if (!pending || pending.uri.toString() !== doc.uri.toString()) return [];
    const r = new vscode.Range(pending.range.start, pending.range.start);
    return [
      new vscode.CodeLens(r, { title: '$(check) Accept  ⌘↵', command: 'cloneAi.acceptEdit' }),
      new vscode.CodeLens(r, { title: '$(close) Reject  ⌘⌫', command: 'cloneAi.rejectEdit' }),
      new vscode.CodeLens(r, { title: '$(refresh) Retry', command: 'cloneAi.retryEdit' }),
    ];
  },
};

async function inlineEdit(retryInstruction) {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;
  if (pending) await acceptEdit();
  const doc = ed.document;
  let sel = ed.selection;
  const instruction = retryInstruction || await vscode.window.showInputBox({
    prompt: sel.isEmpty ? 'Describe the code to generate at the cursor (⌘K)' : 'Describe how to edit the selection (⌘K)',
    placeHolder: 'e.g. add error handling, convert to async, write a docstring…',
    ignoreFocusOut: false,
  });
  if (!instruction) return;
  if (sel.isEmpty) sel = new vscode.Selection(ed.selection.active, ed.selection.active);
  const selText = doc.getText(sel);
  const before = doc.getText(new vscode.Range(new vscode.Position(Math.max(0, sel.start.line - 60), 0), sel.start));
  const after = doc.getText(new vscode.Range(sel.end, new vscode.Position(Math.min(doc.lineCount - 1, sel.end.line + 40), 1e6)));
  const llm = await getLlmRef();
  const system = 'You are a code editing engine. Output ONLY the replacement code for the marked region, with no explanations and no markdown fences. Preserve indentation and surrounding style.';
  const user = `File: ${vscode.workspace.asRelativePath(doc.uri)} (${doc.languageId})\n\n<before>\n${before}\n</before>\n<region>\n${selText}\n</region>\n<after>\n${after}\n</after>\n\nInstruction: ${instruction}\n\nReturn the new content of <region> only.`;

  let out;
  try {
    out = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Clone AI: editing…', cancellable: true }, (_p, token) => {
      const ac = new AbortController();
      token.onCancellationRequested(() => ac.abort());
      return chatOnce({ ...llm, messages: [{ role: 'system', content: system + (await_rules_sync()) }, { role: 'user', content: user }], signal: ac.signal });
    });
  } catch (e) {
    if (!/abort/i.test(String(e))) vscode.window.showErrorMessage('Clone AI: ' + (e.message || e));
    return;
  }
  out = stripFence(out).replace(/^\n+|\n+$/g, '');
  if (selText.endsWith('\n') && !out.endsWith('\n')) out += '\n';
  const ok = await ed.edit((b) => b.replace(sel, out));
  if (!ok) return;
  const start = sel.start;
  const endPos = doc.positionAt(doc.offsetAt(start) + out.length);
  const range = new vscode.Range(start, endPos);
  ed.setDecorations(addedDeco, [range]);
  ed.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  setPending({ uri: doc.uri, original: selText, range, instruction });
}
let rulesCache = '';
function await_rules_sync() { return rulesCache; }
ctxm.rulesText().then((r) => { rulesCache = r; }).catch(() => {});

function clearDeco() { for (const e of vscode.window.visibleTextEditors) e.setDecorations(addedDeco, []); }

async function acceptEdit() { clearDeco(); setPending(null); }
async function rejectEdit() {
  if (!pending) return;
  const p = pending;
  const doc = await vscode.workspace.openTextDocument(p.uri);
  const we = new vscode.WorkspaceEdit();
  we.replace(p.uri, p.range, p.original);
  await vscode.workspace.applyEdit(we);
  clearDeco(); setPending(null);
  void doc;
}
async function retryEdit() {
  if (!pending) return;
  const instr = pending.instruction;
  await rejectEdit();
  const ed = vscode.window.activeTextEditor;
  if (ed) await inlineEdit(await vscode.window.showInputBox({ value: instr, prompt: 'Retry with instruction' }));
}

// ----- Apply a code block from chat ---------------------------------------------------------
const virtual = new Map();
const virtualProvider = { provideTextDocumentContent(uri) { return virtual.get(uri.path) || ''; } };

async function applyCodeToEditor(code, relPath) {
  let uri;
  const root = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (relPath && root) uri = vscode.Uri.joinPath(root.uri, relPath);
  const ed = vscode.window.activeTextEditor;
  if (!uri && !ed) return vscode.window.showWarningMessage('Open a file to apply the code to.');
  if (!uri) uri = ed.document.uri;
  let doc;
  try { doc = await vscode.workspace.openTextDocument(uri); } catch { await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(code)); return vscode.window.showTextDocument(uri); }
  const useSel = ed && ed.document.uri.toString() === uri.toString() && !ed.selection.isEmpty;
  const full = new vscode.Range(0, 0, doc.lineCount, 0);
  const target = useSel ? ed.selection : full;
  const proposed = useSel ? doc.getText(new vscode.Range(new vscode.Position(0, 0), target.start)) + code + doc.getText(new vscode.Range(target.end, full.end)) : code;
  const key = '/' + Date.now() + '/' + uri.path.split('/').pop();
  virtual.set(key, proposed);
  await vscode.commands.executeCommand('vscode.diff', uri, vscode.Uri.parse('clone-proposed:' + key), `Proposed change · ${uri.path.split('/').pop()}`);
  const pick = await vscode.window.showInformationMessage('Apply this change?', 'Accept', 'Reject');
  if (pick === 'Accept') {
    const we = new vscode.WorkspaceEdit();
    we.replace(uri, full, proposed);
    await vscode.workspace.applyEdit(we);
    await vscode.window.showTextDocument(uri);
  }
  virtual.delete(key);
}

// ----- Tab completion (ghost text) ----------------------------------------------------------
let tabEnabled = true;
let inflight = null;
const tabProvider = {
  async provideInlineCompletionItems(doc, pos, _ctx, token) {
    const cfg = vscode.workspace.getConfiguration('cloneAi');
    if (!tabEnabled || !cfg.get('tab.enabled')) return;
    if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') return;
    await new Promise((r) => setTimeout(r, cfg.get('tab.debounceMs') || 350));
    if (token.isCancellationRequested) return;
    const prefix = doc.getText(new vscode.Range(new vscode.Position(Math.max(0, pos.line - 80), 0), pos));
    const suffix = doc.getText(new vscode.Range(pos, new vscode.Position(Math.min(doc.lineCount - 1, pos.line + 40), 1e6)));
    if (!prefix.trim()) return;
    const llm = await getLlmRef();
    const model = cfg.get('tabModel') || llm.model;
    if (inflight) inflight.abort();
    const ac = (inflight = new AbortController());
    token.onCancellationRequested(() => ac.abort());
    let text = '';
    try {
      text = await fim({ ...llm, model, prefix, suffix, signal: ac.signal });
    } catch {
      try {
        text = stripFence(await chatOnce({ ...llm, model, signal: ac.signal, temperature: 0, messages: [
          { role: 'system', content: 'You are an inline code completion engine. Output ONLY the text to insert at the <CURSOR> marker (no fences, no explanation, at most a few lines). Output nothing if unsure.' },
          { role: 'user', content: `${doc.languageId}\n${prefix}<CURSOR>${suffix}` }] }));
      } catch { return; }
    }
    text = trimCompletion(text, suffix);
    if (!text || token.isCancellationRequested) return;
    return [new vscode.InlineCompletionItem(text, new vscode.Range(pos, pos))];
  },
};
// Models tend to keep writing past the cursor: stop where the existing suffix resumes, and cap the length.
function trimCompletion(text, suffix) {
  const firstSuffixLine = (suffix.split('\n').find((l) => l.trim()) || '').trim();
  if (firstSuffixLine.length >= 2) {
    const i = text.indexOf(firstSuffixLine);
    if (i > 0) text = text.slice(0, i);
    else if (i === 0) return '';
  }
  const lines = text.split('\n');
  const blank = lines.findIndex((l, k) => k > 0 && !l.trim());
  if (blank > 0) lines.length = blank;
  if (lines.length > 12) lines.length = 12;
  return lines.join('\n').replace(/\s+$/, '');
}
function toggleTab() { tabEnabled = !tabEnabled; vscode.window.setStatusBarMessage(`Clone AI tab completion ${tabEnabled ? 'on' : 'off'}`, 2500); return tabEnabled; }
function tabState() { return tabEnabled; }

function register(ctx) {
  ctx.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: '*' }, lensProvider),
    vscode.workspace.registerTextDocumentContentProvider('clone-proposed', virtualProvider),
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, tabProvider),
  );
}

module.exports = { init, register, inlineEdit, acceptEdit, rejectEdit, retryEdit, applyCodeToEditor, toggleTab, tabState };
