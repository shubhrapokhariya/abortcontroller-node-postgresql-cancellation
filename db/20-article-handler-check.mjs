import express from "express";
import pg from "pg";
import { setTimeout as sleep } from "node:timers/promises";
function requestSignal(res, { timeoutMs } = {}) {
  const gone = new AbortController();
  res.once("close", () => {
    if (!res.writableFinished) gone.abort(new Error("client closed request"));
  });
  const signals = [gone.signal];
  if (timeoutMs) signals.push(AbortSignal.timeout(timeoutMs));
  return AbortSignal.any(signals);
}

const pool = new pg.Pool({ max: 5 });
const cancelPool = new pg.Pool({ max: 2, connectionTimeoutMillis: 2000 }); // reserved for cancels
for (const p of [pool, cancelPool]) {
  p.on("error", (e) => console.error("idle client error", e)); // without this, one dropped idle connection can crash the process
}
const app = express();

app.get("/report", async (req, res, next) => {
  const signal = requestSignal(res, {
    timeoutMs: Number(process.env.DEADLINE_MS || 5000),
  });
  let client;
  let cancelSent = Promise.resolve();
  try {
    client = await pool.connect();
    const {
      rows: [{ pid }],
    } = await client.query("select pg_backend_pid() as pid");
    if (signal.aborted) {
      // nothing is running yet, so there is nothing to cancel,
      // but a client that is still connected is waiting for an answer
      if (signal.reason?.name === "TimeoutError" && !res.destroyed) {
        res.status(504).send("deadline exceeded");
      }
      return;
    }

    const cancel = () => {
      // a different connection sends the cancel, the busy one is stuck in the query
      cancelSent = cancelPool
        .query("select pg_cancel_backend($1)", [pid])
        .catch((e) => console.error("pg_cancel_backend failed", e));
    };
    signal.addEventListener("abort", cancel, { once: true });

    try {
      const { rows } = await client.query("select pg_sleep(3), 1 as n");
      res.json(rows);
    } finally {
      signal.removeEventListener("abort", cancel); // no new cancels after this point
    }
  } catch (err) {
    if (err.code !== "57014") return next(err); // 57014 = query cancelled
    if (!res.destroyed && !res.writableEnded) {
      // 57014 only says "cancelled". Our deadline is one cause, but not the only one.
      const deadline = signal.reason?.name === "TimeoutError";
      res
        .status(deadline ? 504 : 500)
        .send(deadline ? "deadline exceeded" : "query cancelled");
    }
  } finally {
    await cancelSent; // let any in-flight cancel finish before the connection is reused
    client?.release();
  }
});

const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const url = `http://localhost:${server.address().port}/report`;
const admin = new pg.Client();
await admin.connect();
const active = async () =>
  (
    await admin.query(
      "select count(*)::int n from pg_stat_activity where state='active' and query like '%pg_sleep(3)%' and pid <> pg_backend_pid()",
    )
  ).rows[0].n;
const hit = (fn) =>
  admin.query(
    `select ${fn}(pid) from pg_stat_activity where state='active' and query like '%pg_sleep(3)%' and pid <> pg_backend_pid()`,
  );
console.log(
  "node",
  process.version,
  "express",
  (await import("express/package.json", { with: { type: "json" } })).default
    .version,
  "| postgres",
  (await admin.query("show server_version")).rows[0].server_version,
);
let r = await fetch(url);
console.log("normal:", r.status);
const ac = new AbortController();
setTimeout(() => ac.abort(), 400);
try {
  await fetch(url, { signal: ac.signal });
} catch (e) {
  console.log("client leaves:", e.name);
}
await sleep(300);
console.log("  active pg_sleep after client left:", await active());
let p = fetch(url);
await sleep(400);
await hit("pg_cancel_backend");
r = await p;
console.log(
  "someone else cancels the query, status:",
  r.status,
  await r.text(),
);
p = fetch(url);
await sleep(400);
await hit("pg_terminate_backend");
r = await p;
console.log("backend killed mid-query, status:", r.status);
await sleep(300);
console.log("pool still works:", (await fetch(url)).status);
await admin.end();
await pool.end();
await cancelPool.end();
server.close();
process.exit(0);
