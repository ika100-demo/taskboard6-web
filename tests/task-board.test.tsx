import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskBoard } from "@/app/_components/task-board";

const task = (id: string, title: string, due: string | null) => ({ id, title, due_date: due, created_at: "2026-01-01T00:00:00Z" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(tasks = [task("1", "Existing", null)]) {
  render(<TaskBoard initial={{ state: "loaded", tasks }} />);
  const form = screen.getByRole("form", { name: "Add task" });
  return {
    form,
    title: within(form).getByLabelText("Title") as HTMLInputElement,
    due: within(form).getByLabelText("Due date") as HTMLInputElement,
    submit: () => fireEvent.click(within(form).getByRole("button", { name: "Add task" })),
  };
}
const fill = (el: HTMLInputElement, value: string) => fireEvent.change(el, { target: { value } });

describe("TaskBoard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC-001.3 appends the created task as the last item and clears the fields", async () => {
    fetchMock.mockResolvedValue(json(task("2", "Buy milk", "2026-12-31"), 201));
    const f = setup();
    fill(f.title, "Buy milk");
    fill(f.due, "2026-12-31");
    f.submit();
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(2));
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("Buy milk");
    expect(items[1]).toHaveTextContent("2026-12-31");
    expect(f.title.value).toBe("");
    expect(f.due.value).toBe("");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tasks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ title: "Buy milk", due_date: "2026-12-31" });
  });

  it("AC-001.3 replaces the empty state with the list after the first task", async () => {
    fetchMock.mockResolvedValue(json(task("2", "Buy milk", null), 201));
    const f = setup([]);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    fill(f.title, "Buy milk");
    f.submit();
    await waitFor(() => expect(screen.getByRole("list", { name: "Tasks" })).toBeInTheDocument());
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("AC-001.4 sends due_date null when the date is empty and shows No due date", async () => {
    fetchMock.mockResolvedValue(json(task("2", "Buy milk", null), 201));
    const f = setup();
    fill(f.title, "  Buy milk  ");
    f.submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Buy milk", due_date: null });
    await waitFor(() => {
      const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
      expect(items[items.length - 1]).toHaveTextContent("No due date");
    });
  });

  it("AC-001.5 rejects an empty title without a request", () => {
    const f = setup();
    fill(f.due, "2026-01-01");
    f.submit();
    expect(screen.getByText("Please enter a title.")).toBeInTheDocument();
    expect(f.title).toHaveAttribute("aria-invalid", "true");
    expect(f.due.value).toBe("2026-01-01");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.5 rejects a whitespace-only title without a request", () => {
    const f = setup();
    fill(f.title, "   ");
    f.submit();
    expect(screen.getByText("Please enter a title.")).toBeInTheDocument();
    expect(f.title.value).toBe("   ");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.5 rejects a title over 200 characters but accepts exactly 200", async () => {
    const f = setup();
    fill(f.title, "x".repeat(201));
    f.submit();
    expect(screen.getByText("The title must be at most 200 characters.")).toBeInTheDocument();
    expect(f.title.value).toBe("x".repeat(201));
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(json(task("2", "x".repeat(200), null), 201));
    fill(f.title, "x".repeat(200));
    f.submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("The title must be at most 200 characters.")).not.toBeInTheDocument();
  });

  it("AC-001.6 shows the API's 422 message next to the title and keeps the values", async () => {
    fetchMock.mockResolvedValue(
      json({ detail: [{ loc: ["body", "title"], msg: "String should have at least 1 character", type: "string_too_short" }] }, 422),
    );
    const f = setup();
    fill(f.title, "Buy milk");
    fill(f.due, "2026-12-31");
    f.submit();
    expect(await screen.findByText("String should have at least 1 character")).toBeInTheDocument();
    expect(f.title).toHaveAttribute("aria-invalid", "true");
    expect(f.title.value).toBe("Buy milk");
    expect(f.due.value).toBe("2026-12-31");
  });

  it("AC-001.8 shows the save error and keeps values on a 502", async () => {
    fetchMock.mockResolvedValue(json({ detail: "upstream unavailable" }, 502));
    const f = setup();
    fill(f.title, "Buy milk");
    fill(f.due, "2026-12-31");
    f.submit();
    expect(await screen.findByText("The task could not be saved. Please try again.")).toBeInTheDocument();
    expect(f.title.value).toBe("Buy milk");
    expect(f.due.value).toBe("2026-12-31");
    expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("AC-001.8 shows the save error on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const f = setup();
    fill(f.title, "Buy milk");
    f.submit();
    expect(await screen.findByText("The task could not be saved. Please try again.")).toBeInTheDocument();
    expect(f.title.value).toBe("Buy milk");
  });

  it("AC-001.8 shows the save error on a status the contract does not list", async () => {
    fetchMock.mockResolvedValue(json({}, 418));
    const f = setup();
    fill(f.title, "Buy milk");
    f.submit();
    expect(await screen.findByText("The task could not be saved. Please try again.")).toBeInTheDocument();
  });

  it("AC-001.8 gives the request a timeout signal", async () => {
    fetchMock.mockResolvedValue(json(task("2", "Buy milk", null), 201));
    const f = setup();
    fill(f.title, "Buy milk");
    f.submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("AC-001.7 renders the load error instead of the list when initial state is error", () => {
    render(<TaskBoard initial={{ state: "error" }} />);
    expect(screen.getByText("Tasks could not be loaded. Please try again later.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add task" })).toBeInTheDocument();
  });
});
