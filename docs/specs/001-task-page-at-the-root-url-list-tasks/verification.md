# Verification — 001 Task page at the root URL

**Result:** pass
**Commit:** 14f465c · **Base:** 936c38e · **Trace:** 8/8 criteria named by tests

Test runs (Phase 3): `devbox run ci` green (lint, typecheck, vitest with coverage gate, audit, secrets-scan);
`devbox run e2e-tasks` 11 passed, 3 skipped (`@smoke`, only via `devbox run smoke`); `devbox run e2e` 3 passed,
11 skipped (`e2e/tasks.spec.ts` needs `TASKBOARD6_API_URL`).

| Criterion | Verdict | Tests | Implementation | Notes |
|---|---|---|---|---|
| AC-001.1 | met | `tests/task-page.test.tsx` "AC-001.1 shows one list item per task in order…"; `e2e/tasks.spec.ts` "AC-001.1 lists the API's tasks in order…"; `e2e/tasks-smoke.spec.ts` "AC-001.1 … @smoke" | `app/_lib/tasks-api.ts:29-42`, `app/page.tsx:8-13`, `app/_components/task-board.tsx:132-139` | Tests use non-alphabetical order (Zebra/Apple) so order is really checked; `null` -> "No due date" checked; date rendered verbatim (no `Date` parsing). |
| AC-001.2 | met | `tests/task-page.test.tsx` "AC-001.2 shows the empty state and the create form"; `e2e/tasks.spec.ts` "AC-001.2 …" | `app/_components/task-board.tsx:83-130` | Asserts "No tasks yet", labels "Title" / "Due date", button "Add task". |
| AC-001.3 | met | `tests/task-board.test.tsx` "AC-001.3 appends the created task as the last item…", "AC-001.3 replaces the empty state…"; `tests/api-tasks-route.test.ts` "AC-001.3 forwards the body unchanged…"; `e2e/tasks.spec.ts` "AC-001.3 adds a task without reload and the API has it"; `e2e/tasks-smoke.spec.ts` "AC-001.3 … @smoke @writes" | `app/_components/task-board.tsx:48-60`, `app/api/tasks/route.ts:8-12`, `app/_lib/tasks-api.ts:56-65` | e2e checks last item, 5 s timeout, cleared fields, a window marker proving no reload, and the stub's store (what its `GET /tasks` returns) contains "Buy milk". |
| AC-001.4 | met | `tests/task-board.test.tsx` "AC-001.4 sends due_date null…"; `e2e/tasks.spec.ts` "AC-001.4 sends due_date null when the date is empty" | `app/_components/task-board.tsx:51` | e2e asserts the body that reached the stub API is `{title, due_date: null}` and the item shows "No due date". |
| AC-001.5 | met | `tests/task-board.test.tsx` three "AC-001.5 …" tests (empty, whitespace, 201 vs 200 chars); `e2e/tasks.spec.ts` "AC-001.5 validates the title in the browser…" | `app/_lib/task.ts:30-35`, `app/_components/task-board.tsx:41-45, 95-99` | Messages exact; values kept; `fetch` not called / stub `posts` empty; boundary 200 accepted. Message sits right after the title input with `aria-describedby`. |
| AC-001.6 | met | `tests/task-board.test.tsx` "AC-001.6 shows the API's 422 message…"; `tests/api-tasks-route.test.ts` "AC-001.6 passes a 422 … unchanged"; `e2e/tasks.spec.ts` "AC-001.6 …" | `app/_lib/tasks-api.ts:69-79`, `app/api/tasks/route.ts:13-14`, `app/_components/task-board.tsx:13-23, 62-71` | API msg shown, title `aria-invalid`, values stay; route passes body through unchanged. |
| AC-001.7 | met | `tests/task-page.test.tsx` four "AC-001.7 …" tests (5xx, unreachable, >3 s with fake timers, malformed body); `tests/task-board.test.tsx` "AC-001.7 renders the load error…"; `e2e/tasks.spec.ts` "AC-001.7 loads with 200…" | `app/_lib/tasks-api.ts:24-46` (3000 ms `AbortSignal.timeout`, line 31), `app/page.tsx:9`, `app/_components/task-board.tsx:127-128` | Status 200 asserted in e2e for the 5xx case; for unreachable/timeout the page never throws (`listTasks` catches everything), so it renders 200 as well. |
| AC-001.8 | met | `tests/api-tasks-route.test.ts` five "AC-001.8 …" tests (5xx, unreachable, 404 unlisted, >3 s, unset URL -> 502 `{"detail":"upstream unavailable"}`); `tests/task-board.test.tsx` four "AC-001.8 …" tests (502, network error, 418, timeout signal); `e2e/tasks.spec.ts` "AC-001.8 shows the save error…" | `app/_lib/tasks-api.ts:49-86`, `app/api/tasks/route.ts:16`, `app/_components/task-board.tsx:52, 73-75` | Values kept and list unchanged asserted; no retry (single `fetch` per submit). |

## Non-goals

The spec lists no non-goals. Nothing outside the contract was added (no direct browser -> API calls, no
`NEXT_PUBLIC_*` variable, `/api/ready` untouched). Template-owned layout (header, footer, navigation,
`app/layout.tsx`) is unchanged; e2e tests scope their assertions to `getByRole("main")`. ✔

## Deviations from the plan

- `tests/api-tasks-route.test.ts`, `tests/task-board.test.tsx`, `tests/task-page.test.tsx`, `e2e/tasks.spec.ts`,
  `e2e/tasks-smoke.spec.ts` are in no task's `files`: the tester's red acceptance-test commit (`b9cdd00`), as
  design.md "Tests" prescribes. Acceptable.
- `docs/specs/001-…/{spec,design,plan}.md` changed: spec workflow documents. Acceptable.
- All tasks t1–t5 are `done: true`. No other file changed outside the tasks' `files`.
- `e2e/home.spec.ts` dropped the "Check health" link test and renamed the h1 check: planned in t5. Acceptable.

## Contract

Matches `design.md` and the binding System context: server-only API access with `cache: "no-store"` and 3 s
timeouts (`app/_lib/tasks-api.ts:30-31, 60-61`), body forwarded unchanged, no retry, invalid bodies treated as
5xx, `502 {"detail": "upstream unavailable"}`, browser 4 s abort (`app/_components/task-board.tsx:52`),
`force-dynamic` page and route, markup/ids/aria per design. ✔

Minor observation (not a failure): `pickMsg` matches the last `loc` element with `endsWith`, so a field named e.g.
`subtitle` would also match `title`; the contract only ever names `title` or `due_date`.

## Mutation check (report only)

Skipped: no mutation check for shape web-nextjs yet.
