'use strict';
const API = window.api;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const icon = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
const mk = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

const S = {
  repos: [], projects: [], chats: [], active: null, settings: {}, models: [], busy: new Set(),
  view: 'chat', attachments: [], design: false, nav: [], navIdx: -1,
  panel: { open: false, tabs: [], active: null }, sidebar: true, bg: 0, recents: JSON.parse(localStorage.getItem('recents') || '[]'),
};

// ---------- helpers ----------
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; if (s < 86400 * 60) return Math.floor(s / 86400) + 'd';
  return Math.floor(s / 86400 / 30) + 'mo';
}
function agoLong(ts) { const a = ago(ts); return a === 'now' ? 'just now' : a + ' ago'; }
function dur(sec) { return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`; }
function repoName(p) { return p ? p.split('/').filter(Boolean).pop() : ''; }
const curRepo = () => (S.active && S.active.repo) || (S.repos[0] && S.repos[0].path) || null;

function md(src) {
  const parts = src.split(/```/); let html = '';
  parts.forEach((p, i) => {
    if (i % 2) {
      const nl = p.indexOf('\n'); const info = (nl >= 0 ? p.slice(0, nl) : '').trim(); const code = nl >= 0 ? p.slice(nl + 1) : p;
      const m = /path=(\S+)/.exec(info) || /^\s*(?:\/\/|#)\s*(?:path:|file:)?\s*([\w./-]+\.\w+)\s*\n/.exec(code);
      html += `<div class="cb" data-path="${esc(m ? m[1] : '')}"><div class="h"><span>${esc(info.split(/\s+/)[0] || 'code')}${m ? ' · ' + esc(m[1]) : ''}</span><span><button data-act="copy">Copy</button>${m ? '<button data-act="apply">Apply</button>' : ''}</span></div><pre>${esc(code.replace(/\n$/, ''))}</pre></div>`;
    } else html += inlineMd(p);
  });
  return html;
}
function fmt(s) {
  return s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<)]+)/g, '<span class="lnk" data-url="$1">$1</span>');
}
function inlineMd(t) {
  let out = '', list = null; const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const l of esc(t).split('\n')) {
    let m;
    if ((m = /^\s*[-*]\s+(.*)/.exec(l))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${fmt(m[1])}</li>`; }
    else if ((m = /^\s*\d+\.\s+(.*)/.exec(l))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${fmt(m[1])}</li>`; }
    else if ((m = /^#{1,3}\s+(.*)/.exec(l))) { close(); out += `<h3>${fmt(m[1])}</h3>`; }
    else if (!l.trim()) close(); else { close(); out += `<p>${fmt(l)}</p>`; }
  }
  close(); return out;
}

function menu(x, y, items, opts = {}) {
  closeMenu();
  const m = mk(`<div class="menu" id="ctxmenu">${items.map((it, i) => it === '-' ? '<hr>' : `<div class="mi ${it.on ? 'on' : ''}" data-i="${i}">${it.icon ? icon(it.icon) : ''}${esc(it.label)}</div>`).join('')}</div>`);
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = (opts.up ? Math.max(8, y - r.height) : Math.min(y, innerHeight - r.height - 8)) + 'px';
  m.addEventListener('click', (e) => { const mi = e.target.closest('.mi'); if (!mi) return; const it = items[+mi.dataset.i]; closeMenu(); it.run && it.run(); });
  setTimeout(() => document.addEventListener('mousedown', outside, { once: true }), 0);
  function outside(e) { if (!m.contains(e.target)) closeMenu(); else document.addEventListener('mousedown', outside, { once: true }); }
}
function closeMenu() { const m = $('#ctxmenu'); if (m) m.remove(); }

// ---------- shell ----------
const app = $('#app');
app.innerHTML = `
<aside id="sidebar">
  <div class="sb-top drag"><button class="ibtn" id="b-sidebar" title="Toggle sidebar (⌘B)">${icon('sidebar')}</button><button class="ibtn" id="b-back">${icon('back')}</button><button class="ibtn" id="b-fwd">${icon('fwd')}</button></div>
  <div class="sb-scroll" id="sb"></div>
  <div class="sb-foot"><div class="avatar">C</div><div class="name">Cam</div><button class="ibtn" id="b-settings" title="Settings">${icon('gear')}</button></div>
</aside>
<section id="main">
  <div class="topbar drag">
    <div class="lights-pad"></div><button class="ibtn nodrag" id="b-sidebar2" style="display:none">${icon('sidebar')}</button>
    <div class="tab-pill nodrag" id="titlepill"><span id="title">New chat</span>${icon('laptop')}</div>
    <div class="spacer"></div>
    <button class="txtbtn nodrag" id="b-ide">IDE ${icon('ext')}</button>
    <button class="ibtn nodrag" id="b-more">${icon('more')}</button>
    <button class="ibtn nodrag" id="b-panel" title="Toggle panel (⌘J)">${icon('panel')}</button>
  </div>
  <div id="body">
    <div id="chatcol">
      <div id="scroll" class="scroll"><div class="col" id="msgs"></div></div>
      <div id="composer"><div class="col">
        <div class="chips-row"><button class="cchip nodrag" id="c-term">${icon('term')}<span id="c-term-t">Terminal</span></button><button class="cchip nodrag" id="c-design">Design Mode</button></div>
        <div class="pill"><div class="atts" id="atts" style="display:none"></div>
          <div class="in-row"><button class="plusbtn" id="b-attach">${icon('plus')}</button><textarea id="input" rows="1" placeholder="Plan, search, build anything"></textarea>
            <button class="modelbtn" id="b-model"><span id="modeltxt">model</span>${icon('chev')}</button><button class="sendbtn" id="b-send"></button></div></div>
        <div class="under"><button class="txtbtn" id="b-env">${icon('laptop')}<span id="envtxt">This Mac</span>${icon('chev')}</button><div style="display:flex;gap:10px;align-items:center"><button class="txtbtn" id="b-mode">Agent</button><div class="ring" id="ring"></div></div></div>
      </div></div>
    </div>
    <aside id="panel"><div class="resizer" id="resizer"></div><div class="ptabs drag" id="ptabs"></div><div class="pbody" id="pbody"></div></aside>
  </div>
</section>`;

// ---------- sidebar ----------
function chatRow(c) {
  const dot = S.busy.has(c.id) ? 'run' : c.unread ? 'blue' : '';
  return `<div class="row ${S.active && S.active.id === c.id && S.view === 'chat' ? 'on' : ''}" data-chat="${c.id}"><span class="dot ${dot}"></span><span class="t">${esc(c.title)}</span><span class="age">${ago(c.updated)}</span></div>`;
}
function renderSidebar() {
  const pinned = S.chats.filter((c) => c.pinned);
  const unfiled = S.chats.filter((c) => !c.repo && !c.pinned);
  let h = `<button class="nav ${S.view === 'chat' && !S.active ? '' : ''}" id="n-new">${icon('newchat')}New Chat</button>
    <button class="nav" id="n-search">${icon('search')}Search</button>
    <button class="nav ${S.view === 'auto' ? 'on' : ''}" id="n-auto">${icon('auto')}Automations</button>
    <button class="nav ${S.view === 'custom' ? 'on' : ''}" id="n-custom">${icon('custom')}Customize</button>`;
  h += `<div class="sec"><span>Projects</span><span class="acts"><button class="ibtn" id="p-add">${icon('plus')}</button></span></div>`;
  h += S.projects.map((p) => `<div class="row" data-project="${p.id}"><span style="color:var(--blue)">${icon('newchat')}</span><span class="t">${esc(p.name)}</span><span class="age">${ago(p.created)}</span></div>`).join('') || '';
  if (pinned.length) h += `<div class="sec"><span>Pinned</span></div>` + pinned.map(chatRow).join('');
  h += `<div class="sec"><span>Repositories</span><span class="acts"><button class="ibtn" title="Filter">${icon('filter')}</button><button class="ibtn" id="r-add" title="Add repository">${icon('folderplus')}</button></span></div>`;
  for (const r of S.repos) {
    const cs = S.chats.filter((c) => c.repo === r.path && !c.pinned);
    const open = S.active && S.active.repo === r.path;
    h += `<div class="row" data-repo="${esc(r.path)}">${icon(open ? 'folderopen' : 'folder')}<span class="t">${esc(r.name)}</span><button class="ibtn plus" data-newin="${esc(r.path)}" title="New chat here">${icon('plus')}</button></div>`;
    h += cs.length ? cs.map(chatRow).join('') : `<div class="empty-row">No agents yet</div>`;
  }
  if (unfiled.length) h += `<div class="sec"><span>Chats</span></div>` + unfiled.map(chatRow).join('');
  $('#sb').innerHTML = h;
}
$('#sb').addEventListener('click', async (e) => {
  const t = e.target;
  const q = (s) => t.closest(s);
  if (q('#n-new')) return newChat();
  if (q('#n-search')) return openSearch();
  if (q('#n-auto')) { S.view = 'auto'; return renderAll(); }
  if (q('#n-custom')) { S.view = 'custom'; return renderAll(); }
  if (q('#p-add')) { const n = prompt('Project name'); if (n) { await API.invoke('project:add', n); await refreshState(); } return; }
  if (q('#r-add')) { await addRepo(); return; }
  const ni = q('[data-newin]'); if (ni) return newChat(ni.dataset.newin);
  const c = q('[data-chat]'); if (c) return openChat(c.dataset.chat);
  const r = q('[data-repo]'); if (r) { const cs = S.chats.filter((x) => x.repo === r.dataset.repo); return cs.length ? openChat(cs[0].id) : newChat(r.dataset.repo); }
});
$('#sb').addEventListener('contextmenu', (e) => {
  const c = e.target.closest('[data-chat]'); const r = e.target.closest('[data-repo]');
  e.preventDefault();
  if (c) { const ch = S.chats.find((x) => x.id === c.dataset.chat);
    menu(e.clientX, e.clientY, [{ label: ch.pinned ? 'Unpin' : 'Pin', run: async () => { await API.invoke('chat:pin', ch.id); refreshState(); } }, { label: 'Rename', run: async () => { const n = prompt('Rename chat', ch.title); if (n) { await API.invoke('chat:rename', ch.id, n); refreshState(); } } }, { label: 'Open repo in IDE', run: () => ch.repo && API.invoke('ide:open', ch.repo) }, '-', { label: 'Delete', run: async () => { await API.invoke('chat:delete', ch.id); if (S.active && S.active.id === ch.id) S.active = null; await refreshState(); renderAll(); } }]);
  } else if (r) menu(e.clientX, e.clientY, [{ label: 'New chat here', run: () => newChat(r.dataset.repo) }, { label: 'Open in IDE', run: () => API.invoke('ide:open', r.dataset.repo) }, { label: 'Reveal in Finder', run: () => API.invoke('shell:reveal', r.dataset.repo) }, '-', { label: 'Remove repository', run: async () => { await API.invoke('repo:remove', r.dataset.repo); refreshState(); } }]);
});

// ---------- chat ----------
async function refreshState() {
  const st = await API.invoke('state:get');
  Object.assign(S, { repos: st.repos, projects: st.projects, chats: st.chats, settings: st.settings });
  renderSidebar();
  return st;
}
async function addRepo() { const p = await API.invoke('repo:add'); if (p) { await refreshState(); return p; } }
async function newChat(repo) {
  if (!repo) repo = curRepo();
  const c = await API.invoke('chat:new', repo || null);
  await refreshState(); await openChat(c.id);
  $('#input').focus();
}
async function openChat(id, fromNav) {
  const c = await API.invoke('chat:get', id); if (!c) return;
  S.active = c; S.view = 'chat'; S.attachments = [];
  if (!fromNav) { S.nav = S.nav.slice(0, S.navIdx + 1); S.nav.push(id); S.navIdx = S.nav.length - 1; }
  await refreshState(); renderAll();
}
function turnHtml(m, live) {
  const steps = (m.steps || []);
  const label = live ? `<span class="spin"></span> ${steps.length ? esc(stepLabel(steps[steps.length - 1])) : 'Thinking…'}` : `${icon('chevr', 'chev')} Worked for ${dur(Math.max(1, m.worked || 0))}`;
  let h = `<div class="turn" data-id="${m.id}"><div class="worked ${m.__open ? 'open' : ''}" data-toggle>${label}</div>`;
  if (steps.length) h += `<div class="steps" ${(m.__open || live && m.__open) ? '' : 'hidden'}>${steps.map((s) => `<div class="step"><b>${esc(stepVerb(s.name))}</b><span class="arg">${esc(s.args && (s.args.path || s.args.pattern || s.args.command) || '')}</span></div>${s.result !== undefined && m.__open ? `<pre class="sr">${esc(s.result)}</pre>` : ''}`).join('')}</div>`;
  if (m.text) h += `<div class="a">${md(m.text)}</div>`;
  if (m.error) h += `<div class="a err">${esc(m.error)}</div>`;
  if (m.approve) h += `<div class="approve">Run this command?<code>${esc(m.approve.command)}</code><div class="btns"><button class="btn pri" data-ap="${m.approve.id}" data-ok="1">Run</button><button class="btn" data-ap="${m.approve.id}" data-ok="0">Skip</button></div></div>`;
  if (!live) h += `<div class="acts"><button class="ibtn" title="Good">${icon('up')}</button><button class="ibtn" title="Bad">${icon('down')}</button><button class="ibtn" data-copy title="Copy">${icon('copy')}</button><button class="ibtn" title="Fork chat">${icon('fork')}</button><span class="ts">${agoLong(m.ts)}</span></div>`;
  return h + '</div>';
}
const stepVerb = (n) => ({ read_file: 'Read', list_dir: 'Listed', grep: 'Searched', edit_file: 'Edited', write_file: 'Wrote', run_command: 'Ran' }[n] || n);
const stepLabel = (s) => `${stepVerb(s.name)} ${s.args && (s.args.path || s.args.pattern || s.args.command) || ''}`.slice(0, 80);

function renderMsgs() {
  const box = $('#msgs'); const c = S.active;
  if (S.view !== 'chat') return;
  if (!c) { box.innerHTML = `<div class="hero"><h1>What should we build?</h1><p>Pick a repository, then describe the task.</p>${S.repos.length ? '' : '<p><button class="btn" id="hero-add">Add a repository</button></p>'}</div>`; const b = $('#hero-add'); if (b) b.onclick = addRepo; return; }
  if (!c.ui.length) { box.innerHTML = `<div class="hero"><h1>${esc(repoName(c.repo) || 'New chat')}</h1><p>Ask anything, or describe what to build.</p></div>`; return; }
  box.innerHTML = c.ui.map((m) => m.role === 'user'
    ? `<div class="u ${m.text.length < 320 ? 'open' : ''}">${m.attachments && m.attachments.length ? `<div class="atts">${m.attachments.map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>` : ''}${esc(m.text)}${m.text.length >= 320 ? '<div class="fade"></div>' : ''}<button class="ibtn undo" title="Undo changes">${icon('undo')}</button></div>`
    : turnHtml(m, false) ).join('') + changesBar();
  $('#scroll').scrollTop = $('#scroll').scrollHeight;
}
function changesBar() { return S.active && S.active.changes ? `<div class="changes" id="chbar"><span>${S.active.changes} file${S.active.changes === 1 ? '' : 's'} changed by agent</span><span><button class="btn" id="keep">Keep all</button> <button class="btn" id="undoall">Undo all</button></span></div>` : ''; }

$('#msgs').addEventListener('click', async (e) => {
  const t = e.target;
  const w = t.closest('[data-toggle]'); if (w) { const id = w.closest('.turn').dataset.id; const m = S.active.ui.find((x) => x.id === id); m.__open = !m.__open; const live = S.busy.has(S.active.id) && S.active.ui[S.active.ui.length - 1] === m; replaceTurn(m, live); return; }
  const u = t.closest('.u'); if (u && !t.closest('.undo')) { u.classList.toggle('open'); return; }
  const lnk = t.closest('[data-url]'); if (lnk) return openUrl(lnk.dataset.url);
  const ap = t.closest('[data-ap]'); if (ap) { API.send('approve:answer', { id: ap.dataset.ap, ok: ap.dataset.ok === '1' }); const m = S.active.ui[S.active.ui.length - 1]; delete m.approve; replaceTurn(m, true); return; }
  const cb = t.closest('.cb button'); if (cb) { const blk = cb.closest('.cb'); const code = blk.querySelector('pre').textContent; if (cb.dataset.act === 'copy') navigator.clipboard.writeText(code); else { const p = blk.dataset.path; const root = curRepo(); if (p && root) { await API.invoke('fs:write', root + '/' + p, code + '\n'); cb.textContent = 'Applied'; } } return; }
  if (t.closest('[data-copy]')) { const m = S.active.ui.find((x) => x.id === t.closest('.turn').dataset.id); navigator.clipboard.writeText(m.text || ''); return; }
  if (t.closest('#keep')) { await API.invoke('chat:keepAll', S.active.id); S.active.changes = 0; return renderMsgs(); }
  if (t.closest('#undoall')) { await API.invoke('chat:revertAll', S.active.id); S.active.changes = 0; return renderMsgs(); }
});
function replaceTurn(m, live) { const old = $(`.turn[data-id="${m.id}"]`); if (old) old.replaceWith(mk(turnHtml(m, live))); }

API.on('chat:event', (ev) => {
  if (ev.type === 'bg') { S.bg = ev.count; $('#c-term-t').textContent = `${S.bg} Terminal`; return; }
  if (ev.type === 'title') { const c = S.chats.find((x) => x.id === ev.chatId); if (c) c.title = ev.title; if (S.active && S.active.id === ev.chatId) { S.active.title = ev.title; $('#title').textContent = ev.title; } return renderSidebar(); }
  if (ev.type === 'turn_start') { S.busy.add(ev.chatId); renderSidebar(); updateSend(); }
  const c = S.active; const mine = c && c.id === ev.chatId;
  if (ev.type === 'browser_open' && mine) return openUrl(ev.url, true);
  if (ev.type === 'turn_end') { S.busy.delete(ev.chatId); updateSend(); refreshState(); if (mine) { const m = c.ui[c.ui.length - 1]; m.worked = ev.worked; c.changes = ev.changes; renderMsgs(); if (ev.changes && S.panel.tabs.find((t) => t.type === 'changes')) renderPanel(); } return; }
  if (!mine) return;
  const m = c.ui[c.ui.length - 1];
  if (ev.type === 'text') m.text = (m.text || '') + ev.text;
  else if (ev.type === 'tool') (m.steps = m.steps || []).push(ev.step);
  else if (ev.type === 'tool_result') { const st = (m.steps || []).find((x) => x.id === ev.id); if (st) st.result = ev.result; }
  else if (ev.type === 'error') m.error = ev.message;
  else if (ev.type === 'approve') m.approve = { id: ev.id, command: ev.command };
  replaceTurn(m, true);
  const sc = $('#scroll'); if (sc.scrollHeight - sc.scrollTop - sc.clientHeight < 220) sc.scrollTop = sc.scrollHeight;
});

// ---------- composer ----------
const input = $('#input');
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(180, input.scrollHeight) + 'px'; }
function updateSend() {
  const b = $('#b-send'); const busy = S.active && S.busy.has(S.active.id);
  b.innerHTML = busy ? icon('stop') : input.value.trim() ? icon('send') : icon('mic');
  b.title = busy ? 'Stop' : input.value.trim() ? 'Send' : 'Voice input is not available in this build';
  $('#ring').classList.toggle('run', !!busy);
  input.placeholder = S.active && S.active.ui.length ? 'Send follow-up' : 'Plan, search, build anything';
}
function drawAtts() {
  const a = $('#atts'); a.style.display = S.attachments.length ? 'flex' : 'none';
  a.innerHTML = S.attachments.map((x, i) => `<span class="chip">${esc(x.name)} <b data-i="${i}">×</b></span>`).join('');
}
$('#atts').addEventListener('click', (e) => { const i = e.target.dataset.i; if (i !== undefined) { S.attachments.splice(+i, 1); drawAtts(); } });
input.addEventListener('input', () => { autosize(); updateSend(); if (/(^|\s)@$/.test(input.value)) { input.value = input.value.slice(0, -1); atMention(); } });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
$('#b-send').onclick = () => { if (S.active && S.busy.has(S.active.id)) API.invoke('chat:stop', S.active.id); else send(); };
async function send() {
  const text = input.value.trim(); if (!text) return;
  if (!S.active) await newChat();
  if (!S.active.repo && S.repos.length) { /* chat without repo still works (read-only context) */ }
  const c = S.active; if (S.busy.has(c.id)) return;
  const atts = S.attachments.slice(); S.attachments = []; drawAtts();
  c.ui.push({ id: 'u' + Date.now(), role: 'user', text, attachments: atts.map((a) => a.name), ts: Date.now() });
  c.ui.push({ id: 't' + Date.now(), role: 'assistant', text: '', steps: [], ts: Date.now() });
  input.value = ''; autosize(); renderMsgs(); replaceTurn(c.ui[c.ui.length - 1], true); updateSend();
  const model = S.settings.model;
  API.invoke('chat:send', { chatId: c.id, text, attachments: atts, model }).catch((e) => { const m = c.ui[c.ui.length - 1]; m.error = e.message; replaceTurn(m, false); });
}
$('#b-attach').onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  menu(r.left, r.top - 6, [
    { label: 'Add files…', icon: 'file', run: async () => { const fs = await API.invoke('dialog:attach'); S.attachments.push(...fs); drawAtts(); } },
    { label: 'Add file from repository…', icon: 'folder', run: atMention },
    { label: 'Add git diff', icon: 'changes', run: async () => { const root = curRepo(); if (!root) return; const ch = await API.invoke('git:changes', root); let t = ''; for (const f of ch.slice(0, 12)) t += `--- ${f.file}\n` + (await API.invoke('git:diff', root, f.file)).slice(0, 6000) + '\n'; S.attachments.push({ kind: 'git', name: 'git diff', text: t || '(no changes)' }); drawAtts(); } },
  ], { up: true });
};
async function atMention() {
  const root = curRepo(); if (!root) return alert('Add a repository first.');
  openPalette({ placeholder: 'Add a file from the repository…', source: async (q) => (await API.invoke('fs:find', root, q || '.')).map((p) => ({ label: p.replace(root + '/', ''), icon: 'file', p })), onPick: async (it) => { const r = await API.invoke('fs:read', it.p); S.attachments.push({ kind: 'file', name: it.label, text: r.text || '' }); drawAtts(); input.focus(); } });
}
$('#b-model').onclick = async (e) => {
  const r = e.currentTarget.getBoundingClientRect(); S.models = await API.invoke('models:list');
  const items = (S.models.length ? S.models : [S.settings.model]).map((m) => ({ label: m, on: m === S.settings.model, run: async () => { S.settings.model = m; await API.invoke('settings:set', { model: m }); $('#modeltxt').textContent = m; } }));
  items.push('-', { label: 'Configure provider…', run: () => { S.view = 'custom'; renderAll(); } });
  menu(r.right - 240, r.top - 6, items, { up: true });
};
$('#b-mode').onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect(); const set = async (m, label) => { if (S.active) { S.active.mode = m; await API.invoke('chat:setMode', S.active.id, m); } $('#b-mode').textContent = label; };
  menu(r.left - 40, r.top - 6, [{ label: 'Agent', run: () => set('agent', 'Agent'), on: !S.active || S.active.mode === 'agent' }, { label: 'Ask', run: () => set('ask', 'Ask'), on: S.active && S.active.mode === 'ask' }, { label: 'Plan', run: () => set('plan', 'Plan'), on: S.active && S.active.mode === 'plan' }], { up: true });
};
$('#b-env').onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  menu(r.left, r.top - 6, [...S.repos.map((x) => ({ label: `This Mac · ${x.name}`, icon: 'laptop', on: S.active && S.active.repo === x.path, run: async () => { if (S.active) { S.active.repo = x.path; await API.invoke('chat:rename', S.active.id, S.active.title); await API.invoke('repo:add', x.path); } renderAll(); } })), '-', { label: 'Add repository…', icon: 'folderplus', run: addRepo }], { up: true });
};
$('#c-term').onclick = () => openPanelTab('terminal');
$('#c-design').onclick = () => { S.design = !S.design; $('#c-design').classList.toggle('on', S.design); if (S.design) openPanelTab('browser'); S.panel.tabs.filter((t) => t.type === 'browser').forEach((t) => applyDesign(t)); };

