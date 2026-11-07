# Design — 001 Task page at the root URL

The system contract in `spec.md` (System context) is binding; this file fixes how this repo implements it and the
details the testers write against (selectors, module signatures, test seams).

## Decisions

- **Server-only API access.** `/` is an async Server Component with `export const dynamic = "force-dynamic"` that calls
  `listTasks()`; the form posts to the app's own `POST /api/tasks`, which calls `createTask()`. Both use one server
  module (`app/_lib/tasks-api.ts`) built on the global `fetch` with `cache: "no-store"` and
  `AbortSignal.timeout(3000)`. No new dependency. `TASKBOARD6_API_URL` is read on every call (not at module load), so
  tests can set it per test.
- **One client component owns the board.** `TaskBoard` ("use client") receives the server's initial state and keeps the
  list in React state; a successful create appends the returned Task locally (no `router.refresh()`, no page reload),
  which keeps the component testable without mocking `next/navigation`.
- **Validate API responses.** A `200`/`201`/`422` whose body is not the documented JSON is treated as a `5xx`
  (Errors section). The guard `isTask()` lives in a client-safe module shared by server and client.
- **Dates are shown verbatim.** `due_date` is rendered as the `YYYY-MM-DD` string the API returns; never parsed into a
  `Date` (no timezone shifts).
- **Unset `TASKBOARD6_API_URL`** behaves like an unreachable API (list error / `502`) and logs an error; there is no
  default URL.
- **List error state + successful create:** the load-error message stays (the full list is unknown), the fields are
  cleared. Not covered by a criterion; chosen as the least surprising behaviour.
- The starter page components (`feature-card.tsx`, `icons.tsx`) are deleted: unused files under `app/` count against
  the 80 % coverage gate.

No ADR: every decision is local to this feature and follows the platform conventions.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/task.ts` | `Task` type, `isTask()` guard, `validateTitle()`, message constants (client-safe, no I/O) | new |
| `app/_lib/tasks-api.ts` | server-only API client: `listTasks()`, `createTask()`, timeouts, logging | new |
| `app/api/tasks/route.ts` | `POST /api/tasks` route handler mapping API results to `201`/`422`/`502` | new |
| `app/_components/task-board.tsx` | client component: form, list / empty / load-error state, submit flow | new |
| `app/page.tsx` | dynamic Server Component: `<h1>Tasks</h1>` + `TaskBoard` | changed (replaces starter) |
| `app/globals.css` | styles for the board (existing tokens) | changed |
| `app/api/ready/route.ts` | unchanged: must not call the API | unchanged |
| `docs/env-vars.md` | documents `TASKBOARD6_API_URL` | changed |

### Signatures

```ts
// app/_lib/task.ts
export type Task = { id: string; title: string; due_date: string | null; created_at: string };
export function isTask(v: unknown): v is Task;          // id/title/created_at strings, due_date string|null
export const TITLE_MAX = 200;
export const MSG = {
  titleEmpty: "Please enter a title.",
  titleTooLong: "The title must be at most 200 characters.",
  loadFailed: "Tasks could not be loaded. Please try again later.",
  saveFailed: "The task could not be saved. Please try again.",
  noDueDate: "No due date",
  empty: "No tasks yet",
} as const;
export function validateTitle(raw: string): string | null; // trims; null when valid, else MSG.titleEmpty / MSG.titleTooLong

// app/_lib/tasks-api.ts (server only)
export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateResult =
  | { status: 201; task: Task }
  | { status: 422; body: { detail: Array<{ loc: Array<string | number>; msg: string; type: string }> } }
  | { status: 502 };
export function listTasks(): Promise<ListResult>;
export function createTask(rawBody: string): Promise<CreateResult>; // forwards the body unchanged

// app/_components/task-board.tsx
export type BoardInitial = { state: "loaded"; tasks: Task[] } | { state: "error" };
export function TaskBoard(props: { initial: BoardInitial }): JSX.Element;

