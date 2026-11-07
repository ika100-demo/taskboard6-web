import { TaskBoard } from "./_components/task-board";
import type { BoardInitial } from "./_components/task-board";
import { listTasks } from "./_lib/tasks-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  const initial: BoardInitial = result.ok ? { state: "loaded", tasks: result.tasks } : { state: "error" };
  return (
    <>
      <h1>Tasks</h1>
      <TaskBoard initial={initial} />
    </>
  );
}
