import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getAdapter,characterSignalSnapshot} from '../src/runtime/compatibility.mjs';
const evidence=JSON.parse(await readFile(new URL('./fixtures/surfaces/stop-labels.json',import.meta.url),'utf8'));
test('six stop labels exactly match observed official static resources on the verified candidate only',()=>{
 const signals=getAdapter('local-msix-26.928.3736.0-chat-work').characterSignals;
 for(const {label,sha256} of evidence.records){assert.match(sha256,/^[a-f0-9]{64}$/);assert.ok(signals.stopLabels?.includes(label),label);assert.equal(characterSignalSnapshot(signals,selector=>selector===signals.stop,label).generating,true);}
 assert.equal(characterSignalSnapshot(signals,()=>true,'Unknown stop translation').generating,false);assert.equal(characterSignalSnapshot(signals,()=>false,'Stop').generating,false);
 assert.equal(getAdapter('local-experimental-msix-26.917.8451.0-chat-work').characterSignals.stopLabels.includes('إيقاف'),false);
});
