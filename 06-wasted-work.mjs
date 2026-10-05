import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
// 20 clients each give up after 100ms; the handler is 5 steps x 200ms.
async function run(label, wired) {
  let stepsRun = 0, aborted = 0;
  const s = http.createServer(async (req, res) => {
    const ac = new AbortController();
    if (wired) res.on('close', () => { if (!res.writableFinished) { aborted++; ac.abort(); } });
    try {
      for (let i = 0; i < 5; i++) {
        await sleep(200, null, { signal: ac.signal }); // stand-in for `await db.query(..., { signal })`
        stepsRun++;
      }
      res.end('ok');
    } catch { /* aborted */ }
  });
  await new Promise(r => s.listen(0, r));
  const port = s.address().port;
  await Promise.all(Array.from({ length: 20 }, async () => {
    try { await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(100) }); } catch {}
  }));
  await sleep(1500);
  console.log(`${label}: steps executed = ${stepsRun} of 100 possible, handlers aborted = ${aborted}`);
  s.close();
}
await run('NOT wired (default)', false);
await run('wired to res close ', true);