// ---------- topbar ----------
function toggleSidebar() { S.sidebar = !S.sidebar; document.body.classList.toggle('no-sidebar', !S.sidebar); $('#b-sidebar2').style.display = S.sidebar ? 'none' : ''; }
$('#b-sidebar').onclick = toggleSidebar; $('#b-sidebar2').onclick = toggleSidebar;
$('#b-back').onclick = () => { if (S.navIdx > 0) { S.navIdx--; openChat(S.nav[S.navIdx], true); } };
$('#b-fwd').onclick = () => { if (S.navIdx < S.nav.length - 1) { S.navIdx++; openChat(S.nav[S.navIdx], true); } };
$('#b-ide').onclick = () => API.invoke('ide:open', curRepo()).catch((e) => alert(e.message));
$('#b-panel').onclick = () => togglePanel();
$('#b-settings').onclick = () => { S.view = 'custom'; renderAll(); };
$('#b-more').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); menu(r.right - 190, r.bottom + 4, [{ label: 'Open repo in IDE', run: () => API.invoke('ide:open', curRepo()) }, { label: 'Reveal in Finder', run: () => curRepo() && API.invoke('shell:reveal', curRepo()) }, { label: 'Pin chat', run: async () => { if (S.active) { await API.invoke('chat:pin', S.active.id); refreshState(); } } }, '-', { label: 'Delete chat', run: async () => { if (S.active) { await API.invoke('chat:delete', S.active.id); S.active = null; await refreshState(); renderAll(); } } }]); };