// app/page.tsx
export default async function HomePage(): Promise<JSX.Element>; // tests: render(await HomePage())
```

## Contract

### Upstream calls (from `tasks-api.ts`)

- `GET ${TASKBOARD6_API_URL}/tasks`, `cache: "no-store"`, 3 s total timeout. `ok: true` only for `200` with a JSON
  array whose every element passes `isTask`; order is kept as returned. Anything else (other status, bad JSON,
  network error, timeout, unset URL) is `{ ok: false }` (AC-001.1, AC-001.7).
- `POST ${TASKBOARD6_API_URL}/tasks`, header `content-type: application/json`, the browser's body forwarded unchanged,
  3 s total timeout, never retried. `201` + `isTask` body -> `{status: 201}`; `422` + body with an array `detail` ->
  `{status: 422, body}` unchanged; everything else -> `{status: 502}` (AC-001.3, AC-001.6, AC-001.8).
- Each failure logs one structured line on stderr: `console.error(JSON.stringify({ level: "error", msg:
  "taskboard6-api call failed", op: "list"|"create", status?: number, error?: string }))`.

### Web `POST /api/tasks` (`app/api/tasks/route.ts`, `dynamic = "force-dynamic"`)

Request: the raw request body (expected `{"title": string, "due_date": "YYYY-MM-DD" | null}`), passed to
`createTask()` unchanged.

| createTask result | Response |
|---|---|
| `201` | `201` `application/json`, the Task |
| `422` | `422` `application/json`, the API's body unchanged |
| `502` | `502` `application/json`, `{"detail": "upstream unavailable"}` |

### Web `GET /`

Always `200`, rendered per request. Markup the tests rely on:

- `<h1>Tasks</h1>` (the existing smoke test needs one level-1 heading).
- A `<form aria-label="Add task">` shown in every state, with
  - `<label for="task-title">Title</label>` + `<input id="task-title" name="title" type="text">` and, when set,
    `<p id="title-error" role="alert">` immediately after it; the input carries `aria-invalid="true"` and
    `aria-describedby="title-error"` while the message shows.
  - `<label for="task-due-date">Due date</label>` + `<input id="task-due-date" name="due_date" type="date">` and, when
    set, `<p id="due-date-error" role="alert">` after it (same aria wiring).
  - `<button type="submit">Add task</button>`; while a request is in flight it is `disabled`.
  - when set, `<p id="save-error" role="alert">` right after the button with `MSG.saveFailed`.
- Below the form exactly one of
  - `<ul aria-label="Tasks">` with one `<li>` per task in order, each containing `<span class="task-title">{title}</span>`
    and `<span class="task-due">{due_date ?? "No due date"}</span>` (AC-001.1);
  - `<p>No tasks yet</p>` when the list is empty (AC-001.2);
  - `<p role="alert">Tasks could not be loaded. Please try again later.</p>` on load failure (AC-001.7).

### Submit flow (`TaskBoard`)

1. Clear all three messages. `err = validateTitle(title)`; if set, show it as `title-error`, send nothing, keep values
   (AC-001.5).
2. `fetch("/api/tasks", { method: "POST", headers: {"content-type": "application/json"}, body:
   JSON.stringify({ title: title.trim(), due_date: dueDate === "" ? null : dueDate }), signal:
   AbortSignal.timeout(4000) })` (AC-001.4).
3. `201` with an `isTask` body: append to the list (the empty text disappears), clear both fields (AC-001.3).
4. `422`: first `msg` whose `loc` ends in `"title"` -> `title-error`; first ending in `"due_date"` -> `due-date-error`;
   neither found -> `save-error`. Values stay (AC-001.6).
5. Anything else (`502`, other status, bad body, network error, abort): `save-error` with `MSG.saveFailed`, values stay
   (AC-001.8).

## Configuration

`TASKBOARD6_API_URL` (server-side only, no trailing slash; dev `http://taskboard6-api`, wired by the gitops-app).
Documented in `docs/env-vars.md`. Never exposed as `NEXT_PUBLIC_*`. `/api/ready` stays independent of it.

## Tests (for the testers)

- Acceptance tests go in new files, not the starter ones the coders remove or rewrite (`tests/page.test.tsx`,
  `e2e/home.spec.ts`): e.g. `tests/task-page.test.tsx`, `tests/task-board.test.tsx`, `tests/api-tasks-route.test.ts`,
  `e2e/tasks.spec.ts`.
- Vitest: mock the API with `vi.stubGlobal("fetch", ...)` and set `process.env.TASKBOARD6_API_URL` per test; render
  the page with `render(await HomePage())`; call the route as `POST(new Request("http://localhost/api/tasks", ...))`.
  Timeout cases: a fetch mock that honours `init.signal` and never resolves, with fake timers.
- e2e: one spec file starts a stub API (`node:http`) in `beforeAll` on the port of `TASKBOARD6_API_URL` and runs
  serially; it `test.skip`s when `TASKBOARD6_API_URL` is unset. The project recipe `devbox run e2e-tasks`
  (`TASKBOARD6_API_URL=http://127.0.0.1:4010 devbox run e2e`) runs it; plain `devbox run e2e` leaves it skipped.
- Smoke (in `e2e/`): page loads `@smoke` (existing test, still valid with `<h1>Tasks</h1>`); create `smoke-<uuid>`
  `@smoke @writes`.

## Risks

- `AbortSignal.timeout` on the server: Node 24 supports it; the 3 s server + 4 s browser budget keeps AC-001.3's 5 s.
- Server Component rendering under Vitest relies on `await HomePage()` returning plain JSX (no hooks in the page).
