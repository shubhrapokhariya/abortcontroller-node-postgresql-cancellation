import http from 'node:http';
const t0 = Date.now(); const log = (m) => console.log(`  [server +${String(Date.now()-t0).padStart(4)}ms] ${m}`);
const s = http.createServer((req, res) => {
  res.on('close', () => log(`res 'close' delivered (writableEnded=${res.writableEnded})`));
  log('starting 1000ms synchronous loop');
  const end = Date.now() + 1000; while (Date.now() < end) {}
  log('sync loop finished');
  res.end('x');
});
s.listen(0, () => console.log('PORT ' + s.address().port));
