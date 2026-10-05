# AbortController experiments: does abort() cancel server work?

Companion code for the article "Does AbortController Cancel Server Work? I Tested Node and PostgreSQL".
Article: https://shubhra.dev/tutorials/does-abortcontroller-cancel-server-work

Every script is self-contained: it starts its own server on a random port and aborts its own requests.
Requires Node 22 or newer (tested on 22.22.2 and 24.21.0). Results were identical on both except where noted.

## Quick start

    npm i
    node 01-default-behavior.mjs     # what the server does after the client aborts
    node 06-wasted-work.mjs          # 20 abandoned requests, wired vs not wired
    node 10-req-signal.mjs           # req.signal: undefined on Node 22, present on Node 24 (tested 24.21.0)
    node 11-express-req-signal.mjs   # run on Node 22 AND Node 24

## Run the whole suite

bash:

    for f in 0[1-6]-*.mjs 07-sync-block.mjs 08-which-flag.mjs 09-*.mjs 10-*.mjs 11-*.mjs; do echo "== $f"; node $f; done

PowerShell:

    $files = "01-default-behavior","02-propagate-to-downstream","03-express-and-hono","04-streaming-and-upload","05-client-semantics","06-wasted-work","07-sync-block","08-which-flag","09-request-signal-helper","10-req-signal","11-express-req-signal"
    $files | ForEach-Object { "== $_"; node "$_.mjs" }

## Notes

- `07-server-sync.mjs` is a helper that `07-sync-block.mjs` starts as a separate process. Do not run it on its own.
- `08-which-flag.mjs` writes a temporary helper file (`server-flags.mjs`) next to itself.
- `10-req-signal.mjs` prints an `s2:` line only if `req.signal` aborts after a normal request (the bug fixed in Node 24.20). No `s2:` line means the fix is present.
- Express 5: the article also reports Express 5.2.1. To reproduce, run `npm i express@5.2.1`, then rerun
  `03-express-and-hono.mjs`, `11-express-req-signal.mjs` and, with a database running, `db/20-article-handler-check.mjs`.
  Run `npm i express@4.22.3` afterwards to go back.
- Timings vary by a few milliseconds between runs, and more on a busy machine. The order of events is what matters.

## Database experiments

See `db/README.md`. They need a local PostgreSQL (an embedded one is included as a dev dependency).

## Versions used in the article

Node v22.22.2 and v24.21.0, Express 4.22.3 and 5.2.1, Hono 4.13.12, `@hono/node-server` 2.1.3,
PostgreSQL 18.4, `pg` 8.23.1.
The behaviour matched across my runs, and timings differ from run to run.
If your results differ, please open an issue with your OS and versions.

## License

MIT
