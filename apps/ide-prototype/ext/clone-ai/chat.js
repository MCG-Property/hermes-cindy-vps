'use strict';
const vscode = require('vscode');
const crypto = require('crypto');
const { streamChat, listModels } = require('./llm');
const { runAgent, Checkpoints } = require('./agent');
const ctxm = require('./context');
const { applyCodeToEditor } = require('./inline');

class ChatProvider {
  constructor(extCtx, getLlm) {
    this.extCtx = extCtx;
    this.getLlm = getLlm;
    this.view = null;
    this.mode = 'agent';
    this.history = [];       // OpenAI-format messages (without system)
    this.ui = [];            // for restoring the webview after it is hidden
    this.abort = null;
    this.checkpoints = new Checkpoints();
    this.pendingAttachments = [];
  }

  resolveWebviewView(view) {
    this.view = view;
    const media = vscode.Uri.joinPath(this.extCtx.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const nonce = crypto.randomBytes(16).toString('hex');
    const u = (f) => view.webview.asWebviewUri(vscode.Uri.joinPath(media, f));
    view.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${u('chat.css')}"></head><body>
<div id="app"></div><script nonce="${nonce}" src="${u('chat.js')}"></script></body></html>`;
    view.webview.onDidReceiveMessage((m) => this.onMessage(m));
    view.onDidDispose(() => { this.view = null; });
  }

  post(m) { if (this.view) this.view.webview.postMessage(m); }

  async onMessage(m) {
    switch (m.type) {
      case 'ready': return this.sendInit();
      case 'send': return this.send(m.text, m.attachments || []);
      case 'stop': if (this.abort) this.abort.abort(); return;
      case 'newChat': return this.newChat();
      case 'setMode': this.mode = m.mode; return;
      case 'setModel': await vscode.workspace.getConfiguration('cloneAi').update('model', m.model, vscode.ConfigurationTarget.Global); return;
      case 'mention': { const a = await ctxm.pickMention(); if (a) this.post({ type: 'attachment', attachment: a }); return; }
      case 'apply': return applyCodeToEditor(m.code, m.path);
      case 'copy': return vscode.env.clipboard.writeText(m.text);
      case 'revertAll': { const n = await this.checkpoints.revertAll(); this.post({ type: 'reverted', count: n }); return; }
      case 'keepAll': this.checkpoints.map.clear(); this.post({ type: 'kept' }); return;
      case 'configure': return vscode.commands.executeCommand('cloneAi.configureProvider');
      case 'openFile': { try { const f = vscode.workspace.workspaceFolders[0].uri; const d = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(f, m.path)); await vscode.window.showTextDocument(d, { preview: true }); } catch {} return; }
    }
  }

  async sendInit() {
    const cfg = vscode.workspace.getConfiguration('cloneAi');
    let models = [];
    try { const l = await this.getLlm(); models = await listModels(l); } catch { /* offline */ }
    const cur = cfg.get('model');
    if (cur && !models.includes(cur)) models.unshift(cur);
    this.post({ type: 'init', models, model: cur, mode: this.mode, ui: this.ui, ctx: ctxm.activeContext(), changed: this.checkpoints.size });
  }

  refreshModels() { this.sendInit(); }

  newChat() { this.history = []; this.ui = []; this.checkpoints.map.clear(); this.post({ type: 'cleared' }); }

  addAttachment(a) { this.post({ type: 'attachment', attachment: a }); this.focus(); }

  async focus() {
    await vscode.commands.executeCommand('workbench.view.extension.cloneAi');
    this.post({ type: 'focus' });
  }

  async sendPrompt(text, mode) {
    await this.focus();
    if (mode) { this.mode = mode; this.post({ type: 'mode', mode }); }
    return this.send(text, []);
  }

  async send(text, attachments) {
    if (this.abort) return;
    const llm = await this.getLlm();
    const ac = ctxm.activeContext();
    let content = text;
    const blocks = [];
    for (const a of attachments) blocks.push(`<attached ${a.kind} name="${a.name}">\n${a.text}\n</attached>`);
    if (ac && !attachments.some((a) => a.kind === 'selection')) {
      blocks.push(`<active_editor file="${ac.file}" language="${ac.language}" cursor_line="${ac.cursorLine}"${ac.selection ? ` selection_lines="${ac.selection.startLine}-${ac.selection.endLine}"` : ''}>${ac.selection ? '\n' + ac.selection.text + '\n' : ''}</active_editor>`);
    }
    if (blocks.length) content = blocks.join('\n') + '\n\n' + text;

    this.history.push({ role: 'user', content });
    this.ui.push({ role: 'user', text, attachments: attachments.map((a) => a.name) });
    this.post({ type: 'turnStart' });
    const rules = await ctxm.rulesText();
    const messages = [{ role: 'system', content: ctxm.systemPrompt(this.mode, rules) }, ...this.history];
    const base = messages.length;
    this.abort = new AbortController();
    let assistantText = '';
    const uiTurn = { role: 'assistant', text: '', tools: [] };
    this.ui.push(uiTurn);
    const emit = (ev) => {
      if (ev.type === 'text') { assistantText += ev.text; uiTurn.text += ev.text; }
      if (ev.type === 'tool') uiTurn.tools.push({ id: ev.id, name: ev.name, args: ev.args });
      if (ev.type === 'tool_result') { const t = uiTurn.tools.find((x) => x.id === ev.id); if (t) t.result = ev.result; }
      this.post({ type: 'event', ev });
    };
    try {
      const opts = { ...llm, signal: this.abort.signal };
      if (this.mode === 'agent') {
        const maxSteps = vscode.workspace.getConfiguration('cloneAi').get('agent.maxSteps') || 25;
        await runAgent({ llm: opts, messages, emit, signal: this.abort.signal, checkpoints: this.checkpoints, maxSteps });
        this.history = messages.slice(1);
      } else {
        for await (const ev of streamChat({ ...opts, messages })) if (ev.type === 'text') emit(ev);
        this.history.push({ role: 'assistant', content: assistantText });
      }
    } catch (e) {
      if (!(this.abort && this.abort.signal.aborted)) emit({ type: 'error', message: String(e && e.message || e) });
    } finally {
      this.abort = null;
      this.post({ type: 'turnEnd', changed: this.checkpoints.size });
    }
  }
}

module.exports = { ChatProvider };
