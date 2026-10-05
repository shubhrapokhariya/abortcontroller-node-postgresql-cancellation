import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
fs.writeFileSync('server-flags.mjs', `
import http from 'node:http';
const s = http.createServer((req, res) => {
  const mode = req.url.slice(1);
  res.on('close', () => console.log('  server[' + mode + '] close: writableEnded=' + res.writableEnded + ' writableFinished=' + res.writableFinished + ' destroyed=' + res.destroyed));
  if (mode === 'sync') { const e = Date.now()+800; while (Date.now()<e){} res.end('x'); }
  else setTimeout(() => res.end('x'), 800);
});
s.listen(0, () => console.log('PORT ' + s.address().port));
`);
const child = spawn('node', ['server-flags.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
let port; await new Promise(r => child.stdout.on('data', d => { const m = /PORT (\d+)/.exec(d.toString()); if (m) { port = m[1]; r(); } }));
child.stdout.on('data', d => { const t = d.toString(); if (!t.startsWith('PORT')) process.stdout.write(t); });
for (const [mode, abortAt] of [['async', null], ['async', 200], ['sync', 200]]) {
  console.log(`case: ${mode}, client aborts at ${abortAt ?? 'never'}`);
  const ac = new AbortController(); if (abortAt) setTimeout(() => ac.abort(), abortAt);
  try { await (await fetch(`http://localhost:${port}/${mode}`, { signal: ac.signal })).text(); } catch {}
  await sleep(1200);
}
child.kill();
