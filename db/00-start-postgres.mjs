import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// a fresh temp folder every run, so a leftover folder can never block a restart
const databaseDir = mkdtempSync(join(tmpdir(), "pgdata-"));
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "pw",
  port: 54329,
  persistent: false,
});

await pg.initialise();
await pg.start();
console.log("PG READY");

async function stop() {
  await pg.stop();
  try {
    // Windows can hold a file for a moment after shutdown, so retry before giving up
    rmSync(databaseDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  } catch (e) {
    console.warn("could not remove", databaseDir, "(safe to delete manually)");
  }
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

setInterval(() => {}, 1e9);
