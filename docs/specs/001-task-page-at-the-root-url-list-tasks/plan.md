---
spec_id: 001-task-page-at-the-root-url-list-tasks
shape: web-nextjs
spec_hash: 83707ea899f2
summary: Replace the starter page with a server-rendered task list and a create form that posts through the app's own /api/tasks route to taskboard6-api
tasks:
  - id: t1
    title: Add the shared Task type, response guard and title validation
    files: [app/_lib/task.ts]
    covers: [AC-001.1, AC-001.5]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: Add the server-only taskboard6-api client with timeouts
    files: [app/_lib/tasks-api.ts, docs/env-vars.md]
    covers: [AC-001.1, AC-001.3, AC-001.4, AC-001.6, AC-001.7, AC-001.8]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t4
    title: Add the TaskBoard client component (form, list, states, submit flow)
    files: [app/_components/task-board.tsx, app/globals.css]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.8]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t3
    title: Add the POST /api/tasks route handler
    files: [app/api/tasks/route.ts]
    covers: [AC-001.3, AC-001.4, AC-001.6, AC-001.8]
    parallel_safe: true
    depends_on: [t2]
    done: true
  - id: t5
    title: Replace the starter page with the dynamic task page
    files: [app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts, devbox.json]
    covers: [AC-001.1, AC-001.2, AC-001.7]
    parallel_safe: true
    depends_on: [t2, t4]
---

# Plan — 001 Task page at the root URL

Design and contract: [design.md](design.md). Levels: t1 -> t2, t4 -> t3, t5. No gitops task: the system plan already
wires `TASKBOARD6_API_URL=http://taskboard6-api` for this component.

## t1 — Add the shared Task type, response guard and title validation

**Files:** app/_lib/task.ts
**Covers:** AC-001.1, AC-001.5
**Goal:** one client-safe module (no I/O, no Node APIs) that the server client and the client component both import.

**Implementation notes:**
- Export `Task`, `isTask`, `TITLE_MAX = 200`, `MSG`, `validateTitle` exactly as in design.md (Signatures).
- `isTask`: object with string `id`, `title`, `created_at`; `due_date` is a string or `null`.
- `validateTitle`: trim; empty -> `MSG.titleEmpty`; length > 200 -> `MSG.titleTooLong`; else `null`.

**Done when:** typecheck is clean and the title-validation parts of the AC-001.5 tests can pass once t4 lands.

## t2 — Add the server-only taskboard6-api client with timeouts

**Files:** app/_lib/tasks-api.ts, docs/env-vars.md
**Covers:** AC-001.1, AC-001.3, AC-001.4, AC-001.6, AC-001.7, AC-001.8
**Goal:** `listTasks()` and `createTask(rawBody)` per design.md (Upstream calls), the only place that talks to the API.

**Implementation notes:**
- Read `process.env.TASKBOARD6_API_URL` inside each call; unset -> failure result + log, no default.
- `fetch` with `cache: "no-store"` and `signal: AbortSignal.timeout(3000)`; catch every throw.
- `listTasks`: `200` + array of `isTask` -> `{ok: true, tasks}` in returned order; anything else `{ok: false}`.
- `createTask`: POST with `content-type: application/json`, body unchanged, no retry; map `201`/`422`/else to the
  `CreateResult` union; a `422` body without an array `detail` counts as `502`.
- One structured `console.error(JSON.stringify({...}))` line per failure (op, status or error name); never log bodies.
- `docs/env-vars.md`: new "Upstream" table row for `TASKBOARD6_API_URL` (no default, server-side only, dev value
  `http://taskboard6-api`, set by the gitops-app, no trailing slash).

**Done when:** the Vitest tests of the list/create mapping (AC-001.7, AC-001.8 incl. timeouts) pass via t3/t5.

## t4 — Add the TaskBoard client component (form, list, states, submit flow)

**Files:** app/_components/task-board.tsx, app/globals.css
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.8
**Goal:** the `"use client"` component that renders the markup in design.md (Web `GET /`) from `initial` and runs
the submit flow.

**Implementation notes:**
- Props `{ initial: BoardInitial }`; list kept in state; form above the list in every state.
- Labels, ids, `role="alert"` messages and aria wiring exactly as in design.md; button "Add task", disabled in flight.
- Submit flow steps 1 to 5 of design.md: client validation first (nothing sent), trimmed title, `due_date: null` for
  an empty date, `AbortSignal.timeout(4000)`.
- `201`: append, clear both fields; in the load-error state keep the error text and only clear the fields.
- `422`: route `msg`s by `loc` suffix (`title` / `due_date`), else the save error; values stay.
- Any other outcome: `MSG.saveFailed` in `save-error`, values stay. A new submit replaces previous messages.
- Styles in `app/globals.css` with the existing tokens; layout must not scroll horizontally at 375 px.

**Done when:** the `tests/task-board.test.tsx`-style acceptance tests for AC-001.2 to AC-001.6 and AC-001.8 (client
side) pass.

## t3 — Add the POST /api/tasks route handler

**Files:** app/api/tasks/route.ts
**Covers:** AC-001.3, AC-001.4, AC-001.6, AC-001.8
**Goal:** `export async function POST(req: Request)` that forwards `await req.text()` to `createTask()` and answers per
the table in design.md; `export const dynamic = "force-dynamic"`.

**Implementation notes:**
- `201` -> Task JSON with status 201; `422` -> the API body unchanged with 422; `502` ->
  `{"detail": "upstream unavailable"}` with 502. Use `NextResponse.json` like the existing routes.
- No body validation here (the API is the authority; the client validated already).

**Done when:** the route acceptance tests (201 passthrough, 422 passthrough, 5xx/unlisted/unreachable/timeout -> 502)
pass.

## t5 — Replace the starter page with the dynamic task page

**Files:** app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts, devbox.json
**Covers:** AC-001.1, AC-001.2, AC-001.7
**Goal:** `/` is an async, `force-dynamic` Server Component rendering `<h1>Tasks</h1>` and `TaskBoard` with the result
of `listTasks()`; the starter content and its tests are gone.

**Implementation notes:**
- `export const dynamic = "force-dynamic"`; `export default async function HomePage()`; no hooks in the page.
- `listTasks()` -> `{state: "loaded", tasks}` or `{state: "error"}`; the page always renders (status 200).
- Delete `app/_components/feature-card.tsx` and `app/_components/icons.tsx` (only the starter page used them).
- Delete the starter unit test `tests/page.test.tsx` (it asserts the starter hero); acceptance tests live in new files.
- `e2e/home.spec.ts`: keep the landmarks, 404 and phone-width tests; change the h1 name to "Tasks"; drop the
  "Check health" link test (the link no longer exists; `/api/health` stays linked in the header).
- `devbox.json`: add the project recipe `"e2e-tasks": "TASKBOARD6_API_URL=http://127.0.0.1:4010 devbox run e2e"`
  (template recipes untouched).

**Done when:** the page acceptance tests for AC-001.1, AC-001.2, AC-001.7 pass, `devbox run ci` is green (coverage
gate included), and `devbox run e2e` passes.