// ---------- palette (search) ----------
function openPalette({ placeholder, source, onPick }) {
  const ov = mk(`<div class="overlay"><div class="palette"><input placeholder="${esc(placeholder)}" autofocus><div class="list"></div></div></div>`);
  document.body.append(ov); const inp = $('input', ov), list = $('.list', ov); let items = [], sel = 0;
  const draw = () => { list.innerHTML = items.slice(0, 50).map((it, i) => `<div class="row ${i === sel ? 'on' : ''}" data-i="${i}">${it.icon ? icon(it.icon) : ''}<span class="t">${esc(it.label)}</span><span class="age">${esc(it.right || '')}</span></div>`).join('') || '<div class="empty-row">No results</div>'; };
  const run = async () => { items = await source(inp.value); sel = 0; draw(); };
  inp.addEventListener('input', run); run(); setTimeout(() => inp.focus(), 0);
  const close = () => ov.remove();
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  list.addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) { const it = items[+r.dataset.i]; close(); onPick(it); } });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter' && items[sel]) { const it = items[sel]; close(); onPick(it); } });
}
function openSearch() {
  openPalette({ placeholder: 'Search chats and repositories…', source: async (q) => {
    q = (q || '').toLowerCase();
    return [...S.chats.filter((c) => c.title.toLowerCase().includes(q)).map((c) => ({ label: c.title, icon: 'newchat', right: repoName(c.repo), kind: 'chat', id: c.id })), ...S.repos.filter((r) => r.name.toLowerCase().includes(q)).map((r) => ({ label: r.name, icon: 'folder', right: 'repository', kind: 'repo', p: r.path }))];
  }, onPick: (it) => it.kind === 'chat' ? openChat(it.id) : newChat(it.p) });
}

