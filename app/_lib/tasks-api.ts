import { isTask, type Task } from "@/app/_lib/task";

export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateResult =
  | { status: 201; task: Task }
  | {
      status: 422;
      body: {
        detail: Array<{ loc: Array<string | number>; msg: string; type: string }>;
      };
    }
  | { status: 502 };

const TIMEOUT_MS = 3000;

function logFailure(op: "list" | "create", info: { status?: number; error?: string }): void {
  console.error(
    JSON.stringify({ level: "error", msg: "taskboard6-api call failed", op, ...info }),
  );
}

export async function listTasks(): Promise<ListResult> {
  const base = process.env.TASKBOARD6_API_URL;
  if (!base) {
    logFailure("list", { error: "TASKBOARD6_API_URL unset" });
    return { ok: false };
  }
  try {
    const res = await fetch(`${base}/tasks`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 200) {
      logFailure("list", { status: res.status });
      return { ok: false };
    }
    const data: unknown = await res.json();
    if (!Array.isArray(data) || !data.every(isTask)) {
      logFailure("list", { status: res.status, error: "invalid body" });
      return { ok: false };
    }
    return { ok: true, tasks: data };
  } catch (e) {
    logFailure("list", { error: e instanceof Error ? e.name : "unknown" });
    return { ok: false };
  }
}

export async function createTask(rawBody: string): Promise<CreateResult> {
  const base = process.env.TASKBOARD6_API_URL;
  if (!base) {
    logFailure("create", { error: "TASKBOARD6_API_URL unset" });
    return { status: 502 };
  }
  try {
    const res = await fetch(`${base}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 201) {
      const data: unknown = await res.json();
      if (isTask(data)) return { status: 201, task: data };
      logFailure("create", { status: 201, error: "invalid body" });
      return { status: 502 };
    }
    if (res.status === 422) {
      const data: unknown = await res.json();
      if (
        typeof data === "object" &&
        data !== null &&
        Array.isArray((data as { detail?: unknown }).detail)
      ) {
        return { status: 422, body: data as Extract<CreateResult, { status: 422 }>["body"] };
      }
      logFailure("create", { status: 422, error: "invalid body" });
      return { status: 502 };
    }
    logFailure("create", { status: res.status });
    return { status: 502 };
  } catch (e) {
    logFailure("create", { error: e instanceof Error ? e.name : "unknown" });
    return { status: 502 };
  }
}
