import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
const t0 = Date.now();
const log = (m) => console.log(`[${String(Date.now()-t0).padStart(4)}ms] ${m}`);

const server = http.createServer(async (req, res) => {
  if (req.url === '/stream') {
    res.on('close', () => log(`server(stream): res close writableEnded=${res.writableEnded}`));
    res.writeHead(200, {'content-type':'text/plain'});
    for (let i=1;i<=6;i++){
      const ok = res.write(`chunk ${i}\n`);
      log(`server(stream): wrote chunk ${i}, write()=${ok}, destroyed=${res.destroyed}`);
      await sleep(300);
    }
    res.end();
  } else if (req.url === '/upload') {
    let bytes = 0;
    req.on('data', d => bytes += d.length);
    req.on('close', () => log(`server(upload): req close, received ${bytes} bytes, complete=${req.complete}`));
    req.on('error', e => log(`server(upload): req error ${e.code || e.message}`));
    res.on('close', () => log('server(upload): res close'));
  } else { await sleep(100); res.end('fast'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

// A. default abort() reason vs custom reason vs timeout
{
  const ac = new AbortController(); ac.abort();
  console.log('A1 default reason:', ac.signal.reason.name, ac.signal.reason.constructor.name);
  try { await fetch(base + '/slow', { signal: ac.signal }); } catch (e) { console.log('A1 fetch rejected with:', e.name, '| same object as signal.reason?', e === ac.signal.reason); }

  const ac2 = new AbortController(); ac2.abort(new Error('user navigated away'));
  try { await fetch(base + '/slow', { signal: ac2.signal }); } catch (e) { console.log('A2 custom reason ->', e.name, '|', e.message, '| same object?', e === ac2.signal.reason); }

  try { await fetch(base + '/stream', { signal: AbortSignal.timeout(300) }); await sleep(10); console.log('A3 (headers arrived before timeout)'); }
  catch (e) { console.log('A3 timeout ->', e.name, e.message); }
}

// B. abort after headers, while reading body
console.log('--- B: abort mid-body ---');
{
  const ac = new AbortController();
  const r = await fetch(base + '/stream', { signal: ac.signal });
  log(`client: got headers, status=${r.status}`);
  setTimeout(() => { log('client: abort() during body'); ac.abort(); }, 700);
  try { await r.text(); } catch (e) { log(`client: body read rejected with ${e.name}`); }
  await sleep(1200);
}

// C. abort after completion
console.log('--- C: abort after complete ---');
{
  const ac = new AbortController();
  const r = await fetch(base + '/fast', { signal: ac.signal });
  const t = await r.text();
  ac.abort();
  console.log('C: body already read =', t, '| abort() afterwards threw? no | signal.aborted =', ac.signal.aborted);
}

// D. upload abort
console.log('--- D: abort mid-upload ---');
{
  const ac = new AbortController();
  const body = new ReadableStream({
    async pull(c) { c.enqueue(new Uint8Array(1024*64)); await sleep(100); }
  });
  setTimeout(() => { log('client: abort() during upload'); ac.abort(); }, 600);
  try { await fetch(base + '/upload', { method:'POST', body, duplex:'half', signal: ac.signal }); } catch (e) { log(`client: upload fetch rejected with ${e.name}`); }
  await sleep(500);
}
server.close(); process.exit(0);
