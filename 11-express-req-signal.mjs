// Does Express expose req.signal? Depends on the Node version underneath (Express's req extends http.IncomingMessage).
import express from 'express';
import { setTimeout as sleep } from 'node:timers/promises';
console.log(`node ${process.version}, express ${(await import('express/package.json', { with: { type: 'json' } })).default.version}`);
const app = express();
app.get('/', async (req, res) => {
  console.log('  typeof req.signal =', typeof req.signal);
  try { await sleep(1500, null, { signal: req.signal }); res.send('ok'); }
  catch (e) { console.log('  handler stopped via req.signal:', e.name); }
});
const s = app.listen(0, async () => {
  const ac = new AbortController(); setTimeout(() => ac.abort(), 300);
  try { await fetch(`http://localhost:${s.address().port}`, { signal: ac.signal }); } catch {}
  await sleep(1700); s.close(); process.exit(0);
});
