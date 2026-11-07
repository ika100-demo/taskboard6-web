import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/tasks/route";

const created = { id: "9", title: "Buy milk", due_date: "2026-12-31", created_at: "2026-01-01T00:00:00Z" };
const req = (body: string) =>
  new Request("http://localhost/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body });

describe("POST /api/tasks", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    process.env.TASKBOARD6_API_URL = "http://api.test";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("AC-001.3 forwards the body unchanged to the API and returns 201 with the task", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }));
    const body = JSON.stringify({ title: "Buy milk", due_date: "2026-12-31" });
    const res = await POST(req(body));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://api.test/tasks");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
  });

  it("AC-001.6 passes a 422 from the API through unchanged", async () => {
    const detail = { detail: [{ loc: ["body", "title"], msg: "too short", type: "string_too_short" }] };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(detail), { status: 422 }));
    const res = await POST(req(JSON.stringify({ title: "", due_date: null })));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual(detail);
  });

  it("AC-001.8 answers 502 when the API answers 5xx", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const res = await POST(req(JSON.stringify({ title: "a", due_date: null })));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "upstream unavailable" });
  });

  it("AC-001.8 answers 502 when the API is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await POST(req(JSON.stringify({ title: "a", due_date: null })));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "upstream unavailable" });
  });

  it("AC-001.8 answers 502 for a status the contract does not list", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    const res = await POST(req(JSON.stringify({ title: "a", due_date: null })));
    expect(res.status).toBe(502);
  });

  it("AC-001.8 answers 502 when the API is slower than 3 seconds", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      const pending = POST(req(JSON.stringify({ title: "a", due_date: null })));
      await vi.advanceTimersByTimeAsync(3100);
      expect((await pending).status).toBe(502);
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-001.8 answers 502 when TASKBOARD6_API_URL is unset", async () => {
    delete process.env.TASKBOARD6_API_URL;
    const res = await POST(req(JSON.stringify({ title: "a", due_date: null })));
    expect(res.status).toBe(502);
  });
});
