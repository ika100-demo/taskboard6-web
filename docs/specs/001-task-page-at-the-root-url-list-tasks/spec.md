---
spec_id: 001-task-page-at-the-root-url-list-tasks
title: Task page at the root URL - list tasks with due dates and create a task with a form
status: building
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard6-gitops:001-persistent-tasks-and-task-ui
---

# 001 — Task page at the root URL - list tasks with due dates and create a task with a form

## Problem

The taskboard6 system can create and list tasks only through its API, and the API keeps them in memory: every restart or redeploy loses every task, so nobody can rely on the board. Using it also requires sending HTTP requests by hand, because the web app is still the starter page. Now that both components run in dev, tasks should survive restarts and people should be able to see and add them in the browser.

## System context

Slice of the system plan `001-persistent-tasks-and-task-ui` in `ika100-demo/taskboard6-gitops` for `taskboard6-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.3** Given tasks exist, when a user opens the web app's root URL, then the page lists every task returned by `GET /tasks` in the same order, showing for each its title and its due date as `YYYY-MM-DD`, or "No due date" when it has none.
- **AC-001.4** Given no task exists, when a user opens the web app's root URL, then the page shows the text "No tasks yet" and the create form.
- **AC-001.5** Given the web app's root page is open, when the user enters the title "Buy milk" and the due date 2026-12-31 and submits the form, then within 5 seconds and without a manual page reload the task appears at the end of the list with that title and due date, the form fields are cleared, and `GET /tasks` on the API returns the task.
- **AC-001.6** Given the web app's root page is open, when the user submits the form with no due date, then the created task is listed with "No due date".
- **AC-001.7** Given the web app's root page is open, when the user submits the form with a title that is empty, only whitespace, or longer than 200 characters after trimming, then the page shows an error message next to the title field, the entered values stay in the form, and no task is created (`GET /tasks` is unchanged).
- **AC-001.8** Given the API is unreachable or answers with a `5xx` status, when a user opens the web app's root URL, then the page loads and shows "Tasks could not be loaded. Please try again later." instead of the list; and when a user submits the create form in that state, the page shows "The task could not be saved. Please try again." and keeps the entered values in the form.

### Contract

The API contract is taskboard6-api spec 001, unchanged, plus the `503` answers of this spec. The web app reads
`TASKBOARD6_API_URL` (no trailing slash; dev: `http://taskboard6-api`) and calls the API only from its server.

**Task (JSON):** `{"id": string (UUID), "title": string (trimmed, 1 to 200 chars), "due_date": "YYYY-MM-DD" | null,
"created_at": "YYYY-MM-DDTHH:MM:SS.ffffffZ" (UTC)}`.

**API `GET /tasks`** (no auth, no query parameters)
- `200`: JSON array of Task, oldest first (creation order), no limit; `[]` when none.
- `503`: `{"detail": "Task storage is unavailable"}` when the database is unreachable.

**API `POST /tasks`** (no auth) body `{"title": string, "due_date": "YYYY-MM-DD" | null}`; `due_date` may be omitted
(= `null`); unknown fields, `id` and `created_at` are ignored.
- `201`: the created Task.
- `422`: FastAPI standard shape `{"detail": [{"loc": ["body", "<field>"], "msg": string, "type": string}, ...]}`; the
  field is `title` or `due_date`. No task is created.
- `503`: `{"detail": "Task storage is unavailable"}`; no task is created.

**API `GET /ready`**: `200` `{"status": "ready"}` when the database answers; `503` `{"status": "not ready"}` otherwise.
**API `GET /health`**: `200` always while the process runs (does not check the database).

**Web `GET /`**: server-rendered on every request (no static caching). Always answers `200`. Shows the create form
(fields labelled "Title" and "Due date" (`<input type="date">`), button "Add task") above either the task list (one
item per task, title and `due_date` or "No due date"), "No tasks yet", or "Tasks could not be loaded. Please try again
later.". The form is shown in all three states.

