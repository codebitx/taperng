import { NextResponse } from "next/server";
import { getDrawById } from "@/lib/db";
import { serializeDraw } from "@/lib/serialize";
import { syncDraw } from "@/lib/server/sync";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const row = getDrawById(id);
  if (!row) {
    return NextResponse.json({ error: "Draw not found" }, { status: 404 });
  }
  const synced = await syncDraw(row);
  return NextResponse.json({
    draw: serializeDraw(synced.row),
    expired: synced.expired,
  });
}
