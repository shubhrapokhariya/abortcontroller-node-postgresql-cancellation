import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const child = spawn("node", ["07-server-sync.mjs"], {
  stdio: ["ignore", "pipe", "inherit"],
});
let port;
await new Promise((ready) =>
  child.stdout.on("data", (d) => {
    const text = d.toString();
    const m = /PORT (\d+)/.exec(text);
    if (m && !port) {
      port = m[1];
      ready();
    } else process.stdout.write(text);
  }),
);
const t0 = Date.now();
const ac = new AbortController();
setTimeout(() => {
  console.log(`  [client +${Date.now() - t0}ms] abort()`);
  ac.abort();
}, 200);
try {
  await fetch(`http://localhost:${port}`, { signal: ac.signal });
} catch (e) {
  console.log(`  [client +${Date.now() - t0}ms] ${e.name}`);
}
await sleep(1500);
child.kill();
