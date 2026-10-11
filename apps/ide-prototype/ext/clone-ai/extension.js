'use strict';
const vscode = require('vscode');
const { ChatProvider } = require('./chat');
const inline = require('./inline');
const ctxm = require('./context');
const { listModels } = require('./llm');

const SECRET = 'cloneAi.apiKey';

const PRESETS = [
  { label: 'Ollama (local, free)', baseUrl: 'http://127.0.0.1:11434/v1', needsKey: false, model: 'qwen2.5-coder:7b' },
  { label: 'LM Studio (local, free)', baseUrl: 'http://127.0.0.1:1234/v1', needsKey: false, model: '' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, model: 'qwen/qwen3-coder:free' },
  { label: 'OpenAI-compatible (custom URL)', baseUrl: '', needsKey: true, model: '' },
];

function activate(context) {
  const cfg = () => vscode.workspace.getConfiguration('cloneAi');
  const getLlm = async () => ({
    baseUrl: cfg().get('baseUrl'),
    model: cfg().get('model'),
    temperature: cfg().get('temperature'),
    apiKey: (await context.secrets.get(SECRET)) || process.env.CLONE_AI_API_KEY || process.env.OPENAI_API_KEY || '',
  });

  const chat = new ChatProvider(context, getLlm);
  inline.init(getLlm);
  inline.register(context);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'cloneAi.selectModel';
  const refreshStatus = () => { status.text = `$(hubot) ${cfg().get('model')}${inline.tabState() ? '' : ' (tab off)'}`; status.tooltip = 'Clone AI model · click to change'; status.show(); };
  refreshStatus();

  const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cloneAi.chat', chat, { webviewOptions: { retainContextWhenHidden: true } }),
    status,
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('cloneAi')) { refreshStatus(); chat.refreshModels(); } }),
    vscode.window.onDidChangeActiveTextEditor(() => chat.post({ type: 'ctx', ctx: ctxm.activeContext() })),
    vscode.window.onDidChangeTextEditorSelection(() => chat.post({ type: 'ctx', ctx: ctxm.activeContext() })),
  );

  reg('cloneAi.focusChat', async () => {
    await chat.focus();
    const c = ctxm.activeContext();
    if (c && c.selection) chat.addAttachment({ kind: 'selection', name: `${c.file}:${c.selection.startLine}-${c.selection.endLine}`, text: c.selection.text });
  });
  reg('cloneAi.newChat', () => { chat.newChat(); chat.focus(); });
  reg('cloneAi.addSelectionToChat', async () => {
    const c = ctxm.activeContext();
    if (c && c.selection) chat.addAttachment({ kind: 'selection', name: `${c.file}:${c.selection.startLine}-${c.selection.endLine}`, text: c.selection.text });
    else vscode.window.showInformationMessage('Select some code first.');
  });
  reg('cloneAi.agent', async () => { await chat.focus(); chat.mode = 'agent'; chat.post({ type: 'mode', mode: 'agent' }); });
  reg('cloneAi.inlineEdit', () => inline.inlineEdit());
  reg('cloneAi.acceptEdit', () => inline.acceptEdit());
  reg('cloneAi.rejectEdit', () => inline.rejectEdit());
  reg('cloneAi.retryEdit', () => inline.retryEdit());
  reg('cloneAi.toggleTab', () => { inline.toggleTab(); refreshStatus(); });
  reg('cloneAi.explainSelection', () => {
    const c = ctxm.activeContext();
    if (!c || !c.selection) return vscode.window.showInformationMessage('Select some code first.');
    return chat.sendPrompt(`Explain this code from ${c.file}:\n\n\`\`\`${c.language}\n${c.selection.text}\n\`\`\``, 'ask');
  });
  reg('cloneAi.fixProblems', () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return;
    const d = vscode.languages.getDiagnostics(ed.document.uri).map((x) => `L${x.range.start.line + 1}: ${x.message}`).join('\n');
    return chat.sendPrompt(`Fix these problems in ${vscode.workspace.asRelativePath(ed.document.uri)}:\n${d || '(none reported)'}`, 'agent');
  });
  reg('cloneAi.selectModel', async () => {
    let models = [];
    try { models = await listModels(await getLlm()); } catch (e) { vscode.window.showWarningMessage('Could not list models: ' + (e.message || e)); }
    const pick = await vscode.window.showQuickPick(models.length ? models : [cfg().get('model')], { placeHolder: 'Select model' });
    if (pick) await cfg().update('model', pick, vscode.ConfigurationTarget.Global);
  });
  reg('cloneAi.configureProvider', async () => {
    const p = await vscode.window.showQuickPick(PRESETS, { placeHolder: 'Model provider' });
    if (!p) return;
    let url = p.baseUrl;
    if (!url) url = await vscode.window.showInputBox({ prompt: 'OpenAI-compatible base URL (ending in /v1)', value: 'https://' });
    if (!url) return;
    await cfg().update('baseUrl', url, vscode.ConfigurationTarget.Global);
    if (p.needsKey) {
      const key = await vscode.window.showInputBox({ prompt: 'API key (stored in the OS keychain)', password: true, ignoreFocusOut: true });
      if (key) await context.secrets.store(SECRET, key);
    } else await context.secrets.delete(SECRET);
    if (p.model) await cfg().update('model', p.model, vscode.ConfigurationTarget.Global);
    chat.refreshModels();
    vscode.window.showInformationMessage('Clone AI provider set: ' + p.label);
  });

  // Open the chat pane on first run, like an AI-first IDE.
  if (!context.globalState.get('cloneAi.welcomed')) {
    context.globalState.update('cloneAi.welcomed', true);
    setTimeout(() => vscode.commands.executeCommand('workbench.view.extension.cloneAi'), 1500);
  }
}
function deactivate() {}
module.exports = { activate, deactivate };
