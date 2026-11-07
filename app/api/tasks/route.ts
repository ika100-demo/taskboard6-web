import { NextResponse } from "next/server";

import { createTask } from "@/app/_lib/tasks-api";

export const dynamic = "force-dynamic";

/** Forwards the raw body to the API; the API validates. */
export async function POST(req: Request) {
  const result = await createTask(await req.text());
  if (result.status === 201) {
    return NextResponse.json(result.task, { status: 201 });
  }
  if (result.status === 422) {
    return NextResponse.json(result.body, { status: 422 });
  }
  return NextResponse.json({ detail: "upstream unavailable" }, { status: 502 });
}
