<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Fundicate local database in Codex

Run `npm run db:local -- --keep-alive` in a retained execution session with `tty: true` before database-backed development or tests. Codex can terminate background child processes when their launching cell exits. Keep the database session alive while working; send a newline-terminated `stop` command to that same session for a clean shutdown. A non-TTY session may have closed stdin. Normal native terminal usage may use `npm run db:local` as a background daemon. Never reset the demo database as part of testing: use the isolated `npm run test:integration` and `npm run test:e2e` runners.
