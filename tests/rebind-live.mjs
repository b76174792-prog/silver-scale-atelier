// Explicit, read-only acceptance check against an already running dedicated client.
// Not part of the offline suite; never launches, commits a receipt, or reads page data.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
const exec=promisify(execFile);
const [helper,receiptPath]=process.argv.slice(2);
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
const proof=JSON.parse((await exec(helper,['--inspect',receiptPath],{windowsHide:true})).stdout);
let result;
try { result=JSON.parse((await exec(helper,['--rebind-candidate',receipt.executable],{windowsHide:true})).stdout); }
catch(e) { assert.fail(`Dedicated browser with helper children must remain a single candidate: ${e.stderr?.trim()}`); }
assert.equal(result.state,'verified_candidate');
assert.equal(result.candidate.pid,proof.pid);
assert.equal(result.candidate.startedMs,proof.startedMs);
assert.equal(result.candidate.port,proof.port);
console.log(JSON.stringify({passed:true,pid:proof.pid,port:proof.port,readOnly:true}));
