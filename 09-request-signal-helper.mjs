import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

// Reusable helper: aborts when the client disconnects OR the deadline passes.
export function requestSignal(res, { timeoutMs } = {}) {
  const gone = new AbortController();
  res.once('close', () => {
    if (!res.writableFinished) gone.abort(new Error('client closed request'));
  });
  const signals = [gone.signal];
  if (timeoutMs) signals.push(AbortSignal.timeout(timeoutMs));
  return AbortSignal.any(signals);
}

// --- demo -------------------------------------------------------------
const slow = http.createServer(async (req, res) => {
  res.on('close', () => console.log(`  downstream: closed early=${!res.writableFinished}`));
  await sleep(2000).catch(() => {}); if (!res.destroyed) res.end('late');
});
await new Promise(r => slow.listen(0, r));
const dPort = slow.address().port;

const api = http.createServer(async (req, res) => {
  const signal = requestSignal(res, { timeoutMs: 600 });
  try {
    const r = await fetch(`http://localhost:${dPort}`, { signal });
    res.end(await r.text());
  } catch (e) {
    // Distinguish WHY we stopped
    const why = signal.reason?.name === 'TimeoutError' ? 'deadline exceeded' : signal.reason?.message;
    console.log(`  api: stopped because: ${why}`);
    if (!res.destroyed && !res.writableEnded) { res.statusCode = 504; res.end('upstream timeout'); }
  }
});
await new Promise(r => api.listen(0, r));
const aPort = api.address().port;

console.log('case 1: server deadline (client waits)');
let r = await fetch(`http://localhost:${aPort}`); console.log('  client got status', r.status); await r.text();
await sleep(100);

console.log('case 2: client leaves at 200ms');
const ac = new AbortController(); setTimeout(() => ac.abort(), 200);
try { await fetch(`http://localhost:${aPort}`, { signal: ac.signal }); } catch (e) { console.log('  client:', e.name); }
await sleep(300);
api.close(); slow.close(); process.exit(0);
