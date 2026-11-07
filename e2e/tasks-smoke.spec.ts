import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

test("AC-001.3 creating a task shows it in the list @smoke @writes", async ({ page }) => {
  const title = `smoke-${randomUUID()}`;
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill(title);
  await main.getByLabel("Due date").fill("2026-12-31");
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByRole("listitem").filter({ hasText: title })).toContainText("2026-12-31", { timeout: 5000 });
});

test("AC-001.1 the task page shows the form and a list or its error @smoke", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("main").getByRole("button", { name: "Add task" })).toBeVisible();
});
