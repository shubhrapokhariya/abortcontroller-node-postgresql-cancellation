import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const t0 = Date.now();
const log = (m) => console.log(`[${String(Date.now()-t0).padStart(4)}ms] ${m}`);

const server = http.createServer(async (req, res) => {
  log('server: request received');
  req.on('close', () => log(`server: req 'close' (complete=${req.complete})`));
  res.on('close', () => log(`server: res 'close' (writableEnded=${res.writableEnded}, destroyed=${res.destroyed})`));
  for (let i = 1; i <= 5; i++) {
    await sleep(500);
    log(`server: step ${i}/5 done (socket.destroyed=${req.socket.destroyed})`);
  }
  try { res.end('done'); log('server: res.end() called, no error thrown'); } catch (e) { log('server: res.end threw ' + e.message); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const ac = new AbortController();
setTimeout(() => { log('client: abort()'); ac.abort(); }, 1200);
try {
  await fetch(`http://localhost:${port}/`, { signal: ac.signal });
} catch (e) {
  log(`client: caught ${e.name} / ${e.message} / code=${e.code}`);
}
await sleep(2500);
server.close(); 
