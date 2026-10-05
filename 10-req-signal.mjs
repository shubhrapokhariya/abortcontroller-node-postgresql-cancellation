import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
console.log('node', process.version);
const t0 = Date.now(); const log = (m) => console.log(`[${String(Date.now()-t0).padStart(4)}ms] ${m}`);
const s = http.createServer(async (req, res) => {
  console.log("'signal' in req:", 'signal' in req, '| typeof:', typeof req.signal);
  if (req.signal) {
    req.signal.addEventListener('abort', () => log(`req.signal abort fired; reason=${req.signal.reason?.name}: ${req.signal.reason?.message}`));
    log(`req.signal.aborted at start = ${req.signal.aborted}`);
    try { await sleep(2000, null, { signal: req.signal }); res.end('ok'); }
    catch (e) { log(`handler stopped: ${e.name}`); }
  } else { await sleep(2000); res.end('ok'); }
});
await new Promise(r => s.listen(0, r));
const ac = new AbortController(); setTimeout(() => { log('client abort()'); ac.abort(); }, 500);
try { await fetch(`http://localhost:${s.address().port}`, { signal: ac.signal }); } catch (e) { log('client: ' + e.name); }

// Also: does a COMPLETED request make req.signal abort? (guards against false "abort" on normal finish)
const s2 = http.createServer(async (req, res) => {
  req.signal?.addEventListener('abort', () => console.log('  s2: req.signal aborted (unexpected on a normal request?)'));
  res.end('done');
});
await new Promise(r => s2.listen(0, r));
await (await fetch(`http://localhost:${s2.address().port}`)).text();
await sleep(300);
console.log('normal request finished; s2 req.signal.aborted check done');
s.close(); s2.close(); process.exit(0);
