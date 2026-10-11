'use strict';
// Minimal OpenAI-compatible client (chat streaming with tool calls, FIM/plain completions, model listing).

const trim = (u) => String(u || '').replace(/\/+$/, '');

function headers(apiKey) {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey) h.Authorization = 'Bearer ' + apiKey;
  return h;
}

async function listModels({ baseUrl, apiKey }) {
  const r = await fetch(trim(baseUrl) + '/models', { headers: headers(apiKey), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return (j.data || []).map((m) => m.id).sort();
}

// Streams a chat completion. Yields {type:'text',text} and finally {type:'done',toolCalls,finish}.
async function* streamChat({ baseUrl, apiKey, model, messages, tools, temperature = 0.2, signal }) {
  const body = { model, messages, stream: true, temperature };
  if (tools && tools.length) body.tools = tools;
  const r = await fetch(trim(baseUrl) + '/chat/completions', {
    method: 'POST', headers: headers(apiKey), body: JSON.stringify(body), signal,
  });
  if (!r.ok) throw new Error(`Model request failed (HTTP ${r.status}): ${(await r.text()).slice(0, 400)}`);
  const dec = new TextDecoder();
  let buf = '';
  const calls = [];
  let finish = null;
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      const ch = j.choices && j.choices[0];
      if (!ch) continue;
      const d = ch.delta || {};
      if (d.content) yield { type: 'text', text: d.content };
      if (d.tool_calls) {
        for (const tc of d.tool_calls) {
          const idx = tc.index ?? calls.length;
          const cur = (calls[idx] = calls[idx] || { id: tc.id || 'call_' + idx, name: '', args: '' });
          if (tc.id) cur.id = tc.id;
          if (tc.function) {
            if (tc.function.name) cur.name += tc.function.name;
            if (tc.function.arguments) cur.args += typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments);
          }
        }
      }
      if (ch.finish_reason) finish = ch.finish_reason;
    }
  }
  yield { type: 'done', finish, toolCalls: calls.filter(Boolean) };
}

async function chatOnce(opts) {
  let out = '';
  for await (const ev of streamChat(opts)) if (ev.type === 'text') out += ev.text;
  return out;
}

// Fill-in-the-middle via /completions (prompt + suffix). Throws if unsupported.
async function fim({ baseUrl, apiKey, model, prefix, suffix, maxTokens = 128, signal }) {
  const r = await fetch(trim(baseUrl) + '/completions', {
    method: 'POST', headers: headers(apiKey), signal,
    body: JSON.stringify({ model, prompt: prefix, suffix, max_tokens: maxTokens, temperature: 0, stream: false, stop: ['\n\n\n'] }),
  });
  if (!r.ok) throw new Error('FIM HTTP ' + r.status);
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].text) || '';
}

function stripFence(s) {
  const m = /^```[\w+-]*\n([\s\S]*?)\n?```\s*$/.exec(s.trim());
  return m ? m[1] : s;
}

module.exports = { listModels, streamChat, chatOnce, fim, stripFence };
