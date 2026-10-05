import pg from 'pg';
import { setTimeout as sleep } from 'node:timers/promises';
const cfg = { host:'localhost', port:54329, user:'postgres', password:'pw', database:'postgres' };
const admin = new pg.Client(cfg); await admin.connect();

// A) does pg 8.x honour { signal }?
{
  const c = new pg.Client(cfg); await c.connect();
  const ac = new AbortController(); setTimeout(() => ac.abort(), 300);
  const t = Date.now();
  try { await c.query({ text: 'select pg_sleep(2)', signal: ac.signal }); console.log(`A) query({signal}) finished after ${Date.now()-t}ms (signal ignored if ~2000)`); }
  catch (e) { console.log(`A) query({signal}) rejected after ${Date.now()-t}ms: ${e.name} ${e.code||''}`); }
  await c.end().catch(()=>{});
}

// B) side effect: INSERT then slow work then COMMIT; client "leaves" mid-way
await admin.query('drop table if exists orders; create table orders(id serial primary key, note text)');
async function handler(label, cancelOnLeave) {
  const c = new pg.Client(cfg); await c.connect();
  const { rows:[{ pid }] } = await c.query('select pg_backend_pid() pid');
  if (cancelOnLeave) setTimeout(() => admin.query('select pg_cancel_backend($1)', [pid]), 300); // simulates res 'close' handler
  try {
    await c.query('begin');
    await c.query('insert into orders(note) values ($1)', [label]);
    await c.query('select pg_sleep(1)');                // "slow work" while client is already gone
    await c.query('commit');
    console.log(`B) ${label}: committed`);
  } catch (e) { console.log(`B) ${label}: error ${e.code}; rolling back`); await c.query('rollback').catch(()=>{}); }
  await c.end().catch(()=>{});
}
await handler('naive (client left at 300ms, nobody told the DB)', false);
await handler('cancel-aware (client left at 300ms)', true);
console.log('B) rows in orders:', (await admin.query('select note from orders order by id')).rows.map(r => r.note));

// C) server-side deadline with statement_timeout
{
  const c = new pg.Client({ ...cfg, statement_timeout: 300 }); await c.connect();
  const t = Date.now();
  try { await c.query('select pg_sleep(2)'); } catch (e) { console.log(`C) statement_timeout=300ms -> ${e.code} after ${Date.now()-t}ms`); }
  await c.end();
}
await admin.end(); process.exit(0);
