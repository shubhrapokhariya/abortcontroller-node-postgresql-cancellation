import express from 'express';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { setTimeout as sleep } from 'node:timers/promises';

const t0 = Date.now();
const log = (m) => console.log(`[${String(Date.now()-t0).padStart(4)}ms] ${m}`);

// ---------- Express ----------
const app = express();
app.get('/', async (req, res) => {
  log(`express: has req.signal? ${'signal' in req} (typeof ${typeof req.signal})`);
  res.on('close', () => log(`express: res 'close' writableEnded=${res.writableEnded}`));
  for (let i=1;i<=3;i++){ await sleep(400); log(`express: step ${i}/3`); }
  res.send('ok');
});
const exp = await new Promise(r => { const s = app.listen(0, () => r(s)); });

// ---------- Hono ----------
const hono = new Hono();
hono.get('/', async (c) => {
  const signal = c.req.raw.signal;
  log(`hono: signal.aborted at start=${signal.aborted}`);
  signal.addEventListener('abort', () => log('hono: request.signal abort event fired'));
  try {
    await sleep(2000, null, { signal });
    return c.text('ok');
  } catch (e) { log(`hono: handler caught ${e.name}`); return c.text('aborted'); }
});
const hs = serve({ fetch: hono.fetch, port: 0 });
await new Promise(r => hs.on('listening', r));

async function hit(name, port, ms) {
  const ac = new AbortController();
  setTimeout(() => { log(`client(${name}): abort()`); ac.abort(); }, ms);
  try { await fetch(`http://localhost:${port}/`, { signal: ac.signal }); } catch (e) { log(`client(${name}): ${e.name}`); }
}
await hit('express', exp.address().port, 500);
await sleep(1500);
console.log('--- hono ---');
await hit('hono', hs.address().port, 500);
await sleep(1000);
exp.close(); hs.close(); process.exit(0);
