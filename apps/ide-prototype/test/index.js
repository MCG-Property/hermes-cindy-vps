'use strict';
// Runs inside the real extension host: node test via --extensionTestsPath.
const vscode = require('vscode');
const fs = require('fs');
const out = (s) => fs.appendFileSync('/tmp/clone-test.out', s + '\n');
exports.run = async function () {
  fs.writeFileSync('/tmp/clone-test.out', '');
  const ext = vscode.extensions.getExtension('clone.clone-ai');
  out('extension found: ' + !!ext);
  await ext.activate();
  out('activated: ' + ext.isActive);
  const cmds = (await vscode.commands.getCommands(true)).filter((c) => c.startsWith('cloneAi.'));
  out('commands: ' + cmds.length + ' ' + cmds.join(','));
  const { listModels, chatOnce, fim } = require('/Users/camdouglas/Desktop/cursor-clone/ext/clone-ai/llm.js');
  const llm = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5-coder:7b' };
  const models = await listModels(llm).catch((e) => 'ERR ' + e.message);
  out('models: ' + JSON.stringify(models));
  if (Array.isArray(models) && models.includes(llm.model)) {
    out('chat: ' + (await chatOnce({ ...llm, messages: [{ role: 'user', content: 'Reply with exactly: pong' }] })).slice(0, 80));
    out('fim: ' + JSON.stringify(await fim({ ...llm, prefix: 'function add(a, b) {\n  return ', suffix: ';\n}\n', maxTokens: 20 }).catch((e) => 'ERR ' + e.message)));
    // Agent loop against the sample project
    const { runAgent, Checkpoints } = require('/Users/camdouglas/Desktop/cursor-clone/ext/clone-ai/agent.js');
    const ev = [];
    const cp = new Checkpoints();
    await runAgent({ llm, emit: (e) => ev.push(e), checkpoints: cp, maxSteps: 8,
      messages: [{ role: 'system', content: 'You are a coding agent. Use tools. Be brief.' }, { role: 'user', content: 'Read app.js and add a JSDoc comment above the function average using edit_file. Then say done.' }] });
    out('agent tools: ' + ev.filter((e) => e.type === 'tool').map((e) => e.name + JSON.stringify(e.args).slice(0, 60)).join(' | '));
    out('agent edited files: ' + cp.size);
    out('app.js now: \n' + fs.readFileSync('/Users/camdouglas/Desktop/cursor-clone/sample/app.js', 'utf8'));
    await cp.revertAll();
  }
  out('DONE');
};
