export type Task = {
  id: string;
  title: string;
  due_date: string | null;
  created_at: string;
};

export function isTask(v: unknown): v is Task {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.created_at === "string" &&
    (typeof o.due_date === "string" || o.due_date === null)
  );
}

export const TITLE_MAX = 200;

export const MSG = {
  titleEmpty: "Please enter a title.",
  titleTooLong: "The title must be at most 200 characters.",
  loadFailed: "Tasks could not be loaded. Please try again later.",
  saveFailed: "The task could not be saved. Please try again.",
  noDueDate: "No due date",
  empty: "No tasks yet",
} as const;

export function validateTitle(raw: string): string | null {
  const t = raw.trim();
  if (t.length === 0) return MSG.titleEmpty;
  if (t.length > TITLE_MAX) return MSG.titleTooLong;
  return null;
}