**Web `POST /api/tasks`** (the web app's own route handler, called by the form): body `{"title": string, "due_date":
"YYYY-MM-DD" | null}`, forwarded unchanged to the API's `POST /tasks`.
- API `201` -> `201` with the Task; the page appends it to the end of the list (removing "No tasks yet") and clears
  both fields.
- API `422` -> `422` with the API's body unchanged; the page shows the first `msg` whose `loc` ends in `title` next to
  the title field (and one whose `loc` ends in `due_date` next to the due date field); values stay.
- anything else (API `5xx`, unlisted status, unreachable, timeout) -> `502` `{"detail": "upstream unavailable"}`; the
  page shows "The task could not be saved. Please try again." near the button; values stay.

**Client-side title check** (before any request): trim; empty -> "Please enter a title."; more than 200 characters ->
"The title must be at most 200 characters."; shown next to the title field, nothing is sent. A failed or successful
new submit replaces the previous message.

### Errors

- API errors are JSON with a top-level `detail`: a string for `503`, the FastAPI list for `422`. The API never answers
  an HTML error page; an unexpected failure is `500` `{"detail": "Internal Server Error"}`.
- Web route handler errors are JSON `{"detail": ...}` as above.
- A caller treats any status the contract does not list for that call, a body that is not the documented JSON, a
  connection error or a timeout exactly like a `5xx`: the web page shows "Tasks could not be loaded. Please try again
  later." (list) or "The task could not be saved. Please try again." (create). The web app never retries a `POST`
  (to avoid duplicates); the user retries.
- The API logs every `503` with the database error (structlog, no credentials in the log).

### Timeouts

- Web server -> API `GET /tasks`: 3 s total; on timeout, the list error message (page still `200`).
- Web server -> API `POST /tasks`: 3 s total; on timeout, `502` to the browser and the save error message.
- Browser -> web `POST /api/tasks`: 4 s client-side abort; on abort, the save error message. Together this keeps
  AC-001.5's 5-second budget.
- API -> Postgres: connect timeout 2 s, statement timeout 2 s; on either, the task routes answer `503` (well inside 5 s)
  and `/ready` answers `503`. A pooled connection that has gone bad is discarded and the next request reconnects; no
  restart is needed once the database is back.
- API `/ready` -> Postgres: `SELECT 1` with a 1 s timeout (the probe's own timeout is the platform default).

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- env `TASKBOARD6_API_URL=http://taskboard6-api`

### Notes for this repo

Config: `TASKBOARD6_API_URL` (server-side only, never `NEXT_PUBLIC_*`; set by the gitops-app to
`http://taskboard6-api`); document it in docs/env-vars.md. Replace the starter page. The browser never calls the
API directly: `/` is a dynamic Server Component that fetches `GET /tasks`; the form (client component) posts to
the web app's own `POST /api/tasks` route handler, which forwards to the API (see Contract). `/api/ready` must not
depend on the API (the page must load while the API is down). Tests: mock the API in Vitest; e2e against a stub
API server; smoke: page loads (`@smoke`), create a `smoke-<uuid>` task (`@smoke @writes`).

## Stories

<!-- As a <persona>, I want <goal>, so that <benefit>. -->

## Acceptance criteria

- **AC-001.1** Given the API's `GET /tasks` returns tasks, when a user opens `/`, then the page shows one list item per task in the returned order, each with its title and its `due_date` as `YYYY-MM-DD`, or the text "No due date" when `due_date` is `null` (system AC-001.3, AC-001.6)
- **AC-001.2** Given the API's `GET /tasks` returns `[]`, when a user opens `/`, then the page shows "No tasks yet" and the create form with the fields labelled "Title" and "Due date" and the button "Add task" (system AC-001.4)
- **AC-001.3** Given `/` is open, when the user enters the title "Buy milk" and the due date 2026-12-31 and presses "Add task", then within 5 seconds and without a page reload the task "Buy milk" with "2026-12-31" appears as the last list item, both fields are empty, and the API's `GET /tasks` contains it (system AC-001.5)
- **AC-001.4** Given `/` is open, when the user submits a title with the due date left empty, then the request to the API carries `due_date: null` and the new list item shows "No due date" (system AC-001.6)
- **AC-001.5** Given `/` is open, when the user submits a title that is empty or only whitespace, then "Please enter a title." is shown next to the title field, the entered values stay, and no request reaches the API; for a title longer than 200 characters after trimming the message is "The title must be at most 200 characters." (system AC-001.7)
- **AC-001.6** Given the API answers `POST /tasks` with `422` naming `title`, when the user submits, then the API's message is shown next to the title field and the entered values stay (system AC-001.7)
- **AC-001.7** Given the API is unreachable, slower than 3 seconds or answers `GET /tasks` with a `5xx`, when a user opens `/`, then the page loads with status `200` and shows "Tasks could not be loaded. Please try again later." instead of the list (system AC-001.8)
- **AC-001.8** Given the API is unreachable, slower than 3 seconds or answers `POST /tasks` with a `5xx` or any status the contract does not list, when the user submits the form, then the page shows "The task could not be saved. Please try again." and keeps the entered values (system AC-001.8)

## Non-goals

## Assumptions

<!-- Spec 149: decisions taken by default, approved with the spec. One bullet each: - **A1** <the decision> (other option: <…>; affects AC-…). A revised one is struck through (~~…~~), never deleted. -->

## Open questions

<!-- Only what may not be decided by default (spec 149): security or access, money, destroying or migrating data, or a request too ambiguous to build. Approval is refused while any is open. Strike answered ones (~~…~~) and fold the answer into the criteria. -->

## Changelog

- 2026-11-07 created from the system plan, with its criteria (spec 147)
- 2026-11-07 approved
- 2026-11-07 building
