import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const t0 = Date.now();
const log = (m) => console.log(`[${String(Date.now()-t0).padStart(4)}ms] ${m}`);

// "Downstream" service (e.g. another microservice / slow API)
const downstream = http.createServer(async (req, res) => {
  log('downstream: request received');
  res.on('close', () => log(`downstream: res 'close' (writableEnded=${res.writableEnded})`));
  await sleep(3000).catch(()=>{});
  if (!res.destroyed) res.end('slow-data');
});
await new Promise(r => downstream.listen(0, r));
const dPort = downstream.address().port;

// API server: propagates cancellation
const api = http.createServer(async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) { log('api: client went away -> aborting controller'); ac.abort(); } });
  try {
    const r = await fetch(`http://localhost:${dPort}/`, { signal: ac.signal });
    const body = await r.text();
    res.end(body);
  } catch (e) {
    log(`api: handler caught ${e.name}`);
    if (!res.writableEnded && !res.destroyed) res.end('err');
  }
});
await new Promise(r => api.listen(0, r));
const aPort = api.address().port;

const ac = new AbortController();
setTimeout(() => { log('client: abort()'); ac.abort(); }, 800);
try { await fetch(`http://localhost:${aPort}/`, { signal: ac.signal }); }
catch (e) { log(`client: caught ${e.name}`); }
await sleep(1000);
api.close(); downstream.close();
