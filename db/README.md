# Database experiments (real PostgreSQL)

Article results used PostgreSQL 18.4 and node-postgres (`pg`) 8.23.1.
The scripts expect a PostgreSQL server on localhost:54329, user `postgres`, password `pw`.

I ran everything with Node 22.22.2 and 24.21.0. The behaviour matched the article, and timings differ from run to run.

## Before you start

Run `npm i` once in the project root. Scripts 10, 11, 20 and 30 all need a running database.

## Start a database

Option A: any PostgreSQL you already have, listening on port 54329 with that user and password.

Option B: embedded PostgreSQL (installed by `npm i` in the parent folder as a dev dependency). It is a beta build (`18.4.0-beta.17`).
It refuses to run as root, so use a normal user. Start it in terminal 1 and leave it running:

    cd db
    node 00-start-postgres.mjs

Wait for `PG READY`. Each start uses a fresh temporary data folder, and Ctrl+C removes it. If Windows still holds a file at that moment, you get a one-line warning instead, and the folder is safe to delete by hand.
On Windows, do not run `npm i` while the database is running, because npm can fail on locked files.
If the embedded database does not start on your machine, use Option A. The experiments only need a PostgreSQL on port 54329.

## Run the experiments

In terminal 2, from the `db` folder, set the connection variables.

bash:

    export PGHOST=localhost PGPORT=54329 PGUSER=postgres PGPASSWORD=pw PGDATABASE=postgres

PowerShell:

    $env:PGHOST="localhost"; $env:PGPORT="54329"; $env:PGUSER="postgres"; $env:PGPASSWORD="pw"; $env:PGDATABASE="postgres"

Then:

    node 10-http-abort-vs-query.mjs         # query keeps running vs pg_cancel_backend
    node 11-signal-sideeffects-timeout.mjs  # pg ignores { signal }, committed writes, statement_timeout
    node 20-article-handler-check.mjs       # the article's Express + pg handler: normal, client leaves,
                                            # cancelled by someone else, backend killed
    node 30-saturation-test.mjs             # work pool of 2 + two abandoned requests: connections come back

Two switches change the behaviour on purpose:

- `DEADLINE_MS=500` for script 20 (default 5000) makes the handler hit its deadline, so the first request returns 504 (`normal: 504`). That is the line to check.
  The other lines can vary in that run, because the deadline and the later steps are close in time.
  `DEADLINE_MS=1` fires the deadline before the query starts. The first request must still return `normal: 504` and not hang. Only the first two lines of that run are meaningful.
- `SHARED_POOL=1` for script 30 sends the cancel through the work pool instead of the reserved
  `cancelPool`. With a pool of 2 and two abandoned requests it hangs, and the script prints `HUNG`.

bash: `DEADLINE_MS=500 node 20-article-handler-check.mjs`
PowerShell: `$env:DEADLINE_MS="500"; node 20-article-handler-check.mjs; Remove-Item Env:DEADLINE_MS`

Timings vary between runs. Results from a busy machine can show a cancel landing later than on an idle one.
