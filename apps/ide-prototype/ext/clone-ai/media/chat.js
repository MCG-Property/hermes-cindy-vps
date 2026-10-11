(function () {
  const vscode = acquireVsCodeApi();
  const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="log"></div>
    <div id="changes"><span id="changesText"></span><span><button id="keep">Keep all</button> <button id="undo">Undo all</button></span></div>
    <div id="composer">
      <div class="chips" id="chips"></div>
      <div id="ctx"></div>
      <textarea id="input" rows="1" placeholder="Plan, search, build anything (@ to add context)"></textarea>
      <div class="bar">
        <select id="mode"><option value="agent">∞ Agent</option><option value="ask">Ask</option></select>
        <select id="model"></select>
        <span class="grow"></span>
        <button id="at" title="Add context (@)">@</button>
        <button id="send" title="Send (Enter)">↑</button>
      </div>
    </div>`;
  const log = document.getElementById('log'), input = document.getElementById('input'), chips = document.getElementById('chips');
  const modeSel = document.getElementById('mode'), modelSel = document.getElementById('model'), sendBtn = document.getElementById('send');
  let attachments = [], busy = false, cur = null, curText = '', seg = null;

  function renderMd(src) {
    const parts = src.split(/```/);
    let html = '';
    parts.forEach((p, i) => {
      if (i % 2 === 1) {
        const nl = p.indexOf('\n');
        const info = (nl >= 0 ? p.slice(0, nl) : '').trim();
        const code = nl >= 0 ? p.slice(nl + 1) : p;
        const lang = info.split(/\s+/)[0] || '';
        const m = /path=(\S+)/.exec(info) || /^\s*(?:\/\/|#|<!--)\s*(?:path:|file:)?\s*([\w./-]+\.\w+)/.exec(code);
        html += `<div class="codeblock" data-path="${esc(m ? m[1] : '')}"><div class="codehead"><span>${esc(lang || 'code')}${m ? ' · ' + esc(m[1]) : ''}</span><span class="btns"><button data-act="apply">Apply</button><button data-act="copy">Copy</button></span></div><pre>${esc(code.replace(/\n$/, ''))}</pre></div>`;
      } else {
        html += inlineMd(p);
      }
    });
    return html;
  }
  function inlineMd(t) {
    const lines = esc(t).split('\n'); let out = '', list = null;
    const close = () => { if (list) { out += `</${list}>`; list = null; } };
    for (const l of lines) {
      let m;
      if ((m = /^\s*[-*]\s+(.*)/.exec(l))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${fmt(m[1])}</li>`; }
      else if ((m = /^\s*\d+\.\s+(.*)/.exec(l))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${fmt(m[1])}</li>`; }
      else if ((m = /^#{1,3}\s+(.*)/.exec(l))) { close(); out += `<h3>${fmt(m[1])}</h3>`; }
      else if (!l.trim()) { close(); }
      else { close(); out += `<p>${fmt(l)}</p>`; }
    }
    close(); return out;
  }
  const fmt = (s) => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  function scroll() { log.scrollTop = log.scrollHeight; }
  function empty() {
    log.innerHTML = `<div class="empty"><div style="font-size:15px;color:var(--vscode-foreground)">Clone AI</div>
      <div><kbd>⌘L</kbd> chat &nbsp; <kbd>⌘K</kbd> edit selection &nbsp; <kbd>⌘I</kbd> agent</div>
      <div>Tab completes as you type · @ adds files, git diff, problems</div></div>`;
  }
  function addUser(text, names) {
    const el = $(`<div class="msg"><div class="user"></div></div>`);
    const u = el.firstChild;
    if (names && names.length) { const c = $('<div class="chips"></div>'); names.forEach((n) => c.append($(`<span class="chip">${esc(n)}</span>`))); u.append(c); }
    u.append(document.createTextNode(text));
    log.append(el); scroll();
  }
  function startAssistant() {
    cur = $(`<div class="msg assistant"><div class="body"></div><div class="status"><span class="spin"></span></div></div>`);
    curText = ''; seg = null; log.append(cur); scroll();
  }
  function drawText() { if (!seg) { seg = $('<div class="seg"></div>'); cur.querySelector('.body').append(seg); } seg.innerHTML = renderMd(curText); scroll(); }
  function addTool(t) { cur.querySelector('.body').append(toolCard(t)); seg = null; curText = ''; scroll(); }
  function toolCard(t) {
    const label = { read_file: 'Read', list_dir: 'List', grep: 'Search', edit_file: 'Edit', write_file: 'Write', run_command: 'Run' }[t.name] || t.name;
    const arg = t.args && (t.args.path || t.args.pattern || t.args.command) || '';
    const el = $(`<details class="tool${t.result !== undefined ? ' done' : ''}" data-id="${esc(t.id)}"><summary><span class="dot"></span><b>${esc(label)}</b><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(String(arg))}</span></summary><pre>${esc(t.result !== undefined ? t.result : '…')}</pre></details>`);
    return el;
  }
  function setBusy(b) { busy = b; sendBtn.textContent = b ? '■' : '↑'; sendBtn.title = b ? 'Stop' : 'Send (Enter)'; if (!b && cur) { const s = cur.querySelector('.status'); if (s) s.remove(); } }
  function drawChips() {
    chips.innerHTML = '';
    attachments.forEach((a, i) => { const c = $(`<span class="chip">${esc(a.name)} <b data-i="${i}">×</b></span>`); chips.append(c); });
  }
  function changes(n) {
    const el = document.getElementById('changes');
    el.classList.toggle('on', n > 0);
    document.getElementById('changesText').textContent = n + ' file' + (n === 1 ? '' : 's') + ' changed by agent';
  }

  function send() {
    if (busy) { vscode.postMessage({ type: 'stop' }); return; }
    const text = input.value.trim();
    if (!text) return;
    if (log.querySelector('.empty')) log.innerHTML = '';
    addUser(text, attachments.map((a) => a.name));
    vscode.postMessage({ type: 'send', text, attachments });
    input.value = ''; autosize(); attachments = []; drawChips();
  }
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(200, input.scrollHeight) + 'px'; }

  input.addEventListener('input', () => { autosize(); if (/(^|\s)@$/.test(input.value)) { input.value = input.value.replace(/@$/, ''); vscode.postMessage({ type: 'mention' }); } });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  sendBtn.onclick = send;
  document.getElementById('at').onclick = () => vscode.postMessage({ type: 'mention' });
  document.getElementById('keep').onclick = () => vscode.postMessage({ type: 'keepAll' });
  document.getElementById('undo').onclick = () => vscode.postMessage({ type: 'revertAll' });
  modeSel.onchange = () => vscode.postMessage({ type: 'setMode', mode: modeSel.value });
  modelSel.onchange = () => vscode.postMessage({ type: 'setModel', model: modelSel.value });
  chips.addEventListener('click', (e) => { const i = e.target.dataset && e.target.dataset.i; if (i !== undefined) { attachments.splice(+i, 1); drawChips(); } });
  log.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button[data-act]');
    if (!b) return;
    const block = b.closest('.codeblock'); const code = block.querySelector('pre').textContent;
    if (b.dataset.act === 'copy') vscode.postMessage({ type: 'copy', text: code });
    else vscode.postMessage({ type: 'apply', code, path: block.dataset.path || '' });
  });

  window.addEventListener('message', (e) => {
    const m = e.data;
    switch (m.type) {
      case 'init': {
        modelSel.innerHTML = ''; (m.models.length ? m.models : [m.model]).forEach((x) => modelSel.append($(`<option ${x === m.model ? 'selected' : ''}>${esc(x)}</option>`)));
        modeSel.value = m.mode;
        log.innerHTML = '';
        if (!m.models.length) log.append($(`<div class="warn">Can't reach the model server. Start Ollama (<code>ollama serve</code>) or pick another provider.<br><button id="cfg">Configure provider</button></div>`));
        if (!m.ui.length) empty();
        m.ui.forEach((t) => { if (t.role === 'user') addUser(t.text, t.attachments); else { startAssistant(); curText = t.text; drawText(); t.tools.forEach((x) => cur.querySelector('.body').append(toolCard(x))); const s = cur.querySelector('.status'); if (s) s.remove(); } });
        setCtx(m.ctx); changes(m.changed || 0);
        const c = document.getElementById('cfg'); if (c) c.onclick = () => vscode.postMessage({ type: 'configure' });
        break; }
      case 'cleared': empty(); changes(0); break;
      case 'turnStart': setBusy(true); startAssistant(); break;
      case 'turnEnd': setBusy(false); changes(m.changed || 0); break;
      case 'event': {
        const ev = m.ev;
        if (!cur) startAssistant();
        if (ev.type === 'text') { curText += ev.text; drawText(); }
        else if (ev.type === 'tool') addTool(ev);
        else if (ev.type === 'tool_result') { const d = cur.querySelector(`.tool[data-id="${CSS.escape(ev.id)}"]`); if (d) { d.classList.add('done'); d.querySelector('pre').textContent = ev.result; } }
        else if (ev.type === 'error') { cur.querySelector('.body').append($(`<p class="err">${esc(ev.message)}</p>`)); }
        break; }
      case 'attachment': attachments.push(m.attachment); drawChips(); input.focus(); break;
      case 'focus': input.focus(); break;
      case 'mode': modeSel.value = m.mode; break;
      case 'ctx': setCtx(m.ctx); break;
      case 'reverted': case 'kept': changes(0); break;
    }
  });
  function setCtx(c) { document.getElementById('ctx').textContent = c ? '📄 ' + c.file + (c.selection ? ` · lines ${c.selection.startLine}-${c.selection.endLine}` : '') : ''; }
  vscode.postMessage({ type: 'ready' });
})();
