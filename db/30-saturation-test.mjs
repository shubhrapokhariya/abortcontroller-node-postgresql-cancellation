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

const pool = new pg.Pool({ max: 2 });
const cancelPool = process.env.SHARED_POOL
  ? pool // the bad setup: cancels compete with the work connections
  : new pg.Pool({ max: 2, connectionTimeoutMillis: 2000 }); // reserved for cancels
for (const p of new Set([pool, cancelPool])) {
  p.on("error", (e) => console.error("idle client error", e)); // without this, one dropped idle connection can crash the process
}
const app = express();

app.get("/report", async (req, res, next) => {
  const signal = requestSignal(res, { timeoutMs: 5000 });
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
console.log(
  "node",
  process.version,
  "| work pool max = 2, two concurrent requests, both clients leave at 400ms",
);
const acs = [new AbortController(), new AbortController()];
acs.map((ac) => fetch(url, { signal: ac.signal }).catch(() => {}));
await sleep(400);
acs.forEach((a) => a.abort());
for (const ms of [600, 3000, 4000]) {
  await sleep(ms);
  console.log(
    `pool: total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`,
  );
}
console.log(
  pool.idleCount === 2
    ? "OK: both connections came back"
    : "HUNG: connections never released",
);
process.exit(0);