// ---------- right panel ----------
function setPanelWidth(w) { document.documentElement.style.setProperty('--panel-w', w + 'px'); document.body.classList.toggle('panel-open', w > 0); }
function togglePanel(force) { S.panel.open = force === undefined ? !S.panel.open : force; setPanelWidth(S.panel.open ? (S.panel.tabs.length ? (S.panelW || 480) : 300) : 0); renderPanel(); }
function openPanelTab(type, extra = {}) {
  let t = S.panel.tabs.find((x) => x.type === type && (type !== 'browser' || !extra.url));
  if (!t || (type === 'browser' && extra.url && !t)) {
    t = { id: 't' + Math.random().toString(36).slice(2, 8), type, title: type === 'terminal' ? 'zsh' : type[0].toUpperCase() + type.slice(1), ...extra };
    S.panel.tabs.push(t);
  }
  S.panel.active = t.id; S.panel.open = true; setPanelWidth(S.panelW || 480); renderPanel(); return t;
}
function openUrl(url, auto) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url) || auto) {
    let t = S.panel.tabs.find((x) => x.type === 'browser');
    if (!t) t = openPanelTab('browser', { url, title: new URL(url).host }); else { t.url = url; S.panel.active = t.id; S.panel.open = true; setPanelWidth(S.panelW || 480); const wv = t.wv; if (wv) wv.loadURL(url); renderPanel(); }
  } else API.invoke('shell:openExternal', url);
}
const panelEls = new Map(); // tab id -> element (kept alive)
function renderPanel() {
  const tabsEl = $('#ptabs'), body = $('#pbody');
  const tabs = S.panel.tabs;
  tabsEl.innerHTML = `${tabs.map((t) => `<button class="ptab ${S.panel.active === t.id ? 'on' : ''}" data-tab="${t.id}">${icon({ browser: 'globe', terminal: 'term', files: 'file', changes: 'changes' }[t.type])}<span>${esc(t.title)}</span><span class="x" data-close="${t.id}">${icon('close')}</span></button>`).join('')}<button class="ibtn" id="p-plus" title="New tab">${icon('plus')}</button><span class="spacer"></span><button class="ibtn" id="p-expand">${icon('expand')}</button><button class="ibtn" id="p-close">${icon('panel')}</button>`;
  [...body.children].forEach((c) => { c.style.display = 'none'; });
  const active = tabs.find((t) => t.id === S.panel.active);
  if (!tabs.length || !active) { let ov = $('#overview'); if (!ov) { ov = mk('<div id="overview" class="opentabs"></div>'); body.append(ov); } ov.style.display = ''; ov.innerHTML = overviewHtml(); return; }
  let el = panelEls.get(active.id);
  if (!el) { el = buildTab(active); panelEls.set(active.id, el); body.append(el); }
  el.style.display = 'flex';
  if (active.type === 'files' || active.type === 'changes') refreshTab(active, el);
  if (active.type === 'terminal' && active.fit) setTimeout(() => { try { active.fit.fit(); } catch {} }, 30);
}
function overviewHtml() {
  const r = curRepo(); const br = S.panel.tabs.filter((t) => t.type === 'browser');
  return `${br.length ? `<div class="group"><h4>Open Tabs</h4>${br.map((t) => `<div class="orow" data-open-tab="${t.id}">${icon('globe')}${esc(t.title)}</div>`).join('')}</div>` : '<div class="group"><h4>Open Tabs</h4><div class="orow" style="color:var(--text-3)">None yet</div></div>'}
  <div class="group"><h4>On ${esc(repoName(r) || 'this chat')}</h4>
  <div class="orow" data-new="changes">${icon('changes')}Changes</div><div class="orow" data-new="browser">${icon('globe')}Browser</div><div class="orow" data-new="terminal">${icon('term')}Terminal</div><div class="orow" data-new="files">${icon('file')}Files</div></div>`;
}
$('#panel').addEventListener('click', (e) => {
  const t = e.target;
  const cl = t.closest('[data-close]'); if (cl) { closeTab(cl.dataset.close); return; }
  const tab = t.closest('[data-tab]'); if (tab) { S.panel.active = tab.dataset.tab; return renderPanel(); }
  const ot = t.closest('[data-open-tab]'); if (ot) { S.panel.active = ot.dataset.openTab; return renderPanel(); }
  const nw = t.closest('[data-new]'); if (nw) return openPanelTab(nw.dataset.new);
  if (t.closest('#p-plus')) { const r = t.closest('#p-plus').getBoundingClientRect(); return menu(r.left, r.bottom + 4, ['browser', 'terminal', 'files', 'changes'].map((k) => ({ label: k[0].toUpperCase() + k.slice(1), icon: { browser: 'globe', terminal: 'term', files: 'file', changes: 'changes' }[k], run: () => { if (k === 'terminal' || k === 'browser') { S.panel.tabs.push({ id: 't' + Math.random().toString(36).slice(2, 8), type: k, title: k === 'terminal' ? 'zsh' : 'New tab', url: k === 'browser' ? 'about:blank' : undefined }); S.panel.active = S.panel.tabs[S.panel.tabs.length - 1].id; setPanelWidth(S.panelW || 480); renderPanel(); } else openPanelTab(k); } }))); }
  if (t.closest('#p-close')) return togglePanel(false);
  if (t.closest('#p-expand')) { S.panelW = S.panelW > 700 ? 480 : 820; setPanelWidth(S.panelW); setTimeout(fitActiveTerm, 250); }
});
function closeTab(id) {
  const t = S.panel.tabs.find((x) => x.id === id); if (!t) return;
  if (t.termId) API.invoke('term:kill', t.termId);
  const el = panelEls.get(id); if (el) el.remove(); panelEls.delete(id);
  S.panel.tabs = S.panel.tabs.filter((x) => x.id !== id);
  S.panel.active = S.panel.tabs.length ? S.panel.tabs[S.panel.tabs.length - 1].id : null;
  if (!S.panel.tabs.length) setPanelWidth(300);
  renderPanel();
}
function fitActiveTerm() { const t = S.panel.tabs.find((x) => x.id === S.panel.active); if (t && t.fit) try { t.fit.fit(); } catch {} }
const rz = $('#resizer'); rz.addEventListener('mousedown', (e) => { e.preventDefault(); const mv = (ev) => { S.panelW = Math.max(300, Math.min(innerWidth - 480, innerWidth - ev.clientX)); document.documentElement.style.setProperty('--panel-w', S.panelW + 'px'); $('#panel').style.transition = 'none'; }; const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); $('#panel').style.transition = ''; fitActiveTerm(); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); });

