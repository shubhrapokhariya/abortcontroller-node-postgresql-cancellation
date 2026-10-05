import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
let hits = 0;
const server = http.createServer(async (req, res) => { hits++; await sleep(1000); res.end('x'); });
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

// pre-aborted
const ac = new AbortController(); ac.abort();
try { await fetch(base, { signal: ac.signal }); } catch (e) { console.log('pre-aborted ->', e.name); }
await sleep(200);
console.log('server hits after pre-aborted fetch:', hits);

// timeout
try { await fetch(base, { signal: AbortSignal.timeout(300) }); } catch (e) { console.log('AbortSignal.timeout ->', e.name, '| instanceof DOMException:', e instanceof DOMException, '| code', e.code); }

// AbortSignal.any
const user = new AbortController();
const sig = AbortSignal.any([user.signal, AbortSignal.timeout(5000)]);
setTimeout(() => user.abort(new Error('user cancelled')), 100);
try { await fetch(base, { signal: sig }); } catch (e) { console.log('AbortSignal.any ->', e.name, e.message); }

// signal.throwIfAborted + reuse: an aborted controller can't be reset
console.log('signal stays aborted:', user.signal.aborted);
// listener semantics: abort event fires once
let n = 0; const a2 = new AbortController(); a2.signal.addEventListener('abort', () => n++); a2.abort(); a2.abort(); console.log('abort event count after 2 abort() calls:', n);
server.close(); process.exit(0);
