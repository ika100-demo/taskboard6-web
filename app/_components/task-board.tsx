"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { isTask, MSG, validateTitle } from "@/app/_lib/task";
import type { Task } from "@/app/_lib/task";

export type BoardInitial = { state: "loaded"; tasks: Task[] } | { state: "error" };

type Detail = { loc?: unknown; msg?: unknown };

function pickMsg(detail: unknown, suffix: string): string | null {
  if (!Array.isArray(detail)) return null;
  for (const d of detail as Detail[]) {
    if (typeof d !== "object" || d === null) continue;
    const { loc, msg } = d;
    if (!Array.isArray(loc) || typeof msg !== "string") continue;
    const last = loc[loc.length - 1];
    if (typeof last === "string" && last.endsWith(suffix)) return msg;
  }
  return null;
}

export function TaskBoard({ initial }: { initial: BoardInitial }) {
  const [tasks, setTasks] = useState<Task[]>(initial.state === "loaded" ? initial.tasks : []);
  const loadError = initial.state === "error";
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dueError, setDueError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setTitleError(null);
    setDueError(null);
    setSaveError(null);
    const err = validateTitle(title);
    if (err) {
      setTitleError(err);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), due_date: dueDate === "" ? null : dueDate }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 201) {
        const body: unknown = await res.json();
        if (isTask(body)) {
          setTasks((prev) => [...prev, body]);
          setTitle("");
          setDueDate("");
          return;
        }
      } else if (res.status === 422) {
        const body: unknown = await res.json();
        const detail = typeof body === "object" && body !== null ? (body as { detail?: unknown }).detail : null;
        const t = pickMsg(detail, "title");
        const d = pickMsg(detail, "due_date");
        if (t || d) {
          setTitleError(t);
          setDueError(d);
          return;
        }
      }
      setSaveError(MSG.saveFailed);
    } catch {
      setSaveError(MSG.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="task-board">
      <form aria-label="Add task" className="task-form" onSubmit={onSubmit} noValidate>
        <div className="task-field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            name="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={titleError ? "true" : undefined}
            aria-describedby={titleError ? "title-error" : undefined}
          />
          {titleError ? (
            <p id="title-error" role="alert" className="field-error">
              {titleError}
            </p>
          ) : null}
        </div>
        <div className="task-field">
          <label htmlFor="task-due-date">Due date</label>
          <input
            id="task-due-date"
            name="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-invalid={dueError ? "true" : undefined}
            aria-describedby={dueError ? "due-date-error" : undefined}
          />
          {dueError ? (
            <p id="due-date-error" role="alert" className="field-error">
              {dueError}
            </p>
          ) : null}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Add task
        </button>
        {saveError ? (
          <p id="save-error" role="alert" className="field-error">
            {saveError}
          </p>
        ) : null}
      </form>
      {loadError ? (
        <p role="alert">{MSG.loadFailed}</p>
      ) : tasks.length === 0 ? (
        <p>{MSG.empty}</p>
      ) : (
        <ul aria-label="Tasks" className="task-list">
          {tasks.map((t) => (
            <li key={t.id}>
              <span className="task-title">{t.title}</span>
              <span className="task-due">{t.due_date ?? MSG.noDueDate}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
