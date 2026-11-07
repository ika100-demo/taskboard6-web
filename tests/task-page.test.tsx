import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

const task = (id: string, title: string, due: string | null) => ({ id, title, due_date: due, created_at: "2026-01-01T00:00:00Z" });

function stubApi(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("HomePage task list", () => {
  beforeEach(() => {
    process.env.TASKBOARD6_API_URL = "http://api.test";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("AC-001.1 shows one list item per task in order with title and due date", async () => {
    stubApi(async () => json([task("1", "Second alphabetically", "2026-12-31"), task("2", "Alpha", null)]));
    render(await HomePage());
    const list = screen.getByRole("list", { name: "Tasks" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Second alphabetically");
    expect(items[0]).toHaveTextContent("2026-12-31");
    expect(items[1]).toHaveTextContent("Alpha");
    expect(items[1]).toHaveTextContent("No due date");
    expect(items[0]).not.toHaveTextContent("No due date");
  });

  it("AC-001.2 shows the empty state and the create form", async () => {
    stubApi(async () => json([]));
    render(await HomePage());
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Add task" });
    expect(within(form).getByLabelText("Title")).toBeInTheDocument();
    expect(within(form).getByLabelText("Due date")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });

  it("AC-001.7 shows the load error when the API answers 5xx", async () => {
    stubApi(async () => json({ detail: "boom" }, 503));
    render(await HomePage());
    expect(screen.getByText("Tasks could not be loaded. Please try again later.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add task" })).toBeInTheDocument();
  });

  it("AC-001.7 shows the load error when the API is unreachable", async () => {
    stubApi(async () => {
      throw new TypeError("fetch failed");
    });
    render(await HomePage());
    expect(screen.getByText("Tasks could not be loaded. Please try again later.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
  });

  it("AC-001.7 shows the load error when the API is slower than 3 seconds", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = stubApi(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      const pending = HomePage();
      await vi.advanceTimersByTimeAsync(3100);
      render(await pending);
      expect(fetchMock).toHaveBeenCalled();
      expect(screen.getByText("Tasks could not be loaded. Please try again later.")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-001.7 shows the load error when the API returns malformed tasks", async () => {
    stubApi(async () => json([{ id: 1 }]));
    render(await HomePage());
    expect(screen.getByText("Tasks could not be loaded. Please try again later.")).toBeInTheDocument();
  });
});
