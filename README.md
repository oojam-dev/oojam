# oojam

**[oojam.dev](https://oojam.dev) is a website with no purpose.** Every day, the community
picks one idea and Claude builds it, here, in public.

## How it works

1. Anyone can propose an idea or vote for one at **[build.oojam.dev](https://build.oojam.dev)**.
   Ideas and votes cost credits, which pay for the builds and the hosting.
2. At 00:00 UTC the top idea is frozen and handed to Claude, which builds it in this
   repository inside a sandbox, following [`CLAUDE.md`](CLAUDE.md).
3. The change is checked from outside: guardrails (protected files, additive-only
   migrations, dependency and secret checks), an independent Claude review, and a browser
   smoke test against a copy of the live data.
4. If everything passes, a pull request is opened here, CI runs, and it's merged and
   deployed automatically. The idea is added to the changelog on the home page.

The machinery that runs this (voting, payments, the daily cycle, guardrails and deploys) lives
in a separate repository, [`oojam-dev/platform`](https://github.com/oojam-dev/platform). This
repository is only the site, and the builder never sees the platform.

## Stack

React Router v7 (framework mode), React 19, TypeScript, Tailwind CSS v4, Drizzle ORM,
Postgres 17, Vitest. Node 22.

## Local development

```sh
# Postgres
docker run -d --name oojam-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=oojam -e POSTGRES_DB=site postgres:17
export DATABASE_URL=postgres://postgres:oojam@localhost:5432/site

npm ci --ignore-scripts
npm run db:migrate
npm run dev            # http://localhost:3000
```

The site also runs without `DATABASE_URL` until a feature needs the database.

| Command | |
|---|---|
| `npm run dev` | Dev server with hot reload. |
| `npm run check` | Generate route types and typecheck. |
| `npm test` | Unit tests. |
| `npm run build` / `npm start` | Production build and server (`PORT`, default 3000). |
| `npm run db:generate` | Create a migration from `app/db/schema.ts` (no database needed). |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL`. |

`GET /_health` returns `{ "ok": true, "sha": "<GIT_SHA or dev>" }`, or `503` with
`"ok": false` if the database is unreachable.

The production image is built from the [`Dockerfile`](Dockerfile), which typechecks, tests
and builds the site, and runs as a non-root user on a read-only filesystem.

## Contributing

Changes land through the daily build: propose an idea at
[build.oojam.dev](https://build.oojam.dev). Maintainers only commit directly in emergencies,
such as security fixes, outages or reverts. Bug reports are welcome as GitHub issues;
please report security problems privately through GitHub's "Report a vulnerability".

## Licence

[MIT](LICENSE). Copyright (c) 2026 oojam contributors.
