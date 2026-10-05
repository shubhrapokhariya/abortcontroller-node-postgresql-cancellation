import http from 'node:http';
import pg from 'pg';
import { setTimeout as sleep } from 'node:timers/promises';
const t0 = Date.now(); const log = (m) => console.log(`[${String(Date.now()-t0).padStart(4)}ms] ${m}`);
const cfg = { host:'localhost', port:54329, user:'postgres', password:'pw', database:'postgres' };
const admin = new pg.Client(cfg); await admin.connect();
console.log('server version:', (await admin.query('show server_version')).rows[0].server_version);
const active = async () => (await admin.query(
  "select count(*)::int n from pg_stat_activity where state='active' and query like '%pg_sleep%' and pid <> pg_backend_pid()")).rows[0].n;

async function scenario(label, wired) {
  console.log(`\n=== ${label} ===`);
  const server = http.createServer(async (req, res) => {
    const c = new pg.Client(cfg); await c.connect();
    const { rows:[{ pid }] } = await c.query('select pg_backend_pid() pid');
    res.on('close', async () => {
      if (!res.writableFinished) {
        log('api: client left');
        if (wired) { await admin.query('select pg_cancel_backend($1)', [pid]); log('api: pg_cancel_backend sent'); }
      }
    });
    try { await c.query('select pg_sleep(3)'); res.end('ok'); log('api: query finished normally'); }
    catch (e) { log(`api: query error -> ${e.code} ${e.message}`); }
    finally { await c.end().catch(()=>{}); }
  });
  await new Promise(r => server.listen(0, r));
  const ac = new AbortController(); setTimeout(() => ac.abort(), 500);
  try { await fetch(`http://localhost:${server.address().port}`, { signal: ac.signal }); } catch (e) { log('client: ' + e.name); }
  await sleep(300);  log(`DB: active pg_sleep queries 300ms after client left = ${await active()}`);
  await sleep(3500); log(`DB: active pg_sleep queries after 3.8s = ${await active()}`);
  server.close();
}
await scenario('NOT wired', false);
await scenario('wired with pg_cancel_backend', true);
await admin.end(); process.exit(0);
