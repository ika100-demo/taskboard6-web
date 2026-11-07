import { createServer, type Server } from "node:http";

import { expect, test } from "@playwright/test";

const apiUrl = process.env.TASKBOARD6_API_URL;
test.skip(!apiUrl, "TASKBOARD6_API_URL not set");
test.describe.configure({ mode: "serial" });

type Stored = { id: string; title: string; due_date: string | null; created_at: string };
let tasks: Stored[] = [];
let posts: unknown[] = [];
let mode: "ok" | "down" | "422" = "ok";
let server: Server;

test.beforeAll(async () => {
  const port = Number(new URL(apiUrl as string).port);
  server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/tasks" && req.method === "GET") {
      return mode === "down" ? send(503, { detail: "down" }) : send(200, tasks);
    }
    if (req.url === "/tasks" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw);
        posts.push(body);
        if (mode === "down") return send(503, { detail: "down" });
        if (mode === "422") return send(422, { detail: [{ loc: ["body", "title"], msg: "Stub says no", type: "value_error" }] });
        const task = { id: String(tasks.length + 1), title: body.title, due_date: body.due_date, created_at: new Date().toISOString() };
        tasks.push(task);
        send(201, task);
      });
      return;
    }
    send(404, {});
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
});
test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});
test.beforeEach(() => {
  tasks = [];
  posts = [];
  mode = "ok";
});

test("AC-001.1 lists the API's tasks in order with due dates", async ({ page }) => {
  tasks = [
    { id: "1", title: "Zebra", due_date: "2026-05-01", created_at: "2026-01-01T00:00:00Z" },
    { id: "2", title: "Apple", due_date: null, created_at: "2026-01-02T00:00:00Z" },
  ];
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const items = page.getByRole("main").getByRole("list", { name: "Tasks" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Zebra");
  await expect(items.nth(0)).toContainText("2026-05-01");
  await expect(items.nth(1)).toContainText("Apple");
  await expect(items.nth(1)).toContainText("No due date");
});

test("AC-001.2 shows the empty state and the create form", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByText("No tasks yet")).toBeVisible();
  await expect(main.getByLabel("Title")).toBeVisible();
  await expect(main.getByLabel("Due date")).toBeVisible();
  await expect(main.getByRole("button", { name: "Add task" })).toBeVisible();
});

test("AC-001.3 adds a task without reload and the API has it", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => ((window as unknown as { __marker: boolean }).__marker = true));
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill("Buy milk");
  await main.getByLabel("Due date").fill("2026-12-31");
  await main.getByRole("button", { name: "Add task" }).click();
  const items = main.getByRole("list", { name: "Tasks" }).getByRole("listitem");
  await expect(items.last()).toContainText("Buy milk", { timeout: 5000 });
  await expect(items.last()).toContainText("2026-12-31");
  await expect(main.getByLabel("Title")).toHaveValue("");
  await expect(main.getByLabel("Due date")).toHaveValue("");
  expect(await page.evaluate(() => (window as unknown as { __marker?: boolean }).__marker)).toBe(true);
  expect(tasks.map((t) => t.title)).toContain("Buy milk");
});

test("AC-001.4 sends due_date null when the date is empty", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill("No date task");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByRole("listitem").last()).toContainText("No due date");
  expect(posts).toEqual([{ title: "No date task", due_date: null }]);
});

test("AC-001.5 validates the title in the browser without calling the API", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill("   ");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText("Please enter a title.")).toBeVisible();
  await main.getByLabel("Title").fill("x".repeat(201));
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText("The title must be at most 200 characters.")).toBeVisible();
  await expect(main.getByLabel("Title")).toHaveValue("x".repeat(201));
  expect(posts).toHaveLength(0);
});

test("AC-001.6 shows the API's 422 message next to the title", async ({ page }) => {
  mode = "422";
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill("Buy milk");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText("Stub says no")).toBeVisible();
  await expect(main.getByLabel("Title")).toHaveValue("Buy milk");
});

test("AC-001.7 loads with 200 and a message when the API answers 5xx", async ({ page }) => {
  mode = "down";
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("main").getByText("Tasks could not be loaded. Please try again later.")).toBeVisible();
});

test("AC-001.8 shows the save error when the API fails on submit", async ({ page }) => {
  await page.goto("/");
  mode = "down";
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill("Buy milk");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText("The task could not be saved. Please try again.")).toBeVisible();
  await expect(main.getByLabel("Title")).toHaveValue("Buy milk");
});