function buildTab(t) {
  const el = mk(`<div class="tabc" style="flex:1;min-height:0;flex-direction:column"></div>`);
  if (t.type === 'browser') {
    el.innerHTML = `<div class="browser-bar"><button class="ibtn" data-b="back">${icon('back')}</button><button class="ibtn" data-b="fwd">${icon('fwd')}</button><button class="ibtn" data-b="reload">${icon('reload')}</button><button class="ibtn">${icon('star')}</button><div class="urlbox"><input spellcheck="false" value="${esc(t.url || '')}" placeholder="Enter URL or search"></div><button class="ibtn" data-b="design" title="Design mode">${icon('cursor')}</button><button class="ibtn" data-b="devtools" title="Open DevTools">${icon('term')}</button></div><div class="browser-wrap"><webview src="${esc(t.url || 'about:blank')}" allowpopups></webview></div>`;
    const wv = $('webview', el); t.wv = wv; const inp = $('input', el);
    wv.addEventListener('did-navigate', (e) => { inp.value = e.url; t.url = e.url; });
    wv.addEventListener('did-navigate-in-page', (e) => { inp.value = e.url; });
    wv.addEventListener('page-title-updated', (e) => { t.title = e.title.slice(0, 24) + (t.url ? ' ' + (new URL(t.url, 'http://x').port ? ':' + new URL(t.url, 'http://x').port : '') : ''); const pt = $(`.ptab[data-tab="${t.id}"] span`); if (pt) pt.textContent = t.title; });
    wv.addEventListener('dom-ready', () => applyDesign(t));
    wv.addEventListener('console-message', (e) => { if (e.message.startsWith('__CLONE_PICK__')) { try { const d = JSON.parse(e.message.slice(14)); S.attachments.push({ kind: 'element', name: d.selector.slice(0, 40), text: `Selected element in the running page (${t.url}):\nselector: ${d.selector}\ntext: ${d.text}\nhtml: ${d.html}` }); drawAtts(); input.focus(); } catch {} } });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { let v = inp.value.trim(); if (!/^\w+:\/\//.test(v)) v = /\./.test(v) || /^localhost/.test(v) ? 'http://' + v : 'https://www.google.com/search?q=' + encodeURIComponent(v); wv.loadURL(v); } });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; const k = b.dataset.b; if (k === 'back' && wv.canGoBack()) wv.goBack(); if (k === 'fwd' && wv.canGoForward()) wv.goForward(); if (k === 'reload') wv.reload(); if (k === 'design') { $('#c-design').click(); } if (k === 'devtools') wv.openDevTools(); });
  } else if (t.type === 'terminal') {
    el.innerHTML = `<div class="term-title">zsh</div><div class="term-wrap"></div>`;
    const host = $('.term-wrap', el);
    const term = new Terminal({ fontFamily: 'SF Mono, Menlo, monospace', fontSize: 12.5, theme: { background: '#151515', foreground: '#e8e8e8', cursor: '#e8e8e8' }, cursorBlink: true, allowProposedApi: true });
    const fit = new FitAddon.FitAddon(); term.loadAddon(fit); term.open(host); t.term = term; t.fit = fit;
    setTimeout(async () => { try { fit.fit(); } catch {} t.termId = await API.invoke('term:create', { cwd: curRepo(), cols: term.cols, rows: term.rows }); term.onData((d) => API.send('term:write', { id: t.termId, data: d })); term.onResize(({ cols, rows }) => API.send('term:resize', { id: t.termId, cols, rows })); }, 60);
    new ResizeObserver(() => { try { fit.fit(); } catch {} }).observe(host);
  } else if (t.type === 'files') { el.style.flexDirection = 'row'; }
  return el;
}
API.on('term:data', ({ id, data }) => { const t = S.panel.tabs.find((x) => x.termId === id); if (t && t.term) t.term.write(data); });
API.on('term:exit', ({ id }) => { const t = S.panel.tabs.find((x) => x.termId === id); if (t && t.term) t.term.write('\r\n[process exited]\r\n'); });

async function refreshTab(t, el) {
  const root = curRepo();
  if (t.type === 'changes') {
    if (!root) { el.innerHTML = '<div class="opentabs">Select a repository.</div>'; return; }
    const ch = await API.invoke('git:changes', root);
    el.style.flexDirection = 'column';
    el.innerHTML = `<div style="padding:10px 14px;color:var(--text-3)">${ch.length} changed file${ch.length === 1 ? '' : 's'}</div>` + (ch.map((c) => `<div class="crow" data-file="${esc(c.file)}"><span class="st">${esc(c.status)}</span><span>${esc(c.file)}</span><span class="n"><span class="p">+${c.add || 0}</span> <span class="m">-${c.del || 0}</span></span></div>`).join('') || '<div class="empty-row">Working tree clean</div>') + '<div class="diff" id="diffv" style="display:none"></div>';
    el.onclick = async (e) => { const r = e.target.closest('[data-file]'); if (!r) return; const d = await API.invoke('git:diff', root, r.dataset.file); const v = $('#diffv', el); v.style.display = ''; v.innerHTML = esc(d).split('\n').map((l) => `<div class="${l[0] === '+' ? 'p' : l[0] === '-' ? 'm' : l[0] === '@' ? 'h' : ''}">${l || ' '}</div>`).join(''); };
  } else if (t.type === 'files') {
    if (!root) { el.innerHTML = '<div class="opentabs">Select a repository.</div>'; return; }
    if (t.openFile) return showEditor(t, el, root);
    el.style.flexDirection = 'row';
    el.innerHTML = `<div class="left"><div class="sbox">${icon('search')}<input id="fsearch" placeholder="Files, Folders..."></div><div style="margin-top:18px"><div class="orow" id="newfile">${icon('file')}New File</div></div><div style="margin-top:22px;color:var(--text-3)">Recents</div>${S.recents.slice(0, 8).map((r) => `<div class="orow" data-rec="${esc(r)}">${icon('file')}${esc(r.split('/').pop())}<span style="color:var(--text-3);margin-left:8px">${esc(r.replace(/\/[^/]*$/, '').replace(/^.*\/Users\/[^/]+\//, '~/'))}</span></div>`).join('')}</div><div class="right"><div style="color:var(--text-2);padding:0 8px 8px">${esc(repoName(root))}</div><div id="tree"></div></div>`;
    loadTree(t, el, root, $('#tree', el), 0);
    $('#fsearch', el).addEventListener('input', async (e) => { const q = e.target.value; if (!q) return; const res = await API.invoke('fs:find', root, q); const left = $('.left', el); let l = $('#fres', el); if (!l) { l = mk('<div id="fres" style="margin-top:12px"></div>'); left.append(l); } l.innerHTML = res.slice(0, 12).map((p) => `<div class="orow" data-rec="${esc(p)}">${icon('file')}${esc(p.replace(root + '/', ''))}</div>`).join(''); });
    el.onclick = (e) => { const r = e.target.closest('[data-rec]'); if (r) { t.openFile = r.dataset.rec; showEditor(t, el, root); } if (e.target.closest('#newfile')) { const n = prompt('New file name'); if (n) { API.invoke('fs:write', root + '/' + n, '').then(() => { t.openFile = root + '/' + n; showEditor(t, el, root); }); } } };
  }
}
async function loadTree(t, el, root, host, depth) {
  const items = await API.invoke('fs:tree', root);
  const render = (box, list, d) => { box.innerHTML = list.map((x) => `<div class="frow" data-p="${esc(x.path)}" data-dir="${x.dir ? 1 : ''}" style="padding-left:${8 + d * 12}px">${icon(x.dir ? 'folder' : 'file')}${esc(x.name)}</div><div class="kids" data-k="${esc(x.path)}"></div>`).join(''); };
  render(host, items, 0);
  host.onclick = async (e) => { const r = e.target.closest('.frow'); if (!r) return; if (r.dataset.dir) { const k = r.nextElementSibling; if (k.innerHTML) { k.innerHTML = ''; return; } const kids = await API.invoke('fs:tree', r.dataset.p); const d = (parseInt(r.style.paddingLeft) - 8) / 12 + 1; k.innerHTML = kids.map((x) => `<div class="frow" data-p="${esc(x.path)}" data-dir="${x.dir ? 1 : ''}" style="padding-left:${8 + d * 12}px">${icon(x.dir ? 'folder' : 'file')}${esc(x.name)}</div><div class="kids"></div>`).join(''); } else { t.openFile = r.dataset.p; showEditor(t, el, root); } };
}
async function showEditor(t, el, root) {
  const f = t.openFile; const r = await API.invoke('fs:read', f);
  S.recents = [f, ...S.recents.filter((x) => x !== f)].slice(0, 20); localStorage.setItem('recents', JSON.stringify(S.recents));
  el.style.flexDirection = 'column';
  el.innerHTML = `<div class="editor"><div class="eh"><button class="ibtn" id="eback">${icon('back')}</button>${icon('file')}<span style="flex:1">${esc(f.replace(root + '/', ''))}</span><button class="txtbtn" id="eide">Open in IDE ${icon('ext')}</button><button class="btn" id="esave">Save</button></div>${r.text !== undefined ? `<textarea id="ta" spellcheck="false">${esc(r.text)}</textarea>` : `<div class="opentabs">${r.binary ? 'Binary file' : 'File too large to preview'}</div>`}</div>`;
  $('#eback', el).onclick = () => { delete t.openFile; refreshTab(t, el); };
  $('#eide', el).onclick = () => API.invoke('ide:open', root, f);
  const save = async () => { const ta = $('#ta', el); if (ta) { await API.invoke('fs:write', f, ta.value); $('#esave', el).textContent = 'Saved'; setTimeout(() => { const b = $('#esave', el); if (b) b.textContent = 'Save'; }, 1200); } };
  $('#esave', el).onclick = save;
  const ta = $('#ta', el); if (ta) ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } });
}

function applyDesign(t) {
  if (!t.wv) return; const on = S.design;
  const code = on ? `(function(){ if(window.__clonePick) return; window.__clonePick=true; const o=document.createElement('div'); o.style.cssText='position:fixed;pointer-events:none;border:2px solid #4aa3ff;background:#4aa3ff22;z-index:2147483647;transition:all .05s'; document.documentElement.append(o); const sel=(e)=>{ if(e.id) return e.tagName.toLowerCase()+'#'+e.id; let p=[]; while(e&&e.nodeType===1&&p.length<4){ let s=e.tagName.toLowerCase(); if(e.classList.length) s+='.'+[...e.classList].slice(0,2).join('.'); p.unshift(s); e=e.parentElement;} return p.join(' > ');}; window.__cm=(e)=>{const r=e.target.getBoundingClientRect(); o.style.left=r.left+'px';o.style.top=r.top+'px';o.style.width=r.width+'px';o.style.height=r.height+'px';}; window.__cc=(e)=>{ e.preventDefault(); e.stopPropagation(); const el=e.target; console.log('__CLONE_PICK__'+JSON.stringify({selector:sel(el),text:(el.innerText||'').slice(0,160),html:el.outerHTML.slice(0,500)})); }; document.addEventListener('mousemove',window.__cm,true); document.addEventListener('click',window.__cc,true); window.__cOff=()=>{document.removeEventListener('mousemove',window.__cm,true);document.removeEventListener('click',window.__cc,true);o.remove();window.__clonePick=false;}; })()` : `if(window.__cOff) window.__cOff()`;
  try { t.wv.executeJavaScript(code); } catch {}
}

// ---------- pages ----------
function renderPage() {
  const box = $('#msgs');
  if (S.view === 'custom') {
    const s = S.settings;
    box.innerHTML = `<div class="page"><h2>Customize</h2>
      <div class="card"><b>Model provider</b><div class="s">Any OpenAI-compatible endpoint. Local Ollama is free.</div>
      <label>Base URL</label><input type="text" id="s-url" value="${esc(s.baseUrl || '')}"><label>Default model</label><input type="text" id="s-model" value="${esc(s.model || '')}"><label>API key (stored locally)</label><input type="password" id="s-key" value="${esc(s.apiKey || '')}" placeholder="not needed for Ollama">
      <label><input type="checkbox" id="s-auto" ${s.autoRun ? 'checked' : ''}> Run terminal commands without asking</label>
      <p><button class="btn pri" id="s-save">Save</button> <button class="btn" id="s-test">Test connection</button> <span id="s-res" style="color:var(--text-3)"></span></p></div>
      <div class="card"><b>Rules</b><div class="s">Add <code>.clonerules</code>, <code>.cursorrules</code>, <code>AGENTS.md</code> or <code>.cursor/rules/*.mdc</code> to a repository and every chat in it follows them.</div></div></div>`;
    $('#s-save').onclick = async () => { await API.invoke('settings:set', { baseUrl: $('#s-url').value.trim(), model: $('#s-model').value.trim(), apiKey: $('#s-key').value, autoRun: $('#s-auto').checked }); await refreshState(); $('#modeltxt').textContent = S.settings.model; $('#s-res').textContent = 'Saved'; };
    $('#s-test').onclick = async () => { await $('#s-save').onclick(); const m = await API.invoke('models:list'); $('#s-res').textContent = m.length ? `Connected · ${m.length} model${m.length === 1 ? '' : 's'}` : 'Could not reach the server'; };
  } else if (S.view === 'auto') {
    const list = S.settings.automations || [];
    box.innerHTML = `<div class="page"><h2>Automations</h2><p style="color:var(--text-2)">Run a prompt in a repository on a schedule while Clone is open.</p>
      ${list.map((a) => `<div class="card"><b>${esc(a.name)}</b><div class="s">${esc(a.prompt)} · every ${a.everyMin} min · ${esc(repoName(a.repo))} · ${a.last ? 'last run ' + ago(a.last) + ' ago' : 'not run yet'}</div><p><button class="btn" data-run="${a.id}">Run now</button> <button class="btn" data-del="${a.id}">Delete</button></p></div>`).join('')}
      <div class="card"><b>New automation</b><label>Name</label><input type="text" id="a-name"><label>Prompt</label><textarea id="a-prompt"></textarea><label>Repository</label><select id="a-repo">${S.repos.map((r) => `<option value="${esc(r.path)}">${esc(r.name)}</option>`).join('')}</select><label>Every (minutes)</label><input type="text" id="a-int" value="60"><p><button class="btn pri" id="a-add">Create</button></p></div></div>`;
    $('#a-add').onclick = async () => { const a = { id: Math.random().toString(36).slice(2, 8), name: $('#a-name').value || 'Automation', prompt: $('#a-prompt').value, repo: $('#a-repo').value, everyMin: Math.max(1, +$('#a-int').value || 60), last: 0 }; if (!a.prompt) return; await API.invoke('settings:set', { automations: [...list, a] }); await refreshState(); renderPage(); };
    box.onclick = async (e) => { const r = e.target.closest('[data-run]'), d = e.target.closest('[data-del]'); if (r) runAutomation(list.find((x) => x.id === r.dataset.run)); if (d) { await API.invoke('settings:set', { automations: list.filter((x) => x.id !== d.dataset.del) }); await refreshState(); renderPage(); } };
  }
}
async function runAutomation(a) {
  const c = await API.invoke('chat:new', a.repo); a.last = Date.now();
  const all = (S.settings.automations || []).map((x) => x.id === a.id ? { ...x, last: a.last } : x); await API.invoke('settings:set', { automations: all });
  await API.invoke('chat:rename', c.id, a.name); API.invoke('chat:send', { chatId: c.id, text: a.prompt, attachments: [] }); await refreshState();
}
setInterval(() => { for (const a of S.settings.automations || []) if (Date.now() - (a.last || 0) >= a.everyMin * 60000) runAutomation(a); }, 30000);

// ---------- render all ----------
function renderAll() {
  renderSidebar();
  const chat = S.view === 'chat';
  $('#composer').style.display = chat ? '' : 'none';
  $('#title').textContent = chat ? (S.active ? S.active.title : 'New chat') : S.view === 'auto' ? 'Automations' : 'Customize';
  $('#modeltxt').textContent = S.settings.model || 'model';
  $('#b-mode').textContent = S.active ? ({ agent: 'Agent', ask: 'Ask', plan: 'Plan' }[S.active.mode] || 'Agent') : 'Agent';
  $('#envtxt').textContent = 'This Mac';
  if (chat) { $('#msgs').onclick = null; renderMsgs(); } else renderPage();
  updateSend(); drawAtts();
}

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'b') { e.preventDefault(); toggleSidebar(); }
  else if (mod && e.key === 'j') { e.preventDefault(); togglePanel(); }
  else if (mod && e.key === 'n') { e.preventDefault(); newChat(); }
  else if (mod && (e.key === 'p' || e.key === 'f')) { e.preventDefault(); openSearch(); }
  else if (mod && e.key === 'i') { e.preventDefault(); API.invoke('ide:open', curRepo()); }
  else if (mod && e.key === 'l') { e.preventDefault(); input.focus(); }
});

// ---------- boot ----------
(async function boot() {
  setPanelWidth(0);
  const st = await refreshState();
  S.models = await API.invoke('models:list');
  if (!S.repos.length) { /* first run: offer the sample repo if present */ }
  if (st.activeChat && S.chats.find((c) => c.id === st.activeChat)) await openChat(st.activeChat); else renderAll();
  renderPanel();
})();
