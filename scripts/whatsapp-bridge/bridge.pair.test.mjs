/**
 * PAIR_ONLY finalize gate: credentials must flush and carry an identity before
 * the process claims pairing succeeded.
 */

import { strict as assert } from 'node:assert';
import { finalizePairOnlySession } from './bridge_helpers.js';

{
  const exits = [];
  let saved = false;
  const result = await finalizePairOnlySession({
    saveCreds: async () => { saved = true; },
    sockUserId: '15551234567:1@s.whatsapp.net',
    credsMeId: null,
    exitFn: (code) => exits.push(code),
    settleMs: 0,
    setTimer: (fn) => fn(),
  });
  assert.equal(result.ok, true);
  assert.equal(saved, true);
  assert.equal(result.identity, '15551234567:1@s.whatsapp.net');
  assert.deepEqual(exits, [0]);
  console.log('  ✓ pair finalize flushes creds and exits 0 when identity present');
}

{
  const exits = [];
  const result = await finalizePairOnlySession({
    saveCreds: async () => {},
    sockUserId: null,
    credsMeId: null,
    exitFn: (code) => exits.push(code),
    settleMs: 0,
    setTimer: (fn) => fn(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'connected_without_identity');
  assert.deepEqual(exits, [1]);
  console.log('  ✓ pair finalize refuses exit-success without a WhatsApp identity');
}

{
  const exits = [];
  const result = await finalizePairOnlySession({
    saveCreds: async () => { throw new Error('disk full'); },
    sockUserId: '15551234567:1@s.whatsapp.net',
    credsMeId: null,
    exitFn: (code) => exits.push(code),
    settleMs: 0,
    setTimer: (fn) => fn(),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /disk full/);
  assert.deepEqual(exits, [1]);
  console.log('  ✓ pair finalize exits 1 when saveCreds fails');
}

{
  const exits = [];
  const result = await finalizePairOnlySession({
    saveCreds: async () => {},
    sockUserId: null,
    credsMeId: '15550001111:17@s.whatsapp.net',
    exitFn: (code) => exits.push(code),
    settleMs: 0,
    setTimer: (fn) => fn(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.identity, '15550001111:17@s.whatsapp.net');
  assert.deepEqual(exits, [0]);
  console.log('  ✓ pair finalize accepts identity from persisted creds.me');
}
